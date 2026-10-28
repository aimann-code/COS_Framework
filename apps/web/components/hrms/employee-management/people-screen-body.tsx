"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, ShieldCheck, Users } from "lucide-react";
import { onboarding } from "../../../lib/hrms/employee-management/onboarding-api";
import { randomId } from "../../../lib/shared/random-id";
import DocumentLinks from "./documents/profile-document-links";
import ProfileDetails from "./details/profile-details";
import ProfileDiff from "./details/profile-diff";
import FormConfiguration from "./form-configuration";
import CompanyApprovals from "./company-approvals";
import EmployeeAccessCard from "./employee-access-card";
import type { PeopleAction, ScreenData } from "./types";
import styles from "./employee-onboarding-preview.module.css";

function ClipboardIcon() {
  return <ShieldCheck size={22} />;
}

export type PeopleScreenBodyProps = {
  path: string;
  data: ScreenData;
  setAppliedSearch: (v: string) => void;
  hr: boolean;
  admin: boolean;
  employee: boolean;
  busy: boolean;
  search: string;
  setSearch: (v: string) => void;
  appliedSearch: string;
  note: string;
  setNote: (v: string) => void;
  action: PeopleAction;
  setData: Dispatch<SetStateAction<ScreenData | undefined>>;
  setNotice: (v: string) => void;
  refresh: () => void;
};

export default function PeopleScreenBody({
  path,
  data,
  setAppliedSearch,
  hr,
  admin,
  employee,
  busy,
  search,
  setSearch,
  appliedSearch,
  note,
  setNote,
  action,
  setData,
  setNotice,
  refresh,
}: PeopleScreenBodyProps) {
  const router = useRouter();

  return (
    <>
      {path === "/people" && (
        <>
          <div className={styles.portalCards}>
            <Link href="/people/register">
              <Plus size={22} />
              <strong>Register an employee</strong>
              <span>Complete the profile and save directly as HR.</span>
            </Link>
            <Link href="/people/reviews">
              <ClipboardIcon />
              <strong>{data.reviews?.length} loaded update requests</strong>
              <span>Validate employee proposals before applying changes.</span>
            </Link>
            <Link href="/people/accounts">
              <Users size={22} />
              <strong>Activate employee access</strong>
              <span>
                Verify identity and link to a specific employee record.
              </span>
            </Link>
            <Link href="/people/leave">
              <ClipboardIcon />
              <strong>Manage leave</strong>
              <span>Record leave, review requests, and check balances.</span>
            </Link>
          </div>
          <h2 className={styles.portalSectionTitle}>Your saved drafts</h2>
          {data.drafts?.length ? (
            <div className={styles.portalList}>
              {data.drafts.map((d) => (
                <Link href={`/people/drafts/${d.draft_id}`} key={d.draft_id}>
                  <strong>Draft · {d.draft_id.slice(0, 8)}</strong>
                  <span>
                    Version {d.version} ·{" "}
                    {new Date(d.updated_at).toLocaleString("en-IN")}
                  </span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>
              No incomplete drafts. Start a registration to create one.
            </p>
          )}
        </>
      )}
      {(path === "/people/directory" || path === "/people") && (
        <>
          <h2 className={styles.portalSectionTitle}>Employee directory</h2>
          <form
            className={styles.portalSearch}
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const result = await onboarding.employees(search);
                setAppliedSearch(search);
                setData(
                  (d) =>
                    d && {
                      ...d,
                      employees: result.items,
                      next: result.next_cursor,
                    },
                );
              });
            }}
          >
            <label htmlFor="people-search">
              Search by name or employee code
            </label>
            <div>
              <input
                id="people-search"
                maxLength={120}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="submit"
                className={styles.secondary}
                disabled={busy}
              >
                Search
              </button>
            </div>
          </form>
          <div className={styles.portalTableWrap}>
            <table className={styles.portalTable}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee code</th>
                  <th>Profile version</th>
                  <th>
                    <span className="sr-only">Open profile</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.employees?.map((e) => (
                  <tr key={e.employee_id}>
                    <td>{e.display_name}</td>
                    <td>{e.employee_code}</td>
                    <td>{e.version}</td>
                    <td>
                      <Link href={`/people/employees/${e.employee_id}`}>
                        View profile →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.employees?.length && (
              <p className={styles.emptyState}>No matching employees.</p>
            )}
          </div>
          {data.next && (
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const page = await onboarding.employees(
                    appliedSearch,
                    data.next!,
                  );
                  setData(
                    (d) =>
                      d && {
                        ...d,
                        employees: [...(d.employees ?? []), ...page.items],
                        next: page.next_cursor,
                      },
                  );
                })
              }
            >
              Load more employees
            </button>
          )}
        </>
      )}
      {(path === "/people/me" || path.startsWith("/people/employees/")) &&
        data.employee && (
          <>
            <div className={styles.profileStrip}>
              <div>
                <strong>{data.employee.employee_code}</strong>
                <span>Profile version {data.employee.version}</span>
              </div>
              {hr && (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const d = await onboarding.startEdit(
                        data.employee!.employee_id,
                        randomId(),
                        data.employee!.version,
                      );
                      router.push(`/people/drafts/${d.draft_id}`);
                    })
                  }
                >
                  Edit employee
                </button>
              )}
              {employee && (
                <Link className={styles.primary} href="/people/change">
                  Request changes <ArrowRight size={15} />
                </Link>
              )}
            </div>
            <ProfileDetails employee={data.employee} />
            {employee && (
              <p className={styles.privateNote}>
                Employment and pay details are maintained by HR. Personal profile
                changes are submitted for HR review.
              </p>
            )}
          </>
        )}
      {path === "/people/requests" && !!data.drafts?.length && (
        <section className={styles.profileCard}>
          <h2>Unsubmitted drafts</h2>
          <div className={styles.portalList}>
            {data.drafts.map((d) => (
              <Link key={d.draft_id} href={`/people/drafts/${d.draft_id}`}>
                <strong>Resume draft {d.draft_id.slice(0, 8)}</strong>
                <span>Version {d.version}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {(path === "/people/reviews" || path === "/people/requests") && (
        <div className={styles.portalList}>
          {data.reviews?.length ? (
            data.reviews.map((d) => (
              <Link
                key={d.draft_id}
                href={`${employee ? "/people/requests" : "/people/reviews"}/${d.draft_id}`}
              >
                <strong>
                  Employee update · {d.status.replaceAll("_", " ")}
                </strong>
                <span>
                  {new Date(d.updated_at).toLocaleString("en-IN")} · Version{" "}
                  {d.version}
                </span>
                <ArrowRight size={16} />
              </Link>
            ))
          ) : (
            <p className={styles.emptyState}>
              No employee updates are waiting for HR review.
            </p>
          )}
        </div>
      )}
      {(path.startsWith("/people/reviews/") ||
        path.startsWith("/people/requests/")) &&
        data.draft && (
          <>
            <p className={styles.privateNote}>
              Status: {data.draft.status}. Approval applies the proposal
              atomically, only if the employee and form versions still match.
            </p>
            <ProfileDiff draft={data.draft} employee={data.employee} />
            {data.draft.review_note && (
              <p className={styles.notice}>
                HR review note: {data.draft.review_note}
              </p>
            )}
            <DocumentLinks documents={data.draft.documents} />
            {hr && data.draft.status === "SUBMITTED" && (
              <div className={styles.reviewActions}>
                <label htmlFor="profile-review-note">
                  Review note <span>(required to reject)</span>
                </label>
                <textarea
                  id="profile-review-note"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy || !note.trim()}
                    onClick={() =>
                      void action(async () => {
                        await onboarding.decide(
                          data.draft!.draft_id,
                          data.draft!.version,
                          "REJECT",
                          note,
                        );
                        setNotice(
                          "Update rejected. Employee data is unchanged.",
                        );
                        router.push("/people/reviews");
                      })
                    }
                  >
                    Reject request
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await onboarding.decide(
                          data.draft!.draft_id,
                          data.draft!.version,
                          "APPROVE",
                          note,
                        );
                        setNotice(
                          "Update approved and applied to the employee profile.",
                        );
                        router.push("/people/reviews");
                      })
                    }
                  >
                    Approve and apply
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      {path === "/people/accounts" && (
        <>
          <p className={styles.privateNote}>
            Verify the applicant’s identity and employee code before activation.
            Signup cannot request HR or administrator privileges.
          </p>
          {data.accounts?.length ? (
            data.accounts.map((a) => (
              <EmployeeAccessCard
                key={a.account_id}
                account={a}
                busy={busy}
                run={action}
                notify={setNotice}
                reload={refresh}
              />
            ))
          ) : (
            <p className={styles.emptyState}>
              No pending employee account requests.
            </p>
          )}
        </>
      )}
      {path === "/people/companies" && data.companyCatalog && (
        <CompanyApprovals
          catalog={data.companyCatalog}
          requests={data.companyRequests ?? []}
          busy={busy}
          run={action}
          onNotice={setNotice}
          onReload={refresh}
        />
      )}
      {path === "/people/configuration" && data.config && (
        <FormConfiguration
          config={data.config}
          requests={data.configs ?? []}
          admin={admin}
          busy={busy}
          run={action}
          onNotice={setNotice}
          onReload={refresh}
        />
      )}
    </>
  );
}
