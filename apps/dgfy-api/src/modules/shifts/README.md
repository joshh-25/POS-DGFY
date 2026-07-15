# shifts module

Scaffolded in Phase 8 Wave 3 (`.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-05-PLAN.md`): shift open/close with a DB-enforced one-open-shift-per-cashier+terminal invariant (SFT-01), close-time Expected-vs-Actual cash reconciliation (SFT-02), and an append-only cash-drawer event ledger including no-sale pops (SFT-03).

## Relationship to `businesses`, `inventory`, and `compliance`

Follows the same Clean Architecture layering as `../businesses/` and `../inventory/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildShiftsModule()`. Shift open/close/no-sale-pop are staff-or-owner-gated via `requireMembership`/`guardBusinessAccess` against the `businesses` module's `BusinessRepository` (membership lives in the landlord `dgfy_core` database); shift and cash-drawer-event data itself lives in the tenant `dgfy_business_*` database, resolved via the injected `TenantConnector`.

The compliance gate (FSC-02, `modules/compliance`'s `assertComplianceGate`) is NOT wired into shift-open this phase — Phase 9 wires all real gate call sites. `buildShiftsModule()` accepts an OPTIONAL `assertComplianceGate` so it can be injected later without restructuring this module.

## One-open-shift invariant (D-12/D-13, SFT-01)

The tenant `shifts` table carries a DB-generated `active_terminal_cashier_key` column (`GENERATED ALWAYS AS (...) STORED`) with a unique index, keyed on `terminal_id` + `cashier_account_id` (the tenant-local `staff_accounts.id`, D-13 — not the landlord `dgfy_account_id`). `shiftRepository.openShift()` wraps the INSERT in a `sequelize.transaction()` and duck-types the resulting MySQL/Sequelize unique-constraint violation, rethrowing it as `DuplicateOpenShiftError` so the usecase surfaces a clean `409 CONFLICT` — never an unhandled 500.

## Reconciliation formula (D-10, SFT-02)

```
expected_cash_amount = opening_float_amount + salesCash - refundsCash + payIns - payOuts
cash_variance_amount = closing_cash_amount (actual) - expected_cash_amount   // signed
```

All Phase-9 inputs (`salesCash`/`refundsCash`/`payIns`/`payOuts`) default to `0` this phase, so `expected_cash_amount === opening_float_amount` until Phase 9 wires real checkout/refund/pay-event values through the same formula (`computeExpectedCash()` in `usecases/shiftUseCases.js`) — no restructuring needed later.

## Append-only cash-drawer ledger (SFT-03)

`cashDrawerEventRepository` exposes ONLY `create`/`findAll`/`findOne` — never `update`/`delete`. Every shift open, close, and no-sale drawer pop writes a `cash_drawer_events` row (`event_type`: `open`/`close`/`no_sale_pop`); `pay_in`/`pay_out` are reserved ENUM values only (D-10) — no usecase writes them this phase. Open/close writes join the shift's own `sequelize.transaction()` so the shift row and its event insert commit/rollback atomically together.

## Stale shifts (D-11)

A shift open longer than the operator-configurable `staleThresholdMinutes` (e.g. `SHIFT_STALE_THRESHOLD_MINUTES`) is flagged as `is_stale: true` by `listShifts` — it is NEVER auto-closed. There is no auto-close code path anywhere in this module.

## Endpoints

- `POST /shifts` — open a shift with a declared `opening_float_amount` (staff-or-owner)
- `POST /shifts/:id/close` — close a shift, computing the reconciliation (staff-or-owner)
- `POST /shifts/:id/no-sale-pop` — log a no-sale drawer pop against an open shift (staff-or-owner)
- `GET /shifts` — list shifts, each annotated with `is_stale` (membership required)

## Prohibitions honored

- No `backend/` writes — `PosTerminalShift.js` is a read-only field-shape reference only.
- No `pay_in`/`pay_out` event handling built this phase (reserved ENUM values only, D-10).
- Stale shifts are never auto-closed (D-11); the staleness threshold is never a hardcoded literal.
- `cashDrawerEventRepository` exposes no `update`/`delete` method (append-only).
