"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AuthScreen from "./cos-auth-screen";
import { Button } from "./cos-ui";
import { api, type Session } from "../../lib/shared/cos-api";
import {
  current_workspace_path,
  signed_in_path,
  workspace_route,
} from "../../lib/shared/cos-routes";
export default function COSConnectedWorkspace({
  children,
}: { children?: ReactNode } = {}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const generation = useRef(0);

  const authPath = pathname === "/sign-in" || pathname === "/sign-up";
  const legacyPath = workspace_route(pathname).valid;
  const guardedPath = legacyPath || authPath;

  useEffect(() => {
    let active = true;
    void api<Session>("/session")
      .then((s) => {
        if (active) setSession(s.authenticated ? s : null);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Unable to load session.");
        setSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (session?.authenticated) {
      const target = authPath
        ? signed_in_path(
            new URLSearchParams(window.location.search).get("next"),
            session.roles,
            session,
          )
        : current_workspace_path(pathname, session.roles, session);
      if (target !== pathname) router.replace(target);
      return;
    }
    if (!authPath && guardedPath) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [session, pathname, router, authPath, guardedPath]);

  useEffect(() => {
    if (session?.authenticated) setError("");
  }, [pathname, session?.authenticated]);

  if (!guardedPath) return children;

  const pendingRedirect =
    session === undefined ||
    (session?.authenticated &&
      (authPath ||
        current_workspace_path(pathname, session.roles, session) !== pathname));

  if (session === null && authPath) {
    return (
      <AuthScreen
        key={`${pathname}-${error}`}
        mode={pathname === "/sign-up" ? "sign-up" : "sign-in"}
        initialError={error}
        onSignedIn={(s) => {
          generation.current++;
          setError("");
          setSession(s);
          router.replace(
            signed_in_path(
              new URLSearchParams(window.location.search).get("next"),
              s.roles,
              s,
            ),
          );
        }}
      />
    );
  }

  if (pendingRedirect || (session === null && !authPath)) {
    return (
      <div className="workspace-loading" aria-busy="true">
        <div className="loading-main">
          <div className="workspace-loading-message">
            <span className="auth-eyebrow">YOUR WORKSPACE</span>
            <h1>
              {session === undefined ? "Loading your workspace" : "Redirecting"}
            </h1>
            <p className="auth-intro" role="status">
              {session === undefined
                ? "Restoring your secure session."
                : "Taking you to the right place."}
            </p>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            {error && (
              <Button
                secondary
                onClick={() => {
                  void api<Session>("/session")
                    .then((s) => setSession(s.authenticated ? s : null))
                    .catch((e) => {
                      setError(
                        e instanceof Error ? e.message : "Retry failed.",
                      );
                      setSession(null);
                    });
                }}
              >
                Retry connection
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return children ?? null;
}
