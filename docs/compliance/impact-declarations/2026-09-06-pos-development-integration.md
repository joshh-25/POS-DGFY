---
status: reference
owner: engineering
last_reviewed: 2026-09-06
declaration_id: 2026-09-06-pos-development-integration
classification: major
surfaces: pos,terminal,payments,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.06
verification_evidence: 176 API tests; POS build; architecture and ADR checks; three local migrations and schema post-checks
rollback_note: Revert the local integration commit only after checking database compatibility; pre-migration local SQL backups are retained in Git metadata. No production operation was performed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-POS-DEVELOPMENT-INTEGRATION
---

# Local POS-Development integration with develop

## Compliance Impact Classification

Major: shared POS, payment, settings and image integration.

## Affected Surfaces

Integrate develop commit `9918e33b4` into local POS-Development while preserving
existing catalog pagination, exact-centavo payment comparison, modal ownership,
recoverable bulk image imports, and POS thumbnail/preview behavior.

Conflict resolutions preserve develop's additional-category editor, image-source
precedence, upload completion wait, version-3 WebP assets, client-conversion gate,
and release package versions. POS thumbnails recognize version-3 assets and
ignored client variant temporary files are cleaned up. Existing phase numbers
are retained with initiative names to disambiguate independent histories.

## Verification Evidence

The focused API integration run passes 176 tests across 11 suites. The POS build,
architecture guardrails, documentation lint and ADR checks pass. The full POS UI run passes 965 tests across 151 suites. Other shared frontend
builds are recorded in the PR summary when complete.

Three develop migrations were pending locally: pending email OTP delivery status,
obsolete outside-radius flag retirement, and image client-conversion settings.
The local landlord and active tenant databases were backed up before execution.
All three migrations passed; post-checks confirmed recorded migrations, the pending
email enum/default, off/empty image rollout defaults, and zero remaining obsolete
radius columns in the affected local databases. No migration source was modified.

## Compliance Preconditions

Live preflight has not been executed. The NOT-EXECUTED reference is an explicit
placeholder, not proof of a policy-engine evaluation. Promotion must reconcile it
using the governed sweep. Signed-in Items browser coverage remains pending.

The local merge bundles previously reviewed develop declarations. Those individual
declarations are retained unchanged; this declaration covers the complete local
integration surface rather than broadening each historical declaration artificially.
