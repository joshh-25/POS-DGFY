# Phase 11: Order Fulfillment & Delivery Coordination - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 11-Order Fulfillment & Delivery Coordination
**Areas discussed:** Courier & payout record shape, POS/dine-in Availments in the pipeline, Customer delivery confirmation, Exact stage names per mode

---

## Pending Todo Review (before gray-area discussion)

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as backlog | Not fulfillment/delivery domain — a Phase 8 compliance-module transaction bug, previously flagged as a likely keyword false-positive during Phase 10's discussion too | ✓ |
| Fold into Phase 11 | Include it as in-scope work anyway | |

**User's choice:** Leave as backlog.
**Notes:** `2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md` (score 0.9) remains general backlog, not this phase's scope.

---

## Courier & Payout Record Shape

**Q: Reusable Courier entity vs. free-text per order?**

| Option | Description | Selected |
|--------|-------------|----------|
| Free-text per order | courier_name + courier_contact typed fresh per assignment | ✓ |
| Reusable Courier entity | Saved, business-scoped list staff select from | |
| You decide | Claude picks | |

**Q: Payout tracking — amount only, or amount + owed/paid status?**

| Option | Description | Selected |
|--------|-------------|----------|
| Amount + owed/paid status | payout_amount, payout_status, paid_at | ✓ |
| Amount only, no status | Just the agreed figure | |
| You decide | Claude picks | |

**Q: Courier payout tied to Shift & Cash Drawer pay-outs, or independent?**

| Option | Description | Selected |
|--------|-------------|----------|
| Independent of Shift | Lives entirely on the fulfillment/courier record | ✓ |
| Tied to Shift pay-outs | Creates a shift cash-drawer pay-out event too | |
| You decide | Claude picks | |

**Q: Dedicated assignment table, or columns on Availment?**

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated table | One row per assignment attempt, supports reassignment history | ✓ |
| Columns on Availment | Only reflects current/latest assignment | |
| You decide | Claude picks | |

**User's choice:** Free-text per order; amount + owed/paid status; independent of Shift; dedicated assignment table (all recommended options).
**Notes:** Legacy's `storefront_delivery_partners` business setting (Grab/Foodpanda/Lalamove/custom link display) was explicitly distinguished as a different concept from this per-order courier record.

---

## POS/Dine-in Availments in the Pipeline

**Q: Full stage pipeline for dine-in, or finalize straight to completed?**

| Option | Description | Selected |
|--------|-------------|----------|
| Finalize straight to completed | Single stage-event row at finalize | (initial framing) |
| Full pipeline for dine-in too | Staff manually progresses every stage | |
| You decide | Claude picks | |

**User's initial free-text answer:** "Since in the future we do need kitchen staff accepting and processing food progress, then we might want a full pipeline; but not strictly followed, it's as if a straight to completed, but underneath, is already passing through stages. you get what I mean?"

**Claude's clarifying follow-up (plain text, not AskUserQuestion):** Reflected back the interpretation — write the FULL stage sequence (placed→confirmed→preparing→ready→completed) as real rows all at once at finalize (auto-fast-forwarded), for every dine-in sale, rather than a single bare "completed" row — keeping the door open for a future manual kitchen-workflow phase without a schema change.

**Confirmation question:**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, exactly that | Full sequence auto-written at finalize for every dine-in sale | ✓ |
| Close, but only when needed | Only when a business opts into kitchen-style tracking | |
| Let me clarify further | | |

**Q: Touch Phase 9's finalize code, or leave untouched?**

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Phase 9's finalize path | One stage-event write inside the existing finalize transaction | ✓ |
| Backfill only for online orders | POS Availments stay without stage history | |
| You decide | Claude picks | |

**Q: Can a completed dine-in Availment's stages be edited afterward?**

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed at completed, no further changes | Matches Phase 9's immutable-Availment stance | ✓ |
| Staff can still progress/correct it | More flexible, conflicts with immutability precedent | |
| You decide | Claude picks | |

**Q: Does the staff "incoming orders" queue (FUL-01) include dine-in/POS Availments?**

| Option | Description | Selected |
|--------|-------------|----------|
| Online orders only in the queue | Dine-in already completed, nothing to process | ✓ |
| Unified view across all Availments | Single filterable endpoint for everything | |
| You decide | Claude picks | |

**User's choice:** Auto-fast-forward full stage history at finalize; extend Phase 9's finalize path; fixed/immutable after completion; online-orders-only queue.

---

## Customer Delivery Confirmation

**Q: How does "delivered" confirmation happen with no new frontend this milestone?**

| Option | Description | Selected |
|--------|-------------|----------|
| Staff marks it, customer confirms out-of-band | Call/text confirmation, staff marks delivered | ✓ |
| Token-based customer confirm endpoint | New no-login API endpoint | |
| You decide | Claude picks | |

**Q: If the customer never confirms, can staff force-complete?**

| Option | Description | Selected |
|--------|-------------|----------|
| Staff override to force-complete | Records it was staff-forced | ✓ |
| Stays open until customer responds | No override | |
| You decide | Claude picks | |

**Q: Does pickup need an equivalent customer-confirmation step?**

| Option | Description | Selected |
|--------|-------------|----------|
| Staff marks completed at handoff | In-person handoff, staff directly observes | ✓ |
| Customer confirms pickup too | Same requirement as delivery | |
| You decide | Claude picks | |

**User's choice:** Staff-mediated out-of-band confirmation; staff override for non-responsive customers; no separate confirmation step for pickup/dine-in (all recommended options).

---

## Exact Stage Names Per Mode

**Q: Pickup stage sequence?**

| Option | Description | Selected |
|--------|-------------|----------|
| placed → confirmed → preparing → ready → completed | Distinct "ready" stage for bagged/waiting orders | ✓ |
| placed → confirmed → preparing → completed | No distinct ready stage | |
| You decide | Claude picks | |

**Q: Delivery stage sequence?**

| Option | Description | Selected |
|--------|-------------|----------|
| placed → confirmed → preparing → out_for_delivery → completed | No separate "delivered" stage | ✓ |
| placed → confirmed → preparing → out_for_delivery → delivered → completed | Keeps delivered as distinct from completed | |
| You decide | Claude picks | |

**Q: Dine-in stage sequence?**

| Option | Description | Selected |
|--------|-------------|----------|
| placed → confirmed → preparing → ready → completed | Same names as pickup | ✓ |
| placed → confirmed → preparing → served → completed | Dine-in-specific "served" stage | |
| You decide | Claude picks | |

**Q: Shared enum across modes, or per-mode enums?**

| Option | Description | Selected |
|--------|-------------|----------|
| One shared enum, mode uses a subset | App logic enforces valid subset per mode | ✓ |
| Separate enum per fulfillment_mode | DB-level per-mode enum types | |
| You decide | Claude picks | |

**User's choice:** All recommended options — pickup/dine-in share `ready` naming, delivery uses `out_for_delivery`, no separate `delivered` stage, one shared enum.

---

## Claude's Discretion

- Exact staff-endpoint query/filter shape for retrieving incoming orders (FUL-01).
- Whether `AVAILMENT_STAGE_EVENT` needs a distinct `forced_by_staff_id`/`is_forced` flag vs. reusing the domain doc's existing free-form `reason` column for staff-forced completions (D-10).
- Staff permission level required to assign a courier (owner-only vs. any active membership).
- Exact migration/table naming for new courier-assignment and stage-event tables.

## Deferred Ideas

- Reusable, business-scoped Courier/DeliveryPartner entity.
- Token-based customer-facing delivery-confirmation endpoint (revisit once a frontend exists, v3 FE-01).
- Real-time, staff-driven manual dine-in stage progression (kitchen-display-style workflow).
- Real courier/delivery API integration (Grab, Lalamove) — already tracked as v3 FUL-04.
- Pending todo "Wrap compliance verification and state writes in one transaction" — reviewed, left as general backlog (not this phase's domain).
