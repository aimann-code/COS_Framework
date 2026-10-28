"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, type Session } from "../lib/cos-api";
import { current_workspace_path, workspace_route } from "../lib/cos-routes";

/** Live product: legacy /dashboard and /employees URLs redirect into /people without loading the demo workspace. */
export default function LiveWorkspaceGateway() {
  const pathname = usePathname();
  const router = useRouter();
  const [message, setMessage] = useState("Opening Employee Management…");

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (pathname === "/") {
        router.replace("/sign-in");
        return;
      }
      if (!workspace_route(pathname).valid) return;
      try {
        const session = await api<Session>("/session");
        if (!active) return;
        if (!session.authenticated) {
          router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
          return;
        }
        router.replace(current_workspace_path(pathname, session.roles));
      } catch {
        if (!active) return;
        router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  return (
    <div className="workspace-loading" aria-busy="true">
      <div className="loading-main">
        <div className="workspace-loading-message">
          <span className="auth-eyebrow">YOUR WORKSPACE</span>
          <h1>Redirecting</h1>
          <p role="status">{message}</p>
        </div>
      </div>
    </div>
  );
}
