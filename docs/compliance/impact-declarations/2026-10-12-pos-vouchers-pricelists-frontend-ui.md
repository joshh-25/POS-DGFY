---
status: reference
owner: engineering
last_reviewed: 2026-10-12
declaration_id: 2026-10-12-pos-vouchers-pricelists-frontend-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.12
verification_evidence: voucher_pricelist_component_tests,pos_targeted_lint,pos_lint,pos_build,architecture_checks,git_diff_check,compliance_check
rollback_note: Revert the scoped Voucher/Pricelist presentation, shared POS picker, and accessibility changes; no backend, database, migration, or API contract changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-12T18:40:00+08:00
preflight_request_ref: POS-VOUCHERS-PRICELISTS-UI-2026-10-12
---

# POS Voucher and Pricelist Frontend UI Compliance Impact

## Compliance Impact Classification

Major by the repository's path-based POS/terminal classification floor. The substantive change is
frontend-only: it refines the POS Voucher and Pricelist catalogs, authoring/editor modals, shared
date/time picker presentation, responsive workspace layout, and accessibility behavior. It does
not add or change API calls, database fields, migrations, compliance decisions, or authorization
behavior.

## Affected Surfaces

1. `packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx` and
   `VoucherFormModal.jsx` — Voucher catalog, authoring, filtering, responsive presentation,
   Escape handling, focus trapping, and focus restoration.
2. `packages/web-core/src/features/pos/components/PricelistManagementPanel.jsx` and
   `packages/web-core/src/features/pos/pricelists/` — Pricelist list, create/archive flow, item
   editor, responsive layout, publish controls, and editor accessibility behavior.
3. `packages/web-core/src/features/pos/components/PosDateRangePicker.jsx`,
   `PosDateRangeField.jsx`, and `PosTimeRangeField.jsx` — shared picker behavior used by the
   Voucher validity and daily-time fields; month navigation, swipe direction, preset transitions,
   and outside-month selection keep one animation contract.
4. `packages/web-core/Components/ui/select.jsx`, `dialog.jsx`, and the shared POS filter/search
   primitives — controlled-value synchronization, focus-safe dialog lifecycle, and catalog
   control presentation.
5. `packages/web-core/src/index.css` — only the Voucher/Pricelist and shared date-picker hunks
   are in scope; unrelated terminal, current-sale, and History-only hunks remain excluded from
   the product commits.

## Compliance Preconditions

1. Voucher and Pricelist payload construction, API service calls, permission gates, version checks,
   and persistence behavior remain unchanged.
2. Shared dialog/select changes preserve existing Escape, focus-trap, controlled-value, and
   confirmation-dialog contracts for other POS surfaces.
3. The implementation remains confined to frontend code, frontend tests, and the required
   compliance declaration; no backend, database, migration, or Android files are included.
4. The dirty worktree contains unrelated POS edits. Those edits must be excluded by path and CSS
   hunk when the atomic product commits are prepared.

## Verification Evidence

The scoped Voucher/Pricelist/date-time/accessibility suite passed (11 test files, 58 tests),
targeted ESLint passed without findings, the POS lint passed, the POS production build passed,
architecture guardrails passed, and `git diff --check` passed. The local browser route rendered the
POS terminal login wall; authenticated Voucher/Pricelist visual smoke was not automated because no
credentials were supplied.
