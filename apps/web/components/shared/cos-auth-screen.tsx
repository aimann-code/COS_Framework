"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api, ApiError, login, type Session } from "../../lib/shared/cos-api";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <a className="skip-link" href="#auth-main">
        Skip to form
      </a>
      <aside className="auth-story" aria-label="About your workspace">
        <Link className="auth-brand" href="/sign-in" aria-label="COS home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            COS<span className="auth-brand-caption">CONNECTED WORKPLACE</span>
          </span>
        </Link>
        <div className="auth-story-content">
          <span className="auth-kicker">
            <span /> PEOPLE. PROCESS. PROGRESS.
          </span>
          <h2>
            A good place
            <br />
            to do <em>great work.</em>
          </h2>
          <p>
            One connected workspace for your people, their details, and every
            step forward.
          </p>
          <div className="auth-workflow" aria-hidden="true">
            <div className="auth-workflow-heading">
              <span className="auth-people">
                <i>AR</i>
                <i>MK</i>
                <i>JS</i>
              </span>
              <span>
                Your people, connected<small>Clarity at every step</small>
              </span>
              <Users size={21} />
            </div>
            {[
              {
                title: "A new beginning",
                text: "Employee details submitted",
                done: true,
              },
              {
                title: "The right review",
                text: "HR checks the details",
                done: true,
              },
              {
                title: "Ready for what’s next",
                text: "Approved records, all in one place",
                done: false,
              },
            ].map((step, index) => (
              <div
                className={`auth-workflow-step ${step.done ? "done" : ""}`}
                key={step.title}
              >
                <i>{step.done ? <Check size={13} /> : "03"}</i>
                <span>
                  {step.title}
                  <small>{step.text}</small>
                </span>
                <span className="auth-step-number">0{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="auth-story-foot">
          <ShieldCheck size={17} />
          <span>Thoughtful access. Accountable decisions.</span>
        </div>
      </aside>
      <section className="auth-main" id="auth-main" tabIndex={-1}>
        <div className="auth-mobile-brand">
          COS<span>EMPLOYEE MANAGEMENT</span>
        </div>
        {children}
        <footer className="auth-footer">
          COS · Employee Management<span>Made for a connected workplace</span>
        </footer>
      </section>
    </main>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  label = "Password",
  error,
  autoComplete = "current-password",
  hint,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-password ${error ? "invalid" : ""}`}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="auth-field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="auth-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export default function AuthScreen({
  mode,
  onSignedIn,
  initialError = "",
}: {
  mode: "sign-in" | "sign-up";
  onSignedIn: (session: Session) => void;
  initialError?: string;
}) {
  const signup = mode === "sign-up";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  function clear(field: string) {
    setErrors((e) => ({ ...e, [field]: "" }));
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!email.trim())
      found.email = signup
        ? "Enter your work email."
        : "Enter your email or username.";
    if (signup && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      found.email = "Enter a valid work email address.";
    if (signup && !name.trim()) found.full_name = "Enter your full name.";
    if (!password) found.password = "Enter your password.";
    if (
      signup &&
      (password.length < 12 || new TextEncoder().encode(password).length > 72)
    )
      found.password =
        "Use at least 12 characters, up to 72 bytes. A memorable passphrase works well.";
    if (signup && confirm !== password)
      found.confirm = "Your passwords do not match.";
    setErrors(found);
    setError("");
    if (Object.keys(found).length) {
      document.getElementById(`auth-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (signup) {
        await api("/auth/sign-up", {
          method: "POST",
          body: JSON.stringify({
            full_name: name.trim(),
            email: email.trim(),
            password,
          }),
        });
        setPassword("");
        setConfirm("");
        setSubmitted(true);
      } else {
        const session = await login(email.trim(), password);
        setPassword("");
        onSignedIn(session);
      }
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length)
        setErrors(e.fields);
      setError(
        e instanceof ApiError && e.status === 401
          ? "We couldn’t sign you in. Check your credentials. New accounts need HR verification and activation before signing in."
          : e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (submitted)
    return (
      <AuthShell>
        <div className="auth-content auth-confirmation">
          <span className="auth-success-icon">
            <CheckCircle2 size={30} />
          </span>
          <span className="auth-eyebrow">YOUR NEXT STEP</span>
          <h1>Request received.</h1>
          <p className="auth-intro">
            If this email is eligible, your access request is now waiting for an
            administrator’s review.
          </p>
          <ol className="auth-next-steps">
            <li>
              <span>
                <Check size={14} />
              </span>
              <div>
                <strong>Access request submitted</strong>
                <p>Your account details have been received.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Administrator review</strong>
                <p>
                  Your administrator confirms your identity and assigns your
                  access.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Sign in when approved</strong>
                <p>
                  Check with your administrator for the outcome, then use your
                  email and password.
                </p>
              </div>
            </li>
          </ol>
          <Link href="/sign-in" className="auth-submit">
            Back to sign in
            <ArrowRight size={18} />
          </Link>
          <p className="auth-fine-print">
            Already have an account? Your existing credentials stay the same.
          </p>
        </div>
      </AuthShell>
    );
  return (
    <AuthShell>
      <div className="auth-content" key={mode}>
        <nav className="auth-mode-nav" aria-label="Account access">
          <Link href="/sign-in" aria-current={!signup ? "page" : undefined}>
            Sign in
          </Link>
          <Link href="/sign-up" aria-current={signup ? "page" : undefined}>
            Request access
          </Link>
        </nav>
        <span className="auth-eyebrow">
          {signup ? "LET’S GET YOU STARTED" : "YOUR WORKSPACE AWAITS"}
        </span>
        <h1>{signup ? "Your next chapter starts here." : "Welcome back."}</h1>
        <p className="auth-intro">
          {signup
            ? "Create your account and request access to your workplace."
            : "Sign in to pick up where you left off."}
        </p>
        <form
          noValidate
          onSubmit={submit}
          className="auth-form"
          aria-busy={busy}
        >
          {signup && (
            <div className="auth-field">
              <label htmlFor="auth-full_name">Full name</label>
              <input
                id="auth-full_name"
                autoComplete="name"
                maxLength={100}
                placeholder="Your full name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clear("full_name");
                }}
                aria-invalid={!!errors.full_name}
                aria-describedby={errors.full_name ? "name-error" : undefined}
                required
              />
              {errors.full_name && (
                <p className="auth-field-error" id="name-error">
                  {errors.full_name}
                </p>
              )}
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="auth-email">
              {signup ? "Work email" : "Email or username"}
            </label>
            <input
              id="auth-email"
              type={signup ? "email" : "text"}
              inputMode={signup ? "email" : "text"}
              autoComplete="username"
              maxLength={254}
              placeholder={
                signup ? "you@company.com" : "Enter your email or username"
              }
              spellCheck={false}
              autoCapitalize="none"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear("email");
              }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              required
            />
            {errors.email && (
              <p className="auth-field-error" id="email-error">
                {errors.email}
              </p>
            )}
          </div>
          <PasswordInput
            id="auth-password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              clear("password");
            }}
            error={errors.password}
            autoComplete={signup ? "new-password" : "current-password"}
            hint={
              signup
                ? "At least 12 characters. Try a memorable passphrase."
                : undefined
            }
          />
          {signup && (
            <PasswordInput
              id="auth-confirm"
              label="Confirm password"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                clear("confirm");
              }}
              error={errors.confirm}
              autoComplete="new-password"
            />
          )}
          {!signup && (
            <details className="auth-recovery">
              <summary>Forgot your password?</summary>
              <p>
                Contact your workspace administrator to restore access.
                Self-service password reset is not available yet.
              </p>
            </details>
          )}
          {error && (
            <div className="auth-error" role="alert">
              <ShieldCheck size={17} />
              <p>{error}</p>
            </div>
          )}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={18} className="auth-spinner" />
                {signup ? "Submitting request…" : "Signing you in…"}
              </>
            ) : (
              <>
                {signup ? "Create account & request access" : "Sign in"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          {signup && (
            <p className="auth-approval-note">
              <LockKeyhole size={15} />
              <span>
                HR must approve your account before you can access
                employee information.
              </span>
            </p>
          )}
        </form>
        <p className="auth-switch">
          {signup ? "Already part of the team?" : "New to this workspace?"}{" "}
          <Link href={signup ? "/sign-in" : "/sign-up"}>
            {signup ? "Sign in" : "Create an account"}
            <ArrowRight size={13} />
          </Link>
        </p>
        {!signup && (
          <div className="auth-trust">
            <ShieldCheck size={17} />
            <span>Your access is assigned by your administrator.</span>
          </div>
        )}
        {!signup && (
          <p className="auth-switch">
            <Link href="/company-register">Register a company</Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
