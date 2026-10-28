export type ServiceDefinition = {
  service_code: string;
  name: string;
  suite: string;
  engine: string;
  description: string;
  price_minor: number;
  currency: string;
  billing_period: string;
  modules: string[];
  dependencies: string[];
  active: boolean;
  available: boolean;
  version: number;
};
export type ServiceCatalog = {
  currency: string;
  billing_period: string;
  payment_mode: string;
  pricing_status: string;
  services: ServiceDefinition[];
};
export type CompanyRegistration = {
  company_id: string;
  reference: string;
  company_name: string;
  status: string;
  requested_services: string[];
  total_minor: number;
  currency: string;
  billing_period: string;
  registration_token: string;
};
export type CompanySummary = {
  company_id: string;
  reference: string;
  company_name: string;
  email: string;
  scope_id: string | null;
  status: string;
  requested_services: string[];
  active_services: string[];
  total_minor: number;
  currency: string;
  created_at: string;
  pending_configuration_requests: number;
};
export type PaymentReview = {
  payment_id: string;
  company_id: string;
  company_name: string;
  reference: string;
  payment_reference: string;
  total_minor: number;
  currency: string;
  status: string;
  remarks: string | null;
  created_at: string;
};
export type ConfigField = {
  technical_name: string;
  label: string;
  data_type: string;
  sensitive: boolean;
};
export type ConfigurationReview = {
  request_id: string;
  company_id: string;
  company_name: string;
  scope_id: string;
  service_code: string;
  service_name: string;
  kind: string;
  field: ConfigField;
  reason: string;
  status: string;
  remarks: string | null;
  version: number;
  created_at: string;
  schema_version?: number;
};
export type PlatformOverview = {
  counts: {
    companies: number;
    active_companies: number;
    pending_payments: number;
    pending_configuration_requests: number;
  };
  companies: CompanySummary[];
  payments: PaymentReview[];
  configuration_requests: ConfigurationReview[];
  list_limit: number;
  has_more_companies: boolean;
};
export type CompanyWorkspace = {
  company: CompanySummary;
  services: ServiceDefinition[];
  configuration_requests: ConfigurationReview[];
  schemas: { service_code: string; fields: ConfigField[]; version: number }[];
  supported_field_types: string[];
};
export function money(minor: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
export function statusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function displayDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(value));
  return ["day", "month", "year"]
    .map((type) => parts.find((part) => part.type === type)?.value ?? "")
    .join("-");
}
/** Compute the advertised dependency closure; the server validates it again at registration. */
export function withDependencies(
  codes: string[],
  services: ServiceDefinition[],
) {
  const selected = new Set(codes);
  let added = true;
  while (added) {
    added = false;
    for (const code of [...selected]) {
      for (const dependency of services.find((s) => s.service_code === code)
        ?.dependencies ?? []) {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          added = true;
        }
      }
    }
  }
  return [...selected];
}
