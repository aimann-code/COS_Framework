"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  people_nav,
  people_nav_current,
  type PeopleNavContext,
} from "../../../lib/hrms/employee-management/people-routes";
import styles from "./employee-onboarding-preview.module.css";

type PeopleShellProps = {
  path: string;
  roles: string[];
  username?: string;
  roleLabel: string;
  busy: boolean;
  navContext: PeopleNavContext;
  onSignOut: () => void;
  children: ReactNode;
};

export default function PeopleShell({
  path,
  roles,
  username,
  roleLabel,
  busy,
  navContext,
  onSignOut,
  children,
}: PeopleShellProps) {
  return (
    <div className={styles.portal}>
      <a href="#people-content" className={styles.skip}>
        Skip to workspace content
      </a>
      <header className={styles.portalHeader}>
        <Link href="/people" className={styles.portalBrand}>
          COS <span>Employee Management</span>
        </Link>
        <div>
          <span>
            {username ?? "Checking session"} · {roleLabel}
          </span>
          {username && (
            <button type="button" onClick={onSignOut} disabled={busy}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <div className={styles.portalLayout}>
        <nav className={styles.portalNav} aria-label="Employee Management">
          <div className={styles.companyBadge}>
            <span>M</span>
            <div>
              <strong>MHL</strong>
              <small>Restaurant &amp; cloud kitchen</small>
            </div>
          </div>
          {people_nav(roles).map((item) => (
            <Link
              key={item.url}
              href={item.url}
              aria-current={
                people_nav_current(path, item.url, navContext) ? "page" : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main id="people-content" className={styles.portalMain}>
          {children}
        </main>
      </div>
    </div>
  );
}
