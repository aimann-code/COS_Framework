"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../lib/shared/cos-api";
import {
  displayDate,
  money,
  statusLabel,
  type CompanyWorkspace as WorkspaceData,
  type ConfigField,
} from "../../lib/shared/commerce";
import {
  CommerceDialog,
  CommerceShell,
  WorkspaceFeedback,
  useCommerceWorkspace,
} from "./commerce-workspace";
import styles from "./commerce.module.css";

type ModuleEntry = {
  module_code: string;
  name: string;
  route: string;
  enabled: boolean;
  audience: string[];
};
export default function CompanyWorkspace({ view }: { view: string }) {
  const path = "/company" + (view ? "/" + view : "");
  const { session, data, error, loading, reload } =
    useCommerceWorkspace<WorkspaceData>("company", path);
  const [modules, setModules] = useState<ModuleEntry[]>([]);
  const [moduleError, setModuleError] = useState("");
  const [open, setOpen] = useState(false);
  const [service, setService] = useState("");
  const [kind, setKind] = useState("FIELD_ADD");
  const [field, setField] = useState<ConfigField>({
    technical_name: "",
    label: "",
    data_type: "text",
    sensitive: false,
  });
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const actionLock = useRef(false);
  useEffect(() => {
    if (!session?.authenticated) return;
    let active = true;
    void api<ModuleEntry[]>("/modules")
      .then((value) => {
        if (active) {
          setModules(value);
          setModuleError("");
        }
      })
      .catch((e) => {
        if (active)
          setModuleError(
            e instanceof Error
              ? e.message
              : "Workspace links could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [session?.authenticated, data?.company.company_id]);
  const subscribed = (data?.services ?? []).filter((s) =>
    data?.company.active_services.includes(s.service_code),
  );
  const pending = (data?.configuration_requests ?? []).filter((r) =>
    ["PENDING_REVIEW", "PENDING", "PENDING_APPROVAL"].includes(r.status),
  );
  const moduleCodes = new Set(subscribed.flatMap((s) => s.modules));
  const availableModules = modules.filter(
    (m) =>
      m.enabled &&
      moduleCodes.has(m.module_code) &&
      /^\/[a-zA-Z0-9/_-]*$/.test(m.route),
  );
  const labelFor = (code: string) =>
    data?.services.find((s) => s.service_code === code)?.name ?? code;
  const selectedSchema = data?.schemas.find(
    (schema) => schema.service_code === service,
  );
  function resetField() {
    setKind("FIELD_ADD");
    setField({
      technical_name: "",
      label: "",
      data_type: data?.supported_field_types[0] ?? "text",
      sensitive: false,
    });
    setConfirmed(false);
  }
  function requestField() {
    setService(subscribed[0]?.service_code ?? "");
    setField({
      technical_name: "",
      label: "",
      data_type: data?.supported_field_types[0] ?? "text",
      sensitive: false,
    });
    setReason("");
    setKind("FIELD_ADD");
    setActionError("");
    setConfirmed(false);
    setOpen(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await api("/company/configuration-requests", {
        method: "POST",
        body: JSON.stringify({
          service_code: service,
          kind,
          schema_version: selectedSchema?.version,
          field: {
            ...field,
            technical_name: field.technical_name.trim(),
            label: field.label.trim(),
          },
          reason: reason.trim(),
        }),
      });
      setOpen(false);
      setNotice(
        "Your field request was submitted. The configuration changes only after administrator approval.",
      );
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "The configuration request could not be submitted.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  return (
    <CommerceShell
      kind="company"
      path={path}
      session={session}
      company={data?.company.company_name}
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>YOUR COMPANY WORKSPACE</span>
          <h1>
            {view === "configuration"
              ? "Configuration requests"
              : view === "services"
                ? "Your subscribed services"
                : (data?.company.company_name ?? "Company overview")}
          </h1>
          <p>
            Subscribed services, company-specific fields and clear approval
            status.
          </p>
        </div>
        <div className={styles.actions} style={{ marginTop: 0 }}>
          <button
            className={styles.secondary}
            type="button"
            disabled={loading || busy}
            onClick={() => void reload()}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {data && (
            <button
              className={styles.primary}
              type="button"
              disabled={!subscribed.length || busy}
              onClick={requestField}
            >
              <Plus size={15} />
              Request a field
            </button>
          )}
        </div>
      </div>
      <WorkspaceFeedback
        error={error}
        loading={loading}
        hasData={!!data}
        onRetry={() => void reload()}
      />
      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      {data && (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <small>
                Company status
                <CheckCircle2 size={16} />
              </small>
              <strong style={{ fontSize: 23 }}>
                {statusLabel(data.company.status)}
              </strong>
              <p>Payment verified before activation</p>
            </div>
            <div className={styles.stat}>
              <small>
                Subscribed services
                <Package size={16} />
              </small>
              <strong>{data.company.active_services.length}</strong>
              <p>Active in your company scope</p>
            </div>
            <div className={styles.stat}>
              <small>
                Pending requests
                <FileCheck2 size={16} />
              </small>
              <strong>{pending.length}</strong>
              <p>Loaded configuration requests</p>
            </div>
            <div className={styles.stat}>
              <small>
                Approved fields
                <ShieldCheck size={16} />
              </small>
              <strong>
                {data.schemas.reduce(
                  (sum, schema) => sum + schema.fields.length,
                  0,
                )}
              </strong>
              <p>Shared service schemas</p>
            </div>
          </div>
          {view !== "configuration" && (
            <section className={styles.panel}>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle}>
                  Services in your workspace
                </h2>
                <Link className={styles.textLink} href="/company/configuration">
                  Configuration requests <ArrowRight size={14} />
                </Link>
              </div>
              <div className={styles.serviceList}>
                {subscribed.map((s) => (
                  <article className={styles.service} key={s.service_code}>
                    <Package size={22} />
                    <div>
                      <small>
                        {s.suite} / {s.engine}
                      </small>
                      <h3>{s.name}</h3>
                      <p>{s.description}</p>
                      <span className={styles.chip}>Active subscription</span>
                    </div>
                    <span className={styles.price}>
                      {money(s.price_minor, s.currency)}
                      <small>
                        current catalogue / {s.billing_period.toLowerCase()}
                      </small>
                    </span>
                  </article>
                ))}
              </div>
              <p className={styles.notice}>
                Your registered order total is{" "}
                {money(data.company.total_minor, data.company.currency)}.
                Current catalogue prices may differ from your saved order; no
                charge is performed from this screen.
              </p>
              {moduleError && (
                <p className={styles.error} role="alert">
                  {moduleError}
                </p>
              )}
              <div className={styles.actions}>
                {availableModules.map((module) => (
                  <Link
                    className={styles.secondary}
                    key={module.module_code}
                    href={module.route}
                  >
                    {module.name}
                    <ArrowRight size={14} />
                  </Link>
                ))}
              </div>
              {!availableModules.length && !moduleError && (
                <p className={styles.notice}>
                  No module links are available for your current role. Contact
                  your administrator if you expected access.
                </p>
              )}
            </section>
          )}
          {(view === "configuration" || view === "") && (
            <div className={styles.rowGrid} style={{ marginTop: 25 }}>
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>
                  Configuration request history
                </h2>
                <p>
                  Each request stays attached to this company and its subscribed
                  service.
                </p>
                {!data.configuration_requests.length ? (
                  <div className={styles.empty}>
                    <FileCheck2 size={25} />
                    <h2>No configuration requests yet</h2>
                    <p>
                      Request an additional field when your team needs
                      information beyond the standard service form.
                    </p>
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={requestField}
                      disabled={!subscribed.length}
                    >
                      Request your first field
                    </button>
                  </div>
                ) : (
                  <div className={styles.requestList}>
                    {data.configuration_requests.map((request) => (
                      <article
                        className={styles.requestItem}
                        key={request.request_id}
                      >
                        <div>
                          <h3>{request.field.label}</h3>
                          <span
                            className={styles.status}
                            data-state={request.status}
                          >
                            {statusLabel(request.status)}
                          </span>
                        </div>
                        <p>
                          {request.service_name} ·{" "}
                          {request.field.technical_name} ·{" "}
                          {request.field.data_type}
                          <br />
                          {request.reason}
                        </p>
                        {request.remarks && (
                          <p>
                            <strong>Administrator response:</strong>{" "}
                            {request.remarks}
                          </p>
                        )}
                        <p>Submitted {displayDate(request.created_at)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>Approved service fields</h2>
                <p>
                  These field definitions come from the shared schema service.
                  Changes do not require a new page for each company.
                </p>
                {data.schemas.every((s) => !s.fields.length) ? (
                  <p className={styles.notice}>
                    No additional fields have been approved yet. Standard
                    service fields remain available in their module workspaces.
                  </p>
                ) : (
                  data.schemas.map((schema) =>
                    schema.fields.length ? (
                      <div
                        className={styles.requestItem}
                        key={schema.service_code}
                      >
                        <h3>
                          {labelFor(schema.service_code)} · schema version{" "}
                          {schema.version}
                        </h3>
                        <div className={styles.tableWrap}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Field</th>
                                <th>Type</th>
                                <th>Sensitivity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {schema.fields.map((f) => (
                                <tr key={f.technical_name}>
                                  <td>
                                    <strong>{f.label}</strong>
                                    <small>{f.technical_name}</small>
                                  </td>
                                  <td>{f.data_type}</td>
                                  <td>
                                    {f.sensitive ? "Sensitive" : "Standard"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null,
                  )
                )}
                <div className={styles.notice}>
                  Employee service fields feed the employee form. Other service
                  fields are exposed through their shared schema; each installed
                  component controls its own business behavior.
                </div>
              </section>
            </div>
          )}
        </>
      )}
      {open && data && (
        <CommerceDialog
          title="Request a company field"
          onClose={() => setOpen(false)}
          busy={busy}
        >
          <p className={styles.notice}>
            This submits a proposal. The platform administrator must approve it
            before the company schema changes.
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <label className={styles.field}>
              Subscribed service
              <select
                required
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  resetField();
                }}
                disabled={busy}
              >
                {subscribed.map((s) => (
                  <option key={s.service_code} value={s.service_code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Request type
              <select
                value={kind}
                disabled={busy}
                onChange={(e) => {
                  setKind(e.target.value);
                  if (
                    e.target.value === "FIELD_UPDATE" &&
                    selectedSchema?.fields[0]
                  )
                    setField(selectedSchema.fields[0]);
                  else resetField();
                  setConfirmed(false);
                }}
              >
                <option value="FIELD_ADD">Add a field</option>
                <option
                  value="FIELD_UPDATE"
                  disabled={!selectedSchema?.fields.length}
                >
                  Change an approved field
                </option>
              </select>
            </label>
            {kind === "FIELD_UPDATE" && (
              <label className={styles.field}>
                Approved field
                <select
                  required
                  value={field.technical_name}
                  onChange={(e) => {
                    const selectedField = selectedSchema?.fields.find(
                      (f) => f.technical_name === e.target.value,
                    );
                    if (selectedField) setField(selectedField);
                    setConfirmed(false);
                  }}
                  disabled={busy}
                >
                  {selectedSchema?.fields.map((f) => (
                    <option key={f.technical_name} value={f.technical_name}>
                      {f.label} ({f.technical_name})
                    </option>
                  ))}
                </select>
                <small>
                  Identifier and data type stay unchanged. This proposal uses
                  schema version {selectedSchema?.version}.
                </small>
              </label>
            )}
            <div className={styles.fields}>
              <label className={styles.field}>
                Field label
                <input
                  required
                  maxLength={80}
                  value={field.label}
                  onChange={(e) =>
                    setField({ ...field, label: e.target.value })
                  }
                  disabled={busy}
                  placeholder="e.g. Uniform size"
                />
              </label>
              <label className={styles.field}>
                Technical field name
                <input
                  required
                  pattern="[a-z][a-z0-9_]{0,59}"
                  maxLength={60}
                  value={field.technical_name}
                  readOnly={kind === "FIELD_UPDATE"}
                  onChange={(e) =>
                    setField({ ...field, technical_name: e.target.value })
                  }
                  disabled={busy}
                  placeholder="e.g. uniform_size"
                />
                <small>
                  Lowercase letters, digits and underscores. Stable after
                  approval.
                </small>
              </label>
              <label className={styles.field}>
                Field type
                <select
                  value={field.data_type}
                  onChange={(e) =>
                    setField({ ...field, data_type: e.target.value })
                  }
                  disabled={busy || kind === "FIELD_UPDATE"}
                >
                  {data.supported_field_types.map((type) => (
                    <option key={type} value={type}>
                      {statusLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={field.sensitive}
                onChange={(e) =>
                  setField({ ...field, sensitive: e.target.checked })
                }
                disabled={busy || kind === "FIELD_UPDATE"}
              />
              This field contains sensitive information.
            </label>
            <label className={styles.field}>
              Business reason
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                placeholder="Explain why your company needs this field."
              />
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={busy}
                required
              />
              I confirm this request for {data.company.company_name}. It does
              not change other companies.
            </label>
            {actionError && (
              <p className={styles.error} role="alert">
                {actionError}
              </p>
            )}
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className={styles.primary} disabled={busy || !confirmed}>
                {busy ? "Submitting…" : "Submit field request"}
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </CommerceDialog>
      )}
    </CommerceShell>
  );
}
