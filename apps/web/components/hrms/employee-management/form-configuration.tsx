"use client";

import { useRef, useState } from "react";
import { api } from "../../../lib/shared/cos-api";
import type { Configuration } from "../../../lib/shared/cos-api";
import type { FieldDefinition } from "../../../lib/shared/cos-domain";
import { randomId } from "../../../lib/shared/random-id";
import type { ConfigRequest, PeopleAction } from "./types";
import styles from "./employee-onboarding-preview.module.css";

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
                  keys.current.set(body, randomId());
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
