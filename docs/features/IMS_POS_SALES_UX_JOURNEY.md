---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-06-16
applies_to: ims_pos_sales_ux
topic: end_to_end_cashier_admin_journey
---

# IMS to POS to Sales UX Journey (Role-Based)

## Purpose
Canonical UX flow from item setup in IMS to POS checkout, history review, and Sales export.

## Workflow Mode Context
1. Tenant workflow mode is tenant-wide and master-admin controlled with expanded template values (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`).
2. Runtime boundary behavior remains family-compatible (`manufacturing` vs `msme`) for backward-safe route and wizard gating.
3. Workflow mode is independent from compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`).
4. MSME mode uses simplified IMS/POS surfaces while preserving hidden manufacturing data for reversible mode switching.

## Admin Journey
1. Create or edit finished-goods item in `Items`.
2. Configure POS requirements from item/product wizard sections (wizard-first flow) and resolve blockers:
   - POS visibility enabled
   - explicit positive sale price configured (`default_sale_price > 0`; cost is not a customer-price fallback)
   - Stock is non-negative
   - Item status is active
   - Stock-bearing items have available stock for the selected operating location; stock-exempt service rows are allowed without inventory deduction.
3. Optional POS enhancements (recommended but non-blocking for POS visibility enable):
   - POS menu image uploaded
   - Folder assigned and folder `show_in_pos_filter` enabled for faster category navigation
4. If needed, use bulk POS setup for multi-item updates.
5. Preview the item in Terminal via `Preview in Terminal`.
6. Validate terminal identity at unlock (`Terminal ID`) and open shift. Backend shift operations require a concrete terminal ID. Warn-mode first-use tenants without an active registry or stored terminal default to `COUNTER-01`; enforce-mode tenants require an active terminal registry entry before unlock/shift operations continue.
7. Monitor operational status rail:
   - connectivity
   - queued offline operations
   - shift state
   - compliance state and reason code
8. Review POS history records and hand off to Sales timeline (`Open in Sales Report`).
9. Export Sales CSV with precheck confirmation and retain export metadata.
10. Use Sync Queue console for deterministic replay/resolve actions when offline intents enter manual-resolution state.

## Readiness Gate Behavior
1. Enabling `Show in POS` is readiness-gated.
2. Blocked enable attempts return deterministic remediation metadata (`reason_code`, `missing_requirements`) until required fields are completed.
3. Disabling `Show in POS` remains allowed.

## Cashier Journey
1. Unlock terminal with credentials and resolved terminal ID. `COUNTER-01` is the first-use default only in warn mode when no terminal registry or stored terminal exists; otherwise use the configured terminal identity shown in the drawer.
2. Select an `Operating Location` before opening a shift.
3. Open shift (or continue with reused open shift).
4. Use `Sell` mode for checkout and catalog/cart actions; checkout remains bound to shift location.
5. Use `Orders` mode for online order queue actions with independent `Queue Location Scope`.
6. Complete checkout and review receipt.
7. Use `History` mode for transaction lookup and receipt re-open.
8. Use `Open in Sales Report` when escalation/reporting is required.

## Terminal Location Safety Contract
1. POS read paths are fail-closed by location grants for:
   - catalog read,
   - incoming queue read,
   - terminal today dashboard,
   - POS history query.
2. Invalid or unauthorized location scope returns deterministic denial responses; no silent broad fallback is allowed.
3. Shift location switching is privileged:
   - permission: `pos:switch_location`,
   - flow: atomic close current shift + open replacement shift at target location,
   - reason is required and transition is audited.
4. If user lacks `pos:switch_location`, terminal UI must show guidance and block switch action.
5. MSME mode keeps a minimal operating-location selector while preserving simplified surface.
6. Strict location-binding activation (`pos_terminal_location_binding_enforced=true`) is blocked until backfill readiness is green (`unresolved_count=0` and `low_confidence_count=0`).
7. Terminal setup context must display location-binding readiness summary (counts + migration tag) for operator rollout visibility.

## PO/JO Quantity UX Contract
1. PO and JO quantity entry use a shared numeric stepper component with:
   - editable numeric input
   - external UOM badge (no in-input overlap)
   - right-side vertical `+/-` controls
2. UOM presentation in PO/JO quantity surfaces is abbreviation-only (display normalization only).
3. Stepper keyboard behavior (`ArrowUp`/`ArrowDown`) follows step-by-1 for quantity controls.
4. Quantity controls are layout-consistent between PO create and JO create/edit surfaces.

## Reporting Journey
1. Sales page receives handoff filters (`source`, `source_id`, date/search/status/payment/order method).
2. User verifies timeline/detail consistency.
3. User exports CSV after row-count/date/source precheck.
4. UI confirms exported filename and filter snapshot.

## Compliance Notes
1. Dual-mode lifecycle governs terminal behavior (`non_compliant_active`, `compliant_pending`, `compliant_active`).
2. Do not rely on legacy strict-toggle references for runtime policy behavior.
3. Compliant path remains fail-closed with deterministic reason codes and fix paths.
