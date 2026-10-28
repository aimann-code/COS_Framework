"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { api, logout, type Session } from "../../../lib/shared/cos-api";
import EmployeeOnboardingPreview from "./registration/employee-onboarding-preview";
import BulkRegistration from "./registration/bulk-registration";
import LeaveDesk from "../leave-management/leave-desk";
import PeopleShell from "./people-shell";
import CompanyWorkspace from "../../shared/company-workspace";
import PeopleScreenBody from "./people-screen-body";
import type { ScreenData } from "./types";
import { usePeopleScreenData } from "./use-people-screen-data";
import {
  people_is_form_path,
  people_title,
} from "../../../lib/hrms/employee-management/people-routes";
import styles from "./employee-onboarding-preview.module.css";

export default function PeopleWorkspace() {
  const path = usePathname();
  const router = useRouter();
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

  const hr = !!session?.roles.includes("REGISTRAR");
  const admin = !!session?.roles.includes("ADMIN");
  const employee = !!session?.roles.includes("EMPLOYEE");
  const companyManager = session?.home_workspace === "COMPANY";

  usePeopleScreenData(
    path,
    revision,
    setSession,
    setData,
    setError,
    setLoading,
    setNote,
    setSearch,
    setAppliedSearch,
  );

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
  const isForm = people_is_form_path(path);
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

  const title = people_title(
    path,
    session?.roles ?? [],
    data?.employee?.display_name,
  );

  if (loading && !session && !data && !error) {
    return (
      <div className="workspace-loading" aria-busy="true">
        <div className="loading-main">
          <div className="workspace-loading-message">
            <span className="auth-eyebrow">YOUR WORKSPACE</span>
            <h1>Loading Employee Management</h1>
            <p role="status">
              Connecting to the host PC. If this takes more than a few seconds,
              confirm the host is running npm run dev:lan and you opened this
              device using the Wi‑Fi address (not 127.0.0.1).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PeopleShell
      path={path}
      roles={session?.roles ?? []}
      username={session?.username}
      companyLabel={
        session?.scope_name ?? session?.scope_id ?? "Your organization"
      }
      workspaceLink={
        session?.platform_admin
          ? "/platform"
          : companyManager
            ? "/company"
            : undefined
      }
      homeWorkspace={session?.home_workspace}
      roleLabel={
        session?.platform_admin
          ? "COS admin"
          : companyManager
            ? "Company admin"
            : hr
              ? "HR"
              : admin
                ? "Company admin"
                : employee
                  ? "Employee"
                  : ""
      }
      busy={busy}
      navContext={{
        path,
        employee,
        hr,
        draftEmployeeId: data?.draft?.employee_id,
      }}
      onSignOut={() =>
        void action(async () => {
          await logout();
          router.replace("/sign-in");
        })
      }
    >
      {path === "/people/register" && hr && (
        <BulkRegistration
          onRegistered={(employees) =>
            setNotice(
              `Registered ${employees.length} employee${employees.length === 1 ? "" : "s"}: ${employees
                .map((employee) => employee.employee_code)
                .join(", ")}.`,
            )
          }
        />
      )}
      {form}
      <div className={styles.pageHeading} hidden={!!form}>
        <div>
          <span className={styles.eyebrow}>
            {session?.scope_id ?? "YOUR ORGANIZATION"} / PEOPLE
          </span>
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
          Local development · Use fictitious employee information and synthetic
          document images only.
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
      {data && !loading && path.startsWith("/people/leave") && session && (
        <LeaveDesk
          key={`${path}-${revision}`}
          path={path}
          hr={hr}
          admin={admin}
          employee={employee}
        />
      )}
      {data &&
        !loading &&
        path === "/people/configuration" &&
        session?.company_portal && (
          <CompanyWorkspace
            view="configuration"
            embedded
            serviceCode="EMPLOYEE_MANAGEMENT"
          />
        )}
      {data &&
        !loading &&
        !path.startsWith("/people/leave") &&
        !(path === "/people/configuration" && session?.company_portal) && (
          <PeopleScreenBody
            path={path}
            data={data}
            setAppliedSearch={setAppliedSearch}
            hr={hr && !companyManager}
            admin={admin}
            employee={employee}
            busy={busy}
            search={search}
            setSearch={setSearch}
            appliedSearch={appliedSearch}
            note={note}
            setNote={setNote}
            action={action}
            setData={setData}
            setNotice={setNotice}
            refresh={refresh}
          />
        )}
    </PeopleShell>
  );
}
