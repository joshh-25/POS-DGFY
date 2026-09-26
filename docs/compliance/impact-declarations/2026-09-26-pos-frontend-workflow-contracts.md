---
status: reference
owner: engineering
last_reviewed: 2026-09-26
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-09-26-pos-frontend-workflow-contracts
classification: regulatory
surfaces: pos,terminal,settings,compliance,payments,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.26
verification_evidence: npm --prefix apps/dgfy-ims run lint,npm --prefix apps/dgfy-ims run build,npm --prefix apps/dgfy-pos run build,npm --prefix apps/dgfy-storefront run lint,npm --prefix apps/dgfy-storefront run build,npm --prefix apps/dgfy-storefront test -- --reporter=dot,focused POS regression tests,git diff --check,node scripts/check-app-version-bump.js
rollback_note: Revert this declaration and the paired POS frontend workflow-contract commit together, then rerun the POS/Storefront lint, build, and focused regression checks. No database migration or backend rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T15:00:00+08:00
preflight_request_ref: PR-2082
---

# 2026-09-26 POS Frontend Workflow Contracts

## Compliance Impact Classification

Major.

This declaration covers frontend-only repairs for POS terminal workflow contracts after the develop merge. The changes restore existing report export wiring, preserve the existing-order non-cash confirmation guard, align split-payment and terminal-flow tests with the supported UI paths, and remove stale duplicate report markup. No backend route, payment provider, fiscal document, tax, compliance-mode, or database behavior is changed.

## Affected Surfaces

- POS report workspace and its existing procurement CSV export action.
- POS split-payment and terminal cash-collection UI contracts.
- POS terminal dialog rendering and order-flow compatibility handling.
- POS/terminal contract and behavior tests that protect these surfaces.

## Compliance Preconditions

1. Backend-owned checkout totals, payment authorization, fiscal receipt issuance, tax calculation, and stock behavior remain unchanged.
2. Existing-order non-cash confirmation remains required before split payment can proceed.
3. Procurement CSV export continues to use the existing authorized frontend service; no new data endpoint or permission bypass is introduced.
4. Delivery, pickup, and dine-in terminal flows continue to use their existing dedicated handlers and status contracts.
5. No database schema, migration, seed, or persistent-data change is included.

## Verification Evidence

- IMS lint passed with warnings only and no errors.
- IMS, POS, and Storefront production builds passed.
- Focused POS regression suite passed: 4 files, 63 tests.
- Storefront full suite passed: 223 files, 1,215 tests.
- `git diff --check` passed.
- `node scripts/check-app-version-bump.js` passed.
