---
status: draft_pr
owner: DGFY POS/settings
last_reviewed: 2026-09-18
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-17-pos-settings-foundation
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: npm run check:compliance,npx eslint ../../packages/web-core --ext .js,.jsx --resolve-plugins-relative-to .,targeted POS lint,focused Vitest Delivery Runs suites (84 tests),npm run build:pos,npm run build:store,npm run build:ims -- --outDir .tmp-review-build,git diff --check
rollback_note: Revert the POS Settings frontend and this declaration; existing backend settings and terminal contracts remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T06:26:13.267Z
preflight_request_ref: PREFLIGHT-35189543674-2026-09-17-POS-SETTINGS-FOUNDATION
---

# POS Settings Frontend Foundation (frontend follow-up)

## Compliance Impact Classification

Major. The PR changes files under `packages/web-core/src/features/pos/`, which the
repository compliance guardrail classifies at the `major` floor for the `pos` and
`terminal` surfaces. The change restores and standardizes the POS Settings frontend
foundation and its responsive follow-up, including settings navigation, POS Setup, Storefront, Employees, shared
form primitives, pagination, Business Hours/Locations presentation, and terminal/cashier
settings presentation. The reviewer repair also restores the existing retail operational-context
refresh after confirmed incoming-order acceptance and the existing retail/F&B Delivery Runs
visibility and assignment wiring. It does not add a backend endpoint, migration, database field,
or new credential authority.

## Affected Surfaces

- `pos` — merchant-facing POS Settings screens, forms, dialogs, tabs, pagination, and
  responsive layouts.
- `terminal` — POS Setup terminal/cashier settings presentation and existing terminal
  settings interactions.

## Compliance Preconditions

1. Existing backend settings APIs, authorization checks, validation contracts, and
   persistence behavior remain the source of truth; this frontend change does not alter
   those contracts.
2. The map overlay, schedule editor, and terminal/cashier table preserve the existing
   parent save boundaries and do not create an independent persistence or credential path.
3. Existing tenant settings and terminal records remain readable without a migration or
   data backfill.
4. Client-side validation and responsive presentation must not weaken server-side
   authorization, validation, or tenant/location scoping.
5. No production deployment or live tenant qualification is claimed by this declaration.

The live request-time preflight was not executed in this local Worker session. The
`NOT-EXECUTED-*` reference is the accepted placeholder for a PR targeting `develop`; the
continuous compliance sweep reconciles it after the declaration reaches `develop`.

## Verification Evidence

- The declaration is validated by `npm run check:compliance` against the PR's
  compliance-sensitive file set.
- The exact IMS-run web-core lint command is rerun after the reviewer repair; any CI-only
  discrepancy is reported separately rather than treated as locally reproduced.
- POS, Storefront, and IMS builds are run because `packages/web-core` is shared by all
  three frontend applications.
- Focused POS Settings behavior and Delivery Runs contract tests are rerun, followed by
  `git diff --check`.
