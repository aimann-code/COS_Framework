# Configurable employee uniqueness implementation

Source baseline: aimann-code/EMPRegister, DevelopEMP, b2b156c44ba7744bf6cb81c19eb3a05d8633fdba.
Governance reference: COS_Governance draft 0.3.4 / Naming 0.2.2.
Implementation status: generated local review patch; not pushed or deployed.

## Delivered increment

| Area | Implementation |
| --- | --- |
| Shared code | com.cos.shared.reg.UniqueKeyRule: 2–32 distinct configured fields, mandatory values, explicit EXACT/TRIM/CASE_FOLD, canonical length encoding |
| Configuration | Versioned scoped rules, active pointer, configurable uniqueness error messages |
| Administration | Explicit scope/group membership for key configuration; global ADMIN role alone does not grant it |
| Activation | Confirmed request, expected version, scope lock, existing-profile scan and protected claim backfill in one transaction |
| Create/update enforcement | Registration, rejoin, direct HR edit, employee submit and HR approval use the configured rule |
| Persistence | Additive V5; immutable rules, scoped claims/FKs and database duplicate prevention |
| Compatibility | Existing onboarding APIs, profile encryption contexts, record IDs and code names retained |
| New API | GET/PUT /api/v1/emp/unique-key |
| Compatibility API | GET/PUT /api/v1/cos/onboarding/unique-key |

## API contract

GET returns version, selected fields and effective error-message templates. It requires an explicitly assigned configuration group.

PUT requires:
- expectedVersion: 0 for first configuration, otherwise current rule version;
- fields: at least two distinct registered scalar field IDs, each with EXACT, TRIM or CASE_FOLD;
- messages: supported overrides using {fields} and {source};
- confirmed: true after the caller has reviewed the selection.

No production default is invented. The integration test explicitly selects phone/account_number as synthetic fixture configuration only.

Messages return stable error_code, validation_errors keyed by missing field, and source_ref such as draft/<UUID>. Values and key tokens are not returned.

## Database and deployment

V5 removes fixed individual PAN/Aadhaar constraints and replaces them with configured composite matching. This is an intentional policy change and must be migration-reviewed before deployment. The migration also creates a narrow key-administration group model. It does not silently provision owners, members or production keys.

Employee writes fail closed with UNIQUE_RULE_REQUIRED until a rule is activated. Activation on existing data fails if selected fields are missing or duplicated. Test the backfill and recovery on a nonproduction database before rollout.

All onboarding domain mutations already hold meta.scope FOR UPDATE. Activation holds that same lock, so rule changes cannot race the existing write paths. Claims and employee writes share the surrounding transaction. DB primary/unique constraints provide additional conflict protection.

The people schema remains intact. This patch does not rename it to emp or rename API properties/encryption contexts. Historical profiles remain encrypted with their original context.

## Scope limits

This is the first integrated backend increment, not the complete CulinaOS application.

- The configuration group model is narrowly scoped to uniqueness administration. The full subscription/hierarchy/field/group access model is not implemented.
- Changes to values participating in the active key are blocked by normal updates. A separately reviewed old-key/new-key change action is still needed.
- Activation currently scans scoped encrypted profiles in-process; large installations need bounded staging/backfill jobs before adoption.
- Changing/removing a configured field through the older form configuration can require key reconfiguration; a unified configuration dependency gate remains pending.
- Existing legacy PAN/Aadhaar consistency checks during rejoin remain; they do not define duplicate uniqueness.
- A dedicated configuration screen, upload/sync/report adapters, source-message provenance beyond draft sources, all virtual marts, preferences and vendor/aggregator handlers remain pending.
- The shared rule engine can be reused by other domain adapters; no vendor/aggregator business repository is invented.

## Verification

Executed in this workspace:
- Compile shared key engine and dependency-free contract test with Java 17 compiler module.
- Execute 18 contract checks: minimum fields, duplicates, missing values, normalization, concatenation ambiguity, Unicode and immutable configuration.

Provided but not executed here:
- JUnit wrapper for shared scenarios.
- PostgreSQL/Spring workflow cases covering explicit group administration, unconfigured scope, composite duplicates, retired individual-ID uniqueness, missing-field source reference and existing HR workflows.

Full project requires Java 21 and Maven/Spring dependencies. This workspace has Java 17 and no Maven executable, so no full application build, migration execution, browser test or PostgreSQL workflow result is claimed.

Run in the developer environment:
mvn -f apps/api/pom.xml test

Do not deploy until the full suite passes and remaining production policies are resolved.

## GitHub delivery

Review this patch before pushing. No GitHub branch/PR or Drive record has been modified by this code generation. The platform-project standard update remains uncommitted following the earlier rejected write.
