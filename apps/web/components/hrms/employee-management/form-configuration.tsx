"use client";

import { useRef, useState } from "react";
import { api } from "../../../lib/shared/cos-api";
import type {
  Configuration,
  ConfigurationPlacement,
} from "../../../lib/shared/cos-api";
import type { FieldDefinition } from "../../../lib/shared/cos-domain";
import { randomId } from "../../../lib/shared/random-id";
import type { ConfigRequest, PeopleAction } from "./types";
import { draftSections } from "../../../lib/hrms/employee-management/employee-onboarding-draft";
import ConfigurationApprovals from "./configuration-approvals";
import styles from "./employee-onboarding-preview.module.css";

const sectionTitle = (id?: string) =>
  draftSections.find((section) => section.id === id)?.title ??
  (id === "company" || !id || id === "additional" ? "Company fields" : id);

const sensitiveLocked = (id: string) =>
  id === "pan_number" || id === "aadhaar_number";

function Placement({ placement }: { placement?: ConfigurationPlacement }) {
  if (!placement) return null;
  return (
    <p className={styles.privateNote}>
      Company {placement.company} ({placement.company_id}). Suite{" "}
      {placement.suite}. Engine {placement.engine}. Module {placement.module}.
      Component {placement.component} ({placement.component_id}).
    </p>
  );
}

export default function FormConfiguration({
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
  run: PeopleAction;
  onNotice: (value: string) => void;
  onReload: () => void;
}) {
  const [fields, setFields] = useState(() => structuredClone(config.fields));
  const [label, setLabel] = useState("");
  const [section, setSection] = useState(draftSections[0]?.id ?? "basic");
  const [type, setType] = useState<FieldDefinition["type"]>("text");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const keys = useRef(new Map<string, string>());
  const unchanged = JSON.stringify(fields) === JSON.stringify(config.fields);
  const blankLabel = fields.some((f) => !f.label.trim());
  const waiting = requests.some((r) => r.status === "PENDING_APPROVAL");
  const updateField = (id: string, patch: Partial<FieldDefinition>) =>
    setFields((old) =>
      old.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  if (admin) {
    return (
      <ConfigurationApprovals
        config={config}
        requests={requests}
        busy={busy}
        run={run}
        onNotice={onNotice}
        onReload={onReload}
      />
    );
  }
  return (
    <>
      <Placement placement={config.placement} />
      <p className={styles.privateNote}>
        Active configuration v{config.version}. Change an existing field or add
        one to a profile section such as Basic details or Compliance. The field
        type stays as it is. Changes take effect only after admin approval.
      </p>
      {!admin && (
        <section className={styles.profileCard}>
          <h2>Propose additional-field changes</h2>
          <div className={styles.portalTableWrap}>
            <table className={styles.portalTable}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Section</th>
                  <th>Type</th>
                  <th>Enabled</th>
                  <th>Required</th>
                  <th>Sensitive</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <input
                        aria-label={`Label for ${f.id}`}
                        maxLength={80}
                        value={f.label}
                        disabled={busy}
                        onChange={(e) =>
                          updateField(f.id, { label: e.target.value })
                        }
                      />
                      <span className={styles.portalFieldId}>{f.id}</span>
                    </td>
                    <td>
                      <select
                        aria-label={`Section for ${f.label || f.id}`}
                        value={
                          draftSections.some(
                            (section) => section.id === f.group_key,
                          )
                            ? f.group_key
                            : "additional"
                        }
                        disabled={busy}
                        onChange={(e) =>
                          updateField(f.id, { group_key: e.target.value })
                        }
                      >
                        {draftSections.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                        <option value="additional">Company fields</option>
                      </select>
                    </td>
                    <td title="The field type stays fixed after the field is created.">
                      {f.type}
                    </td>
                    {(["visible", "required", "sensitive"] as const).map(
                      (key) => (
                        <td key={key}>
                          <input
                            type="checkbox"
                            aria-label={`${key} ${f.label || f.id}`}
                            checked={f[key]}
                            disabled={
                              busy ||
                              (key === "sensitive" && sensitiveLocked(f.id))
                            }
                            onChange={(e) =>
                              updateField(f.id, {
                                [key]: e.target.checked,
                                ...(key === "visible" && !e.target.checked
                                  ? { required: false }
                                  : {}),
                              })
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
              Profile section
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                {draftSections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
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
                    group_key: section,
                    max_length: 500,
                  },
                ]);
                setLabel("");
              }}
            >
              Add field
            </button>
          </div>
          {waiting && (
            <p role="status">
              A proposal is already waiting. Submitting again replaces it with
              this field list, including the new field.
            </p>
          )}
          <button
            type="button"
            className={styles.primary}
            disabled={busy || unchanged || blankLabel}
            onClick={() =>
              void run(async () => {
                const body = JSON.stringify({
                  component_id: "EMP_Reg",
                  operation: "CONFIGURATION",
                  configuration_version: config.version,
                  payload: {
                    fields: fields.map((f) => ({
                      id: f.id,
                      ...(f.field_id ? { field_id: f.field_id } : {}),
                      label: f.label,
                      type: f.type,
                      required: f.required,
                      visible: f.visible,
                      sensitive: f.sensitive,
                      read_roles: f.read_roles ?? [
                        "ADMIN",
                        "REGISTRAR",
                        "VIEWER",
                      ],
                      write_roles: f.write_roles ?? ["REGISTRAR"],
                      printable: f.printable ?? false,
                      display_order: f.display_order ?? 0,
                      group_key: f.group_key || "additional",
                      max_length: f.max_length ?? 500,
                    })),
                  },
                });
                if (!keys.current.has(body))
                  keys.current.set(body, randomId());
                await api("/requests", {
                  method: "POST",
                  headers: { "Idempotency-Key": keys.current.get(body)! },
                  body,
                });
                onNotice(
                  waiting
                    ? "The waiting proposal was replaced with this field list."
                    : "Configuration proposal submitted for admin approval.",
                );
                onReload();
              })
            }
          >
            {waiting
              ? "Replace configuration proposal"
              : "Submit configuration proposal"}
          </button>
        </section>
      )}
      <h2 className={styles.portalSectionTitle}>Configuration requests</h2>
      {requests.length ? (
        requests.map((r) => (
          <section className={styles.profileCard} key={r.request_id}>
            <h3>
              {config.placement?.module ?? "Employee Management"} ·
              Configuration v{r.configuration_version} ·{" "}
              {r.status.replaceAll("_", " ")}
            </h3>
            <p>Request {r.request_id.slice(0, 8)}</p>
            <ul>
              {r.payload.fields?.map((f) => (
                <li key={f.id}>
                  {f.label}: {sectionTitle(f.group_key)} · {f.type} ·{" "}
                  {f.visible ? "enabled" : "disabled"} ·{" "}
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
