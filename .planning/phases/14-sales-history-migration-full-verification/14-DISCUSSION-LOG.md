# Phase 14: Sales History Migration & Full Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 14-Sales History Migration & Full Verification
**Areas discussed:** Non-resolvable FK fields, Void status mapping, Full-table-scan for a live table, Payment/cash detail scope

---

## Non-resolvable FK fields

| Option | Description | Selected |
|--------|-------------|----------|
| Drop with finding (recommended) | Phase 13 D-08 treatment: emit a lossy-collapse finding, insert no value. Keeps scope to the 6 ROADMAP-fixed entity types. | |
| Add a snapshot column | New additive JSON column on availments to preserve raw legacy values for audit/debug. | ✓ |
| You decide | | |

**User's choice:** Add a snapshot column
**Notes:** Applies to shift_id (legacy pos_terminal_shifts, unrelated to new shifts table), fnb_check_id, fnb_table_id, store_customer_id, payment_collected_shift_id/terminal_id.

| Option | Description | Selected |
|--------|-------------|----------|
| Null FK + finding (recommended) | availments.terminal_id = null, finding recorded, raw string also captured in snapshot column. | ✓ |
| Block the row | Skip migrating the whole availment if terminal can't be resolved. | |
| You decide | | |

**User's choice:** Null FK + finding (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate with null cashier + finding (recommended) | cashier_account_id = null, non-blocking finding. Preserves sale for audit/reporting. | ✓ |
| Skip the row entirely | Don't migrate the availment if cashier can't be resolved. | |
| You decide | | |

**User's choice:** Migrate with null cashier + finding (recommended)

---

## Void status mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse 'voided' directly (recommended) | availments.status='voided' + source_system='legacy_migration' as the distinguishing signal. | |
| Add a distinguishing signal | Reuse 'voided' but add explicit marking so legacy-origin voids can't be conflated with refund-origin voids. | ✓ |
| You decide | | |

**User's choice:** Add a distinguishing signal

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the snapshot column (recommended) | Void metadata (voided_at/voided_by/legacy status) folds into the same general snapshot column from the FK-fields decision. | ✓ |
| Dedicated void metadata field(s) | Add specific queryable/indexable columns instead of JSON. | |
| You decide | | |

**User's choice:** Reuse the snapshot column (recommended)
**Notes:** Resolved to: distinguishing signal = source_system + status combination (not a new enum value); void metadata detail lives in the D-14-01 snapshot column, not dedicated columns.

---

## Full-table-scan for a live table

| Option | Description | Selected |
|--------|-------------|----------|
| Accept full-scan-per-run (recommended) | Keep existing unpaginated SELECT * mechanism; legacy_id_map already provides idempotency; one-time cutover migration, not continuous sync. | ✓ |
| Add a watermark/incremental cursor | Build a timestamp/PK-range cursor so each run only pulls new rows since last checkpoint. | |
| You decide | | |

**User's choice:** Accept full-scan-per-run (recommended)

---

## Payment/cash detail scope

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into snapshot column (recommended) | Payment-processing detail (cash_received, change_amount, payment_status/reference/provider/checkout_url, service_fee, delivery_fee) preserved in the general snapshot column. Core totals still map to availments' existing decimal columns. | ✓ |
| Out of scope, dropped with finding | Only core monetary totals migrate; payment detail not preserved anywhere. | |
| You decide | | |

**User's choice:** Fold into snapshot column (recommended)

**Follow-up question (from Claude):** Should Phase 14 verify VER-02's sum-by-type reconciliation includes a legacy-vs-migrated total_amount parity check, or is that out of scope?

**User's response (free text):** "how do we handle delivery fee and or service fee in the new system?" — a genuine question, not an answer to the parity question. Claude researched and reported: the new system has no live fee computation today (only a hardcoded `service_fee_amount: '0.0000'` placeholder in `availmentUseCases.js:1008`); fees are implicitly baked into legacy `total_amount`; proposed folding fee breakdown into the snapshot column and deferring "extensible live fees" as a new checkout-domain capability.

**User pushback:** "I think we need a sort of flexible field for additional fees? ... service fee and delivery fee are oddly specific, and not all transactions carry these fees. but, there could be transactions that have additional fee that's not always a service or delivery fee." Claude proposed splitting migration-side flexibility (snapshot column, already covers this) from live-system extensible-fee capability (new checkout feature, out of scope) and asked whether that split works.

**User (declined the split):** "I wanna include this new column if possible. snapshots is one thing, but I wanna be able to set these fees once it's live. it feels non negotiable rather than putting it aside for Phase 9 reaudit. this is the purpose of having these verification is to know what gaps we haven't closed, and this is one of those gaps I feel."

Claude re-split the ask into (a) adding the column itself — small, additive, same pattern as `source_system` — vs. (b) wiring live checkout business logic to let staff set/edit fees — a real feature build with VAT/discount interaction, out of scope for a migration phase. Presented both back as a final choice:

| Option | Description | Selected |
|--------|-------------|----------|
| Add the column, migration-only (recommended) | availments.additional_fees JSON column (additive, same pattern as source_system), migration mapper populates it from legacy delivery_fee/service_fee. No live checkout write path built in this phase. | ✓ |
| Column + flag checkout gap loudly | Same as above, plus Phase 14's verification/findings output explicitly calls out the checkout write-path gap in its report. | |
| You decide | | |

**User's choice:** Add the column, migration-only (recommended)
**Notes:** Resolved as D-14-09 in CONTEXT.md. The live-checkout write path for setting/editing fees is captured as a deferred idea, not built in Phase 14.

---

## Claude's Discretion

- Exact snapshot column name/shape (JSON structure, key naming) — follow `products.attributes` namespaced-JSON precedent.
- `additional_fees` shape (flat vs. array-of-fee-objects) — implementation detail as long as additive and migration-populatable.
- Finding/reason-code strings for unresolved-FK cases — follow existing `classifyMappingConflict()`/`MAPPING_REASON_CODES` pattern.
- Line-item provenance column shape for `availment_items` (SHM-04) — follow `availments.source_reference` precedent unless research finds a reason to diverge.
- Whether VER-02 includes an explicit legacy-vs-migrated `total_amount` parity check — not conclusively resolved (conversation moved to the additional_fees question instead); CONTEXT.md defaults to "include it" pending research, since it directly supports VER-03's "zero unresolved data-quality issues" bar.

## Deferred Ideas

- Live checkout write path for `availments.additional_fees` (staff setting/editing arbitrary fees at time of sale, VAT/discount interaction, multi-fee support) — new POS Checkout domain capability, not migration work. Raised by the user after discovering the new system has no live fee computation today.
