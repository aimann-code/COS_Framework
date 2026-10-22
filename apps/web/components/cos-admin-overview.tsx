"use client";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  Settings2,
  ShieldCheck,
  Users,
  UserPlus,
  AlertCircle,
  Star,
} from "lucide-react";
import type { FieldDefinition, RequestRecord, Page } from "../lib/cos-domain";
import { date_label } from "../lib/cos-domain";
import { Badge } from "./cos-ui";

type Props = {
  favorites: Page[];
  onFavorite: (page: Page, add: boolean) => void;
  employeeCount: number;
  requests: RequestRecord[];
  fields: FieldDefinition[];
  version: number;
  onRequests: () => void;
  onRequest: (request: RequestRecord) => void;
  onEmployees: () => void;
  onConfiguration: () => void;
  onAccounts: () => void;
};
export default function AdminOverview({
  employeeCount,
  favorites,
  onFavorite,
  requests,
  fields,
  version,
  onRequests,
  onRequest,
  onEmployees,
  onConfiguration,
  onAccounts,
}: Props) {
  const pending = requests
    .filter((r) => r.status === "PENDING_APPROVAL")
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const failed = requests.filter((r) => r.status === "FAILED");
  const processing = requests.filter(
    (r) => r.status === "APPROVED" || r.status === "EXECUTING",
  );
  const recent = [...requests]
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .slice(0, 4);
  const stats = [
    {
      label: "Awaiting review",
      value: pending.length,
      note: "Employee & configuration requests",
      icon: Clock3,
      tone: "amber",
      action: onRequests,
    },
    {
      label: "Employees",
      value: employeeCount,
      note: "Approved identities in your view",
      icon: Users,
      tone: "blue",
      action: onEmployees,
    },
    {
      label: "Completed",
      value: requests.filter((r) => r.status === "COMPLETED").length,
      note: "Changes successfully applied",
      icon: FileCheck2,
      tone: "green",
      action: onRequests,
    },
    {
      label: "Configuration",
      value: `v${version}.0`,
      note: `${fields.filter((f) => f.visible).length} custom fields enabled`,
      icon: Settings2,
      tone: "violet",
      action: onConfiguration,
    },
  ];
  return (
    <div className="admin-overview">
      <section className="admin-welcome">
        <div>
          <span className="admin-kicker">
            <span /> ADMINISTRATION
          </span>
          <h2>Your review desk.</h2>
          <p>
            Review employee changes, resolve access requests and keep your
            directory accurate.
          </p>
          <button className="admin-primary" onClick={onRequests}>
            Review requests
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="admin-welcome-aside">
          <ShieldCheck size={30} strokeWidth={1.4} />
          <strong>
            {pending.length
              ? `${pending.length} ${pending.length === 1 ? "request needs" : "requests need"} your review`
              : "You’re up to date."}
          </strong>
          <p>
            {pending.length
              ? "Take a moment to review each submitted version before making a decision."
              : "No employee or configuration requests are waiting for approval."}
          </p>
          <span>Employee and configuration queue</span>
        </div>
      </section>
      <div className="admin-metrics">
        {stats.map((stat) => (
          <button
            key={stat.label}
            className="admin-metric"
            onClick={stat.action}
          >
            <span className="admin-metric-label">
              {stat.label}
              <span className={`stat-icon ${stat.tone}`}>
                <stat.icon size={17} />
              </span>
            </span>
            <strong>{stat.value}</strong>
            <span className="admin-metric-note">{stat.note}</span>
          </button>
        ))}
      </div>
      <p className="admin-data-note">
        Counts reflect loaded records in your scope. Open a list to load more.
      </p>
      <div className="admin-columns">
        <section className="panel admin-queue">
          <div className="panel-heading">
            <div>
              <span className="admin-section-label">YOUR ATTENTION</span>
              <h2>Review queue</h2>
              <p>Submitted changes, ready for a considered decision.</p>
            </div>
            <button className="text-button" onClick={onRequests}>
              View all requests
              <ArrowRight size={15} />
            </button>
          </div>
          {pending.length ? (
            <div className="admin-review-list">
              {pending.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  className="admin-review-row"
                  onClick={() => onRequest(r)}
                >
                  <span className="admin-row-icon">
                    <ClipboardList size={19} />
                  </span>
                  <span className="admin-row-copy">
                    <strong>
                      {r.kind === "CONFIGURATION"
                        ? "Registration configuration"
                        : r.payload.employee_name}
                    </strong>
                    <span>
                      {r.kind === "CONFIGURATION"
                        ? "Configuration update"
                        : r.kind === "BULK_REGISTER"
                          ? "Employee import"
                          : r.kind === "UPDATE"
                            ? "Employee update"
                            : "New employee"}{" "}
                      · {date_label(r.submitted_at)}
                    </span>
                  </span>
                  <Badge status={r.status} />
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="admin-clear-queue">
              <span>
                <CheckCircle2 size={30} strokeWidth={1.4} />
              </span>
              <h3>Your review queue is clear.</h3>
              <p>
                New employee and configuration requests will appear here when
                they’re submitted.
              </p>
              <button className="text-button" onClick={onRequests}>
                View request history
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {(failed.length > 0 || processing.length > 0) && (
            <div className="admin-execution-note">
              <AlertCircle size={16} />
              <span>
                {failed.length} failed · {processing.length} processing
              </span>
              <button className="text-button" onClick={onRequests}>
                Check execution
                <ArrowRight size={13} />
              </button>
            </div>
          )}
        </section>
        <aside className="admin-management">
          <div className="admin-section-heading">
            <span className="admin-section-label">WORKSPACE CONTROLS</span>
            <h2>Make room for good work.</h2>
          </div>
          <button className="admin-management-card" onClick={onAccounts}>
            <span className="admin-management-icon">
              <UserPlus size={21} />
            </span>
            <span>
              <strong>Account access</strong>
              <small>
                Review new account requests and assign the right access.
              </small>
            </span>
            <ArrowRight size={17} />
          </button>
          <button className="admin-management-card" onClick={onConfiguration}>
            <span className="admin-management-icon">
              <Settings2 size={21} />
            </span>
            <span>
              <strong>Registration setup</strong>
              <small>Manage fields and review configuration changes.</small>
            </span>
            <ArrowRight size={17} />
          </button>
          <div className="admin-policy-note">
            <ShieldCheck size={17} />
            <p>
              A different administrator must review your configuration changes.
            </p>
          </div>
        </aside>
      </div>
      <section className="admin-shortcuts" aria-label="Your shortcuts">
        <span className="admin-section-label">YOUR SHORTCUTS</span>
        <div>
          {[
            {
              page: "employees" as Page,
              label: "Employee details",
              open: onEmployees,
            },
            {
              page: "requests" as Page,
              label: "Review requests",
              open: onRequests,
            },
            {
              page: "configuration" as Page,
              label: "Configuration",
              open: onConfiguration,
            },
          ].map((shortcut) => (
            <div
              key={shortcut.page}
              className={favorites.includes(shortcut.page) ? "is-favorite" : ""}
            >
              <button
                onClick={shortcut.open}
                aria-label={`Open ${shortcut.label} shortcut`}
              >
                {shortcut.label}
                <ArrowRight size={13} />
              </button>
              <button
                aria-pressed={favorites.includes(shortcut.page)}
                aria-label={`${favorites.includes(shortcut.page) ? "Remove" : "Add"} ${shortcut.label} ${favorites.includes(shortcut.page) ? "from" : "to"} favorites`}
                onClick={() =>
                  onFavorite(shortcut.page, !favorites.includes(shortcut.page))
                }
              >
                <Star size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel admin-activity">
        <div className="panel-heading">
          <div>
            <span className="admin-section-label">THE LATEST</span>
            <h2>Recent activity</h2>
          </div>
          <button className="text-button" onClick={onRequests}>
            Request history
            <ArrowRight size={15} />
          </button>
        </div>
        {recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee / change</th>
                  <th>Operation</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open request</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        {r.kind === "CONFIGURATION"
                          ? "Registration configuration"
                          : r.payload.employee_name}
                      </strong>
                      <span className="cell-secondary">
                        {r.readable_id
                          ? `Request · ${r.id.slice(0, 8).toUpperCase()}`
                          : r.id}
                      </span>
                    </td>
                    <td>
                      {
                        {
                          REGISTER: "Registration",
                          UPDATE: "Update",
                          CONFIGURATION: "Configuration",
                          BULK_REGISTER: "Import",
                        }[r.kind]
                      }
                    </td>
                    <td className="nowrap">{date_label(r.submitted_at)}</td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Open request ${r.id}`}
                        onClick={() => onRequest(r)}
                      >
                        <ArrowRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-activity">
            Your team’s requests and outcomes will appear here.
          </div>
        )}
      </section>
    </div>
  );
}
