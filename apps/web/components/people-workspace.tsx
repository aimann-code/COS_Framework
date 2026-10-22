"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileImage,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  api,
  ApiError,
  logout,
  API_URL,
  type Session,
  type Configuration,
} from "../lib/cos-api";
import {
  onboarding,
  type ProfileDraft,
  type EmployeeProfile,
  type ProfileSummary,
  type DraftSummary,
  type OnboardingSchema,
} from "../lib/onboarding-api";
import {
  draftSections,
  addressFields,
  repeatGroups,
} from "../lib/employee-onboarding-draft";
import type { FieldDefinition } from "../lib/cos-domain";
import EmployeeOnboardingPreview from "./employee-onboarding-preview";
import styles from "./employee-onboarding-preview.module.css";

type Account = { account_id: string; full_name: string; email: string };
type ConfigRequest = {
  request_id: string;
  request_version: number;
  configuration_version: number;
  status: string;
  payload: { fields: FieldDefinition[] };
  remarks?: string;
  failure_code?: string;
};
type ScreenData = {
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
};
const docNames: Record<string, string> = {
  AADHAAR_FRONT: "Aadhaar front",
  AADHAAR_BACK: "Aadhaar back",
  PAN: "PAN card",
};

export default function PeopleWorkspace() {
  const path = usePathname(),
    router = useRouter();
  const [session, setSession] = useState<Session>();
  const [data, setData] = useState<ScreenData>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [note, setNote] = useState("");

  const hr = !!session?.roles.includes("REGISTRAR"),
    admin = !!session?.roles.includes("ADMIN"),
    employee = !!session?.roles.includes("EMPLOYEE");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    setNote("");
    setSearch("");
    setAppliedSearch("");
    const load = async () => {
      try {
        const s = await api<Session>("/session");
        if (!active) return;
        if (!s.authenticated) {
          router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
          return;
        }
        setSession(s);
        const isHR = s.roles.includes("REGISTRAR"),
          isAdmin = s.roles.includes("ADMIN"),
          isEmployee = s.roles.includes("EMPLOYEE");
        if (!isHR && !isAdmin && !isEmployee)
          throw new Error(
            "This legacy viewer account is not an HR or linked employee account. Ask HR to provision the correct access.",
          );
        const schema = await onboarding.schema();
        const next: ScreenData = { schema };
        if (path === "/people/register") {
          if (!isHR) throw new Error("Only HR can register employees.");
        } else if (/^\/people\/drafts\/[0-9a-f-]{36}$/.test(path)) {
          next.draft = await onboarding.draft(path.split("/").at(-1)!);
          if (next.draft.status !== "DRAFT")
            throw new Error(
              `This draft is ${next.draft.status.toLowerCase()} and cannot be edited. Open the profile or review queue.`,
            );
        } else if (path === "/people/change") {
          if (!isEmployee) throw new Error("Employee access is required.");
          next.employee = await onboarding.me();
        } else if (path === "/people/me") {
          next.employee = await onboarding.me();
        } else if (/^\/people\/employees\/[0-9a-f-]{36}$/.test(path)) {
          next.employee = await onboarding.employee(path.split("/").at(-1)!);
        } else if (/^\/people\/reviews\/[0-9a-f-]{36}$/.test(path)) {
          if (!isHR) throw new Error("Only HR can review employee requests.");
          next.draft = await onboarding.draft(path.split("/").at(-1)!);
          if (next.draft.employee_id)
            next.employee = await onboarding.employee(next.draft.employee_id);
        } else if (/^\/people\/requests\/[0-9a-f-]{36}$/.test(path)) {
          if (!isEmployee) throw new Error("Employee access is required.");
          next.draft = await onboarding.draft(path.split("/").at(-1)!);
          next.employee = await onboarding.me();
        } else if (path === "/people/requests") {
          if (!isEmployee) throw new Error("Employee access is required.");
          const [requests, drafts] = await Promise.all([
            onboarding.requests(),
            onboarding.drafts(),
          ]);
          next.reviews = requests;
          next.drafts = drafts;
        } else if (path === "/people/reviews") {
          if (!isHR) throw new Error("Only HR can review employee requests.");
          next.reviews = await onboarding.drafts(true);
        } else if (path === "/people/accounts") {
          if (!isHR) throw new Error("Only HR can activate employee accounts.");
          next.accounts = await api<Account[]>("/accounts/pending");
        } else if (path === "/people/configuration") {
          if (!isHR && !isAdmin)
            throw new Error("HR or company administrator access is required.");
          const [configuration, requests] = await Promise.all([
            api<Configuration>("/components/EMP_Reg/configuration"),
            api<{ items: ConfigRequest[] }>("/requests?limit=100"),
          ]);
          next.config = configuration;
          next.configs = requests.items;
        } else if (path === "/people" || path === "/people/directory") {
          if (isEmployee) {
            router.replace("/people/me");
            return;
          }
          if (isAdmin) {
            router.replace("/people/configuration");
            return;
          }
          const [drafts, profiles, reviews] = await Promise.all([
            onboarding.drafts(),
            onboarding.employees(),
            onboarding.drafts(true),
          ]);
          next.drafts = drafts;
          next.employees = profiles.items;
          next.next = profiles.next_cursor;
          next.reviews = reviews;
        } else throw new Error("This employee-management page does not exist.");
        if (active) setData(next);
      } catch (e) {
        if (active) {
          if (e instanceof ApiError && e.status === 401)
            router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load Employee Management.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [path, revision, router]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const expire = () => {
      setData(undefined);
      setSession(undefined);
      router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
    };
    const verify = async () => {
      try {
        const current = await api<Session>("/session");
        if (
          active &&
          (!current.authenticated || current.username !== session.username)
        )
          expire();
      } catch {
        /* A network outage does not prove session expiry. */
      }
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("cos-session")
        : undefined;
    if (channel) channel.onmessage = expire;
    window.addEventListener("focus", verify);
    window.addEventListener("cos-session-ended", expire);
    const timer = window.setInterval(verify, 60000);
    return () => {
      active = false;
      channel?.close();
      window.clearInterval(timer);
      window.removeEventListener("focus", verify);
      window.removeEventListener("cos-session-ended", expire);
    };
  }, [session, path, router]);
  const action = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The operation failed.");
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => setRevision((r) => r + 1);
  const isForm =
    path === "/people/register" ||
    path === "/people/change" ||
    path.startsWith("/people/drafts/");
  const form =
    data && session && isForm ? (
      <EmployeeOnboardingPreview
        key={path}
        live={{
          schema: data.schema,
          draft: data.draft,
          employee: data.employee,
          employeeMode: employee,
          embedded: true,
          hrEdit: hr && !!data.draft?.employee_id,
          onSaved: (d) => {
            if (path !== `/people/drafts/${d.draft_id}`)
              router.replace(`/people/drafts/${d.draft_id}`);
          },
          onCompleted: (p) => {
            setNotice(
              p
                ? `Employee ${p.employee_code} ${hr && data.draft?.employee_id ? "updated" : "registered"}. No admin approval was required.`
                : "Your update request was sent to HR. Your saved profile has not changed.",
            );
            router.push(
              p ? `/people/employees/${p.employee_id}` : "/people/me",
            );
          },
        }}
      />
    ) : null;
  const nav = [
    ...(hr
      ? [
          { url: "/people", label: "HR overview" },
          { url: "/people/register", label: "Register employee" },
          { url: "/people/directory", label: "Employee directory" },
          { url: "/people/reviews", label: "Employee requests" },
          { url: "/people/accounts", label: "Employee access" },
        ]
      : []),
    ...(employee
      ? [
          { url: "/people/me", label: "My profile" },
          { url: "/people/change", label: "Request an update" },
          { url: "/people/requests", label: "My requests" },
        ]
      : []),
    ...(hr || admin
      ? [
          {
            url: "/people/configuration",
            label: admin ? "Configuration approvals" : "Form configuration",
          },
        ]
      : []),
  ];
  const title =
    path === "/people/requests"
      ? "My update requests"
      : path.startsWith("/people/requests/")
        ? "My update request"
        : path === "/people/accounts"
          ? "Employee account activation"
          : path === "/people/configuration"
            ? admin
              ? "Configuration approvals"
              : "Form configuration"
            : path.startsWith("/people/reviews/")
              ? "Review employee update"
              : path === "/people/reviews"
                ? "Employee update requests"
                : path === "/people/me"
                  ? "My employee profile"
                  : data?.employee
                    ? data.employee.display_name
                    : path === "/people/directory"
                      ? "Employee directory"
                      : "HR workspace";
  return (
    <div className={styles.portal}>
      <a href="#people-content" className={styles.skip}>
        Skip to workspace content
      </a>
      <header className={styles.portalHeader}>
        <Link href="/people" className={styles.portalBrand}>
          COS <span>Employee Management</span>
        </Link>
        <div>
          <span>
            {session?.username ?? "Checking session"} ·{" "}
            {hr ? "HR" : admin ? "Company admin" : employee ? "Employee" : ""}
          </span>
          {session && (
            <button
              type="button"
              onClick={() =>
                void action(async () => {
                  await logout();
                  router.replace("/sign-in");
                })
              }
              disabled={busy}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <div className={styles.portalLayout}>
        <nav className={styles.portalNav} aria-label="Employee Management">
          <div className={styles.companyBadge}>
            <span>M</span>
            <div>
              <strong>MHL</strong>
              <small>Restaurant &amp; cloud kitchen</small>
            </div>
          </div>
          {nav.map((n) => (
            <Link
              key={n.url}
              href={n.url}
              aria-current={
                path === n.url ||
                (n.url !== "/people" && path.startsWith(`${n.url}/`)) ||
                (n.url === "/people/change" &&
                  employee &&
                  path.startsWith("/people/drafts/")) ||
                (n.url === "/people/register" &&
                  path.startsWith("/people/drafts/") &&
                  !data?.draft?.employee_id) ||
                (n.url === "/people/directory" &&
                  (path.startsWith("/people/employees/") ||
                    (hr && !!data?.draft?.employee_id)))
                  ? "page"
                  : undefined
              }
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <main id="people-content" className={styles.portalMain}>
          {form}
          <div className={styles.pageHeading} hidden={!!form}>
            <div>
              <span className={styles.eyebrow}>MHL / PEOPLE</span>
              <h1>{title}</h1>
            </div>
            <button
              type="button"
              className={styles.secondary}
              onClick={refresh}
              disabled={loading || busy}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          {!isForm && data?.schema.local_environment && (
            <p className={styles.previewBanner}>
              Local development · Use fictitious employee information and
              synthetic document images only.
            </p>
          )}
          {notice && (
            <p role="status" className={styles.notice}>
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="error-callout">
              {error}
            </p>
          )}
          {loading && (
            <div role="status" className={styles.formPanel}>
              <div className={styles.formBody}>
                Restoring your secure workspace…
              </div>
            </div>
          )}
          {data && !loading && (
            <>
              {path === "/people" && (
                <>
                  <div className={styles.portalCards}>
                    <Link href="/people/register">
                      <Plus size={22} />
                      <strong>Register an employee</strong>
                      <span>Complete the profile and save directly as HR.</span>
                    </Link>
                    <Link href="/people/reviews">
                      <ClipboardIcon />
                      <strong>
                        {data.reviews?.length} loaded update requests
                      </strong>
                      <span>
                        Validate employee proposals before applying changes.
                      </span>
                    </Link>
                    <Link href="/people/accounts">
                      <Users size={22} />
                      <strong>Activate employee access</strong>
                      <span>
                        Verify identity and link to a specific employee record.
                      </span>
                    </Link>
                  </div>
                  <h2 className={styles.portalSectionTitle}>
                    Your saved drafts
                  </h2>
                  {data.drafts?.length ? (
                    <div className={styles.portalList}>
                      {data.drafts.map((d) => (
                        <Link
                          href={`/people/drafts/${d.draft_id}`}
                          key={d.draft_id}
                        >
                          <strong>Draft · {d.draft_id.slice(0, 8)}</strong>
                          <span>
                            Version {d.version} ·{" "}
                            {new Date(d.updated_at).toLocaleString("en-IN")}
                          </span>
                          <ArrowRight size={16} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyState}>
                      No incomplete drafts. Start a registration to create one.
                    </p>
                  )}
                </>
              )}
              {(path === "/people/directory" || path === "/people") && (
                <>
                  <h2 className={styles.portalSectionTitle}>
                    Employee directory
                  </h2>
                  <form
                    className={styles.portalSearch}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const result = await onboarding.employees(search);
                        setAppliedSearch(search);
                        setData(
                          (d) =>
                            d && {
                              ...d,
                              employees: result.items,
                              next: result.next_cursor,
                            },
                        );
                      });
                    }}
                  >
                    <label htmlFor="people-search">
                      Search by name or employee code
                    </label>
                    <div>
                      <input
                        id="people-search"
                        maxLength={120}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button
                        type="submit"
                        className={styles.secondary}
                        disabled={busy}
                      >
                        Search
                      </button>
                    </div>
                  </form>
                  <div className={styles.portalTableWrap}>
                    <table className={styles.portalTable}>
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Employee code</th>
                          <th>Profile version</th>
                          <th>
                            <span className="sr-only">Open profile</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.employees?.map((e) => (
                          <tr key={e.employee_id}>
                            <td>{e.display_name}</td>
                            <td>{e.employee_code}</td>
                            <td>{e.version}</td>
                            <td>
                              <Link href={`/people/employees/${e.employee_id}`}>
                                View profile →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.employees?.length && (
                      <p className={styles.emptyState}>
                        No matching employees.
                      </p>
                    )}
                  </div>
                  {data.next && (
                    <button
                      className={styles.secondary}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const page = await onboarding.employees(
                            appliedSearch,
                            data.next!,
                          );
                          setData(
                            (d) =>
                              d && {
                                ...d,
                                employees: [
                                  ...(d.employees ?? []),
                                  ...page.items,
                                ],
                                next: page.next_cursor,
                              },
                          );
                        })
                      }
                    >
                      Load more employees
                    </button>
                  )}
                </>
              )}
              {(path === "/people/me" ||
                path.startsWith("/people/employees/")) &&
                data.employee && (
                  <>
                    <div className={styles.profileStrip}>
                      <div>
                        <strong>{data.employee.employee_code}</strong>
                        <span>Profile version {data.employee.version}</span>
                      </div>
                      {hr && (
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const d = await onboarding.startEdit(
                                data.employee!.employee_id,
                                crypto.randomUUID(),
                                data.employee!.version,
                              );
                              router.push(`/people/drafts/${d.draft_id}`);
                            })
                          }
                        >
                          Edit employee
                        </button>
                      )}
                      {employee && (
                        <Link className={styles.primary} href="/people/change">
                          Request changes <ArrowRight size={15} />
                        </Link>
                      )}
                    </div>
                    <ProfileDetails employee={data.employee} />
                    {employee && (
                      <p className={styles.privateNote}>
                        Employment and pay details are maintained by HR.
                        Personal profile changes are submitted for HR review.
                      </p>
                    )}
                  </>
                )}
              {path === "/people/requests" && !!data.drafts?.length && (
                <section className={styles.profileCard}>
                  <h2>Unsubmitted drafts</h2>
                  <div className={styles.portalList}>
                    {data.drafts.map((d) => (
                      <Link
                        key={d.draft_id}
                        href={`/people/drafts/${d.draft_id}`}
                      >
                        <strong>Resume draft {d.draft_id.slice(0, 8)}</strong>
                        <span>Version {d.version}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {(path === "/people/reviews" || path === "/people/requests") && (
                <div className={styles.portalList}>
                  {data.reviews?.length ? (
                    data.reviews.map((d) => (
                      <Link
                        key={d.draft_id}
                        href={`${employee ? "/people/requests" : "/people/reviews"}/${d.draft_id}`}
                      >
                        <strong>
                          Employee update · {d.status.replaceAll("_", " ")}
                        </strong>
                        <span>
                          {new Date(d.updated_at).toLocaleString("en-IN")} ·
                          Version {d.version}
                        </span>
                        <ArrowRight size={16} />
                      </Link>
                    ))
                  ) : (
                    <p className={styles.emptyState}>
                      No employee updates are waiting for HR review.
                    </p>
                  )}
                </div>
              )}
              {(path.startsWith("/people/reviews/") ||
                path.startsWith("/people/requests/")) &&
                data.draft && (
                  <>
                    <p className={styles.privateNote}>
                      Status: {data.draft.status}. Approval applies the proposal
                      atomically, only if the employee and form versions still
                      match.
                    </p>
                    <ProfileDiff draft={data.draft} employee={data.employee} />
                    {data.draft.review_note && (
                      <p className={styles.notice}>
                        HR review note: {data.draft.review_note}
                      </p>
                    )}
                    <DocumentLinks documents={data.draft.documents} />
                    {hr && data.draft.status === "SUBMITTED" && (
                      <div className={styles.reviewActions}>
                        <label htmlFor="profile-review-note">
                          Review note <span>(required to reject)</span>
                        </label>
                        <textarea
                          id="profile-review-note"
                          rows={3}
                          maxLength={500}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                        <div>
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={busy || !note.trim()}
                            onClick={() =>
                              void action(async () => {
                                await onboarding.decide(
                                  data.draft!.draft_id,
                                  data.draft!.version,
                                  "REJECT",
                                  note,
                                );
                                setNotice(
                                  "Update rejected. Employee data is unchanged.",
                                );
                                router.push("/people/reviews");
                              })
                            }
                          >
                            Reject request
                          </button>
                          <button
                            type="button"
                            className={styles.primary}
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await onboarding.decide(
                                  data.draft!.draft_id,
                                  data.draft!.version,
                                  "APPROVE",
                                  note,
                                );
                                setNotice(
                                  "Update approved and applied to the employee profile.",
                                );
                                router.push("/people/reviews");
                              })
                            }
                          >
                            Approve and apply
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              {path === "/people/accounts" && (
                <>
                  <p className={styles.privateNote}>
                    Verify the applicant’s identity and employee code before
                    activation. Signup cannot request HR or administrator
                    privileges.
                  </p>
                  {data.accounts?.length ? (
                    data.accounts.map((a) => (
                      <EmployeeAccessCard
                        key={a.account_id}
                        account={a}
                        busy={busy}
                        run={action}
                        notify={setNotice}
                        reload={refresh}
                      />
                    ))
                  ) : (
                    <p className={styles.emptyState}>
                      No pending employee account requests.
                    </p>
                  )}
                </>
              )}
              {path === "/people/configuration" && data.config && (
                <FormConfiguration
                  config={data.config}
                  requests={data.configs ?? []}
                  admin={admin}
                  busy={busy}
                  run={action}
                  onNotice={setNotice}
                  onReload={refresh}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function ClipboardIcon() {
  return <ShieldCheck size={22} />;
}
function DocumentLinks({
  documents,
}: {
  documents: ProfileDraft["documents"];
}) {
  return (
    <section className={styles.profileCard}>
      <h2>Protected documents</h2>
      {documents.length ? (
        documents.map((d) => (
          <a
            key={d.document_id}
            className={styles.documentLink}
            href={`${API_URL}/onboarding/documents/${d.document_id}/content`}
          >
            <FileImage size={17} />
            {docNames[d.kind] ?? d.kind} · {Math.ceil(d.byte_count / 1024)} KB ·
            Download
          </a>
        ))
      ) : (
        <p>No document photos attached.</p>
      )}
    </section>
  );
}
function ProfileDetails({ employee }: { employee: EmployeeProfile }) {
  const p = employee.profile;
  const base = new Set(
    draftSections.flatMap((s) => s.fields).map((f) => f.key),
  );
  return (
    <>
      <div className={styles.profileGrid}>
        {draftSections.map((s) => (
          <section key={s.id} className={styles.profileCard}>
            <h2>{s.title}</h2>
            <dl className={styles.reviewGrid}>
              {s.fields.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{p.values[f.key] || "Not provided"}</dd>
                </div>
              ))}
              {s.id === "addresses" &&
                ["permanent", "local"].map((prefix) => (
                  <div key={prefix} className={styles.wide}>
                    <dt>
                      {prefix === "permanent"
                        ? "Permanent address"
                        : "Local / temporary address"}
                    </dt>
                    <dd>
                      {addressFields
                        .map((f) => p.values[`${prefix}_${f.key}`])
                        .filter(Boolean)
                        .join(", ") || "Not provided"}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
      {Object.entries(p.groups).map(([group, entries]) => (
        <section key={group} className={styles.profileCard}>
          <h2>{repeatGroups[group]?.title ?? group}</h2>
          {entries.map((e, i) => (
            <dl key={e.id} className={styles.reviewGrid}>
              {Object.entries(e.values).map(([key, v]) => (
                <div key={key}>
                  <dt>
                    {i + 1}.{" "}
                    {repeatGroups[group]?.fields.find((f) => f.key === key)
                      ?.label ?? key}
                  </dt>
                  <dd>{v || "Not provided"}</dd>
                </div>
              ))}
            </dl>
          ))}
        </section>
      ))}
      {Object.entries(p.values).filter(
        ([key]) =>
          !base.has(key) &&
          !key.startsWith("permanent_") &&
          !key.startsWith("local_"),
      ).length > 0 && (
        <section className={styles.profileCard}>
          <h2>Company fields</h2>
          <dl className={styles.reviewGrid}>
            {Object.entries(p.values)
              .filter(
                ([key]) =>
                  !base.has(key) &&
                  !key.startsWith("permanent_") &&
                  !key.startsWith("local_"),
              )
              .map(([key, v]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{v || "Not provided"}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      <DocumentLinks documents={employee.documents} />
    </>
  );
}
function ProfileDiff({
  draft,
  employee,
}: {
  draft: ProfileDraft;
  employee?: EmployeeProfile;
}) {
  const keys = [
    ...new Set([
      ...Object.keys(employee?.profile.values ?? {}),
      ...Object.keys(draft.profile.values),
    ]),
  ];
  return (
    <>
      <div className={styles.portalTableWrap}>
        <table className={styles.portalTable}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Saved value</th>
              <th>Proposed value</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <th>
                  {draftSections
                    .flatMap((s) => s.fields)
                    .find((f) => f.key === key)?.label ??
                    key.replaceAll("_", " ")}
                </th>
                <td>{employee?.profile.values[key] || "Not provided"}</td>
                <td>
                  {draft.profile.values[key] || "Not provided"}
                  {draft.profile.values[key] !==
                    employee?.profile.values[key] && (
                    <strong className={styles.changed}>Changed</strong>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.entries(draft.profile.groups).map(([group, entries]) => (
        <section className={styles.profileCard} key={group}>
          <h2>{repeatGroups[group]?.title ?? group}</h2>
          {entries.length ? (
            entries.map((e) => (
              <dl className={styles.reviewGrid} key={e.id}>
                {Object.entries(e.values).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {repeatGroups[group]?.fields.find((f) => f.key === k)
                        ?.label ?? k}
                    </dt>
                    <dd>{v || "Not provided"}</dd>
                  </div>
                ))}
              </dl>
            ))
          ) : (
            <p>No entries proposed.</p>
          )}
        </section>
      ))}
    </>
  );
}

function FormConfiguration({
  config,
  requests,
  admin,
  busy,
  run,
  onNotice,
  onReload,
}: {
  config: Configuration;
  requests: ConfigRequest[];
  admin: boolean;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onNotice: (value: string) => void;
  onReload: () => void;
}) {
  const [fields, setFields] = useState(() => structuredClone(config.fields));
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldDefinition["type"]>("text");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const keys = useRef(new Map<string, string>());
  const unchanged = JSON.stringify(fields) === JSON.stringify(config.fields);
  return (
    <>
      <p className={styles.privateNote}>
        Active configuration v{config.version}. New and changed additional
        fields take effect only after admin approval. Core profile sections are
        defined by Employee Management.
      </p>
      {!admin && (
        <section className={styles.profileCard}>
          <h2>Propose additional-field changes</h2>
          <div className={styles.portalTableWrap}>
            <table className={styles.portalTable}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Enabled</th>
                  <th>Required</th>
                  <th>Sensitive</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td>{f.label}</td>
                    <td>{f.type}</td>
                    {(["visible", "required", "sensitive"] as const).map(
                      (key) => (
                        <td key={key}>
                          <input
                            type="checkbox"
                            aria-label={`${key} ${f.label}`}
                            checked={f[key]}
                            disabled={
                              busy ||
                              ["dob", "pan_number", "aadhaar_number"].includes(
                                f.id,
                              )
                            }
                            onChange={(e) =>
                              setFields((old) =>
                                old.map((x) =>
                                  x.id === f.id
                                    ? {
                                        ...x,
                                        [key]: e.target.checked,
                                        ...(key === "visible" &&
                                        !e.target.checked
                                          ? { required: false }
                                          : {}),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.inlineForm}>
            <label>
              New field label
              <input
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label>
              Field type
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as FieldDefinition["type"])
                }
              >
                <option value="text">Text</option>
                <option value="date">Date</option>
                <option value="number">Number</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.secondary}
              disabled={busy || !label.trim()}
              onClick={() => {
                const slug = label
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_|_$/g, "")
                  .slice(0, 45);
                const id = `custom_${slug}`;
                if (fields.some((f) => f.id === id) || !slug) {
                  onNotice("Choose a unique field label.");
                  return;
                }
                setFields((f) => [
                  ...f,
                  {
                    id,
                    label: label.trim(),
                    type,
                    required: false,
                    visible: true,
                    sensitive: false,
                    read_roles: ["ADMIN", "REGISTRAR", "EMPLOYEE"],
                    write_roles: ["REGISTRAR", "EMPLOYEE"],
                    printable: false,
                    display_order: f.length,
                    group_key: "company",
                    max_length: 500,
                  },
                ]);
                setLabel("");
              }}
            >
              Add field
            </button>
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={
              busy ||
              unchanged ||
              requests.some((r) => r.status === "PENDING_APPROVAL")
            }
            onClick={() =>
              void run(async () => {
                const body = JSON.stringify({
                  component_id: "EMP_Reg",
                  operation: "CONFIGURATION",
                  configuration_version: config.version,
                  payload: { fields },
                });
                if (!keys.current.has(body))
                  keys.current.set(body, crypto.randomUUID());
                await api("/requests", {
                  method: "POST",
                  headers: { "Idempotency-Key": keys.current.get(body)! },
                  body,
                });
                onNotice(
                  "Configuration proposal submitted for admin approval.",
                );
                onReload();
              })
            }
          >
            Submit configuration proposal
          </button>
        </section>
      )}
      <h2 className={styles.portalSectionTitle}>Configuration requests</h2>
      {requests.length ? (
        requests.map((r) => (
          <section className={styles.profileCard} key={r.request_id}>
            <h3>
              Configuration v{r.configuration_version} ·{" "}
              {r.status.replaceAll("_", " ")}
            </h3>
            <p>Request {r.request_id.slice(0, 8)}</p>
            <ul>
              {r.payload.fields?.map((f) => (
                <li key={f.id}>
                  {f.label}: {f.type} · {f.visible ? "enabled" : "disabled"} ·{" "}
                  {f.required ? "required" : "optional"} ·{" "}
                  {f.sensitive ? "sensitive" : "standard"}
                </li>
              ))}
            </ul>
            {r.remarks && <p>Review note: {r.remarks}</p>}
            {r.failure_code && (
              <p role="alert">Execution failed: {r.failure_code}</p>
            )}
            {admin && r.status === "PENDING_APPROVAL" && (
              <div className={styles.reviewActions}>
                <label htmlFor={`config-note-${r.request_id}`}>
                  Review note
                </label>
                <textarea
                  id={`config-note-${r.request_id}`}
                  maxLength={500}
                  value={remarks[r.request_id] ?? ""}
                  onChange={(e) =>
                    setRemarks((n) => ({
                      ...n,
                      [r.request_id]: e.target.value,
                    }))
                  }
                />
                <div>
                  {(["REJECT", "APPROVE"] as const).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      className={
                        decision === "APPROVE"
                          ? styles.primary
                          : styles.secondary
                      }
                      disabled={
                        busy ||
                        (decision === "REJECT" &&
                          !remarks[r.request_id]?.trim())
                      }
                      onClick={() =>
                        void run(async () => {
                          await api(`/requests/${r.request_id}/approvals`, {
                            method: "POST",
                            body: JSON.stringify({
                              request_version: r.request_version,
                              decision,
                              remarks: remarks[r.request_id] ?? "",
                            }),
                          });
                          onNotice(
                            decision === "APPROVE"
                              ? "Configuration approved. Execution status will appear after refresh."
                              : "Configuration proposal rejected.",
                          );
                          onReload();
                        })
                      }
                    >
                      {decision === "APPROVE"
                        ? "Approve configuration"
                        : "Reject configuration"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))
      ) : (
        <p className={styles.emptyState}>No configuration requests.</p>
      )}
    </>
  );
}

function EmployeeAccessCard({
  account: a,
  busy,
  run,
  notify,
  reload,
}: {
  account: Account;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  notify: (v: string) => void;
  reload: () => void;
}) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  async function decide(decision: "APPROVE" | "REJECT") {
    await api(`/accounts/${a.account_id}/review`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        employee_code: decision === "APPROVE" ? code : undefined,
        remarks: note,
      }),
    });
    notify(
      decision === "APPROVE"
        ? "Employee account activated and linked."
        : "Employee access rejected.",
    );
    reload();
  }
  return (
    <section
      className={styles.accountCard}
      aria-label={`Access request for ${a.email}`}
    >
      <h2>{a.full_name}</h2>
      <p>{a.email}</p>
      <label htmlFor={`code-${a.account_id}`}>Verified employee code</label>
      <input
        id={`code-${a.account_id}`}
        maxLength={80}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <label htmlFor={`note-${a.account_id}`}>Review note</label>
      <textarea
        id={`note-${a.account_id}`}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy || !note.trim()}
          onClick={() => void run(() => decide("REJECT"))}
        >
          Reject access
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={busy || !code.trim()}
          onClick={() => void run(() => decide("APPROVE"))}
        >
          Activate employee access
        </button>
      </div>
    </section>
  );
}
