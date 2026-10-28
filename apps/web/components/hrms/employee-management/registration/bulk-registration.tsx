"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { ApiError } from "../../../../lib/shared/cos-api";
import {
  onboarding,
  type EmployeeProfile,
  type ProfileData,
} from "../../../../lib/hrms/employee-management/onboarding-api";
import styles from "../employee-onboarding-preview.module.css";

const COLUMNS = ["name", "joiner", "joining", "phone", "previous_id"] as const;
const MAX_ROWS = 50;
const EXAMPLE = `name,joiner,joining,phone,previous_id
Example Person,New joiner,2026-01-10,+91 00000 00000,`;

type BulkRegistrationProps = {
  onRegistered: (employees: EmployeeProfile[]) => void;
};

function splitCsv(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseBulkRegistration(text: string): ProfileData[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new Error(
      "Add a header and at least one employee. Columns: name, joiner, joining, phone, previous_id.",
    );
  }
  const header = splitCsv(lines[0]).map((cell) => cell.toLowerCase());
  for (const column of ["name", "joiner", "joining", "phone"]) {
    if (!header.includes(column)) {
      throw new Error(`The file needs a ${column} column.`);
    }
  }
  const rows = lines.slice(1);
  if (rows.length > MAX_ROWS) {
    throw new Error("Register at most 50 employees in one file.");
  }
  return rows.map((line) => {
    const cells = splitCsv(line);
    const values: Record<string, string> = {};
    header.forEach((column, index) => {
      if (COLUMNS.includes(column as (typeof COLUMNS)[number])) {
        values[column] = cells[index] ?? "";
      }
    });
    return { values, groups: {}, same_address: false };
  });
}

function previewRows(text: string) {
  if (!text.trim()) return { rows: [] as ProfileData[], problem: "" };
  try {
    return { rows: parseBulkRegistration(text), problem: "" };
  } catch (cause) {
    return {
      rows: [] as ProfileData[],
      problem: cause instanceof Error ? cause.message : "These rows cannot be read.",
    };
  }
}

function fieldErrors(fields: Record<string, string>) {
  return Object.entries(fields).map(([key, message]) => {
    const match = /^row_(\d+)_(.+)$/.exec(key);
    return match
      ? `Row ${match[1]}, ${match[2].replaceAll("_", " ")}: ${message}`
      : `${key.replaceAll("_", " ")}: ${message}`;
  });
}

export default function BulkRegistration({ onRegistered }: BulkRegistrationProps) {
  const textId = useId();
  const fileId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [registered, setRegistered] = useState<EmployeeProfile[]>([]);
  const preview = previewRows(text);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error, details]);

  function replaceText(next: string) {
    setText(next);
    setError("");
    setDetails([]);
    setRegistered([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = previewRows(text);
    if (parsed.problem || parsed.rows.length === 0) {
      setRegistered([]);
      setDetails([]);
      setError(parsed.problem || "Add at least one employee row.");
      return;
    }
    setBusy(true);
    setError("");
    setDetails([]);
    try {
      const employees = await onboarding.registerMany(parsed.rows);
      setRegistered(employees);
      setText("");
      onRegistered(employees);
    } catch (cause) {
      setRegistered([]);
      if (cause instanceof ApiError) {
        setError(cause.message);
        setDetails(fieldErrors(cause.fields));
      } else {
        setError(
          cause instanceof Error ? cause.message : "The batch could not be registered.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.formPanel} ${styles.batch}`} aria-labelledby="bulk-registration-title">
      <div className={styles.formHeading}>
        <div>
          <span className={styles.sectionNumber}>HR BATCH</span>
          <h2 id="bulk-registration-title">Register several employees</h2>
          <p>
            Check the preview, then register. One invalid row rejects the whole file.
            Aadhaar, PAN, and photos stay on each profile afterwards.
          </p>
        </div>
      </div>
      <form aria-busy={busy} onSubmit={(event) => void submit(event)}>
        <div className={styles.formBody}>
        <div className={styles.field}>
          <label htmlFor={fileId}>
            Employee file <span>CSV</span>
          </label>
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              void file.text().then(
                (contents) => {
                  replaceText(contents);
                  input.value = "";
                },
                () => {
                  setRegistered([]);
                  setDetails([]);
                  setError("That file could not be read. Choose it again or paste the rows.");
                  input.value = "";
                },
              );
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={textId}>
            Employee rows <span aria-hidden="true">Required</span>
          </label>
          <textarea
            id={textId}
            value={text}
            required
            disabled={busy}
            spellCheck={false}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "bulk-registration-error" : "bulk-registration-help"}
            onChange={(event) => replaceText(event.target.value)}
            placeholder={EXAMPLE}
          />
          <small id="bulk-registration-help">
            Header required. At most 50 rows. Joining dates use YYYY-MM-DD. A rejoin needs the
            previous employee code.
          </small>
        </div>
        {!text.trim() && registered.length === 0 && (
          <p className={styles.privateNote}>
            Paste rows or choose a CSV. Nothing is registered until you confirm the preview.
          </p>
        )}
        {preview.rows.length > 0 && (
          <table className={styles.batchPreview}>
            <caption className="sr-only">Employees ready to register</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Joiner</th>
                <th scope="col">Joining</th>
                <th scope="col">Phone</th>
                <th scope="col">Previous code</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => (
                <tr key={`${row.values.name}-${index}`}>
                  <td>{row.values.name || "—"}</td>
                  <td>{row.values.joiner || "—"}</td>
                  <td>{row.values.joining || "—"}</td>
                  <td>{row.values.phone || "—"}</td>
                  <td>{row.values.previous_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {text.trim() && preview.problem && !error && (
          <p className={styles.privateNote}>{preview.problem}</p>
        )}
        {error && (
          <div
            id="bulk-registration-error"
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="error-callout"
          >
            {error}
            {details.length > 0 && (
              <ul>
                {details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {registered.length > 0 && (
          <div role="status" className={styles.notice}>
            <div>
              Registered {registered.length}{" "}
              {registered.length === 1 ? "employee" : "employees"}. Open a profile to add photos
              and the remaining details.
              <ul className={styles.batchResult}>
                {registered.map((employee) => (
                  <li key={employee.employee_id}>
                    <Link href={`/people/employees/${employee.employee_id}`}>
                      {employee.display_name} ({employee.employee_code})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className={styles.formFooter}>
        <span className={styles.batchCount}>
          {preview.rows.length > 0 ? `${preview.rows.length} ready` : "No rows ready"}
        </span>
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={() => replaceText(EXAMPLE)}
        >
          Use example
        </button>
        <button
          className={styles.primary}
          type="submit"
          disabled={busy || preview.rows.length === 0}
        >
          <FileUp size={15} aria-hidden="true" />
          {busy ? "Registering…" : "Register this batch"}
        </button>
      </div>
      </form>
    </section>
  );
}
