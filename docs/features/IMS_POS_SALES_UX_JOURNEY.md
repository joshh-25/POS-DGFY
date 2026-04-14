---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-04-13
applies_to: ims_pos_sales_ux
topic: end_to_end_cashier_admin_journey
---

# IMS to POS to Sales UX Journey (Role-Based)

## Purpose
Canonical UX flow from item setup in IMS to POS checkout, history review, and Sales export.

## Workflow Mode Context
1. Tenant workflow mode is tenant-wide and master-admin controlled (`manufacturing` or `msme`).
2. Workflow mode is independent from compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`).
3. MSME mode uses simplified IMS/POS surfaces while preserving hidden manufacturing data for reversible mode switching.

## Admin Journey
1. Create or edit finished-goods item in `Items`.
2. Configure POS requirements from item/product wizard sections (wizard-first flow) and resolve blockers:
   - POS visibility enabled
   - POS menu image uploaded
   - Folder assigned and folder `show_in_pos_filter` enabled
   - Sale price configured
   - Stock is non-negative
3. If needed, use bulk POS setup for multi-item updates.
4. Preview the item in Terminal via `Preview in Terminal`.
5. Validate terminal identity at unlock (`Terminal ID`) and open shift.
6. Monitor operational status rail:
   - connectivity
   - queued offline operations
   - shift state
   - compliance state and reason code
7. Review POS history records and hand off to Sales timeline (`Open in Sales Report`).
8. Export Sales CSV with precheck confirmation and retain export metadata.

## Readiness Gate Behavior
1. Enabling `Show in POS` is readiness-gated.
2. Blocked enable attempts return deterministic remediation metadata (`reason_code`, `missing_requirements`) until required fields are completed.
3. Disabling `Show in POS` remains allowed.

## Cashier Journey
1. Unlock terminal with credentials and selected terminal ID.
2. Open shift (or continue with reused open shift).
3. Use `Sell` mode for checkout and catalog/cart actions.
4. Use `Orders` mode for online order queue actions.
5. Complete checkout and review receipt.
6. Use `History` mode for transaction lookup and receipt re-open.
7. Use `Open in Sales Report` when escalation/reporting is required.

## Reporting Journey
1. Sales page receives handoff filters (`source`, `source_id`, date/search/status/payment/order method).
2. User verifies timeline/detail consistency.
3. User exports CSV after row-count/date/source precheck.
4. UI confirms exported filename and filter snapshot.

## Compliance Notes
1. Dual-mode lifecycle governs terminal behavior (`non_compliant_active`, `compliant_pending`, `compliant_active`).
2. Do not rely on legacy strict-toggle references for runtime policy behavior.
3. Compliant path remains fail-closed with deterministic reason codes and fix paths.
