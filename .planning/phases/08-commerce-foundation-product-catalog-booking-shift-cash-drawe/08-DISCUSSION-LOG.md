# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 8-Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating
**Areas discussed:** Compliance-mode state scope, Inventory ledger write surfaces, Booking lifecycle scope, Shift & cash-drawer event scope

---

## Compliance-Mode State Scope

| Question | Option | Description | Selected |
|---|--------|-------------|----------|
| Where should ComplianceModeState live? | Tenant-scoped | dgfy_business_*, same DB as what it gates | ✓ |
| | Landlord-scoped | dgfy_core.businesses, co-located with future billing state | |
| | You decide | | |
| How much of legacy's compliance model should be ported? | Full port | 3-state model + policyPacks structure as-is | ✓ |
| | State only | Stub policy-pack evaluation, defer BIR/NPC/BSP granularity | |
| | You decide | | |
| Who transitions compliance-mode state? | Manual operator/admin action | tenant_master_admin/platform_admin reviews evidence | ✓ (manual now) |
| | Automatic based on profile completeness | | (future — not this phase) |
| | You decide | | |
| Policy-pack depth? | Full BIR/NPC/BSP pack | Port whole policyPacks.js structure | ✓ |
| | BIR fields only | Defer NPC/BSP to later phase | |
| | You decide | | |

**User's choice:** Tenant-scoped state; full legacy port (3-state model + full BIR/NPC/BSP policy packs); manual state transitions now, automatic transitions acknowledged as a future direction but not built this phase.

**Notes — major mid-discussion correction (this is the most consequential finding of the whole discussion):**

The user interrupted the third question ("who transitions compliance state") to flag that fiscal compliance isn't a simple on/off switch, describing a real operating model: a formal/BIR-registered business runs two app builds side by side (Omni = fiscal mode off, Fiscal = fiscal mode on, same backend), defaults to Omni for every sale, and only switches to Fiscal when a customer explicitly requests an Official Receipt. An unregistered/informal business can use Omni but is blocked from Fiscal entirely.

Investigating the actual legacy decision logic (`backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `evaluateComplianceDecision`, ~lines 903-918) revealed that legacy's `compliant_active` state **forces Fiscal-only** — it denies any non-fiscal request once a business is fully activated. This directly contradicts the user's described requirement (a formal business must be able to freely choose Fiscal or Omni per transaction).

The user confirmed this discrepancy is real and wants it fixed as "a major directional change... a good thing to include in the new architecture": `compliant_active` should mean "Fiscal is now available to choose," not "Fiscal is now mandatory." `non_compliant_active` and `compliant_pending` keep blocking Fiscal exactly as legacy already does (those two states were already correct). This is captured as **D-05** in CONTEXT.md and is the single most important decision from this discussion — it changes the gate port's contract shape (must accept `requestedDocumentContext` as first-class input) and deliberately diverges from a "full port" of legacy in one specific, narrow place.

---

## Inventory Ledger Write Surfaces

| Question | Option | Description | Selected |
|---|--------|-------------|----------|
| What writes InventoryMovement rows in Phase 8 (Checkout doesn't exist until Phase 9)? | Manual movements only | restock/loss/adjustment endpoints only | |
| | Manual movements + reserved sale/booking effect stubs | Same, plus define (unwired) sale/booking movement-type contracts now | ✓ |
| | You decide | | |
| Does stock_effect_type need to exist on Product in Phase 8? | Product only tracks inventory_mode | basic_inventory vs non_stock; stock_effect_type lives on AvailmentItem (Phase 9) | ✓ |
| | Model stock_effect_type now as a Product default | | |
| | You decide | | |

**User's choice:** Manual movement endpoints (restock/loss/adjustment) plus reserved, unwired sale/booking effect-type contracts defined now so Phase 9/Booking don't need to extend the ledger's shape later. Product model stays minimal — only `inventory_mode`, no `stock_effect_type`.

**Notes:** None beyond the selections above.

---

## Booking Lifecycle Scope

| Question | Option | Description | Selected |
|---|--------|-------------|----------|
| Is cancel in scope for Phase 8? | Create + cancel | Cancel releases branch-level capacity slot atomically | ✓ |
| | Create-only | Cancel/release deferred to a later phase | |
| | You decide | | |
| Who can cancel, and does it need a reason? | Staff/owner + the booking's own consumer account | Either side can cancel; no reason required | ✓ |
| | Staff/owner only | Consumer self-cancel deferred to Phase 10 | |
| | You decide | | |

**User's choice:** Create + cancel (no reschedule) in Phase 8; both staff/owner and the booking's own consumer account can cancel, no reason required.

**Notes:** No consumer-facing Storefront UI exists until Phase 10 — the authorization model (consumer-account-owns-booking) is built at the usecase/API level now, using the already-built Accounts API, even though the real customer-facing entry point ships later.

---

## Shift & Cash-Drawer Event Scope

| Question | Option | Description | Selected |
|---|--------|-------------|----------|
| What ships in Phase 8 given sales/refunds don't exist until Phase 9? | Open/close + pay-in/pay-out + no-sale pop | Full manual event set now | |
| | Open/close + no-sale pop only | No pay-in/pay-out yet; Expected cash = starting float until Phase 9 | ✓ |
| | You decide | | |
| Can a shift span multiple days / stale-shift handling? | Flag only, no auto-close | Flagged as stale in status/reporting, never force-closed | ✓ |
| | No staleness handling in Phase 8 | | |
| | You decide | | |

**User's choice:** Open/close + no-sale pop only (pay-in/pay-out deferred to Phase 9). Stale shifts are flagged, never auto-closed.

**Notes:** None beyond the selections above.

---

## Claude's Discretion

- Exact endpoint/command names across all new modules (compliance transitions, inventory manual movements, booking cancel, shift open/close/no-sale-pop) — follow the existing `modules/accounts`/`modules/businesses` folder shape.
- Exact gate-port method/field naming beyond the mandatory `requestedDocumentContext` input.
- Exact stale-shift threshold value and its configuration mechanism.
- Exact shape of the reserved sale/booking `InventoryMovement` effect-type contracts, provided `modules/inventory` stays the single writer (ADR 0029).
- Product folder structure (PRD-03) — not discussed in depth; default to legacy's flat, business-scoped `ItemFolder` shape unless planning finds a concrete reason otherwise.

## Deferred Ideas

- Automatic compliance-mode state transitions (based on profile completeness, no human review) — acknowledged as a future direction, not built this phase.
- Booking reschedule as a distinct action — covered by cancel + create-new instead.
- Pay-in/pay-out cash-drawer event types — deferred to Phase 9 alongside sales/refunds.
- Consumer-facing Storefront UI for Booking cancel — authorization model built now, UI entry point ships with Phase 10.
