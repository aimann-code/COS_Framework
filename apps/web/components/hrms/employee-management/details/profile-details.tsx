import {
  addressFields,
  draftSections,
  repeatGroups,
} from "../../../../lib/hrms/employee-management/employee-onboarding-draft";
import type { EmployeeProfile } from "../../../../lib/hrms/employee-management/onboarding-api";
import DocumentLinks from "../documents/profile-document-links";
import styles from "../employee-onboarding-preview.module.css";

export default function ProfileDetails({
  employee,
}: {
  employee: EmployeeProfile;
}) {
  const p = employee.profile;
  const base = new Set(
    draftSections.flatMap((s) => s.fields).map((f) => f.key),
  );
  return (
    <>
      {employee.work_email && (
        <section className={styles.profileCard}>
          <h2>Company work email</h2>
          <dl className={styles.reviewGrid}>
            <div>
              <dt>Work email</dt>
              <dd>{employee.work_email}</dd>
            </div>
            {employee.work_email_status && (
              <div>
                <dt>Mailbox status</dt>
                <dd>{employee.work_email_status.replaceAll("_", " ")}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
      <div className={styles.profileGrid}>
        {draftSections.map((s) => (
          <section key={s.id} className={styles.profileCard}>
            <h2>{s.title}</h2>
            <dl className={styles.reviewGrid}>
              {s.fields.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{p.values[f.key] || "Not provided"}</dd>
                </div>
              ))}
              {s.id === "addresses" &&
                ["permanent", "local"].map((prefix) => (
                  <div key={prefix} className={styles.wide}>
                    <dt>
                      {prefix === "permanent"
                        ? "Permanent address"
                        : "Local / temporary address"}
                    </dt>
                    <dd>
                      {addressFields
                        .map((f) => p.values[`${prefix}_${f.key}`])
                        .filter(Boolean)
                        .join(", ") || "Not provided"}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
      {Object.entries(p.groups).map(([group, entries]) => (
        <section key={group} className={styles.profileCard}>
          <h2>{repeatGroups[group]?.title ?? group}</h2>
          {entries.map((e, i) => (
            <dl key={e.id} className={styles.reviewGrid}>
              {Object.entries(e.values).map(([key, v]) => (
                <div key={key}>
                  <dt>
                    {i + 1}.{" "}
                    {repeatGroups[group]?.fields.find((f) => f.key === key)
                      ?.label ?? key}
                  </dt>
                  <dd>{v || "Not provided"}</dd>
                </div>
              ))}
            </dl>
          ))}
        </section>
      ))}
      {Object.entries(p.values).filter(
        ([key]) =>
          !base.has(key) &&
          !key.startsWith("permanent_") &&
          !key.startsWith("local_"),
      ).length > 0 && (
        <section className={styles.profileCard}>
          <h2>Company fields</h2>
          <dl className={styles.reviewGrid}>
            {Object.entries(p.values)
              .filter(
                ([key]) =>
                  !base.has(key) &&
                  !key.startsWith("permanent_") &&
                  !key.startsWith("local_"),
              )
              .map(([key, v]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{v || "Not provided"}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      <DocumentLinks documents={employee.documents} />
    </>
  );
}
