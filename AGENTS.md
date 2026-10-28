# COS_Framework project guidance

## Development practice

Accepted on 28-Oct-2026: before changing this project, read and follow the relevant
ECC skill for the work. Use the Java, frontend, error-handling, and coding-standards
skills for HRMS changes, and the narrower ECC skill when one matches the task more
closely. A skill does not override an accepted project rule in this file.

## Standards and decision traceability

The user designated this shared-drive location for project standards, structure,
rules, decision reasons, and the problems each change addresses:

- [Development](https://drive.google.com/drive/folders/1podsMKFDzqMSaE27heVFnBYJc7jNGIXe)
- [Standards](https://drive.google.com/drive/folders/1q_fV52VMA-Fv916YUvtvzXXlARnxzgTj)
- [Project index](https://docs.google.com/document/d/1PuW0BEv7Rkh2STY0aqwYqH2S7W4ediqTDh3vsvbnf44/edit?usp=drivesdk)
- [Standards draft](https://docs.google.com/document/d/1IWBnkfYjwBLIMkNl9a_lmjleO-vU64rkULhCaalQ51c/edit?usp=drivesdk)
- [Architecture draft](https://docs.google.com/document/d/1zRNvsfzqLEQO86nZP1s5zNjiWxvQxLRFZgOqiD5jcuI/edit?usp=drivesdk)
- [Decision register](https://docs.google.com/document/d/1RyTsIP9AjjHNUVDf-eiqyI9OoWc6vk7hr9Aae-cXpeg/edit?usp=drivesdk)
- [Change log](https://docs.google.com/document/d/1D-JhE3idnbDiTF3nZaDQwE_iuzmt9SVvkYC3Kp87cP4/edit?usp=drivesdk)
- [Version register](https://docs.google.com/document/d/1_lngf43I7gFrEavyAhYVgUR3uGMiptQk0dTTxqScniw/edit?usp=drivesdk)
- [Employee Management design baseline](https://docs.google.com/document/d/1ALDYB1ZNpx3kKGfJmae-PFg01zs7YU3FDA1qRgNzl4o/edit)

During authorised project work that changes a standard, architecture, structure,
or business rule:

1. Read the relevant current Drive draft and applicable repository guidance.
2. Distinguish accepted user decisions from questions, proposals, existing design
   requirements, implementation work, and verification outcomes. Never promote an
   assistant recommendation to an approved decision without supporting evidence.
3. Update the owning records: standards for rules, architecture for system design,
   decisions for choices and reasons, changes for implementation/fix outcomes,
   and versions for baseline manifests. Record before/after behavior, problem,
   authority/evidence, affected targets, delivery status, tests and unresolved
   work. Cross-reference the same ADR, CHG/CR and BASE references. Preserve current
   file IDs and history; increment internal versions for material updates. Use
   DD-MMM-YYYY for displayed dates.
4. Before materially editing an existing draft, keep a native recovery copy in
   the same shared-drive hierarchy. Initial creation has no prior state to back up.
5. Reconcile in both directions: assess repository impact when Drive rules change,
   and document relevant accepted code/chat changes in Drive. Link the affected
   paths and decision reference. Preserve conflicts for resolution.
6. Read back completed Drive writes and verify the target folder. Report any
   outstanding reconciliation instead of claiming everything is synchronized.

These instructions apply within the user's authorised scope and do not authorize
unrelated code changes, publication, sharing changes, migrations, or background
automation. If Drive is unavailable, continue independent authorised work where
possible and report which decision records remain to be reconciled.

## Engineering record ownership

The accepted folder reorganisation is ADR-004 / CHG-002 / BASE-002:

- Development holds the project index and separate Standards, Architecture,
  Decisions, Changes, Versions, and Backups folders.
- Each current subject draft lives in that subject's Drafts subfolder.
- Backups holds prior recovery copies; Versions records baseline manifests.
  Neither is a production release or a second editable current document.
- Trace a problem to its decision, architecture/standard impact, implementation
  change, verification, and version baseline; support reverse lookup through links.
- Keep each fact in its owning record rather than duplicating live registries.
- Standards draft 0.2.0 retains DEV-001 through DEV-010 as a historical v0.1.0
  snapshot. Current decisions and delivery status belong in the separate records.

Keep detailed content in Drive rather than copying it into this file. Each draft
links back to this repository guidance and the project index. ADR, CHG, CR, BASE
and DEV references are project-local references, not permanent COS register IDs.

The current local development implementation is ADR-002 / CHG-003 / BASE-003:
Next.js uses the Spring Boot API in apps/api by default; explicit demo mode retains
the in-memory prototype. PostgreSQL/Flyway persists metadata, requests, employee
values, approvals, audit and outbox. Run instructions, test commands and remaining
production/integration boundaries are in README.md. Architecture, Decisions,
Changes and Versions advance to draft 0.2.0, with prior native copies in Backups.

The user's "implement backend" request authorizes development implementation, not
production release or organization policy approval. Local accounts, LOCAL_DEV
scope/IDs, normalization, reference fixtures and batch policy are development
assumptions. Production authority lookup/browser OIDC, live Sheets, outbox delivery
and operational controls remain outstanding. Production execution defaults off.
Do not claim pending fixes are implemented or use real employee data locally.
Do not edit applied Flyway migrations; use a new forward migration. Preserve the
ignored .local database and encryption keys together for local recovery.

The account onboarding addition is ADR-006 / CHG-004 / BASE-004. The user explicitly
confirmed administrator approval before access. Signup stores pending accounts;
only an administrator can assign VIEWER or REGISTRAR access. Signup cannot issue
ADMIN privileges. Local/test account storage and authentication are persistent;
bootstrap accounts remain for first review. Email verification/notifications,
self-service recovery and production identity provisioning are not implemented.
Architecture, Decisions, Changes and Versions are draft 0.3.0 after this addition,
with v0.2.0 native recovery copies in Backups.

The admin workspace refinement is ADR-005 / CHG-005 / BASE-005: a separate admin
overview prioritizes employee/configuration reviews and account-access entry
points. Connected admin UI follows existing registrar-only submission authority;
it does not introduce new permissions. Counts describe loaded scoped records.
Architecture, Decisions, Changes and Versions advance to draft 0.4.0 with native
v0.3.0 backups. Business policy and production boundaries remain unchanged.

Navigation refinement is ADR-005 / CHG-006 / BASE-006 (draft 0.5.0): persistent real screen/detail routes, safe sign-in return, same-origin Next.js API proxy, scoped server directory search and in-dialog validation. Recovery copies of draft 0.4.0 are in Backups. See README.md for URLs and verification; this remains local development, with production integration boundaries unchanged.

Session and overview refinement is ADR-005 / CHG-007 / BASE-007 (draft 0.6.0): role-aware /admin and /dashboard landing pages, workspace session-loading skeleton and recoverable connection errors. Native 0.5.0 draft copies are in Backups. These URLs do not grant authority; backend role checks remain authoritative.

Audit hardening is ADR-005 / CHG-008 / BASE-008 (draft 0.7.0): strict configuration/manual-ID validation, specific CSRF rejection recovery, stale-response guards and accurate error feedback. Native 0.6.0 backups precede the Drive edits. Backend schema and authority policies are unchanged.

## Accepted workflow correction — 22-Oct-2026

ADR-007 / CR-009 / BASE-009 (Drive draft 0.8.0) supersedes the earlier approval assumptions:
- HR alone registers employees; registration does not require admin approval.
- Employees request changes to their own profile; HR validates and approves or rejects.
- Admin approves all form configuration changes, including new and existing fields.
- The user delegated onboarding design: employee sets their own credentials; HR verifies,
  links the account to the correct employee record and activates employee access.

This is an accepted requirements baseline, not an implemented workflow. Current code remains
BASE-008 and still uses the prior admin approval flow. CR-009 tracks the implementation gap.
Existing VIEWER accounts are directory viewers, not linked self-service employees. Do not
silently convert them, guess employee ownership, or claim earlier tests verify the new rules.
Recovery copies of draft 0.7.0 precede the update. Preserve historical requests and decisions.

## Drive update authorization — 22-Oct-2026

The user's latest instruction overrides automatic Drive reconciliation above.
Do not automatically create, copy, edit, move or otherwise modify Drive records
while working on this project. Update Drive only when the user explicitly requests
that update, or after asking and receiving confirmation for the proposed update.
A general code, UI, backend or requirements request is not permission to modify Drive.
Within an explicitly requested Drive update, necessary recovery copies and verification
remain part of that authorized update; do not ask again for those individual steps.
Continue authorized local work independently and identify pending Drive reconciliation
when relevant. Do not modify Drive to record this preference without explicit authorization.

## Local implementation follow-up — 22-Oct-2026

The local onboarding implementation now delivers the accepted HR/employee workflow described above: HR direct registration, explicit HR-verified EMPLOYEE membership, own-profile update proposals and HR review, plus admin-approved additional-field configuration. Additive V4 creates encrypted expanded profiles/drafts/documents, employment history and transactional outbox records. Existing viewers and historical employee records remain unchanged; old public employee request mutations are retired rather than run under the old policy. Expanded bulk import, legacy migration and production identity provisioning remain outstanding. README.md describes current routes, configuration and tests.

This supersedes only the earlier statement that local code still implements the previous workflow. It does not rewrite or advance Drive's ADR/CR/BASE records. No Drive writes were authorized or performed; their delivery status remains pending reconciliation.

Local UI and HR-edit follow-up: shared People navigation now surrounds registration and editing; legacy workspace URLs resolve to current role routes. HR can start a version-bound edit draft from a registered profile and apply changes directly with audit/history and document checks. Employment-period identifiers/dates remain read-only in this edit action; rejoin registration owns new periods. No Drive reconciliation was authorized for this follow-up.
