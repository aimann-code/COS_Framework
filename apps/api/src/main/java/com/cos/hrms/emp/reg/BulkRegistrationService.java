package com.cos.hrms.emp.reg;

import static com.cos.hrms.emp.OnboardingContracts.*;

import com.cos.hrms.emp.OnboardingRepository;
import com.cos.shared.COSAuditService;
import com.cos.shared.COSCrypto;
import com.cos.shared.COSError;
import com.cos.shared.COSJson;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.security.COSActor;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** HR batch registration through the existing single-employee onboarding path. */
@Service
public class BulkRegistrationService {
  static final int MAX_ROWS = 50;

  private final OnboardingService onboarding;
  private final OnboardingRepository repository;
  private final OnboardingValidation validation;
  private final COSMetadataRepository configs;
  private final COSCrypto crypto;
  private final COSJson json;
  private final COSAuditService audit;

  public BulkRegistrationService(
      OnboardingService onboarding,
      OnboardingRepository repository,
      OnboardingValidation validation,
      COSMetadataRepository configs,
      COSCrypto crypto,
      COSJson json,
      COSAuditService audit) {
    this.onboarding = onboarding;
    this.repository = repository;
    this.validation = validation;
    this.configs = configs;
    this.crypto = crypto;
    this.json = json;
    this.audit = audit;
  }

  @Transactional
  public List<EmployeeView> register(COSActor actor, List<Profile> rows) {
    actor.require("REGISTRAR");
    if (rows == null || rows.isEmpty() || rows.size() > MAX_ROWS)
      throw new COSError(422, "BATCH_INVALID", "Submit between 1 and 50 employee rows.");
    configs.lock(actor.scope());
    if (repository.drafts(actor.scope(), actor.id(), false).size() >= 100)
      throw COSError.conflict(
          "DRAFT_LIMIT", "Complete existing drafts before registering a batch.");
    var config = configs.active(actor.scope());
    var problems = new LinkedHashMap<String, String>();
    var prepared = new ArrayList<Profile>();
    var seenAadhaar = new HashSet<String>();
    var seenPan = new HashSet<String>();
    var seenRejoins = new HashSet<String>();
    for (int i = 0; i < rows.size(); i++) {
      String prefix = "row_" + (i + 1);
      try {
        Profile data = validation.clean(rows.get(i), true, config);
        var rowProblems = new LinkedHashMap<String, String>();
        UUID except = rejoinTarget(actor.scope(), data, prefix, seenRejoins, rowProblems);
        noteIdentifier(actor.scope(), data, prefix, "aadhaar", seenAadhaar, except, rowProblems);
        noteIdentifier(actor.scope(), data, prefix, "pan", seenPan, except, rowProblems);
        if (rowProblems.isEmpty()) prepared.add(data);
        else problems.putAll(rowProblems);
      } catch (COSError e) {
        if (e.status == 403) throw e;
        if (e.fields.isEmpty()) problems.put(prefix, e.getMessage());
        else e.fields.forEach((key, message) -> problems.put(prefix + "_" + key, message));
      }
    }
    if (!problems.isEmpty())
      throw new COSError(
          422,
          "BATCH_INVALID",
          "No employees were registered. Correct the listed rows and submit the batch again.",
          problems);
    var saved = new ArrayList<EmployeeView>();
    for (Profile data : prepared) {
      UUID id = UUID.randomUUID();
      DraftView draft =
          onboarding.save(actor, id, new SaveDraft(0, config.metadata().version(), data));
      saved.add(onboarding.register(actor, id, draft.version()));
    }
    audit.record(
        actor.scope(),
        actor.id(),
        null,
        "BULK_REGISTER_EMPLOYEES",
        String.valueOf(saved.size()),
        "COMPLETED");
    return List.copyOf(saved);
  }

  private UUID rejoinTarget(
      String scope,
      Profile data,
      String prefix,
      Set<String> seenRejoins,
      Map<String, String> problems) {
    if (!"Rejoiner".equals(data.values().get("joiner"))) return null;
    String code = data.values().get("previous_id");
    var old = repository.byCode(scope, code);
    if (old.isEmpty()) {
      problems.put(
          prefix + "_previous_id",
          "Select a verified existing employee code for rejoining.");
      return null;
    }
    if (!seenRejoins.add(code))
      problems.put(
          prefix + "_previous_id",
          "This employee is already being rejoined in this batch.");
    repository
        .latestJoining(scope, old.get().id())
        .filter(latest -> !LocalDate.parse(data.values().get("joining")).isAfter(latest))
        .ifPresent(
            latest ->
                problems.put(
                    prefix + "_joining",
                    "Rejoining must follow the previous joining date."));
    Profile prior = stored(old.get());
    for (String key : List.of("aadhaar", "pan")) {
      String next = data.values().getOrDefault(key, "");
      String was = prior.values().getOrDefault(key, "");
      if (!was.isBlank() && !next.isBlank() && !was.equals(next))
        problems.put(
            prefix + "_" + key,
            "The prior employee identifiers do not match. Verify the record before rejoining.");
    }
    return old.get().id();
  }

  private void noteIdentifier(
      String scope,
      Profile data,
      String prefix,
      String kind,
      Set<String> seen,
      UUID except,
      Map<String, String> problems) {
    String value = data.values().getOrDefault(kind, "");
    if (value.isBlank()) return;
    String key = prefix + "_" + kind;
    if (problems.containsKey(key)) return;
    String hash = crypto.fingerprint(scope, kind, value);
    if (!seen.add(hash) || repository.identifierInUse(scope, kind, hash, except)) {
      problems.put(key, "This identifier is already in the batch or on an existing employee.");
      return;
    }
    problems.put(
        key, "Add this number later with its photo. Bulk registration does not upload documents.");
  }

  private Profile stored(OnboardingRepository.Employee employee) {
    return json.read(
        crypto.decrypt(
            employee.encrypted(),
            OnboardingService.profileContext(employee.scope(), employee.id())),
        Profile.class);
  }
}
