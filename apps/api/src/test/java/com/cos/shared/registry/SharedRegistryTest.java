package com.cos.shared.registry;

import static com.cos.hrms.emp.OnboardingContracts.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cos.hrms.emp.reg.OnboardingService;
import com.cos.shared.COSError;
import com.cos.shared.metadata.COSMetadataRepository;
import com.cos.shared.metadata.COSMetadataService;
import com.cos.shared.security.COSActor;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
class SharedRegistryTest {
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

  @Autowired FieldRegistryService registry;
  @Autowired FieldValueService values;
  @Autowired IdentityLinkService identities;
  @Autowired SyncService sync;
  @Autowired ReportService reports;
  @Autowired OnboardingService onboarding;
  @Autowired COSMetadataService metadata;
  @Autowired COSMetadataRepository configs;
  @Autowired JdbcClient jdbc;
  @Autowired MockMvc mvc;

  final COSActor admin = new COSActor("admin", "TEST", Set.of("ADMIN"));
  final COSActor hr = new COSActor("registrar", "TEST", Set.of("REGISTRAR"));
  final COSActor viewer = new COSActor("viewer", "TEST", Set.of("VIEWER"));

  @BeforeAll
  void seed() {
    metadata.seedLocal("TEST");
  }

  @Test
  void registryReusesAFieldAndBlocksAnUnregisteredTable() {
    var seeded =
        registry.listFields(admin).stream()
            .filter(field -> field.technical_name().equals("aadhaar_number"))
            .findFirst()
            .orElseThrow();
    assertThat(seeded.sensitive()).isTrue();
    assertThat(seeded.data_type()).isEqualTo("text");

    var salary =
        registry.registerField(
            admin, new FieldRegistryService.FieldRegistration("basic_salary", "Basic salary", "number", false));
    var again =
        registry.registerField(
            admin, new FieldRegistryService.FieldRegistration("basic_salary", "Basic salary", "number", false));
    assertThat(again.field_id()).isEqualTo(salary.field_id());
    assertThatThrownBy(
            () ->
                registry.registerField(
                    admin,
                    new FieldRegistryService.FieldRegistration("basic_salary", "Basic salary", "text", false)))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("FIELD_TYPE_CONFLICT");
    assertThatThrownBy(
            () ->
                registry.registerField(
                    hr,
                    new FieldRegistryService.FieldRegistration("room_allowance", "Room allowance", "number", false)))
        .isInstanceOf(COSError.class)
        .extracting("status")
        .isEqualTo(403);

    var blocked =
        catchThrowable(
            () ->
                registry.registerTable(
                    admin,
                    new FieldRegistryService.TableRegistration(
                        "EMP_Banking_Details", "Banking", "EMPLOYEE", List.of("bank_account"))));
    assertThat(blocked).isInstanceOf(COSError.class);
    assertThat(((COSError) blocked).code).isEqualTo("TABLE_FIELDS_UNREGISTERED");

    registry.registerField(
        admin, new FieldRegistryService.FieldRegistration("bank_account", "Bank account", "text", true));
    var banking =
        registry.registerTable(
            admin,
            new FieldRegistryService.TableRegistration(
                "EMP_Banking_Details", "Banking", "EMPLOYEE", List.of("bank_account", "basic_salary")));
    var salaryTable =
        registry.registerTable(
            admin,
            new FieldRegistryService.TableRegistration(
                "EMP_Salary_Details", "Salary", "EMPLOYEE", List.of("basic_salary")));
    assertThat(banking.fields()).containsExactly("bank_account", "basic_salary");
    assertThat(salaryTable.fields()).containsExactly("basic_salary");
    assertThat(
            registry.listFields(admin).stream()
                .filter(field -> field.technical_name().equals("basic_salary"))
                .findFirst()
                .orElseThrow()
                .tables())
        .containsExactly("EMP_Banking_Details", "EMP_Salary_Details");
  }

  @Test
  void valuesIdentitySyncAndReportsKeepTheEmployee() throws Exception {
    registry.registerField(
        admin, new FieldRegistryService.FieldRegistration("pay_amount", "Pay amount", "number", false));
    registry.registerField(
        admin, new FieldRegistryService.FieldRegistration("account_token", "Account token", "text", true));
    registry.registerTable(
        admin,
        new FieldRegistryService.TableRegistration(
            "EMP_Pay_Register", "Pay", "EMPLOYEE", List.of("account_token", "pay_amount")));
    registry.registerTable(
        admin,
        new FieldRegistryService.TableRegistration(
            "Field_Register", "Field catalog", "CATALOG", List.of("pay_amount")));

    var saved =
        onboarding.save(
            hr,
            UUID.randomUUID(),
            new SaveDraft(
                0,
                configs.active(hr.scope()).metadata().version(),
                new Profile(
                    Map.of(
                        "name",
                        "Synthetic Registry Lane",
                        "joiner",
                        "New joiner",
                        "joining",
                        "2026-01-10",
                        "phone",
                        "+91 00000 00000"),
                    Map.of(),
                    false)));
    var current = onboarding.getDraft(hr, UUID.fromString(saved.draft_id()));
    var employee = onboarding.register(hr, UUID.fromString(current.draft_id()), current.version());
    UUID employeeId = UUID.fromString(employee.employee_id());
    values.save(
        hr,
        employeeId,
        new FieldValueService.ValueWrite(Map.of("pay_amount", "20000", "account_token", "000012345678")));
    var stored = values.read(hr, employeeId);
    assertThat(stored)
        .anyMatch(row -> row.technical_name().equals("pay_amount") && row.value().equals("20000"));
    assertThat(stored)
        .anyMatch(
            row -> row.technical_name().equals("account_token") && row.value().equals("000012345678"));
    Boolean cipher =
        jdbc.sql(
                "SELECT v.value_text IS NULL AND v.value_ciphertext IS NOT NULL FROM"
                    + " people.employee_field_value v JOIN meta.field_definition f ON"
                    + " f.field_id=v.field_id WHERE v.employee_id=:id AND f.technical_name='account_token'")
            .param("id", employeeId)
            .query(Boolean.class)
            .single();
    assertThat(cipher).isTrue();

    var open =
        identities.link(
            hr,
            new IdentityLinkService.LinkWrite(
                employeeId, "SYS", "00012", null, LocalDate.parse("2020-01-01"), null));
    assertThat(open.external_id()).isEqualTo("00012");
    assertThatThrownBy(
            () ->
                identities.link(
                    hr,
                    new IdentityLinkService.LinkWrite(
                        employeeId, "SYS", "00012", null, LocalDate.parse("2021-01-01"), null)))
        .isInstanceOf(COSError.class)
        .extracting("code")
        .isEqualTo("IDENTITY_OVERLAP");
    identities.close(
        hr, UUID.fromString(open.link_id()), new IdentityLinkService.CloseLink(LocalDate.parse("2023-12-31")));
    var next =
        identities.link(
            hr,
            new IdentityLinkService.LinkWrite(
                employeeId, "SYS", "00012", null, LocalDate.parse("2024-01-01"), null));
    assertThat(next.valid_to()).isNull();

    long before =
        jdbc.sql("SELECT count(*) FROM people.employee WHERE scope_id='TEST'").query(Long.class).single();
    sync.record(
        hr,
        new SyncService.SyncWrite(
            "EMP_Working", employee.employee_code(), "SYNC-1", "SYNCED", "EMPLOYEE", employee.employee_id()));
    var absent =
        sync.markAbsent(
            hr,
            new SyncService.Absence(
                "EMP_Working", employee.employee_code(), "SYNC-2", "EMPLOYEE", employee.employee_id()));
    assertThat(absent.sync().sync_status()).isEqualTo("ABSENT");
    assertThat(absent.sync().sync_version()).isEqualTo(2);
    assertThat(absent.employee_count()).isEqualTo(before);
    assertThat(
            jdbc.sql("SELECT display_name FROM people.employee WHERE employee_id=:id")
                .param("id", employeeId)
                .query(String.class)
                .single())
        .isEqualTo("Synthetic Registry Lane");

    assertThat(reports.employeeMaster(hr))
        .anyMatch(
            row -> row.employee_id().equals(employee.employee_id()) && "00012".equals(row.sys_emp_id()));
    assertThat(reports.table(hr, "EMP_Pay_Register").rows())
        .anyMatch(
            row ->
                employee.employee_code().equals(row.get("employee_code"))
                    && "000012345678".equals(row.get("account_token")));
    assertThat(reports.table(hr, "Field_Register").grain()).isEqualTo("CATALOG");
    assertThat(reports.table(hr, "Field_Register").rows())
        .extracting(row -> row.get("technical_name"))
        .contains("pay_amount");
    assertThatThrownBy(() -> reports.employeeMaster(viewer)).isInstanceOf(COSError.class);
    mvc.perform(get("/api/v1/cos/reports/employee-master").with(user("viewer").roles("VIEWER")))
        .andExpect(status().isForbidden());
  }
}
