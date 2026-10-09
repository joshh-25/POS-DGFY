---
status: draft_pr
owner: engineering
last_reviewed: 2026-10-09
declaration_id: 2026-10-09-pos-sell-vouchers-pricelists-refresh
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.09
verification_evidence: pos_frontend_focused_tests,pos_voucher_contract,pos_lint,pos_builds,architecture_check,git_diff_check,pr_diff_compliance
rollback_note: Revert the POS Sell, Vouchers, and Pricelists presentation changes, shared POS touch styling, and this declaration; no backend, database, migration, authorization, or persisted tenant-data change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-09T12:43:29+08:00
preflight_request_ref: NOT-EXECUTED-POS-SELL-VOUCHERS-PRICELISTS-20261009
---

# POS Sell, Vouchers, and Pricelists Frontend Refresh Compliance Impact

## Compliance Impact Classification

Classified `major` because the repository path rule hard-floors changes under
`packages/web-core/src/features/pos/**` at `major` for the `pos,terminal` surfaces. The changes
are frontend-only presentation, responsive-layout, and frontend contract-test updates; they do
not add or change API calls, database fields, migrations, authorization behavior, or persisted
tenant data.

## Affected Surfaces

1. `packages/web-core/src/features/pos/**` — Sell, Vouchers, and Pricelists presentation,
   responsive layout, modal, search, pagination, and action-button behavior.
2. `packages/web-core/src/index.css` — scoped POS touch-action and shared presentation styles.
3. `apps/dgfy-pos/tests/unit/voucherManagementPresentation.contract.test.js` — voucher frontend
   presentation contract coverage.

## Compliance Preconditions

1. POS double-tap protection remains scoped to `body[data-pos-surface="pos"]` with
   `touch-action: manipulation`; no viewport zoom disabling is introduced.
2. Sell, Vouchers, and Pricelists changes remain confined to frontend presentation, responsive
   layout, shared styling, and frontend contract tests.
3. No backend, database, migration, authorization, or persisted tenant-data behavior is changed.

## Verification Evidence

The PR diff was audited to include only POS frontend components, shared POS styling, and frontend
contract/behavior tests for Sell, Vouchers, and Pricelists, plus this declaration. The focused POS
tests, Voucher presentation contract, POS lint/build checks, architecture checks, and
`git diff --check` were run for the implementation; the PR-scoped compliance check is rerun after
this declaration is added.

## Preflight Reconciliation

No live environment preflight is claimed for this local, `develop`-targeted PR. The
`NOT-EXECUTED-*` request reference is the required PR-open placeholder; the promotion-time
compliance sweep must reconcile it to a real preflight result before promotion.
