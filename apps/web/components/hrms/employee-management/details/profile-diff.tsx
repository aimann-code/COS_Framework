import {
  draftSections,
  repeatGroups,
} from "../../../../lib/hrms/employee-management/employee-onboarding-draft";
import type { EmployeeProfile, ProfileDraft } from "../../../../lib/hrms/employee-management/onboarding-api";
import styles from "../employee-onboarding-preview.module.css";

export default function ProfileDiff({
  draft,
  employee,
}: {
  draft: ProfileDraft;
  employee?: EmployeeProfile;
}) {
  const keys = [
    ...new Set([
      ...Object.keys(employee?.profile.values ?? {}),
      ...Object.keys(draft.profile.values),
    ]),
  ];
  return (
    <>
      <div className={styles.portalTableWrap}>
        <table className={styles.portalTable}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Saved value</th>
              <th>Proposed value</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <th>
                  {draftSections
                    .flatMap((s) => s.fields)
                    .find((f) => f.key === key)?.label ??
                    key.replaceAll("_", " ")}
                </th>
                <td>{employee?.profile.values[key] || "Not provided"}</td>
                <td>
                  {draft.profile.values[key] || "Not provided"}
                  {draft.profile.values[key] !==
                    employee?.profile.values[key] && (
                    <strong className={styles.changed}>Changed</strong>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.entries(draft.profile.groups).map(([group, entries]) => (
        <section className={styles.profileCard} key={group}>
          <h2>{repeatGroups[group]?.title ?? group}</h2>
          {entries.length ? (
            entries.map((e) => (
              <dl className={styles.reviewGrid} key={e.id}>
                {Object.entries(e.values).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {repeatGroups[group]?.fields.find((f) => f.key === k)
                        ?.label ?? k}
                    </dt>
                    <dd>{v || "Not provided"}</dd>
                  </div>
                ))}
              </dl>
            ))
          ) : (
            <p>No entries proposed.</p>
          )}
        </section>
      ))}
    </>
  );
}
