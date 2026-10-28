package com.cos.shared.commerce;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Stable shared API contracts. Monetary values are integer currency minor units. */
public final class CommerceContracts {
  private CommerceContracts() {}

  public record ServiceView(
      String service_code,
      String name,
      String suite,
      String engine,
      String description,
      long price_minor,
      String currency,
      String billing_period,
      boolean active,
      boolean available,
      List<String> modules,
      List<String> dependencies,
      int version) {}

  public record Catalog(
      String currency,
      String billing_period,
      String payment_mode,
      String pricing_status,
      List<ServiceView> services) {}

  public record Register(
      @NotBlank @Size(max = 80) String company_name,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 72) String password,
      @NotEmpty @Size(max = 20) List<@NotBlank String> services) {}

  public record RegistrationView(
      String company_id,
      String reference,
      String company_name,
      String status,
      List<String> requested_services,
      long total_minor,
      String currency,
      String billing_period,
      String registration_token) {}

  public record Token(@NotBlank @Size(max = 128) String registration_token) {}

  public record PaymentDeclaration(
      @NotBlank @Size(max = 128) String registration_token,
      @NotBlank @Size(min = 4, max = 100) String payment_reference) {}

  public record Review(@NotBlank String decision, @NotBlank @Size(max = 500) String remarks) {}

  public record CompanyView(
      String company_id,
      String reference,
      String company_name,
      String email,
      String scope_id,
      String status,
      List<String> requested_services,
      List<String> active_services,
      long total_minor,
      String currency,
      String created_at,
      long pending_configuration_requests) {}

  public record PaymentView(
      String payment_id,
      String company_id,
      String company_name,
      String reference,
      String payment_reference,
      long total_minor,
      String currency,
      String status,
      String remarks,
      String created_at) {}

  public record FieldInput(
      @NotBlank @Size(max = 60) String technical_name,
      @NotBlank @Size(max = 80) String label,
      @NotBlank String data_type,
      boolean sensitive) {}

  public record ConfigurationSubmit(
      @NotBlank String service_code,
      @NotBlank String kind,
      @NotNull @Valid FieldInput field,
      @NotBlank @Size(max = 1000) String reason,
      Integer schema_version) {
    public ConfigurationSubmit(String service_code, String kind, FieldInput field, String reason) {
      this(service_code, kind, field, reason, null);
    }
  }

  public record ConfigurationView(
      String request_id,
      String company_id,
      String company_name,
      String scope_id,
      String service_code,
      String service_name,
      String kind,
      FieldInput field,
      String reason,
      String status,
      String remarks,
      int version,
      String created_at,
      int schema_version) {}

  public record Counts(
      long companies,
      long active_companies,
      long pending_payments,
      long pending_configuration_requests) {}

  public record Overview(
      Counts counts,
      List<CompanyView> companies,
      List<PaymentView> payments,
      List<ConfigurationView> configuration_requests,
      int list_limit,
      boolean has_more_companies) {}

  public record Schema(String service_code, int version, List<FieldInput> fields) {}

  public record Workspace(
      CompanyView company,
      List<ServiceView> services,
      List<ConfigurationView> configuration_requests,
      List<Schema> schemas,
      List<String> supported_field_types) {}

  public record CatalogUpdate(
      @NotBlank @Size(max = 1000) String description,
      @NotNull Long price_minor,
      boolean active,
      int version) {}
}
