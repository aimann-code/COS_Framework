# COS · Employee Management

Next.js frontend, Spring Boot 4.1.1 / Java 21 API and PostgreSQL. COS is the framework; MHL is the initial company. This is a locally verified development implementation. It is not deployed to production.

## Run locally

Requires Node.js 20.9+, npm, PowerShell 7 and JDK 21. In separate terminals:

```powershell
npm install
npm run api:dev
```

```powershell
npm run dev
```

Open http://127.0.0.1:3000. Next.js proxies `/api/v1/cos` to localhost:8080. Set server-side `COS_API_ORIGIN` to change the API origin. Sessions use HttpOnly, SameSite Strict cookies and CSRF protection; tokens are not stored in localStorage.

The backend script verifies and downloads Maven under ignored `.tools`. Local PostgreSQL runs on loopback and persists in `.local/postgres`. Credentials and encryption keys are in ignored `.local/backend-secrets.json`. Keep the database and keys together for recovery. Never commit them. Use fictitious employee information and synthetic document images locally.

Bootstrap username `registrar` is HR; `admin` reviews form configuration. Their generated passwords are `COS_REGISTRAR_PASSWORD` and `COS_ADMIN_PASSWORD` in the local secrets file. `reviewer` is a second development administrator; `viewer` retains legacy directory access and is not an employee self-service account.

## Current employee workflow

- HR signs in at `/sign-in`, lands at `/people`, and registers at `/people/register` without admin approval.
- Registration covers basic details, employment, salary/allowances, banking, compliance, two structured addresses, contacts, family, education/experience, uniform sizes, approved company fields and document photos. Repeatable groups support multiple allowances, emergency contacts, children and previous employers.
- Save draft creates `/people/drafts/{uuid}`; saved data and photos survive refresh. Changes after the last save remain unsaved. UUID and optimistic versions prevent accidental overwrite. Registration retries return the original employee.
- Aadhaar front/back and PAN photos accept JPG/PNG only, up to 5 MB and 4 megapixels. Aadhaar front or PAN is required when that identifier is supplied or changed. Photos are private and encrypted; downloads require authorized access and are audited.
- HR can open a registered profile from the directory and choose **Edit employee**. Edits use a resumable draft, preserve masked values, and save directly with employee-version checks and immutable history. HR can update pay and replace document photos; joining-period history is read-only in this editor. Use rejoin registration for a new employment period.
- Employees choose credentials through `/sign-up`. HR verifies identity, enters the employee code and activates the account at `/people/accounts`. Signup cannot grant HR or administrator access.
- Linked employees use `/people/me`, `/people/change` and `/people/requests`. They access their own record and request personal changes. Employment and pay are HR-controlled. HR compares and approves/rejects at `/people/reviews`; approval applies an exact employee/configuration version atomically.
- HR proposes additional-field configuration at `/people/configuration`; an administrator approves or rejects it there. Configuration execution retains the existing durable worker. Refresh to see completion. Core sections have explicit domain rules; this is not a fully generic executable form engine.

Existing historical records and requests are preserved in the legacy tables. They are not automatically converted or ownership-linked. Legacy public employee mutation operations return `410 LEGACY_WORKFLOW_RETIRED`; configuration requests remain active. The earlier CSV import preview is retained, but expanded-profile bulk registration and migration of legacy employee records are pending. Do not submit an old preview as a new registration.

## Architecture

The API is a feature-organized monolith with controller, service and repository layers. `onboarding/` owns expanded employee profiles, encrypted drafts, memberships, employment periods, history, documents and update reviews. `account/` owns local credential requests; `metadata/` and `request/` own immutable configuration versions and approval/execution. `security/`, `shared/` and `config/` provide actor scope, authorization, encryption, audit and settings.

The new `people` PostgreSQL schema is additive Flyway migration V4. Existing migrations must not be edited once applied. Each query and relationship carries the authenticated company scope. Profile/document payloads use context-bound AES-GCM; scoped HMAC fingerprints enforce identifier uniqueness without plaintext lookup. Employee history and outbox events commit with employee changes. Outbox delivery to external services is not configured. Writes serialize within a company scope for initial correctness; load testing and finer locks remain future work.

Frontend routes live under `apps/web/app/people`; `people-workspace.tsx` composes role-specific pages, and `employee-onboarding-preview.tsx` supplies the reusable connected form. `onboarding-api.ts` owns typed calls. `/registration-preview` remains an isolated, memory-only design demonstration. Explicit `NEXT_PUBLIC_COS_MODE=demo` retains the earlier prototype; it does not verify the revised workflow.

## API

All routes below use `/api/v1/cos`. Get `/csrf` and send its token as `X-CSRF-TOKEN` for mutations; reacquire after login. POST `/login` accepts username/password form data; POST `/logout` ends the session.

| Route | Purpose |
|---|---|
| GET `/onboarding/schema` | Active company field version and development mode |
| GET `/onboarding/drafts` | Own editable drafts; HR `?reviews=true` lists submitted updates |
| GET `/onboarding/requests` | Linked employee's submitted/reviewed requests |
| GET/PUT `/onboarding/drafts/{id}` | Read/save versioned draft |
| POST `/onboarding/drafts/{id}/register` | HR direct registration |
| PUT `/onboarding/employees/{employee}/drafts/{draft}` | Start a resumable HR edit for an exact employee version |
| POST `/onboarding/drafts/{id}/apply` | Apply HR edit directly with optimistic locking |
| POST `/onboarding/drafts/{id}/submit` | Employee submits own-profile proposal |
| POST `/onboarding/drafts/{id}/review` | HR approves/rejects exact version |
| GET `/onboarding/employees` | HR scoped search and UUID cursor pagination |
| GET `/onboarding/employees/{id}`, `/onboarding/me` | Authorized profile |
| POST `/onboarding/drafts/{id}/documents` | Multipart `file`, query `version` and `kind` |
| DELETE `/onboarding/documents/{id}?version=…` | Remove own editable draft photo |
| GET `/onboarding/documents/{id}/content` | Authorized no-store attachment |
| POST `/auth/sign-up` | Request employee access; generic 202 response |
| GET `/accounts/pending`, POST `/accounts/{id}/review` | HR verified employee activation |
| POST `/requests`, GET `/requests`, POST `/requests/{id}/approvals` | HR configuration proposal and admin decision |

Document mutation increments the draft version. Reload the draft after upload/delete when calling the API directly. Upload kind is `AADHAAR_FRONT`, `AADHAAR_BACK` or `PAN`. Sensitive identity/bank numbers must be JSON strings, preserving leading zeros. Unknown profile keys and numeric coercion are rejected.

## Verify

```powershell
npm run api:test
npm run typecheck
npm run build
$env:PLAYWRIGHT_CHANNEL='chrome'
# Keep the API running:
npm run test:connected
npx playwright test --config playwright.onboarding.config.ts
```

42 backend tests cover old invariants and the new workflow using isolated real PostgreSQL. The current connected suite is `tests/people-connected.spec.ts`; historical `connected.spec.ts` exercises superseded admin-registration policy and is excluded by the connected config. Preview accessibility checks use axe and desktop/mobile layouts. Connected traces are disabled to avoid capturing credentials. Test records/photos are synthetic.

## Production deployment boundary

Production is not enabled by this work. Production authentication uses the existing JWT resource-server integration boundary; browser OIDC and authoritative role/scope rechecks remain to be integrated. Local bootstrap/signup authentication must not be enabled in production. Identity-provider employee provisioning/linking requires a production adapter.

Uploads sniff actual image type, validate dimensions before decode, strip metadata by re-encoding, and scan the original and sanitized image. Set `COS_ONBOARDING_DOCUMENTS_SCANNER_HOST` and optional `COS_ONBOARDING_DOCUMENTS_SCANNER_PORT` (3310 default) to a private ClamAV INSTREAM endpoint. Production uploads fail closed if no scanner is configured or scanning fails. Only local/test mode permits `VALIDATED_LOCAL` without a scanner.

Before real employee data: configure managed PostgreSQL, TLS, secrets/key management and rotation, separate migration/runtime privileges, encrypted backups and restore tests, document retention/deletion policy, malware scanning, monitoring, authority lookup, browser identity integration and notification/recovery. Validate the actual deployment and capacity. A successful build does not establish production readiness.

No Google Drive records were modified. Drive reconciliation of this local workflow implementation and security changes awaits explicit user authorization. See AGENTS.md for record ownership and accepted decisions.

Workspace refinement: registration, editing, overview and directory share the same shell and active navigation. Legacy `/dashboard` and `/employees` entry points resolve to the current role workspace. Unsaved forms prompt before sidebar navigation and warn on refresh; save the draft before leaving to retain edits. Browser Back/Forward remains standard history navigation; the leave dialog protects link navigation and browser unloads. Current connected checks include HR editing, URL/history consistency and unsaved-change actions.
