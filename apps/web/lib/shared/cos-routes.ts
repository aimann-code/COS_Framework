import type { Page } from "./cos-domain";
import { people_path_valid } from "../hrms/employee-management/people-routes";
export const workspace_paths: Record<Page, string> = {
  dashboard: "/dashboard",
  registration: "/employees/new",
  employees: "/employees",
  requests: "/requests",
  configuration: "/configuration",
};
export type WorkspaceRoute = {
  valid: boolean;
  page: Page;
  employeeId?: string;
  requestId?: string;
  editing?: boolean;
  dialog?: "bulk" | "sheet" | "help";
  accounts?: boolean;
};
export function workspace_route(path: string): WorkspaceRoute {
  const base: WorkspaceRoute = { valid: true, page: "dashboard" };
  if (["/", "/admin", "/dashboard"].includes(path)) return base;
  if (path === "/employees/new") return { ...base, page: "registration" };
  if (path === "/employees") return { ...base, page: "employees" };
  if (path === "/requests") return { ...base, page: "requests" };
  if (path === "/configuration") return { ...base, page: "configuration" };
  if (path === "/accounts") return { ...base, accounts: true };
  if (path === "/help") return { ...base, dialog: "help" };
  if (path === "/imports/csv")
    return { ...base, page: "registration", dialog: "bulk" };
  if (path === "/imports/google-sheets")
    return { ...base, page: "registration", dialog: "sheet" };
  const employee = path.match(/^\/employees\/([0-9a-f-]{36})(\/edit)?$/i);
  if (employee)
    return {
      ...base,
      page: employee[2] ? "registration" : "employees",
      employeeId: employee[1],
      editing: !!employee[2],
    };
  const request = path.match(/^\/requests\/([0-9a-f-]{36})$/i);
  if (request) return { ...base, page: "requests", requestId: request[1] };
  return { ...base, valid: false };
}
export function safe_return_path(path: string | null) {
  return path && (workspace_route(path).valid || people_path_valid(path))
    ? path
    : "/";
}

export function landing_path(roles: string[]) {
  return roles.includes("ADMIN")
    ? "/people/configuration"
    : roles.includes("EMPLOYEE")
      ? "/people/me"
      : roles.includes("REGISTRAR")
        ? "/people"
        : "/dashboard";
}
export function signed_in_path(path: string | null, roles: string[]) {
  const safe = safe_return_path(path);
  return current_workspace_path(safe, roles);
}

export function current_workspace_path(path: string, roles: string[]) {
  if (!roles.some((r) => ["REGISTRAR", "ADMIN", "EMPLOYEE"].includes(r)))
    return path;
  if (["/", "/admin", "/dashboard"].includes(path)) return landing_path(roles);
  const routes: Record<string, string> = {
    "/employees": "/people/directory",
    "/employees/new": "/people/register",
    "/configuration": "/people/configuration",
    "/accounts": "/people/accounts",
    "/requests": roles.includes("ADMIN")
      ? "/people/configuration"
      : roles.includes("EMPLOYEE")
        ? "/people/requests"
        : "/people/reviews",
  };
  if (routes[path]) return routes[path];
  const employee = path.match(/^\/employees\/([0-9a-f-]{36})(?:\/edit)?$/i);
  if (employee) return `/people/employees/${employee[1]}`;
  return path;
}
