import type { Configuration } from "../../../lib/shared/cos-api";
import type { FieldDefinition } from "../../../lib/shared/cos-domain";
import type {
  DraftSummary,
  EmployeeProfile,
  OnboardingSchema,
  ProfileDraft,
  ProfileSummary,
} from "../../../lib/hrms/employee-management/onboarding-api";

export type Account = { account_id: string; full_name: string; email: string };

export type CompanyCatalog = {
  suite: string;
  engine: string;
  modules: string[];
};

export type CompanyRequest = {
  request_id: string;
  company_name: string;
  login_email: string;
  requested_modules: string[];
  granted_modules: string[];
  scope_id?: string;
  status: string;
  remarks?: string;
  created_at: string;
};

export type ConfigRequest = {
  request_id: string;
  request_version: number;
  configuration_version: number;
  status: string;
  payload: { fields: FieldDefinition[] };
  remarks?: string;
  failure_code?: string;
};

export type ScreenData = {
  schema: OnboardingSchema;
  draft?: ProfileDraft;
  employee?: EmployeeProfile;
  drafts?: DraftSummary[];
  employees?: ProfileSummary[];
  next?: string | null;
  reviews?: DraftSummary[];
  accounts?: Account[];
  config?: Configuration;
  configs?: ConfigRequest[];
  companyCatalog?: CompanyCatalog;
  companyRequests?: CompanyRequest[];
  modules?: { module_code: string; name: string; route: string }[];
};

export type PeopleAction = (work: () => Promise<void>) => Promise<void>;

export const docNames: Record<string, string> = {
  AADHAAR_FRONT: "Aadhaar front",
  AADHAAR_BACK: "Aadhaar back",
  PAN: "PAN card",
};
