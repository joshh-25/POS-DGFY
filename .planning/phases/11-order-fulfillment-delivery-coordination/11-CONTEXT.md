# Phase 11: Order Fulfillment & Delivery Coordination - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **staff-facing order fulfillment processing**: retrieving and progressing incoming online orders (from Phase 10's storefront checkout) through a shared core fulfillment pipeline (placed → confirmed → preparing → ready/out-for-delivery → completed), with pickup/delivery/dine-in-specific handoff steps, plus manual courier/delivery-partner assignment and payout tracking through to completion. Phase 9's POS-originated Availments also flow through the same stage-event lifecycle, auto-fast-forwarded at finalize rather than staff-progressed.

**Requirements in scope:** FUL-01, FUL-02, FUL-03.

**In scope:**
- Staff endpoint(s) to retrieve and process incoming online orders (pickup/delivery Availments in placed/confirmed/preparing stages).
- An append-only `AVAILMENT_STAGE_EVENT` log (per the domain spec's already-decided two-field shape: coarse `status` + mode-specific `fulfillment_stage`) with denormalized latest-stage columns on `Availment` as a read cache.
- Mode-specific stage sequences: pickup and dine-in share `placed → confirmed → preparing → ready → completed`; delivery is `placed → confirmed → preparing → out_for_delivery → completed`. One shared `fulfillment_stage` enum across all modes; application logic (not the DB) enforces which stages are valid per `fulfillment_mode`.
- Extending Phase 9's existing finalize transaction so every dine-in/POS Availment auto-writes the full stage-event sequence at finalize time (same data shape as an online order's history, just written all at once instead of staff-progressed).
- Manual courier assignment: free-text courier name/contact recorded per order (not a reusable Courier entity), in a dedicated assignment-history table (not columns on Availment), supporting reassignment without losing prior attempts.
- Courier payout tracking: `payout_amount` + `payout_status` (owed/paid) + `paid_at`, fully independent of Phase 8's Shift & Cash Drawer pay-outs.
- Customer delivery confirmation handled via staff marking `completed` after an out-of-band (call/text) customer confirmation — no new customer-facing API/frontend this phase. Staff has an explicit override to force-complete an order if the customer never responds.
- Pickup and dine-in have no separate customer-confirmation step; staff marks `completed` directly at the in-person handoff/counter, since staff directly observes it.

**Out of scope (belongs to other phases or explicitly deferred):**
- Real courier/delivery API integration (Grab, Lalamove, etc.) — deferred (v3, FUL-04); this phase is manual assignment only, matching legacy's own "outbound links" capability level of automation.
- A reusable, business-scoped Courier/DeliveryPartner entity — deferred; Phase 11 uses free-text per-order fields only (see Decisions).
- A token-based, customer-facing delivery-confirmation endpoint — deferred; no new frontend ships this milestone, and staff-mediated confirmation was chosen instead.
- Real-time, staff-driven manual stage progression for dine-in (e.g., a kitchen-display workflow where staff click through preparing → ready themselves) — the schema doesn't preclude it, but Phase 11 auto-fast-forwards dine-in stages at finalize rather than requiring staff clicks.
- Refunds/cancellations on any Availment — matches Phase 9/10's immutable-Availment stance; a completed dine-in Availment's stage history is fixed, no post-hoc editing.
- The general compliance-verification-transaction todo (`2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — reviewed and explicitly left as general backlog, not folded into this phase (see Deferred).

**Hard constraint — zero `backend/` writes (same as Phases 8-11):** No file under `backend/` may be edited. Legacy `backend/src/validators/settingsValidator.js` / `backend/src/modules/settings/repositories/settingsRepository.js` (the `storefront_delivery_partners` setting) are read-only pattern references only — and note they are NOT the same concept as this phase's per-order courier assignment (see Decisions/Specifics). Phase 9's finalize path under `apps/dgfy-api` may be extended (new module code, not legacy).

</domain>

<decisions>
## Implementation Decisions

### Courier & Payout Record Shape (User-Confirmed)

- **D-01:** **Free-text courier fields per order, not a reusable Courier entity.** Staff type a courier name + contact fresh on each assignment. No saved, business-scoped courier roster — matches how a <100-user base actually operates today (ad hoc riders), and nothing in the codebase or legacy precedent suggests a fixed roster exists. (Legacy's `storefront_delivery_partners` business setting — Grab/Foodpanda/Lalamove/custom link display — is a different concept: an advertised delivery-app link on the storefront page, not a per-order rider record. Do not conflate the two.)

- **D-02:** **Payout is tracked with a lifecycle, not just a number.** `payout_amount` + `payout_status` (`owed`/`paid`) + `paid_at`. Satisfies FUL-03's "track payout through to completion" wording — a bare amount field wouldn't.

- **D-03:** **Courier payout is independent of Phase 8's Shift & Cash Drawer pay-outs.** Couriers are often settled in batches (e.g., weekly) outside any single cashier's shift; forcing courier payout through shift pay-out reconciliation would misrepresent that. Fully separate bookkeeping.

- **D-04:** **Courier assignment lives in a dedicated table, not columns on Availment.** One row per assignment attempt (mirrors the domain spec's `AVAILMENT_STAGE_EVENT` append-only precedent) — supports reassignment (e.g., rider no-show) without silently overwriting/losing the prior assignment.

### POS/Dine-in Availments in the Pipeline (User-Confirmed)

- **D-05:** **Dine-in Availments get the FULL stage-event history, auto-fast-forwarded at finalize — not a single bare "completed" row.** At finalize, Phase 9's transaction writes the complete sequence (`placed → confirmed → preparing → ready → completed`) as real `AVAILMENT_STAGE_EVENT` rows all at once. This keeps the stage-event data shape identical between POS and online-order Availments (satisfying the roadmap's "flows through the same stage-event lifecycle" for Phase 9), while not requiring staff to manually click through stages for a counter sale today. It also means a future phase could add real-time kitchen-style manual progression for dine-in without any schema change — the pipeline already supports it, this phase just chooses to auto-complete it.

- **D-06:** **Phase 9's existing finalize transaction is extended, not left untouched.** The stage-event write happens inside the existing `sequelize.transaction()` in `apps/dgfy-api/src/modules/availments` finalize path (09-CONTEXT.md: single-transaction finalize discipline). This is same-milestone `apps/dgfy-api` code, not legacy `backend/`, so the zero-touch constraint doesn't apply.

- **D-07:** **A completed dine-in Availment's stage history is fixed — no further stage changes after finalize.** Matches Phase 9's existing immutable-Availment stance (09-CONTEXT.md D-01: finalized Availments are immutable, no cancel/refund workflow). The auto-written stage sequence is the end of that Availment's fulfillment story.

- **D-08:** **The staff "incoming orders to process" queue (FUL-01) is scoped to online orders only** (pickup/delivery Availments actively in placed/confirmed/preparing) — not a unified view including already-completed dine-in/POS Availments, since a dine-in sale has nothing left to "process" the instant it exists.

### Customer Delivery Confirmation (User-Confirmed)

- **D-09:** **Staff marks "delivered"/"completed" themselves, based on an out-of-band customer confirmation (call/text), not a customer-facing API endpoint.** No new frontend ships this milestone; building a token-based confirm-delivery endpoint with nothing to call it from was judged not worth the new surface area. Matches how legacy actually works today (no delivery-confirmation UI exists there either).

- **D-10:** **Staff has an explicit override to force-complete an order if the customer never confirms** (goes silent/unreachable). The stage-event log records that it was staff-forced rather than customer-confirmed, so an order never gets permanently stuck in `out_for_delivery`.

- **D-11:** **Pickup and dine-in need no equivalent customer-confirmation step.** Both have an in-person handoff staff directly observes at the counter — unlike delivery, where staff can't see the handoff happen. Staff marks `completed` directly at handoff for both modes.

### Exact Stage Names Per Mode (User-Confirmed)

- **D-12:** **Pickup:** `placed → confirmed → preparing → ready → completed`. `ready` = bagged/waiting at the counter; `completed` fires at customer pickup/handoff.

- **D-13:** **Delivery:** `placed → confirmed → preparing → out_for_delivery → completed`. No separate `delivered` stage before `completed` — avoids two stage names meaning the same terminal state; `completed` is what staff marks after the customer's out-of-band confirmation (D-09) or a forced override (D-10).

- **D-14:** **Dine-in:** same stage names as pickup — `placed → confirmed → preparing → ready → completed` (auto-fast-forwarded per D-05). No separate `served`/`on_site`-style stage name; dine-in is structurally treated as closest to pickup (in-person handoff at the business).

- **D-15:** **`fulfillment_stage` is one shared enum/string across all modes, not a separate enum type per `fulfillment_mode`.** Matches the domain spec's explicit guidance that the valid-sequence-per-mode lives in application logic, not the database schema (`refactor-do-not-commit/DGFY_Domain_02_Product.md` line 234). Application logic enforces which stages are valid for which `fulfillment_mode`; the DB column itself doesn't need per-mode constraint enforcement.

### Carrying Forward from the Domain Spec (Not Re-Discussed — Already Decided)

- **Two-field fulfillment status shape** — coarse `status` + mode-specific `fulfillment_stage`, backed by an append-only `AVAILMENT_STAGE_EVENT` table, with `status`/`fulfillment_stage` denormalized onto `Availment` as a "latest" read cache (source of truth is the event table; if they ever disagree, the event table wins). This was the exact open question STATE.md flagged for Phase 11 planning ("fulfillment status shape, two-field event-sourced vs. single-field state machine") — the domain spec already resolved it in favor of the two-field/event-sourced approach (`DGFY_Domain_02_Product.md` §9, §10.1 point 7). Not up for debate in this phase.
- **`fulfillment_mode` and `fulfillment_stage` are fixed enums, not open strings** (`DGFY_Domain_02_Product.md` §10.1 point 4).
- **Delivery/on-site traveler is external to DGFY, not a Staff Account** — the vendor arranges the courier themselves outside DGFY (`DGFY_Domain_02_Product.md` §10.1 point 6). This phase's D-01 (free-text courier fields, no reusable entity) is consistent with that stance.

### Claude's Discretion

- Exact staff-endpoint query/filter shape for retrieving incoming orders (FUL-01) — by status, branch, fulfillment_mode, etc. — planner/research's call.
- Whether the `AVAILMENT_STAGE_EVENT` table needs a `forced_by_staff_id` / `is_forced` flag (or similar) to record D-10's override distinctly from a normal transition, versus just a free-form `reason` column doing double duty — planner's call, following the domain doc's existing `reason` column precedent (§9).
- Whether courier assignment requires a minimum staff permission level (owner-only vs. any active staff) — planner's call, following Phase 8/9's existing membership-gating precedents (e.g., inventory manual movements gate on any active membership, not owner-only).
- Exact migration/table naming for the new courier-assignment and stage-event tables — planner's call, following existing `dgfy_business_*` naming conventions.

### Folded Todos

None. The one keyword-matched pending todo (`2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`, score 0.9) was reviewed and explicitly left as general backlog rather than folded — see Deferred.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` §"Phase 11: Order Fulfillment & Delivery Coordination" — goal, success criteria (FUL-01 through FUL-03), Phase 9/10 dependencies.
- `.planning/REQUIREMENTS.md` — FUL-01 through FUL-03; v2.0 milestone scope; Out-of-Scope list (notably excludes real courier/delivery API integration — FUL-04, v3).
- `.planning/PROJECT.md` — "v2.0 Commerce Domain zero-touch (Phases 8-11): No writes/edits/migrations to any file under `backend/`".
- `.planning/STATE.md` — flagged "fulfillment status shape, two-field event-sourced vs. single-field state machine (resolve during Phase 11 planning)" as an open concern; resolved by the domain spec (see Decisions, Carrying Forward) rather than re-discussed here.

### Domain Specification (CRITICAL — this phase's schema authority)
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §9 — `AVAILMENT`, `AVAILMENT_ITEM`, `AVAILMENT_STAGE_EVENT` entity definitions; `fulfillment_mode`/`fulfillment_stage` field explanation; "each fulfillment stage change is itself a recorded event" append-only principle.
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §10.1 "Decided So Far" — point 4 (fixed enums), point 6 (delivery/on-site traveler is external, manual, customer-confirms), point 7 (two-field fulfillment status shape confirmed).
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` line 234 — `fulfillment_stage` valid-sequence-per-mode lives in application logic, not a DB-level enum/lookup table (informs D-15).

### Phase 9/10 Context (CRITICAL)
- `.planning/phases/09-pos-checkout-payment/09-CONTEXT.md` — D-01 (immutable Availment, no refund/cancel workflow — informs D-07); single-transaction finalize discipline (informs D-06's extension point).
- `.planning/phases/10-storefront-discovery-online-ordering/10-CONTEXT.md` — D-11 (fulfillment_mode = pickup/delivery captured at order placement); Deferred Ideas list already excludes Order Fulfillment from Phase 10's scope.

### Existing Code (Current State — Read Before Planning)
- `apps/dgfy-api/src/models/Tenant/Availment.js` — current `status` enum is `draft`/`finalized`/`voided` (Phase 9's checkout lifecycle) — **not** the fulfillment pipeline status. No `fulfillment_mode`/`fulfillment_stage` columns exist yet; this phase must add them (plus the stage-event table).
- `apps/dgfy-api/src/models/Landlord/StorefrontOrder.js` — `fulfillment_mode` (pickup/delivery) and `fulfillment_timing` (immediate/scheduled) already captured landlord-side at order placement (Phase 10).
- `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js` (line ~140) — already passes `fulfillmentMode: order.fulfillment_mode` into `finalizeStorefrontOrder(...)`, but nothing currently persists it anywhere on the tenant `Availment` — a concrete existing gap this phase must close.
- `apps/dgfy-api/src/modules/availments` — Phase 9's finalize usecase/transaction to extend per D-06.
- Legacy `backend/src/validators/settingsValidator.js` and `backend/src/modules/settings/repositories/settingsRepository.js` — `storefront_delivery_partners` setting (Grab/Foodpanda/Lalamove/custom link display). **Read-only reference only, and explicitly NOT the same concept as this phase's per-order courier assignment** — do not port this as the courier data model.

### Architecture Governance & Ownership Boundaries
- `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — `routes → controllers → usecases → repositories → models` layering.
- ADR `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — single-writer/ownership boundary precedent (relevant if courier/stage-event writes need to respect existing module boundaries).
- ADR `docs/architecture/adr/0003-migration-facade-strategy.md` — Strangler Fig, no-legacy-mutation constraint.

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STACK.md` — module and coding conventions (note: these maps predate the Commerce Domain phases and don't yet reflect fulfillment/courier concepts — treat as general convention reference only, not phase-specific).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/dgfy-api/src/modules/availments`** (Phase 9) — the finalize transaction this phase extends (D-06) to write dine-in stage events.
- **Phase 8's inventory manual-movements gating precedent** (`apps/dgfy-api/src/modules/inventory`) — any-active-membership (not owner-only) authorization pattern, a plausible analog for who can assign a courier or progress a stage.
- **Phase 8's Shift pay-out concept** (`apps/dgfy-api/src/modules/shifts`) — an existing "pay-out" concept in the codebase, explicitly NOT reused for courier payout (D-03) but worth knowing it exists so the two aren't confused during implementation.

### Established Patterns
- **Append-only event-log pattern** — already established for `InventoryMovement` (Phase 8, ADR 0029 single-writer contract) and now `AVAILMENT_STAGE_EVENT` (domain spec §9); courier assignment (D-04) follows the same append-only-history shape rather than a mutable "current state" column.
- **Single-transaction finalize discipline** (Phase 9) — the pattern D-06 extends rather than replaces.

### Integration Points
- New courier-assignment and stage-event tables/migrations live under `apps/dgfy-api` (new module code), following existing `dgfy_business_*` tenant-schema conventions from Phases 8-10.
- Stage-event writes at dine-in finalize hook into Phase 9's existing `apps/dgfy-api/src/modules/availments` finalize transaction (D-06).
- Stage-event writes at online-order finalize hook into Phase 10's `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js` → `finalizeStorefrontOrder(...)` path, where `fulfillmentMode` is already threaded through but currently unused/unpersisted.

</code_context>

<specifics>
## Specific Ideas and Rationale

### Why Auto-Fast-Forward Dine-in Stages Instead of a Single "Completed" Event (D-05)?

The user's own words: dine-in should look "as if straight to completed, but underneath, is already passing through stages" — because a future phase may need kitchen staff to actually accept and progress food orders through real prep stages. Writing the full stage-event sequence now (rather than one bare `completed` row) means that future capability is a workflow/UI change, not a schema migration — the event log already has the right shape for every Availment, POS or online.

### Why Courier Data Is Free-Text, Not a Reusable Entity (D-01)?

The user confirmed the recommended, leaner option here rather than pushing for a saved courier roster. Combined with legacy's actual "outbound links" precedent (a business-level display of which delivery apps it uses, not a per-rider record), there's no existing signal that DGFY vendors manage a fixed courier roster today — free-text per order matches current reality without inventing structure ahead of need.

### Why No Customer-Facing Confirmation Endpoint (D-09)?

The user chose staff-mediated, out-of-band confirmation over building a token-based customer endpoint. Since no new frontend ships this milestone (backend-API only, same as every phase in this Commerce Domain cycle), a customer-facing endpoint would have nothing to call it — building it now would be speculative API surface with no consumer.

</specifics>

<deferred>
## Deferred Ideas

- **Reusable, business-scoped Courier/DeliveryPartner entity** — deferred per D-01; revisit if a vendor's courier roster stabilizes enough to be worth saving/reusing across orders.
- **Token-based customer-facing delivery-confirmation endpoint** — deferred per D-09; revisit once a customer-facing frontend surface actually exists (v3, FE-01) to call it.
- **Real-time, staff-driven manual dine-in stage progression** (e.g., a kitchen-display workflow) — the schema (D-05) doesn't preclude this, but building the actual staff-progression UI/workflow is left for a future phase if/when kitchen-tracking becomes a real operational need.
- **Real courier/delivery API integration** (Grab, Lalamove, etc.) — already tracked as v3 FUL-04; reconfirmed out of scope here.

### Reviewed Todos (not folded)

- **"Wrap compliance verification and state writes in one transaction"** (`.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — a Phase 8 compliance-module write-race bug (`apps/dgfy-api/src/modules/compliance`), unrelated to fulfillment/delivery domain. Scored as a 0.9 keyword match (compliance/dgfy/api terms) but explicitly reviewed and left as general backlog rather than folded — same disposition as when it was flagged as a likely false-positive during Phase 10's discussion. Still required before the milestone ships, per STATE.md's Pending Todos, but not this phase's work.

</deferred>

---

*Phase: 11-Order Fulfillment & Delivery Coordination*
*Context gathered: 2026-07-13*
