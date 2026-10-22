"use client";
import { useRef, useState } from "react";
import type { ImportSource } from "./cos-connected-workspace";
import Papa from "papaparse";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button, Modal } from "./cos-ui";
import {
  empty_registration,
  identity_key,
  mask,
  validate_registration,
  type Employee,
  type FieldDefinition,
  type Registration,
} from "../lib/cos-domain";
const core_fields = [
  "employee_name",
  "empid_entry_mode",
  "sys_emp_id",
  "father_name",
  "nationality_id",
  "national_id_type_id",
  "id_number",
];
type Preview = { payload: Registration; errors: string[]; row: number };
export default function ImportDialog({
  kind,
  fields,
  employees,
  version,
  close,
  onSubmit,
  choices,
  serverError,
}: {
  kind: "bulk" | "sheet";
  fields: FieldDefinition[];
  employees: Employee[];
  version: number;
  close: () => void;
  onSubmit: (
    rows: Registration[],
    source: ImportSource,
  ) => boolean | Promise<boolean>;
  serverError?: string;
  choices?: { nationalities: string[]; id_types: string[] };
}) {
  const [headers, set_headers] = useState<string[]>([]);
  const [rows, set_rows] = useState<Record<string, string>[]>([]);
  const [mapping, set_mapping] = useState<Record<string, string>>({});
  const [filename, set_filename] = useState("");
  const [source_hash, set_source_hash] = useState("");
  const [preview, set_preview] = useState<Preview[] | null>(null);
  const [error, set_error] = useState("");
  const [loading, set_loading] = useState(false);
  const [submitted, set_submitted] = useState(false);
  const [sheet_url, set_sheet_url] = useState("");
  const generation = useRef(0);
  const available = [
    ...core_fields,
    ...fields.filter((f) => f.visible).map((f) => f.id),
  ];
  async function read_file(file?: File) {
    const run = ++generation.current;
    set_loading(false);
    set_error("");
    set_rows([]);
    set_headers([]);
    set_preview(null);
    set_source_hash("");
    set_filename(file?.name ?? "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      set_error("Choose a CSV file.");
      return;
    }
    if (file.size > 1024 * 1024) {
      set_error("Use a CSV under 1 MB.");
      return;
    }
    set_loading(true);
    try {
      const content = await file.text();
      const parsed = Papa.parse<string[]>(content, {
        skipEmptyLines: "greedy",
      });
      if (run !== generation.current) return;
      if (parsed.errors.length)
        throw new Error(
          "The CSV could not be parsed. Check quotes, delimiters, and row structure.",
        );
      const [raw_headers, ...data] = parsed.data;
      const h = raw_headers?.map((s) => s.trim().replace(/^\uFEFF/, ""));
      if (!h?.length || h.some((s) => !s) || new Set(h).size !== h.length)
        throw new Error("Headers must be present, nonblank, and unique.");
      if (!data.length || data.length > 500)
        throw new Error("Include between 1 and 500 data rows.");
      if (data.some((row) => row.length !== h.length))
        throw new Error(
          "Each row must have the same number of cells as the header.",
        );
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(content),
      );
      if (run !== generation.current) return;
      set_source_hash(
        Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );
      set_headers(h);
      set_rows(
        data.map((row) =>
          Object.fromEntries(h.map((header, i) => [header, row[i].trim()])),
        ),
      );
      set_mapping(
        Object.fromEntries(
          available.map((key) => [key, h.includes(key) ? key : ""]),
        ),
      );
    } catch (e) {
      if (run === generation.current)
        set_error(e instanceof Error ? e.message : "Unable to read this file.");
    } finally {
      if (run === generation.current) set_loading(false);
    }
  }
  function validate() {
    const used = Object.values(mapping).filter(Boolean);
    if (new Set(used).size !== used.length) {
      set_error("Map each source column to one target field only.");
      return;
    }
    const unmapped = headers.filter((h) => !used.includes(h));
    if (unmapped.length) {
      set_error(
        `Unmapped source columns: ${unmapped.join(", ")}. Remove unsupported columns or map them explicitly.`,
      );
      return;
    }
    const seen_ids = new Set<string>();
    const seen_keys = new Set<string>();
    const next = rows.map((row, index) => {
      const get = (key: string) => row[mapping[key]] || "";
      const mode = get("empid_entry_mode").toUpperCase();
      const payload: Registration = {
        ...empty_registration(),
        employee_name: get("employee_name"),
        empid_entry_mode: mode as Registration["empid_entry_mode"],
        father_name: get("father_name"),
        nationality_id: get("nationality_id"),
        national_id_type_id: get("national_id_type_id"),
        id_number: get("id_number"),
        custom_fields: Object.fromEntries(
          fields
            .filter((f) => f.visible && get(f.id))
            .map((f) => [f.id, get(f.id)]),
        ),
      };
      delete payload.sys_emp_id;
      if (mode === "MANUAL" || get("sys_emp_id"))
        payload.sys_emp_id = get("sys_emp_id");
      const errors = Object.values(
        validate_registration(payload, fields, employees, undefined, choices),
      );
      const id = payload.sys_emp_id?.toLowerCase();
      const key = identity_key(payload);
      if ((id && seen_ids.has(id)) || seen_keys.has(key))
        errors.push("Duplicate identity or employee ID within this file.");
      if (id) seen_ids.add(id);
      seen_keys.add(key);
      return { payload, errors, row: index + 2 };
    });
    set_error("");
    set_preview(next);
  }
  function download_template() {
    const content = Papa.unparse([
      Object.fromEntries(available.map((key) => [key, ""])),
    ]);
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cos-employee-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const error_count = preview?.filter((p) => p.errors.length).length ?? 0;
  return (
    <Modal
      title={kind === "bulk" ? "Bulk employee upload" : "Google Sheet Sync"}
      subtitle={
        kind === "bulk"
          ? "Map, validate, and preview before submitting for approval."
          : "Connect an authorised source before previewing changes."
      }
      close={close}
    >
      <div className="modal-body">
        {serverError && (
          <p className="auth-error" role="alert">
            {serverError}
          </p>
        )}
        {submitted ? (
          <div className="empty">
            <CheckCircle2 size={36} />
            <h3>Submitted for approval</h3>
            <p>
              {rows.length} row requests are now in My requests. No employee
              records were changed.
            </p>
            <Button onClick={close}>Done</Button>
          </div>
        ) : kind === "sheet" ? (
          <>
            <div className="integration-status">
              <span className="sheet-icon">
                <FileSpreadsheet size={27} />
              </span>
              <div>
                <strong>Google Sheets</strong>
                <p>Not connected to this application</p>
              </div>
              <span className="badge disconnected">
                <span />
                Not connected
              </span>
            </div>
            <div className="info-callout">
              <ShieldCheck size={19} />
              <p>
                The Drive plugin used in this chat does not authenticate this
                application. A backend Google connection and approved source
                policy are required for live previews. Opening this dialog does
                not start a sync.
              </p>
            </div>
            <label className="form-field">
              Spreadsheet URL
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheet_url}
                onChange={(e) => set_sheet_url(e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="form-field">
                Sheet tab
                <input placeholder="For example, Employees" />
              </label>
              <label className="form-field">
                Bounded range
                <input placeholder="For example, A1:H100" />
              </label>
            </div>
            <label className="form-field">
              Mapping profile
              <select disabled defaultValue="">
                <option value="">No approved profiles connected</option>
              </select>
            </label>
            <label className="form-field">
              Sync mode
              <select disabled defaultValue="">
                <option value="">
                  Awaiting approved source and conflict policy
                </option>
              </select>
            </label>
            <p className="small-muted">
              Source access, direction, create/update rules, and conflict policy
              must be configured before submission. Source rows are never
              deleted by this preview.
            </p>
            <div className="button-row">
              <Button secondary onClick={close}>
                Cancel
              </Button>
              <Button disabled>
                Preview changes
                <ArrowRight size={16} />
              </Button>
              <Button disabled>Submit for approval</Button>
            </div>
          </>
        ) : (
          <>
            <div className="info-callout">
              <ShieldCheck size={19} />
              <p>
                CSV import · up to 500 rows / 1 MB. Fictitious data only.
                Preview does not create employees. All rows must be valid before
                submission.
              </p>
            </div>
            <div className="upload-zone">
              <Upload size={27} />
              <strong>{filename || "Choose your employee CSV"}</strong>
              <span>Use the canonical headers or map your columns below.</span>
              <label className="button secondary file-label">
                Choose CSV file
                <input
                  aria-label="Choose employee CSV file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    void read_file(e.target.files?.[0]);
                  }}
                />
              </label>
              <button className="text-button" onClick={download_template}>
                <Download size={14} />
                Download blank template
              </button>
            </div>
            {loading && <p role="status">Reading file…</p>}
            {headers.length > 0 && (
              <>
                <div className="section-heading">
                  <div>
                    <h3>Map source columns</h3>
                    <span className="small-muted">
                      {rows.length} rows · Configuration v{version}.0
                    </span>
                  </div>
                </div>
                <div className="mapping-grid">
                  {available.map((key) => (
                    <label className="form-field" key={key}>
                      <span className="mono">{key}</span>
                      <select
                        value={mapping[key] ?? ""}
                        onChange={(e) => {
                          set_mapping((old) => ({
                            ...old,
                            [key]: e.target.value,
                          }));
                          set_preview(null);
                        }}
                      >
                        <option value="">Not mapped</option>
                        {headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <Button secondary onClick={validate}>
                  <CheckCircle2 size={16} />
                  Validate & preview
                </Button>
              </>
            )}
            {error && (
              <div className="error-callout" role="alert">
                {error}
              </div>
            )}
            {preview && (
              <>
                <div className="preview-summary">
                  <strong>{preview.length - error_count} valid rows</strong>
                  <span>{error_count} rows with errors</span>
                  <small>
                    Source SHA-256 {source_hash.slice(0, 12)}… · mapping
                    snapshot pinned
                  </small>
                </div>
                <div className="table-wrap preview-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Source row</th>
                        <th>Employee</th>
                        <th>Mode / ID</th>
                        <th>ID number</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p) => (
                        <tr key={p.row}>
                          <td>{p.row}</td>
                          <td>{p.payload.employee_name || "—"}</td>
                          <td>
                            {p.payload.empid_entry_mode}
                            <span className="cell-secondary">
                              {p.payload.sys_emp_id || "After approval"}
                            </span>
                          </td>
                          <td>{mask(p.payload.id_number)}</td>
                          <td>
                            {p.errors.length ? (
                              <span className="field-error">
                                {p.errors.join(" ")}
                              </span>
                            ) : (
                              <span className="valid-text">
                                Ready for approval
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="button-row">
              <Button secondary onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={
                  !preview || error_count > 0 || !preview.length || loading
                }
                onClick={async () => {
                  if (!preview || loading) return;
                  set_loading(true);
                  try {
                    if (
                      await onSubmit(
                        preview.map((p) => p.payload),
                        { source_hash, source_name: filename, mapping },
                      )
                    )
                      set_submitted(true);
                  } finally {
                    set_loading(false);
                  }
                }}
              >
                Submit for approval
                <ArrowRight size={16} />
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
