"use client";

import { useState } from "react";
import { api } from "../../../lib/cos-api";
import type { Account, PeopleAction } from "./types";
import styles from "./employee-onboarding-preview.module.css";

export default function EmployeeAccessCard({
  account: a,
  busy,
  run,
  notify,
  reload,
}: {
  account: Account;
  busy: boolean;
  run: PeopleAction;
  notify: (v: string) => void;
  reload: () => void;
}) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  async function decide(decision: "APPROVE" | "REJECT") {
    await api(`/accounts/${a.account_id}/review`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        employee_code: decision === "APPROVE" ? code : undefined,
        remarks: note,
      }),
    });
    notify(
      decision === "APPROVE"
        ? "Employee account activated and linked."
        : "Employee access rejected.",
    );
    reload();
  }
  return (
    <section
      className={styles.accountCard}
      aria-label={`Access request for ${a.email}`}
    >
      <h2>{a.full_name}</h2>
      <p>{a.email}</p>
      <label htmlFor={`code-${a.account_id}`}>Verified employee code</label>
      <input
        id={`code-${a.account_id}`}
        maxLength={80}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <label htmlFor={`note-${a.account_id}`}>Review note</label>
      <textarea
        id={`note-${a.account_id}`}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div>
        <button
          type="button"
          className={styles.secondary}
          disabled={busy || !note.trim()}
          onClick={() => void run(() => decide("REJECT"))}
        >
          Reject access
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={busy || !code.trim()}
          onClick={() => void run(() => decide("APPROVE"))}
        >
          Activate employee access
        </button>
      </div>
    </section>
  );
}
