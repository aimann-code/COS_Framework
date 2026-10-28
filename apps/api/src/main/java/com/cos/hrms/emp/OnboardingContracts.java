package com.cos.hrms.emp;

import jakarta.validation.constraints.*;
import java.util.*;

public final class OnboardingContracts {
  private OnboardingContracts() {}

  public record Entry(
      @NotBlank @Size(max = 80) String id, @NotNull @Size(max = 10) Map<String, String> values) {}

  public record Profile(
      @NotNull @Size(max = 170) Map<String, String> values,
      @NotNull @Size(max = 4) Map<String, List<Entry>> groups,
      boolean same_address) {}

  public record SaveDraft(
      @Min(0) int expected_version,
      @Min(1) int configuration_version,
      @NotNull @jakarta.validation.Valid Profile profile) {}

  public record Command(@Min(1) int version) {}

  public record SaveDraftPayload(
      @Min(0) int expected_version,
      @Min(1) int configuration_version,
      @NotNull tools.jackson.databind.JsonNode profile) {}

  public record Decision(
      @Min(1) int version, @NotBlank String decision, @Size(max = 500) String remarks) {}

  public record DocumentView(
      String document_id,
      String kind,
      String media_type,
      int byte_count,
      String scan_status,
      String created_at) {}

  public record DraftView(
      String draft_id,
      int version,
      int configuration_version,
      String status,
      String employee_id,
      Integer expected_employee_version,
      Profile profile,
      List<DocumentView> documents,
      String review_note,
      String actor_id,
      String updated_at) {}

  public record EmployeeView(
      String employee_id,
      String employee_code,
      String display_name,
      int version,
      String work_email,
      String work_email_status,
      Profile profile,
      List<DocumentView> documents,
      String created_at) {}

  public record WorkEmailPreview(
      String proposed_email,
      String work_email_status,
      String source,
      String collision_employee_code,
      String note) {}

  public record EmployeeSummary(
      String employee_id, String employee_code, String display_name, int version) {}

  public record DraftSummary(
      String draft_id,
      int version,
      String status,
      String actor_id,
      String updated_at,
      String employee_id) {}

  public record Schema(
      int configuration_version,
      List<com.cos.shared.web.COSContracts.Field> additional_fields,
      String scope_id,
      boolean local_environment) {}
}
