"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "../../lib/shared/cos-api";
import { AuthShell } from "./cos-auth-screen";

const moduleLabel: Record<string, string> = {
  EMPLOYEES: "Employee records",
  LEAVE: "Leave",
  LEAVE_POLICY: "Leave policy",
};

type Catalog = { suite: string; engine: string; modules: string[] };

export default function CompanyRegister() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Catalog>("/company-requests/catalog")
      .then((value) => {
        setCatalog(value);
        setModules(value.modules);
      })
      .catch(() => setError("The module list could not be loaded."));
  }, []);

  const allOn =
    !!catalog && catalog.modules.every((code) => modules.includes(code));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Use a password of at least 12 characters.");
      return;
    }
    if (modules.length === 0) {
      setError("Choose at least one module.");
      return;
    }
    setBusy(true);
    try {
      await api("/company-requests", {
        method: "POST",
        body: JSON.stringify({
          company_name: company.trim(),
          email: email.trim(),
          password,
          modules,
        }),
      });
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? "This login is already in use, or the details are incomplete."
          : "The request could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <p className="auth-eyebrow">Company registration</p>
      <h1>Request access for your company.</h1>
      <p className="auth-intro">
        An administrator reviews the suite, engine, and modules, then activates
        this login. The password is not shown to the administrator.
      </p>
      {done ? (
        <p role="status">
          The request was sent. Wait for an administrator to approve it.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Company name
            <input
              required
              maxLength={80}
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </label>
          <label>
            Login email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={12}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {catalog && (
            <fieldset>
              <legend>Requested access</legend>
              <label>
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(event) =>
                    setModules(event.target.checked ? [...catalog.modules] : [])
                  }
                />{" "}
                Suite: Enterprise Management
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(event) =>
                    setModules(event.target.checked ? [...catalog.modules] : [])
                  }
                />{" "}
                Engine: HRMS
              </label>
              {catalog.modules.map((code) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={modules.includes(code)}
                    onChange={(event) =>
                      setModules((current) =>
                        event.target.checked
                          ? [...current, code]
                          : current.filter((item) => item !== code),
                      )
                    }
                  />{" "}
                  Module: {moduleLabel[code] ?? code}
                </label>
              ))}
            </fieldset>
          )}
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={busy || !catalog}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
