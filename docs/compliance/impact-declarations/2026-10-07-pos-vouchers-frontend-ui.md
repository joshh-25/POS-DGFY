---
status: reference
owner: engineering
last_reviewed: 2026-10-07
declaration_id: 2026-10-07-pos-vouchers-frontend-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.07
verification_evidence: voucher_presentation_contract,voucher_payload_contract,pos_lint,pos_build,git_diff_check
rollback_note: Revert the Voucher presentation and shared POS filter/layout changes; no backend, database, or API contract changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-07T00:00:00+08:00
preflight_request_ref: POS-VOUCHERS-UI-2026-10-07
---

# POS Voucher Frontend UI Compliance Impact

## Compliance Impact Classification

Major by the repository's path-based POS/terminal classification floor. The substantive change is
frontend-only: it updates the POS Voucher catalog, voucher authoring modal, responsive filter
layout, lifecycle dialogs, and shared POS layout/filter presentation. It does not add or change
API calls, database fields, migrations, compliance decisions, or authorization behavior.

## Affected Surfaces

1. `packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx` — Voucher catalog,
   authoring, filtering, status actions, and responsive presentation.
2. `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` and
   `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx` — Voucher workspace
   routing and full-bleed layout integration.
3. `packages/web-core/src/features/pos/components/PosFilterDialogShell.jsx` and
   `packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx` — shared filter
   surface class plumbing used to match Voucher filters to the History reference layout.
4. `packages/web-core/src/index.css` — scoped Voucher modal, card, filter, and responsive layout
   styles.

## Compliance Preconditions

1. Account-restriction UI and payload behavior remain unchanged; this commit does not expand that
   feature area.
2. Voucher payload construction and validation remain covered by the existing contract tests.
3. The changes remain confined to frontend presentation, shared UI primitives, and frontend
   contract tests; no backend or persistence behavior is introduced.

## Verification Evidence

The Voucher presentation contract, Voucher payload contract, POS lint, POS production build, and
`git diff --check` passed for the staged implementation. The staged diff was audited to exclude
Items, Orders, F&B, and unrelated History changes.
