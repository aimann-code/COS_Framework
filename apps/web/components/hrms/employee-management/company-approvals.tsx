"use client";

import { useState } from "react";
import { api } from "../../../lib/shared/cos-api";
import type { CompanyCatalog, CompanyRequest, PeopleAction } from "./types";
import styles from "./employee-onboarding-preview.module.css";

const moduleLabel: Record<string, string> = {
  EMPLOYEES: "Employee records",
  LEAVE: "Leave",
  LEAVE_POLICY: "Leave policy",
};

const labelFor = (code: string) => moduleLabel[code] ?? code;

export default function CompanyApprovals({
  catalog,
  requests,
  busy,
  run,
  onNotice,
  onReload,
}: {
  catalog: CompanyCatalog;
  requests: CompanyRequest[];
  busy: boolean;
  run: PeopleAction;
  onNotice: (value: string) => void;
  onReload: () => void;
}) {
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const chosen = (request: CompanyRequest) =>
    grants[request.request_id] ?? request.requested_modules;
  const toggle = (request: CompanyRequest, code: string, on: boolean) => {
    const current = new Set(chosen(request));
    if (on) current.add(code);
    else current.delete(code);
    setGrants((old) => ({ ...old, [request.request_id]: [...current] }));
  };
  const toggleAll = (request: CompanyRequest, on: boolean) =>
    setGrants((old) => ({
      ...old,
      [request.request_id]: on ? [...catalog.modules] : [],
    }));

  return (
    <section className={styles.profileCard}>
      <h2>Company requests</h2>
      <p>
        Each company gets its own environment. Shared services stay the same,
        and that company&apos;s data stays in its own scope. The password is
        not shown here. Approval activates the submitted login for that company
        only.
      </p>
      {requests.length === 0 ? (
        <p className={styles.emptyState}>No company requests are waiting.</p>
      ) : (
        requests.map((request) => {
          const selected = chosen(request);
          const allOn = catalog.modules.every((code) => selected.includes(code));
          return (
            <article key={request.request_id}>
              <h3>
                {request.company_name}
                <span className={styles.portalFieldId}>{request.login_email}</span>
              </h3>
              <label>
                <input
                  type="checkbox"
                  checked={allOn}
                  disabled={busy}
                  onChange={(event) => toggleAll(request, event.target.checked)}
                />{" "}
                Suite: Enterprise Management
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={allOn}
                  disabled={busy}
                  onChange={(event) => toggleAll(request, event.target.checked)}
                />{" "}
                Engine: HRMS
              </label>
              <ul>
                {catalog.modules.map((code) => (
                  <li key={code}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(code)}
                        disabled={busy}
                        onChange={(event) =>
                          toggle(request, code, event.target.checked)
                        }
                      />{" "}
                      Module: {labelFor(code)}
                    </label>
                  </li>
                ))}
              </ul>
              <label htmlFor={`company-note-${request.request_id}`}>
                Rejection reason
              </label>
              <textarea
                id={`company-note-${request.request_id}`}
                maxLength={500}
                value={notes[request.request_id] ?? ""}
                onChange={(event) =>
                  setNotes((old) => ({
                    ...old,
                    [request.request_id]: event.target.value,
                  }))
                }
              />
              <div className={styles.reviewActions}>
                <div>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy || !notes[request.request_id]?.trim()}
                    onClick={() => void review(request, "REJECT", selected)}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy || selected.length === 0}
                    onClick={() => void review(request, "APPROVE", selected)}
                  >
                    Approve login
                  </button>
                </div>
              </div>
            </article>
          );
        })
      )}
    </section>
  );

  async function review(
    request: CompanyRequest,
    decision: "APPROVE" | "REJECT",
    modules: string[],
  ) {
    await run(async () => {
      await api(`/company-requests/${request.request_id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          modules,
          remarks: notes[request.request_id] ?? "",
        }),
      });
      onNotice(
        decision === "APPROVE"
          ? `${request.company_name} login was approved.`
          : `${request.company_name} request was rejected.`,
      );
      onReload();
    });
  }
}
