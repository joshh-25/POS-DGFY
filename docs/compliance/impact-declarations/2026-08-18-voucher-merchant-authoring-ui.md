---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-voucher-merchant-authoring-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: VOUCHER_VERSION_CONFLICT,VOUCHER_CODE_ALREADY_EXISTS,VOUCHER_CODE_IMMUTABLE,VOUCHER_ARCHIVED_IMMUTABLE,VOUCHER_INVALID_STATUS_TRANSITION,VOUCHER_FIXED_PRICE_REQUIRES_SCOPE,VOUCHER_SCOPE_REF_NOT_FOUND,VOUCHER_BENEFIT_CONFIG_INVALID,VOUCHER_VALIDITY_WINDOW_INVALID,VOUCHER_VALIDITY_WINDOW_ELAPSED,VOUCHER_TIME_WINDOW_INCOMPLETE,VOUCHER_TIME_WINDOW_DEGENERATE
policy_version: 2026.08.18
verification_evidence: npm run build:pos,npm run check:compliance,npm run check:architecture
rollback_note: Revert the panel, service layer, and settings-tab wiring together; this PR writes no data of its own (it is a client for the already-shipped voucher CRUD API from Phase 103, PR #641) so there is no server-side state to unwind beyond the reverted code.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-614-VOUCHER-UI
---

# Voucher Merchant Authoring UI

## Compliance Impact Classification

Major. The change adds a new settings-tab surface (`apps/dgfy-web/src/features/pos/`) that lets
authorized staff create, edit, and change the lifecycle status of voucher campaigns — a
money-discounting configuration surface, matching the `pos,terminal` minimum classification this
repo already applies to any settings-adjacent POS-tab change. It is a merchant-facing admin UI, not
a checkout or payment-capture change: it does not process a transaction, move money, or touch the
POS drawer.

## Affected Surfaces

- POS/Terminal settings tab bar (`TerminalOperationsWorkspace.jsx`, `TerminalPage.jsx`,
  `TerminalPageLayout.jsx`) — adds a new `vouchers` pane alongside the existing
  employees/affiliates panes, gated the same way (`settings:view` / `settings:edit`).
- New standalone component `VoucherManagementPanel.jsx` and its thin API client
  `services/voucherService.js` — both new files, no existing surface modified beyond the tab wiring
  above.

## Compliance Preconditions

- The panel never sends `redeemed_count`, `redeemed_value_centavos`, or `redeemed_quantity` back to
  the API on create or update — those are server-owned counters (`Joi.any().forbidden()` on the
  backend) and this UI does not attempt to edit them, avoiding the exact read-modify-write clobber
  bug already present in the legacy Promo Codes editor this UI is modeled after.
- Every update carries the voucher's `version` from the last GET/PUT response; a `409
  VOUCHER_VERSION_CONFLICT` (a concurrent redemption or another merchant's edit landed first) surfaces
  a reload-and-discard prompt rather than silently overwriting server state.
- `status` is never form-editable — only the dedicated activate/pause/archive actions can change it,
  and the panel enforces the same allowed-transition set the backend does before even issuing the
  request, so a rejected transition is caught client-side with the backend's `409
  VOUCHER_INVALID_STATUS_TRANSITION` as the authoritative fallback.
- Access is gated on the existing `settings:view` (read) / `settings:edit` (write) permissions —
  identical to how `apps/dgfy-api/src/routes/vouchers.js` gates the API this UI calls. No new
  permission is introduced by this PR (a dedicated `PERMISSIONS.VOUCHERS` group is tracked separately
  as #655, deliberately out of scope here).

## Verification Evidence

- `npm run build:pos` — real Vite production build of the POS/Terminal app surface this panel ships
  in; catches syntax, unresolved-import, and JSX errors.
- `npm run check:compliance` — this declaration's own gate, re-run after adding this file.
- `npm run check:architecture` — architecture boundary check against the merge-result tree.
- No backend code changes in this PR, so no migration/tenant-schema verification applies. Local Jest
  could not be run in this worktree (no `node_modules` installed) — stated here rather than silently
  omitted; the PR body carries the same note.
