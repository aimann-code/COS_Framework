package com.cos.hrms;

import static com.cos.hrms.employee.registration.OnboardingContracts.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cos.hrms.leave.LeaveContracts.Submit;
import com.cos.hrms.leave.LeaveService;
import com.cos.hrms.metadata.COSMetadataRepository;
import com.cos.hrms.metadata.COSMetadataService;
import com.cos.hrms.metadata.ModuleCatalog;
import com.cos.hrms.employee.registration.OnboardingService;
import com.cos.hrms.security.COSActor;
import com.cos.hrms.security.COSJwtService;
import com.cos.hrms.shared.COSError;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
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
      "cos.viewer-password=integration-test-password"
    })
@ActiveProfiles("test")
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LeaveWorkflowTest {
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

  @Autowired OnboardingService onboarding;
  @Autowired LeaveService leave;
  @Autowired ModuleCatalog.ModuleService modules;
  @Autowired COSMetadataService metadata;
  @Autowired COSMetadataRepository configs;
  @Autowired COSJwtService jwt;
  @Autowired MockMvc mvc;
  final COSActor hr = new COSActor("registrar", "TEST", Set.of("REGISTRAR"));
  UUID employee;

  @BeforeAll
  void seed() {
    metadata.seedLocal("TEST");
    leave.ensure("TEST");
    modules.ensure("TEST");
    var draft =
        onboarding.save(
            hr,
            UUID.randomUUID(),
            new SaveDraft(
                0,
                configs.active("TEST").metadata().version(),
                new Profile(
                    Map.of(
                        "name",
                        "Synthetic Leave",
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
                    false)));
    employee =
        UUID.fromString(
            onboarding.register(hr, UUID.fromString(draft.draft_id()), draft.version()).employee_id());
  }

  @Test
  void employeeCodeResolvesTheDisplayName() {
    var profile = onboarding.employee(hr, employee);
    var match = leave.findByCode(hr, profile.employee_code().toLowerCase(Locale.ROOT));
    assertThat(match.display_name()).isEqualTo("Synthetic Leave");
    assertThat(match.employee_code()).isEqualTo(profile.employee_code());
    assertThat(match.employee_id()).isEqualTo(employee.toString());
    assertThatThrownBy(() -> leave.findByCode(hr, "MISSING-CODE"))
        .isInstanceOf(COSError.class)
        .extracting(e -> ((COSError) e).code)
        .isEqualTo("EMPLOYEE_NOT_FOUND");
  }

  @Test
  void hrRecordsLeaveAndBalanceRejectsOverlap() {
    LocalDate start = LeaveService.today().plusDays(1);
    var recorded =
        leave.submit(
            hr,
            new Submit(employee, "CL", start, start, "Clinic visit", true));
    assertThat(recorded.status()).isEqualTo("APPROVED");
    assertThat(recorded.day_count()).isEqualByComparingTo(new BigDecimal("1.0"));
    var balance =
        leave.catalog(hr, employee).balances().stream()
            .filter(row -> row.code().equals("CL"))
            .findFirst()
            .orElseThrow();
    assertThat(balance.reserved()).isEqualByComparingTo("1.0");
    assertThatThrownBy(
            () -> leave.submit(hr, new Submit(employee, "CL", start, start, "Overlap", true)))
        .isInstanceOf(COSError.class)
        .extracting(e -> ((COSError) e).code)
        .isEqualTo("LEAVE_OVERLAP");
  }

  @Test
  void weekdayPolicyIgnoresWeekendDates() {
    var casual =
        leave.catalog(hr, null).policies().stream()
            .filter(row -> row.code().equals("LWP"))
            .findFirst()
            .orElseThrow();
    leave.savePolicy(
        hr,
        "LWP",
        new com.cos.hrms.leave.LeaveContracts.PolicyCommand(
            casual.name(),
            false,
            casual.annual_quota(),
            0,
            casual.max_days(),
            true,
            "WEEKDAYS",
            casual.version()));
    LocalDate day = LeaveService.today().plusDays(10);
    while (day.getDayOfWeek() != DayOfWeek.SATURDAY) day = day.plusDays(1);
    LocalDate weekend = day;
    assertThatThrownBy(
            () ->
                leave.submit(
                    hr, new Submit(employee, "LWP", weekend, weekend.plusDays(1), "Weekend", true)))
        .isInstanceOf(COSError.class)
        .extracting(e -> ((COSError) e).code)
        .isEqualTo("LEAVE_DAYS_EMPTY");
  }

  @Test
  void bearerTokenReadsLeaveAndRejectsTampering() throws Exception {
    var login =
        mvc.perform(
                post("/api/v1/cos/login")
                    .with(csrf())
                    .param("username", "registrar")
                    .param("password", "integration-test-password"))
            .andExpect(status().isNoContent())
            .andExpect(header().exists("Set-Cookie"))
            .andReturn();
    assertThat(login.getResponse().getHeader("Set-Cookie")).contains("COS_ACCESS");
    String token =
        jwt.issue(
            org.springframework.security.authentication.UsernamePasswordAuthenticationToken
                .authenticated("registrar", null, List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_REGISTRAR"))),
            "TEST");
    mvc.perform(get("/api/v1/cos/leave/requests").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/cos/modules").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.module_code=='LEAVE')]").exists());
    mvc.perform(get("/api/v1/cos/leave/requests").header("Authorization", "Bearer not-a-token"))
        .andExpect(status().isUnauthorized());
    assertThat(modules.list(hr).stream().map(ModuleCatalog.ModuleView::module_code))
        .contains("LEAVE", "LEAVE_POLICY", "EMPLOYEES");
  }
}
