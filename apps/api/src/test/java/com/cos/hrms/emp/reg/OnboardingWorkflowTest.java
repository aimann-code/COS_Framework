package com.cos.hrms.emp.reg;

import static com.cos.hrms.emp.OnboardingContracts.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cos.hrms.emp.ConfigurationWorkflowService;
import com.cos.hrms.emp.doc.OnboardingDocumentService;
import com.cos.hrms.emp.doc.OnboardingImagePolicy;
import com.cos.hrms.emp.reg.OnboardingAccountService;
import com.cos.hrms.emp.reg.OnboardingService;
import com.cos.shared.*;
import com.cos.shared.account.*;
import com.cos.shared.metadata.*;
import com.cos.shared.security.COSActor;
import com.cos.shared.web.COSContracts;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;
import javax.imageio.ImageIO;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "cos.scope-id=TEST",
      "cos.id-prefix=TEST-",
      "cos.manual-id-pattern=[A-Za-z0-9_-]{1,64}",
      "cos.worker-enabled=false",
      "cos.registrar-password=integration-test-password",
      "cos.admin-password=integration-test-password",
      "cos.reviewer-password=integration-test-password",
      "cos.viewer-password=integration-test-password",
      "cos.mail.domain=example.mhl.test"
    })
@ActiveProfiles("test")
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OnboardingWorkflowTest {
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

  @Autowired OnboardingService service;
  @Autowired OnboardingDocumentService documents;
  @Autowired OnboardingImagePolicy images;
  @Autowired OnboardingAccountService access;
  @Autowired COSAccountService accounts;
  @Autowired COSMetadataService metadata;
  @Autowired COSMetadataRepository configs;
  @Autowired ConfigurationWorkflowService configuration;
  @Autowired JdbcClient jdbc;
  @Autowired COSJson json;
  @Autowired MockMvc mvc;
  final COSActor hr = new COSActor("registrar", "TEST", Set.of("REGISTRAR"));
  final COSActor admin = new COSActor("admin", "TEST", Set.of("ADMIN"));
  final COSActor otherHR = new COSActor("other-hr", "TEST", Set.of("REGISTRAR"));

  @BeforeAll
  void seed() {
    metadata.seedLocal("TEST");
    metadata.seedLocal("TENANT_B");
  }

  Profile sample() {
    return new Profile(
        Map.of(
            "name",
            "Synthetic " + UUID.randomUUID(),
            "joiner",
            "New joiner",
            "joining",
            "2026-01-10",
            "phone",
            "+91 00000 00000",
            "basic_salary",
            "20000",
            "pay_currency",
            "INR",
            "account_number",
            "000012345678"),
        Map.of(),
        false);
  }

  Profile with(Profile p, String key, String value) {
    var v = new HashMap<>(p.values());
    v.put(key, value);
    return new Profile(v, p.groups(), p.same_address());
  }

  DraftView save(COSActor actor, Profile p) {
    return service.save(
        actor,
        UUID.randomUUID(),
        new SaveDraft(0, configs.active(actor.scope()).metadata().version(), p));
  }

  EmployeeView register(Profile p) {
    var d = save(hr, p);
    return service.register(
        hr,
        UUID.fromString(d.draft_id()),
        service.getDraft(hr, UUID.fromString(d.draft_id())).version());
  }

  COSActor linked(EmployeeView e) {
    String email = "synthetic-" + UUID.randomUUID() + "@example.test";
    accounts.signup(
        new COSAccountService.Signup("Synthetic Member", email, "synthetic-test-passphrase"));
    var account =
        access.pending(hr).stream().filter(a -> a.email().equals(email)).findFirst().orElseThrow();
    access.review(
        hr,
        UUID.fromString(account.account_id()),
        new OnboardingAccountService.Review(
            "APPROVE", e.employee_code(), "Synthetic HR identity verification"));
    return new COSActor(email, "TEST", Set.of("EMPLOYEE"));
  }

  MockMultipartFile photo() throws Exception {
    var output = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", output);
    return new MockMultipartFile("file", "synthetic.png", "image/png", output.toByteArray());
  }

  @Test
  void hrEdit_preservesMaskedValues_commitsHistoryAndRejectsStaleOverwrite() {
    var e = register(sample());
    var employee = UUID.fromString(e.employee_id());
    var id = UUID.randomUUID();
    var d = service.startHREdit(hr, employee, id, e.version());
    assertThat(service.startHREdit(hr, employee, id, e.version()).draft_id())
        .isEqualTo(d.draft_id());
    var stale = service.startHREdit(otherHR, employee, UUID.randomUUID(), e.version());
    var updated =
        service.save(
            hr,
            id,
            new SaveDraft(
                d.version(),
                d.configuration_version(),
                with(with(d.profile(), "name", "Synthetic HR edited"), "basic_salary", "25000")));
    var saved = service.applyHREdit(hr, id, updated.version());
    assertThat(saved.display_name()).isEqualTo("Synthetic HR edited");
    assertThat(saved.profile().values().get("basic_salary")).isEqualTo("25000");
    assertThat(saved.profile().values().get("account_number"))
        .isEqualTo(e.profile().values().get("account_number"));
    assertThat(saved.version()).isEqualTo(e.version() + 1);
    assertThat(service.applyHREdit(hr, id, updated.version()).version()).isEqualTo(saved.version());
    assertThatThrownBy(
            () -> service.applyHREdit(otherHR, UUID.fromString(stale.draft_id()), stale.version()))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("changed");
    assertThat(
            jdbc.sql("SELECT count(*) FROM people.profile_history WHERE employee_id=:id")
                .param("id", employee)
                .query(Integer.class)
                .single())
        .isEqualTo(2);
  }

  @Test
  void hrEdit_rejectsEmployeeAdminOtherTenantAndJoiningHistoryChanges() {
    var e = register(sample());
    var employee = UUID.fromString(e.employee_id());
    var actor = linked(e);
    assertThatThrownBy(() -> service.startHREdit(admin, employee, UUID.randomUUID(), e.version()))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> service.startHREdit(actor, employee, UUID.randomUUID(), e.version()))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(
            () ->
                service.startHREdit(
                    new COSActor("hr", "TENANT_B", Set.of("REGISTRAR")),
                    employee,
                    UUID.randomUUID(),
                    e.version()))
        .isInstanceOf(COSError.class);
    var id = UUID.randomUUID();
    var d = service.startHREdit(hr, employee, id, e.version());
    var changed =
        service.save(
            hr,
            id,
            new SaveDraft(
                d.version(),
                d.configuration_version(),
                with(d.profile(), "joining", "2026-01-11")));
    assertThatThrownBy(() -> service.applyHREdit(hr, id, changed.version()))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("Joining history");
    assertThatThrownBy(() -> service.applyHREdit(otherHR, id, changed.version()))
        .isInstanceOf(COSError.class);
    assertThat(service.employee(hr, employee).version()).isEqualTo(e.version());
  }

  @Test
  void hrRegistrationIsDirectPersistentEncryptedAndReplaySafe() {
    long before =
        jdbc.sql("SELECT count(*) FROM integration.approval_event").query(Long.class).single();
    var p = sample();
    var d = save(hr, p);
    var employee =
        service.register(
            hr,
            UUID.fromString(d.draft_id()),
            service.getDraft(hr, UUID.fromString(d.draft_id())).version());
    var replay =
        service.register(
            hr,
            UUID.fromString(d.draft_id()),
            service.getDraft(hr, UUID.fromString(d.draft_id())).version());
    assertThat(replay.employee_id()).isEqualTo(employee.employee_id());
    assertThat(employee.version()).isEqualTo(1);
    assertThat(employee.profile().values().get("account_number")).isEqualTo("•••• 5678");
    assertThat(
            jdbc.sql("SELECT profile_encrypted FROM people.employee WHERE employee_id=:id")
                .param("id", UUID.fromString(employee.employee_id()))
                .query(String.class)
                .single())
        .startsWith("v1.")
        .doesNotContain(p.values().get("name"), "000012345678");
    assertThat(
            jdbc.sql("SELECT count(*) FROM people.outbox WHERE employee_id=:id")
                .param("id", UUID.fromString(employee.employee_id()))
                .query(Long.class)
                .single())
        .isEqualTo(2);
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM people.outbox WHERE employee_id=:id AND"
                        + " event_type='WORK_EMAIL_PROVISION'")
                .param("id", UUID.fromString(employee.employee_id()))
                .query(Long.class)
                .single())
        .isEqualTo(1);
    assertThat(
            jdbc.sql("SELECT count(*) FROM integration.approval_event").query(Long.class).single())
        .isEqualTo(before);
  }

  @Test
  void incompleteDraftsPersistButCannotRegisterAndVersionsPreventLostWrites() {
    var p = new Profile(Map.of("name", "Synthetic Draft"), Map.of(), false);
    var d = save(hr, p);
    UUID id = UUID.fromString(d.draft_id());
    assertThat(service.getDraft(hr, id).profile().values())
        .containsEntry("name", "Synthetic Draft");
    assertThatThrownBy(() -> service.register(hr, id, d.version())).isInstanceOf(COSError.class);
    service.save(hr, id, new SaveDraft(d.version(), d.configuration_version(), sample()));
    assertThatThrownBy(
            () ->
                service.save(
                    hr, id, new SaveDraft(d.version(), d.configuration_version(), sample())))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("draft changed");
  }

  @Test
  void anotherHrCannotReadOrChangeAnUnsubmittedDraft() {
    var d = save(hr, sample());
    assertThatThrownBy(() -> service.getDraft(otherHR, UUID.fromString(d.draft_id())))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> service.register(admin, UUID.fromString(d.draft_id()), d.version()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void companyBoundariesCoverDraftsProfilesAndDocuments() throws Exception {
    var d = save(hr, sample());
    var doc = documents.upload(hr, UUID.fromString(d.draft_id()), d.version(), "PAN", photo());
    var e =
        service.register(
            hr,
            UUID.fromString(d.draft_id()),
            service.getDraft(hr, UUID.fromString(d.draft_id())).version());
    var foreign = new COSActor("registrar", "TENANT_B", Set.of("REGISTRAR"));
    assertThatThrownBy(() -> service.employee(foreign, UUID.fromString(e.employee_id())))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> service.getDraft(foreign, UUID.fromString(d.draft_id())))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> documents.download(foreign, UUID.fromString(doc.document_id())))
        .isInstanceOf(COSError.class);
  }

  @Test
  void identifierRequiresPhotoAndStoredDocumentIsPrivateAndSanitized() throws Exception {
    var p = with(sample(), "aadhaar", "000000000000");
    var d = save(hr, p);
    UUID draft = UUID.fromString(d.draft_id());
    assertThatThrownBy(() -> service.register(hr, draft, service.getDraft(hr, draft).version()))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("photo");
    var doc = documents.upload(hr, draft, d.version(), "AADHAAR_FRONT", photo());
    assertThat(doc.scan_status()).isEqualTo("VALIDATED_LOCAL");
    assertThat(
            jdbc.sql("SELECT encrypted_content FROM people.document WHERE document_id=:id")
                .param("id", UUID.fromString(doc.document_id()))
                .query(String.class)
                .single())
        .startsWith("v1.");
    var e = service.register(hr, draft, service.getDraft(hr, draft).version());
    var employee = linked(e);
    assertThat(documents.download(employee, UUID.fromString(doc.document_id())).content())
        .startsWith((byte) 137, (byte) 80, (byte) 78, (byte) 71);
    assertThatThrownBy(() -> documents.download(admin, UUID.fromString(doc.document_id())))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> documents.upload(hr, draft, d.version(), "PAN", photo()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void malformedSpoofedAndOversizedFilesAreRejectedAndProductionFailsClosed() throws Exception {
    assertThatThrownBy(
            () ->
                images.validate(
                    new MockMultipartFile(
                        "file", "fake.png", "image/png", "<script>bad</script>".getBytes()),
                    true))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(
            () ->
                images.validate(
                    new MockMultipartFile("file", "scan.svg", "image/svg+xml", "<svg/>".getBytes()),
                    true))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(
            () ->
                images.validate(
                    new MockMultipartFile("file", "large.png", "image/png", new byte[5_242_881]),
                    true))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> images.validate(photo(), false))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("malware scanning");
  }

  @Test
  void employeeCannotRegisterBrowseOthersOrChangePay() {
    var e = register(sample());
    var actor = linked(e);
    var other = register(sample());
    assertThatThrownBy(() -> service.employee(actor, UUID.fromString(other.employee_id())))
        .isInstanceOf(COSError.class);
    assertThatThrownBy(() -> service.employees(actor, "", null, 20)).isInstanceOf(COSError.class);
    assertThatThrownBy(() -> save(actor, with(e.profile(), "basic_salary", "30000")))
        .isInstanceOf(COSError.class);
    var draft = save(actor, e.profile());
    assertThatThrownBy(
            () -> service.register(actor, UUID.fromString(draft.draft_id()), draft.version()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void employeeUpdateRequiresHrAndAppliesAtomicallyWithMaskedIdentifiersPreserved() {
    var e = register(sample());
    var actor = linked(e);
    var d = save(actor, with(e.profile(), "name", "Synthetic Changed Name"));
    var pending = service.submitUpdate(actor, UUID.fromString(d.draft_id()), d.version());
    assertThat(service.me(actor).display_name()).isEqualTo(e.display_name());
    assertThatThrownBy(
            () ->
                service.review(
                    admin,
                    UUID.fromString(d.draft_id()),
                    new Decision(pending.version(), "APPROVE", "")))
        .isInstanceOf(COSError.class);
    service.review(
        hr, UUID.fromString(d.draft_id()), new Decision(pending.version(), "APPROVE", "Verified"));
    var updated = service.me(actor);
    assertThat(updated.display_name()).isEqualTo("Synthetic Changed Name");
    assertThat(updated.version()).isEqualTo(2);
    assertThat(updated.profile().values().get("account_number")).isEqualTo("•••• 5678");
    assertThatThrownBy(
            () ->
                service.review(
                    hr,
                    UUID.fromString(d.draft_id()),
                    new Decision(pending.version(), "APPROVE", "")))
        .isInstanceOf(COSError.class);
  }

  @Test
  void staleEmployeeProposalCannotOverwriteAnApprovedChangeAndCanBeRejected() {
    var e = register(sample());
    var actor = linked(e);
    var a = save(actor, with(e.profile(), "local_city", "Synthetic First"));
    var b = save(actor, with(e.profile(), "local_city", "Synthetic Second"));
    var pendingA = service.submitUpdate(actor, UUID.fromString(a.draft_id()), a.version());
    var pendingB = service.submitUpdate(actor, UUID.fromString(b.draft_id()), b.version());
    service.review(
        hr, UUID.fromString(a.draft_id()), new Decision(pendingA.version(), "APPROVE", "Verified"));
    assertThatThrownBy(
            () ->
                service.review(
                    hr,
                    UUID.fromString(b.draft_id()),
                    new Decision(pendingB.version(), "APPROVE", "")))
        .isInstanceOf(COSError.class)
        .hasMessageContaining("employee changed");
    service.review(
        hr,
        UUID.fromString(b.draft_id()),
        new Decision(pendingB.version(), "REJECT", "Please resubmit against current profile"));
    assertThat(service.me(actor).profile().values().get("local_city")).isEqualTo("Synthetic First");
  }

  @Test
  void rejectionRequiresReasonAndLeavesEmployeeUnchanged() {
    var e = register(sample());
    var actor = linked(e);
    var d = save(actor, with(e.profile(), "name", "Synthetic Rejected"));
    var pending = service.submitUpdate(actor, UUID.fromString(d.draft_id()), d.version());
    assertThatThrownBy(
            () ->
                service.review(
                    hr,
                    UUID.fromString(d.draft_id()),
                    new Decision(pending.version(), "REJECT", "")))
        .isInstanceOf(COSError.class);
    service.review(
        hr,
        UUID.fromString(d.draft_id()),
        new Decision(pending.version(), "REJECT", "Identity could not be verified"));
    assertThat(service.me(actor).display_name()).isEqualTo(e.display_name());
  }

  @Test
  void duplicateIdentifiersRollBackRegistrationAndKeepDraftUsable() throws Exception {
    String pan = "ABCDE1234F";
    var d = save(hr, with(sample(), "pan", pan));
    documents.upload(hr, UUID.fromString(d.draft_id()), d.version(), "PAN", photo());
    service.register(
        hr,
        UUID.fromString(d.draft_id()),
        service.getDraft(hr, UUID.fromString(d.draft_id())).version());
    var duplicate = save(hr, with(sample(), "pan", pan));
    documents.upload(
        hr, UUID.fromString(duplicate.draft_id()), duplicate.version(), "PAN", photo());
    assertThatThrownBy(
            () ->
                service.register(
                    hr,
                    UUID.fromString(duplicate.draft_id()),
                    service.getDraft(hr, UUID.fromString(duplicate.draft_id())).version()))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThat(service.getDraft(hr, UUID.fromString(duplicate.draft_id())).status())
        .isEqualTo("DRAFT");
  }

  @Test
  void rejoiningPreservesEmployeeCodeAndHistory() {
    var e = register(sample());
    var p =
        with(
            with(with(sample(), "joiner", "Rejoiner"), "joining", "2026-05-01"),
            "previous_id",
            e.employee_code());
    var rejoined = register(p);
    assertThat(rejoined.employee_id()).isEqualTo(e.employee_id());
    assertThat(rejoined.employee_code()).isEqualTo(e.employee_code());
    assertThat(rejoined.version()).isEqualTo(2);
    assertThat(
            jdbc.sql("SELECT count(*) FROM people.employment_period WHERE employee_id=:id")
                .param("id", UUID.fromString(e.employee_id()))
                .query(Long.class)
                .single())
        .isEqualTo(2);
  }

  @Test
  void hrMustLinkEmployeeAccountAndAdminCannotActivateAccess() throws Exception {
    String email = "link-" + UUID.randomUUID() + "@example.test";
    accounts.signup(
        new COSAccountService.Signup("Synthetic Applicant", email, "synthetic-test-passphrase"));
    var a =
        access.pending(hr).stream().filter(x -> x.email().equals(email)).findFirst().orElseThrow();
    assertThatThrownBy(
            () ->
                access.review(
                    hr,
                    UUID.fromString(a.account_id()),
                    new OnboardingAccountService.Review("APPROVE", null, "")))
        .isInstanceOf(COSError.class);
    mvc.perform(
            post("/api/v1/cos/accounts/" + a.account_id() + "/review")
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(json.write(Map.of("decision", "REJECT", "remarks", "test"))))
        .andExpect(status().isForbidden());
    var e = register(sample());
    access.review(
        hr,
        UUID.fromString(a.account_id()),
        new OnboardingAccountService.Review("APPROVE", e.employee_code(), "Verified"));
    mvc.perform(
            post("/api/v1/cos/login")
                .with(csrf())
                .param("username", email)
                .param("password", "synthetic-test-passphrase"))
        .andExpect(status().isNoContent());
  }

  @Test
  void newConfigurationWorkflowIsHrProposalAndAdminApprovalOnly() {
    var fields = configs.active("TEST").metadata().fields();
    var command =
        new COSContracts.CommonRequest(
            "EMP_Reg",
            "CONFIGURATION",
            configs.active("TEST").metadata().version(),
            json.tree(Map.of("fields", fields)));
    assertThatThrownBy(() -> configuration.submit(admin, command, UUID.randomUUID().toString()))
        .isInstanceOf(COSError.class);
    var request = configuration.submit(hr, command, UUID.randomUUID().toString());
    assertThatThrownBy(
            () ->
                configuration.decide(
                    hr,
                    UUID.fromString(request.request_id()),
                    new COSContracts.Approval(1, "APPROVE", "")))
        .isInstanceOf(COSError.class);
    configuration.decide(
        admin,
        UUID.fromString(request.request_id()),
        new COSContracts.Approval(1, "REJECT", "Synthetic no-op proposal"));
  }

  @Test
  void httpRequiresAuthenticationCsrfAndStrictProfileShape() throws Exception {
    mvc.perform(get("/api/v1/cos/onboarding/employees")).andExpect(status().isUnauthorized());
    mvc.perform(
            put("/api/v1/cos/onboarding/drafts/" + UUID.randomUUID())
                .with(user("registrar").roles("REGISTRAR"))
                .contentType("application/json")
                .content(json.write(new SaveDraft(0, 1, sample()))))
        .andExpect(status().isForbidden());
    var wrong = with(sample(), "role", "ADMIN");
    assertThatThrownBy(() -> save(hr, wrong)).isInstanceOf(COSError.class);
  }

  @Test
  void workEmailSuffixWhenSameDisplayName() {
    String name = "Same Display";
    var first = register(with(sample(), "name", name));
    var second = register(with(sample(), "name", name));
    assertThat(first.work_email()).endsWith("@example.mhl.test");
    assertThat(second.work_email()).endsWith("@example.mhl.test");
    assertThat(second.work_email()).isNotEqualTo(first.work_email());
  }

  @Test
  void importedWorkEmailMustMatchCompanyDomain() {
    var draft =
        save(
            hr,
            with(
                with(sample(), "work_email_mode", "existing"),
                "work_email_existing",
                "person@wrong.test"));
    assertThatThrownBy(
            () ->
                service.register(
                    hr,
                    UUID.fromString(draft.draft_id()),
                    service.getDraft(hr, UUID.fromString(draft.draft_id())).version()))
        .isInstanceOf(COSError.class);
  }

  @Test
  void workEmailPreviewUsesDraftOverrides() {
    var draft = save(hr, with(sample(), "name", "Preview Person"));
    var preview =
        service.previewWorkEmail(
            hr, UUID.fromString(draft.draft_id()), "Collision Name", "generate", null);
    assertThat(preview.proposed_email()).isEqualTo("collision.name@example.mhl.test");
  }

  @Test
  void concurrentRegistrationRetriesCommitOneEmployee() throws Exception {
    var d = save(hr, sample());
    try (var pool = Executors.newFixedThreadPool(2)) {
      var a =
          pool.submit(
              () ->
                  service.register(
                      hr,
                      UUID.fromString(d.draft_id()),
                      service.getDraft(hr, UUID.fromString(d.draft_id())).version()));
      var b =
          pool.submit(
              () ->
                  service.register(
                      hr,
                      UUID.fromString(d.draft_id()),
                      service.getDraft(hr, UUID.fromString(d.draft_id())).version()));
      assertThat(a.get().employee_id()).isEqualTo(b.get().employee_id());
    }
  }
}
