---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-21
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-10-21-platform-downpayment-allowance
classification: regulatory
surfaces: settings,compliance,payments,pos,terminal
reason_codes_impacted: DOWNPAYMENT_NOT_ALLOWED_BY_PLATFORM,DOWNPAYMENT_ALLOWANCE_PLATFORM_CONTROLLED,AUTHORIZATION_FAILED
policy_version: 2026.10.16
verification_evidence: focused API Jest and Admin/POS Vitest suites,JavaScript syntax checks,Admin/IMS/POS/OPIS/Storefront builds,local mocked desktop/mobile UI proof,npm run check:architecture,npm run lint:docs,npm run check:compliance,node scripts/check-app-version-bump.js
rollback_note: Roll back API and UI before removing the landlord allowance column. Existing order and payment records are unchanged. Removing the policy restores prior merchant self-service behavior; do not run migration down while the new API is deployed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T06:07:55.730Z
preflight_request_ref: PREFLIGHT-39731474926-2026-10-21-PLATFORM-DOWNPAYMENT-ALLOWANCE
---

# Platform-owned downpayment allowance (#2639)

## Compliance Impact Classification

Proposed regulatory classification follows the Admin settings/compliance path floor.
Payment resolution and shared POS settings additionally affect payments, POS and terminal
surfaces. This restricts availability of new downpayments; it does not change captured
amounts, tax computation, existing-order balances, settlement or refund terms.

## Affected Surfaces

- Settings/compliance: reason-required Platform Admin allowance, audited in the same
  landlord transaction; merchant allowance writes are forbidden.
- Payments: catalog, quote, checkout and new payment-session resolution fail closed to
  full payment when disallowed, including crafted customer elections.
- POS/terminal: unavailable-state explanation; independent dine-in policy still saves.

## Compliance Preconditions

Apply the landlord-only additive migration before API deployment. Grandfather only
existing non-full modes; new tenants default to disallowed. Completed migration reruns
preserve subsequent revocations. No tenant schema synchronization is needed.
Cash/COD remains merchant-owned; existing partially paid orders retain captured terms.

The NOT-EXECUTED reference is the develop placeholder, not live preflight evidence.
The live sweep must reconcile this declaration before production promotion. The
classification and declaration were approved by Pat on 2026-10-21 before commit,
along with the concrete landlord migration.

## Verification Evidence

Passed: 209 API tests across 20 suites; 12 Admin and 20 shared POS/message tests;
Admin, IMS, POS, OPIS and Storefront production builds; JavaScript syntax, architecture,
docs/ADR, compliance and develop unchanged-version gates. Mocked local Admin and POS
desktop/mobile browser checks passed without page/console errors. The initial route-gate
HTTP parser failure did not recur in the isolated or final combined run.
Database migration execution and deployed STAGING verification remain outstanding;
see Phase 526's post-merge checklist. No deployed environment was changed.

UI delivery: the Admin premium toggle and POS unavailable notice are included with
their focused regression tests; the separate dine-in save is preserved.

Documentation closure: ADR 0070, API/schema contracts, the downpayment module README
and Phase 526 ledger record the same allowance and migration-before-API requirement.
