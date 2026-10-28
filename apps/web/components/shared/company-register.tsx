"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Layers3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api, ApiError } from "../../lib/shared/cos-api";
import {
  money,
  statusLabel,
  withDependencies,
  type CompanyRegistration,
  type PaymentReview,
  type ServiceCatalog,
} from "../../lib/shared/commerce";
import styles from "./commerce.module.css";

export default function CompanyRegister() {
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [retry, setRetry] = useState(0);
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [registration, setRegistration] = useState<CompanyRegistration | null>(
    null,
  );
  const [payment, setPayment] = useState<PaymentReview | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryId, setRecoveryId] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const actionLock = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    void api<ServiceCatalog>("/services/catalog")
      .then((value) => {
        if (!active) return;
        setCatalog(value);
        setCatalogError("");
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
  }, [retry]);
  useEffect(() => {
    if (step > 0) titleRef.current?.focus();
  }, [step]);

  const services = catalog?.services ?? [];
  const chosen = services.filter((s) => selected.includes(s.service_code));
  const total = chosen.reduce((sum, s) => sum + s.price_minor, 0);
  const required = new Set(chosen.flatMap((s) => s.dependencies));
  function select(code: string, on: boolean) {
    setSelected((current) =>
      on
        ? withDependencies([...current, code], services)
        : current.filter((c) => c !== code),
    );
  }
  async function run(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "The request could not be completed. Please try again.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  function details(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!company.trim()) {
      setError("Enter the company name.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("Use a password of at most 72 UTF-8 bytes.");
      return;
    }
    setStep(1);
  }
  async function register(event: FormEvent) {
    event.preventDefault();
    if (!selected.length || !confirmed) {
      setError("Choose a service and confirm the registration summary.");
      return;
    }
    await run(async () => {
      const value = await api<CompanyRegistration>("/companies/register", {
        method: "POST",
        body: JSON.stringify({
          company_name: company.trim(),
          email: email.trim(),
          password,
          services: selected,
        }),
      });
      setRegistration(value);
      setPassword("");
      setConfirm("");
      setStep(2);
    });
  }
  async function declarePayment(event: FormEvent) {
    event.preventDefault();
    if (!registration) return;
    await run(async () => {
      const value = await api<PaymentReview>(
        "/companies/" + registration.company_id + "/payment",
        {
          method: "POST",
          body: JSON.stringify({
            registration_token: registration.registration_token,
            payment_reference: paymentReference.trim(),
          }),
        },
      );
      setPayment(value);
      setRegistration((current) =>
        current
          ? {
              ...current,
              status:
                value.status === "APPROVED"
                  ? "ACTIVE"
                  : value.status === "REJECTED"
                    ? "PAYMENT_REJECTED"
                    : "PAYMENT_REVIEW",
            }
          : current,
      );
      setStep(3);
    });
  }
  async function refreshStatus() {
    if (!registration) return;
    await run(async () => {
      const value = await api<CompanyRegistration>(
        "/companies/" + registration.company_id + "/status",
        {
          method: "POST",
          body: JSON.stringify({
            registration_token: registration.registration_token,
          }),
        },
      );
      setRegistration({
        ...value,
        registration_token: registration.registration_token,
      });
      setNotice(
        "Registration status checked: " + statusLabel(value.status) + ".",
      );
    });
  }
  async function recover(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const value = await api<CompanyRegistration>(
        "/companies/" + encodeURIComponent(recoveryId.trim()) + "/status",
        {
          method: "POST",
          body: JSON.stringify({ registration_token: recoveryToken.trim() }),
        },
      );
      setRegistration({ ...value, registration_token: recoveryToken.trim() });
      setCompany(value.company_name);
      setSelected(value.requested_services);
      setStep(value.status === "PENDING_PAYMENT" ? 2 : 3);
    });
  }
  const awaiting =
    !!payment ||
    (registration &&
      !["PENDING_PAYMENT", "PAYMENT_REJECTED"].includes(registration.status));
  const active = registration?.status === "ACTIVE";
  return (
    <div className={styles.surface}>
      <a href="#company-registration" className={styles.skip}>
        Skip to company registration
      </a>
      <header className={styles.publicHeader}>
        <Link href="/" className={styles.brand}>
          <span>
            <Layers3 size={22} />
          </span>
          <span>
            COS<small>COMPANY ONBOARDING</small>
          </span>
        </Link>
        <Link href="/sign-in">
          Already registered? Sign in <ArrowRight size={14} />
        </Link>
      </header>
      <div className={styles.wizard}>
        <span className={styles.kicker}>YOUR COMPANY, CONNECTED</span>
        <h1>Build your company workspace.</h1>
        <p className={styles.intro}>
          Choose the services your team needs. Your workspace activates after
          payment verification; configuration changes follow a separate approval
          process.
        </p>
        <ol className={styles.steps} aria-label="Company registration progress">
          {[
            "Company details",
            "Choose services",
            "Payment reference",
            "Review & activation",
          ].map((label, index) => (
            <li key={label} aria-current={step === index ? "step" : undefined}>
              <span>{step > index ? <Check size={13} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className={styles.wizardGrid}>
          <main id="company-registration" className={styles.panel}>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            {notice && (
              <p className={styles.success} role="status">
                {notice}
              </p>
            )}
            {step === 0 && (
              <>
                <h2 ref={titleRef} tabIndex={-1}>
                  Tell us about your company.
                </h2>
                <p>
                  This login will manage the company workspace. Employee access
                  is verified separately.
                </p>
                <form onSubmit={details}>
                  <div className={styles.fields}>
                    <label className={styles.field + " " + styles.wide}>
                      Company name
                      <input
                        required
                        maxLength={80}
                        autoComplete="organization"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Your registered company name"
                      />
                    </label>
                    <label className={styles.field + " " + styles.wide}>
                      Work email
                      <input
                        required
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                      />
                    </label>
                    <label className={styles.field}>
                      Create password
                      <input
                        required
                        type="password"
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <small>At least 12 characters.</small>
                    </label>
                    <label className={styles.field}>
                      Confirm password
                      <input
                        required
                        type="password"
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className={styles.actions}>
                    <Link className={styles.textLink} href="/">
                      <ArrowLeft size={14} />
                      Back to COS
                    </Link>
                    <button className={styles.primary}>
                      Choose services <ArrowRight size={15} />
                    </button>
                  </div>
                </form>
                <details className={styles.recovery}>
                  <summary>Resume an existing registration</summary>
                  <p>
                    Use the company ID and private recovery key shown when you
                    registered.
                  </p>
                  <form onSubmit={recover}>
                    <label className={styles.field}>
                      Company ID
                      <input
                        required
                        value={recoveryId}
                        onChange={(e) => setRecoveryId(e.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      Recovery key
                      <input
                        type="password"
                        required
                        value={recoveryToken}
                        onChange={(e) => setRecoveryToken(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button className={styles.secondary} disabled={busy}>
                      Resume registration
                    </button>
                  </form>
                </details>
              </>
            )}
            {step === 1 && (
              <>
                <h2 ref={titleRef} tabIndex={-1}>
                  Choose what works for your business.
                </h2>
                <p>
                  Choose from the services currently available for your company.
                  Required services are included in your selection.
                </p>
                {!catalog && !catalogError && (
                  <div aria-busy="true" aria-label="Loading services">
                    <div className={styles.skeleton} />
                    <div className={styles.skeleton} />
                    <div className={styles.skeleton} />
                  </div>
                )}
                {catalogError && (
                  <div className={styles.error} role="alert">
                    {catalogError}
                    <button
                      className={styles.secondary}
                      onClick={() => {
                        setCatalogError("");
                        setRetry((x) => x + 1);
                      }}
                    >
                      Retry catalogue
                    </button>
                  </div>
                )}
                {catalog && (
                  <form onSubmit={(event) => void register(event)}>
                    <div className={styles.serviceList}>
                      {services
                        .filter((s) => s.active)
                        .map((service) => (
                          <label
                            className={styles.service}
                            key={service.service_code}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(service.service_code)}
                              disabled={
                                busy ||
                                !service.available ||
                                required.has(service.service_code)
                              }
                              onChange={(e) =>
                                select(service.service_code, e.target.checked)
                              }
                            />
                            <div>
                              <small>
                                {service.suite} / {service.engine}
                              </small>
                              <h3>{service.name}</h3>
                              <p>{service.description}</p>
                              {required.has(service.service_code) && (
                                <small>
                                  Required by another selected service.
                                </small>
                              )}
                              {!service.available && (
                                <small>Not currently available.</small>
                              )}
                            </div>
                            <span className={styles.price}>
                              {money(service.price_minor, service.currency)}
                              <small>
                                per {service.billing_period.toLowerCase()}
                              </small>
                            </span>
                          </label>
                        ))}
                    </div>
                    {!services.some((s) => s.active && s.available) && (
                      <p className={styles.notice}>
                        No services are available for registration right now.
                        Please check again later.
                      </p>
                    )}
                    <label className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        required
                      />
                      I confirm the company details and selected services.
                      Access starts only after payment is verified.
                    </label>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => setStep(0)}
                        disabled={busy}
                      >
                        Back
                      </button>
                      <button
                        className={styles.primary}
                        disabled={busy || !selected.length || !confirmed}
                      >
                        {busy ? "Registering…" : "Register company"}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
            {step === 2 && registration && (
              <>
                <h2 ref={titleRef} tabIndex={-1}>
                  Company registered. Payment comes next.
                </h2>
                <p>
                  Your request is saved. Submit the payment reference for an
                  administrator to verify before access is activated.
                </p>
                <dl className={styles.receipt}>
                  <div>
                    <dt>Company</dt>
                    <dd>{registration.company_name}</dd>
                  </div>
                  <div>
                    <dt>Registration reference</dt>
                    <dd>{registration.reference}</dd>
                  </div>
                  <div>
                    <dt>Server-confirmed total</dt>
                    <dd>
                      {money(registration.total_minor, registration.currency)} /{" "}
                      {registration.billing_period.toLowerCase()}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span
                        className={styles.status}
                        data-state={registration.status}
                      >
                        {statusLabel(registration.status)}
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className={styles.notice}>
                  This development workflow records and reviews a payment
                  reference. It does not collect funds or connect to a payment
                  gateway. Reference prices are not a commercial offer.
                </div>
                <form onSubmit={(event) => void declarePayment(event)}>
                  <label className={styles.field}>
                    Payment reference
                    <input
                      required
                      minLength={4}
                      maxLength={100}
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Transaction or verification reference"
                      autoComplete="off"
                    />
                    <small>
                      Do not enter bank credentials, card details or an OTP.
                    </small>
                  </label>
                  <div className={styles.actions}>
                    <span>
                      <ShieldCheck size={15} /> Administrator verification
                      required
                    </span>
                    <button className={styles.primary} disabled={busy}>
                      {busy ? "Submitting…" : "Submit for verification"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </form>
                <Recovery registration={registration} />
              </>
            )}
            {step === 3 && registration && (
              <>
                <h2 ref={titleRef} tabIndex={-1}>
                  {active
                    ? "Your company workspace is ready."
                    : "Your payment is under review."}
                </h2>
                <p>
                  {active
                    ? "The approved services are active for your company. Sign in with the company email and password you created."
                    : "An administrator will verify the payment reference and activate the services. Submitting a reference alone does not grant access."}
                </p>
                <div className={styles.success}>
                  <CheckCircle2 size={19} />{" "}
                  {active ? "Company activated" : "Payment reference submitted"}
                  <br />
                  {registration.company_name} · {registration.reference}
                </div>
                <dl className={styles.receipt}>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span
                        className={styles.status}
                        data-state={registration.status}
                      >
                        {payment && registration.status === "PENDING_PAYMENT"
                          ? "Pending verification"
                          : statusLabel(registration.status)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Payment reference</dt>
                    <dd>
                      {payment?.payment_reference ?? "See registration status"}
                    </dd>
                  </div>
                </dl>
                {registration.status === "PAYMENT_REJECTED" && (
                  <p className={styles.error}>
                    Payment could not be approved. Check the reference and
                    submit a corrected payment reference.
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => void refreshStatus()}
                  >
                    <RefreshCw size={14} />
                    Check status
                  </button>
                  {active ? (
                    <Link
                      href="/sign-in?next=%2Fcompany"
                      className={styles.primary}
                    >
                      Sign in to company <ArrowRight size={15} />
                    </Link>
                  ) : registration.status === "PAYMENT_REJECTED" ? (
                    <button
                      className={styles.primary}
                      type="button"
                      onClick={() => {
                        setPayment(null);
                        setStep(2);
                      }}
                    >
                      Correct reference
                    </button>
                  ) : (
                    <Link href="/" className={styles.textLink}>
                      Back to COS
                    </Link>
                  )}
                </div>
                <Recovery registration={registration} />
              </>
            )}
          </main>
          <aside className={styles.summary} aria-label="Registration summary">
            <h2>
              <Building2 size={18} /> Your workspace
            </h2>
            <p>
              {company || registration?.company_name || "Your company"}
              {email ? " · " + email : ""}
            </p>
            <ul>
              {chosen.map((service) => (
                <li key={service.service_code}>
                  <span>{service.name}</span>
                  {!registration && (
                    <strong>
                      {money(service.price_minor, service.currency)}
                    </strong>
                  )}
                </li>
              ))}
              {!chosen.length && <li>Choose services in the next step.</li>}
            </ul>
            <div className={styles.total}>
              <span>
                {registration ? "Confirmed total" : "Estimated total"}
              </span>
              <strong>
                {money(
                  registration?.total_minor ?? total,
                  registration?.currency ?? catalog?.currency ?? "INR",
                )}
              </strong>
            </div>
            <p>
              Per{" "}
              {(
                registration?.billing_period ??
                catalog?.billing_period ??
                "MONTHLY"
              ).toLowerCase()}
              .{" "}
              {catalog?.pricing_status === "DEVELOPMENT_REFERENCE"
                ? "Development reference pricing."
                : ""}
            </p>
            <div className={styles.notice}>
              1. Register company
              <br />
              2. Choose services
              <br />
              3. Verify payment
              <br />
              4. Activate workspace
            </div>
            <p>
              Additional fields and configuration changes require administrator
              approval after activation.
            </p>
            {awaiting && (
              <span className={styles.chip}>Registration saved</span>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
function Recovery({ registration }: { registration: CompanyRegistration }) {
  return (
    <details className={styles.recovery}>
      <summary>Save your registration recovery details</summary>
      <p>
        Keep these details private. They let you check this registration and
        submit a payment reference after leaving this page. The recovery key is
        not stored in the browser.
      </p>
      <strong>Company ID</strong>
      <code>{registration.company_id}</code>
      <strong>Recovery key</strong>
      <code>{registration.registration_token}</code>
    </details>
  );
}
