package com.cos.hrms.emp;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cos.shared.*;
import com.cos.shared.metadata.*;
import com.cos.shared.req.*;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts.*;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@SpringBootTest(
    properties = {
      "cos.scope-id=TEST",
      "cos.id-prefix=TEST-",
      "cos.manual-id-pattern=[A-Za-z0-9][A-Za-z0-9_-]{0,63}",
      "cos.worker-enabled=false",
      "cos.registrar-password=integration-test-password",
      "cos.admin-password=integration-test-password",
      "cos.reviewer-password=integration-test-password",
      "cos.viewer-password=integration-test-password"
    })
@ActiveProfiles("test")
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class COSWorkflowTest {
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

  @Autowired com.cos.shared.account.COSAccountService accounts;
  @Autowired COSMetadataService metadata;
  @Autowired COSMetadataRepository configs;
  @Autowired COSRequestService requests;
  @Autowired COSExecutionService executor;
  @Autowired COSImportService imports;
  @Autowired COSEmployeeService employees;
  @Autowired COSFavoriteService favorites;
  @Autowired COSCrypto crypto;
  @Autowired COSJson json;
  @Autowired JdbcClient jdbc;
  @Autowired MockMvc mvc;
  final COSActor registrar = new COSActor("registrar", "TEST", Set.of("REGISTRAR"));
  final COSActor admin = new COSActor("admin", "TEST", Set.of("ADMIN"));
  final COSActor reviewer = new COSActor("reviewer", "TEST", Set.of("ADMIN"));
  final COSActor viewer = new COSActor("viewer", "TEST", Set.of("VIEWER"));

  @BeforeAll
  void seed() {
    metadata.seedLocal("TEST");
  }

  ObjectNode row() {
    String nonce = UUID.randomUUID().toString();
    var choices = configs.choices("TEST");
    return (ObjectNode)
        json.tree(
            Map.of(
                "employee_name",
                "Synthetic " + nonce,
                "father_name",
                "Test Parent",
                "empid_entry_mode",
                "AUTO",
                "nationality_id",
                choices.stream()
                    .filter(c -> c.category().equals("NATIONALITY"))
                    .findFirst()
                    .orElseThrow()
                    .id(),
                "national_id_type_id",
                choices.stream()
                    .filter(c -> c.category().equals("ID_TYPE"))
                    .findFirst()
                    .orElseThrow()
                    .id(),
                "id_number",
                "TEST-" + nonce,
                "custom_fields",
                Map.of("dob", "2000-02-29")));
  }

  CommonRequest dto(String operation, JsonNode payload) {
    return new CommonRequest(
        "EMP_Reg", operation, configs.active("TEST").metadata().version(), payload);
  }

  RequestView submit(ObjectNode row) {
    return requests.submit(registrar, dto("REGISTER", row), UUID.randomUUID().toString());
  }

  UUID id(RequestView r) {
    return UUID.fromString(r.request_id());
  }

  void approve(RequestView r) {
    requests.decide(admin, id(r), new Approval(1, "APPROVE", "Verified synthetic input"));
  }

  UUID finish(RequestView r) {
    approve(r);
    executor.execute(id(r), "TEST");
    return UUID.fromString(
        requests.get(registrar, id(r)).result().path("employee_keys").get(0).asText());
  }

  long count(String table, UUID request) {
    return jdbc.sql("SELECT count(*) FROM " + table + " WHERE request_id=:id")
        .param("id", request)
        .query(Long.class)
        .single();
  }

  @Test
  void signupRequiresAdminApprovalAndThenAuthenticatesWithAssignedRole() throws Exception {
    String email = "member-" + UUID.randomUUID() + "@example.test";
    String password = "synthetic-test-passphrase";
    var signup = Map.of("full_name", "Synthetic Member", "email", email, "password", password);
    mvc.perform(
            post("/api/v1/cos/auth/sign-up")
                .with(csrf())
                .contentType("application/json")
                .content(json.write(signup)))
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.status").value("PENDING"));
    mvc.perform(
            post("/api/v1/cos/login")
                .with(csrf())
                .param("username", email)
                .param("password", password))
        .andExpect(status().isUnauthorized());
    var pending =
        accounts.pending(admin).stream()
            .filter(a -> a.email().equals(email))
            .findFirst()
            .orElseThrow();
    String stored =
        jdbc.sql("SELECT password_hash FROM auth.account WHERE account_id=:id")
            .param("id", UUID.fromString(pending.account_id()))
            .query(String.class)
            .single();
    assertThat(stored).startsWith("$2").doesNotContain(password);
    assertThatThrownBy(() -> accounts.pending(viewer)).isInstanceOf(COSError.class);
    assertThatThrownBy(
            () ->
                accounts.review(
                    registrar,
                    UUID.fromString(pending.account_id()),
                    new com.cos.shared.account.COSAccountService.Review(
                        "APPROVE", "REGISTRAR", "")))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(
            () ->
                accounts.review(
                    admin,
                    UUID.fromString(pending.account_id()),
                    new com.cos.shared.account.COSAccountService.Review("APPROVE", "ADMIN", "")))
        .isInstanceOf(COSError.class);
    accounts.review(
        admin,
        UUID.fromString(pending.account_id()),
        new com.cos.shared.account.COSAccountService.Review(
            "APPROVE", "REGISTRAR", "Verified test identity"));
    var signedIn =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", email.toUpperCase(Locale.ROOT))
                    .param("password", password))
            .andExpect(status().isNoContent())
            .andReturn();
    mvc.perform(get("/api/v1/cos/session").cookie(accessCookie(signedIn)))
        .andExpect(jsonPath("$.roles").value(org.hamcrest.Matchers.hasItem("REGISTRAR")));
    assertThat(accounts.pending(admin)).noneMatch(a -> a.email().equals(email));
    assertThatThrownBy(
            () ->
                accounts.review(
                    admin,
                    UUID.fromString(pending.account_id()),
                    new com.cos.shared.account.COSAccountService.Review("APPROVE", "VIEWER", "")))
        .isInstanceOf(COSError.class);
  }

  @Test
  void signupRejectsWeakPasswordsAndPrivilegeInjectionWithoutLeakingDuplicates() throws Exception {
    String email = "duplicate-" + UUID.randomUUID() + "@example.test";
    var input =
        Map.of(
            "full_name", "Synthetic User", "email", email, "password", "synthetic-test-passphrase");
    mvc.perform(
            post("/api/v1/cos/auth/sign-up")
                .contentType("application/json")
                .content(json.write(input)))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/v1/cos/auth/sign-up")
                .with(csrf())
                .contentType("application/json")
                .content(
                    json.write(Map.of("full_name", "Test", "email", email, "password", "short"))))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/cos/auth/sign-up")
                .with(csrf())
                .contentType("application/json")
                .content(
                    json.write(
                        Map.of(
                            "full_name",
                            "Test",
                            "email",
                            email,
                            "password",
                            "synthetic-test-passphrase",
                            "role",
                            "ADMIN"))))
        .andExpect(status().isBadRequest());
    var first =
        mvc.perform(
                post("/api/v1/cos/auth/sign-up")
                    .with(csrf())
                    .contentType("application/json")
                    .content(json.write(input)))
            .andExpect(status().isAccepted())
            .andReturn()
            .getResponse()
            .getContentAsString();
    var second =
        mvc.perform(
                post("/api/v1/cos/auth/sign-up")
                    .with(csrf())
                    .contentType("application/json")
                    .content(json.write(input)))
            .andExpect(status().isAccepted())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(first).isEqualTo(second);
    assertThat(accounts.pending(admin).stream().filter(a -> a.email().equals(email)).count())
        .isEqualTo(1);
    var pending =
        accounts.pending(admin).stream()
            .filter(a -> a.email().equals(email))
            .findFirst()
            .orElseThrow();
    accounts.review(
        admin,
        UUID.fromString(pending.account_id()),
        new com.cos.shared.account.COSAccountService.Review("REJECT", null, "Not a team member"));
    mvc.perform(
            post("/api/v1/cos/login")
                .with(csrf())
                .param("username", email)
                .param("password", "synthetic-test-passphrase"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void actualPasswordLoginEstablishesAccessCookieAndLogoutRevokesIt() throws Exception {
    var result =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", "registrar")
                    .param("password", "integration-test-password"))
            .andExpect(status().isNoContent())
            .andReturn();
    var access = accessCookie(result);
    mvc.perform(get("/api/v1/cos/session").cookie(access))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.authenticated").value(true));
    mvc.perform(post("/api/v1/cos/logout").cookie(access).with(csrf()))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/v1/cos/session").cookie(access)).andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/v1/cos/login")
                .with(csrf())
                .param("username", "registrar")
                .param("password", "invalid-test-password"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void browserCorsAllowsConfiguredOriginAndRejectsUnknownOrigins() throws Exception {
    mvc.perform(get("/api/v1/cos/csrf").header("Origin", "http://127.0.0.1:3001"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:3001"));
    mvc.perform(
            options("/api/v1/cos/requests")
                .header("Origin", "http://127.0.0.1:3001")
                .header("Access-Control-Request-Method", "POST")
                .header(
                    "Access-Control-Request-Headers", "content-type,x-csrf-token,idempotency-key"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/cos/csrf").header("Origin", "https://untrusted.invalid"))
        .andExpect(status().isForbidden());
  }

  @Test
  void authenticationCsrfAndRolesAreEnforced() throws Exception {
    mvc.perform(get("/api/v1/cos/employees")).andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("registrar").roles("REGISTRAR"))
                .contentType("application/json")
                .content(json.write(dto("REGISTER", row()))))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("viewer").roles("VIEWER"))
                .with(csrf())
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json")
                .content(json.write(dto("REGISTER", row()))))
        .andExpect(status().isForbidden());
  }

  @Test
  void submissionApprovalExecutionAreDistinctAndIdempotent() {
    var r = submit(row());
    assertThat(r.status()).isEqualTo("PENDING_APPROVAL");
    assertThat(count("integration.request_result", id(r))).isZero();
    approve(r);
    assertThat(requests.get(registrar, id(r)).status()).isEqualTo("APPROVED");
    assertThat(count("integration.request_result", id(r))).isZero();
    executor.execute(id(r), "TEST");
    executor.execute(id(r), "TEST");
    assertThat(requests.get(registrar, id(r)).status()).isEqualTo("COMPLETED");
    assertThat(count("integration.request_result", id(r))).isEqualTo(1);
    assertThat(count("integration.outbox_event", id(r))).isEqualTo(1);
    assertThat(requests.get(registrar, id(r)).payload().path("id_number").asText()).startsWith("•");
  }

  @Test
  void sameKeyReplaysAndDifferentCaseConflicts() {
    var payload = row();
    var key = UUID.randomUUID().toString();
    var input = dto("REGISTER", payload);
    var first = requests.submit(registrar, input, key);
    assertThat(requests.submit(registrar, input, key).request_id()).isEqualTo(first.request_id());
    payload.put("employee_name", payload.path("employee_name").asText().toUpperCase(Locale.ROOT));
    assertThatThrownBy(() -> requests.submit(registrar, dto("REGISTER", payload), key))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("different request content");
  }

  @Test
  void concurrentRetriesCreateOneRequest() throws Exception {
    var input = dto("REGISTER", row());
    String key = UUID.randomUUID().toString();
    try (var pool = Executors.newFixedThreadPool(4)) {
      List<Callable<String>> tasks = new ArrayList<>();
      for (int n = 0; n < 4; n++)
        tasks.add(() -> requests.submit(registrar, input, key).request_id());
      var results = pool.invokeAll(tasks);
      Set<String> ids = new HashSet<>();
      for (var f : results) ids.add(f.get());
      assertThat(ids).hasSize(1);
    }
  }

  @Test
  void autoIdsAllocateOnlyAtExecutionAndManualZerosSurvive() {
    var auto = submit(row());
    assertThat(auto.payload().has("sys_emp_id")).isFalse();
    UUID autoKey = finish(auto);
    assertThat(employees.details(registrar, autoKey, false).sys_emp_id()).startsWith("TEST-");
    var manual = row();
    String manualId = "000" + UUID.randomUUID().toString().substring(0, 8);
    manual.put("empid_entry_mode", "MANUAL");
    manual.put("sys_emp_id", manualId);
    UUID key = finish(submit(manual));
    assertThat(employees.details(registrar, key, false).sys_emp_id()).isEqualTo(manualId);
    var invalid = row();
    invalid.put("sys_emp_id", "HIDDEN");
    assertThatThrownBy(() -> submit(invalid)).isInstanceOf(COSError.class);
  }

  @Test
  void selfApprovalVersionsAndRequestOwnershipAreEnforced() {
    var config =
        requests.submit(
            admin,
            dto(
                "CONFIGURATION",
                json.tree(Map.of("fields", configs.active("TEST").metadata().fields()))),
            UUID.randomUUID().toString());
    assertThatThrownBy(() -> requests.decide(admin, id(config), new Approval(1, "APPROVE", "")))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("different administrator");
    var r = submit(row());
    assertThatThrownBy(() -> requests.decide(admin, id(r), new Approval(2, "APPROVE", "")))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> requests.get(viewer, id(r))).isInstanceOf(COSError.class);
    assertThatThrownBy(() -> requests.decide(admin, id(r), new Approval(1, "REJECT", "")))
        .isInstanceOf(COSError.class);
    requests.decide(admin, id(r), new Approval(1, "REJECT", "Test rejection"));
    assertThat(requests.get(registrar, id(r)).status()).isEqualTo("REJECTED");
  }

  @Test
  void identifiersAreEncryptedAndShortMasksDoNotDisclose() {
    var p = row();
    p.put("id_number", "123");
    p.put("father_name", UUID.randomUUID().toString());
    UUID key = finish(submit(p));
    assertThat(employees.details(viewer, key, false).id_number()).isEqualTo("••••");
    assertThatThrownBy(() -> employees.details(viewer, key, true)).isInstanceOf(COSError.class);
    String stored =
        jdbc.sql("SELECT id_number_ciphertext FROM core.employee_identity WHERE employee_key=:key")
            .param("key", key)
            .query(String.class)
            .single();
    assertThat(stored).startsWith("v1.").doesNotContain("123");
    assertThat(crypto.fingerprint("TEST", "Parent", "India", "Passport", " abc "))
        .isEqualTo(crypto.fingerprint("TEST", "parent", "India", "Passport", "ABC"));
  }

  @Test
  void duplicateCompositeIdentityIsRejected() {
    var p = row();
    finish(submit(p));
    assertThatThrownBy(() -> submit(p))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("already exists");
  }

  @Test
  void updateUsesOptimisticVersionAndPreservesIdentifier() {
    var p = row();
    UUID key = finish(submit(p));
    var current = employees.details(registrar, key, false);
    p.put("empid_entry_mode", "MANUAL");
    p.put("sys_emp_id", current.sys_emp_id());
    p.remove("id_number");
    p.put("employee_name", "Changed synthetic name");
    var payload = json.tree(Map.of("employee_key", key, "record_version", 1, "employee", p));
    var r = requests.submit(registrar, dto("UPDATE", payload), UUID.randomUUID().toString());
    finish(r);
    assertThat(employees.details(registrar, key, false).record_version()).isEqualTo(2);
    assertThatThrownBy(
            () -> requests.submit(registrar, dto("UPDATE", payload), UUID.randomUUID().toString()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void bulkPreviewPinsProvenanceAndDetectsDuplicateRows() {
    var p = row();
    var bad =
        imports.preview(
            registrar,
            new ImportPreview(
                1,
                "a".repeat(64),
                "synthetic.csv",
                Map.of("Employee", "employee_name"),
                List.of(p, p)));
    assertThat(bad.error_count()).isPositive();
    var preview =
        imports.preview(
            registrar,
            new ImportPreview(
                1,
                "b".repeat(64),
                "synthetic.csv",
                Map.of("Employee", "employee_name"),
                List.of(row(), row())));
    assertThat(preview.error_count()).isZero();
    var r =
        requests.submit(
            registrar,
            dto(
                "BULK_REGISTER",
                json.tree(
                    Map.of(
                        "preview_id",
                        preview.preview_id(),
                        "source_version",
                        preview.source_version()))),
            UUID.randomUUID().toString());
    assertThat(r.payload().has("rows")).isFalse();
    assertThat(r.items()).hasSize(2);
    approve(r);
    executor.execute(id(r), "TEST");
    assertThat(requests.get(registrar, id(r)).result().path("employee_keys").size()).isEqualTo(2);
    assertThatThrownBy(
            () ->
                requests.submit(
                    registrar,
                    dto(
                        "BULK_REGISTER",
                        json.tree(
                            Map.of(
                                "preview_id",
                                preview.preview_id(),
                                "source_version",
                                preview.source_version()))),
                    UUID.randomUUID().toString()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void failuresRollBackEmployeesResultsAndOutboxThenRetrySafely() {
    var p = row();
    var r = submit(p);
    approve(r);
    jdbc.sql(
            "CREATE FUNCTION integration.test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS"
                + " 'BEGIN RAISE EXCEPTION ''injected test fault''; END'")
        .update();
    jdbc.sql(
            "CREATE TRIGGER test_outbox_failure BEFORE INSERT ON integration.outbox_event FOR EACH"
                + " ROW EXECUTE FUNCTION integration.test_fail_outbox()")
        .update();
    try {
      assertThatThrownBy(() -> executor.execute(id(r), "TEST"))
          .isInstanceOf(RuntimeException.class);
      assertThat(count("integration.request_result", id(r))).isZero();
      assertThat(count("integration.outbox_event", id(r))).isZero();
      assertThat(requests.get(registrar, id(r)).status()).isEqualTo("APPROVED");
      assertThat(employees.list(registrar, p.path("employee_name").asText(), null, 10).items())
          .isEmpty();
    } finally {
      jdbc.sql("DROP TRIGGER test_outbox_failure ON integration.outbox_event").update();
      jdbc.sql("DROP FUNCTION integration.test_fail_outbox()").update();
    }
    executor.failed(id(r), "TEST", "EXECUTION_FAILED");
    assertThat(requests.get(registrar, id(r)).status()).isEqualTo("FAILED");
    requests.retry(admin, id(r), 1);
    executor.execute(id(r), "TEST");
    assertThat(requests.get(registrar, id(r)).status()).isEqualTo("COMPLETED");
  }

  @Test
  void favoritesPersistPerPrincipalAndScopeIsolated() {
    favorites.set(registrar, "EMP_Details", true);
    assertThat(favorites.list(registrar)).contains("EMP_Details");
    assertThat(favorites.list(viewer)).doesNotContain("EMP_Details");
    var other = new COSActor("registrar", "OTHER_SCOPE", Set.of("REGISTRAR"));
    assertThat(employees.list(other, "", null, 10).items()).isEmpty();
  }

  @Test
  void versionedConfigurationPublishesOnlyAfterSeparateApproval() {
    String scope = "CONFIG_TEST";
    metadata.seedLocal(scope);
    var author = new COSActor("admin", scope, Set.of("ADMIN"));
    var approver = new COSActor("reviewer", scope, Set.of("ADMIN"));
    var fields = new ArrayList<>(configs.active(scope).metadata().fields());
    var dob = fields.getFirst();
    fields.set(
        0,
        new Field(
            dob.id(),
            dob.field_id(),
            dob.label(),
            dob.type(),
            true,
            true,
            false,
            List.of("ADMIN"),
            List.of("REGISTRAR"),
            false,
            0,
            "additional",
            500));
    var r =
        requests.submit(
            author,
            new CommonRequest("EMP_Reg", "CONFIGURATION", 1, json.tree(Map.of("fields", fields))),
            UUID.randomUUID().toString());
    assertThat(configs.active(scope).metadata().version()).isEqualTo(1);
    requests.decide(approver, id(r), new Approval(1, "APPROVE", "Test policy change"));
    executor.execute(id(r), scope);
    assertThat(configs.active(scope).metadata().version()).isEqualTo(2);
    assertThat(configs.active(scope).metadata().fields().getFirst().read_roles())
        .containsExactly("ADMIN");
    assertThatThrownBy(
            () ->
                requests.submit(
                    new COSActor("registrar", scope, Set.of("REGISTRAR")),
                    new CommonRequest("EMP_Reg", "REGISTER", 1, row()),
                    UUID.randomUUID().toString()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void parallelExecutionAllocatesDistinctIds() throws Exception {
    var a = submit(row());
    var b = submit(row());
    approve(a);
    approve(b);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var first = pool.submit(() -> executor.execute(id(a), "TEST"));
      var second = pool.submit(() -> executor.execute(id(b), "TEST"));
      first.get();
      second.get();
    }
    assertThat(requests.get(registrar, id(a)).result().path("employee_keys").get(0).asText())
        .isNotEqualTo(
            requests.get(registrar, id(b)).result().path("employee_keys").get(0).asText());
    var ids =
        jdbc.sql("SELECT sys_emp_id FROM core.employee_identity WHERE scope_id='TEST'")
            .query(String.class)
            .list();
    assertThat(new HashSet<>(ids)).hasSize(ids.size());
  }

  @Test
  void submittedSnapshotsAreImmutableInDatabase() {
    var r = submit(row());
    assertThatThrownBy(
            () ->
                jdbc.sql("UPDATE integration.request SET request_version=2 WHERE request_id=:id")
                    .param("id", id(r))
                    .update())
        .isInstanceOf(RuntimeException.class);
    assertThat(requests.get(registrar, id(r)).request_version()).isEqualTo(1);
  }

  @Test
  void oversizedJsonIsRejectedBeforeParsing() throws Exception {
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("registrar").roles("REGISTRAR"))
                .with(csrf())
                .contentType("application/json")
                .content("x".repeat(1_048_577)))
        .andExpect(status().isPayloadTooLarge());
  }

  @Test
  void unknownPropertiesAndStaleConfigurationAreRejected() throws Exception {
    var p = row();
    p.put("unregistered", "value");
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("registrar").roles("REGISTRAR"))
                .with(csrf())
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json")
                .content(json.write(dto("REGISTER", p))))
        .andExpect(status().isGone());
    assertThatThrownBy(
            () ->
                requests.submit(
                    registrar,
                    new CommonRequest("EMP_Reg", "REGISTER", 999, row()),
                    UUID.randomUUID().toString()))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("Configuration changed");
  }

  @Test
  void malformedConfigurationReturnsValidationErrorsWithoutCreatingRequests() throws Exception {
    var base = (ObjectNode) json.tree(Map.of("fields", configs.active("TEST").metadata().fields()));
    var cases = new ArrayList<JsonNode>();
    cases.add(json.tree(List.of()));
    for (String type : List.of("null", "123", "{}")) {
      var bad = base.deepCopy();
      ((ObjectNode) bad.path("fields").get(0)).set("type", json.read(type, JsonNode.class));
      cases.add(bad);
    }
    var nullRole = base.deepCopy();
    ((ObjectNode) nullRole.path("fields").get(0))
        .set("read_roles", json.read("[null]", JsonNode.class));
    cases.add(nullRole);
    for (String modes : List.of("null", "{}", "123", "[null]", "[\"AUTO\",\"AUTO\"]")) {
      var bad = base.deepCopy();
      bad.set("allowed_modes", json.read(modes, JsonNode.class));
      cases.add(bad);
    }
    var unknown = base.deepCopy();
    ((ObjectNode) unknown.path("fields").get(0)).put("unknown_property", true);
    cases.add(unknown);
    for (JsonNode payload : cases) {
      mvc.perform(
              post("/api/v1/cos/requests")
                  .with(user("registrar").roles("REGISTRAR"))
                  .with(csrf())
                  .header("Idempotency-Key", UUID.randomUUID())
                  .contentType("application/json")
                  .content(json.write(dto("CONFIGURATION", payload))))
          .andExpect(status().isUnprocessableEntity());
    }
  }

  @Test
  void numericManualIdsAreRejectedInsteadOfBeingCoercedToText() throws Exception {
    var input = row();
    input.put("empid_entry_mode", "MANUAL");
    input.put("sys_emp_id", 1234567);
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("registrar").roles("REGISTRAR"))
                .with(csrf())
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json")
                .content(json.write(dto("REGISTER", input))))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.error_code").value("LEGACY_WORKFLOW_RETIRED"));
    assertThatThrownBy(() -> submit(input)).isInstanceOf(COSError.class);
  }

  @Test
  void csrfFailureIsDistinctFromAnAuthorizedRequestDeniedByRole() throws Exception {
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("registrar").roles("REGISTRAR"))
                .with(csrf().useInvalidToken())
                .contentType("application/json")
                .content(json.write(dto("REGISTER", row()))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("CSRF_INVALID"));
    mvc.perform(
            post("/api/v1/cos/requests")
                .with(user("viewer").roles("VIEWER"))
                .with(csrf())
                .header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json")
                .content(json.write(dto("REGISTER", row()))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error_code").value("FORBIDDEN"));
  }

  private jakarta.servlet.http.Cookie accessCookie(
      org.springframework.test.web.servlet.MvcResult result) {
    String header =
        result.getResponse().getHeaders("Set-Cookie").stream()
            .filter(value -> value.startsWith("COS_ACCESS="))
            .findFirst()
            .orElseThrow();
    return new jakarta.servlet.http.Cookie(
        "COS_ACCESS", header.substring("COS_ACCESS=".length(), header.indexOf(';')));
  }
}
