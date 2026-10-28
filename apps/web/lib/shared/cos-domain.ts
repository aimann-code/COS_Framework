export type Page =
  "dashboard" | "registration" | "employees" | "requests" | "configuration";
export type FieldDefinition = {
  id: string;
  label: string;
  type: "text" | "date" | "number";
  required: boolean;
  visible: boolean;
  sensitive: boolean;
  field_id?: string;
  read_roles?: string[];
  write_roles?: string[];
  printable?: boolean;
  display_order?: number;
  group_key?: string;
  max_length?: number;
};
export type Registration = {
  employee_name: string;
  empid_entry_mode: "" | "MANUAL" | "AUTO";
  sys_emp_id?: string;
  father_name: string;
  nationality_id: string;
  national_id_type_id: string;
  id_number: string;
  custom_fields: Record<string, string>;
};
export type Employee = Registration & {
  employee_key: string;
  sys_emp_id: string;
  record_version: number;
  created_at: string;
};
export type RequestRecord = {
  id: string;
  kind: "REGISTER" | "UPDATE" | "CONFIGURATION" | "BULK_REGISTER";
  status:
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "EXECUTING"
    | "COMPLETED"
    | "FAILED"
    | "REJECTED";
  request_version?: number;
  readable_id?: string;
  failure_code?: string;
  items?: Record<string, unknown>[];
  provenance?: Record<string, unknown>;
  submitted_at: string;
  configuration_version: number;
  payload: Registration;
  employee_key?: string;
  record_version?: number;
  fields?: FieldDefinition[];
  remarks?: string;
};
export const empty_registration = (): Registration => ({
  employee_name: "",
  empid_entry_mode: "",
  sys_emp_id: "",
  father_name: "",
  nationality_id: "",
  national_id_type_id: "",
  id_number: "",
  custom_fields: {},
});
export const initial_fields: FieldDefinition[] = [
  {
    id: "dob",
    label: "Date of birth",
    type: "date",
    required: false,
    visible: true,
    sensitive: false,
  },
  {
    id: "pan_number",
    label: "PAN number",
    type: "text",
    required: false,
    visible: false,
    sensitive: true,
  },
  {
    id: "aadhaar_number",
    label: "Aadhaar number",
    type: "text",
    required: false,
    visible: false,
    sensitive: true,
  },
];
// Illustrative development values. Replace with approved controlled-value IDs from the API.
export const nationalities = [
  "India",
  "United Kingdom",
  "United States",
  "Other",
];
export const id_types = [
  "Passport",
  "National identity card",
  "Other approved document",
];
export function date_label(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
    .format(d)
    .replace(/ /g, "-");
}
export const mask = (value: string) =>
  value ? (value.length <= 4 ? "••••" : `•••• ${value.slice(-4)}`) : "—";
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
export function identity_key(p: Registration) {
  return JSON.stringify([
    p.father_name.trim().toLocaleLowerCase(),
    p.nationality_id,
    p.national_id_type_id,
    p.id_number.trim().toLocaleLowerCase(),
  ]);
}
export function validate_registration(
  p: Registration,
  fields: FieldDefinition[],
  employees: Employee[],
  exclude_key?: string,
  choices: { nationalities: string[]; id_types: string[] } = {
    nationalities,
    id_types,
  },
) {
  const errors: Record<string, string> = {};
  for (const [key, label] of Object.entries({
    employee_name: "Employee name",
    father_name: "Father’s name",
    nationality_id: "Nationality",
    national_id_type_id: "National ID type",
    id_number: "ID number",
    empid_entry_mode: "ID generation mode",
  })) {
    if (!String(p[key as keyof Registration] ?? "").trim())
      errors[key] = `${label} is required.`;
  }
  if (p.empid_entry_mode && !["MANUAL", "AUTO"].includes(p.empid_entry_mode))
    errors.empid_entry_mode = "Select Manual or Auto.";
  if (p.empid_entry_mode === "MANUAL" && !p.sys_emp_id?.trim())
    errors.sys_emp_id = "Enter an employee ID for Manual mode.";
  if (p.empid_entry_mode === "AUTO" && "sys_emp_id" in p)
    errors.sys_emp_id = "Auto mode must not supply an employee ID.";
  if (p.nationality_id && !choices.nationalities.includes(p.nationality_id))
    errors.nationality_id = "Select a listed nationality.";
  if (
    p.national_id_type_id &&
    !choices.id_types.includes(p.national_id_type_id)
  )
    errors.national_id_type_id = "Select a listed ID type.";
  for (const key of [
    "employee_name",
    "father_name",
    "id_number",
    "sys_emp_id",
  ] as const)
    if ((p[key]?.length ?? 0) > 120)
      errors[key] = "Use 120 characters or fewer.";
  for (const field of fields.filter((f) => f.visible)) {
    const v = p.custom_fields[field.id] ?? "";
    if (field.required && !v.trim())
      errors[field.id] = `${field.label} is required.`;
    if (v && field.type === "number" && !Number.isFinite(Number(v)))
      errors[field.id] = "Enter a valid number.";
    if (
      v &&
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        Number.isNaN(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      errors[field.id] = "Enter a valid date.";
  }
  for (const key of Object.keys(p.custom_fields))
    if (!fields.some((f) => f.id === key && f.visible))
      errors[key] = "This field is not enabled in the current configuration.";
  if (
    employees.some(
      (e) =>
        e.employee_key !== exclude_key &&
        p.sys_emp_id &&
        e.sys_emp_id.toLowerCase() === p.sys_emp_id.trim().toLowerCase(),
    )
  )
    errors.sys_emp_id = "This employee ID already exists.";
  if (
    employees.some(
      (e) =>
        e.employee_key !== exclude_key && identity_key(e) === identity_key(p),
    )
  )
    errors.id_number =
      "An employee with this composite identity already exists.";
  return errors;
}
export const demo_employees: Employee[] = [
  {
    employee_key: "demo-1",
    sys_emp_id: "DEMO-0001",
    employee_name: "Aarav Sharma",
    father_name: "Rakesh Sharma",
    empid_entry_mode: "MANUAL",
    nationality_id: "India",
    national_id_type_id: "Passport",
    id_number: "EXAMPLE0011",
    custom_fields: { dob: "1994-06-15" },
    record_version: 1,
    created_at: "2026-10-20T08:00:00Z",
  },
  {
    employee_key: "demo-2",
    sys_emp_id: "DEMO-0002",
    employee_name: "Meera Patel",
    father_name: "Vijay Patel",
    empid_entry_mode: "MANUAL",
    nationality_id: "India",
    national_id_type_id: "Passport",
    id_number: "EXAMPLE0022",
    custom_fields: { dob: "1996-02-23" },
    record_version: 1,
    created_at: "2026-10-19T08:00:00Z",
  },
  {
    employee_key: "demo-3",
    sys_emp_id: "DEMO-0003",
    employee_name: "Daniel Wilson",
    father_name: "James Wilson",
    empid_entry_mode: "MANUAL",
    nationality_id: "United Kingdom",
    national_id_type_id: "Passport",
    id_number: "EXAMPLE0033",
    custom_fields: {},
    record_version: 1,
    created_at: "2026-10-18T08:00:00Z",
  },
];
