"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Eye,
  EyeOff,
  Heart,
  MapPin,
  Plus,
  ShieldCheck,
  Shirt,
  Trash2,
  UserRound,
  Users,
  Wallet,
  BriefcaseBusiness,
  X,
} from "lucide-react";
import {
  addressFields,
  draftSections,
  repeatGroups,
  type DraftField,
} from "../../../../lib/hrms/employee-management/employee-onboarding-draft";
import styles from "../employee-onboarding-preview.module.css";
import { ApiError, API_URL } from "../../../../lib/cos-api";
import {
  onboarding,
  type ProfileDraft,
  type ProfileDocument,
  type EmployeeProfile,
  type OnboardingSchema,
} from "../../../../lib/hrms/employee-management/onboarding-api";
import { randomId } from "../../../../lib/random-id";
import WorkEmailPanel from "./work-email-panel";
export type LiveRegistration = {
  schema: OnboardingSchema;
  draft?: ProfileDraft;
  employee?: EmployeeProfile;
  employeeMode: boolean;
  hrEdit?: boolean;
  embedded?: boolean;
  onSaved: (draft: ProfileDraft) => void;
  onCompleted: (employee?: EmployeeProfile) => void;
};

type Entry = { id: string; values: Record<string, string> };
const icons = [
  UserRound,
  BriefcaseBusiness,
  Wallet,
  Banknote,
  ShieldCheck,
  MapPin,
  Heart,
  Users,
  ClipboardCheck,
  Shirt,
];
const coreFieldKeys = new Set(
  draftSections.flatMap((s) => s.fields).map((f) => f.key),
);
const sectionGroup: Record<string, string> = {
  salary: "allowances",
  contacts: "emergency",
  family: "children",
  education: "employers",
};
const mask = (value: string) =>
  value.length > 4 ? `•••• ${value.slice(-4)}` : "••••";

export default function EmployeeOnboardingPreview({
  live,
}: { live?: LiveRegistration } = {}) {
  const router = useRouter();
  const [leaveTarget, setLeaveTarget] = useState("");
  const leaveDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (leaveTarget) leaveDialog.current?.showModal();
  }, [leaveTarget]);
  const savedSnapshot = useRef<string | null>(null);
  const additional =
    live?.schema.additional_fields.filter(
      (f) =>
        f.visible &&
        !coreFieldKeys.has(f.id) &&
        !["pan_number", "aadhaar_number"].includes(f.id),
    ) ?? [];
  const sections = [
    ...draftSections,
    ...(additional.length
      ? [
          {
            id: "additional",
            title: "Company fields",
            description:
              "Additional fields from the approved company configuration.",
            fields: additional.map((f) => ({
              key: f.id,
              label: f.label,
              type:
                f.type === "number"
                  ? ("number" as const)
                  : f.type === "date"
                    ? ("date" as const)
                    : ("text" as const),
              required: f.required,
              sensitive: f.sensitive,
            })),
          },
        ]
      : []),
    ...(live && !live.employeeMode && !live.hrEdit
      ? [
          {
            id: "work-email",
            title: "Company work email",
            description:
              "The system assigns a unique mailbox on your company domain.",
            fields: [],
          },
        ]
      : []),
    ...(live
      ? [
          {
            id: "documents",
            title: "Document photos",
            description: "Upload Aadhaar front/back and PAN photos securely.",
            fields: [],
          },
        ]
      : []),
  ];
  const allFields = sections.flatMap((s) => s.fields);
  const initial = live?.draft?.profile ?? live?.employee?.profile;
  const [draftId, setDraftId] = useState(
    live?.draft?.draft_id ??
      (live && !live.employeeMode && !live.hrEdit ? randomId() : ""),
  );
  const [draftVersion, setDraftVersion] = useState(live?.draft?.version ?? 0);
  const [documents, setDocuments] = useState<ProfileDocument[]>(
    live?.draft?.documents ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  async function persist() {
    if (!live) throw new Error("This is a visual preview.");
    const id = draftId || randomId();
    const saved = await onboarding.save(
      id,
      draftVersion,
      live.schema.configuration_version,
      { values, groups, same_address: sameAddress },
    );
    setDraftId(saved.draft_id);
    setDraftVersion(saved.version);
    setDocuments(saved.documents);
    savedSnapshot.current = JSON.stringify({
      values,
      groups,
      same_address: sameAddress,
    });
    return saved;
  }
  function failure(error: unknown) {
    setServerError(
      error instanceof Error
        ? error.message
        : "The operation could not be completed.",
    );
    if (error instanceof ApiError) {
      setErrors(error.fields);
      const key = Object.keys(error.fields)[0];
      const index = sections.findIndex(
        (s) =>
          s.fields.some((f) => f.key === key) || sectionGroup[s.id] === key,
      );
      if (index >= 0) setSection(index);
    }
  }
  async function saveLive() {
    setBusy(true);
    setServerError("");
    try {
      const saved = await persist();
      setNotice(
        "Draft saved securely. You can resume it after signing in again.",
      );
      live?.onSaved(saved);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function finishLive() {
    if (!live) {
      setFinished(true);
      return;
    }
    setBusy(true);
    setServerError("");
    try {
      if (draftId) {
        const previous = await onboarding.draft(draftId);
        if (["REGISTERED", "SUBMITTED", "APPROVED"].includes(previous.status)) {
          live.onCompleted(
            previous.employee_id &&
              (previous.status === "REGISTERED" ||
                (live.hrEdit && previous.status === "APPROVED"))
              ? await onboarding.employee(previous.employee_id)
              : undefined,
          );
          return;
        }
      }
      const saved = await persist();
      if (live.employeeMode) {
        await onboarding.submit(saved.draft_id, saved.version);
        live.onCompleted();
      } else {
        const employee = await (
          live.hrEdit ? onboarding.applyEdit : onboarding.register
        )(saved.draft_id, saved.version);
        live.onCompleted(employee);
      }
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function uploadDocument(kind: string, file?: File) {
    if (!file || !live) return;
    setBusy(true);
    setServerError("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a JPG or PNG photo under 5 MB.");
      const saved = await persist();
      const document = await onboarding.upload(
        saved.draft_id,
        saved.version,
        kind,
        file,
      );
      setDocuments((d) => [...d.filter((old) => old.kind !== kind), document]);
      setDraftVersion(saved.version + 1);
      setNotice(
        "Photo uploaded and encrypted. Save the draft to keep this page link.",
      );
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  const protectedEmployment = new Set([
    "joiner",
    "joining",
    "previous_id",
    "basic_salary",
    "room",
    "travel",
    "pay_currency",
  ]);
  function documentPanel() {
    return (
      <div className={styles.documentList}>
        <p className={styles.privateNote}>
          <ShieldCheck size={18} /> JPG or PNG, up to 5 MB and 4 megapixels.
          Documents are encrypted and downloaded only through an authorized
          account. Aadhaar front/PAN photos are required when their numbers are
          provided.
        </p>
        {[
          ["AADHAAR_FRONT", "Aadhaar card · Front"],
          ["AADHAAR_BACK", "Aadhaar card · Back"],
          ["PAN", "PAN card"],
        ].map(([kind, label]) => {
          const doc = documents.find((d) => d.kind === kind);
          return (
            <div key={kind} className={styles.documentCard}>
              <h3>{label}</h3>
              {doc ? (
                <div>
                  <a
                    href={`${API_URL}/onboarding/documents/${doc.document_id}/content`}
                  >
                    Download protected photo
                  </a>
                  <span> · {Math.ceil(doc.byte_count / 1024)} KB</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setServerError("");
                      try {
                        await onboarding.remove(doc.document_id, draftVersion);
                        setDraftVersion((v) => v + 1);
                        setDocuments((d) =>
                          d.filter((x) => x.document_id !== doc.document_id),
                        );
                      } catch (e) {
                        failure(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p>No photo uploaded</p>
              )}
              <label className={styles.secondary}>
                Choose{" "}
                {kind === "PAN"
                  ? "PAN"
                  : kind === "AADHAAR_FRONT"
                    ? "Aadhaar front"
                    : "Aadhaar back"}{" "}
                photo
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={busy}
                  onChange={(e) => {
                    void uploadDocument(kind, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>
    );
  }

  const [section, setSection] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({
    work_email_mode: "generate",
    ...(initial?.values ?? {}),
  });
  const [groups, setGroups] = useState<Record<string, Entry[]>>(
    initial?.groups ?? {},
  );
  const [sameAddress, setSameAddress] = useState(
    initial?.same_address ?? false,
  );
  const snapshot = JSON.stringify({
    values,
    groups,
    same_address: sameAddress,
  });
  if (savedSnapshot.current === null) savedSnapshot.current = snapshot;
  const dirty = snapshot !== savedSnapshot.current;
  useEffect(() => {
    if (!live || !dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const intercept = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith("/people") ||
        (url.pathname === window.location.pathname && url.hash)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTarget(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", intercept, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", intercept, true);
    };
  }, [live, dirty]);
  const [visited, setVisited] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const review = section === sections.length;
  const current = sections[Math.min(section, sections.length - 1)];
  const required = allFields.filter((f) => f.required);
  const missing = required.filter((f) => !values[f.key]?.trim());
  const completed = required.length - missing.length;
  const entered =
    Object.values(values).filter((v) => v.trim()).length +
    Object.values(groups)
      .flatMap((entries) => entries.flatMap((e) => Object.values(e.values)))
      .filter((v) => v.trim()).length;
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [section]);
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`onboarding-${first}`)?.focus();
  }, [errors]);
  function go(index: number) {
    setSection(index);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function update(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    setFinished(false);
  }
  function validate(fields: DraftField[]) {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key]?.trim() ?? "";
      if (f.required && !v)
        next[f.key] = "This information is needed before registration.";
      if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        next[f.key] = "Enter a valid email address.";
      if (
        f.type === "number" &&
        v &&
        (!Number.isFinite(Number(v)) || Number(v) < 0)
      )
        next[f.key] = "Enter an amount of zero or more.";
    }
    setErrors(next);
    return Object.keys(next);
  }
  function continueStep() {
    if (section === sections.length - 1) {
      openReview();
      return;
    }
    const invalid = validate(current.fields);
    if (invalid.length) {
      document.getElementById(`onboarding-${invalid[0]}`)?.focus();
      return;
    }
    setVisited((v) => [...new Set([...v, current.id])]);
    go(section + 1);
  }
  function openReview() {
    const invalid = validate(allFields);
    if (invalid.length) {
      const index = sections.findIndex((s) =>
        s.fields.some((f) => f.key === invalid[0]),
      );
      setSection(index);
      setNotice("Complete the highlighted information before review.");
      return;
    }
    go(sections.length);
  }
  function addEntry(group: string) {
    setGroups((g) => ({
      ...g,
      [group]: [...(g[group] ?? []), { id: randomId(), values: {} }],
    }));
  }
  function renderField(
    f: DraftField,
    data = values,
    change = update,
    prefix = "",
    disabled = false,
  ) {
    const key = prefix + f.key;
    const error = !prefix ? errors[f.key] : undefined;
    return (
      <DraftInput
        key={key}
        field={f}
        value={data[f.key] ?? ""}
        id={`onboarding-${key}`}
        error={error}
        onChange={(v) => change(f.key, v)}
        disabled={
          busy ||
          disabled ||
          !!(
            live?.hrEdit && ["joiner", "joining", "previous_id"].includes(f.key)
          ) ||
          !!(
            live?.employeeMode &&
            ((!prefix && protectedEmployment.has(f.key)) ||
              additional.some(
                (a) => a.id === f.key && !a.write_roles?.includes("EMPLOYEE"),
              ))
          )
        }
      />
    );
  }
  function repeater(group: string) {
    const spec = repeatGroups[group];
    const entries = groups[group] ?? [];
    return (
      <section className={styles.repeatSection} aria-label={spec.title}>
        <div className={styles.subheading}>
          <div>
            <h3>{spec.title}</h3>
            <p>
              {group === "emergency"
                ? "Add local, hometown, guardian, parent or friend contacts as needed."
                : "Add as many entries as the employee needs."}
            </p>
          </div>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy || !!(live?.employeeMode && group === "allowances")}
            onClick={() => addEntry(group)}
          >
            <Plus size={16} /> Add {spec.singular}
          </button>
        </div>
        {!entries.length && (
          <div className={styles.repeatEmpty}>
            No {spec.title.toLowerCase()} added.
          </div>
        )}
        {entries.map((entry, index) => (
          <fieldset key={entry.id} className={styles.repeatCard}>
            <legend>
              {spec.singular.charAt(0).toUpperCase() + spec.singular.slice(1)}{" "}
              {index + 1}
            </legend>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${spec.singular} ${index + 1}`}
              disabled={
                busy || !!(live?.employeeMode && group === "allowances")
              }
              onClick={() =>
                setGroups((g) => ({
                  ...g,
                  [group]: g[group].filter((e) => e.id !== entry.id),
                }))
              }
            >
              <Trash2 size={16} />
            </button>
            <div className={styles.fieldGrid}>
              {spec.fields.map((f) =>
                renderField(
                  f,
                  entry.values,
                  (key, value) =>
                    setGroups((g) => ({
                      ...g,
                      [group]: g[group].map((e) =>
                        e.id === entry.id
                          ? { ...e, values: { ...e.values, [key]: value } }
                          : e,
                      ),
                    })),
                  entry.id,
                  !!(live?.employeeMode && group === "allowances"),
                ),
              )}
            </div>
          </fieldset>
        ))}
      </section>
    );
  }
  function address(prefix: string) {
    return Object.fromEntries(
      addressFields.map((f) => [f.key, values[`${prefix}_${f.key}`] ?? ""]),
    );
  }
  function sample() {
    setValues({
      name: "Sample Employee",
      dob: "1995-04-20",
      nationality: "India",
      blood: "O+",
      marital: "Single",
      email: "sample.employee@example.com",
      joiner: "New joiner",
      joining: "2026-10-22",
      phone: "+91 00000 00000",
      basic_salary: "20000",
      room: "2500",
      travel: "1000",
      pay_currency: "INR",
      permanent_city: "Sample City",
      permanent_state: "Sample State",
      permanent_country: "India",
      tshirt: "M",
    });
    setGroups({});
    setErrors({});
    setVisited([]);
    setSameAddress(false);
    setFinished(false);
    setNotice("Synthetic sample loaded. No real employee information is used.");
  }
  const display = (f: DraftField, value: string | undefined) =>
    !value?.trim() ? "Not provided" : f.sensitive ? mask(value) : value;
  const Content = live?.embedded ? "div" : "main";
  return (
    <div
      className={`${styles.app} ${live?.embedded ? styles.embeddedForm : ""}`}
    >
      {leaveTarget && (
        <dialog
          ref={leaveDialog}
          onCancel={() => setLeaveTarget("")}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="leave-title"
          aria-describedby="leave-description"
          className={styles.leaveDialog}
        >
          <h2 id="leave-title">Leave without saving?</h2>
          <p id="leave-description">
            Your latest changes have not been saved. Stay here and save your
            draft, or discard those changes.
          </p>
          <div>
            <button
              autoFocus
              type="button"
              className={styles.primary}
              onClick={() => setLeaveTarget("")}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                savedSnapshot.current = snapshot;
                const target = leaveTarget;
                setLeaveTarget("");
                router.push(target);
              }}
            >
              Discard changes
            </button>
          </div>
        </dialog>
      )}
      <a href="#registration-content" className={styles.skip}>
        Skip to registration
      </a>
      {!live?.embedded && (
        <aside className={styles.platformNav} aria-label="COS workspace">
          <Link href="/" className={styles.logo}>
            <span className={styles.logoMark}>
              <i />
              <i />
              <i />
            </span>
            COS<span className={styles.logoCaption}>CONNECTED OPERATIONS</span>
          </Link>
          <div className={styles.company}>
            <span>M</span>
            <div>
              <strong>MHL</strong>
              <small>Restaurant & cloud kitchen</small>
            </div>
          </div>
          <p className={styles.navLabel}>PEOPLE</p>
          <Link
            href={live ? "/people" : "/dashboard"}
            className={styles.platformLink}
          >
            <Users size={18} /> Workspace
          </Link>
          <div className={`${styles.platformLink} ${styles.activePlatform}`}>
            <UserRound size={18} /> Employee registration
            <span />
          </div>
          <Link
            href={live ? "/people/directory" : "/employees"}
            className={styles.platformLink}
          >
            <ClipboardCheck size={18} /> Employee directory
          </Link>
          <div className={styles.railNote}>
            <ShieldCheck size={21} />
            <strong>Employee onboarding</strong>
            <p>
              One employee record. Clear sections. Information where it belongs.
            </p>
          </div>
          <div className={styles.railFooter}>
            <span />{" "}
            {live ? "Secure employee workspace" : "Registration design preview"}
          </div>
        </aside>
      )}
      <div className={styles.shell}>
        {!live?.embedded && (
          <header className={styles.topbar}>
            <div>
              <span>MHL</span>
              <ChevronRight size={14} />
              <span>Employee Management</span>
            </div>
            <span className={styles.hrIdentity}>
              <span>{live?.employeeMode ? "EMP" : "HR"}</span>{" "}
              {live?.employeeMode ? "Employee workspace" : "HR workspace"}
            </span>
          </header>
        )}
        <Content id="registration-content" className={styles.main}>
          <div className={styles.breadcrumb}>
            <Link
              href={
                live?.employeeMode
                  ? "/people/me"
                  : live
                    ? "/people"
                    : "/registration-preview"
              }
            >
              Employee Management
            </Link>{" "}
            <ChevronRight size={13} />{" "}
            {live?.employeeMode
              ? "Request update"
              : live?.hrEdit
                ? "Edit employee"
                : "Register employee"}
          </div>
          <div className={styles.pageHeading}>
            <div>
              <span className={styles.eyebrow}>PEOPLE / ONBOARDING</span>
              <h1>
                {live?.employeeMode
                  ? "Request profile update"
                  : live?.hrEdit
                    ? "Edit employee"
                    : "Register employee"}
              </h1>
              <p>
                {live?.hrEdit
                  ? "Update the employee record. Saved changes take effect directly as HR."
                  : live?.employeeMode
                    ? "Propose personal changes for HR to review."
                    : "Build the employee profile, one clear section at a time."}
              </p>
            </div>
            {!live && (
              <button
                type="button"
                className={styles.secondary}
                onClick={sample}
              >
                Load sample
              </button>
            )}
          </div>
          {!live ? (
            <div className={styles.previewBanner}>
              <CircleHelp size={17} />
              <p>
                <strong>Interactive design preview.</strong> Use fictitious
                information. Nothing is sent to the backend or saved after
                refresh. Required fields and choices are illustrative.
              </p>
            </div>
          ) : (
            <div className={styles.previewBanner}>
              <ShieldCheck size={17} />
              <p>
                {live.schema.local_environment
                  ? "Local development workspace. Use fictitious information only. "
                  : ""}
                Drafts and photos are saved securely.{" "}
                {live.employeeMode
                  ? "Changes require HR review before they are applied."
                  : "HR registers directly; no administrator approval is required."}
              </p>
            </div>
          )}
          {serverError && (
            <div className="error-callout" role="alert">
              {serverError}
            </div>
          )}
          {notice && (
            <div role="status" className={styles.notice}>
              {notice}
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className={styles.workspace}>
            <nav className={styles.steps} aria-label="Registration sections">
              <div className={styles.stepsTitle}>
                EMPLOYEE PROFILE
                <span>
                  {visited.length} / {sections.length} reviewed
                </span>
              </div>
              {sections.map((s, i) => {
                const Icon = icons[i] ?? ShieldCheck;
                return (
                  <button
                    type="button"
                    key={s.id}
                    className={`${styles.step} ${i === section ? styles.currentStep : ""}`}
                    aria-current={i === section ? "step" : undefined}
                    onClick={() => go(i)}
                  >
                    <span className={styles.stepIcon}>
                      {visited.includes(s.id) ? (
                        <Check size={16} />
                      ) : (
                        <Icon size={17} />
                      )}
                    </span>
                    <span>{s.title}</span>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                  </button>
                );
              })}
              <button
                type="button"
                className={`${styles.step} ${review ? styles.currentStep : ""}`}
                aria-current={review ? "step" : undefined}
                onClick={openReview}
              >
                <span className={styles.stepIcon}>
                  <CheckCheck size={18} />
                </span>
                <span>Review profile</span>
                <ChevronRight size={14} />
              </button>
            </nav>
            <div className={styles.formColumn}>
              <section
                className={styles.formPanel}
                aria-labelledby="section-title"
              >
                <div className={styles.formHeading}>
                  <div>
                    <span className={styles.sectionNumber}>
                      {review
                        ? "FINAL STEP"
                        : `SECTION ${String(section + 1).padStart(2, "0")} OF ${sections.length}`}
                    </span>
                    <h2 id="section-title" tabIndex={-1} ref={title}>
                      {review ? "Review employee profile" : current.title}
                    </h2>
                    <p>
                      {review
                        ? "Check the information before completing this registration."
                        : current.description}
                    </p>
                  </div>
                  <span className={styles.draftBadge}>
                    {live ? "Draft" : "Draft preview"}
                  </span>
                </div>
                <div className={styles.formBody}>
                  {review ? (
                    <>
                      <div className={styles.reviewPerson}>
                        <span>
                          {values.name
                            ?.split(" ")
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <div>
                          <h3>{values.name}</h3>
                          <p>
                            {values.joiner} · {values.joining}
                          </p>
                        </div>
                        <span className={styles.readyBadge}>
                          <Check size={13} /> Required details entered
                        </span>
                      </div>
                      {sections.map((s, i) => (
                        <section key={s.id} className={styles.reviewSection}>
                          <div className={styles.subheading}>
                            <h3>{s.title}</h3>
                            <button
                              type="button"
                              className={styles.textButton}
                              onClick={() => go(i)}
                            >
                              Edit <ArrowRight size={13} />
                            </button>
                          </div>
                          <dl className={styles.reviewGrid}>
                            {s.id === "documents" && (
                              <div className={styles.wide}>
                                <dt>Supporting photos</dt>
                                <dd>
                                  {documents.length
                                    ? documents
                                        .map((d) => d.kind.replaceAll("_", " "))
                                        .join(", ")
                                    : "No photos uploaded"}
                                </dd>
                              </div>
                            )}
                            {s.id === "work-email" && (
                              <>
                                <div>
                                  <dt>Work email source</dt>
                                  <dd>
                                    {(values.work_email_mode || "generate") ===
                                    "existing"
                                      ? "Existing company mailbox"
                                      : "System generated"}
                                  </dd>
                                </div>
                                <div className={styles.wide}>
                                  <dt>Work email</dt>
                                  <dd>
                                    {(values.work_email_mode || "generate") ===
                                    "existing"
                                      ? values.work_email_existing ||
                                        "Not provided"
                                      : "Assigned when you register"}
                                  </dd>
                                </div>
                              </>
                            )}
                            {s.fields.map((f) => (
                              <div key={f.key}>
                                <dt>{f.label}</dt>
                                <dd>{display(f, values[f.key])}</dd>
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
                                    {Object.values(
                                      address(
                                        prefix === "local" && sameAddress
                                          ? "permanent"
                                          : prefix,
                                      ),
                                    )
                                      .filter(Boolean)
                                      .join(", ") || "Not provided"}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                          {sectionGroup[s.id] &&
                            (groups[sectionGroup[s.id]] ?? []).map((e, j) => (
                              <div className={styles.reviewEntry} key={e.id}>
                                <strong>
                                  {repeatGroups[sectionGroup[s.id]].singular}{" "}
                                  {j + 1}
                                </strong>
                                <dl className={styles.reviewGrid}>
                                  {repeatGroups[sectionGroup[s.id]].fields.map(
                                    (f) => (
                                      <div key={f.key}>
                                        <dt>{f.label}</dt>
                                        <dd>{display(f, e.values[f.key])}</dd>
                                      </div>
                                    ),
                                  )}
                                </dl>
                              </div>
                            ))}
                        </section>
                      ))}
                      {finished && (
                        <div role="status" className={styles.finishMessage}>
                          <CheckCheck size={24} />
                          <div>
                            <strong>Preview complete.</strong>
                            <p>
                              No employee was registered. Backend support for
                              this expanded profile and the revised HR workflow
                              is still pending.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {(current.id === "banking" ||
                        current.id === "compliance") && (
                        <div className={styles.privateNote}>
                          <ShieldCheck size={17} /> Sensitive values are
                          concealed while entering and masked in review.
                        </div>
                      )}
                      {current.id === "documents" && documentPanel()}
                      {current.id === "work-email" && live && (
                        <WorkEmailPanel
                          draftId={draftId}
                          values={values}
                          setValues={setValues}
                          disabled={busy}
                          ensureSaved={
                            draftVersion === 0
                              ? async () => {
                                  const saved = await persist();
                                  return saved.draft_id;
                                }
                              : undefined
                          }
                        />
                      )}
                      <div className={styles.fieldGrid}>
                        {current.fields.map((f) => renderField(f))}
                      </div>
                      {current.id === "addresses" && (
                        <>
                          <h3 className={styles.addressTitle}>
                            Permanent address
                          </h3>
                          <div className={styles.fieldGrid}>
                            {addressFields.map((f) =>
                              renderField(
                                f,
                                address("permanent"),
                                (key, v) => update(`permanent_${key}`, v),
                                "permanent_",
                              ),
                            )}
                          </div>
                          <div className={styles.addressDivider}>
                            <h3>Local / temporary address</h3>
                            <label>
                              <input
                                type="checkbox"
                                disabled={busy}
                                checked={sameAddress}
                                onChange={(e) =>
                                  setSameAddress(e.target.checked)
                                }
                              />{" "}
                              Same as permanent address
                            </label>
                          </div>
                          <div className={styles.fieldGrid}>
                            {addressFields.map((f) =>
                              renderField(
                                f,
                                address(sameAddress ? "permanent" : "local"),
                                (key, v) => update(`local_${key}`, v),
                                "local_",
                                sameAddress,
                              ),
                            )}
                          </div>
                        </>
                      )}
                      {sectionGroup[current.id] &&
                        repeater(sectionGroup[current.id])}
                      <div className={styles.optionalNote}>
                        <span>*</span>{" "}
                        {live
                          ? "Required information. Optional details can be completed as available."
                          : "Required in this preview. Other details can be entered as available."}
                      </div>
                    </>
                  )}
                </div>
                <footer className={styles.formFooter}>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={section === 0}
                    onClick={() => go(section - 1)}
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <div>
                    {!review && (
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={busy}
                        onClick={
                          live
                            ? () => void saveLive()
                            : () =>
                                setNotice(
                                  "Your draft is held in this open page only. Move between sections freely; refresh clears it.",
                                )
                        }
                      >
                        {busy
                          ? "Saving…"
                          : live
                            ? "Save draft"
                            : "Keep draft in this page"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={review ? () => void finishLive() : continueStep}
                    >
                      {review
                        ? live
                          ? live.employeeMode
                            ? "Send to HR"
                            : live.hrEdit
                              ? "Save employee changes"
                              : "Register employee"
                          : "Finish preview"
                        : section === sections.length - 1
                          ? "Review profile"
                          : "Continue"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </footer>
              </section>
            </div>
            <aside
              className={styles.summary}
              aria-label="Registration progress"
            >
              <span className={styles.summaryLabel}>YOUR REGISTRATION</span>
              <h3>{values.name || "New employee"}</h3>
              <p>{values.joiner || "Joining type not selected"}</p>
              <div
                className={styles.progress}
                role="progressbar"
                aria-label="Required details entered"
                aria-valuenow={completed}
                aria-valuemin={0}
                aria-valuemax={required.length}
              >
                <span
                  style={{ width: `${(completed / required.length) * 100}%` }}
                />
              </div>
              <div className={styles.progressCaption}>
                <strong>
                  {completed} of {required.length}
                </strong>{" "}
                required details entered
              </div>
              <ul>
                {required.map((f) => (
                  <li key={f.key}>
                    <span
                      className={
                        values[f.key]?.trim()
                          ? styles.checked
                          : styles.unchecked
                      }
                    >
                      {values[f.key]?.trim() ? <Check size={11} /> : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        go(
                          sections.findIndex((s) =>
                            s.fields.some((field) => field.key === f.key),
                          ),
                        )
                      }
                    >
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
              <div className={styles.summaryRule} />
              <div className={styles.summaryStat}>
                <span>Details entered</span>
                <strong>{entered}</strong>
              </div>
              <div className={styles.summaryStat}>
                <span>Storage</span>
                <strong>
                  {live
                    ? draftId
                      ? "Encrypted draft"
                      : "Not saved yet"
                    : "This page only"}
                </strong>
              </div>
              <div className={styles.processNote}>
                <ShieldCheck size={19} />
                <div>
                  <strong>HR owns registration</strong>
                  <p>
                    {live
                      ? live.employeeMode
                        ? "Your changes go to HR for review. Your saved profile changes only after approval."
                        : "HR registers directly. Admin approval applies to form configuration."
                      : "In the planned workflow, HR registers directly. Admin approval applies to form configuration."}
                  </p>
                </div>
              </div>
            </aside>
          </div>
          <footer className={styles.pageFooter}>
            <span>
              COS <span>/</span> MHL Employee Management
            </span>
            <span>
              {live
                ? "Employee Management"
                : "Expanded registration · Visual draft"}
            </span>
          </footer>
        </Content>
      </div>
    </div>
  );
}

function DraftInput({
  field,
  value,
  onChange,
  id,
  error,
  disabled,
}: {
  field: DraftField;
  value: string;
  onChange: (v: string) => void;
  id: string;
  error?: string;
  disabled?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const hintId = `${id}-hint`,
    errorId = `${id}-error`;
  return (
    <div className={`${styles.field} ${field.wide ? styles.wide : ""}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span aria-label="required"> *</span>}
      </label>
      <div className={styles.inputWrap}>
        {field.type === "select" ? (
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            required={field.required}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : field.hint ? hintId : undefined}
          >
            <option value="">Select {field.label.toLowerCase()}</option>
            {field.options?.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={
              field.sensitive && !reveal ? "password" : (field.type ?? "text")
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            disabled={disabled}
            autoComplete="off"
            min={field.type === "number" ? 0 : undefined}
            step={field.type === "number" ? ".01" : undefined}
            maxLength={field.type === "number" ? undefined : 160}
            placeholder={
              field.type === "date"
                ? undefined
                : field.type === "number"
                  ? "0.00"
                  : `Enter ${field.label.toLowerCase()}`
            }
            aria-invalid={!!error}
            aria-describedby={error ? errorId : field.hint ? hintId : undefined}
          />
        )}
        {field.sensitive && (
          <button
            type="button"
            className={styles.reveal}
            aria-label={`${reveal ? "Hide" : "Show"} ${field.label}`}
            aria-pressed={reveal}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {field.hint && <small id={hintId}>{field.hint}</small>}
      {error && (
        <small role="alert" className={styles.fieldError} id={errorId}>
          {error}
        </small>
      )}
    </div>
  );
}
