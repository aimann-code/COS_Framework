"use client";

import Link from "next/link";
import { workspace_paths, workspace_route } from "../lib/cos-routes";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileSpreadsheet,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  date_label,
  demo_employees,
  empty_registration,
  id_types,
  initial_fields,
  initials,
  mask,
  nationalities,
  validate_registration,
  type Employee,
  type FieldDefinition,
  type Page,
  type Registration,
  type RequestRecord,
} from "../lib/cos-domain";
import type { BackendContext } from "./cos-connected-workspace";
import AccountReview from "./cos-account-review";
import AdminOverview from "./cos-admin-overview";
import ImportDialog from "./cos-import-dialog";
import { Button, Badge, Empty, Modal } from "./cos-ui";

type Role = "Registration user" | "System admin" | "Employee viewer";
const navigation: { id: Page; label: string; icon: typeof Users }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "registration", label: "Employee registration", icon: UserPlus },
  { id: "employees", label: "Employee details", icon: Users },
  { id: "requests", label: "My requests", icon: ClipboardList },
  { id: "configuration", label: "Configuration", icon: Settings2 },
];
const initial_request: RequestRecord = {
  id: "DEMO-REQ-001",
  kind: "REGISTER",
  status: "PENDING_APPROVAL",
  submitted_at: "2026-10-21T06:30:00Z",
  configuration_version: 1,
  payload: {
    employee_name: "Ananya Rao",
    father_name: "Mohan Rao",
    nationality_id: "India",
    national_id_type_id: "Passport",
    id_number: "EXAMPLE0044",
    empid_entry_mode: "AUTO",
    custom_fields: {},
  },
};

export default function COSWorkspace({
  backend,
}: { backend?: BackendContext } = {}) {
  const [demo_page, set_page] = useState<Page>("dashboard");
  const route = workspace_route(backend?.path ?? "/");
  const page = backend ? route.page : demo_page;
  const [demo_role, set_role] = useState<Role>("Registration user");
  const [local_employees, set_employees] = useState<Employee[]>(demo_employees);
  const [demo_requests, set_requests] = useState<RequestRecord[]>([
    initial_request,
  ]);
  const [demo_fields, set_fields] = useState<FieldDefinition[]>(initial_fields);
  const [demo_config_version, set_config_version] = useState(1);
  const [demo_favorites, set_favorites] = useState<Page[]>([
    "registration",
    "employees",
    "requests",
  ]);
  const role = backend?.role ?? demo_role;
  const employees = backend?.employees ?? local_employees;
  const [linked_request, set_linked_request] = useState<RequestRecord>();
  const requests = backend
    ? linked_request &&
      !backend.requests.some((r) => r.id === linked_request.id)
      ? [...backend.requests, linked_request]
      : backend.requests
    : demo_requests;
  const fields = backend?.fields ?? demo_fields;
  const config_version = backend?.version ?? demo_config_version;
  const favorites = backend?.favorites ?? demo_favorites;
  const [notice, set_notice] = useState("");
  const [demo_dialog, set_dialog] = useState<"bulk" | "sheet" | "help" | null>(
    null,
  );
  const dialog = backend ? (route.dialog ?? null) : demo_dialog;
  const [route_loading, set_route_loading] = useState(false);
  const [route_error, set_route_error] = useState("");
  const [mobile_nav, set_mobile_nav] = useState(false);
  const [search, set_search] = useState("");
  const [editing, set_editing] = useState<Employee | undefined>();
  const [selected, set_selected] = useState<Employee | undefined>();
  const [date, set_date] = useState("21-Oct-2026");
  const [draft, set_draft] = useState<Registration>(empty_registration);
  useEffect(() => {
    set_date(date_label(new Date().toISOString()));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => set_notice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const is_admin = role === "System admin";
  const can_write = backend
    ? role === "Registration user"
    : role !== "Employee viewer";
  const admin_view = Boolean(backend && is_admin);
  const [review_request, set_review_request] = useState<string>();
  const registration_fields = backend
    ? fields.filter((f) => f.write_roles?.includes("REGISTRAR"))
    : fields;
  const forbidden =
    !!backend &&
    (((route.page === "configuration" ||
      route.accounts ||
      backend.path === "/admin") &&
      !is_admin) ||
      (route.page === "registration" && !can_write));
  useEffect(() => {
    if (!backend) return;
    set_mobile_nav(false);
    set_route_error("");
    set_selected(undefined);
    set_editing(undefined);
    set_linked_request(undefined);
    if (forbidden || (!route.employeeId && !route.requestId)) {
      set_route_loading(false);
      return;
    }
    let active = true;
    set_route_loading(true);
    const load = async () => {
      try {
        if (route.employeeId) {
          const value = await backend.detail(route.employeeId);
          if (active) {
            if (route.editing) set_editing(value);
            else set_selected(value);
          }
        }
        if (route.requestId) {
          const value = await backend.request(route.requestId);
          if (active) set_linked_request(value);
        }
        if (active) set_route_error("");
      } catch (e) {
        if (active)
          set_route_error(
            e instanceof Error ? e.message : "This record could not be loaded.",
          );
      } finally {
        if (active) set_route_loading(false);
      }
    };
    void load();
    const timer = route.requestId
      ? setInterval(() => void load(), 3000)
      : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [backend?.path, backend?.username, backend?.version, forbidden]);
  function open_dialog(kind: "bulk" | "sheet" | "help" | null) {
    if (backend) {
      backend.navigate(
        kind === "bulk"
          ? "/imports/csv"
          : kind === "sheet"
            ? "/imports/google-sheets"
            : kind === "help"
              ? "/help"
              : workspace_paths[page],
      );
      return;
    }
    set_dialog(kind);
  }
  function open_request(request: RequestRecord) {
    if (backend) backend.navigate(`/requests/${request.id}`);
    else {
      navigate("requests");
      set_review_request(request.id);
    }
  }
  const pending = requests.filter((r) => r.status === "PENDING_APPROVAL");
  function navigate(next: Page) {
    set_review_request(undefined);
    if (next === "configuration" && !is_admin) return;
    if (next === "registration" && !can_write) return;
    if (backend) backend.navigate(workspace_paths[next]);
    else set_page(next);
    set_mobile_nav(false);
    set_search("");
    if (backend) window.scrollTo({ top: 0 });
  }
  function submit(payload: Registration, employee?: Employee) {
    if (backend) return backend.submit(payload, employee);
    if (!can_write || is_admin) {
      set_notice(
        "Use the Registration user demo role to submit for separate admin review.",
      );
      return false;
    }
    const errors = validate_registration(
      payload,
      fields,
      employees,
      employee?.employee_key,
    );
    if (Object.keys(errors).length) {
      set_notice(Object.values(errors)[0]);
      return false;
    }
    const request: RequestRecord = {
      id: `DEMO-REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      kind: employee ? "UPDATE" : "REGISTER",
      status: "PENDING_APPROVAL",
      submitted_at: new Date().toISOString(),
      configuration_version: config_version,
      payload: structuredClone(payload),
      fields: structuredClone(fields),
      employee_key: employee?.employee_key,
      record_version: employee?.record_version,
    };
    set_requests((old) => [request, ...old]);
    set_notice(
      `${request.id} submitted for approval. Employee data has not changed.`,
    );
    return true;
  }
  function decide(request: RequestRecord, approve: boolean, remarks: string) {
    if (backend) return backend.decide(request, approve, remarks);
    if (!is_admin || request.status !== "PENDING_APPROVAL") return;
    if (!approve) {
      set_requests((old) =>
        old.map((r) =>
          r.id === request.id ? { ...r, status: "REJECTED", remarks } : r,
        ),
      );
      set_notice("Request rejected. Employee data has not changed.");
      return;
    }
    if (request.configuration_version !== config_version) {
      set_notice(
        "Configuration version has changed. Reject this request and resubmit against the current version.",
      );
      return;
    }
    if (request.kind === "CONFIGURATION") {
      set_fields(request.fields!);
      set_config_version((v) => v + 1);
    } else {
      const errors = validate_registration(
        request.payload,
        fields,
        employees,
        request.employee_key,
      );
      if (Object.keys(errors).length) {
        set_notice(`Approval blocked: ${Object.values(errors)[0]}`);
        return;
      }
      if (request.kind === "UPDATE") {
        const old = employees.find(
          (e) => e.employee_key === request.employee_key,
        );
        if (!old || old.record_version !== request.record_version) {
          set_notice(
            "Employee version changed. Create a fresh update request.",
          );
          return;
        }
        set_employees((list) =>
          list.map((e) =>
            e.employee_key === old.employee_key
              ? {
                  ...e,
                  ...request.payload,
                  sys_emp_id: old.sys_emp_id,
                  custom_fields: {
                    ...e.custom_fields,
                    ...request.payload.custom_fields,
                  },
                  record_version: e.record_version + 1,
                }
              : e,
          ),
        );
      } else {
        // Demo allocation only. Production IDs must be allocated transactionally by the backend.
        const sys_emp_id =
          request.payload.empid_entry_mode === "MANUAL"
            ? request.payload.sys_emp_id!
            : `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        set_employees((list) => [
          {
            ...request.payload,
            sys_emp_id,
            employee_key: crypto.randomUUID(),
            record_version: 1,
            created_at: new Date().toISOString(),
          },
          ...list,
        ]);
      }
    }
    set_requests((old) =>
      old.map((r) =>
        r.id === request.id ? { ...r, status: "COMPLETED", remarks } : r,
      ),
    );
    set_notice("Approved and completed in the demo workspace.");
  }
  const current = navigation.find((n) => n.id === page)!;
  useEffect(() => {
    if (backend) {
      document.title = `${route.accounts ? "Account access" : route.requestId ? "Request details" : route.dialog === "help" ? "Help & guidance" : current.label} · COS`;
      document.getElementById("main")?.focus({ preventScroll: true });
    }
  }, [backend?.path]);
  return (
    <div className={`workspace ${admin_view ? "admin-workspace" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {mobile_nav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => set_mobile_nav(false)}
        />
      )}
      <aside
        className={`sidebar ${mobile_nav ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <a
          className="brand"
          href={backend ? "/" : "#dashboard"}
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            COS<span className="brand-caption">CONNECTED OPERATIONS</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Building2 size={19} />
          </span>
          <span>
            <strong>Enterprise Management</strong>
            <small>Your workspace</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navigation
            .filter(
              (n) =>
                (n.id !== "configuration" || is_admin) &&
                (n.id !== "registration" || can_write),
            )
            .map((n) => (
              <WorkspaceNav
                connected={!!backend}
                href={
                  n.id === "dashboard" && admin_view
                    ? "/admin"
                    : workspace_paths[n.id]
                }
                key={n.id}
                className={`nav-link ${page === n.id && !route.accounts ? "active" : ""}`}
                onClick={() => navigate(n.id)}
                aria-current={
                  page === n.id && !route.accounts ? "page" : undefined
                }
              >
                <n.icon size={19} strokeWidth={1.7} />
                <span>
                  {admin_view && n.id === "requests"
                    ? "Review requests"
                    : n.label}
                </span>
                {n.id === "requests" && pending.length > 0 && (
                  <span className="nav-count">{pending.length}</span>
                )}
              </WorkspaceNav>
            ))}
          {backend?.manageAccounts && (
            <>
              <div className="nav-caption admin-nav-caption">
                ADMINISTRATION
              </div>
              <button
                className={`nav-link ${route.accounts ? "active" : ""}`}
                aria-current={route.accounts ? "page" : undefined}
                onClick={() => {
                  set_mobile_nav(false);
                  backend.manageAccounts?.();
                }}
              >
                <ShieldCheck size={19} />
                <span>Account approvals</span>
                <ArrowUpRight size={14} />
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <ShieldCheck size={19} />
          </span>
          <strong>Thoughtful by design.</strong>
          <p>
            One place for your people.
            <br />
            Every change, accounted for.
          </p>
          <span className="note-line" />
        </div>
        <div className="sidebar-bottom">
          <button className="nav-link" onClick={() => open_dialog("help")}>
            <HelpCircle size={19} />
            Help & guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="environment">
            <span />
            Development workspace<span className="version">v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => set_mobile_nav(true)}
            >
              <Menu size={22} />
            </button>
            <span className="section-mark">
              <Users size={18} />
            </span>
            <span>HRMS</span>
            <ChevronRight size={15} />
            <span className="topbar-section">Employee Management</span>
          </div>
          <div className="topbar-right">
            <span className="today">{date}</span>
            <button
              className="icon-button notification"
              aria-label={`${pending.length} pending requests`}
              onClick={() => navigate("requests")}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
            <span className="topbar-divider" />
            {!backend && <span className="avatar small">DU</span>}
            {backend ? (
              <>
                <span className="workspace-account-actions">
                  {backend.manageAccounts && (
                    <button
                      className="account-access-button"
                      aria-label="Account access"
                      onClick={backend.manageAccounts}
                    >
                      <ShieldCheck size={15} />
                      <span>Account access</span>
                    </button>
                  )}
                </span>
                <div className="workspace-profile">
                  <span className="avatar small">
                    {initials(backend.username)}
                  </span>
                  <span className="workspace-profile-copy">
                    <strong title={backend.username}>{backend.username}</strong>
                    <small>{role}</small>
                  </span>
                  <button
                    className="workspace-signout"
                    onClick={() => void backend.logout()}
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <label className="role-label">
                <span className="sr-only">Demo role</span>
                <select
                  aria-label="Demo role"
                  value={role}
                  onChange={(e) => {
                    set_role(e.target.value as Role);
                    set_page("dashboard");
                    set_selected(undefined);
                  }}
                >
                  {["Registration user", "System admin", "Employee viewer"].map(
                    (r) => (
                      <option key={r}>{r}</option>
                    ),
                  )}
                </select>
                <span>Demo role</span>
              </label>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="breadcrumbs">
            <span>Enterprise Management</span>
            <ChevronRight size={12} />
            <span>HRMS</span>
            <ChevronRight size={12} />
            <span>Employee Management</span>
            {page !== "dashboard" && (
              <>
                <ChevronRight size={12} />
                <strong>{current.label}</strong>
              </>
            )}
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR PEOPLE, CONNECTED</span>
              <h1>
                {route.accounts && backend
                  ? "Account access"
                  : page === "requests" && admin_view
                    ? "Review requests"
                    : page === "dashboard"
                      ? admin_view
                        ? "Workspace overview"
                        : "Employee Management"
                      : page === "registration" && editing
                        ? "Request employee update"
                        : current.label === "Overview"
                          ? "Overview"
                          : current.label.charAt(0).toUpperCase() +
                            current.label.slice(1)}
              </h1>
              <p>
                {
                  {
                    dashboard: admin_view
                      ? "Review changes, manage access, and keep your people moving forward."
                      : "A clear view of your people. A simpler way to manage what’s next.",
                    registration:
                      "Start with the essentials. Every registration follows an approved path.",
                    employees:
                      "Find the right person. View the details you’re permitted to access.",
                    requests:
                      "Follow every submission, from first review to final approval.",
                    configuration:
                      "Shape your registration experience with versioned field controls.",
                  }[page]
                }
              </p>
            </div>
            {page === "dashboard" && can_write && (
              <Button
                onClick={() => {
                  set_editing(undefined);
                  navigate("registration");
                }}
              >
                <Plus size={17} />
                Register employee
              </Button>
            )}
            {page === "employees" && can_write && (
              <Button
                onClick={() => {
                  set_editing(undefined);
                  navigate("registration");
                }}
              >
                <Plus size={17} />
                Register employee
              </Button>
            )}
          </div>
          <div className="demo-strip">
            <span>
              <Sparkles size={14} />
              <strong>
                {backend ? "Connected workspace" : "Frontend preview"}
              </strong>
              <span className="demo-copy">
                {backend
                  ? "Changes are saved to your local workspace. Use fictitious data only."
                  : "Illustrative data · changes stay in memory and reset on refresh. Use fictitious data only."}
              </span>
            </span>
            <span className="demo-pill">{backend ? "LOCAL" : "DEMO"}</span>
          </div>
          {forbidden ? (
            <section className="panel route-state">
              <ShieldCheck size={30} />
              <h2>Access is restricted.</h2>
              <p>
                Your account cannot open this screen. Ask an administrator if
                you need different access.
              </p>
              <Button onClick={() => navigate("dashboard")}>
                Back to overview
              </Button>
            </section>
          ) : route_loading ? (
            <section className="panel route-state" role="status">
              <h2>Loading this record…</h2>
              <p>Checking the latest details and your access.</p>
            </section>
          ) : route_error ? (
            <section className="panel route-state">
              <h2>We couldn’t open this record.</h2>
              <p role="alert">{route_error}</p>
              <Button
                secondary
                onClick={() => backend?.navigate(workspace_paths[page])}
              >
                Back to list
              </Button>
            </section>
          ) : route.accounts && backend ? (
            <AccountReview standalone close={() => backend.navigate("/")} />
          ) : (
            <>
              {page === "dashboard" && admin_view && (
                <AdminOverview
                  employeeCount={employees.length}
                  favorites={favorites}
                  onFavorite={(page, add) => {
                    void backend?.favorite(page, add);
                  }}
                  requests={requests}
                  fields={fields}
                  version={config_version}
                  onRequests={() => navigate("requests")}
                  onRequest={open_request}
                  onEmployees={() => navigate("employees")}
                  onConfiguration={() => navigate("configuration")}
                  onAccounts={() => backend?.manageAccounts?.()}
                />
              )}
              {page === "dashboard" && !admin_view && (
                <>
                  <div className="stats-grid">
                    <Stat
                      label={
                        backend ? "Loaded employees" : "Registered employees"
                      }
                      value={employees.length}
                      icon={Users}
                      note="Accepted employee identities"
                      color="blue"
                    />
                    <Stat
                      label={
                        backend ? "Loaded pending requests" : "Pending approval"
                      }
                      value={pending.length}
                      icon={Clock3}
                      note="Waiting for an admin review"
                      color="amber"
                    />
                    <Stat
                      label={
                        backend
                          ? "Loaded completed requests"
                          : "Completed requests"
                      }
                      value={
                        requests.filter((r) => r.status === "COMPLETED").length
                      }
                      icon={FileCheck2}
                      note="Reviewed and successfully applied"
                      color="green"
                    />
                    <Stat
                      label="Active configuration"
                      value={`v${config_version}.0`}
                      icon={Settings2}
                      note={`${fields.filter((f) => f.visible).length} custom field${fields.filter((f) => f.visible).length === 1 ? "" : "s"} enabled`}
                      color="violet"
                    />
                  </div>
                  <section className="favorites-section">
                    <div className="section-heading">
                      <div>
                        <Star size={17} />
                        <h2>Your shortcuts</h2>
                        <span className="subtle-label">
                          A little closer to what you use most
                        </span>
                      </div>
                      <span className="small-muted">
                        Select a star to personalise
                      </span>
                    </div>
                    <div className="shortcut-grid">
                      {navigation
                        .filter(
                          (n) =>
                            ["registration", "employees", "requests"].includes(
                              n.id,
                            ) &&
                            (n.id !== "registration" || can_write),
                        )
                        .map((n) => (
                          <article
                            className={`shortcut ${favorites.includes(n.id) ? "is-favorite" : ""}`}
                            key={n.id}
                          >
                            <div className="shortcut-top">
                              <span className={`shortcut-icon ${n.id}`}>
                                <n.icon size={23} strokeWidth={1.7} />
                              </span>
                              <button
                                className={`star-button ${favorites.includes(n.id) ? "selected" : ""}`}
                                aria-label={`${favorites.includes(n.id) ? "Remove" : "Add"} ${n.label} ${favorites.includes(n.id) ? "from" : "to"} favorites`}
                                aria-pressed={favorites.includes(n.id)}
                                onClick={() =>
                                  backend
                                    ? void backend.favorite(
                                        n.id,
                                        !favorites.includes(n.id),
                                      )
                                    : set_favorites((f) =>
                                        f.includes(n.id)
                                          ? f.filter((x) => x !== n.id)
                                          : [...f, n.id],
                                      )
                                }
                              >
                                <Star size={17} />
                              </button>
                            </div>
                            <h3>
                              {n.label.charAt(0).toUpperCase() +
                                n.label.slice(1)}
                            </h3>
                            <p>
                              {n.id === "registration"
                                ? "Give every new beginning a proper start."
                                : n.id === "employees"
                                  ? "The right information, all in one place."
                                  : "Every submission. Every step forward."}
                            </p>
                            <button
                              className="text-button"
                              onClick={() => {
                                if (n.id === "registration")
                                  set_editing(undefined);
                                navigate(n.id);
                              }}
                            >
                              {n.id === "registration"
                                ? "Start a registration"
                                : n.id === "employees"
                                  ? "Find an employee"
                                  : "Track your requests"}
                              <ArrowRight size={16} />
                            </button>
                          </article>
                        ))}
                    </div>
                  </section>
                  <div className="dashboard-lower">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Recent requests</h2>
                          <p>Your latest submissions at a glance</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("requests")}
                        >
                          View all
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <RequestTable
                        requests={requests.slice(0, 4)}
                        onOpen={open_request}
                      />
                      {!requests.length && (
                        <Empty title="A fresh start">
                          Your submissions will appear here.
                        </Empty>
                      )}
                      <div className="panel-foot">
                        <span className="live-dot" />
                        All requests follow a reviewed approval process
                      </div>
                    </section>
                    <section className="getting-started">
                      <span className="guide-icon">
                        <ArrowDownLeft size={22} />
                      </span>
                      <span className="eyebrow">A GOOD PLACE TO BEGIN</span>
                      <h2>
                        People first.
                        <br />
                        Process, simplified.
                      </h2>
                      <p>
                        Register an employee, submit for review, and let the
                        approval process take it from there.
                      </p>
                      <div className="guide-steps">
                        <span>
                          <i>1</i>Enter employee details
                        </span>
                        <span>
                          <i>2</i>Submit for admin approval
                        </span>
                        <span>
                          <i>3</i>Find the approved record
                        </span>
                      </div>
                      <button
                        className="guide-link"
                        onClick={() => open_dialog("help")}
                      >
                        Explore the workflow
                        <ArrowUpRight size={16} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {page === "registration" && (
                <RegistrationForm
                  key={editing?.employee_key ?? "new"}
                  fields={registration_fields}
                  version={config_version}
                  employees={backend ? [] : employees}
                  choices={backend?.choices}
                  allowedModes={backend?.allowed_modes}
                  editing={editing}
                  draft={draft}
                  saveDraft={set_draft}
                  onSubmit={(p) => submit(p, editing)}
                  serverError={backend?.actionError}
                  openImport={open_dialog}
                  canSubmit={role === "Registration user"}
                  onRequests={() => navigate("requests")}
                />
              )}
              {page === "employees" && (
                <EmployeeDetails
                  employees={employees}
                  fields={fields}
                  backend={backend}
                  selected={selected}
                  setSelected={(e) => {
                    if (backend) {
                      if (e) {
                        const path = `/employees/${e.employee_key}`;
                        if (backend.path === path) set_selected(e);
                        else backend.navigate(path);
                      } else backend.navigate("/employees");
                      return;
                    }
                    set_selected(e);
                  }}
                  search={search}
                  setSearch={set_search}
                  canWrite={role === "Registration user"}
                  onUpdate={(employee) => {
                    if (backend) {
                      backend.navigate(
                        `/employees/${employee.employee_key}/edit`,
                      );
                      return;
                    }
                    set_editing(employee);
                    navigate("registration");
                  }}
                />
              )}
              {page === "requests" && (
                <Requests
                  requests={requests}
                  isAdmin={is_admin}
                  onDecision={decide}
                  initialRequestId={backend ? route.requestId : review_request}
                  backend={backend}
                />
              )}
              {page === "configuration" && is_admin && (
                <Configuration
                  fields={fields}
                  version={config_version}
                  pending={requests.some(
                    (r) =>
                      r.kind === "CONFIGURATION" &&
                      r.status === "PENDING_APPROVAL",
                  )}
                  onSubmit={async (next) => {
                    if (backend) {
                      if (await backend.configuration(next))
                        navigate("requests");
                      return;
                    }
                    set_requests((old) => [
                      {
                        id: `DEMO-CFG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                        kind: "CONFIGURATION",
                        status: "PENDING_APPROVAL",
                        payload: empty_registration(),
                        fields: structuredClone(next),
                        configuration_version: config_version,
                        submitted_at: new Date().toISOString(),
                      },
                      ...old,
                    ]);
                    set_notice(
                      "Configuration submitted for review. The active version has not changed.",
                    );
                    navigate("requests");
                  }}
                />
              )}
              {page === "employees" && backend?.moreEmployees && (
                <Button
                  secondary
                  onClick={() => void backend.moreEmployees?.()}
                >
                  Load more employees
                </Button>
              )}
              {page === "requests" && backend?.moreRequests && (
                <Button secondary onClick={() => void backend.moreRequests?.()}>
                  Load more requests
                </Button>
              )}
            </>
          )}
          <footer className="footer">
            <span>
              <span className="mini-brand">COS</span>A connected workplace
              starts with your people.
            </span>
            <span>
              Employee Management<span className="footer-dot">·</span>
              {backend ? "Local development" : "Frontend preview"}
            </span>
          </footer>
        </main>
      </div>
      {(notice || backend?.notice) && (
        <div
          className={`toast ${backend?.actionError ? "toast-error" : ""}`}
          role={backend?.actionError ? "alert" : "status"}
        >
          {backend?.actionError ? (
            <AlertCircle size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <span>{notice || backend?.notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => {
              set_notice("");
              backend?.dismiss();
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!forbidden && (dialog === "bulk" || dialog === "sheet") && (
        <ImportDialog
          kind={dialog}
          fields={registration_fields}
          employees={backend ? [] : employees}
          choices={backend?.choices}
          serverError={backend?.actionError}
          version={config_version}
          close={() => open_dialog(null)}
          onSubmit={(payloads, source) => {
            if (backend) return backend.import(payloads, source);
            if (role !== "Registration user") {
              set_notice("Switch to Registration user to submit imports.");
              return false;
            }
            const now = new Date().toISOString();
            set_requests((old) => [
              ...payloads.map((payload) => ({
                id: `DEMO-REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                kind: "REGISTER" as const,
                status: "PENDING_APPROVAL" as const,
                submitted_at: now,
                configuration_version: config_version,
                payload,
                fields: structuredClone(fields),
              })),
              ...old,
            ]);
            set_notice(
              `${payloads.length} demo row request(s) submitted for approval. No employee records were created.`,
            );
            return true;
          }}
        />
      )}
      {dialog === "help" && (
        <Modal
          title="A clear path from request to record"
          subtitle="A guide to this frontend preview"
          close={() => open_dialog(null)}
        >
          <div className="modal-body">
            <div className="info-callout">
              <ShieldCheck size={20} />
              <p>
                {backend
                  ? "Your changes are saved to this workspace. Employee requests need separate administrator review before they are applied. Google Sheets requires a configured source."
                  : "This is an interactive frontend demonstration. Demo roles simulate permissions and data stays in memory."}
              </p>
            </div>
            <ol className="help-steps">
              <li>
                <strong>Register</strong>
                <p>
                  Use Registration user. Select Manual or Auto, enter fictitious
                  identity details, then submit.
                </p>
              </li>
              <li>
                <strong>Review</strong>
                <p>
                  {backend
                    ? "Open Review requests as a separate administrator, "
                    : "Switch the demo role to System admin. Open My requests, "}
                  inspect a request, and approve or reject it.
                </p>
              </li>
              <li>
                <strong>View</strong>
                <p>
                  Find approved records in Employee details. Sensitive
                  identifiers remain masked, including print.
                </p>
              </li>
            </ol>
            <p className="small-muted">
              {backend
                ? "Your saved requests and records remain available after refresh. Configuration changes require review by another administrator. Google Sheets requires an authorized source before it can be used."
                : "ID rules and controlled values are illustrative. Configuration publishing policy and live integrations require backend implementation. Refreshing clears your changes."}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  note,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  note: string;
  color: string;
}) {
  return (
    <article className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
function RequestTable({
  requests,
  onOpen,
}: {
  requests: RequestRecord[];
  onOpen: (r: RequestRecord) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Request / employee</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Open request</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>
                  {r.kind === "CONFIGURATION"
                    ? "Configuration update"
                    : r.payload.employee_name}
                </strong>
                <span className="cell-secondary">{r.id}</span>
              </td>
              <td className="nowrap">{date_label(r.submitted_at)}</td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`View request ${r.id}`}
                  onClick={() => onOpen(r)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormField({
  label,
  error,
  required,
  hint,
  children,
  id,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className={`form-field ${error ? "invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {children}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}
function RegistrationForm({
  fields,
  version,
  employees,
  editing,
  draft,
  saveDraft,
  onSubmit,
  openImport,
  canSubmit,
  onRequests,
  serverError,
  choices = { nationalities, id_types },
  allowedModes = ["AUTO", "MANUAL"],
}: {
  fields: FieldDefinition[];
  version: number;
  employees: Employee[];
  editing?: Employee;
  draft: Registration;
  saveDraft: (p: Registration) => void;
  onSubmit: (p: Registration) => boolean | Promise<boolean>;
  choices?: { nationalities: string[]; id_types: string[] };
  allowedModes?: string[];
  openImport: (kind: "bulk" | "sheet") => void;
  canSubmit: boolean;
  onRequests: () => void;
  serverError?: string;
}) {
  const [values, set_values] = useState<Registration>(() =>
    editing
      ? {
          ...editing,
          empid_entry_mode: "MANUAL",
          custom_fields: Object.fromEntries(
            Object.entries(editing.custom_fields).filter(([key]) =>
              fields.some((f) => f.id === key && f.visible),
            ),
          ),
        }
      : draft,
  );
  const [errors, set_errors] = useState<Record<string, string>>({});
  const [success, set_success] = useState(false);
  const [confirm_clear, set_confirm_clear] = useState(false);
  function change(key: keyof Registration, value: string) {
    const next = { ...values, [key]: value };
    if (key === "empid_entry_mode" && value === "AUTO") delete next.sys_emp_id;
    set_values(next);
    if (!editing) saveDraft(next);
    set_errors((old) => {
      const e = { ...old };
      delete e[key];
      return e;
    });
  }
  const [saving, set_saving] = useState(false);
  async function submit_form(e: FormEvent) {
    if (saving) return;
    e.preventDefault();
    const payload: Registration = {
      employee_name: values.employee_name.trim(),
      father_name: values.father_name.trim(),
      empid_entry_mode: values.empid_entry_mode,
      nationality_id: values.nationality_id,
      national_id_type_id: values.national_id_type_id,
      id_number: values.id_number.trim(),
      custom_fields: { ...values.custom_fields },
      ...(values.empid_entry_mode === "MANUAL"
        ? { sys_emp_id: values.sys_emp_id?.trim() }
        : {}),
    };
    const found = validate_registration(
      payload,
      fields,
      employees,
      editing?.employee_key,
      choices,
    );
    set_errors(found);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    set_saving(true);
    try {
      if (await onSubmit(payload)) {
        set_success(true);
        if (!editing) saveDraft(empty_registration());
      }
    } finally {
      set_saving(false);
    }
  }
  const input_props = (key: string) => ({
    id: key,
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  });
  if (success)
    return (
      <section className="panel success-panel">
        <span className="success-icon">
          <CheckCircle2 size={34} />
        </span>
        <span className="eyebrow">THE NEXT STEP IS IN GOOD HANDS</span>
        <h2>Submitted for approval</h2>
        <p>
          {values.employee_name}’s {editing ? "update" : "registration"} is
          waiting for admin review.
          <br />
          The employee record will change only after approval.
        </p>
        <div className="button-row">
          <Button onClick={onRequests}>
            View my requests
            <ArrowRight size={16} />
          </Button>
          {!editing && (
            <Button
              secondary
              onClick={() => {
                set_values(empty_registration());
                set_success(false);
              }}
            >
              Register another employee
            </Button>
          )}
        </div>
      </section>
    );
  return (
    <div className="form-layout">
      <section className="panel registration-panel">
        <div className="panel-heading">
          <div>
            <h2>{editing ? "Employee update" : "Employee information"}</h2>
            <p>
              Fields marked <span className="required">*</span> are required.
            </p>
          </div>
          <span className="config-tag">
            <ShieldCheck size={13} />
            Configuration v{version}.0
          </span>
        </div>
        {!editing && (
          <div className="import-strip">
            <span>Bringing more people on board?</span>
            <div>
              <Button secondary onClick={() => openImport("bulk")}>
                <Upload size={15} />
                Bulk Upload
              </Button>
              <Button secondary onClick={() => openImport("sheet")}>
                <FileSpreadsheet size={15} />
                Google Sheet Sync
              </Button>
            </div>
          </div>
        )}
        <form noValidate onSubmit={submit_form}>
          {serverError && (
            <div className="auth-error form-server-error" role="alert">
              {serverError}
            </div>
          )}
          <div className="form-body">
            <div className="form-section-title">
              <span>01</span>
              <h3>Core identity</h3>
            </div>
            <div className="form-grid">
              <FormField
                id="employee_name"
                label="Employee name"
                required
                error={errors.employee_name}
              >
                <input
                  {...input_props("employee_name")}
                  autoComplete="off"
                  maxLength={120}
                  value={values.employee_name}
                  onChange={(e) => change("employee_name", e.target.value)}
                  placeholder="Enter full employee name"
                />
              </FormField>
              <FormField
                id="empid_entry_mode"
                label="EMP ID generation mode"
                required
                error={errors.empid_entry_mode}
                hint="Only Manual and Auto modes are supported."
              >
                <select
                  {...input_props("empid_entry_mode")}
                  disabled={Boolean(editing)}
                  value={values.empid_entry_mode}
                  onChange={(e) => change("empid_entry_mode", e.target.value)}
                >
                  <option value="">Select an ID mode</option>
                  <option value="MANUAL">Manual — enter an employee ID</option>
                  <option value="AUTO">Auto — generate after approval</option>
                </select>
              </FormField>
              {values.empid_entry_mode === "MANUAL" && (
                <FormField
                  id="sys_emp_id"
                  label="SYS_EMP_ID"
                  required
                  error={errors.sys_emp_id}
                  hint={
                    editing
                      ? "Employee IDs cannot be changed through a normal update."
                      : "Stored as text. Leading zeros are preserved."
                  }
                >
                  <input
                    {...input_props("sys_emp_id")}
                    disabled={Boolean(editing)}
                    value={values.sys_emp_id ?? ""}
                    onChange={(e) => change("sys_emp_id", e.target.value)}
                    placeholder="Enter an employee ID"
                    maxLength={120}
                  />
                </FormField>
              )}
              <FormField
                id="father_name"
                label="Father’s name"
                required
                error={errors.father_name}
              >
                <input
                  {...input_props("father_name")}
                  value={values.father_name}
                  onChange={(e) => change("father_name", e.target.value)}
                  placeholder="Enter father’s full name"
                  maxLength={120}
                />
              </FormField>
              <FormField
                id="nationality_id"
                label="Nationality"
                required
                error={errors.nationality_id}
              >
                <select
                  {...input_props("nationality_id")}
                  value={values.nationality_id}
                  onChange={(e) => change("nationality_id", e.target.value)}
                >
                  <option value="">Select nationality</option>
                  {choices.nationalities.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </FormField>
              <FormField
                id="national_id_type_id"
                label="National ID type"
                required
                error={errors.national_id_type_id}
              >
                <select
                  {...input_props("national_id_type_id")}
                  value={values.national_id_type_id}
                  onChange={(e) =>
                    change("national_id_type_id", e.target.value)
                  }
                >
                  <option value="">Select an ID type</option>
                  {choices.id_types.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </FormField>
              <FormField
                id="id_number"
                label="ID number"
                required
                error={errors.id_number}
                hint="Use a fictitious identifier in this development workspace."
              >
                <input
                  {...input_props("id_number")}
                  value={values.id_number}
                  onChange={(e) => change("id_number", e.target.value)}
                  placeholder="Enter document number"
                  autoComplete="off"
                  maxLength={120}
                />
              </FormField>
            </div>
            {fields.some((f) => f.visible) && (
              <>
                <div className="form-section-title additional">
                  <span>02</span>
                  <h3>Additional information</h3>
                  <span className="small-muted">
                    From your active configuration
                  </span>
                </div>
                <div className="form-grid">
                  {fields
                    .filter((f) => f.visible)
                    .map((f) => (
                      <FormField
                        key={f.id}
                        id={f.id}
                        label={f.label}
                        required={f.required}
                        error={errors[f.id]}
                        hint={
                          f.type === "date"
                            ? "Selected date is displayed as DD-MMM-YYYY below."
                            : undefined
                        }
                      >
                        <input
                          {...input_props(f.id)}
                          type={f.type}
                          value={values.custom_fields[f.id] ?? ""}
                          onChange={(e) => {
                            const next = {
                              ...values,
                              custom_fields: {
                                ...values.custom_fields,
                                [f.id]: e.target.value,
                              },
                            };
                            set_values(next);
                            if (!editing) saveDraft(next);
                          }}
                          placeholder={`Enter ${f.label.toLowerCase()}`}
                        />
                        {f.type === "date" && values.custom_fields[f.id] && (
                          <span className="field-hint">
                            {date_label(values.custom_fields[f.id])}
                          </span>
                        )}
                      </FormField>
                    ))}
                </div>
              </>
            )}
            {Object.keys(errors).length > 0 && (
              <div className="error-callout" role="alert">
                Please correct the highlighted fields. Your draft is preserved.
              </div>
            )}
            {!canSubmit && (
              <div className="info-callout">
                <ShieldCheck size={18} />
                <p>
                  Switch to Registration user to submit a request for separate
                  admin review.
                </p>
              </div>
            )}
          </div>
          <div className="form-actions">
            <span>
              <ShieldCheck size={16} />
              Reviewed before it becomes a record
            </span>
            <div>
              <Button secondary onClick={() => set_confirm_clear(true)}>
                Clear draft
              </Button>
              <Button type="submit" disabled={!canSubmit || saving}>
                Submit for approval
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </form>
      </section>
      <aside className="form-aside">
        <div className="aside-card">
          <span className="eyebrow">A SIMPLE, ACCOUNTABLE PROCESS</span>
          <h3>
            Every person.
            <br />A proper beginning.
          </h3>
          <ol className="vertical-steps">
            <li className="current">
              <span>1</span>
              <div>
                <strong>Enter the essentials</strong>
                <p>Identity details and configured fields.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Submit for review</strong>
                <p>An admin checks your submission.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Ready to find</strong>
                <p>Approved employees appear in details.</p>
              </div>
            </li>
          </ol>
        </div>
        <div className="privacy-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Privacy belongs here.</strong>
            <p>
              Restricted identifiers are masked in employee views and printed
              details.
            </p>
          </div>
        </div>
        <p className="small-muted aside-footnote">
          Demo nationality and ID options are illustrative, pending approved
          master data.
        </p>
      </aside>
      {confirm_clear && (
        <Modal
          title="Clear this draft?"
          subtitle="Unsaved entries in this form will be removed."
          close={() => set_confirm_clear(false)}
        >
          <div className="modal-actions">
            <Button secondary onClick={() => set_confirm_clear(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                const next = editing
                  ? { ...editing, empid_entry_mode: "MANUAL" as const }
                  : empty_registration();
                set_values(next);
                if (!editing) saveDraft(next);
                set_errors({});
                set_confirm_clear(false);
              }}
            >
              Clear draft
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EmployeeDetails({
  employees,
  fields,
  selected,
  setSelected,
  search,
  setSearch,
  canWrite,
  onUpdate,
  backend,
}: {
  employees: Employee[];
  fields: FieldDefinition[];
  selected?: Employee;
  setSelected: (e: Employee | undefined) => void;
  search: string;
  setSearch: (v: string) => void;
  canWrite: boolean;
  onUpdate: (e: Employee) => void;
  backend?: BackendContext;
}) {
  const searchGeneration = useRef(0);
  const [matches, set_matches] = useState<Employee[] | null>(null);
  const [cursor, set_cursor] = useState<string | null>(null);
  const [search_busy, set_search_busy] = useState(false);
  const [search_error, set_search_error] = useState("");
  useEffect(() => {
    searchGeneration.current++;
    set_cursor(null);
    set_search_error("");
    if (!backend || !search.trim()) {
      set_matches(null);
      set_cursor(null);
      set_search_error("");
      set_search_busy(false);
      return;
    }
    let active = true;
    set_search_busy(true);
    set_matches([]);
    const timer = setTimeout(() => {
      void backend
        .searchEmployees(search.trim())
        .then((page) => {
          if (active) {
            set_matches(page.items);
            set_cursor(page.next_cursor);
            set_search_error("");
          }
        })
        .catch((error) => {
          if (active) set_search_error(error.message);
        })
        .finally(() => {
          if (active) set_search_busy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, backend?.username]);
  const results =
    matches ??
    employees.filter((e) =>
      `${e.employee_name} ${e.sys_emp_id}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Employee directory</h2>
            <p>
              {employees.length}{" "}
              {backend
                ? "loaded employees · search checks your full permitted directory"
                : "accepted employees · illustrative demo records"}
            </p>
          </div>
          <span className="config-tag">
            <ShieldCheck size={13} />
            Restricted fields masked
          </span>
        </div>
        <div className="search-toolbar">
          <label className="search-box">
            <Search size={18} />
            <span className="sr-only">Search employees by ID or name</span>
            <input
              value={search}
              maxLength={120}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee name or SYS_EMP_ID…"
            />
          </label>
          <span className="small-muted">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        </div>
        {search_busy && (
          <p className="directory-state" role="status">
            Searching your directory…
          </p>
        )}
        {search_error && (
          <p className="directory-state" role="alert">
            {search_error}
          </p>
        )}
        {results.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Nationality</th>
                  <th>Registered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((e) => (
                  <tr key={e.employee_key}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar">
                          {initials(e.employee_name)}
                        </span>
                        <strong>{e.employee_name}</strong>
                      </div>
                    </td>
                    <td className="mono">{e.sys_emp_id}</td>
                    <td>{e.nationality_id}</td>
                    <td>{date_label(e.created_at)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(e)}
                      >
                        View details
                        <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !search_busy && !search_error ? (
          <Empty title="No employees found">
            Try another name or employee ID.
          </Empty>
        ) : null}
        {backend && search && cursor && (
          <div className="directory-state">
            <Button
              secondary
              disabled={search_busy}
              onClick={async () => {
                const generation = searchGeneration.current;
                set_search_busy(true);
                try {
                  const page = await backend.searchEmployees(
                    search.trim(),
                    cursor,
                  );
                  if (generation !== searchGeneration.current) return;
                  set_matches((old) => [...(old ?? []), ...page.items]);
                  set_cursor(page.next_cursor);
                } catch (e) {
                  if (generation !== searchGeneration.current) return;
                  set_search_error(
                    e instanceof Error ? e.message : "Search failed.",
                  );
                } finally {
                  if (generation === searchGeneration.current)
                    set_search_busy(false);
                }
              }}
            >
              Load more matches
            </Button>
          </div>
        )}
      </section>
      {selected && (
        <section className="panel employee-record print-area">
          <div className="panel-heading">
            <div className="person-cell">
              <span className="avatar large">
                {initials(selected.employee_name)}
              </span>
              <div>
                <span className="eyebrow">EMPLOYEE IDENTITY</span>
                <h2>{selected.employee_name}</h2>
                <p>
                  {selected.sys_emp_id} · Record version{" "}
                  {selected.record_version}
                </p>
              </div>
            </div>
            <button
              className="icon-button no-print"
              aria-label="Close employee details"
              onClick={() => setSelected(undefined)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="detail-grid">
            {[
              ["SYS_EMP_ID", selected.sys_emp_id],
              ["Employee name", selected.employee_name],
              ["Father’s name", selected.father_name],
              ["Nationality", selected.nationality_id],
              ["National ID type", selected.national_id_type_id],
              ["ID number", mask(selected.id_number)],
              ...fields
                .filter((f) => f.visible)
                .map((f) => [
                  f.label,
                  selected.custom_fields[f.id]
                    ? f.sensitive
                      ? mask(selected.custom_fields[f.id])
                      : f.type === "date"
                        ? date_label(selected.custom_fields[f.id])
                        : selected.custom_fields[f.id]
                    : "Not provided",
                ]),
            ].map(([label, value]) => (
              <div
                key={label}
                className={
                  fields.some((f) => f.label === label && f.printable === false)
                    ? "no-print"
                    : undefined
                }
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="form-actions no-print">
            <span>
              <ShieldCheck size={16} />
              Sensitive identifiers stay masked
            </span>
            <div>
              {(!backend || backend.can_print) && (
                <Button
                  secondary
                  onClick={async () => {
                    if (backend) {
                      try {
                        const printable = await backend.detail(
                          selected.employee_key,
                          true,
                        );
                        setSelected(printable);
                        setTimeout(() => window.print(), 100);
                      } catch {
                        return;
                      }
                    } else window.print();
                  }}
                >
                  <Printer size={16} />
                  Print details
                </Button>
              )}
              {canWrite && (
                <Button onClick={() => onUpdate(selected)}>
                  Request update
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Requests({
  requests,
  isAdmin,
  onDecision,
  initialRequestId,
  backend,
}: {
  requests: RequestRecord[];
  initialRequestId?: string;
  isAdmin: boolean;
  onDecision: (
    r: RequestRecord,
    approve: boolean,
    remarks: string,
  ) => unknown | Promise<boolean>;
  backend?: BackendContext;
}) {
  const [deciding, set_deciding] = useState(false);
  const [filter, set_filter] = useState("ALL");
  const [selected_id, set_selected_id] = useState<string | null>(
    initialRequestId ?? null,
  );
  useEffect(() => {
    if (backend) {
      set_selected_id(initialRequestId ?? null);
      set_remarks("");
    }
  }, [initialRequestId, !!backend]);
  function close_request() {
    if (backend) backend.navigate("/requests");
    else set_selected_id(null);
  }
  const [remarks, set_remarks] = useState("");
  const selected = requests.find((r) => r.id === selected_id);
  const filtered = requests.filter(
    (r) => filter === "ALL" || r.status === filter,
  );
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{isAdmin ? "Review queue" : "Request activity"}</h2>
            <p>
              {isAdmin
                ? "Inspect submitted versions before approving a change."
                : "A transparent trail for every change you request."}
            </p>
          </div>
          <span className="config-tag">
            <ClipboardList size={13} />
            {requests.length} requests
          </span>
        </div>
        <div className="tabs" role="group" aria-label="Filter requests">
          {[
            ["ALL", "All requests"],
            ["PENDING_APPROVAL", "Pending approval"],
            ["APPROVED", "Approved"],
            ["EXECUTING", "Executing"],
            ["FAILED", "Failed"],
            ["COMPLETED", "Completed"],
            ["REJECTED", "Rejected"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => set_filter(key)}
            >
              {label}
              <span>
                {
                  requests.filter((r) => key === "ALL" || r.status === key)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
        {filtered.length ? (
          <RequestTable
            requests={filtered}
            onOpen={(r) => {
              if (backend) backend.navigate(`/requests/${r.id}`);
              else set_selected_id(r.id);
              set_remarks("");
            }}
          />
        ) : (
          <Empty title="Nothing here yet">
            Requests with this status will appear here.
          </Empty>
        )}
      </section>
      {selected && (
        <Modal
          title={
            selected.kind === "CONFIGURATION"
              ? "Review configuration"
              : selected.payload.employee_name
          }
          subtitle={`${selected.readable_id ?? selected.id} · ${date_label(selected.submitted_at)}`}
          close={close_request}
        >
          <div className="modal-body">
            {backend?.actionError && (
              <p className="auth-error" role="alert">
                {backend.actionError}
              </p>
            )}
            <div className="review-meta">
              <Badge status={selected.status} />
              <span>
                Configuration v{selected.configuration_version}.0 ·{" "}
                {selected.kind}
              </span>
            </div>
            {selected.kind === "CONFIGURATION" ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Type</th>
                      <th>Visible</th>
                      <th>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.fields?.map((f) => (
                      <tr key={f.id}>
                        <td>{f.label}</td>
                        <td>{f.type}</td>
                        <td>{f.visible ? "Yes" : "No"}</td>
                        <td>{f.required ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="detail-grid compact">
                {[
                  ["Employee name", selected.payload.employee_name],
                  ["ID mode", selected.payload.empid_entry_mode],
                  [
                    "Employee ID",
                    selected.payload.sys_emp_id || "Allocated after approval",
                  ],
                  ["Father’s name", selected.payload.father_name],
                  ["Nationality", selected.payload.nationality_id],
                  ["ID type", selected.payload.national_id_type_id],
                  ["ID number", mask(selected.payload.id_number)],
                  ...Object.entries(selected.payload.custom_fields).map(
                    ([key, value]) => [
                      key,
                      selected.fields?.find((f) => f.id === key)?.sensitive ||
                      /pan|aadhaar/i.test(key)
                        ? mask(value)
                        : key === "dob"
                          ? date_label(value)
                          : value,
                    ],
                  ),
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value || "Not provided"}</strong>
                  </div>
                ))}
              </div>
            )}
            {selected.provenance && (
              <div className="info-callout">
                <p>
                  Source: {String(selected.provenance.source_name)} ·{" "}
                  {String(selected.provenance.row_count)} rows · Mapping{" "}
                  {String(selected.provenance.mapping_version)}
                  <br />
                  Source hash: {String(selected.provenance.source_version)}
                </p>
              </div>
            )}
            {selected.items?.map((item, index) => (
              <p key={index}>
                Row {String(item.source_row)}: {String(item.state)}{" "}
                {String(item.error_code ?? "")}
              </p>
            ))}
            {selected.failure_code && (
              <p role="alert">Execution failed: {selected.failure_code}</p>
            )}
            {selected.status === "FAILED" && isAdmin && backend && (
              <Button onClick={() => void backend.retry(selected)}>
                Retry execution
              </Button>
            )}
            {selected.remarks && (
              <p className="info-callout">Review note: {selected.remarks}</p>
            )}
            {selected.status === "PENDING_APPROVAL" && isAdmin ? (
              <>
                <div className="info-callout">
                  <ShieldCheck size={18} />
                  <p>
                    {backend
                      ? "Approval authorizes the submitted version. The server executes it in a separate database transaction. You cannot approve your own request."
                      : "Approval applies this submitted version in memory. This demo simulates separate roles."}
                  </p>
                </div>
                <label className="form-field">
                  Review note
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={remarks}
                    onChange={(e) => set_remarks(e.target.value)}
                    placeholder="Add context for your decision (required for rejection)"
                  />
                </label>
                <div className="button-row">
                  <Button
                    secondary
                    disabled={!remarks.trim() || deciding}
                    onClick={async () => {
                      if (deciding) return;
                      set_deciding(true);
                      try {
                        const ok = await onDecision(selected, false, remarks);
                        if (ok !== false) close_request();
                      } finally {
                        set_deciding(false);
                      }
                    }}
                  >
                    <X size={16} />
                    Reject request
                  </Button>
                  <Button
                    onClick={async () => {
                      if (deciding) return;
                      set_deciding(true);
                      try {
                        const ok = await onDecision(selected, true, remarks);
                        if (ok !== false) close_request();
                      } finally {
                        set_deciding(false);
                      }
                    }}
                  >
                    <Check size={16} />
                    {backend ? "Approve request" : "Approve & apply"}
                  </Button>
                </div>
              </>
            ) : (
              selected.status === "PENDING_APPROVAL" && (
                <div className="info-callout">
                  <Clock3 size={18} />
                  <p>
                    {backend
                      ? "Waiting for a separate administrator to review this version."
                      : "Waiting for review. Switch the demo role to System admin to try the approval flow."}
                  </p>
                </div>
              )
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function Configuration({
  fields,
  version,
  pending,
  onSubmit,
}: {
  fields: FieldDefinition[];
  version: number;
  pending: boolean;
  onSubmit: (f: FieldDefinition[]) => void;
}) {
  const [draft_fields, set_draft_fields] = useState(() =>
    structuredClone(fields),
  );
  const [adding, set_adding] = useState(false);
  const [label, set_label] = useState("");
  const [type, set_type] = useState<FieldDefinition["type"]>("text");
  const [error, set_error] = useState("");
  const changed = JSON.stringify(fields) !== JSON.stringify(draft_fields);
  function update(
    id: string,
    key: "visible" | "required" | "sensitive",
    value: boolean,
  ) {
    set_draft_fields((old) =>
      old.map((f) =>
        f.id === id
          ? {
              ...f,
              [key]: value,
              ...(key === "visible" && !value ? { required: false } : {}),
            }
          : f,
      ),
    );
    set_error("");
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Registration configuration</h2>
          <p>
            Active v{version}.0 · Changes create a new version after approval.
          </p>
        </div>
        <span className="config-tag">
          <ShieldCheck size={14} />
          System admin only
        </span>
      </div>
      <div className="form-body">
        <div className="info-callout">
          <ShieldCheck size={19} />
          <p>
            Core identity fields are always required. Additional fields can be
            configured below. Published configurations remain unchanged until a
            configuration request is approved.
          </p>
        </div>
        <div className="config-modes">
          <div>
            <span className="small-muted">Allowed ID modes</span>
            <strong>
              Manual <span className="inline-separator">/</span> Auto
            </strong>
          </div>
          <div>
            <span className="small-muted">Default ID mode</span>
            <strong>Explicit selection required</strong>
          </div>
          <div>
            <span className="small-muted">Configuration status</span>
            <Badge status="ACTIVE" />
          </div>
        </div>
        <div className="section-heading">
          <div>
            <h3>Custom fields</h3>
            <span className="small-muted">
              Definitions and employee responses stay separate
            </span>
          </div>
          <Button
            secondary
            onClick={() => {
              set_label("");
              set_adding(true);
            }}
          >
            <Plus size={15} />
            Add field
          </Button>
        </div>
        <div className="table-wrap config-table">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Data type</th>
                <th>Register & view</th>
                <th>Required</th>
                <th>Sensitive / masked</th>
              </tr>
            </thead>
            <tbody>
              {draft_fields.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong>{f.label}</strong>
                    <span className="cell-secondary mono">{f.id}</span>
                  </td>
                  <td className="capitalize">{f.type}</td>
                  <td>
                    <input
                      type="checkbox"
                      className="toggle"
                      aria-label={`Enable ${f.label}`}
                      checked={f.visible}
                      onChange={(e) =>
                        update(f.id, "visible", e.target.checked)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Require ${f.label}`}
                      disabled={!f.visible}
                      checked={f.required}
                      onChange={(e) =>
                        update(f.id, "required", e.target.checked)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Mark ${f.label} sensitive`}
                      checked={f.sensitive}
                      onChange={(e) =>
                        update(f.id, "sensitive", e.target.checked)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p className="error-callout" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <p className="info-callout">
            A configuration request is already awaiting review. Resolve it
            before submitting another.
          </p>
        )}
      </div>
      <div className="form-actions">
        <span>
          <FileCheck2 size={16} />
          {changed
            ? "You have unpublished changes"
            : "Your configuration is up to date"}
        </span>
        <div>
          <Button
            secondary
            disabled={!changed}
            onClick={() => set_draft_fields(structuredClone(fields))}
          >
            Discard changes
          </Button>
          <Button
            disabled={!changed || pending}
            onClick={() => onSubmit(draft_fields)}
          >
            Submit configuration
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
      {adding && (
        <Modal
          title="Add a custom field"
          subtitle="New fields remain draft until configuration approval."
          close={() => set_adding(false)}
        >
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const id = label
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_|_$/g, "");
              const reserved = [
                "employee_name",
                "empid_entry_mode",
                "sys_emp_id",
                "father_name",
                "nationality_id",
                "national_id_type_id",
                "id_number",
              ];
              if (
                !id ||
                draft_fields.some((f) => f.id === id) ||
                reserved.includes(id)
              ) {
                set_error(
                  "Use a unique field name that does not replace a core identity field.",
                );
                return;
              }
              set_draft_fields((old) => [
                ...old,
                {
                  id,
                  label: label.trim(),
                  type,
                  visible: true,
                  required: false,
                  sensitive: true,
                },
              ]);
              set_adding(false);
              set_error("");
            }}
          >
            <label className="form-field">
              Field label
              <input
                required
                value={label}
                maxLength={60}
                onChange={(e) => set_label(e.target.value)}
                placeholder="For example, Emergency contact"
              />
            </label>
            <label className="form-field">
              Data type
              <select
                value={type}
                onChange={(e) =>
                  set_type(e.target.value as FieldDefinition["type"])
                }
              >
                <option value="text">Text</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
              </select>
            </label>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <Button type="submit">
              <Plus size={16} />
              Add to draft
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function WorkspaceNav({
  connected,
  href,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  connected: boolean;
  href: string;
}) {
  if (!connected)
    return (
      <button {...props} onClick={onClick}>
        {children}
      </button>
    );
  return (
    <Link
      href={href}
      className={props.className}
      aria-current={props["aria-current"]}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
      }}
    >
      {children}
    </Link>
  );
}
