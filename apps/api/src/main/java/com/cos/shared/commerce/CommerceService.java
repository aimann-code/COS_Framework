package com.cos.shared.commerce;

import static com.cos.shared.commerce.CommerceContracts.*;

import com.cos.shared.COSAuditService;
import com.cos.shared.COSError;
import com.cos.shared.COSJson;
import com.cos.shared.account.COSAccountRepository;
import com.cos.shared.account.CompanyAccess;
import com.cos.shared.component.COSComponent;
import com.cos.shared.config.COSProperties;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.registry.FieldRegistryService;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Shared tenant onboarding, billing evidence, entitlements and governed metadata changes. */
@Service
@Profile("!oidc")
public class CommerceService {
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final Set<String> FIELD_TYPES = Set.of("text", "date", "number");
  private final CommerceRepository repository;
  private final CompanyAccess.CompanyRequestRepository companyRequests;
  private final CompanyAccess.CompanyAccessService companyAccess;
  private final COSAccountRepository accounts;
  private final PasswordEncoder encoder;
  private final List<COSComponent> components;
  private final COSProperties properties;
  private final COSMetadataService metadata;
  private final COSMetadataRepository configs;
  private final FieldRegistryService fields;
  private final COSJson json;
  private final COSAuditService audit;

  public CommerceService(
      CommerceRepository repository,
      CompanyAccess.CompanyRequestRepository companyRequests,
      CompanyAccess.CompanyAccessService companyAccess,
      COSAccountRepository accounts,
      PasswordEncoder encoder,
      List<COSComponent> components,
      COSProperties properties,
      COSMetadataService metadata,
      COSMetadataRepository configs,
      FieldRegistryService fields,
      COSJson json,
      COSAuditService audit) {
    this.repository = repository;
    this.companyRequests = companyRequests;
    this.companyAccess = companyAccess;
    this.accounts = accounts;
    this.encoder = encoder;
    this.components = components;
    this.properties = properties;
    this.metadata = metadata;
    this.configs = configs;
    this.fields = fields;
    this.json = json;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public Catalog catalog() {
    var installed =
        components.stream()
            .flatMap(c -> c.modules().stream())
            .map(COSComponent.Module::code)
            .collect(java.util.stream.Collectors.toSet());
    var descriptors = repository.catalog();
    var byCode = new LinkedHashMap<String, ServiceView>();
    for (ServiceView s : descriptors) byCode.put(s.service_code(), s);
    return new Catalog(
        "INR",
        "MONTHLY",
        "MANUAL_VERIFICATION",
        "DEVELOPMENT_REFERENCE",
        descriptors.stream()
            .map(
                s ->
                    new ServiceView(
                        s.service_code(),
                        s.name(),
                        s.suite(),
                        s.engine(),
                        s.description(),
                        s.price_minor(),
                        s.currency(),
                        s.billing_period(),
                        s.active(),
                        available(s, byCode, installed, new LinkedHashSet<>()),
                        s.modules(),
                        s.dependencies(),
                        s.version()))
            .toList());
  }

  private boolean available(
      ServiceView service,
      Map<String, ServiceView> catalog,
      Set<String> installed,
      Set<String> visiting) {
    if (!service.active()
        || service.modules().isEmpty()
        || !installed.containsAll(service.modules())
        || !visiting.add(service.service_code())) return false;
    for (String dependency : service.dependencies()) {
      ServiceView descriptor = catalog.get(dependency);
      if (descriptor == null
          || !available(descriptor, catalog, installed, new LinkedHashSet<>(visiting)))
        return false;
    }
    return true;
  }

  @Transactional
  public RegistrationView register(Register input) {
    String name = input.company_name().strip();
    if (name.isEmpty() || name.length() > 80)
      throw new COSError(422, "COMPANY_NAME_INVALID", "Provide a company name.");
    if (input.password().length() < 12
        || input.password().getBytes(StandardCharsets.UTF_8).length > 72)
      throw new COSError(422, "PASSWORD_INVALID", "Use a password of 12 to 72 UTF-8 bytes.");
    var chosen = checkedServices(input.services());
    long total = 0;
    for (ServiceView service : chosen) total = Math.addExact(total, service.price_minor());
    String email = input.email().strip().toLowerCase(Locale.ROOT);
    accounts.lockLogin(email);
    if (!accounts.findByEmail(email).isEmpty()) throw loginTaken();
    UUID id = UUID.randomUUID();
    byte[] tokenBytes = new byte[32];
    RANDOM.nextBytes(tokenBytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    String reference =
        "COS-" + id.toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT);
    String moduleCodes =
        String.join(
            ",", chosen.stream().flatMap(s -> s.modules().stream()).distinct().sorted().toList());
    try {
      companyRequests.insert(id, name, email, encoder.encode(input.password()), moduleCodes);
      repository.insertCompany(id, reference, chosen, total, digest(token));
    } catch (DuplicateKeyException error) {
      throw loginTaken();
    }
    repository.event(
        id,
        "COMPANY_REGISTERED",
        "PUBLIC_REGISTRATION",
        Map.of("reference", reference, "total_minor", total));
    return registration(repository.company(id, false), token);
  }

  private List<ServiceView> checkedServices(List<String> services) {
    if (services == null || services.isEmpty() || services.size() > 20)
      throw new COSError(422, "SERVICE_SELECTION_INVALID", "Select between 1 and 20 services.");
    Set<String> codes = new LinkedHashSet<>(services);
    var selected =
        catalog().services().stream().filter(s -> codes.contains(s.service_code())).toList();
    if (selected.size() != codes.size() || selected.stream().anyMatch(s -> !s.available()))
      throw new COSError(
          422, "SERVICE_UNAVAILABLE", "Select an available service from the catalog.");
    for (ServiceView service : selected) {
      if (!codes.containsAll(service.dependencies()))
        throw new COSError(
            422,
            "SERVICE_DEPENDENCY_REQUIRED",
            "Include the required services for your selection.");
    }
    return selected;
  }

  @Transactional(readOnly = true)
  public RegistrationView status(UUID id, Token token) {
    var company = repository.company(id, false);
    token(company, token.registration_token());
    return registration(company, null);
  }

  @Transactional
  public PaymentView declarePayment(UUID id, PaymentDeclaration input) {
    var company = repository.company(id, true);
    token(company, input.registration_token());
    String reference = input.payment_reference().strip().toUpperCase(Locale.ROOT);
    if (!reference.matches("[A-Z0-9][A-Z0-9 /_-]{3,99}"))
      throw new COSError(
          422,
          "PAYMENT_REFERENCE_INVALID",
          "Use a payment reference of 4 to 100 letters, digits, spaces, hyphens or slashes.");
    for (PaymentView existing : repository.companyPayments(id)) {
      if (existing.payment_reference().equals(reference)) return existing;
    }
    if (!Set.of("PENDING_PAYMENT", "PAYMENT_REJECTED").contains(company.status()))
      throw COSError.conflict(
          "PAYMENT_STATE_CONFLICT", "A payment is already under review or this company is active.");
    UUID payment = UUID.randomUUID();
    try {
      repository.declarePayment(payment, id, reference, company.total());
    } catch (DuplicateKeyException error) {
      throw COSError.conflict(
          "PAYMENT_REFERENCE_USED", "This payment reference has already been recorded.");
    }
    repository.event(
        id,
        "PAYMENT_DECLARED",
        "REGISTRATION_CAPABILITY",
        Map.of("payment_id", payment.toString()));
    return repository.payment(payment, false);
  }

  @Transactional(readOnly = true)
  public Overview overview(COSActor actor) {
    requireOperator(actor);
    Counts counts = repository.counts();
    return new Overview(
        counts,
        repository.companies(),
        repository.payments(),
        repository.configurations(null),
        200,
        counts.companies() > 200);
  }

  @Transactional
  public PaymentView reviewPayment(COSActor actor, UUID id, Review input) {
    requireOperator(actor);
    String outcome = review(input);
    // Lock the company before its payment everywhere to maintain one lock order.
    var initial = repository.payment(id, false);
    UUID companyId = UUID.fromString(initial.company_id());
    var company = repository.company(companyId, true);
    var payment = repository.payment(id, true);
    if (!payment.status().equals("PENDING_REVIEW") || !company.status().equals("PAYMENT_REVIEW"))
      throw COSError.conflict(
          "PAYMENT_ALREADY_REVIEWED", "This payment has already been reviewed.");
    if (outcome.equals("APPROVED")) {
      // Availability can change while a transfer is pending; price remains the original quote.
      checkedServices(company.snapshot().stream().map(ServiceView::service_code).toList());
      repository.reviewPayment(id, outcome, actor.id(), input.remarks().strip());
      companyAccess.decide(
          actor,
          companyId,
          new CompanyAccess.Decision(
              "APPROVE",
              company.snapshot().stream()
                  .flatMap(s -> s.modules().stream())
                  .distinct()
                  .sorted()
                  .toList(),
              input.remarks()));
      repository.activate(companyId, id, company.snapshot());
    } else {
      repository.reviewPayment(id, outcome, actor.id(), input.remarks().strip());
      repository.rejectPayment(companyId);
    }
    repository.event(
        companyId,
        "PAYMENT_" + outcome,
        actor.id(),
        Map.of("payment_id", id.toString(), "remarks", input.remarks().strip()));
    audit.record(actor.scope(), actor.id(), null, "PAYMENT_" + outcome, id.toString(), outcome);
    return repository.payment(id, false);
  }

  @Transactional(readOnly = true)
  public Workspace workspace(COSActor actor) {
    companyManager(actor);
    var company = repository.companyByScope(actor.scope());
    var view = repository.companyView(company.id());
    var services =
        catalog().services().stream()
            .filter(s -> view.active_services().contains(s.service_code()))
            .toList();
    var schemas =
        services.stream()
            .map(
                s -> {
                  var definitions = repository.schema(actor.scope(), s.service_code());
                  return new Schema(
                      s.service_code(),
                      repository.schemaVersion(actor.scope(), s.service_code()),
                      definitions);
                })
            .toList();
    return new Workspace(
        view,
        services,
        repository.configurations(company.id()),
        schemas,
        List.of("text", "date", "number"));
  }

  @Transactional
  public ConfigurationView submitConfiguration(COSActor actor, ConfigurationSubmit input) {
    companyManager(actor);
    var company = repository.companyByScope(actor.scope());
    if (!repository.entitled(actor.scope(), input.service_code())) throw COSError.forbidden();
    if (!Set.of("FIELD_ADD", "FIELD_UPDATE").contains(input.kind()))
      throw new COSError(
          422,
          "CONFIGURATION_KIND_UNSUPPORTED",
          "Choose an additional field or field update request.");
    configs.lock(actor.scope());
    validateField(input.field());
    if (input.reason() == null || input.reason().isBlank() || input.reason().length() > 1000)
      throw new COSError(422, "REASON_REQUIRED", "Describe why the field is needed.");
    int schemaVersion = repository.schemaVersion(actor.scope(), input.service_code());
    if ((input.kind().equals("FIELD_UPDATE") && input.schema_version() == null)
        || (input.schema_version() != null && input.schema_version() != schemaVersion))
      throw COSError.conflict(
          "SCHEMA_VERSION_CONFLICT",
          "Refresh the current service schema before submitting a change.");
    var schema = repository.schema(actor.scope(), input.service_code());
    if (input.kind().equals("FIELD_ADD")) {
      if (schema.stream().anyMatch(f -> f.technical_name().equals(input.field().technical_name())))
        throw COSError.conflict(
            "FIELD_ALREADY_CONFIGURED", "This field is already configured for this service.");
    } else existingField(input.field(), schema);
    var config = configs.active(actor.scope());
    if (employeeService(input.service_code()))
      candidate(input.field(), config.metadata(), actor.scope(), input.kind());
    UUID id = UUID.randomUUID();
    try {
      repository.insertConfiguration(
          id, company, input, actor.id(), config.metadata().version(), schemaVersion);
    } catch (DuplicateKeyException error) {
      throw COSError.conflict(
          "FIELD_REQUEST_PENDING", "A request for this field is already pending.");
    }
    repository.event(
        company.id(),
        "CONFIGURATION_REQUESTED",
        actor.id(),
        Map.of("request_id", id.toString(), "service_code", input.service_code()));
    return configurationView(company.id(), id);
  }

  @Transactional
  public ConfigurationView reviewConfiguration(COSActor actor, UUID id, Review input) {
    requireOperator(actor);
    String outcome = review(input);
    var request = repository.configuration(id, true);
    if (!request.status().equals("PENDING_REVIEW"))
      throw COSError.conflict(
          "CONFIGURATION_ALREADY_REVIEWED", "This request has already been reviewed.");
    if (request.submittedBy().equals(actor.id()))
      throw COSError.conflict(
          "SELF_APPROVAL_FORBIDDEN", "Another platform administrator must review this request.");
    if (outcome.equals("APPROVED")) {
      if (!repository.entitled(request.scope(), request.service())) throw COSError.forbidden();
      configs.lock(request.scope());
      var current = configs.active(request.scope());
      if (repository.schemaVersion(request.scope(), request.service())
          != request.baseSchemaVersion())
        throw COSError.conflict(
            "SCHEMA_VERSION_CONFLICT",
            "The service schema changed. Reject this request and submit a new version.");
      if (request.kind().equals("FIELD_UPDATE")
          && employeeService(request.service())
          && current.metadata().version() != request.baseVersion())
        throw COSError.conflict(
            "CONFIG_VERSION_CONFLICT",
            "The form configuration changed. Reject this request and submit a new version.");
      if (request.kind().equals("FIELD_UPDATE"))
        existingField(request.field(), repository.schema(request.scope(), request.service()));
      if (employeeService(request.service()))
        configs.publish(
            request.scope(),
            candidate(request.field(), current.metadata(), request.scope(), request.kind()),
            actor.id());
      if (request.kind().equals("FIELD_ADD")) {
        var field =
            fields.registerApprovedField(
                actor,
                request.scope(),
                new FieldRegistryService.FieldRegistration(
                    request.field().technical_name(),
                    request.field().label(),
                    request.field().data_type(),
                    request.field().sensitive()));
        repository.mapField(request, field.field_id());
      } else repository.updateField(request);
      repository.advanceSchema(request.scope(), request.service());
    }
    repository.reviewConfiguration(id, outcome, actor.id(), input.remarks().strip());
    repository.event(
        request.company(),
        "CONFIGURATION_" + outcome,
        actor.id(),
        Map.of("request_id", id.toString(), "remarks", input.remarks().strip()));
    audit.record(
        request.scope(),
        actor.id(),
        null,
        "SERVICE_CONFIGURATION_" + outcome,
        id.toString(),
        outcome);
    return configurationView(request.company(), id);
  }

  private boolean employeeService(String code) {
    return repository.catalog().stream()
        .filter(s -> s.service_code().equals(code))
        .anyMatch(s -> s.modules().contains("EMPLOYEES"));
  }

  private com.cos.shared.web.COSContracts.Metadata candidate(
      FieldInput input,
      com.cos.shared.web.COSContracts.Metadata current,
      String scope,
      String kind) {
    if (kind.equals("FIELD_ADD")
        && current.fields().stream().anyMatch(f -> f.id().equals(input.technical_name())))
      throw COSError.conflict(
          "FIELD_ALREADY_CONFIGURED", "This field already exists in the form configuration.");
    var definitions = new ArrayList<>(current.fields());
    if (kind.equals("FIELD_ADD"))
      definitions.add(
          new Field(
              input.technical_name(),
              null,
              input.label().strip(),
              input.data_type(),
              false,
              true,
              input.sensitive(),
              input.sensitive()
                  ? List.of("ADMIN", "REGISTRAR")
                  : List.of("ADMIN", "REGISTRAR", "EMPLOYEE"),
              List.of("REGISTRAR", "EMPLOYEE"),
              !input.sensitive(),
              definitions.size(),
              "additional",
              500));
    else {
      Field existing =
          current.fields().stream()
              .filter(f -> f.id().equals(input.technical_name()))
              .findFirst()
              .orElseThrow(COSError::missing);
      if (!existing.type().equals(input.data_type()))
        throw COSError.conflict(
            "FIELD_TYPE_IMMUTABLE", "Existing field types require an explicit migration.");
      if (existing.sensitive() && !input.sensitive())
        throw COSError.conflict(
            "FIELD_SENSITIVITY_IMMUTABLE", "Existing sensitive fields must remain sensitive.");
      definitions.replaceAll(
          f ->
              f.id().equals(input.technical_name())
                  ? new Field(
                      f.id(),
                      f.field_id(),
                      input.label().strip(),
                      f.type(),
                      f.required(),
                      f.visible(),
                      input.sensitive(),
                      input.sensitive() ? List.of("ADMIN", "REGISTRAR") : f.read_roles(),
                      f.write_roles(),
                      !input.sensitive() && f.printable(),
                      f.display_order(),
                      f.group_key(),
                      f.max_length())
                  : f);
    }
    return metadata.validateChange(json.tree(Map.of("fields", definitions)), current, scope);
  }

  private void existingField(FieldInput input, List<FieldInput> schema) {
    FieldInput current =
        schema.stream()
            .filter(f -> f.technical_name().equals(input.technical_name()))
            .findFirst()
            .orElseThrow(
                () ->
                    COSError.conflict(
                        "FIELD_NOT_CONFIGURED", "Choose a previously approved service field."));
    if (!current.data_type().equals(input.data_type()))
      throw COSError.conflict(
          "FIELD_TYPE_IMMUTABLE", "Existing field types require an explicit migration.");
    if (current.sensitive() != input.sensitive())
      throw COSError.conflict(
          "FIELD_SENSITIVITY_MIGRATION_REQUIRED",
          "Changing existing field sensitivity requires a reviewed data migration.");
    if (current.sensitive() && !input.sensitive())
      throw COSError.conflict(
          "FIELD_SENSITIVITY_IMMUTABLE", "Existing sensitive fields must remain sensitive.");
  }

  @Transactional
  public Catalog updateCatalog(COSActor actor, String code, CatalogUpdate input) {
    requireOperator(actor);
    if (input.price_minor() == null
        || input.price_minor() < 1
        || input.price_minor() > 1_000_000_000L)
      throw new COSError(422, "PRICE_INVALID", "Provide a positive price in minor currency units.");
    if (!repository.updateCatalog(code, input))
      throw COSError.conflict(
          "CATALOG_VERSION_CONFLICT", "The service catalog changed. Refresh and try again.");
    audit.record(actor.scope(), actor.id(), null, "SERVICE_CATALOG_UPDATED", code, "COMPLETED");
    return catalog();
  }

  public void requireOperator(COSActor actor) {
    if (!actor.admin() || !properties.getScopeId().equals(actor.scope()))
      throw COSError.forbidden();
  }

  private void companyManager(COSActor actor) {
    if (!actor.admin() && !actor.roles().contains("REGISTRAR")) throw COSError.forbidden();
    if (actor.scope().equals(properties.getScopeId()))
      throw new COSError(
          409,
          "COMPANY_WORKSPACE_REQUIRED",
          "Use a registered company account for this workspace.");
  }

  private void validateField(FieldInput field) {
    if (field == null
        || field.technical_name() == null
        || !field.technical_name().matches("[a-z][a-z0-9_]{0,59}")
        || Set.of(
                "sys_emp_id",
                "employee_name",
                "father_name",
                "nationality_id",
                "national_id_type_id",
                "id_number",
                "empid_entry_mode")
            .contains(field.technical_name()))
      throw new COSError(
          422, "FIELD_ID_INVALID", "Use a lowercase field name that is not a core identifier.");
    if (field.label() == null
        || field.label().isBlank()
        || field.label().strip().length() > 80
        || !FIELD_TYPES.contains(field.data_type()))
      throw new COSError(
          422, "FIELD_DEFINITION_INVALID", "Provide a label and a supported field type.");
  }

  private ConfigurationView configurationView(UUID company, UUID id) {
    return repository.configurations(company).stream()
        .filter(q -> q.request_id().equals(id.toString()))
        .findFirst()
        .orElseThrow(COSError::missing);
  }

  private String review(Review input) {
    if (!Set.of("APPROVE", "REJECT").contains(input.decision()))
      throw new COSError(422, "DECISION_INVALID", "Choose Approve or Reject.");
    if (input.remarks() == null || input.remarks().isBlank() || input.remarks().length() > 500)
      throw new COSError(
          422, "REMARKS_REQUIRED", "Record verification evidence or a rejection reason.");
    return input.decision().equals("APPROVE") ? "APPROVED" : "REJECTED";
  }

  private RegistrationView registration(CommerceRepository.CompanyRow company, String token) {
    return new RegistrationView(
        company.id().toString(),
        company.reference(),
        company.name(),
        company.status(),
        company.snapshot().stream().map(ServiceView::service_code).toList(),
        company.total(),
        company.currency(),
        company.billing(),
        token);
  }

  private void token(CommerceRepository.CompanyRow company, String token) {
    if (token == null
        || token.length() > 128
        || !company.tokenExpires().isAfter(Instant.now())
        || !MessageDigest.isEqual(
            company.tokenDigest().getBytes(StandardCharsets.US_ASCII),
            digest(token).getBytes(StandardCharsets.US_ASCII)))
      throw new COSError(
          404,
          "REGISTRATION_NOT_FOUND",
          "Registration could not be found or its access link expired.");
  }

  private static String digest(String token) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is required.", error);
    }
  }

  private static COSError loginTaken() {
    return COSError.conflict(
        "COMPANY_LOGIN_TAKEN", "This login is already in use or awaiting review.");
  }
}
