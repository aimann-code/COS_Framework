"use client";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  signed_in_path,
  current_workspace_path,
  landing_path,
  workspace_route,
} from "../lib/cos-routes";
import { usePathname, useRouter } from "next/navigation";
import AuthScreen from "./cos-auth-screen";
import COSWorkspace from "./cos-workspace";
import { Button } from "./cos-ui";
import {
  api,
  ApiError,
  COSApiAdapter,
  logout,
  type Configuration,
  type Session,
} from "../lib/cos-api";
import type {
  Employee,
  FieldDefinition,
  Page,
  Registration,
  RequestRecord,
} from "../lib/cos-domain";

export type ImportSource = {
  source_hash: string;
  source_name: string;
  mapping: Record<string, string>;
};
export type BackendContext = {
  path: string;
  navigate: (path: string) => void;
  request: (id: string) => Promise<RequestRecord>;
  searchEmployees: (
    query: string,
    cursor?: string,
  ) => Promise<{ items: Employee[]; next_cursor: string | null }>;
  manageAccounts?: () => void;
  username: string;
  role: "Registration user" | "System admin" | "Employee viewer";
  can_print: boolean;
  employees: Employee[];
  requests: RequestRecord[];
  fields: FieldDefinition[];
  version: number;
  favorites: Page[];
  choices: { nationalities: string[]; id_types: string[] };
  allowed_modes: string[];
  submit: (p: Registration, old?: Employee) => Promise<boolean>;
  decide: (
    r: RequestRecord,
    approve: boolean,
    remarks: string,
  ) => Promise<boolean>;
  configuration: (fields: FieldDefinition[]) => Promise<boolean>;
  import: (rows: Registration[], source: ImportSource) => Promise<boolean>;
  favorite: (page: Page, add: boolean) => Promise<void>;
  detail: (key: string, print?: boolean) => Promise<Employee>;
  retry: (r: RequestRecord) => Promise<void>;
  logout: () => Promise<void>;
  actionError: string;
  notice: string;
  dismiss: () => void;
  moreEmployees?: () => Promise<void>;
  moreRequests?: () => Promise<void>;
};
type Snapshot = {
  configuration: Configuration;
  employees: Employee[];
  requests: RequestRecord[];
  favorites: Page[];
  nextEmployees: string | null;
  nextRequests: string | null;
};

export default function COSConnectedWorkspace({
  children,
}: { children?: ReactNode } = {}) {
  const [session, set_session] = useState<Session | null | undefined>(
    undefined,
  );
  const [snapshot, set_snapshot] = useState<Snapshot>();
  const [error, set_error] = useState("");
  const [notice, set_notice] = useState("");

  const pathname = usePathname();
  const router = useRouter();
  const keys = useRef(new Map<string, string>());
  const previews = useRef(
    new Map<
      string,
      {
        preview_id: string;
        source_version: string;
        error_count: number;
        row_results?: { source_row: number; errors: Record<string, string> }[];
      }
    >(),
  );
  const loadedEmployees = useRef(1);
  const loadedRequests = useRef(1);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = generation.current;
    const sequence = ++refreshSequence.current;
    try {
      const configuration = await api<Configuration>(
        "/components/EMP_Reg/configuration",
      );
      const adapter = new COSApiAdapter(configuration);
      const pages = async <T,>(
        fetcher: (
          cursor?: string,
        ) => Promise<{ items: T[]; next_cursor: string | null }>,
        count: number,
      ) => {
        const items: T[] = [];
        let cursor: string | undefined;
        let next: string | null = null;
        for (let n = 0; n < count; n++) {
          const page = await fetcher(cursor);
          items.push(...page.items);
          next = page.next_cursor;
          if (!next) break;
          cursor = next;
        }
        return { items, next_cursor: next };
      };
      const [employees, requests, favorites] = await Promise.all([
        pages((c) => adapter.employees(c), loadedEmployees.current),
        pages((c) => adapter.requests(c), loadedRequests.current),
        adapter.favorites(),
      ]);
      if (
        generation.current === current &&
        sequence === refreshSequence.current
      )
        set_snapshot({
          configuration,
          employees: employees.items,
          requests: requests.items,
          favorites,
          nextEmployees: employees.next_cursor,
          nextRequests: requests.next_cursor,
        });
    } catch (e) {
      if (
        generation.current !== current ||
        sequence !== refreshSequence.current
      )
        return;
      if (e instanceof ApiError && e.status === 401) {
        set_session(null);
        set_snapshot(undefined);
      } else
        set_notice(
          e instanceof Error ? e.message : "Unable to refresh server data.",
        );
    }
  }, []);
  useEffect(() => {
    void api<Session>("/session")
      .then((s) => set_session(s.authenticated ? s : null))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) set_session(null);
        else set_error(e.message);
      });
  }, []);
  useEffect(() => {
    if (!session?.authenticated) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [session, refresh]);
  const withError = async (operation: () => Promise<void>) => {
    set_error("");
    try {
      await operation();
      set_error("");
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "The operation failed.";
      const fields =
        e instanceof ApiError
          ? Object.entries(e.fields)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" ")
          : "";
      set_notice(`${message} ${fields}`.trim());
      set_error(`${message} ${fields}`.trim());
      return false;
    }
  };
  const keyFor = (operation: string, payload: unknown) => {
    const identity = JSON.stringify([
      operation,
      snapshot?.configuration.version,
      payload,
    ]);
    if (!keys.current.has(identity))
      keys.current.set(identity, crypto.randomUUID());
    return keys.current.get(identity)!;
  };
  useEffect(() => {
    const auth = pathname === "/sign-in" || pathname === "/sign-up";
    if (!workspace_route(pathname).valid && !auth) return;
    if (
      session?.authenticated &&
      current_workspace_path(pathname, session.roles) !== pathname
    ) {
      router.replace(current_workspace_path(pathname, session.roles));
      return;
    }
    if (session === null && !auth)
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    if (
      session?.authenticated &&
      (auth ||
        pathname === "/" ||
        (pathname === "/dashboard" && session.roles.includes("ADMIN")))
    )
      router.replace(
        signed_in_path(
          auth ? new URLSearchParams(window.location.search).get("next") : null,
          session.roles,
        ),
      );
  }, [session, pathname, router]);
  useEffect(() => {
    if (session?.authenticated) set_error("");
  }, [pathname]);
  if (
    !workspace_route(pathname).valid &&
    pathname !== "/sign-in" &&
    pathname !== "/sign-up"
  )
    return children;
  if (session === null && (pathname === "/sign-in" || pathname === "/sign-up"))
    return (
      <AuthScreen
        key={pathname}
        mode={pathname === "/sign-up" ? "sign-up" : "sign-in"}
        initialError={error}
        onSignedIn={(s) => {
          generation.current++;
          keys.current.clear();
          previews.current.clear();
          set_error("");
          set_session(s);
          router.replace(
            signed_in_path(
              new URLSearchParams(window.location.search).get("next"),
              s.roles,
            ),
          );
        }}
      />
    );
  if (
    !session ||
    !snapshot ||
    (session.authenticated &&
      (pathname === "/sign-in" ||
        pathname === "/sign-up" ||
        current_workspace_path(pathname, session.roles) !== pathname))
  )
    return (
      <div className="workspace-loading" aria-busy="true">
        <aside className="loading-rail" aria-hidden="true">
          <strong>
            COS<span>PEOPLE OPERATIONS</span>
          </strong>
          <i />
          <i />
          <i />
          <i />
        </aside>
        <div className="loading-main">
          <div className="loading-topbar" aria-hidden="true" />
          <div className="loading-body">
            <div className="workspace-loading-message">
              <span className="auth-eyebrow">YOUR WORKSPACE</span>
              <h1>Loading your workspace</h1>
              <p className="auth-intro" role="status">
                Restoring your secure session. You’ll stay on this page.
              </p>
              {(notice || error) && (
                <div className="auth-error" role="alert">
                  {notice || error}
                </div>
              )}
              {(notice || error) && (
                <Button
                  secondary
                  onClick={() => {
                    void api<Session>("/session")
                      .then((s) => {
                        set_session(s.authenticated ? s : null);
                        if (s.authenticated) void refresh();
                      })
                      .catch((e) => {
                        set_error(e.message);
                      });
                  }}
                >
                  Retry connection
                </Button>
              )}
            </div>
            <div className="loading-panels" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="loading-table" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </div>
    );
  const adapter = new COSApiAdapter(snapshot.configuration);
  const context: BackendContext = {
    path: pathname,
    navigate: (path) =>
      router.push(
        path === "/" || path === "/dashboard"
          ? landing_path(session.roles)
          : path,
      ),
    request: (id) => adapter.getRequest(id),
    searchEmployees: (query, cursor) => adapter.employees(cursor, query),
    manageAccounts: session.roles.includes("ADMIN")
      ? () => router.push("/accounts")
      : undefined,
    username: session.username,
    role: session.roles.includes("ADMIN")
      ? "System admin"
      : session.roles.includes("REGISTRAR")
        ? "Registration user"
        : "Employee viewer",
    can_print: session.can_print,
    employees: snapshot.employees,
    requests: snapshot.requests,
    fields: snapshot.configuration.fields,
    version: snapshot.configuration.version,
    favorites: snapshot.favorites,
    choices: {
      nationalities: snapshot.configuration.controlled_values
        .filter((c) => c.category === "NATIONALITY")
        .map((c) => c.label),
      id_types: snapshot.configuration.controlled_values
        .filter((c) => c.category === "ID_TYPE")
        .map((c) => c.label),
    },
    allowed_modes: snapshot.configuration.allowed_modes,
    submit: (p, old) =>
      withError(async () => {
        const payload = old
          ? {
              employee_key: old.employee_key,
              record_version: old.record_version,
              employee: adapter.payload(p, old),
            }
          : adapter.payload(p);
        await adapter.submit(
          old ? "UPDATE" : "REGISTER",
          payload,
          keyFor(old ? "UPDATE" : "REGISTER", payload),
        );
        set_notice(
          "Request saved. A separate administrator must approve it before execution.",
        );
        await refresh();
      }),
    decide: (r, approve, remarks) =>
      withError(async () => {
        await adapter.decide(r, approve, remarks);
        set_notice(
          approve
            ? "Approval recorded. The server will execute this request."
            : "Rejection recorded. Employee data was not changed.",
        );
        await refresh();
      }),
    configuration: (fields) =>
      withError(async () => {
        const payload = { fields };
        await adapter.submit(
          "CONFIGURATION",
          payload,
          keyFor("CONFIGURATION", payload),
        );
        set_notice(
          "Configuration request saved. A different admin must review it.",
        );
        await refresh();
      }),
    import: (rows, source) =>
      withError(async () => {
        const identity = JSON.stringify([
          snapshot.configuration.version,
          source,
          rows,
        ]);
        let preview = previews.current.get(identity);
        if (!preview) {
          preview = await api<{
            preview_id: string;
            source_version: string;
            error_count: number;
            row_results?: {
              source_row: number;
              errors: Record<string, string>;
            }[];
          }>("/employee-import-previews", {
            method: "POST",
            body: JSON.stringify({
              ...source,
              configuration_version: snapshot.configuration.version,
              rows: rows.map((p) => adapter.payload(p)),
            }),
          });
          if (!preview.error_count) previews.current.set(identity, preview);
        }
        if (preview.error_count)
          throw new Error(
            preview.row_results
              ?.filter((r) => Object.keys(r.errors).length)
              .slice(0, 5)
              .map(
                (r) =>
                  `Row ${r.source_row}: ${Object.values(r.errors).join(", ").replaceAll("EMP_IDENTITY_ALREADY_EXISTS", "Employee ID or identity already exists")}`,
              )
              .join(" · ") ||
              "The server found invalid source rows. Correct the file and create a new preview.",
          );
        const payload = {
          preview_id: preview.preview_id,
          source_version: preview.source_version,
        };
        await adapter.submit(
          "BULK_REGISTER",
          payload,
          keyFor("BULK_REGISTER", { source, rows }),
        );
        set_notice(
          "Batch request saved with source and mapping provenance. Awaiting separate admin review.",
        );
        await refresh();
      }),
    favorite: async (page, add) => {
      await withError(async () => {
        await adapter.favorite(page, add);
        await refresh();
      });
    },
    detail: (key, print) => adapter.detail(key, print),
    retry: async (r) => {
      await withError(async () => {
        await adapter.retry(r);
        await refresh();
      });
    },
    logout: async () => {
      await withError(async () => {
        await logout();
        generation.current++;
        keys.current.clear();
        previews.current.clear();
        loadedEmployees.current = 1;
        loadedRequests.current = 1;
        set_snapshot(undefined);
        set_session(null);
        set_notice("");
      });
    },
    actionError: error,
    notice,
    dismiss: () => {
      set_notice("");
      set_error("");
    },
    moreEmployees: snapshot.nextEmployees
      ? async () => {
          await withError(async () => {
            const page = await adapter.employees(snapshot.nextEmployees!);
            loadedEmployees.current++;
            set_snapshot(
              (s) =>
                s && {
                  ...s,
                  employees: [...s.employees, ...page.items],
                  nextEmployees: page.next_cursor,
                },
            );
          });
        }
      : undefined,
    moreRequests: snapshot.nextRequests
      ? async () => {
          await withError(async () => {
            const page = await adapter.requests(snapshot.nextRequests!);
            loadedRequests.current++;
            set_snapshot(
              (s) =>
                s && {
                  ...s,
                  requests: [...s.requests, ...page.items],
                  nextRequests: page.next_cursor,
                },
            );
          });
        }
      : undefined,
  };
  return (
    <>
      <COSWorkspace backend={context} />
    </>
  );
}
