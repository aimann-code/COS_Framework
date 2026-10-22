"use client";
import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api, ApiError } from "../lib/cos-api";
import { Button, Modal, Empty } from "./cos-ui";
import { date_label } from "../lib/cos-domain";
type Account = {
  account_id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
};
export default function AccountReview({
  close,
  standalone = false,
}: {
  close: () => void;
  standalone?: boolean;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Account>();
  const [role, setRole] = useState("VIEWER");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setAccounts(await api<Account[]>("/accounts/pending"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load account requests.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function decide(approve: boolean) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/accounts/${selected.account_id}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision: approve ? "APPROVE" : "REJECT",
          role: approve ? role : null,
          remarks: note,
        }),
      });
      setSelected(undefined);
      setNotice(
        approve
          ? "Account approved. The user can now sign in."
          : "Access request rejected.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "The review could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountFrame standalone={standalone} close={close}>
      <div className="modal-body account-review">
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="info-callout" role="status">
            {notice}
          </p>
        )}
        {selected ? (
          <>
            <button
              className="text-button"
              onClick={() => {
                setSelected(undefined);
                setError("");
              }}
            >
              ← Back to requests
            </button>
            <h3>{selected.full_name}</h3>
            <p className="small-muted">{selected.email}</p>
            <div className="info-callout">
              <ShieldCheck size={18} />
              <p>
                Confirm this person’s identity and workplace membership before
                approving access.
              </p>
            </div>
            <label className="form-field">
              Assign access
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="VIEWER">
                  Employee viewer — read permitted details
                </option>
                <option value="REGISTRAR">
                  Registration user — submit employee requests
                </option>
              </select>
            </label>
            <label className="form-field">
              Review note
              <textarea
                maxLength={500}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Required if you reject this request"
              />
            </label>
            <div className="button-row">
              <Button
                secondary
                disabled={busy || !note.trim()}
                onClick={() => void decide(false)}
              >
                <X size={16} />
                Reject access
              </Button>
              <Button disabled={busy} onClick={() => void decide(true)}>
                <Check size={16} />
                {busy ? "Saving…" : "Approve access"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="account-review-toolbar">
              <p className="small-muted">
                Pending requests · up to 100 at a time
              </p>
              <Button secondary disabled={loading} onClick={() => void load()}>
                <RefreshCw size={14} />
                Refresh
              </Button>
            </div>
            {loading ? (
              <p role="status">Loading account requests…</p>
            ) : accounts.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Requested</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.account_id}>
                        <td>
                          <strong>{a.full_name}</strong>
                          <p className="small-muted">{a.email}</p>
                        </td>
                        <td>{date_label(a.created_at)}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelected(a);
                              setRole("VIEWER");
                              setNote("");
                              setNotice("");
                            }}
                          >
                            Review access
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="All caught up">
                New account requests will appear here for your review.
              </Empty>
            )}
          </>
        )}
      </div>
    </AccountFrame>
  );
}

function AccountFrame({
  children,
  standalone,
  close,
}: {
  children: React.ReactNode;
  standalone: boolean;
  close: () => void;
}) {
  if (!standalone)
    return (
      <Modal
        title="Account access"
        subtitle="Review new account requests before granting access"
        close={close}
      >
        {children}
      </Modal>
    );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Pending account requests</h2>
          <p>Verify identity and assign the right workspace access.</p>
        </div>
        <Button secondary onClick={close}>
          Back to overview
        </Button>
      </div>
      {children}
    </section>
  );
}
