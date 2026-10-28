"use client";

import { useEffect, useState } from "react";
import { onboarding, type WorkEmailPreview } from "../../../../lib/hrms/employee-management/onboarding-api";
import styles from "../employee-onboarding-preview.module.css";

export default function WorkEmailPanel({
  draftId,
  values,
  setValues,
  disabled,
  ensureSaved,
}: {
  draftId: string;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  disabled: boolean;
  ensureSaved?: () => Promise<string>;
}) {
  const mode = values.work_email_mode || "generate";
  const [preview, setPreview] = useState<WorkEmailPreview | null>(null);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!draftId || !values.name?.trim()) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let id = draftId;
          if (ensureSaved) id = await ensureSaved();
          const p = await onboarding.previewWorkEmail(id, {
            name: values.name,
            mode: values.work_email_mode || "generate",
            existing: values.work_email_existing,
          });
          if (active) {
            setPreview(p);
            setPreviewError("");
          }
        } catch (e) {
          if (active) {
            setPreview(null);
            setPreviewError(
              e instanceof Error ? e.message : "Unable to preview work email.",
            );
          }
        }
      })();
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    draftId,
    values.name,
    values.work_email_mode,
    values.work_email_existing,
    ensureSaved,
  ]);

  return (
    <section className={styles.profileCard} aria-labelledby="work-email-heading">
      <h2 id="work-email-heading">Company work email</h2>
      <p className={styles.privateNote}>
        The system assigns a unique mailbox on your company domain. HR does not
        need to remember existing addresses; collisions are resolved
        automatically.
      </p>
      <fieldset className={styles.inlineForm} disabled={disabled}>
        <legend className="sr-only">Work email source</legend>
        <label>
          <input
            type="radio"
            name="work_email_mode"
            checked={mode === "generate"}
            onChange={() =>
              setValues((v) => ({ ...v, work_email_mode: "generate" }))
            }
          />
          Generate work email for this employee
        </label>
        <label>
          <input
            type="radio"
            name="work_email_mode"
            checked={mode === "existing"}
            onChange={() =>
              setValues((v) => ({ ...v, work_email_mode: "existing" }))
            }
          />
          Employee already has a company mailbox
        </label>
      </fieldset>
      {mode === "existing" ? (
        <label>
          Existing work email
          <input
            type="email"
            autoComplete="off"
            maxLength={254}
            value={values.work_email_existing ?? ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                work_email_existing: e.target.value,
              }))
            }
            disabled={disabled}
          />
        </label>
      ) : (
        <div className={styles.reviewGrid}>
          <div>
            <dt>Proposed work email</dt>
            <dd>
              {preview?.proposed_email ??
                (values.name?.trim()
                  ? "Calculating…"
                  : "Enter the employee name to preview the address.")}
            </dd>
          </div>
          {preview?.note && (
            <div className={styles.wide}>
              <dt>Note</dt>
              <dd>{preview.note}</dd>
            </div>
          )}
          {preview?.collision_employee_code && (
            <div className={styles.wide}>
              <dt>In use by</dt>
              <dd>{preview.collision_employee_code}</dd>
            </div>
          )}
        </div>
      )}
      {previewError && (
        <p role="alert" className="error-callout">
          {previewError}
        </p>
      )}
    </section>
  );
}
