"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";
import { api } from "../../lib/shared/cos-api";
import {
  displayDate,
  money,
  statusLabel,
  type CompanySummary,
  type ConfigurationReview,
  type PaymentReview,
  type PlatformOverview,
  type ServiceDefinition,
} from "../../lib/shared/commerce";
import {
  CommerceDialog,
  CommerceShell,
  WorkspaceFeedback,
  useCommerceWorkspace,
} from "./commerce-workspace";
import styles from "./commerce.module.css";

type ReviewTarget =
  | { kind: "payment"; record: PaymentReview }
  | { kind: "configuration"; record: ConfigurationReview };
export default function PlatformWorkspace({ view }: { view: string }) {
  const path = "/platform" + (view ? "/" + view : "");
  const { session, data, error, loading, denied, reload } =
    useCommerceWorkspace<PlatformOverview>("platform", path);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [detail, setDetail] = useState<CompanySummary | null>(null);
  const [decision, setDecision] = useState("APPROVE");
  const [remarks, setRemarks] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [editingService, setEditingService] =
    useState<ServiceDefinition | null>(null);
  const [servicePrice, setServicePrice] = useState("");
  const [description, setDescription] = useState("");
  const [serviceActive, setServiceActive] = useState(true);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const actionLock = useRef(false);
  useEffect(() => {
    if (!session?.platform_admin) return;
    let active = true;
    void api<ServiceDefinition[]>("/platform/services")
      .then((value) => {
        if (active) {
          setServices(value);
          setCatalogError("");
        }
      })
      .catch((e) => {
        if (active)
          setCatalogError(
            e instanceof Error
              ? e.message
              : "The service catalogue could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [session?.platform_admin, catalogRetry]);
  const nameFor = (code: string) =>
    services.find((s) => s.service_code === code)?.name ??
    code.toLowerCase().replaceAll("_", " ");
  const companies = (data?.companies ?? []).filter((c) =>
    (c.company_name + " " + c.email)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const payments = (data?.payments ?? []).filter(
    (p) => !companyFilter || p.company_id === companyFilter,
  );
  const configurations = (data?.configuration_requests ?? []).filter(
    (r) => !companyFilter || r.company_id === companyFilter,
  );
  const pendingPayment = (status: string) =>
    ["PENDING_REVIEW", "PENDING", "PENDING_VERIFICATION"].includes(status);
  const pendingConfig = (status: string) =>
    ["PENDING_REVIEW", "PENDING", "PENDING_APPROVAL"].includes(status);
  function openReview(next: ReviewTarget) {
    setTarget(next);
    setDecision("APPROVE");
    setRemarks("");
    setConfirmed(false);
    setActionError("");
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    if (!target || actionLock.current || !confirmed) return;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const id =
        target.kind === "payment"
          ? target.record.payment_id
          : target.record.request_id;
      await api(
        "/platform/" +
          (target.kind === "payment" ? "payments" : "configuration-requests") +
          "/" +
          id +
          "/review",
        {
          method: "POST",
          body: JSON.stringify({ decision, remarks: remarks.trim() }),
        },
      );
      setNotice(
        (target.kind === "payment" ? "Payment" : "Configuration request") +
          " " +
          (decision === "APPROVE" ? "approved" : "rejected") +
          " for " +
          target.record.company_name +
          ".",
      );
      setTarget(null);
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "The decision could not be saved.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function editService(service: ServiceDefinition) {
    setEditingService(service);
    setServicePrice((service.price_minor / 100).toFixed(2));
    setDescription(service.description);
    setServiceActive(service.active);
    setActionError("");
    setConfirmed(false);
  }
  async function saveService(event: FormEvent) {
    event.preventDefault();
    if (!editingService || !confirmed || actionLock.current) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(servicePrice)) {
      setActionError("Enter a positive price with at most two decimal places.");
      return;
    }
    const amount = Math.round(Number(servicePrice) * 100);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
      setActionError(
        "Enter a price between 0.01 and 10,000,000 currency units.",
      );
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await api(
        "/platform/services/" + encodeURIComponent(editingService.service_code),
        {
          method: "PUT",
          body: JSON.stringify({
            price_minor: amount,
            description: description.trim(),
            active: serviceActive,
            version: editingService.version,
          }),
        },
      );
      setNotice(
        "Service settings saved. Existing company order totals remain unchanged.",
      );
      setEditingService(null);
      setCatalogRetry((x) => x + 1);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Service settings could not be saved.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const title = (
    {
      "": "Your platform, at a glance.",
      companies: "Companies",
      payments: "Payment reviews",
      configuration: "Configuration requests",
      services: "Service catalogue",
    } as Record<string, string>
  )[view];
  return (
    <CommerceShell kind="platform" path={path} session={session}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>DEVELOPER ADMINISTRATION</span>
          <h1>{title}</h1>
          <p>
            Company activation, subscribed services and configuration approvals
            in one place.
          </p>
        </div>
        <button
          className={styles.secondary}
          type="button"
          disabled={loading || busy}
          onClick={() => void reload()}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      <WorkspaceFeedback
        error={error}
        loading={loading}
        denied={denied}
        hasData={!!data}
        onRetry={() => void reload()}
      />
      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      {data && !denied && (
        <>
          <div className={styles.stats}>
            {[
              {
                label: "Registered companies",
                value: data.counts.companies,
                icon: Building2,
                detail: "Across company registrations",
              },
              {
                label: "Active companies",
                value: data.counts.active_companies,
                icon: CheckCircle2,
                detail: "Payment verified & access enabled",
              },
              {
                label: "Payment reviews",
                value: data.counts.pending_payments,
                icon: CircleDollarSign,
                detail: "Awaiting administrator verification",
              },
              {
                label: "Configuration requests",
                value: data.counts.pending_configuration_requests,
                icon: FileCheck2,
                detail: "Awaiting a scoped decision",
              },
            ].map(({ label, value, icon: Icon, detail: text }) => (
              <div className={styles.stat} key={label}>
                <small>
                  {label}
                  <Icon size={16} />
                </small>
                <strong>{value}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
          {view === "" && (
            <div className={styles.rowGrid}>
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>Review priorities</h2>
                <div className={styles.requestList}>
                  <div className={styles.requestItem}>
                    <div>
                      <h3>Payment verification</h3>
                      <span className={styles.chip}>
                        {data.counts.pending_payments} waiting
                      </span>
                    </div>
                    <p>
                      Confirm the reference and amount before activating a
                      company’s selected services.
                    </p>
                    <Link href="/platform/payments" className={styles.textLink}>
                      Open payment reviews <ArrowRight size={14} />
                    </Link>
                  </div>
                  <div className={styles.requestItem}>
                    <div>
                      <h3>Company configuration</h3>
                      <span className={styles.chip}>
                        {data.counts.pending_configuration_requests} waiting
                      </span>
                    </div>
                    <p>
                      Review the company, service, proposed field and business
                      reason. Decisions apply only to that company’s
                      configuration.
                    </p>
                    <Link
                      href="/platform/configuration"
                      className={styles.textLink}
                    >
                      Review configuration <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </section>
              <section className={styles.panel}>
                <h2 className={styles.sectionTitle}>Company lifecycle</h2>
                <ol className={styles.receipt}>
                  <li>Company submits its details and service selection.</li>
                  <li>The server fixes the order total and price version.</li>
                  <li>
                    Administrator verifies the submitted payment reference.
                  </li>
                  <li>Only approved services activate in the company scope.</li>
                </ol>
                <div className={styles.notice}>
                  Payment reference verification is manual in this development
                  environment. No gateway charge is performed.
                </div>
                <Link className={styles.textLink} href="/platform/companies">
                  View companies <ArrowRight size={14} />
                </Link>
              </section>
            </div>
          )}
          {(view === "" || view === "companies") && (
            <section
              className={styles.panel}
              style={{ marginTop: view ? 0 : 25 }}
            >
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle}>Company directory</h2>
                <label>
                  <span className={styles.hidden}>Search companies</span>
                  <input
                    className={styles.search}
                    type="search"
                    aria-label="Search companies"
                    placeholder="Search company or email…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {data.has_more_companies && (
                <p className={styles.notice}>
                  Showing the latest {data.list_limit} companies. Counts above
                  describe the full register; search filters these loaded
                  records.
                </p>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Services</th>
                      <th>Status</th>
                      <th>Configuration</th>
                      <th>Order total</th>
                      <th>
                        <span className={styles.hidden}>Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((company) => (
                      <tr key={company.company_id}>
                        <td>
                          <strong>{company.company_name}</strong>
                          <small>{company.email}</small>
                          <small>{displayDate(company.created_at)}</small>
                        </td>
                        <td>
                          <div className={styles.chips}>
                            {(company.active_services.length
                              ? company.active_services
                              : company.requested_services
                            ).map((code) => (
                              <span className={styles.chip} key={code}>
                                {nameFor(code)}
                              </span>
                            ))}
                          </div>
                          <small>
                            {company.active_services.length
                              ? "Active subscriptions"
                              : "Requested services"}
                          </small>
                        </td>
                        <td>
                          <span
                            className={styles.status}
                            data-state={company.status}
                          >
                            {statusLabel(company.status)}
                          </span>
                        </td>
                        <td>
                          {company.pending_configuration_requests} pending
                        </td>
                        <td>{money(company.total_minor, company.currency)}</td>
                        <td>
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={() => setDetail(company)}
                            aria-label={"View " + company.company_name}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!companies.length && (
                  <div className={styles.empty}>
                    <Search size={25} />
                    <h2>
                      {query
                        ? "No matching company"
                        : "No company registrations yet"}
                    </h2>
                    <p>
                      {query
                        ? "Change the company name or email search."
                        : "New company registrations will appear here with their chosen services and payment status."}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
          {(view === "payments" || view === "configuration") && (
            <section className={styles.panel}>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle}>
                  {view === "payments"
                    ? "Payment verification queue"
                    : "Company configuration queue"}
                </h2>
                <label className={styles.field}>
                  Company
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                  >
                    <option value="">All loaded companies</option>
                    {data.companies.map((c) => (
                      <option key={c.company_id} value={c.company_id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className={styles.notice}>
                Queues show up to {data.list_limit} recent records. Review
                actions are available only for pending requests.
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    {view === "payments" ? (
                      <tr>
                        <th>Company</th>
                        <th>Payment reference</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>Company / service</th>
                        <th>Requested change</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {view === "payments"
                      ? payments.map((payment) => (
                          <tr key={payment.payment_id}>
                            <td>
                              <strong>{payment.company_name}</strong>
                              <small>{payment.reference}</small>
                            </td>
                            <td>
                              {payment.payment_reference}
                              <small>{displayDate(payment.created_at)}</small>
                            </td>
                            <td>
                              {money(payment.total_minor, payment.currency)}
                            </td>
                            <td>
                              <span
                                className={styles.status}
                                data-state={payment.status}
                              >
                                {statusLabel(payment.status)}
                              </span>
                              {payment.remarks && (
                                <small>{payment.remarks}</small>
                              )}
                            </td>
                            <td>
                              {pendingPayment(payment.status) ? (
                                <button
                                  className={styles.primary}
                                  type="button"
                                  onClick={() =>
                                    openReview({
                                      kind: "payment",
                                      record: payment,
                                    })
                                  }
                                >
                                  Review payment
                                </button>
                              ) : (
                                "Reviewed"
                              )}
                            </td>
                          </tr>
                        ))
                      : configurations.map((request) => (
                          <tr key={request.request_id}>
                            <td>
                              <strong>{request.company_name}</strong>
                              <small>{request.service_name}</small>
                            </td>
                            <td>
                              <strong>{request.field.label}</strong>
                              <small>
                                {request.field.technical_name} ·{" "}
                                {request.field.data_type}
                              </small>
                              <small>
                                {request.field.sensitive
                                  ? "Sensitive field"
                                  : "Standard field"}
                              </small>
                            </td>
                            <td>
                              {request.reason}
                              <small>{displayDate(request.created_at)}</small>
                            </td>
                            <td>
                              <span
                                className={styles.status}
                                data-state={request.status}
                              >
                                {statusLabel(request.status)}
                              </span>
                              {request.remarks && (
                                <small>{request.remarks}</small>
                              )}
                            </td>
                            <td>
                              {pendingConfig(request.status) ? (
                                <button
                                  className={styles.primary}
                                  type="button"
                                  onClick={() =>
                                    openReview({
                                      kind: "configuration",
                                      record: request,
                                    })
                                  }
                                >
                                  Review change
                                </button>
                              ) : (
                                "Reviewed"
                              )}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
                {!(view === "payments" ? payments : configurations).length && (
                  <div className={styles.empty}>
                    <CheckCircle2 size={27} />
                    <h2>No matching requests</h2>
                    <p>
                      New requests appear here with their company and service
                      context.
                    </p>
                  </div>
                )}
              </div>
              <Link href="/people/configuration" className={styles.textLink}>
                Open existing employee configuration reviews{" "}
                <ArrowRight size={14} />
              </Link>
            </section>
          )}
          {view === "services" && (
            <section className={styles.panel}>
              <div className={styles.toolbar}>
                <h2 className={styles.sectionTitle}>
                  Installed service definitions
                </h2>
                <button
                  className={styles.secondary}
                  onClick={() => setCatalogRetry((x) => x + 1)}
                >
                  Reload catalogue
                </button>
              </div>
              <p className={styles.notice}>
                Descriptions, availability and reference prices are
                database-backed. A new business service still requires an
                installed component; configuration does not execute arbitrary
                code. Price changes affect future registrations only.
              </p>
              {catalogError && (
                <p className={styles.error} role="alert">
                  {catalogError}
                </p>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Price</th>
                      <th>Dependencies</th>
                      <th>Availability</th>
                      <th>Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service) => (
                      <tr key={service.service_code}>
                        <td>
                          <strong>{service.name}</strong>
                          <small>
                            {service.suite} / {service.engine}
                          </small>
                          <small>{service.description}</small>
                        </td>
                        <td>
                          {money(service.price_minor, service.currency)}
                          <small>
                            per {service.billing_period.toLowerCase()}
                          </small>
                        </td>
                        <td>
                          {service.dependencies.map(nameFor).join(", ") ||
                            "None"}
                        </td>
                        <td>
                          <span
                            className={styles.status}
                            data-state={
                              service.active && service.available
                                ? "ACTIVE"
                                : "INACTIVE"
                            }
                          >
                            {service.active && service.available
                              ? "Available"
                              : "Unavailable"}
                          </span>
                          <small>Version {service.version}</small>
                        </td>
                        <td>
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={() => editService(service)}
                          >
                            Edit settings
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {detail && (
        <CommerceDialog
          title={detail.company_name}
          onClose={() => setDetail(null)}
        >
          <dl className={styles.receipt}>
            <div>
              <dt>Company contact</dt>
              <dd>{detail.email}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(detail.status)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{detail.reference}</dd>
            </div>
            <div>
              <dt>Active services</dt>
              <dd>
                {detail.active_services.map(nameFor).join(", ") ||
                  "No active services"}
              </dd>
            </div>
            <div>
              <dt>Requested services</dt>
              <dd>{detail.requested_services.map(nameFor).join(", ")}</dd>
            </div>
            <div>
              <dt>Configuration reviews</dt>
              <dd>{detail.pending_configuration_requests} pending</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <Link href="/platform/payments" className={styles.secondary}>
              Payment reviews
            </Link>
            <Link href="/platform/configuration" className={styles.primary}>
              Configuration requests
            </Link>
          </div>
        </CommerceDialog>
      )}
      {target && (
        <CommerceDialog
          title={
            target.kind === "payment"
              ? "Review payment & activation"
              : "Review company configuration"
          }
          onClose={() => setTarget(null)}
          busy={busy}
        >
          <p className={styles.notice}>
            {target.kind === "payment"
              ? "Approving verifies this payment and activates only the services in this company's saved order."
              : "Approving applies this field in the selected company and service. Other companies are unchanged."}
          </p>
          <dl className={styles.receipt}>
            <div>
              <dt>Company</dt>
              <dd>{target.record.company_name}</dd>
            </div>
            {target.kind === "payment" ? (
              <>
                <div>
                  <dt>Payment reference</dt>
                  <dd>{target.record.payment_reference}</dd>
                </div>
                <div>
                  <dt>Amount to verify</dt>
                  <dd>
                    {money(target.record.total_minor, target.record.currency)}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Service</dt>
                  <dd>{target.record.service_name}</dd>
                </div>
                <div>
                  <dt>Field</dt>
                  <dd>
                    {target.record.field.label} (
                    {target.record.field.technical_name}) ·{" "}
                    {target.record.field.data_type}
                  </dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{target.record.reason}</dd>
                </div>
              </>
            )}
          </dl>
          <form onSubmit={(event) => void review(event)}>
            <label className={styles.field}>
              Decision
              <select
                value={decision}
                onChange={(e) => {
                  setDecision(e.target.value);
                  setConfirmed(false);
                }}
                disabled={busy}
              >
                <option value="APPROVE">Approve</option>
                <option value="REJECT">Reject</option>
              </select>
            </label>
            <label className={styles.field}>
              Review notes
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={busy}
                placeholder={
                  target.kind === "payment"
                    ? "Record how the reference and amount were verified."
                    : "Record the reason for this decision."
                }
              />
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
                disabled={busy}
              />
              I confirm this decision for {target.record.company_name}.
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
                onClick={() => setTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className={
                  decision === "REJECT" ? styles.danger : styles.primary
                }
                disabled={busy || !confirmed}
              >
                {busy
                  ? "Saving decision…"
                  : decision === "APPROVE"
                    ? "Confirm approval"
                    : "Confirm rejection"}
              </button>
            </div>
          </form>
        </CommerceDialog>
      )}
      {editingService && (
        <CommerceDialog
          title={"Service settings · " + editingService.name}
          onClose={() => setEditingService(null)}
          busy={busy}
        >
          <form onSubmit={(event) => void saveService(event)}>
            <label className={styles.field}>
              Description
              <textarea
                required
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.field}>
              Price ({editingService.currency} per{" "}
              {editingService.billing_period.toLowerCase()})
              <input
                required
                inputMode="decimal"
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                disabled={busy}
              />
              <small>
                Reference pricing for future registrations. Existing quoted
                orders keep their saved total.
              </small>
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={serviceActive}
                onChange={(e) => setServiceActive(e.target.checked)}
                disabled={busy}
              />
              Available for new registrations
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
                disabled={busy}
              />
              I confirm these service settings.
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
                onClick={() => setEditingService(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className={styles.primary} disabled={busy || !confirmed}>
                {busy ? "Saving…" : "Save service settings"}
              </button>
            </div>
          </form>
        </CommerceDialog>
      )}
    </CommerceShell>
  );
}
