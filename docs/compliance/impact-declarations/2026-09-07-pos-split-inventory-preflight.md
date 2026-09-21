---
status: reference
owner: engineering
last_reviewed: 2026-09-07
declaration_id: 2026-09-07-pos-split-inventory-preflight
classification: major
surfaces: pos,terminal,payments,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.07
verification_evidence: 31 focused split-payment unit tests; targeted migrated-database FIFO preflight and final-checkout tests; architecture, ADR, and compliance checks
rollback_note: Revert the read-only stock availability command and split-session preflight call. No database or persisted-data rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-07-POS-SPLIT-INVENTORY-PREFLIGHT
---

# POS split-payment inventory preflight

## Compliance Impact Classification

Major. The change affects the point at which POS may begin accepting split tender and crosses the
POS-to-Inventory command boundary. It does not change tender authorization, totals, tax, receipts,
or persisted payment semantics.

## Affected Surfaces

- Split-payment session creation for Cash, GCash, Maya, Card, and Bank Transfer.
- Inventory availability checks for direct sale items, recipe ingredients, and modifier SKUs.
- Cashier error handling when recorded stock and FIFO batches require reconciliation.

## Compliance Preconditions

- No payment session or allocation is created after an inventory preflight failure.
- The preflight is read-only and cannot repair or mutate Inventory records.
- Final checkout still revalidates and issues stock inside its authoritative transaction.
- Inventory owns location stock and FIFO decisions through its command contract.

## Verification Evidence

- Split-payment unit suite passed 31 tests, including session-creation and first-allocation preflight
  arguments and no persistence on failure.
- Migrated-database preflight test reproduced FIFO drift and confirmed no sale, movement, or stock mutation.
- Existing migrated-database final-checkout reconciliation guard remains passing.

Live compliance preflight has **not been executed** for this branch-local change. The automated
compliance sweep must replace the `NOT-EXECUTED-*` reference with real evidence before ordinary
promotion to main.
