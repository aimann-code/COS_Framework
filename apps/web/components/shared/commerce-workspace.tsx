"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CircleDollarSign,
  FileCheck2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { api, logout, type Session } from "../../lib/shared/cos-api";
import styles from "./commerce.module.css";

export type WorkspaceKind = "platform" | "company";
export function useCommerceWorkspace<T>(kind: WorkspaceKind, path: string) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    setDenied(false);
    try {
      const user = await api<Session>("/session");
      if (current !== generation.current) return;
      if (!user.authenticated) {
        router.replace("/sign-in?next=" + encodeURIComponent(path));
        return;
      }
      setSession(user);
      if (kind === "platform" && !user.platform_admin) {
        setDenied(true);
        setData(null);
        return;
      }
      const value = await api<T>(
        kind === "platform" ? "/platform/overview" : "/company/workspace",
      );
      if (current === generation.current) setData(value);
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : "The workspace could not be loaded.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [kind, path, router]);
  useEffect(() => {
    const requestGeneration = generation;
    void reload();
    return () => {
      requestGeneration.current++;
    };
  }, [reload]);
  useEffect(() => {
    const ended = () => {
      generation.current++;
      setSession(null);
      setData(null);
      router.replace("/sign-in?next=" + encodeURIComponent(path));
    };
    window.addEventListener("cos-session-ended", ended);
    return () => window.removeEventListener("cos-session-ended", ended);
  }, [router, path]);
  return { session, data, error, loading, denied, reload };
}

export function CommerceShell({
  kind,
  path,
  company,
  session,
  children,
}: {
  kind: WorkspaceKind;
  path: string;
  company?: string;
  session: Session | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const platform = kind === "platform";
  const navigation = platform
    ? [
        { href: "/platform", label: "Overview", icon: LayoutDashboard },
        { href: "/platform/companies", label: "Companies", icon: Building2 },
        {
          href: "/platform/payments",
          label: "Payment reviews",
          icon: CircleDollarSign,
        },
        {
          href: "/platform/configuration",
          label: "Configuration requests",
          icon: FileCheck2,
        },
        {
          href: "/platform/services",
          label: "Service catalogue",
          icon: Package,
        },
      ]
    : [
        { href: "/company", label: "Company overview", icon: LayoutDashboard },
        {
          href: "/company/services",
          label: "Subscribed services",
          icon: Package,
        },
        {
          href: "/company/configuration",
          label: "Configuration requests",
          icon: FileCheck2,
        },
      ];
  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      await logout();
      router.replace("/sign-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed. Try again.");
      setSigningOut(false);
    }
  }
  return (
    <div className={styles.surface}>
      <a className={styles.skip} href="#commerce-content">
        Skip to workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <Link
          className={styles.brand}
          href={platform ? "/platform" : "/company"}
        >
          <span>
            <Layers3 size={22} />
          </span>
          <span>
            COS
            <small>
              {platform ? "PLATFORM ADMINISTRATION" : "COMPANY WORKSPACE"}
            </small>
          </span>
        </Link>
        <div>
          {session && (
            <>
              <span>{session.username}</span>
              <button
                type="button"
                className={styles.secondary}
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                <LogOut size={13} />
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <div className={styles.workspaceGrid}>
        <aside className={styles.sidebar}>
          <div className={styles.scopeBadge}>
            <span>
              {platform ? <ShieldCheck size={19} /> : <Building2 size={19} />}
            </span>
            <div>
              <strong>
                {platform
                  ? "Developer administration"
                  : (company ?? "Your company")}
              </strong>
              <small>
                {platform
                  ? "Company & service control"
                  : "Your subscribed workspace"}
              </small>
            </div>
          </div>
          <nav
            aria-label={
              platform ? "Platform administration" : "Company administration"
            }
          >
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>
          <p className={styles.sidebarNote}>
            {platform
              ? "Review company activation, service subscriptions and scoped configuration changes."
              : "Your company data and configuration stay within your organization's scope."}
          </p>
        </aside>
        <main id="commerce-content">
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export function WorkspaceFeedback({
  error,
  loading,
  denied,
  hasData,
  onRetry,
}: {
  error: string;
  loading: boolean;
  denied?: boolean;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (denied)
    return (
      <section className={styles.panel + " " + styles.empty}>
        <ShieldCheck size={30} />
        <h1>Platform administrator access required.</h1>
        <p>
          Company users cannot view or approve other companies. Return to your
          own workspace.
        </p>
        <Link href="/company" className={styles.secondary}>
          Open company workspace
        </Link>
      </section>
    );
  return (
    <>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              type="button"
              onClick={onRetry}
            >
              <RefreshCw size={14} />
              Retry connection
            </button>
          </div>
        </div>
      )}
      {loading && !hasData && (
        <section
          className={styles.panel}
          aria-busy="true"
          aria-label="Loading workspace"
        >
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </section>
      )}
      {loading && hasData && <p role="status">Refreshing workspace…</p>}
    </>
  );
}

export function CommerceDialog({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={styles.dialog}
      ref={dialogRef}
      aria-labelledby="commerce-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <h2 id="commerce-dialog-title">{title}</h2>
          <button
            type="button"
            className={styles.dialogClose}
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
