# COS · MHL Employee Management

COS is the application framework. MHL, a restaurant and cloud-kitchen business, is the initial company using its Employee Management module. Employee registration and maintenance are the current delivery target; sales, payment channels and broader multi-company administration are future work.

**Implementation status — 22-Oct-2026:** connected Next.js frontend, Spring Boot API and persistent PostgreSQL storage, verified locally. This repository is not a deployed or approved production release.

## Technology and structure

| Area                 | Current implementation                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| Frontend             | Next.js 16.4.2 App Router, React 19.3.1, TypeScript, CSS Modules and Lucide icons |
| Backend              | Spring Boot 4.1.1, Java 21, Spring Security and JDBC repositories                 |
| Persistence          | PostgreSQL with versioned Flyway migrations V1–V4                                 |
| Local authentication | Persistent accounts, server sessions, HttpOnly cookies and CSRF protection        |
| Verification         | PostgreSQL integration tests, Playwright and axe accessibility checks             |

```text
apps/web/
  app/people/           Current HR, employee and configuration routes
  app/sign-in/          Sign-in entry point
  app/sign-up/          Employee access request
  components/           Workspace shell, profile form, directory and reviews
  lib/                  Typed API adapters, routes and form definitions
apps/api/src/main/java/com/cos/hrms/
  onboarding/           Profiles, drafts, documents, HR edits and employee reviews
  account/              Local credentials and access requests
  metadata/             Company configuration and field policies
  request/              Configuration proposal, approval and execution
  security/             Authenticated actors, roles and company scope
  shared/               Encryption, audit, JSON and errors
  config/               Security settings and local database bootstrap
apps/api/src/main/resources/db/migration/   Additive schema migrations
tests/                  Connected, preview and historical demo browser checks
scripts/                Local API bootstrap and Java formatting
```

The backend is a feature-organized monolith with controller, service and repository layers. Core employee rules are explicit Java behavior; approved metadata supplies additional company fields. This is not a fully generic component engine where arbitrary modules can be added without implementation work.

## Run locally

Install Node.js 20.9+, npm, PowerShell 7 (`pwsh`) and JDK 21. Internet access is needed for the initial dependency/tool download.

From the repository root, install dependencies and start the API:

```powershell
npm ci
npm run api:dev
```

In a second terminal:

```powershell
npm run dev
```

| Service                     | URL                                        |
| --------------------------- | ------------------------------------------ |
| Frontend and sign-in        | http://127.0.0.1:3000                      |
| Spring Boot health          | http://127.0.0.1:8080/api/v1/cos/health    |
| HR workspace                | http://127.0.0.1:3000/people               |
| Registration design preview | http://127.0.0.1:3000/registration-preview |

Browser API calls use `/api/v1/cos` on the frontend origin. Next.js proxies them to `http://127.0.0.1:8080`; server-side `COS_API_ORIGIN` changes that destination. Routes identify screens, while backend authorization determines access.

The backend script downloads Maven 3.9.11 with SHA-512 verification into ignored `.tools/`. The local profile starts PostgreSQL on an available loopback port, applies migrations and preserves the database under `.local/postgres`. No separately installed PostgreSQL or Docker is required for this local setup. Stop the services with Ctrl+C and run the same commands to resume.

### Development accounts and stored data

Passwords are generated on first startup and retained in ignored `.local/backend-secrets.json`; they are not published in this repository.

| Username    | Role                                             | Local password key       |
| ----------- | ------------------------------------------------ | ------------------------ |
| `registrar` | HR (`REGISTRAR`)                                 | `COS_REGISTRAR_PASSWORD` |
| `admin`     | Configuration administrator                      | `COS_ADMIN_PASSWORD`     |
| `reviewer`  | Second development administrator                 | `COS_REVIEWER_PASSWORD`  |
| `viewer`    | Legacy directory viewer, not linked self-service | `COS_VIEWER_PASSWORD`    |

New employee accounts use their chosen email/password after HR activation. Signup cannot grant HR or administrator privileges.

PostgreSQL stores profiles, drafts, account records, memberships, metadata, document content, reviews, history, audit and outbox records. Profile/draft payloads and document content are encrypted; account passwords are stored as hashes. Directory names/codes and operational metadata are not all encrypted. Document photos are stored in the database, not a public upload directory or cloud bucket.

Keep `.local/postgres` and the encryption/fingerprint keys in `.local/backend-secrets.json` together for recovery. Do not delete or regenerate keys against an existing database. `.local/`, `.tools/`, dependencies, build output and test artifacts are ignored by Git. Use fictitious employee details and synthetic photos locally.

## Roles and business workflow

| Action                                     | HR               | Linked employee  | Administrator |
| ------------------------------------------ | ---------------- | ---------------- | ------------- |
| Register an employee directly              | Yes              | No               | No            |
| Browse current employee directory/profiles | Company scope    | Own profile only | No            |
| Edit an employee directly                  | Yes              | No               | No            |
| Request personal profile changes           | Reviews requests | Own profile only | No            |
| Approve/reject employee changes            | Yes              | No               | No            |
| Verify and activate employee access        | Yes              | No               | No            |
| Propose additional-field configuration     | Yes              | No               | No            |
| Approve/reject form configuration          | No               | No               | Yes           |

`VIEWER` remains a legacy directory role. Existing viewers are not automatically converted into employees or linked to a record.

### Register now and complete missing information later

1. HR signs in and opens **Register employee**.
2. Enter the employee display name, joining type, joining date and personal contact number. Approved required company fields also apply; a rejoiner needs a verified previous employee reference.
3. Complete other sections when information is available, or save a draft to resume later.
4. Register the employee directly. No admin approval is required.
5. To add missing details later, open **Employee directory → View profile → Edit employee**.
6. Add the available information/photos, review the profile and choose **Save employee changes**. HR can also save the edit as a draft and resume it later.

**Aadhaar and PAN numbers are optional at initial registration.** HR can add them later. When a number is supplied or changed, its corresponding Aadhaar front/PAN photo is required before the registration or update is applied. Other optional details can also be completed later without admin approval.

The form includes basic details, employment, salary/allowances, banking, compliance, structured permanent/local addresses, contact/emergency information, family, education/work experience, uniform sizes, approved company fields and document photos. Allowances, emergency contacts, children and previous employers support repeated entries.

HR edits preserve unchanged masked values, check the employee version and record immutable history. A stale edit is rejected rather than overwriting newer information. Joining type/date and the previous employee reference are read-only in this editor; use rejoin registration to create a new employment period for an existing employee.

### Employee access and self-service

1. The employee chooses credentials at `/sign-up`; the account remains pending.
2. HR verifies the applicant, enters the exact employee code at **Employee access**, and activates the linked account.
3. The employee signs in to **My profile**, opens **Request an update**, and submits personal changes.
4. HR compares saved/proposed information and approves or rejects the request. Rejection requires an explanation. The profile changes only after approval.

Employees cannot browse other employee profiles or change HR-controlled employment/pay details. The backend checks ownership and company scope, regardless of the URL or submitted JSON. Email verification, notifications and self-service password recovery are not implemented.

### Form configuration

HR proposes additional-field changes at **Form configuration**. An administrator approves or rejects them at **Configuration approvals**. Approved changes use immutable configuration versions and the existing durable execution worker; refresh to see execution completion.

The UI supports additional text/date/number fields and enabled/required/sensitive settings. Core profile sections retain explicit domain rules. The accepted policy is that administrators approve configuration changes; the current interface does not provide a complete visual editor for every core field or advanced policy.

## Navigation and saved drafts

Registration, HR editing, profiles and lists share one workspace header/navigation. Supported legacy entry points such as `/dashboard`, `/employees`, `/employees/new` and `/admin` resolve to the current role routes; directory viewers retain their legacy workspace.

| Route                                         | Screen/access                                 |
| --------------------------------------------- | --------------------------------------------- |
| `/sign-in`, `/sign-up`                        | Authentication and employee access request    |
| `/people`                                     | HR overview                                   |
| `/people/register`                            | HR registration                               |
| `/people/directory`                           | HR employee directory/search                  |
| `/people/employees/{uuid}`                    | Authorized employee profile                   |
| `/people/drafts/{uuid}`                       | Own saved registration/edit/update draft      |
| `/people/accounts`                            | HR employee-account activation                |
| `/people/reviews`, `/people/reviews/{uuid}`   | HR employee update review                     |
| `/people/me`                                  | Linked employee's own profile                 |
| `/people/change`                              | Own-profile update form                       |
| `/people/requests`, `/people/requests/{uuid}` | Employee request status/details               |
| `/people/configuration`                       | HR proposals or admin configuration approvals |

Saved drafts and uploaded photos survive refresh. Changes made after the last save remain unsaved. Link navigation prompts before discarding unsaved form changes, and browser unload/refresh warns about them. Browser Back/Forward uses normal history; save first when leaving a form. Draft and employee versions guard against concurrent overwrites. Session loading uses a workspace loading state before protected data appears.

`/registration-preview` is an isolated memory-only design preview. Explicit `NEXT_PUBLIC_COS_MODE=demo` retains the earlier prototype. Neither represents the connected workflow or persists a registered employee.

## Document uploads and security

- Supported kinds: `AADHAAR_FRONT`, `AADHAAR_BACK`, `PAN`; Aadhaar back is optional.
- Accepts `.jpg`, `.jpeg` and `.png`, up to 5 MiB, 4096 pixels per side and 4,194,304 total pixels. PDF/SVG uploads are not supported.
- Validates actual file type, extension and supplied media type, checks dimensions before decoding, and re-encodes images to PNG to strip metadata.
- Encrypts content with context-bound AES-GCM and serves it through authorized, audited, no-store attachment downloads.
- Restricts uploads/removal to the owner's editable draft, applies a daily upload limit, and increments the draft version on document changes.
- Uses scoped HMAC fingerprints for identifier uniqueness. Sensitive profile numbers are masked in responses; the database does not rely on masked strings as original values.

The scanner integration uses a private ClamAV INSTREAM endpoint. Configure `COS_ONBOARDING_DOCUMENTS_SCANNER_HOST` and optional `COS_ONBOARDING_DOCUMENTS_SCANNER_PORT` (default `3310`). Original and sanitized images are scanned. Production uploads fail closed when the scanner is missing or unavailable. Local/test mode can record `VALIDATED_LOCAL` without a scanner; that status does not mean malware scanning occurred.

Local authentication uses server sessions with HttpOnly, SameSite Strict cookies and CSRF protection. JWT/local session credentials are not stored in browser localStorage. Backend role, ownership and company-scope checks are authoritative.

## API reference

All routes below are relative to `/api/v1/cos`. For local mutations, get `/csrf` and send the returned token as `X-CSRF-TOKEN`. POST `/login` accepts username/password form data; reacquire CSRF after login. POST `/logout` ends the session.

| Method and route                                        | Purpose                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| GET `/health`, `/session`, `/csrf`                      | Health, identity and CSRF token                                       |
| GET `/onboarding/schema`                                | Active company field version and local-mode flag                      |
| GET `/onboarding/drafts`                                | Own editable drafts; HR `?reviews=true` lists submitted updates       |
| GET `/onboarding/requests`                              | Linked employee's submitted/reviewed requests                         |
| GET/PUT `/onboarding/drafts/{id}`                       | Read/save a versioned draft                                           |
| POST `/onboarding/drafts/{id}/register`                 | HR direct registration                                                |
| PUT `/onboarding/employees/{employee}/drafts/{draft}`   | Start a version-bound HR edit                                         |
| POST `/onboarding/drafts/{id}/apply`                    | Apply HR edit directly                                                |
| POST `/onboarding/drafts/{id}/submit`                   | Employee submits own-profile proposal                                 |
| POST `/onboarding/drafts/{id}/review`                   | HR approves/rejects an exact request version                          |
| GET `/onboarding/employees`                             | HR search and UUID cursor pagination                                  |
| GET `/onboarding/employees/{id}`, `/onboarding/me`      | Authorized profile                                                    |
| POST `/onboarding/drafts/{id}/documents`                | Multipart `file`; query `version` and `kind`                          |
| DELETE `/onboarding/documents/{id}?version=…`           | Remove an editable draft photo                                        |
| GET `/onboarding/documents/{id}/content`                | Authorized attachment download                                        |
| POST `/auth/sign-up`                                    | Generic `202` employee-access request response                        |
| GET `/accounts/pending`, POST `/accounts/{id}/review`   | HR verified account activation                                        |
| GET `/components/EMP_Reg/configuration`                 | Current permitted field configuration                                 |
| POST/GET `/requests`                                    | HR configuration proposal/list; submission requires `Idempotency-Key` |
| POST `/requests/{id}/approvals`, `/requests/{id}/retry` | Admin configuration decision/retry                                    |

Draft saves carry `expected_version`, `configuration_version` and `profile`. Start a new draft with a client-generated UUID and `expected_version: 0`. HR edit creation instead takes the current employee `version`; register/apply/submit actions take the current draft `version`. Reload a draft after document upload/delete when calling the API directly.

Identity/bank values must be JSON strings so leading zeros are preserved. Unknown profile keys and numeric-to-string coercion are rejected. Employee writes, history and outbox records commit transactionally; external outbox delivery is not configured. Writes currently serialize within a company scope, so throughput/load testing remains necessary.

## Verification and build commands

```powershell
npm run api:test
npm run typecheck
npm run build

# Use installed Google Chrome; alternatively install Playwright Chromium.
$env:PLAYWRIGHT_CHANNEL='chrome'
# Keep npm run api:dev running for connected tests.
npm run test:connected
npx playwright test --config playwright.onboarding.config.ts
```

| Suite/check                            | Latest verified result, 22-Oct-2026 | Scope                                                                                                                          |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Backend                                | 42 tests passed                     | Real isolated PostgreSQL, permissions, encryption, registration/reviews, HR edits, concurrency, rollback and legacy invariants |
| Connected browser                      | 5 tests passed                      | Current HR/employee/configuration flows, uploads, navigation, saved drafts, HR edits and accessibility                         |
| Registration preview                   | 2 tests passed                      | Repeated fields, masking, validation, desktop/mobile and axe                                                                   |
| TypeScript / frontend production build | Passed                              | Type checking and Next.js build                                                                                                |

These are the last recorded implementation checks, not a claim that every future checkout or production environment has been verified. Connected tests create synthetic local records. Traces are disabled for that suite to avoid retaining credentials.

`npm run test:connected` selects `tests/people-connected.spec.ts` and starts a frontend on port `3001`. Preview checks use port `3000`. Historical `tests/connected.spec.ts` describes the superseded admin-registration workflow and is excluded from the current connected configuration. `npm run test:e2e` runs the earlier demo suite on port `3002`; it does not validate current backend business rules.

Other commands:

```powershell
npm run api:format  # Java formatting
npm run api:build   # API tests and executable JAR packaging
npm run start      # Serve an existing Next.js production build
```

## Remaining work and production boundary

The database uses additive Flyway migrations V1–V4. V4 introduces expanded `people` profiles, memberships, drafts, employment periods, protected documents, history and outbox records. Do not edit an applied migration; add a forward migration.

Historical employee records and requests remain in the legacy tables. They are not automatically migrated or ownership-linked. Legacy public employee request mutations return `410 LEGACY_WORKFLOW_RETIRED`; configuration requests remain active. The older CSV preview still exists, but expanded-profile bulk registration and legacy-record migration are pending. Live Google Sheets integration/synchronization is not implemented.

Production authentication has a JWT resource-server configuration boundary, but browser OIDC, authoritative role/scope lookup and production employee provisioning/linking still need integration. Local bootstrap/signup authentication must not be used as production identity management. Production configuration execution defaults off.

Before real employee data or deployment, complete:

- Browser identity-provider integration, production account linking, notification/recovery and authoritative permission rechecks.
- Managed PostgreSQL, separate migration/runtime privileges, TLS, secret/key management and rotation.
- Malware-scanner operation, document retention/deletion, encrypted backups and restore verification.
- Monitoring, operational recovery, capacity testing and external outbox delivery.
- Company provisioning and policy configuration beyond the local `LOCAL_DEV` fixture; scoped storage alone does not complete a multi-company SaaS control plane.

Database, identity and deployment settings are defined in `apps/api/src/main/resources/application.yaml`. A successful production build is not production readiness or a deployed service.

## Project records

[AGENTS.md](AGENTS.md) owns repository guidance and links to the shared architecture, standards, decisions, changes and version records. Those Drive records are updated only after an explicit user request or confirmation. This README describes local implementation; pending Drive reconciliation does not imply that a release baseline has been approved.
