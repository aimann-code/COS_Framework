package com.cos.hrms.leave;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class LeaveContracts {
  private LeaveContracts() {}

  public record PolicyCommand(
      @NotBlank @Size(max = 80) String name,
      boolean paid,
      @NotNull @DecimalMin("0") @DecimalMax("366") BigDecimal annual_quota,
      @Min(0) @Max(90) int notice_days,
      @Min(1) @Max(366) int max_days,
      boolean active,
      @NotBlank @Pattern(regexp = "CALENDAR|WEEKDAYS") String count_mode,
      @Min(1) int version) {}

  public record Submit(
      UUID employee_id,
      @NotBlank @Size(max = 32) String policy_code,
      @NotNull java.time.LocalDate start_on,
      @NotNull java.time.LocalDate end_on,
      @NotBlank @Size(max = 500) String reason,
      boolean record) {}

  public record Decision(
      @Min(1) int version,
      @NotBlank @Pattern(regexp = "APPROVE|REJECT|CANCEL") String decision,
      @Size(max = 500) String remarks) {}

  public record PolicyView(
      String policy_id,
      String code,
      String name,
      boolean paid,
      BigDecimal annual_quota,
      int notice_days,
      int max_days,
      boolean active,
      int version,
      Map<String, String> metadata) {}

  public record BalanceView(
      String code, String name, BigDecimal annual_quota, BigDecimal reserved, BigDecimal remaining) {}

  public record RequestView(
      String request_id,
      String employee_id,
      String employee_code,
      String display_name,
      String policy_code,
      String policy_name,
      String start_on,
      String end_on,
      BigDecimal day_count,
      String reason,
      String status,
      int version,
      String review_note,
      String requested_by,
      String created_at) {}

  public record EmployeeMatch(String employee_id, String employee_code, String display_name) {}

  public record Catalog(
      String module,
      List<PolicyView> policies,
      List<BalanceView> balances,
      List<String> statuses,
      List<String> count_modes,
      List<String> actions) {}
}
