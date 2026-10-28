import { FileImage } from "lucide-react";
import { API_URL } from "../../../../lib/shared/cos-api";
import type { ProfileDraft } from "../../../../lib/hrms/employee-management/onboarding-api";
import { docNames } from "../types";
import styles from "../employee-onboarding-preview.module.css";

export default function DocumentLinks({
  documents,
}: {
  documents: ProfileDraft["documents"];
}) {
  return (
    <section className={styles.profileCard}>
      <h2>Protected documents</h2>
      {documents.length ? (
        documents.map((d) => (
          <a
            key={d.document_id}
            className={styles.documentLink}
            href={`${API_URL}/onboarding/documents/${d.document_id}/content`}
          >
            <FileImage size={17} />
            {docNames[d.kind] ?? d.kind} · {Math.ceil(d.byte_count / 1024)} KB ·
            Download
          </a>
        ))
      ) : (
        <p>No document photos attached.</p>
      )}
    </section>
  );
}
