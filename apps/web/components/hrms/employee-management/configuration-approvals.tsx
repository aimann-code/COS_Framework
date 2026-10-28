"use client";

import { useMemo, useState } from "react";
import { api } from "../../../lib/shared/cos-api";
import type {
  Configuration,
  ConfigurationPlacement,
} from "../../../lib/shared/cos-api";
import type { FieldDefinition } from "../../../lib/shared/cos-domain";
import type { ConfigRequest, PeopleAction } from "./types";
import { draftSections } from "../../../lib/hrms/employee-management/employee-onboarding-draft";
import styles from "./employee-onboarding-preview.module.css";

const sectionTitle = (id?: string) =>
  draftSections.find((section) => section.id === id)?.title ??
  (id === "company" || !id || id === "additional" ? "Company fields" : id);

const statusLabel: Record<string, string> = {
  PENDING_APPROVAL: "Needs review",
  APPROVED: "Approved",
  EXECUTING: "Applying",
  COMPLETED: "Live",
  FAILED: "Failed",
  REJECTED: "Rejected",
};

type StatusView = "pending" | "history" | "all";

function sameField(current: FieldDefinition, proposed: FieldDefinition) {
  return (
    current.label === proposed.label &&
    sectionTitle(current.group_key) === sectionTitle(proposed.group_key) &&
    current.type === proposed.type &&
    current.visible === proposed.visible &&
    current.required === proposed.required &&
    current.sensitive === proposed.sensitive
  );
}

function fieldChanges(current: FieldDefinition[], proposed: FieldDefinition[]) {
  const known = new Map(current.map((field) => [field.id, field]));
  return proposed.flatMap<{ field: FieldDefinition; kind: "New" | "Changed" }>(
    (field) => {
      const previous = known.get(field.id);
      if (!previous) return [{ field, kind: "New" as const }];
      if (!sameField(previous, field))
        return [{ field, kind: "Changed" as const }];
      return [];
    },
  );
}

export default function ConfigurationApprovals({
  config,
  requests,
  busy,
  run,
  onNotice,
  onReload,
}: {
  config: Configuration;
  requests: ConfigRequest[];
  busy: boolean;
  run: PeopleAction;
  onNotice: (value: string) => void;
  onReload: () => void;
}) {
  const placement: ConfigurationPlacement = config.placement ?? {
    company_id: "LOCAL_DEV",
    company: "Local development only",
    suite: "Enterprise Management",
    engine: "HRMS",
    module: "Employee Management",
    component_id: "EMP_Reg",
    component: "Employee registration",
  };
  const [companyQuery, setCompanyQuery] = useState("");
  const [requestQuery, setRequestQuery] = useState("");
  const [statusView, setStatusView] = useState<StatusView>("pending");
  const [companyId, setCompanyId] = useState(placement.company_id);
  const [openId, setOpenId] = useState("");
  const [showAllFields, setShowAllFields] = useState(false);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const companies = useMemo(
    () => [
      {
        id: placement.company_id,
        name: placement.company,
        pending: requests.filter(
          (request) => request.status === "PENDING_APPROVAL",
        ).length,
      },
    ],
    [placement.company, placement.company_id, requests],
  );
  const visibleCompanies = companies.filter((company) => {
    const query = companyQuery.trim().toLowerCase();
    return (
      !query ||
      company.name.toLowerCase().includes(query) ||
      company.id.toLowerCase().includes(query)
    );
  });
  const selected =
    visibleCompanies.find((company) => company.id === companyId) ??
    visibleCompanies[0];

  const queue = requests.filter((request) => {
    if (statusView === "pending" && request.status !== "PENDING_APPROVAL")
      return false;
    if (statusView === "history" && request.status === "PENDING_APPROVAL")
      return false;
    const query = requestQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      request.request_id.toLowerCase().includes(query) ||
      request.payload.fields?.some((field) =>
        field.label.toLowerCase().includes(query),
      )
    );
  });
  const open =
    queue.find((request) => request.request_id === openId) ?? queue[0];
  const changes = open
    ? fieldChanges(config.fields, open.payload.fields ?? [])
    : [];
  const shownFields = open
    ? showAllFields
      ? (open.payload.fields ?? []).map((field) => ({
          field,
          kind: "Listed",
        }))
      : changes
    : [];

  return (
    <div className={styles.approvalDesk}>
      <section className={styles.companyRail} aria-label="Companies">
        <label>
          Find a company
          <input
            value={companyQuery}
            onChange={(event) => setCompanyQuery(event.target.value)}
            placeholder="Name or company id"
          />
        </label>
        {visibleCompanies.length ? (
          <ul>
            {visibleCompanies.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  aria-current={
                    selected?.id === company.id ? "true" : undefined
                  }
                  onClick={() => {
                    setCompanyId(company.id);
                    setOpenId("");
                    setShowAllFields(false);
                  }}
                >
                  <strong>{company.name}</strong>
                  <span>{company.id}</span>
                  <em>
                    {company.pending === 0
                      ? "Clear"
                      : `${company.pending} waiting`}
                  </em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No company matches that name.</p>
        )}
      </section>
      <div className={styles.approvalWork}>
        <section className={styles.approvalQueue} aria-label="Approval queue">
          <div className={styles.approvalToolbar}>
            <div role="tablist" aria-label="Request status">
              {(
                [
                  ["pending", "Needs review"],
                  ["history", "History"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={statusView === value}
                  onClick={() => {
                    setStatusView(value);
                    setOpenId("");
                    setShowAllFields(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Search this company
              <input
                value={requestQuery}
                onChange={(event) => setRequestQuery(event.target.value)}
                placeholder="Request or field"
              />
            </label>
          </div>
          {selected && queue.length ? (
            <table className={styles.portalTable}>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((request) => {
                  const count = fieldChanges(
                    config.fields,
                    request.payload.fields ?? [],
                  ).length;
                  return (
                    <tr
                      key={request.request_id}
                      data-open={open?.request_id === request.request_id}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.queueOpen}
                          onClick={() => {
                            setOpenId(request.request_id);
                            setShowAllFields(false);
                          }}
                        >
                          {request.request_id.slice(0, 8)}
                          <span>v{request.configuration_version}</span>
                        </button>
                      </td>
                      <td>
                        {placement.module}
                        <span className={styles.portalFieldId}>
                          {placement.component}
                        </span>
                      </td>
                      <td>{statusLabel[request.status] ?? request.status}</td>
                      <td>{count === 0 ? "None" : count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.emptyState}>
              {selected
                ? statusView === "pending"
                  ? `${selected.name} has nothing waiting for approval.`
                  : "No requests match this view."
                : "Choose a company to see its approval queue."}
            </p>
          )}
        </section>
        <section
          className={styles.approvalDetail}
          aria-label="Selected request"
        >
          {open && selected ? (
            <>
              <p className={styles.sourcePath}>
                {selected.name}
                <span>{placement.suite}</span>
                <span>{placement.engine}</span>
                <span>{placement.module}</span>
                <span>{placement.component}</span>
              </p>
              <h2>
                {statusLabel[open.status] ?? open.status}
                <span>Request {open.request_id.slice(0, 8)}</span>
              </h2>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setShowAllFields((value) => !value)}
              >
                {showAllFields ? "Show changes only" : "Show every field"}
              </button>
              {shownFields.length ? (
                <table className={styles.portalTable}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Section</th>
                      <th>Type</th>
                      <th>Setting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownFields.map(({ field, kind }) => (
                      <tr key={field.id}>
                        <td>
                          {field.label}
                          <span className={styles.portalFieldId}>{kind}</span>
                        </td>
                        <td>{sectionTitle(field.group_key)}</td>
                        <td>{field.type}</td>
                        <td>
                          {field.visible ? "Enabled" : "Disabled"}
                          {field.required ? " · Required" : ""}
                          {field.sensitive ? " · Sensitive" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>This proposal does not change the live field list.</p>
              )}
              {open.remarks && <p>Review note: {open.remarks}</p>}
              {open.failure_code && (
                <p role="alert">Execution failed: {open.failure_code}</p>
              )}
              {open.status === "PENDING_APPROVAL" && (
                <div className={styles.reviewActions}>
                  <label htmlFor={`config-note-${open.request_id}`}>
                    Review note
                  </label>
                  <textarea
                    id={`config-note-${open.request_id}`}
                    maxLength={500}
                    value={remarks[open.request_id] ?? ""}
                    onChange={(event) =>
                      setRemarks((notes) => ({
                        ...notes,
                        [open.request_id]: event.target.value,
                      }))
                    }
                  />
                  <div>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy || !remarks[open.request_id]?.trim()}
                      onClick={() => void decide(open, "REJECT")}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={() => void decide(open, "APPROVE")}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className={styles.emptyState}>
              Select a request to review its field changes.
            </p>
          )}
        </section>
      </div>
    </div>
  );

  async function decide(
    request: ConfigRequest,
    decision: "APPROVE" | "REJECT",
  ) {
    await run(async () => {
      await api(`/requests/${request.request_id}/approvals`, {
        method: "POST",
        body: JSON.stringify({
          request_version: request.request_version,
          decision,
          remarks: remarks[request.request_id] ?? "",
        }),
      });
      onNotice(
        decision === "APPROVE"
          ? "Configuration approved. Execution status will appear after refresh."
          : "Configuration proposal rejected.",
      );
      onReload();
    });
  }
}
