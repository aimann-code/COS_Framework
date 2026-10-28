package com.cos.shared.account;

import com.cos.shared.COSAuditService;
import com.cos.shared.COSError;
import com.cos.shared.component.COSComponent;
import com.cos.shared.config.COSProperties;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.metadata.ModuleCatalog;
import com.cos.shared.security.COSActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Company onboarding. Shared services stay shared; each company gets its own scope. */
public final class CompanyAccess {
  private CompanyAccess() {}

  public static final String SUITE = "Enterprise Management";
  public static final String ENGINE = "HRMS";

  public record Catalog(String suite, String engine, List<String> modules) {}

  public record Submit(
      @NotBlank @Size(max = 80) String company_name,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 72) String password,
      @NotEmpty @Size(max = 20) List<@NotBlank String> modules) {}

  public record Decision(
      @NotBlank String decision,
      List<@NotBlank String> modules,
      @Size(max = 500) String remarks) {}

  public record RequestView(
      String request_id,
      String company_name,
      String login_email,
      List<String> requested_modules,
      List<String> granted_modules,
      String scope_id,
      String status,
      String remarks,
      String created_at) {}

  public record RequestRow(
      UUID id, String company, String email, String passwordHash, String modules, String status) {}

  @Repository
  @Profile("!oidc")
  public static class CompanyRequestRepository {
    private final JdbcClient jdbc;

    public CompanyRequestRepository(JdbcClient jdbc) {
      this.jdbc = jdbc;
    }

    public void insert(
        UUID id, String company, String email, String passwordHash, String modules) {
      jdbc.sql(
              "INSERT INTO auth.company_request(request_id,readable_id,company_name,login_email,password_hash,requested_modules)"
                  + " VALUES(:id,:readable,:company,:email,:password,:modules)")
          .param("id", id)
          .param("readable", "LOCAL-CO-" + id)
          .param("company", company)
          .param("email", email)
          .param("password", passwordHash)
          .param("modules", modules)
          .update();
    }

    public List<RequestView> pending() {
      return jdbc.sql(
              "SELECT * FROM auth.company_request WHERE status='PENDING' ORDER BY created_at")
          .query((r, n) -> view(r))
          .list();
    }

    public RequestRow lock(UUID id) {
      return jdbc.sql("SELECT * FROM auth.company_request WHERE request_id=:id FOR UPDATE")
          .param("id", id)
          .query(
              (r, n) ->
                  new RequestRow(
                      r.getObject("request_id", UUID.class),
                      r.getString("company_name"),
                      r.getString("login_email"),
                      r.getString("password_hash"),
                      r.getString("requested_modules"),
                      r.getString("status")))
          .optional()
          .orElseThrow(COSError::missing);
    }

    public void approve(UUID id, String scope, String modules, String actor) {
      jdbc.sql(
              "UPDATE auth.company_request SET status='APPROVED',scope_id=:scope,granted_modules=:modules,reviewed_by=:actor,reviewed_at=now()"
                  + " WHERE request_id=:id AND status='PENDING'")
          .param("id", id)
          .param("scope", scope)
          .param("modules", modules)
          .param("actor", actor)
          .update();
    }

    public void reject(UUID id, String actor, String remarks) {
      jdbc.sql(
              "UPDATE auth.company_request SET status='REJECTED',reviewed_by=:actor,reviewed_at=now(),remarks=:remarks"
                  + " WHERE request_id=:id AND status='PENDING'")
          .param("id", id)
          .param("actor", actor)
          .param("remarks", remarks)
          .update();
    }

    private static RequestView view(java.sql.ResultSet r) throws java.sql.SQLException {
      String granted = r.getString("granted_modules");
      return new RequestView(
          r.getObject("request_id", UUID.class).toString(),
          r.getString("company_name"),
          r.getString("login_email"),
          split(r.getString("requested_modules")),
          split(granted),
          r.getString("scope_id"),
          r.getString("status"),
          r.getString("remarks"),
          r.getTimestamp("created_at").toInstant().toString());
    }

    private static List<String> split(String value) {
      if (value == null || value.isBlank()) return List.of();
      return List.of(value.split(","));
    }
  }

  @Service
  @Profile("!oidc")
  public static class CompanyAccessService {
    private final CompanyRequestRepository requests;
    private final COSAccountRepository accounts;
    private final COSMetadataService metadata;
    private final COSMetadataRepository scopes;
    private final ModuleCatalog.ModuleRepository modules;
    private final ModuleCatalog.ModuleService moduleService;
    private final List<COSComponent> components;
    private final PasswordEncoder encoder;
    private final COSProperties properties;
    private final COSAuditService audit;

    public CompanyAccessService(
        CompanyRequestRepository requests,
        COSAccountRepository accounts,
        COSMetadataService metadata,
        COSMetadataRepository scopes,
        ModuleCatalog.ModuleRepository modules,
        ModuleCatalog.ModuleService moduleService,
        List<COSComponent> components,
        PasswordEncoder encoder,
        COSProperties properties,
        COSAuditService audit) {
      this.requests = requests;
      this.accounts = accounts;
      this.metadata = metadata;
      this.scopes = scopes;
      this.modules = modules;
      this.moduleService = moduleService;
      this.components = components;
      this.encoder = encoder;
      this.properties = properties;
      this.audit = audit;
    }

    public Catalog catalog() {
      return new Catalog(SUITE, ENGINE, knownModules());
    }

    @Transactional
    public UUID submit(Submit input) {
      if (input.password().getBytes(StandardCharsets.UTF_8).length > 72)
        throw new COSError(422, "PASSWORD_INVALID", "Use a password of 12 to 72 characters.");
      String email = input.email().strip().toLowerCase(Locale.ROOT);
      String chosen = checkedModules(input.modules());
      if (!accounts.findByEmail(email).isEmpty())
        throw COSError.conflict("COMPANY_LOGIN_TAKEN", "This login is already in use.");
      UUID id = UUID.randomUUID();
      try {
        requests.insert(id, input.company_name().strip(), email, encoder.encode(input.password()), chosen);
      } catch (DuplicateKeyException e) {
        throw COSError.conflict("COMPANY_LOGIN_TAKEN", "This login is already in use.");
      }
      return id;
    }

    @Transactional(readOnly = true)
    public List<RequestView> pending(COSActor actor) {
      requireOperator(actor);
      return requests.pending();
    }

    @Transactional
    public void decide(COSActor actor, UUID id, Decision input) {
      requireOperator(actor);
      if (!Set.of("APPROVE", "REJECT").contains(input.decision()))
        throw new COSError(422, "DECISION_INVALID", "Choose Approve or Reject.");
      var row = requests.lock(id);
      if (!row.status().equals("PENDING"))
        throw COSError.conflict(
            "COMPANY_ALREADY_REVIEWED", "This company request has already been reviewed.");
      String note = input.remarks() == null ? "" : input.remarks().strip();
      if (input.decision().equals("REJECT")) {
        if (note.isBlank())
          throw new COSError(422, "REMARKS_REQUIRED", "A rejection reason is required.");
        requests.reject(id, actor.id(), note);
        audit.record(actor.scope(), actor.id(), null, "COMPANY_REJECTED", id.toString(), "REJECTED");
        return;
      }
      String granted = checkedModules(input.modules() == null ? List.of() : input.modules());
      if (!accounts.findByEmail(row.email()).isEmpty())
        throw COSError.conflict("COMPANY_LOGIN_TAKEN", "This login is already in use.");
      String scope = newScope(row.company());
      metadata.seedLocal(scope);
      moduleService.ensure(scope);
      var grantedSet = Set.of(granted.split(","));
      for (String code : knownModules()) modules.setEnabled(scope, code, grantedSet.contains(code));
      accounts.createActive(
          scope, row.company(), row.email(), row.passwordHash(), "REGISTRAR", actor.id());
      requests.approve(id, scope, granted, actor.id());
      audit.record(actor.scope(), actor.id(), null, "COMPANY_APPROVED", scope, "APPROVED");
    }

    private void requireOperator(COSActor actor) {
      if (!actor.admin() || !actor.scope().equals(properties.getScopeId())) throw COSError.forbidden();
    }

    private List<String> knownModules() {
      return components.stream()
          .flatMap(component -> component.modules().stream())
          .map(COSComponent.Module::code)
          .distinct()
          .sorted()
          .toList();
    }

    private String checkedModules(List<String> requested) {
      var known = Set.copyOf(knownModules());
      var chosen =
          requested.stream()
              .map(String::strip)
              .filter(code -> !code.isBlank())
              .distinct()
              .sorted()
              .toList();
      if (chosen.isEmpty() || !known.containsAll(chosen))
        throw new COSError(422, "MODULE_UNKNOWN", "Choose a module from the HRMS engine.");
      return String.join(",", chosen);
    }

    private String newScope(String company) {
      String slug = company.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
      if (slug.length() < 2) slug = "company";
      if (slug.length() > 16) slug = slug.substring(0, 16);
      String scope = "co_" + slug;
      int suffix = 2;
      while (scopes.scopeExists(scope) || scope.equals(properties.getScopeId()))
        scope = "co_" + slug + suffix++;
      return scope;
    }
  }

  @RestController
  @Profile("!oidc")
  @RequestMapping("/api/v1/cos/company-requests")
  public static class CompanyAccessController {
    private final CompanyAccessService companies;
    private final COSProperties properties;

    public CompanyAccessController(CompanyAccessService companies, COSProperties properties) {
      this.companies = companies;
      this.properties = properties;
    }

    @GetMapping("/catalog")
    public Catalog catalog() {
      return companies.catalog();
    }

    @PostMapping
    public ResponseEntity<Void> submit(@Valid @RequestBody Submit input) {
      companies.submit(input);
      return ResponseEntity.accepted().build();
    }

    @GetMapping
    public List<RequestView> pending(Authentication authentication) {
      if (authentication == null) throw COSError.forbidden();
      return companies.pending(COSActor.from(authentication, properties));
    }

    @PostMapping("/{id}/review")
    public ResponseEntity<Void> review(
        Authentication authentication, @PathVariable UUID id, @Valid @RequestBody Decision input) {
      if (authentication == null) throw COSError.forbidden();
      companies.decide(COSActor.from(authentication, properties), id, input);
      return ResponseEntity.noContent().build();
    }
  }
}
