"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../../lib/cos-api";
import styles from "../employee-management/employee-onboarding-preview.module.css";

type Policy = {
  policy_id: string;
  code: string;
  name: string;
  paid: boolean;
  annual_quota: number;
  notice_days: number;
  max_days: number;
  active: boolean;
  version: number;
  metadata: { count_mode?: string };
};
type Balance = {
  code: string;
  name: string;
  annual_quota: number;
  reserved: number;
  remaining: number;
};
type LeaveRequest = {
  request_id: string;
  employee_id: string;
  employee_code: string;
  display_name: string;
  policy_code: string;
  policy_name: string;
  start_on: string;
  end_on: string;
  day_count: number;
  reason: string;
  status: string;
  version: number;
  review_note: string | null;
  requested_by: string;
};
type Catalog = {
  policies: Policy[];
  balances: Balance[];
  actions: string[];
  count_modes: string[];
};

export default function LeaveDesk({
  path,
  hr,
  admin,
  employee,
}: {
  path: string;
  hr: boolean;
  admin: boolean;
  employee: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [lookupNote, setLookupNote] = useState("");
  const [policy, setPolicy] = useState("CL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [record, setRecord] = useState(hr);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Policy>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError("");
      try {
        const [next, queue] = await Promise.all([
          api<Catalog>(
            `/leave/catalog${hr && employeeId ? `?employee=${encodeURIComponent(employeeId)}` : ""}`,
          ),
          path === "/people/leave/policies"
            ? Promise.resolve([] as LeaveRequest[])
            : api<LeaveRequest[]>("/leave/requests"),
        ]);
        if (!active) return;
        setCatalog(next);
        setRequests(queue);
        setDrafts(Object.fromEntries(next.policies.map((item) => [item.code, item])));
        if (!next.policies.some((item) => item.code === policy) && next.policies[0])
          setPolicy(next.policies[0].code);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Leave could not be loaded.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [path, hr, employeeId, policy, reload]);
  useEffect(() => {
    if (!hr || path !== "/people/leave/apply") return;
    const typed = employeeCode.trim();
    if (!typed) {
      setEmployeeId("");
      setEmployeeName("");
      setLookupNote("");
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void api<{ employee_id: string; employee_code: string; display_name: string }>(
        `/leave/employees?code=${encodeURIComponent(typed)}`,
      )
        .then((found) => {
          if (!active) return;
          setEmployeeId(found.employee_id);
          setEmployeeName(found.display_name);
          setLookupNote("");
        })
        .catch((e) => {
          if (!active) return;
          setEmployeeId("");
          setEmployeeName("");
          setLookupNote(
            e instanceof ApiError && e.status === 404
              ? "No employee has this ID."
              : e instanceof Error
                ? e.message
                : "The employee ID could not be checked.",
          );
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [employeeCode, hr, path]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "The leave action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!catalog) {
    return (
      <div className={styles.formPanel}>
        <div className={styles.formBody}>
          {error || "Loading leave policy and balances…"}
        </div>
      </div>
    );
  }

  return (
    <div>
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
      {path === "/people/leave" && (
        <>
          <div className={styles.portalCards}>
            {(employee || hr) && (
              <Link href="/people/leave/apply">
                <strong>{hr ? "Record or request leave" : "Request leave"}</strong>
                <span>Choose a policy from the company leave catalog.</span>
              </Link>
            )}
            {(hr || admin) && (
              <Link href="/people/leave/policies">
                <strong>Leave policy</strong>
                <span>Quota, notice, and weekday counting are metadata.</span>
              </Link>
            )}
          </div>
          {catalog.balances.length > 0 && (
            <>
              <h2 className={styles.portalSectionTitle}>Balance this year</h2>
              <div className={styles.portalList}>
                {catalog.balances.map((balance) => (
                  <div key={balance.code}>
                    <strong>
                      {balance.name} · {balance.remaining} days left
                    </strong>
                    <span>
                      {balance.code} · reserved {balance.reserved} of{" "}
                      {balance.annual_quota}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          <h2 className={styles.portalSectionTitle}>
            {hr ? "Leave queue" : "My leave requests"}
          </h2>
          {requests.length === 0 ? (
            <p className={styles.emptyState}>No leave requests yet.</p>
          ) : (
            <div className={styles.portalList}>
              {requests.map((item) => (
                <article key={item.request_id}>
                  <strong>
                    {item.display_name} · {item.policy_name}
                  </strong>
                  <span>
                    {item.employee_code} · {item.start_on} to {item.end_on} ·{" "}
                    {item.day_count} days · {item.status}
                  </span>
                  <span>{item.reason}</span>
                  {item.review_note && <span>{item.review_note}</span>}
                  {hr && item.status === "SUBMITTED" && (
                    <div className={styles.fieldGrid}>
                      <label className={styles.field}>
                        <span>Decision note</span>
                        <input
                          value={remarks}
                          onChange={(event) => setRemarks(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(`/leave/requests/${item.request_id}/decision`, {
                              method: "POST",
                              body: JSON.stringify({
                                version: item.version,
                                decision: "APPROVE",
                                remarks,
                              }),
                            });
                            setNotice("Leave approved.");
                            setReload((value) => value + 1);
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(`/leave/requests/${item.request_id}/decision`, {
                              method: "POST",
                              body: JSON.stringify({
                                version: item.version,
                                decision: "REJECT",
                                remarks,
                              }),
                            });
                            setNotice("Leave rejected.");
                            setReload((value) => value + 1);
                          })
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {path === "/people/leave/apply" && (
        <form
          className={styles.formPanel}
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (hr && !employeeId)
                throw new Error(
                  employeeCode.trim()
                    ? "Wait for the employee name to appear, or enter a known employee ID."
                    : "Enter the employee ID.",
                );
              await api("/leave/requests", {
                method: "POST",
                body: JSON.stringify({
                  employee_id: hr ? employeeId : null,
                  policy_code: policy,
                  start_on: start,
                  end_on: end,
                  reason,
                  record: hr && record,
                }),
              });
              setNotice(hr && record ? "Leave recorded." : "Leave request submitted to HR.");
              router.push("/people/leave");
            });
          }}
        >
          <div className={styles.formBody}>
            <div className={styles.fieldGrid}>
              {hr && (
                <>
                  <label className={styles.field}>
                    <span>Employee ID</span>
                    <input
                      required
                      value={employeeCode}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setEmployeeCode(event.target.value)}
                    />
                    {lookupNote && <small className={styles.fieldError}>{lookupNote}</small>}
                  </label>
                  <label className={styles.field}>
                    <span>Employee name</span>
                    <input readOnly value={employeeName} aria-label="Employee name" />
                  </label>
                </>
              )}
              <label className={styles.field}>
                <span>Policy</span>
                <select value={policy} onChange={(event) => setPolicy(event.target.value)}>
                  {catalog.policies
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name} · {item.metadata.count_mode ?? "CALENDAR"} · max{" "}
                        {item.max_days} days
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Start</span>
                <input
                  required
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>End</span>
                <input
                  required
                  type="date"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Reason</span>
                <input
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </div>
            {hr && (
              <label>
                <input
                  type="checkbox"
                  checked={record}
                  onChange={(event) => setRecord(event.target.checked)}
                />{" "}
                Record immediately. Leave this off to submit a request for another HR decision.
              </label>
            )}
            {catalog.balances.length > 0 && (
              <p>
                {catalog.balances
                  .map((balance) => `${balance.code} ${balance.remaining} left`)
                  .join(" · ")}
              </p>
            )}
          </div>
          <button className={styles.primary} type="submit" disabled={busy}>
            {hr && record ? "Record leave" : "Submit leave request"}
          </button>
        </form>
      )}
      {path === "/people/leave/policies" && (
        <div className={styles.portalList}>
          {catalog.policies.map((item) => {
            const draft = drafts[item.code] ?? item;
            return (
              <form
                key={item.code}
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    const saved = await api<Policy>(`/leave/policies/${item.code}`, {
                      method: "PUT",
                      body: JSON.stringify({
                        name: draft.name,
                        paid: draft.paid,
                        annual_quota: Number(draft.annual_quota),
                        notice_days: Number(draft.notice_days),
                        max_days: Number(draft.max_days),
                        active: draft.active,
                        count_mode: draft.metadata.count_mode ?? "CALENDAR",
                        version: draft.version,
                      }),
                    });
                    setDrafts((current) => ({ ...current, [saved.code]: saved }));
                    setNotice(`${saved.name} updated.`);
                  });
                }}
              >
                <strong>
                  {item.code} · version {draft.version}
                </strong>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.code]: { ...draft, name: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Annual quota</span>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={draft.annual_quota}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.code]: {
                            ...draft,
                            annual_quota: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Notice days</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.notice_days}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.code]: {
                            ...draft,
                            notice_days: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Maximum days</span>
                    <input
                      type="number"
                      min={1}
                      value={draft.max_days}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.code]: {
                            ...draft,
                            max_days: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Counting</span>
                    <select
                      value={draft.metadata.count_mode ?? "CALENDAR"}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.code]: {
                            ...draft,
                            metadata: { count_mode: event.target.value },
                          },
                        }))
                      }
                    >
                      {catalog.count_modes.map((mode) => (
                        <option key={mode}>{mode}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.paid}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.code]: { ...draft, paid: event.target.checked },
                      }))
                    }
                  />{" "}
                  Paid
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.code]: { ...draft, active: event.target.checked },
                      }))
                    }
                  />{" "}
                  Active
                </label>
                <button className={styles.primary} type="submit" disabled={busy}>
                  Save {item.code}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
