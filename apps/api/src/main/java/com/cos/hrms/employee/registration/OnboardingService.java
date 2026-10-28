package com.cos.hrms.employee.registration;

import static com.cos.hrms.employee.registration.OnboardingContracts.*;

import com.cos.hrms.config.COSProperties;
import com.cos.hrms.metadata.*;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.shared.*;
import java.time.LocalDate;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OnboardingService {
  private final OnboardingRepository repository;
  private final COSMetadataRepository configs;
  private final COSMetadataService metadata;
  private final OnboardingValidation validation;
  private final COSCrypto crypto;
  private final COSJson json;
  private final COSAuditService audit;
  private final COSProperties properties;
  private final Environment environment;
  private final WorkEmailAssignmentService workEmail;

  public OnboardingService(
      OnboardingRepository repository,
      COSMetadataRepository configs,
      COSMetadataService metadata,
      OnboardingValidation validation,
      COSCrypto crypto,
      COSJson json,
      COSAuditService audit,
      COSProperties properties,
      Environment environment,
      WorkEmailAssignmentService workEmail) {
    this.repository = repository;
    this.configs = configs;
    this.metadata = metadata;
    this.validation = validation;
    this.crypto = crypto;
    this.json = json;
    this.audit = audit;
    this.properties = properties;
    this.environment = environment;
    this.workEmail = workEmail;
  }

  public boolean hr(COSActor actor) {
    return actor.roles().contains("REGISTRAR");
  }

  public boolean local() {
    return environment.acceptsProfiles(Profiles.of("local", "test"));
  }

  public UUID own(COSActor actor) {
    actor.require("EMPLOYEE");
    return repository
        .membership(actor.scope(), actor.id())
        .orElseThrow(
            () ->
                new COSError(
                    403,
                    "EMPLOYEE_NOT_LINKED",
                    "HR must link your account to an employee record."));
  }

  public void canReadEmployee(COSActor actor, UUID id) {
    if (!hr(actor) && !own(actor).equals(id)) throw COSError.forbidden();
  }

  public void canReadDraft(COSActor actor, OnboardingRepository.Draft draft) {
    if (draft.actor().equals(actor.id()) && (hr(actor) || actor.roles().contains("EMPLOYEE")))
      return;
    if (hr(actor) && !draft.status().equals("DRAFT")) return;
    if (draft.employee() != null && Set.of("REGISTERED", "APPROVED").contains(draft.status())) {
      canReadEmployee(actor, draft.employee());
      return;
    }
    throw COSError.forbidden();
  }

  public void canWriteDraft(COSActor actor, OnboardingRepository.Draft draft) {
    if (!draft.actor().equals(actor.id()) || !draft.status().equals("DRAFT"))
      throw COSError.forbidden();
    if (!hr(actor) && !own(actor).equals(draft.employee())) throw COSError.forbidden();
  }

  @Transactional(readOnly = true)
  public Schema schema(COSActor actor) {
    if (!hr(actor) && !actor.admin()) actor.require("EMPLOYEE");
    var config = configs.active(actor.scope());
    return new Schema(
        config.metadata().version(), config.metadata().fields(), actor.scope(), local());
  }

  @Transactional
  public DraftView savePayload(COSActor actor, UUID id, SaveDraftPayload input) {
    return save(
        actor,
        id,
        new SaveDraft(
            input.expected_version(),
            input.configuration_version(),
            validation.parse(input.profile())));
  }

  @Transactional
  public DraftView save(COSActor actor, UUID id, SaveDraft command) {
    if (!hr(actor)) actor.require("EMPLOYEE");
    configs.lock(actor.scope());
    var config = metadata.current(actor.scope(), command.configuration_version());
    var found = repository.findDraft(actor.scope(), id);
    UUID employee = null;
    Integer expected = null;
    Profile data = command.profile();
    if (found.isPresent()) {
      var d = found.get();
      canWriteDraft(actor, d);
      if (d.version() != command.expected_version())
        throw COSError.conflict(
            "DRAFT_VERSION_CONFLICT", "This draft changed. Reload before saving.");
      employee = d.employee();
      expected = d.expected();
    } else if (command.expected_version() != 0)
      throw COSError.conflict(
          "DRAFT_VERSION_CONFLICT", "This draft does not exist. Start a new draft.");
    else if (repository.drafts(actor.scope(), actor.id(), false).size() >= 100)
      throw new COSError(409, "DRAFT_LIMIT", "Complete existing drafts before creating more.");
    if (!hr(actor)) {
      employee = own(actor);
      var old = repository.employee(actor.scope(), employee);
      if (expected == null) expected = old.version();
      if (expected != old.version())
        throw COSError.conflict(
            "PROFILE_VERSION_CONFLICT", "Your profile changed. Start a fresh update request.");
      var original = profile(old);
      data = preserveMasked(data, original, config);
      for (var field : config.metadata().fields()) {
        if (!OnboardingValidation.isCore(field.id())
            && (!field.visible() || !actor.permitted(field.write_roles()))
            && data.values().containsKey(field.id())
            && !Objects.equals(data.values().get(field.id()), original.values().get(field.id())))
          throw COSError.forbidden();
      }

      for (String key : OnboardingValidation.EMPLOYMENT)
        if (!Objects.equals(
            data.values().getOrDefault(key, ""), original.values().getOrDefault(key, "")))
          throw COSError.forbidden();
      if (!Objects.equals(
          data.groups().getOrDefault("allowances", List.of()),
          original.groups().getOrDefault("allowances", List.of()))) throw COSError.forbidden();
    }
    if (hr(actor)) {
      if (employee != null) {
        var old = repository.employee(actor.scope(), employee);
        if (!Objects.equals(expected, old.version()))
          throw COSError.conflict(
              "PROFILE_VERSION_CONFLICT", "This employee changed. Start a new edit.");
        data = preserveMasked(data, draftProfile(found.orElseThrow()), config);
      }
      Profile prior =
          found.isPresent() ? draftProfile(found.get()) : new Profile(Map.of(), Map.of(), false);
      for (var field : config.metadata().fields())
        if (!field.visible()
            && !OnboardingValidation.isCore(field.id())
            && data.values().containsKey(field.id())
            && !Objects.equals(data.values().get(field.id()), prior.values().get(field.id())))
          throw COSError.forbidden();
    }
    data = validation.clean(data, false, config);
    String encrypted = crypto.encrypt(json.write(data), draftContext(actor.scope(), id));
    if (found.isPresent())
      repository.saveDraft(found.get(), encrypted, config.metadata().version());
    else
      repository.insertDraft(
          id,
          actor.scope(),
          actor.id(),
          encrypted,
          config.metadata().version(),
          employee,
          expected);
    audit.record(actor.scope(), actor.id(), null, "SAVE_EMPLOYEE_DRAFT", id.toString(), "DRAFT");
    return draftView(repository.draft(actor.scope(), id), actor);
  }

  private Profile preserveMasked(
      Profile input, Profile original, COSMetadataRepository.Config config) {
    var values = new LinkedHashMap<>(original.values());
    values.putAll(input.values());
    var protectedKeys = new HashSet<>(OnboardingValidation.SENSITIVE);
    config.metadata().fields().stream()
        .filter(f -> f.sensitive())
        .forEach(f -> protectedKeys.add(f.id()));
    for (String key : protectedKeys) {
      String submitted = values.get(key), old = original.values().getOrDefault(key, "");
      if (submitted != null && submitted.startsWith("•")) {
        if (!submitted.equals(crypto.mask(old)))
          throw new COSError(
              422, "MASKED_VALUE_INVALID", "Masked identifiers cannot be used as new values.");
        values.put(key, old);
      }
    }
    return new Profile(values, input.groups(), input.same_address());
  }

  @Transactional
  public DraftView getDraft(COSActor actor, UUID id) {
    var d = repository.draft(actor.scope(), id);
    canReadDraft(actor, d);
    return draftView(d, actor);
  }

  @Transactional(readOnly = true)
  public List<DraftSummary> drafts(COSActor actor, boolean reviews) {
    if (reviews) actor.require("REGISTRAR");
    else if (!hr(actor)) actor.require("EMPLOYEE");
    return repository.drafts(actor.scope(), actor.id(), reviews);
  }

  @Transactional(readOnly = true)
  public List<DraftSummary> ownRequests(COSActor actor) {
    own(actor);
    return repository.ownRequests(actor.scope(), actor.id());
  }

  @Transactional
  public WorkEmailPreview previewWorkEmail(
      COSActor actor, UUID id, String name, String modeOverride, String existingOverride) {
    actor.require("REGISTRAR");
    var d = repository.draft(actor.scope(), id);
    if (!d.actor().equals(actor.id())) throw COSError.forbidden();
    if (d.employee() != null)
      throw new COSError(
          422, "WORK_EMAIL_NOT_APPLICABLE", "Work email is assigned during new registration.");
    if (!d.status().equals("DRAFT")) throw COSError.conflict("DRAFT_LOCKED", "Draft is not editable.");
    var config = metadata.current(actor.scope(), d.config());
    var profile = draftProfile(d);
    var merged = new LinkedHashMap<>(profile.values());
    if (name != null && !name.isBlank()) merged.put("name", name.strip());
    if (modeOverride != null && !modeOverride.isBlank())
      merged.put("work_email_mode", modeOverride.strip().toLowerCase(Locale.ROOT));
    if (existingOverride != null) merged.put("work_email_existing", existingOverride.strip());
    var data = validation.clean(new Profile(merged, profile.groups(), profile.same_address()), false, config);
    String mode = data.values().getOrDefault("work_email_mode", "generate");
    String existing = data.values().getOrDefault("work_email_existing", "");
    String code = properties.getIdPrefix() + "00000000";
    var assignment =
        workEmail.preview(
            actor.scope(), data.values().getOrDefault("name", ""), code, mode, existing);
    return new WorkEmailPreview(
        assignment.email(),
        assignment.status(),
        assignment.source(),
        assignment.collisionEmployeeCode(),
        assignment.note());
  }

  @Transactional
  public EmployeeView register(COSActor actor, UUID id, int version) {
    actor.require("REGISTRAR");
    configs.lock(actor.scope());
    var d = repository.draft(actor.scope(), id);
    if (!d.actor().equals(actor.id())) throw COSError.forbidden();
    if (d.status().equals("REGISTERED"))
      return employeeView(repository.employee(actor.scope(), d.employee()), actor);
    canWriteDraft(actor, d);
    if (d.version() != version)
      throw COSError.conflict(
          "DRAFT_VERSION_CONFLICT", "Reload the latest draft before registration.");
    if (d.employee() != null) throw COSError.forbidden();
    var config = metadata.current(actor.scope(), d.config());
    var cleaned = validation.clean(draftProfile(d), true, config);
    String workMode = cleaned.values().getOrDefault("work_email_mode", "generate");
    String workExisting = cleaned.values().getOrDefault("work_email_existing", "");
    var data = withoutWorkEmailControls(cleaned);
    boolean rejoin = data.values().get("joiner").equals("Rejoiner");
    OnboardingRepository.Employee old = null;
    UUID employee = UUID.randomUUID();
    String code = null;
    if (rejoin) {
      old =
          repository
              .byCode(actor.scope(), data.values().get("previous_id"))
              .orElseThrow(
                  () ->
                      new COSError(
                          422,
                          "PREVIOUS_EMPLOYEE_NOT_FOUND",
                          "Select a verified existing employee code for rejoining."));
      employee = old.id();
      code = old.code();
      var prior = profile(old);
      for (String key : List.of("aadhaar", "pan"))
        if (!prior.values().getOrDefault(key, "").isBlank()
            && !data.values().getOrDefault(key, "").isBlank()
            && !prior.values().get(key).equals(data.values().get(key)))
          throw COSError.conflict(
              "REJOIN_IDENTITY_CONFLICT",
              "The prior employee identifiers do not match. Verify the record before rejoining.");
    }
    if (old != null) {
      var merged = new LinkedHashMap<>(data.values());
      var previous = profile(old);
      for (String key : List.of("aadhaar", "pan"))
        if (merged.getOrDefault(key, "").isBlank()
            && !previous.values().getOrDefault(key, "").isBlank())
          merged.put(key, previous.values().get(key));
      data = new Profile(Map.copyOf(merged), data.groups(), data.same_address());
    }
    requireDocuments(actor.scope(), d, data, old == null ? null : profile(old));
    String body = crypto.encrypt(json.write(data), profileContext(actor.scope(), employee));
    String aadhaar = identifierHash(actor.scope(), "aadhaar", data),
        pan = identifierHash(actor.scope(), "pan", data);
    if (old == null) {
      code =
          properties.getIdPrefix()
              + String.format(Locale.ROOT, "%08d", configs.allocate(actor.scope()));
    }
    var assignment =
        workEmail.assign(
            actor.scope(),
            data.values().get("name"),
            code,
            workMode,
            workExisting,
            old);
    if (old == null) {
      repository.insertEmployee(
          employee,
          actor.scope(),
          code,
          data.values().get("name"),
          body,
          aadhaar,
          pan,
          assignment.email(),
          assignment.status());
    } else {
      repository.updateEmployee(old, data.values().get("name"), body, aadhaar, pan);
    }
    var saved = repository.employee(actor.scope(), employee);
    if (old != null
        && (old.workEmail() == null || old.workEmail().isBlank())
        && !assignment.status().equals("REUSED")) {
      repository.updateWorkEmail(saved, assignment.email(), assignment.status());
      saved = repository.employee(actor.scope(), employee);
    }
    if (!assignment.status().equals("REUSED")) repository.enqueueWorkEmailProvision(saved);
    repository.join(saved, LocalDate.parse(data.values().get("joining")), rejoin);
    repository.history(saved, actor.id(), rejoin ? "HR_REJOIN" : "HR_REGISTER");
    repository.transition(d, "REGISTERED", employee, null, null);
    audit.record(
        actor.scope(), actor.id(), null, "REGISTER_EMPLOYEE", employee.toString(), "COMPLETED");
    return employeeView(saved, actor);
  }

  @Transactional
  public DraftView startHREdit(COSActor actor, UUID employee, UUID draft, int version) {
    actor.require("REGISTRAR");
    configs.lock(actor.scope());
    var old = repository.employee(actor.scope(), employee);
    var existing = repository.findDraft(actor.scope(), draft);
    if (existing.isPresent()) {
      var d = existing.get();
      canWriteDraft(actor, d);
      if (!employee.equals(d.employee())) throw COSError.forbidden();
      return draftView(d, actor);
    }
    if (old.version() != version)
      throw COSError.conflict(
          "PROFILE_VERSION_CONFLICT", "This employee changed. Refresh before editing.");
    if (repository.drafts(actor.scope(), actor.id(), false).size() >= 100)
      throw COSError.conflict("DRAFT_LIMIT", "Complete existing drafts before creating more.");
    var config = configs.active(actor.scope());
    repository.insertDraft(
        draft,
        actor.scope(),
        actor.id(),
        crypto.encrypt(json.write(profile(old)), draftContext(actor.scope(), draft)),
        config.metadata().version(),
        employee,
        old.version());
    audit.record(
        actor.scope(), actor.id(), null, "START_HR_EMPLOYEE_EDIT", employee.toString(), "DRAFT");
    return draftView(repository.draft(actor.scope(), draft), actor);
  }

  @Transactional
  public EmployeeView applyHREdit(COSActor actor, UUID id, int version) {
    actor.require("REGISTRAR");
    configs.lock(actor.scope());
    var d = repository.draft(actor.scope(), id);
    if (!d.actor().equals(actor.id()) || d.employee() == null) throw COSError.forbidden();
    if (d.status().equals("APPROVED"))
      return employeeView(repository.employee(actor.scope(), d.employee()), actor);
    canWriteDraft(actor, d);
    if (d.version() != version)
      throw COSError.conflict("DRAFT_VERSION_CONFLICT", "Reload the latest edit draft.");
    var old = repository.employee(actor.scope(), d.employee());
    if (!Objects.equals(d.expected(), old.version()))
      throw COSError.conflict(
          "PROFILE_VERSION_CONFLICT",
          "This employee changed after you started editing. Start a fresh edit to avoid overwriting"
              + " newer information.");
    var config = metadata.current(actor.scope(), d.config());
    var data = validation.clean(draftProfile(d), true, config);
    var prior = profile(old);
    for (String key : List.of("joiner", "joining", "previous_id"))
      if (!Objects.equals(data.values().get(key), prior.values().get(key)))
        throw new COSError(
            422,
            "EMPLOYMENT_PERIOD_READ_ONLY",
            "Joining history is read-only here. Use rejoin registration for a new employment"
                + " period.");
    requireDocuments(actor.scope(), d, data, prior);
    repository.updateEmployee(
        old,
        data.values().get("name"),
        crypto.encrypt(json.write(data), profileContext(actor.scope(), old.id())),
        identifierHash(actor.scope(), "aadhaar", data),
        identifierHash(actor.scope(), "pan", data));
    var saved = repository.employee(actor.scope(), old.id());
    repository.history(saved, actor.id(), "HR_UPDATE");
    repository.transition(d, "APPROVED", null, actor.id(), "Direct HR profile update");
    audit.record(
        actor.scope(), actor.id(), null, "HR_UPDATE_EMPLOYEE", old.id().toString(), "COMPLETED");
    return employeeView(saved, actor);
  }

  @Transactional
  public DraftView submitUpdate(COSActor actor, UUID id, int version) {
    actor.require("EMPLOYEE");
    configs.lock(actor.scope());
    var d = repository.draft(actor.scope(), id);
    if (!d.actor().equals(actor.id()) || !own(actor).equals(d.employee()))
      throw COSError.forbidden();
    if (d.status().equals("SUBMITTED")) return draftView(d, actor);
    canWriteDraft(actor, d);
    if (d.version() != version)
      throw COSError.conflict("DRAFT_VERSION_CONFLICT", "Reload the latest draft.");
    var config = metadata.current(actor.scope(), d.config());
    var data = validation.clean(draftProfile(d), true, config);
    var old = repository.employee(actor.scope(), d.employee());
    if (old.version() != d.expected())
      throw COSError.conflict(
          "PROFILE_VERSION_CONFLICT", "Your profile changed. Start a new update request.");
    requireDocuments(actor.scope(), d, data, profile(old));
    repository.transition(d, "SUBMITTED", null, null, null);
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        "REQUEST_PROFILE_UPDATE",
        id.toString(),
        "PENDING_HR_REVIEW");
    return draftView(repository.draft(actor.scope(), id), actor);
  }

  @Transactional
  public DraftView review(COSActor actor, UUID id, Decision decision) {
    actor.require("REGISTRAR");
    configs.lock(actor.scope());
    var d = repository.draft(actor.scope(), id);
    if (d.actor().equals(actor.id())) throw COSError.forbidden();
    if (!d.status().equals("SUBMITTED") || d.version() != decision.version())
      throw COSError.conflict(
          "REVIEW_VERSION_CONFLICT", "This request already changed. Refresh the review queue.");
    if (!List.of("APPROVE", "REJECT").contains(decision.decision()))
      throw new COSError(422, "DECISION_INVALID", "Choose APPROVE or REJECT.");
    String note = decision.remarks() == null ? "" : decision.remarks().strip();
    if (decision.decision().equals("REJECT") && note.isBlank())
      throw new COSError(422, "REMARKS_REQUIRED", "Provide a reason for rejection.");
    if (decision.decision().equals("APPROVE")) {
      if (!repository
          .membership(actor.scope(), d.actor())
          .orElseThrow(COSError::forbidden)
          .equals(d.employee())) throw COSError.forbidden();
      var config = metadata.current(actor.scope(), d.config());
      var old = repository.employee(actor.scope(), d.employee());
      if (old.version() != d.expected())
        throw COSError.conflict(
            "PROFILE_VERSION_CONFLICT",
            "The employee changed. Reject this request and ask for a fresh proposal.");
      var data = validation.clean(draftProfile(d), true, config);
      requireDocuments(actor.scope(), d, data, profile(old));
      repository.updateEmployee(
          old,
          data.values().get("name"),
          crypto.encrypt(json.write(data), profileContext(actor.scope(), old.id())),
          identifierHash(actor.scope(), "aadhaar", data),
          identifierHash(actor.scope(), "pan", data));
      repository.history(
          repository.employee(actor.scope(), old.id()), actor.id(), "HR_APPROVE_UPDATE");
    }
    repository.transition(
        d, decision.decision().equals("APPROVE") ? "APPROVED" : "REJECTED", null, actor.id(), note);
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        "REVIEW_PROFILE_UPDATE",
        id.toString(),
        decision.decision());
    return draftView(repository.draft(actor.scope(), id), actor);
  }

  private void requireDocuments(
      String scope, OnboardingRepository.Draft d, Profile data, Profile original) {
    var kinds = new HashSet<String>();
    repository.documents(scope, d.id()).forEach(doc -> kinds.add(doc.kind()));
    for (var pair : Map.of("aadhaar", "AADHAAR_FRONT", "pan", "PAN").entrySet()) {
      String value = data.values().getOrDefault(pair.getKey(), "");
      boolean unchanged =
          original != null && value.equals(original.values().getOrDefault(pair.getKey(), ""));
      if (!value.isBlank() && !unchanged && !kinds.contains(pair.getValue()))
        throw new COSError(
            422,
            "DOCUMENT_REQUIRED",
            "Upload the corresponding Aadhaar front or PAN photo before submitting.",
            Map.of(pair.getKey(), "A supporting document photo is required."));
    }
  }

  @Transactional(readOnly = true)
  public com.cos.hrms.web.COSContracts.Page<EmployeeSummary> employees(
      COSActor actor, String search, UUID after, int limit) {
    actor.require("REGISTRAR");
    if (search.length() > 120)
      throw new COSError(400, "SEARCH_TOO_LONG", "Use at most 120 characters.");
    int size = Math.clamp(limit, 1, 100);
    var rows = repository.employees(actor.scope(), search.strip(), after, size + 1);
    return new com.cos.hrms.web.COSContracts.Page<>(
        rows.stream().limit(size).toList(),
        rows.size() > size ? rows.get(size - 1).employee_id() : null);
  }

  @Transactional
  public EmployeeView employee(COSActor actor, UUID id) {
    canReadEmployee(actor, id);
    var e = repository.employee(actor.scope(), id);
    audit.record(
        actor.scope(), actor.id(), null, "READ_EMPLOYEE_PROFILE", id.toString(), "PERMITTED");
    return employeeView(e, actor);
  }

  @Transactional
  public EmployeeView me(COSActor actor) {
    return employee(actor, own(actor));
  }

  public Profile draftProfile(OnboardingRepository.Draft d) {
    return json.read(crypto.decrypt(d.encrypted(), draftContext(d.scope(), d.id())), Profile.class);
  }

  private Profile profile(OnboardingRepository.Employee e) {
    return json.read(
        crypto.decrypt(e.encrypted(), profileContext(e.scope(), e.id())), Profile.class);
  }

  private Profile redact(Profile p, COSActor actor) {
    var values = new LinkedHashMap<>(p.values());
    var sensitive = new HashSet<>(OnboardingValidation.SENSITIVE);
    for (var f : configs.active(actor.scope()).metadata().fields()) {
      if (f.sensitive()) sensitive.add(f.id());
      if (!f.visible()
          || (!actor.permitted(f.read_roles())
              && !(actor.roles().contains("EMPLOYEE")
                  && f.read_roles() != null
                  && f.read_roles().contains("VIEWER")))) values.remove(f.id());
    }
    for (String key : sensitive)
      if (values.containsKey(key)) values.put(key, crypto.mask(values.get(key)));
    return new Profile(Map.copyOf(values), p.groups(), p.same_address());
  }

  private DraftView draftView(OnboardingRepository.Draft d, COSActor actor) {
    var p = draftProfile(d);
    if (!hr(actor) || !d.status().equals("DRAFT")) p = redact(p, actor);
    return new DraftView(
        d.id().toString(),
        d.version(),
        d.config(),
        d.status(),
        d.employee() == null ? null : d.employee().toString(),
        d.expected(),
        p,
        repository.documents(d.scope(), d.id()).stream().map(this::documentView).toList(),
        d.note(),
        d.actor(),
        d.updated());
  }

  private EmployeeView employeeView(OnboardingRepository.Employee e, COSActor actor) {
    return new EmployeeView(
        e.id().toString(),
        e.code(),
        e.name(),
        e.version(),
        e.workEmail(),
        e.workEmailStatus(),
        redact(profile(e), actor),
        repository.employeeDocuments(e.scope(), e.id()).stream().map(this::documentView).toList(),
        e.created());
  }

  private Profile withoutWorkEmailControls(Profile input) {
    var values = new LinkedHashMap<>(input.values());
    values.remove("work_email_mode");
    values.remove("work_email_existing");
    return new Profile(Map.copyOf(values), input.groups(), input.same_address());
  }

  public DocumentView documentView(OnboardingRepository.Document d) {
    return new DocumentView(
        d.id().toString(), d.kind(), d.media(), d.bytes(), d.scan(), d.created());
  }

  private String identifierHash(String scope, String kind, Profile data) {
    String value = data.values().getOrDefault(kind, "");
    return value.isBlank() ? null : crypto.fingerprint(scope, kind, value);
  }

  public static String draftContext(String scope, UUID id) {
    return scope + "/onboarding/draft/" + id;
  }

  public static String profileContext(String scope, UUID id) {
    return scope + "/onboarding/profile/" + id;
  }
}
