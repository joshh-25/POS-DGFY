# Phase 8: Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **the Commerce Domain's foundation layer**: everything downstream Checkout (Phase 9) and Storefront (Phase 10) will depend on, built once so it doesn't get retrofitted.

- **Product Catalog** — Food/Service/Retail category on the Product (not the Store), folders/grouping, Basic Inventory (vendor-set stock) vs. non-stock per Product, and an append-only Inventory Movement ledger. Genuinely new `dgfy_business_*` tables — never a foreign key into legacy `items`/`PosTransactionLine`.
- **Booking** — a Service Product marked bookable with a slot duration and branch-level concurrent capacity; a Booking blocks once capacity is reached; a fulfilled Booking links to the Availment that completes it.
- **Shift & Cash Drawer** — open/close shift per cashier+terminal (DB-enforced one-open-shift invariant), cash-drawer event logging, close-time Expected-vs-Actual reconciliation.
- **Fiscal/Compliance** — a tenant/branch-level compliance-mode state plus a single shared gate-port contract that Checkout, Shift-open, and receipt issuance will all call in Phase 9. **This phase builds the state and the port; Phase 9 wires the port into its own call sites.**

Requirements in scope: **PRD-01 through PRD-05, BOK-01 through BOK-03, SFT-01 through SFT-03, FSC-01, FSC-02**. FSC-03 (SC/PWD discount math) is explicitly Phase 9's scope, not this phase's.

**Out of scope (belongs to other phases):**
- POS Checkout & Payment itself (Availment, discounts, payment methods, receipts) — Phase 9.
- Wiring the compliance gate port into any actual call site — Phase 9 (this phase only builds the port contract + state).
- Storefront browse/cart/checkout — Phase 10.
- Order Fulfillment — Phase 11.
- New frontend apps — deferred milestone-wide.

</domain>

<decisions>
## Implementation Decisions

### Compliance-Mode State — Scope and Depth

- **D-01:** **Tenant-scoped.** `ComplianceModeState` lives in `dgfy_business_*`, not `dgfy_core`. It gates tenant-local operations (checkout, shift, receipts) directly in the same database as what it gates — no landlord round-trip on every gate check. Resolves the open research question in `ARCHITECTURE.md` "Open Decisions" #3.

- **D-02:** **Full port of legacy's 3-state model.** Reuse `non_compliant_active` / `compliant_pending` / `compliant_active` (legacy `COMPLIANCE_MODE_STATE` in `backend/src/modules/compliance/policy/complianceConstants.js`) rather than inventing new state names — it's proven and already shaped correctly for this domain.

- **D-03:** **Full BIR/NPC/BSP policy-pack depth**, ported as-is from `backend/src/modules/compliance/policy/policyPacks.js` (versioned packs; required settings keys, profile fields, and artifacts per regulator; peripheral-class and readiness-test checks). Not narrowed to BIR-only — narrowing now just means re-adding fields later.

- **D-04:** **State transitions are manual for now, automatic later.** An authorized staff/owner submits verification evidence; a platform/tenant admin reviews and transitions state (matches legacy's `COMPLIANCE_VERIFIER_ACTOR_TYPE`: `tenant_master_admin` / `platform_admin`). Automating the transition based on profile completeness is an explicitly acknowledged future enhancement, not built in this phase — build the manual review path in a way that doesn't block adding automation later, but don't build the automation now.

### Compliance-Mode Gate — Major Architectural Deviation from Legacy (user-confirmed)

- **D-05: This is the most important decision in this phase — read it before touching `modules/compliance`.**

  Legacy's `compliancePolicyEngine.js` (`evaluateComplianceDecision`, lines ~903-918) **forces `compliant_active` businesses into Fiscal-only** — it explicitly **denies** any non-fiscal (`requested_document_context !== 'fiscal'`) request once a business is fully activated, with reason code `DOCUMENT_CONTEXT_NOT_ALLOWED`.

  **This is wrong for the new architecture and must NOT be ported.** The real-world requirement, confirmed directly by the user:

  > A formal/BIR-registered business runs **two app builds side by side** — an "Omni" build (fiscal mode off) and a "Fiscal" build (fiscal mode on), same backend, same API, just different feature exposure. The business defaults to Omni for every sale. Only when a customer explicitly asks for an Official Receipt does staff switch to the Fiscal build for that transaction. An unregistered/informal business can use Omni freely but is blocked from Fiscal entirely.

  So `compliant_active` must mean **"Fiscal is now available to choose,"** not **"Fiscal is now mandatory."** The fix, scoped narrowly against legacy's existing shape:

  - `non_compliant_active` — Fiscal requests **denied** (`NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED`), non-fiscal always **allowed**. *(unchanged from legacy — already correct)*
  - `compliant_pending` — Fiscal requests get `REQUIRES_SETUP` (`COMPLIANT_ACTIVATION_PENDING`), non-fiscal always **allowed**. *(unchanged from legacy — already correct)*
  - `compliant_active` — **both** `fiscal` and `non_fiscal` requested-document-context values are **allowed**; do NOT deny non-fiscal requests once active. *(this is the deviation — legacy denies non-fiscal here; the new gate must not)*

  The per-request `requested_document_context: 'fiscal' | 'non_fiscal' | 'training_test'` parameter shape (legacy's `context.requested_document_context`) already matches the "two builds, same backend" model exactly — port that mechanism as-is. The client (which app build is running) decides what value to send; the backend's only job is eligibility gating by compliance state, not forcing a mode.

  This changes the shape of the gate port itself: `assertComplianceGate({ businessId, operation, requestedDocumentContext })` (naming is planner's call) must accept and honor `requestedDocumentContext` as a first-class input, not just an `operation` enum.

### Inventory Ledger — Write Surfaces for Phase 8

- **D-06:** **Manual movements + reserved (unwired) sale/booking effect-type stubs.** Phase 8 ships owner/staff-facing endpoints to record `restock`, `loss`, and `adjustment` movements — each an append-only `InventoryMovement` row (single-writer, per ADR 0029: only `modules/inventory` writes these rows; other modules request effects through it, never write directly). Additionally, define the `sale`/`booking` effect-type contracts now (the shape of the request `modules/availment` and `modules/booking` will eventually call), even though nothing calls them yet — so Phase 9/Booking-fulfillment plug into an existing shape instead of extending the ledger's contract later.

- **D-07:** **`stock_effect_type` is NOT a Phase 8 concern.** Product only tracks `inventory_mode` (`basic_inventory` vs. `non_stock`) in this phase. The per-sale-line `stock_effect_type` field (PRD-02: decided per sale line, not fixed on the Product) lives on `AvailmentItem`, built in Phase 9. Do not add a `stock_effect_type` default to Product now.

### Booking Lifecycle

- **D-08:** **Create + cancel, no reschedule.** BOK-02 only requires blocking once branch capacity is full, but Phase 8 also ships cancel — releasing the branch-level capacity slot back atomically, using the same guarded increment/decrement pattern as inventory's atomic-guard (per `PITFALLS.md`'s guidance for the identical race shape). No reschedule action; canceling and creating a new Booking covers that need.

- **D-09:** **Cancel authorization: staff/owner AND the booking's own consumer account.** Either side can cancel; no reason required in this phase. Note: no consumer-facing Storefront UI exists until Phase 10 — Phase 8 builds the authorization check (consumer-account-owns-booking) at the usecase/API level using the already-built Accounts API (Phase 4), even though the actual customer-facing entry point for real consumers doesn't ship until Phase 10.

### Shift & Cash Drawer — Event Scope for Phase 8

- **D-10:** **Open/close + no-sale pop only — no pay-in/pay-out event types yet.** Sales and refunds don't exist until Phase 9's Checkout, so SFT-02's full "Expected cash from sales/refunds/pay-ins/pay-outs" formula can't be fully realized this phase. Phase 8 ships shift open (with declared starting cash float), shift close, and no-sale drawer-pop logging as its own event type. `Expected cash = starting float` until Phase 9 wires in sales/refunds as additional inputs to the same formula — this is a scope cut, not a redesign; the reconciliation formula's shape should already anticipate the additional inputs Phase 9 will add, not require restructuring.

- **D-11:** **Stale shifts: flag only, never auto-close.** A shift open longer than some threshold (exact value is planner's call) is flagged/visible as stale in status/reporting, but nothing force-closes it — matches `PITFALLS.md`'s explicit guidance that auto-closing risks silently losing real open-shift state.

- **D-12:** **One open shift per cashier+terminal, DB-level enforced** (SFT-01, already locked by requirements) — via the MySQL `GENERATED ALWAYS AS (...) STORED` + `UNIQUE INDEX` pattern documented in `STACK.md`, following the exact precedent in `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs`.

### Claude's Discretion

- Exact new command/endpoint names for compliance state transitions, inventory manual-movement recording, booking cancel, and shift open/close/pay-events — planner's call, following the existing `routes → controllers → usecases → repositories → models` module shape from `modules/accounts`/`modules/businesses`.
- Exact field names for the gate port (`assertComplianceGate` vs. another name) and its parameter shape beyond the mandatory `requestedDocumentContext` input (D-05) — planner's call.
- Exact stale-shift threshold value (D-11) — an operator-configurable parameter, not a value to hardcode; planner's call on where/how it's configured (mirrors Phase 7's precedent of configurable-not-hardcoded operational thresholds).
- Exact shape of the reserved sale/booking `InventoryMovement` effect-type contracts (D-06) — planner's call, provided `modules/inventory` stays the single writer per ADR 0029 and the contract is genuinely reusable by Phase 9/Booking without redesign.
- Folder structure for Product grouping (PRD-03) — not discussed in depth. Legacy precedent (`backend/src/models/ItemFolder.js`) is a flat, business-scoped folder model with no nesting; default to porting that shape unless planner finds a concrete reason not to.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` §"Phase 8" — goal, success criteria (SC1-SC5), dependency on Phase 6, requirement list.
- `.planning/REQUIREMENTS.md` — PRD-01 through PRD-05, BOK-01 through BOK-03, SFT-01 through SFT-03, FSC-01, FSC-02 (this phase); FSC-03 and CHK-* (Phase 9) show what this phase's gate port and Product model must support without building.
- `.planning/PROJECT.md` — milestone scope, "No legacy edits except approved seams," compliance-mode-scope open decision noted in Key Decisions/Blockers.
- `.planning/STATE.md` — session history, the explicit open-decision flag on compliance-mode scope (now resolved by D-01).

### Research (HIGH confidence, read before planning)
- `.planning/research/SUMMARY.md` — full milestone research summary; Phase 8 corresponds to the research's suggested Phases 1, 2, 3, 4 (compressed into one "coarse" phase per the roadmap decision log).
- `.planning/research/ARCHITECTURE.md` — module boundaries (`modules/products`, `modules/inventory`, `modules/booking`, `modules/shifts`, `modules/compliance`), the ADR-0029 single-writer contract, and "Open Decisions" #3 (compliance-mode scope — resolved by D-01 above).
- `.planning/research/PITFALLS.md` — Pitfall 3 (stock/booking-capacity double-decrement — atomic guarded UPDATE), Pitfall 4 (checkout-with-no-shift, stale-shift flag-don't-auto-close guidance — D-11), Pitfall 5 (compliance gate over/under-gating — directly relevant to D-05's fix).
- `.planning/research/STACK.md` — MySQL generated-column unique-index pattern (D-12), `BEFORE UPDATE`/`BEFORE DELETE` trigger pattern for append-only ledger enforcement.
- `.planning/research/FEATURES.md` — Booking's "branch-level capacity without staff calendars" MVP-cut rationale; unified Product model rationale.

### Compliance Domain — Legacy Precedent (D-01 through D-05 all trace here)
- `backend/src/modules/compliance/policy/compliancePolicyEngine.js` — the full decision engine; **lines ~903-918 contain the `compliant_active` fiscal-forcing logic that must NOT be ported (D-05)**.
- `backend/src/modules/compliance/policy/policyPacks.js` — versioned BIR/NPC/BSP policy-pack structure to port in full (D-03).
- `backend/src/modules/compliance/policy/complianceConstants.js` — `COMPLIANCE_MODE_STATE`, `COMPLIANCE_DECISION`, `COMPLIANCE_OPERATION`, `COMPLIANCE_REASON_CODE`, `COMPLIANCE_VERIFICATION_STATUS`, `COMPLIANCE_VERIFIER_ACTOR_TYPE` — the full enum set this phase's schema and gate port are built from.
- `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs` — proven MySQL trigger pattern for append-only compliance audit rows (relevant precedent for the Inventory Movement ledger too).

### Product / Inventory Domain
- ADR `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — the single-writer rule ("POS and Storefront may request stock effects. Only Inventory records stock effects.") — this phase's internal contract for `modules/inventory` (D-06).
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §9-10 — target ER shape for Product/Inventory/Booking.
- `refactor-do-not-commit/DGFY_Plan_vs_Reality_Reconciliation.md` §1-6 — plan-vs-reality gap findings informing this phase's scope cuts.
- `backend/src/models/StockMovement.js`, `backend/src/models/ItemFolder.js` — legacy precedent for the Inventory Movement ledger shape and folder grouping (D-06, folder default under Claude's Discretion).
- `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs` — the generated-column unique-index pattern this phase's shift constraint (D-12) follows exactly.
- `backend/src/models/PosTerminalShift.js` — legacy shift field shapes / reconciliation model precedent.

### Architecture Governance
- `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — `routes → controllers → usecases → repositories → models` layering this phase's new modules (`modules/products`, `modules/inventory`, `modules/booking`, `modules/shifts`, `modules/compliance`) must follow.
- `docs/architecture/adr/0003-migration-facade-strategy.md` — Strangler Fig / no-legacy-mutation constraint; this phase's new tables are genuinely new `dgfy_business_*` tables per PRD-05.

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — general conventions for any new module this phase adds.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`backend/src/modules/compliance/policy/*`** — the entire compliance policy engine, policy packs, and constants are directly portable (D-02, D-03) with one deliberate behavior change (D-05).
- **`backend/src/models/StockMovement.js`, `ItemFolder.js`** — proven shapes for the Inventory Movement ledger and Product folder grouping.
- **`backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs`** — copy-paste-adaptable generated-column + unique-index migration pattern for SFT-01's DB-level constraint.
- **`backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs`** — trigger pattern for append-only enforcement, reusable for `InventoryMovement`.
- **`apps/dgfy-api/src/modules/accounts`, `modules/businesses`** — the existing per-module folder shape (routes/controllers/usecases/repositories/models) that `modules/products`, `modules/inventory`, `modules/booking`, `modules/shifts`, `modules/compliance` mirror exactly.

### Established Patterns
- **Single-writer contract (ADR 0029)** — only `modules/inventory` writes `InventoryMovement` rows; only `modules/availment` (Phase 9) will write `AVAILMENT_STAGE_EVENT` rows. This phase must set up `modules/inventory` as that sole writer from day one (D-06).
- **Atomic guarded UPDATE, never read-then-write** — the concurrency pattern for both stock decrements and booking-capacity decrements (`PITFALLS.md` Pitfall 3); applies identically to Booking cancel's capacity release (D-08).
- **Gate port called from inside usecase bodies, never middleware** — per research's Pattern 1; this phase builds the port, Phase 9 is the first real caller.

### Integration Points
- `modules/compliance`'s gate port is the hand-off contract Phase 9 depends on — its exact shape (especially `requestedDocumentContext`, per D-05) must be stable and documented before Phase 9 planning starts.
- `modules/inventory`'s reserved sale/booking effect-type stubs (D-06) are the hand-off contract Phase 9 (`modules/availment`) and this-phase's own `modules/booking` fulfillment path will call into.
- Booking's `customer_account_id` resolves against `apps/dgfy-api/src/models/Landlord/Account.js` (`dgfy_core.accounts`, via `modules/accounts`) — NOT the legacy-proxy `dgfyAuth`/`DgfyAccount` model, per `ARCHITECTURE.md`.

</code_context>

<specifics>
## Specific Ideas

- **The compliance Fiscal/Omni model, in the user's own words:** "As a formal business, if a customer requests for Official Receipt, I will issue formal receipt, therefore, use the Fiscal POS. If a customer does not explicitly ask for Official Receipt, I will issue an informal receipt, therefore, use the Omni POS. As much as possible, I'll utilize the Omni POS unless a customer explicitly asks for receipts... a formal business can switch into Fiscal POS and Omni POS on the fly by opening the apps side by side if necessary. An informal business without BIR registration can use the Omni but cannot use the Fiscal." This is the authoritative framing for D-05 — treat it as the spec for `compliant_active` behavior, overriding legacy's actual (wrong, for this architecture) enforced-fiscal behavior.
- Fiscal vs. Omni is a **build-level** distinction on the client side (two app builds/deployments, same backend, same API surface) — the backend does not need to model "which app is calling," only honor the `requestedDocumentContext` value each call sends.

</specifics>

<deferred>
## Deferred Ideas

- **Automatic compliance-mode state transitions** (based on profile completeness, no human review step) — explicitly acknowledged as a future direction by the user but not built in this phase (D-04). Not a rejected idea — just sequenced later.
- **Booking reschedule as a distinct action** — considered and covered by "cancel + create new" instead (D-08); not a separate feature this phase builds.
- **Pay-in/pay-out cash-drawer event types** — deferred to Phase 9, when sales/refunds give the Expected-cash formula something real to reconcile against (D-10).
- **Consumer-facing Storefront UI for Booking cancel** — the authorization model is built now (D-09) but the actual customer-facing entry point ships with Phase 10.

None beyond the above — discussion stayed within phase scope; the one significant expansion (D-05's Fiscal/Omni fix) is a correction to a previously-assumed legacy port, not new scope.

</deferred>

---

*Phase: 8-Commerce Foundation — Product Catalog, Booking, Shift & Cash Drawer, Compliance Gating*
*Context gathered: 2026-07-12*
