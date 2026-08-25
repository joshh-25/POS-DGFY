---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-08-25
review_by: 2027-02-25
applies_to: pos, attendance, cash_drawer
---

# POS Cashier Attendance and Register Handoff Rollout

## Preconditions

- Phases 154-159 are completed in `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`.
- Target tenant migrations are current and runtime schema audit passes.
- The location has no open register shift, attendance session, break, operator session, or
  protected payment/drawer operation when configuration changes.
- A tenant settings administrator and two location-authorized test cashiers are available.

## Canary activation

1. Choose one non-production tenant and one location.
2. Record the current `pos_cashier_attendance_lifecycle_v1` configuration and monitoring baseline.
3. During Phase 160, have the release operator update only the selected location in the
   `pos_cashier_attendance_lifecycle_v1` tenant setting and record the before/after value. After
   Phase 161 is complete, use the audited POS Setup control instead of direct setting access.
4. Run the deterministic A/B scenario: regular duty, break, relief duty, operator takeover,
   return, counted custody transfer, checkout attribution, report reconciliation, and Z close.
5. Confirm `sku_pos_cashier_lifecycle_signals_total` has no unexpected failure or mismatch spike.
6. Retain the canary for one complete operating day before adding another location.

## Rollback

1. Stop new cashier activity and finish or safely close every active protected operation.
2. End active breaks, attendance sessions, operator sessions, and the register shift through the
   normal POS workflow. Never update lifecycle rows directly.
3. During Phase 160, restore the recorded tenant setting value. After Phase 161 is complete,
   disable the selected location through POS Setup; the server rejects an unsafe rollback with
   `409`.
4. Verify the attendance panel disappears while legacy single-cashier checkout, shift, X/Z, and
   receipt behavior still works.
5. Preserve all attendance, operator, handoff, and transaction history for audit and reporting.

## Stop conditions

- More than one active operator for a terminal or one open register shift for a terminal.
- Any cashier/register reconciliation mismatch.
- Cross-tenant or cross-location access.
- Payment, refund, void, or drawer mutation accepted without current operator authority.
- Critical/high accessibility, responsive, security, migration, or data-integrity defect.

When a stop condition occurs, disable further activation, preserve evidence, and follow the
incident-response process. Do not delete or rewrite financial or attendance history.
