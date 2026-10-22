package com.cos.hrms.web;

import jakarta.validation.constraints.*;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;

public final class COSContracts {
  private COSContracts() {}

  public record CommonRequest(
      @NotBlank String component_id,
      @NotBlank String operation,
      @Min(1) int configuration_version,
      @NotNull JsonNode payload) {}

  public record Registration(
      String employee_name,
      String empid_entry_mode,
      String sys_emp_id,
      String father_name,
      String nationality_id,
      String national_id_type_id,
      String id_number,
      Map<String, String> custom_fields) {}

  public record Field(
      String id,
      String field_id,
      String label,
      String type,
      boolean required,
      boolean visible,
      boolean sensitive,
      List<String> read_roles,
      List<String> write_roles,
      boolean printable,
      int display_order,
      String group_key,
      Integer max_length) {}

  public record Metadata(
      int version, List<Field> fields, List<String> allowed_modes, String default_mode) {}

  public record Choice(String id, String code, String label, String category) {}

  public record Approval(
      @Min(1) int request_version, @NotBlank String decision, @Size(max = 500) String remarks) {}

  public record ImportPreview(
      @Min(1) int configuration_version,
      @NotBlank @Size(max = 64) String source_hash,
      @NotBlank @Size(max = 160) String source_name,
      @NotNull @Size(max = 100) Map<String, String> mapping,
      @NotNull @Size(min = 1, max = 500) List<JsonNode> rows) {}

  public record Retry(@Min(1) int request_version) {}

  public record Page<T>(List<T> items, String next_cursor) {}

  public record PreviewRow(
      int source_row, Map<String, Object> permitted_values, Map<String, String> errors) {}

  public record PreviewResult(
      String preview_id,
      String source_version,
      String snapshot_hash,
      String mapping_version,
      int valid_count,
      int error_count,
      List<PreviewRow> row_results) {}

  public record EmployeeView(
      String employee_key,
      String sys_emp_id,
      String employee_name,
      String father_name,
      String nationality_id,
      String national_id_type_id,
      String id_number,
      Map<String, String> custom_fields,
      int record_version,
      String created_at,
      String emp_unique_name) {}

  public record RequestView(
      String request_id,
      String readable_id,
      String operation,
      int configuration_version,
      int request_version,
      String status,
      String actor_id,
      String submitted_at,
      JsonNode payload,
      String employee_key,
      Integer record_version,
      List<Field> fields,
      String remarks,
      String failure_code,
      List<Map<String, Object>> items,
      JsonNode result) {}
}
