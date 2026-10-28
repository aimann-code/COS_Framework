import type { Session } from "../../shared/cos-api";

export type PeopleRole = "REGISTRAR" | "ADMIN" | "EMPLOYEE";

export type PeopleNavItem = { url: string; label: string };

const UUID = "[0-9a-f-]{36}";

export function people_path_valid(path: string) {
  return (
    path === "/people" ||
    path === "/people/directory" ||
    path === "/people/register" ||
    path === "/people/change" ||
    path === "/people/me" ||
    path === "/people/reviews" ||
    path === "/people/requests" ||
    path === "/people/accounts" ||
    path === "/people/configuration" ||
    path === "/people/companies" ||
    path === "/people/leave" ||
    path === "/people/leave/apply" ||
    path === "/people/leave/policies" ||
    new RegExp(`^/people/drafts/${UUID}$`, "i").test(path) ||
    new RegExp(`^/people/employees/${UUID}$`, "i").test(path) ||
    new RegExp(`^/people/reviews/${UUID}$`, "i").test(path) ||
    new RegExp(`^/people/requests/${UUID}$`, "i").test(path)
  );
}

export function people_roles_ok(roles: string[]) {
  return roles.some((r) =>
    (["REGISTRAR", "ADMIN", "EMPLOYEE"] as const).includes(r as PeopleRole),
  );
}

export function people_access_message(path: string, roles: string[]) {
  const hr = roles.includes("REGISTRAR");
  const admin = roles.includes("ADMIN");
  const employee = roles.includes("EMPLOYEE");
  if (path === "/people/register" && !hr)
    return "Only HR can register employees.";
  if (/^\/people\/reviews\//.test(path) && !hr)
    return "Only HR can review employee requests.";
  if (path === "/people/reviews" && !hr)
    return "Only HR can review employee requests.";
  if (/^\/people\/requests\//.test(path) && !employee)
    return "Employee access is required.";
  if (path === "/people/requests" && !employee)
    return "Employee access is required.";
  if (path === "/people/change" && !employee)
    return "Employee access is required.";
  if (path === "/people/accounts" && !hr)
    return "Only HR can activate employee accounts.";
  if (path === "/people/configuration" && !hr && !admin)
    return "HR or company administrator access is required.";
  if (path === "/people/companies" && !admin)
    return "Only the platform administrator can review company requests.";
  if (
    (path === "/people/leave" ||
      path === "/people/leave/apply" ||
      path === "/people/leave/policies") &&
    !hr &&
    !admin &&
    !employee
  )
    return "Leave is available to HR, administrators, and linked employees.";
  if (path === "/people/leave/policies" && !hr && !admin)
    return "Only HR or an administrator can change leave policy.";
  return null;
}

export function people_auto_redirect(
  path: string,
  roles: string[],
  home?: Session["home_workspace"],
) {
  if (path !== "/people" && path !== "/people/directory") return null;
  if (home === "PLATFORM") return "/platform";
  if (home === "COMPANY" && path === "/people") return "/people/directory";
  if (roles.includes("EMPLOYEE")) return "/people/me";
  if (roles.includes("ADMIN")) return "/people/configuration";
  return null;
}

export function people_nav(
  roles: string[],
  home?: Session["home_workspace"],
): PeopleNavItem[] {
  if (home === "PLATFORM")
    return [
      { url: "/platform", label: "Platform overview" },
      { url: "/platform/companies", label: "Companies" },
      { url: "/platform/configuration", label: "Configuration approvals" },
    ];
  if (home === "COMPANY")
    return [
      { url: "/company", label: "Company overview" },
      { url: "/company/services", label: "Subscribed services" },
      { url: "/people/directory", label: "Employee directory" },
      { url: "/company/configuration", label: "Configuration requests" },
    ];
  const hr = roles.includes("REGISTRAR");
  const admin = roles.includes("ADMIN");
  const employee = roles.includes("EMPLOYEE");
  return [
    ...(hr
      ? [
          { url: "/people", label: "HR overview" },
          { url: "/people/register", label: "Register employee" },
          { url: "/people/directory", label: "Employee directory" },
          { url: "/people/reviews", label: "Employee requests" },
          { url: "/people/leave", label: "Leave" },
          { url: "/people/accounts", label: "Employee access" },
        ]
      : []),
    ...(employee
      ? [
          { url: "/people/me", label: "My profile" },
          { url: "/people/change", label: "Request an update" },
          { url: "/people/requests", label: "My requests" },
          { url: "/people/leave", label: "My leave" },
        ]
      : []),
    ...(admin ? [{ url: "/people/companies", label: "Company requests" }] : []),
    ...(hr || admin
      ? [
          {
            url: "/people/configuration",
            label: admin ? "Configuration approvals" : "Form configuration",
          },
          { url: "/people/leave/policies", label: "Leave policy" },
        ]
      : []),
  ];
}

export function people_title(
  path: string,
  roles: string[],
  employeeName?: string,
) {
  const hr = roles.includes("REGISTRAR");
  const admin = roles.includes("ADMIN");
  if (path === "/people/leave/policies") return "Leave policy";
  if (path === "/people/leave/apply")
    return hr ? "Record leave" : "Request leave";
  if (path === "/people/leave") return hr ? "Leave" : "My leave";
  if (path === "/people/requests") return "My update requests";
  if (path.startsWith("/people/requests/")) return "My update request";
  if (path === "/people/accounts") return "Employee account activation";
  if (path === "/people/companies") return "Company requests";
  if (path === "/people/configuration")
    return admin ? "Configuration approvals" : "Form configuration";
  if (path.startsWith("/people/reviews/")) return "Review employee update";
  if (path === "/people/reviews") return "Employee update requests";
  if (path === "/people/me") return "My employee profile";
  if (employeeName) return employeeName;
  if (path === "/people/directory") return "Employee directory";
  if (path === "/people/register") return "Register employee";
  if (path.startsWith("/people/drafts/")) return "Employee draft";
  return "HR workspace";
}

export type PeopleNavContext = {
  path: string;
  employee: boolean;
  hr: boolean;
  draftEmployeeId?: string | null;
};

export function people_nav_current(
  path: string,
  url: string,
  ctx: PeopleNavContext,
) {
  if (url === "/people/leave" && path.startsWith("/people/leave/policies"))
    return false;
  if (path === url) return true;
  if (
    url !== "/people" &&
    path.startsWith(`${url}/`) &&
    !(url === "/people/leave" && path.startsWith("/people/leave/policies"))
  )
    return true;
  if (
    url === "/people/change" &&
    ctx.employee &&
    path.startsWith("/people/drafts/")
  )
    return true;
  if (
    url === "/people/register" &&
    path.startsWith("/people/drafts/") &&
    !ctx.draftEmployeeId
  )
    return true;
  if (
    url === "/people/directory" &&
    (path.startsWith("/people/employees/") || (ctx.hr && !!ctx.draftEmployeeId))
  )
    return true;
  return false;
}

export function people_is_form_path(path: string) {
  return (
    path === "/people/register" ||
    path === "/people/change" ||
    path.startsWith("/people/drafts/")
  );
}
