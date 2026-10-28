import { api } from "../../shared/cos-api";
import type { FieldDefinition } from "../../shared/cos-domain";
export type ProfileEntry = { id: string; values: Record<string, string> };
export type ProfileData = {
  values: Record<string, string>;
  groups: Record<string, ProfileEntry[]>;
  same_address: boolean;
};
export type ProfileDocument = {
  document_id: string;
  kind: string;
  media_type: string;
  byte_count: number;
  scan_status: string;
  created_at: string;
};
export type OnboardingSchema = {
  configuration_version: number;
  additional_fields: FieldDefinition[];
  scope_id: string;
  local_environment: boolean;
};
export type ProfileDraft = {
  draft_id: string;
  version: number;
  configuration_version: number;
  status: string;
  employee_id: string | null;
  expected_employee_version: number | null;
  profile: ProfileData;
  documents: ProfileDocument[];
  review_note: string | null;
  actor_id: string;
  updated_at: string;
};
export type EmployeeProfile = {
  employee_id: string;
  employee_code: string;
  display_name: string;
  version: number;
  work_email: string | null;
  work_email_status: string | null;
  profile: ProfileData;
  documents: ProfileDocument[];
  created_at: string;
};
export type WorkEmailPreview = {
  proposed_email: string;
  work_email_status: string;
  source: string;
  collision_employee_code: string | null;
  note: string;
};
export type ProfileSummary = Pick<
  EmployeeProfile,
  "employee_id" | "employee_code" | "display_name" | "version"
>;
export type DraftSummary = Pick<
  ProfileDraft,
  "draft_id" | "version" | "status" | "actor_id" | "updated_at" | "employee_id"
>;
export const onboarding = {
  startEdit: (employee: string, draft: string, version: number) =>
    api<ProfileDraft>(`/onboarding/employees/${employee}/drafts/${draft}`, {
      method: "PUT",
      body: JSON.stringify({ version }),
    }),
  applyEdit: (id: string, version: number) =>
    api<EmployeeProfile>(`/onboarding/drafts/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  requests: () => api<DraftSummary[]>("/onboarding/requests"),
  schema: () => api<OnboardingSchema>("/onboarding/schema"),
  save: (id: string, version: number, config: number, profile: ProfileData) =>
    api<ProfileDraft>(`/onboarding/drafts/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        expected_version: version,
        configuration_version: config,
        profile,
      }),
    }),
  draft: (id: string) => api<ProfileDraft>(`/onboarding/drafts/${id}`),
  previewWorkEmail: (
    id: string,
    query?: { name?: string; mode?: string; existing?: string },
  ) => {
    const params = new URLSearchParams();
    if (query?.name) params.set("name", query.name);
    if (query?.mode) params.set("mode", query.mode);
    if (query?.existing) params.set("existing", query.existing);
    const suffix = params.toString() ? `?${params}` : "";
    return api<WorkEmailPreview>(`/onboarding/drafts/${id}/work-email${suffix}`);
  },
  drafts: (reviews = false) =>
    api<DraftSummary[]>(`/onboarding/drafts?reviews=${reviews}`),
  register: (id: string, version: number) =>
    api<EmployeeProfile>(`/onboarding/drafts/${id}/register`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  registerMany: (rows: ProfileData[]) =>
    api<EmployeeProfile[]>("/onboarding/registrations", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  submit: (id: string, version: number) =>
    api<ProfileDraft>(`/onboarding/drafts/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  decide: (
    id: string,
    version: number,
    decision: "APPROVE" | "REJECT",
    remarks: string,
  ) =>
    api<ProfileDraft>(`/onboarding/drafts/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ version, decision, remarks }),
    }),
  employee: (id: string) => api<EmployeeProfile>(`/onboarding/employees/${id}`),
  me: () => api<EmployeeProfile>("/onboarding/me"),
  employees: (search = "", after?: string) =>
    api<{ items: ProfileSummary[]; next_cursor: string | null }>(
      `/onboarding/employees?limit=100&search=${encodeURIComponent(search)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    ),
  upload: (id: string, version: number, kind: string, file: File) => {
    const body = new FormData();
    body.set("file", file);
    return api<ProfileDocument>(
      `/onboarding/drafts/${id}/documents?version=${version}&kind=${kind}`,
      { method: "POST", body },
    );
  },
  remove: (id: string, version: number) =>
    api<void>(`/onboarding/documents/${id}?version=${version}`, {
      method: "DELETE",
    }),
};
