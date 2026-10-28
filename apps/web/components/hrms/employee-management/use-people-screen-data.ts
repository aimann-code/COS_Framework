"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Configuration, type Session } from "../../../lib/shared/cos-api";
import { onboarding } from "../../../lib/hrms/employee-management/onboarding-api";
import {
  people_access_message,
  people_auto_redirect,
  people_roles_ok,
} from "../../../lib/hrms/employee-management/people-routes";
import type {
  Account,
  CompanyCatalog,
  CompanyRequest,
  ConfigRequest,
  ScreenData,
} from "./types";

export function usePeopleScreenData(
  path: string,
  revision: number,
  setSession: (s: Session | undefined) => void,
  setData: (d: ScreenData | undefined) => void,
  setError: (e: string) => void,
  setLoading: (l: boolean) => void,
  setNote: (n: string) => void,
  setSearch: (s: string) => void,
  setAppliedSearch: (s: string) => void,
) {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    setNote("");
    setSearch("");
    setAppliedSearch("");
    const load = async () => {
      try {
        const s = await api<Session>("/session");
        if (!active) return;
        if (!s.authenticated) {
          setLoading(false);
          const target = `/sign-in?next=${encodeURIComponent(path)}`;
          if (typeof window !== "undefined") window.location.assign(target);
          else router.replace(target);
          return;
        }
        setSession(s);
        if (!people_roles_ok(s.roles))
          throw new Error(
            "This legacy viewer account is not an HR or linked employee account. Ask HR to provision the correct access.",
          );
        const denied = people_access_message(path, s.roles);
        if (denied) throw new Error(denied);
        const redirect = people_auto_redirect(path, s.roles);
        if (redirect) {
          setLoading(false);
          router.replace(redirect);
          return;
        }
        const schema = await onboarding.schema();
        const next: ScreenData = { schema };
        if (/^\/people\/drafts\/[0-9a-f-]{36}$/.test(path)) {
          next.draft = await onboarding.draft(path.split("/").at(-1)!);
          if (next.draft.status !== "DRAFT")
            throw new Error(
              `This draft is ${next.draft.status.toLowerCase()} and cannot be edited. Open the profile or review queue.`,
            );
        } else if (path === "/people/change" || path === "/people/me") {
          next.employee = await onboarding.me();
        } else if (/^\/people\/employees\/[0-9a-f-]{36}$/.test(path)) {
          next.employee = await onboarding.employee(path.split("/").at(-1)!);
        } else if (/^\/people\/reviews\/[0-9a-f-]{36}$/.test(path)) {
          next.draft = await onboarding.draft(path.split("/").at(-1)!);
          if (next.draft.employee_id)
            next.employee = await onboarding.employee(next.draft.employee_id);
        } else if (/^\/people\/requests\/[0-9a-f-]{36}$/.test(path)) {
          next.draft = await onboarding.draft(path.split("/").at(-1)!);
          next.employee = await onboarding.me();
        } else if (path === "/people/requests") {
          const [requests, drafts] = await Promise.all([
            onboarding.requests(),
            onboarding.drafts(),
          ]);
          next.reviews = requests;
          next.drafts = drafts;
        } else if (path === "/people/reviews") {
          next.reviews = await onboarding.drafts(true);
        } else if (path === "/people/accounts") {
          next.accounts = await api<Account[]>("/accounts/pending");
        } else if (path === "/people/companies") {
          const [catalog, requests] = await Promise.all([
            api<CompanyCatalog>("/company-requests/catalog"),
            api<CompanyRequest[]>("/company-requests"),
          ]);
          next.companyCatalog = catalog;
          next.companyRequests = requests;
        } else if (path === "/people/configuration") {
          const [configuration, requests] = await Promise.all([
            api<Configuration>("/components/EMP_Reg/configuration"),
            api<{ items: ConfigRequest[] }>("/requests?limit=100"),
          ]);
          next.config = configuration;
          next.configs = requests.items;
        } else if (
          path === "/people/leave" ||
          path === "/people/leave/apply" ||
          path === "/people/leave/policies"
        ) {
          /* Leave desk loads its own data. */
        } else if (path === "/people/register") {
          /* Registration form only. */
        } else if (path === "/people" || path === "/people/directory") {
          const [drafts, profiles, reviews] = await Promise.all([
            onboarding.drafts(),
            onboarding.employees(),
            onboarding.drafts(true),
          ]);
          next.drafts = drafts;
          next.employees = profiles.items;
          next.next = profiles.next_cursor;
          next.reviews = reviews;
          next.modules = await api<
            { module_code: string; name: string; route: string }[]
          >("/modules");
        } else throw new Error("This employee-management page does not exist.");
        if (active) setData(next);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 0)) {
          if (e.status === 0) setError(e.message);
          const target = `/sign-in?next=${encodeURIComponent(path)}`;
          if (typeof window !== "undefined") window.location.assign(target);
          else router.replace(target);
          return;
        }
        setError(
          e instanceof Error
            ? e.message
            : "Unable to load Employee Management.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    path,
    revision,
    router,
    setAppliedSearch,
    setData,
    setError,
    setLoading,
    setNote,
    setSearch,
    setSession,
  ]);
}
