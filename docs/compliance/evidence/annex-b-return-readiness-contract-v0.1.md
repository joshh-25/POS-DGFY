---
status: internal_readiness_contract
authority_level: reference
owner: POS Fiscal Engineering and Compliance Engineering
last_reviewed: 2026-10-03
applies_to: pos_bir_annex_b_item_5
source_register: docs/compliance/evidence/annex-b-items-4-14-readiness-baseline.json
---

# POS Return Readiness Contract Version 0 1

## Purpose

This contract closes the internal planning decision needed before implementing
Annex B Item 5. It defines how a customer return is represented without
mutating the original fiscal transaction. It is an internal readiness decision,
not a tax opinion or external BIR approval.

## Decision

`RETURN` is a distinct adjustment type in the governed POS adjustment ledger.
It is not silently represented as `VOID` and is not the same event as a
payment refund.

## Required behavior for the later implementation phase

- The original transaction, fiscal snapshot, and issued document remain
  immutable.
- A return record references the original transaction ID, original document
  number, returned line identity, quantity, reason, actor, location, terminal,
  and business date.
- The return amount is recorded as a signed fiscal adjustment; it does not
  rewrite the original sale totals.
- Inventory reversal is a separate governed effect and is allowed only for
  returned physical inventory that the business accepts. The return record
  must retain the resulting stock movement reference when one is created.
- A cash, external, or provider refund is a separate payment adjustment linked
  to the return. A return alone does not imply that money was refunded.
- The e-Journal emits an `ADJUSTMENT` record with
  `adjustment_type=RETURN`, the original-document link, status, amount, and
  reason. Any later refund is emitted as its own linked adjustment record.
- The idempotency key is required. Replaying the same return request must not
  create a second return or refund.
- A return cannot be finalized without the required permission and an actor
  audit event. Those runtime controls are implementation work for Phase 355.

## Status and review boundary

`RETURN-READINESS-0.1` is locked as the internal implementation contract for
local planning and tests. External tax, BIR, provider, and TWG review remain
`PENDING`. No runtime code, database enum, inventory row, payment, or fiscal
record is changed by Phase 353.
