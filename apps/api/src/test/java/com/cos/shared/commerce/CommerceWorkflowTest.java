package com.cos.shared.commerce;

import static com.cos.shared.commerce.CommerceContracts.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cos.shared.COSError;
import com.cos.shared.COSJson;
import com.cos.shared.account.CompanyAccess;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.metadata.ModuleCatalog;
import com.cos.shared.registry.FieldRegistryService;
import com.cos.shared.security.COSActor;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "cos.scope-id=TEST",
      "cos.id-prefix=TEST-",
      "cos.worker-enabled=false",
      "cos.registrar-password=integration-test-password",
      "cos.admin-password=integration-test-password",
      "cos.reviewer-password=integration-test-password",
      "cos.viewer-password=integration-test-password"
    })
@ActiveProfiles("test")
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CommerceWorkflowTest {
  @TestConfiguration
  static class Database {
    @Bean(destroyMethod = "close")
    EmbeddedPostgres postgres() throws Exception {
      return EmbeddedPostgres.builder()
          .setServerConfig("listen_addresses", "127.0.0.1")
          .setPort(0)
          .start();
    }

    @Bean
    DataSource dataSource(EmbeddedPostgres pg) {
      return pg.getPostgresDatabase();
    }
  }

  @Autowired CommerceService commerce;
  @Autowired CommerceRepository repository;
  @Autowired COSMetadataService metadata;
  @Autowired COSMetadataRepository configs;
  @Autowired ModuleCatalog.ModuleService modules;
  @Autowired FieldRegistryService registry;
  @Autowired CompanyAccess.CompanyAccessService legacy;
  @Autowired JdbcClient jdbc;
  @Autowired MockMvc mvc;
  @Autowired COSJson json;
  @Autowired com.cos.shared.account.COSAccountService accounts;
  final COSActor operator = new COSActor("admin", "TEST", Set.of("ADMIN"));

  @BeforeAll
  void seed() {
    metadata.seedLocal("TEST");
  }

  @Test
  void publicSignupCannotShadowACompanyAwaitingPaymentApproval() {
    var company = register(List.of("EMPLOYEE_MANAGEMENT"));
    UUID id = UUID.fromString(company.company_id());
    String email =
        jdbc.sql("SELECT login_email FROM auth.company_request WHERE request_id=:id")
            .param("id", id)
            .query(String.class)
            .single();
    accounts.signup(
        new com.cos.shared.account.COSAccountService.Signup(
            "Synthetic duplicate", email, "synthetic-other-passphrase"));
    assertThat(
            jdbc.sql("SELECT count(*) FROM auth.account WHERE email=:email")
                .param("email", email)
                .query(Long.class)
                .single())
        .isZero();
    var payment =
        commerce.declarePayment(
            id,
            new PaymentDeclaration(company.registration_token(), "SYNTHETIC-" + UUID.randomUUID()));
    commerce.reviewPayment(
        operator, UUID.fromString(payment.payment_id()), new Review("APPROVE", "Synthetic review"));
    assertThat(commerce.status(id, new Token(company.registration_token())).status())
        .isEqualTo("ACTIVE");
    assertThat(
            jdbc.sql("SELECT count(*) FROM auth.account WHERE email=:email")
                .param("email", email)
                .query(Long.class)
                .single())
        .isEqualTo(1L);
  }

  @Test
  void quotesUseServerMetadataAndRequireInstalledDependencies() {
    var catalog = commerce.catalog();
    assertThat(catalog.pricing_status()).isEqualTo("DEVELOPMENT_REFERENCE");
    assertThat(catalog.payment_mode()).isEqualTo("MANUAL_VERIFICATION");
    assertThat(catalog.services()).allMatch(ServiceView::available);
    assertThatThrownBy(() -> register(List.of("LEAVE_MANAGEMENT")))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("SERVICE_DEPENDENCY_REQUIRED");
    assertThatThrownBy(() -> register(List.of("UNINSTALLED_MODULE")))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("SERVICE_UNAVAILABLE");
    var registered = register(List.of("EMPLOYEE_MANAGEMENT"));
    long quoted = registered.total_minor();
    var employee =
        catalog.services().stream()
            .filter(s -> s.service_code().equals("EMPLOYEE_MANAGEMENT"))
            .findFirst()
            .orElseThrow();
    commerce.updateCatalog(
        operator,
        employee.service_code(),
        new CatalogUpdate(
            employee.description(), employee.price_minor() + 100, true, employee.version()));
    assertThat(
            commerce
                .status(
                    UUID.fromString(registered.company_id()),
                    new Token(registered.registration_token()))
                .total_minor())
        .isEqualTo(quoted);
    var refreshed =
        commerce.catalog().services().stream()
            .filter(s -> s.service_code().equals(employee.service_code()))
            .findFirst()
            .orElseThrow();
    commerce.updateCatalog(
        operator,
        employee.service_code(),
        new CatalogUpdate(
            employee.description(), employee.price_minor(), true, refreshed.version()));
  }

  @Test
  void paymentCapabilityProtectsStatusAndReferenceCannotGrantAccess() throws Exception {
    var company = register(List.of("EMPLOYEE_MANAGEMENT"));
    UUID id = UUID.fromString(company.company_id());
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM auth.account WHERE email=(SELECT login_email FROM"
                        + " auth.company_request WHERE request_id=:id)")
                .param("id", id)
                .query(Long.class)
                .single())
        .isZero();
    assertThatThrownBy(() -> commerce.status(id, new Token("wrong-capability")))
        .isInstanceOf(COSError.class)
        .extracting("status")
        .isEqualTo(404);
    mvc.perform(
            post("/api/v1/cos/companies/" + id + "/payment")
                .contentType("application/json")
                .content(
                    json.write(
                        new PaymentDeclaration(
                            company.registration_token(), "SYNTHETIC-REF-0001"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("CSRF_INVALID"));
    var payment =
        commerce.declarePayment(
            id,
            new PaymentDeclaration(company.registration_token(), "SYNTHETIC-" + UUID.randomUUID()));
    assertThat(payment.status()).isEqualTo("PENDING_REVIEW");
    assertThat(payment.total_minor()).isEqualTo(company.total_minor());
    assertThat(
            commerce
                .declarePayment(
                    id,
                    new PaymentDeclaration(
                        company.registration_token(), payment.payment_reference()))
                .payment_id())
        .isEqualTo(payment.payment_id());
    assertThat(repository.company(id, false).scope()).isNull();
    assertThatThrownBy(
            () ->
                legacy.decide(
                    operator,
                    id,
                    new CompanyAccess.Decision("APPROVE", List.of("EMPLOYEES"), "Bypass attempt")))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("PAYMENT_VERIFICATION_REQUIRED");
    var second = register(List.of("EMPLOYEE_MANAGEMENT"));
    assertThatThrownBy(
            () ->
                commerce.declarePayment(
                    UUID.fromString(second.company_id()),
                    new PaymentDeclaration(
                        second.registration_token(), payment.payment_reference())))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("PAYMENT_REFERENCE_USED");
  }

  @Test
  void verifiedPaymentActivatesOnlySubscribedServicesAndEnforcesApiGates() throws Exception {
    var company = register(List.of("EMPLOYEE_MANAGEMENT"));
    var payment = declare(company);
    assertThatThrownBy(
            () ->
                commerce.reviewPayment(
                    new COSActor("tenant-admin", "co_other", Set.of("ADMIN")),
                    UUID.fromString(payment.payment_id()),
                    new Review("APPROVE", "Verified synthetic transfer evidence")))
        .isInstanceOf(COSError.class)
        .extracting("status")
        .isEqualTo(403);
    commerce.reviewPayment(
        operator,
        UUID.fromString(payment.payment_id()),
        new Review("APPROVE", "Verified synthetic transfer evidence"));
    var current = repository.company(UUID.fromString(company.company_id()), false);
    assertThat(current.status()).isEqualTo("ACTIVE");
    assertThat(current.scope()).startsWith("co_");
    var manager = new COSActor(current.email(), current.scope(), Set.of("REGISTRAR"));
    assertThat(modules.list(manager))
        .extracting(ModuleCatalog.ModuleView::module_code)
        .containsExactly("EMPLOYEES");
    Cookie cookie = login(current.email());
    mvc.perform(get("/api/v1/cos/session").cookie(cookie))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.scope_id").value(current.scope()))
        .andExpect(jsonPath("$.platform_admin").value(false));
    mvc.perform(get("/api/v1/cos/company/workspace").cookie(cookie))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.company.company_id").value(company.company_id()));
    mvc.perform(get("/api/v1/cos/platform/overview").cookie(cookie))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/cos/leave/catalog").cookie(cookie))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("SERVICE_NOT_SUBSCRIBED"));
    // A newly discovered or manually inserted navigation entry cannot bypass entitlement checks.
    jdbc.sql(
            "INSERT INTO meta.module(scope_id,module_code,name,route,audience,enabled,metadata)"
                + " VALUES(:scope,'FUTURE_SERVICE','Future','/future','REGISTRAR',true,'{}'::jsonb)")
        .param("scope", current.scope())
        .update();
    assertThat(modules.list(manager))
        .extracting(ModuleCatalog.ModuleView::module_code)
        .doesNotContain("FUTURE_SERVICE");
  }

  @Test
  void rejectionAndConcurrentReviewCannotCreateDuplicateAccountsOrEntitlements() throws Exception {
    var company = register(List.of("EMPLOYEE_MANAGEMENT", "LEAVE_MANAGEMENT"));
    var first = declare(company);
    commerce.reviewPayment(
        operator,
        UUID.fromString(first.payment_id()),
        new Review("REJECT", "Synthetic transfer evidence did not match"));
    assertThat(repository.company(UUID.fromString(company.company_id()), false).scope()).isNull();
    var second = declare(company);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var results =
          pool.invokeAll(
              List.of(
                  () -> reviewResult(second.payment_id()),
                  () -> reviewResult(second.payment_id())));
      assertThat(List.of(results.get(0).get(), results.get(1).get()))
          .containsExactlyInAnyOrder("APPROVED", "PAYMENT_ALREADY_REVIEWED");
    }
    assertThat(
            jdbc.sql("SELECT count(*) FROM commerce.entitlement WHERE company_id=:id")
                .param("id", UUID.fromString(company.company_id()))
                .query(Long.class)
                .single())
        .isEqualTo(2);
  }

  @Test
  void companyMetadataChangesRequirePlatformApprovalAndStayInTheirScope() throws Exception {
    var company = activate(List.of("EMPLOYEE_MANAGEMENT", "LEAVE_MANAGEMENT"));
    var other = activate(List.of("EMPLOYEE_MANAGEMENT"));
    var manager = new COSActor(company.email(), company.scope(), Set.of("REGISTRAR"));
    var tenantAdmin = new COSActor("tenant-admin", company.scope(), Set.of("ADMIN"));
    var field = new FieldInput("office_location", "Office location", "text", false);
    var request =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "EMPLOYEE_MANAGEMENT", "FIELD_ADD", field, "Needed in our employee profile"));
    assertThat(configs.active(company.scope()).metadata().fields())
        .noneMatch(f -> f.id().equals(field.technical_name()));
    assertThatThrownBy(
            () ->
                registry.registerField(
                    tenantAdmin,
                    new FieldRegistryService.FieldRegistration(
                        "bypass_field", "Bypass field", "text", false)))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("PLATFORM_APPROVAL_REQUIRED");
    assertThatThrownBy(
            () ->
                commerce.reviewConfiguration(
                    tenantAdmin,
                    UUID.fromString(request.request_id()),
                    new Review("APPROVE", "Attempted tenant admin bypass")))
        .isInstanceOf(COSError.class)
        .extracting("status")
        .isEqualTo(403);
    var approved =
        commerce.reviewConfiguration(
            operator,
            UUID.fromString(request.request_id()),
            new Review("APPROVE", "Reviewed purpose, data type and access"));
    assertThat(approved.status()).isEqualTo("APPROVED");
    assertThat(configs.active(company.scope()).metadata().fields())
        .anyMatch(f -> f.id().equals(field.technical_name()));
    assertThat(configs.active(other.scope()).metadata().fields())
        .noneMatch(f -> f.id().equals(field.technical_name()));
    assertThat(commerce.workspace(manager).schemas())
        .anyMatch(schema -> schema.fields().contains(field));
    var pluginField = new FieldInput("project_tag", "Project tag", "text", false);
    var leaveRequest =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "LEAVE_MANAGEMENT", "FIELD_ADD", pluginField, "Reusable module field metadata"));
    commerce.reviewConfiguration(
        operator,
        UUID.fromString(leaveRequest.request_id()),
        new Review("APPROVE", "Reviewed reusable module schema"));
    assertThat(commerce.workspace(manager).schemas())
        .anyMatch(
            schema ->
                schema.service_code().equals("LEAVE_MANAGEMENT")
                    && schema.fields().contains(pluginField));
    assertThat(configs.active(company.scope()).metadata().fields())
        .noneMatch(f -> f.id().equals("project_tag"));
    Cookie cookie = login(company.email());
    mvc.perform(
            put("/api/v1/cos/leave/policies/CL")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("PLATFORM_APPROVAL_REQUIRED"));
    assertThatThrownBy(
            () ->
                commerce.submitConfiguration(
                    manager,
                    new ConfigurationSubmit(
                        "EMPLOYEE_MANAGEMENT",
                        "FIELD_ADD",
                        new FieldInput("sql_payload", "SQL", "sql", false),
                        "Unsupported metadata")))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("FIELD_DEFINITION_INVALID");
  }

  @Test
  void fieldChangesKeepStableIdentityAndRejectStaleOrStorageChangingMetadata() {
    var company = activate(List.of("EMPLOYEE_MANAGEMENT", "LEAVE_MANAGEMENT"));
    var manager = new COSActor(company.email(), company.scope(), Set.of("REGISTRAR"));
    var field = new FieldInput("shirt_size", "Shirt size", "text", false);
    var add =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "EMPLOYEE_MANAGEMENT", "FIELD_ADD", field, "Track issued uniforms", 1));
    commerce.reviewConfiguration(
        operator,
        UUID.fromString(add.request_id()),
        new Review("APPROVE", "Reviewed employee field"));
    var shared =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "LEAVE_MANAGEMENT",
                "FIELD_ADD",
                new FieldInput("shirt_size", "Kitchen size", "text", false),
                "Reuse the shared definition with a service label",
                1));
    commerce.reviewConfiguration(
        operator,
        UUID.fromString(shared.request_id()),
        new Review("APPROVE", "Reviewed service-specific label"));
    var change =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "EMPLOYEE_MANAGEMENT",
                "FIELD_UPDATE",
                new FieldInput("shirt_size", "Shirt fit", "text", false),
                "Clarify the uniform label",
                2));
    assertThat(configs.active(company.scope()).metadata().fields())
        .anyMatch(f -> f.id().equals("shirt_size") && f.label().equals("Shirt size"));
    commerce.reviewConfiguration(
        operator,
        UUID.fromString(change.request_id()),
        new Review("APPROVE", "Reviewed immutable identifier and type"));
    assertThat(configs.active(company.scope()).metadata().fields())
        .anyMatch(f -> f.id().equals("shirt_size") && f.label().equals("Shirt fit"));
    assertThat(commerce.workspace(manager).schemas())
        .anyMatch(
            s ->
                s.service_code().equals("LEAVE_MANAGEMENT")
                    && s.fields().stream().anyMatch(f -> f.label().equals("Kitchen size")));
    assertThatThrownBy(
            () ->
                commerce.submitConfiguration(
                    manager,
                    new ConfigurationSubmit(
                        "EMPLOYEE_MANAGEMENT",
                        "FIELD_UPDATE",
                        new FieldInput("shirt_size", "Changed", "text", false),
                        "Stale schema attempt",
                        2)))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("SCHEMA_VERSION_CONFLICT");
    assertThatThrownBy(
            () ->
                commerce.submitConfiguration(
                    manager,
                    new ConfigurationSubmit(
                        "EMPLOYEE_MANAGEMENT",
                        "FIELD_UPDATE",
                        new FieldInput("shirt_size", "Changed", "text", true),
                        "Storage change requires migration",
                        3)))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("FIELD_SENSITIVITY_MIGRATION_REQUIRED");
    var pending =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "EMPLOYEE_MANAGEMENT",
                "FIELD_UPDATE",
                new FieldInput("shirt_size", "Employee size", "text", false),
                "Pending label change",
                3));
    var intervening =
        commerce.submitConfiguration(
            manager,
            new ConfigurationSubmit(
                "EMPLOYEE_MANAGEMENT",
                "FIELD_ADD",
                new FieldInput("shift_tag", "Shift tag", "text", false),
                "Another approved configuration",
                3));
    commerce.reviewConfiguration(
        operator,
        UUID.fromString(intervening.request_id()),
        new Review("APPROVE", "Reviewed intervening field"));
    assertThatThrownBy(
            () ->
                commerce.reviewConfiguration(
                    operator,
                    UUID.fromString(pending.request_id()),
                    new Review("APPROVE", "Stale approval attempt")))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("SCHEMA_VERSION_CONFLICT");
  }

  @Test
  void publicContractDoesNotExposeSecretsOrArchitecture() throws Exception {
    mvc.perform(get("/api/v1/cos/services/catalog"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.services[0].price_minor").isNumber())
        .andExpect(jsonPath("$.pricing_status").value("DEVELOPMENT_REFERENCE"));
    mvc.perform(get("/api/v1/cos/platform/overview")).andExpect(status().isUnauthorized());
    var response =
        mvc.perform(
                post("/api/v1/cos/companies/register")
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        json.write(
                            new Register(
                                "Synthetic API Company",
                                "api-" + UUID.randomUUID() + "@example.test",
                                "integration-test-password",
                                List.of("EMPLOYEE_MANAGEMENT")))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.registration_token").isString())
            .andReturn();
    assertThat(response.getResponse().getContentAsString())
        .doesNotContain("password", "github", "api_prefixes", "token_digest");
  }

  private String reviewResult(String payment) {
    try {
      return commerce
          .reviewPayment(
              operator,
              UUID.fromString(payment),
              new Review("APPROVE", "Verified synthetic concurrent transfer"))
          .status();
    } catch (COSError error) {
      return error.code;
    }
  }

  private RegistrationView register(List<String> services) {
    return commerce.register(
        new Register(
            "Synthetic Company " + UUID.randomUUID().toString().substring(0, 8),
            "company-" + UUID.randomUUID() + "@example.test",
            "integration-test-password",
            services));
  }

  private PaymentView declare(RegistrationView company) {
    return commerce.declarePayment(
        UUID.fromString(company.company_id()),
        new PaymentDeclaration(company.registration_token(), "SYNTHETIC-" + UUID.randomUUID()));
  }

  private CommerceRepository.CompanyRow activate(List<String> services) {
    var company = register(services);
    var payment = declare(company);
    commerce.reviewPayment(
        operator,
        UUID.fromString(payment.payment_id()),
        new Review("APPROVE", "Verified synthetic test transfer"));
    return repository.company(UUID.fromString(company.company_id()), false);
  }

  private Cookie login(String email) throws Exception {
    var result =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", email)
                    .param("password", "integration-test-password"))
            .andExpect(status().isNoContent())
            .andReturn();
    String value =
        result.getResponse().getHeaders("Set-Cookie").stream()
            .filter(s -> s.startsWith("COS_ACCESS="))
            .findFirst()
            .orElseThrow();
    return new Cookie("COS_ACCESS", value.substring("COS_ACCESS=".length()).split(";", 2)[0]);
  }
}
