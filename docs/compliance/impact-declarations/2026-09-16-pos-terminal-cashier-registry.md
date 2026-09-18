---
status: draft_pr
owner: DGFY POS/settings
last_reviewed: 2026-09-16
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md
declaration_id: 2026-09-16-pos-terminal-cashier-registry
classification: regulatory
surfaces: pos,terminal,settings,inventory,payments,compliance
reason_codes_impacted: ALLOWED,AUTHORIZATION_FAILED,VALIDATION_FAILED,LOCATION_NOT_GRANTED
policy_version: 2026.09.16
verification_evidence: node --check API source files,npm test terminal registry suites 9/9,npm test POS terminal regression 132/132,npm run build:pos,npm run lint POS,npm run lint API,git diff --check
rollback_note: Revert the implementation and declaration commits; existing terminal entries without cashier_user_ids retain legacy location-based access.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-16T13:11:18.589Z
preflight_request_ref: PREFLIGHT-35099945464-2026-09-16-POS-TERMINAL-CASHIER-REGISTRY
---

# Per-terminal cashier assignment state (#1932)

## Compliance Impact Classification

Major. This change extends the existing tenant POS terminal registry settings contract with
optional per-terminal cashier assignment IDs and adds controls for managing those assignments in
POS Settings. It changes the settings data exposed to the POS surface, but does not add a new
credential authority, change terminal login rules, alter shift safeguards, or introduce a database
schema/migration change.

## Affected Surfaces

- POS Setup terminal registry and cashier assignment management.
- Tenant settings validation, normalization, and public settings reads.
- Existing terminal identity and location-binding compatibility paths.

## Compliance Preconditions

1. `cashier_user_ids` remains optional so existing registries continue using their location-based
   cashier access until an owner makes an explicit assignment change.
2. The API accepts only positive, unique integer assignment IDs and strips terminal password
   material as before.
3. The POS UI offers assignment controls only for active cashier accounts with access to the
   terminal's assigned location and clears explicit assignments when that location changes.
4. Existing terminal location binding, active/default terminal rules, authorization, and shift
   safeguards remain unchanged; this change does not create a second credential or membership
   authority.
5. No production deployment or live tenant qualification is claimed by this declaration.

The live request-time preflight was not executed in this local Worker session. The required
front-matter shape is present for the continuous sweep to reconcile after the PR lands; this
declaration does not claim a live policy-engine result.

## Verification Evidence

- API syntax checks passed for all changed API source files.
- Terminal registry validator and secret round-trip suites passed: 9 tests passed.
- POS terminal regression contract suite passed: 132 tests passed across 6 files.
- POS production build passed after transforming 2,998 modules.
- POS lint passed; API lint reported zero errors and only pre-existing warnings outside this scope.
- `git diff --check` and the changed-file repository-safety scan passed.
