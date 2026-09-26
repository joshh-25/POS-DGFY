---
status: draft_pr
owner: DGFY POS/shared UI
last_reviewed: 2026-09-25
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-25-pos-responsive-shared-ui
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.09.25
verification_evidence: 29 focused POS UI test files passed (290 tests),npm run build:pos passed,IMS build passed using isolated output directory after existing dist cleanup EPERM,npm run build:store passed,app version check passed for develop PR mode unchanged,architecture checks passed,ADR lint passed,docs lint passed,compliance check passed for 80 sensitive files and API contracts,git diff check against sieitzz/develop passed
rollback_note: Revert the responsive POS UI implementation commits and this declaration together; these changes add no schema migration or persisted-data writes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T04:48:35.620Z
preflight_request_ref: PREFLIGHT-36218725662-2026-09-25-POS-RESPONSIVE-SHARED-UI
---

# POS responsive shared UI across History, Reports, and Settings

## Compliance Impact Classification

Major. The compliance path rules mechanically classify the shared POS frontend and the affected
terminal/settings surfaces as major. This work standardizes responsive navigation, filters, table
actions, mobile cards, and pagination; it also aligns report requests and offline cache keys to the
active report tab's effective granularity. It does not add or change a backend endpoint, payment
settlement path, fiscal calculation, permission grant, or persisted transaction behavior.

## Affected Surfaces

- `pos` — shared POS page frame, History and Reports controls, table/card layouts, and filters.
- `terminal` — mobile navigation, sticky tabs, pagination, and terminal workspace layout.
- `settings` — employee/settings tables, action controls, filters, and sticky settings tabs.

## Compliance Preconditions

1. Existing tenant, location, role, and permission checks remain authoritative; no access boundary
   or permitted action is added or removed.
2. Report monetary and operational values remain server-provided. The selected report tab's
   effective granularity determines the existing request and offline snapshot key; no values are
   recalculated and no report action writes transaction data.
3. Existing History, Reports, Settings, employee-credit, cashier, and terminal workflows remain
   behind their existing authenticated POS paths.
4. No API, database schema, migration, fiscal rule, tax/discount calculation, or payment-settlement
   behavior is changed.
5. A live request-time compliance preflight was not run for this local PR preparation. The
   `NOT-EXECUTED-*` reference is an accepted develop-PR placeholder; the continuous compliance
   sweep is expected to reconcile it after merge.

## Verification Evidence

- 29 changed POS UI test files passed (290 tests), covering shared components, History, Reports,
  Settings, and terminal navigation/Operations contracts.
- `npm run build:pos` passed. Vite reported the existing mixed static/dynamic import warning for
  `rolloutFlag.js` and chunk-size warnings.
- IMS/Skupervisor production build passed using a separate output directory after the normal build
  could not remove a locked file from the existing `dist` directory (`EPERM`). The isolated output
  was removed after verification. Vite reported the existing mixed-import/chunk-size warnings.
- `npm run build:store` passed; Vite reported the existing large-chunk warning.
- `check:app-versions` passed in the ordinary `develop` PR mode (`unchanged`) for IMS, POS, and
  Storefront; no app version change was required.
- `npm run check:architecture`, `npm run check:adr`, and `npm run lint:docs` passed.
- `npm run check:compliance` passed against the full branch diff, validating 80 sensitive files and
  10 compliance API-contract rules.
- `git diff --check sieitzz/develop...HEAD` passed.
