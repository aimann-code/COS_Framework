import type {
  Employee,
  FieldDefinition,
  Page,
  Registration,
  RequestRecord,
} from "./cos-domain";

export const API_URL = process.env.NEXT_PUBLIC_COS_API_URL ?? "/api/v1/cos";
export type Session = {
  authenticated: boolean;
  username: string;
  roles: string[];
  scope_id: string;
  can_print: boolean;
};
type Choice = { id: string; code: string; label: string; category: string };
export type ConfigurationPlacement = {
  company_id: string;
  company: string;
  suite: string;
  engine: string;
  module: string;
  component_id: string;
  component: string;
};
export type Configuration = {
  version: number;
  fields: FieldDefinition[];
  allowed_modes: string[];
  default_mode: string;
  controlled_values: Choice[];
  placement?: ConfigurationPlacement;
};
type ApiPage<T> = { items: T[]; next_cursor: string | null };
type ApiEmployee = Omit<Employee, "empid_entry_mode">;
type ApiRequest = {
  request_id: string;
  readable_id: string;
  operation: RequestRecord["kind"];
  configuration_version: number;
  request_version: number;
  status: RequestRecord["status"];
  submitted_at: string;
  payload: Record<string, unknown>;
  employee_key?: string;
  record_version?: number;
  fields: FieldDefinition[];
  remarks?: string;
  failure_code?: string;
  items?: Record<string, unknown>[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
let csrf_token = "";
export async function api<T>(
  path: string,
  options: RequestInit = {},
  csrfRetry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof URLSearchParams) &&
    !(options.body instanceof FormData)
  )
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") {
    if (!csrf_token) await csrf();
    headers.set("X-CSRF-TOKEN", csrf_token);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const timedOut =
      e instanceof DOMException &&
      (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ApiError(
      0,
      timedOut ? "API_TIMEOUT" : "API_UNREACHABLE",
      timedOut
        ? "The workspace did not respond in time. Check that the API is running on the host PC and that Windows Firewall allows port 3000."
        : "We can’t connect to your workspace right now. On another device, use the host PC’s Wi‑Fi address (npm run dev:lan) and allow Node/Java through the firewall.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event("cos-session-ended"));
    const problem = await response.json().catch(() => ({}));
    // Only retry a filter-level CSRF rejection: no business mutation ran.
    if (
      response.status === 403 &&
      problem.error_code === "CSRF_INVALID" &&
      csrfRetry &&
      options.method &&
      options.method !== "GET"
    ) {
      csrf_token = "";
      await csrf();
      return api<T>(path, options, false);
    }
    throw new ApiError(
      response.status,
      problem.error_code ?? `HTTP_${response.status}`,
      problem.detail ??
        (response.status >= 500
          ? "Your workspace is temporarily unavailable. Please try again."
          : response.status === 401
            ? "Sign in to continue."
            : response.status === 403
              ? "This account cannot perform that operation, or the session expired."
              : "The operation could not be completed."),
      problem.validation_errors ?? {},
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function csrf() {
  const result = await api<{ token: string }>("/csrf");
  csrf_token = result.token;
}
export async function login(username: string, password: string) {
  await csrf();
  const body = new URLSearchParams({ username, password });
  await api<void>("/login", { method: "POST", body });
  csrf_token = "";
  await csrf();
  return api<Session>("/session");
}
export async function logout() {
  await api<void>("/logout", { method: "POST" });
  csrf_token = "";
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("cos-session");
    channel.postMessage("signed-out");
    channel.close();
  }
}
export const component_for_page: Partial<Record<Page, string>> = {
  registration: "EMP_Reg",
  employees: "EMP_Details",
  requests: "My_Requests",
  configuration: "EMP_Reg_CONFIG",
};
const page_for_component = Object.fromEntries(
  Object.entries(component_for_page).map(([page, component]) => [
    component,
    page,
  ]),
) as Record<string, Page>;
export class COSApiAdapter {
  constructor(public configuration: Configuration) {}
  label(id: string) {
    return (
      this.configuration.controlled_values.find((c) => c.id === id)?.label ?? id
    );
  }
  choice(label: string, category: string) {
    return (
      this.configuration.controlled_values.find(
        (c) => c.category === category && (c.label === label || c.id === label),
      )?.id ?? label
    );
  }
  employee(e: ApiEmployee): Employee {
    return {
      ...e,
      empid_entry_mode: "MANUAL",
      nationality_id: this.label(e.nationality_id),
      national_id_type_id: this.label(e.national_id_type_id),
    };
  }
  payload(p: Registration, old?: Employee) {
    const value: Record<string, unknown> = {
      ...p,
      nationality_id: this.choice(p.nationality_id, "NATIONALITY"),
      national_id_type_id: this.choice(p.national_id_type_id, "ID_TYPE"),
    };
    if (p.empid_entry_mode === "AUTO") delete value.sys_emp_id;
    if (old && p.id_number === old.id_number) delete value.id_number;
    if (old)
      value.custom_fields = Object.fromEntries(
        Object.entries(p.custom_fields).filter(
          ([id, v]) => !(v.startsWith("•") && v === old.custom_fields[id]),
        ),
      );
    return value;
  }
  request(r: ApiRequest): RequestRecord {
    const raw = (
      r.operation === "UPDATE" ? r.payload.employee : r.payload
    ) as Record<string, unknown>;
    const bulk = r.operation === "BULK_REGISTER";
    return {
      id: r.request_id,
      readable_id: r.readable_id,
      kind: r.operation,
      status: r.status,
      submitted_at: r.submitted_at,
      configuration_version: r.configuration_version,
      request_version: r.request_version,
      payload: bulk
        ? {
            employee_name: `CSV import · ${r.payload.row_count} rows`,
            empid_entry_mode: "",
            father_name: "",
            nationality_id: "",
            national_id_type_id: "",
            id_number: "",
            custom_fields: {},
          }
        : ({
            ...raw,
            nationality_id: this.label(String(raw.nationality_id ?? "")),
            national_id_type_id: this.label(
              String(raw.national_id_type_id ?? ""),
            ),
            custom_fields: raw.custom_fields ?? {},
          } as Registration),
      fields:
        r.operation === "CONFIGURATION"
          ? (raw.fields as FieldDefinition[])
          : r.fields,
      employee_key: r.employee_key,
      record_version: r.record_version,
      remarks: r.remarks,
      failure_code: r.failure_code,
      items: r.items,
      provenance: bulk ? r.payload : undefined,
    };
  }
  async getRequest(id: string) {
    return this.request(
      await api<ApiRequest>(`/requests/${encodeURIComponent(id)}`),
    );
  }
  async employees(after?: string, search = "") {
    const p = await api<ApiPage<ApiEmployee>>(
      `/employees?limit=100&search=${encodeURIComponent(search)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    return {
      items: p.items.map((e) => this.employee(e)),
      next_cursor: p.next_cursor,
    };
  }
  async requests(after?: string) {
    const p = await api<ApiPage<ApiRequest>>(
      `/requests?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    return {
      items: p.items.map((r) => this.request(r)),
      next_cursor: p.next_cursor,
    };
  }
  async detail(id: string, print = false) {
    return this.employee(
      await api<ApiEmployee>(
        `/employees/${id}${print ? "/print" : ""}`,
        print ? { method: "POST" } : {},
      ),
    );
  }
  async favorites() {
    return (await api<string[]>("/me/favorites"))
      .map((id) => page_for_component[id])
      .filter(Boolean);
  }
  async favorite(page: Page, add: boolean) {
    await api(`/me/favorites/${component_for_page[page]}`, {
      method: add ? "PUT" : "DELETE",
    });
  }
  async submit(operation: string, payload: unknown, key: string) {
    return this.request(
      await api<ApiRequest>("/requests", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          component_id: "EMP_Reg",
          operation,
          configuration_version: this.configuration.version,
          payload,
        }),
      }),
    );
  }
  async decide(request: RequestRecord, approve: boolean, remarks: string) {
    await api(`/requests/${request.id}/approvals`, {
      method: "POST",
      body: JSON.stringify({
        request_version: request.request_version,
        decision: approve ? "APPROVE" : "REJECT",
        remarks,
      }),
    });
  }
  async retry(request: RequestRecord) {
    await api(`/requests/${request.id}/retry`, {
      method: "POST",
      body: JSON.stringify({ request_version: request.request_version }),
    });
  }
}
