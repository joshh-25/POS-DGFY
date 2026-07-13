# Phase 9: POS Checkout & Payment - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **a complete, trustworthy point-of-sale checkout experience** — the transaction workflow that staff use to ring up sales, apply discounts, collect payment, and produce receipts — built on top of Phase 8's stable Product Catalog, Shift, and Compliance foundations.

**In scope:**
- **Availment Creation & Modification** — Staff can add Products to an Availment, adjust quantities, remove items (soft-delete), and modify per-line stock_effect_type before finalizing.
- **Discount Composition** — Promo codes, staff-applied manual discounts, and Senior Citizen/PWD (SC/PWD) statutory discounts all stack on one Availment; each calculated independently against the base subtotal.
- **Payment Processing** — Single payment method per Availment (Cash, GCash, Credit Card); automatic cash change computation server-side.
- **Receipt Generation & Storage** — Synchronous receipt printing at finalization; Receipt records stored in DB for audit/reprint; tax computed per-item with hierarchical rate support (currently uniform 12% VAT implementation).
- **Compliance Gating** — Receipt and finalization gated through Phase 8's shared compliance policy-engine gate port, accepting `requestedDocumentContext` (fiscal/non_fiscal) per D-05.
- **Shift & Availment Binding** — Availment cannot finalize without an open shift for the cashier+terminal (CHK-06, enforced via Phase 8's DB-level one-open-shift invariant).

**Requirements in scope:** CHK-01 through CHK-06, FSC-03 (SC/PWD server-side discount computation per BIR rules).

**Out of scope (belongs to other phases):**
- Storefront online ordering — Phase 10.
- Split-tender (multiple payment methods per Availment) — deferred to Phase 11+.
- Order Fulfillment & Delivery Coordination — Phase 11.
- Comprehensive Inventory integration — post-v2.0.
- Live payment gateway capture/settlement (actual card processing) — not MVP scope.
- New frontend apps — deferred milestone-wide.

**Hard constraint — zero `backend/` writes (same as Phases 8-11):** No file under `backend/` may be edited. All Phase 9 code is new module code under `apps/dgfy-api/src/modules/availments`.

</domain>

<decisions>
## Implementation Decisions

### Availment Workflow: Flexible Edit-Before-Finalize (User-Confirmed)

- **D-01:** **Flexible line item editing before finalization.** Staff can freely add Products, remove them, adjust quantities, and modify the `stock_effect_type` per line at any time before the Availment is finalized. Once finalized, the Availment becomes immutable for the purposes of this phase (cancellation/refunds are a separate workflow, not in Phase 9 scope).

- **D-02:** **Soft-delete for removed lines, not hard deletion.** When staff removes a Product from an Availment, the line is marked as deleted/cancelled but retained in the database for audit trails. Staff can "restore" the line without having to re-add it from scratch (re-adds the deleted line with its original Product/price). This gives visibility into what was removed and why, matching the append-only principle established by Phase 8's other ledgers.

- **D-03:** **Per-line `stock_effect_type` control.** Each line can be independently toggled between `inventory_issue` (decrements stock) and `stock_exempt` (does not decrement). This can be changed at any time before finalization, giving staff flexibility for staff meals, promos, or manual overrides without requiring separate transaction workflows. The default is determined by the Product's `inventory_mode` (basic_inventory → inventory_issue; non_stock → stock_exempt), but staff can override per line.

### Discount Composition: Independent Stacking (User-Confirmed)

- **D-04:** **All discounts stack together.** A single Availment can have:
  - One or more promo/discount codes (if codes are implemented)
  - One staff-applied manual discount (e.g., "20% loyalty", "50 pesos off")
  - One SC/PWD statutory discount (if applicable)
  
  All three discount types can coexist on the same Availment.

- **D-05:** **Independent calculation, not cascading.** Each discount calculates 20% off the original subtotal independently, then all are summed and subtracted. Specifically:
  - `discount_amount = (promo_codes_total + manual_discount_amount + sc_pwd_discount_20pct) where each term calculates on base subtotal`
  - This means SC/PWD discount is **NOT** applied to a subtotal that's already had other discounts subtracted; it calculates on the original product total.
  - This is simpler to compute and explain than cascading, and slightly more generous to the customer (not an issue at DGFY's current sub-100-user scale).

- **D-06:** **SC/PWD Discount — Verify via ID (optimistic scan with manual fallback).** When staff applies the Senior Citizen/PWD statutory discount (20% per BIR rules), an ID verification step is required. The flow is:
  1. **Attempt automated scan** — If the POS device has a camera, staff points it at the SC/PWD ID; the system attempts to extract the ID number (and optionally customer name) via OCR or image analysis.
  2. **Manual fallback** — If the scan fails or the device has no camera, staff manually enters the SC/PWD ID number. Customer name is optional (not required to apply the discount).
  3. **Store for audit** — The verified ID number and optional customer name are recorded on the Availment for compliance audit and to track patterns of SC/PWD discount usage.
  
  This approach optimizes for devices with cameras (modern tablets, phones) while gracefully falling back to manual entry on older terminals without cameras. The backend stores but does not validate ID format in Phase 9 (validation/format checking can be added later once the actual ID format rules are confirmed).

- **D-07:** **SC/PWD discount is server-side computation only.** The 20% discount is computed server-side using the following BIR rule: VAT-exclusive base, 20% off that base. The receipt line for SC/PWD shows the discount amount separately. The MEMC group-meal rule (5% loyalty discount, not SC/PWD, for organizations serving meals to members) is not implemented in Phase 9 — deferred as a separate discount type if needed.

### Payment Processing: Single Method, Automatic Change (User-Confirmed)

- **D-08:** **Single payment method per Availment.** Phase 9 implements one payment method per Availment: either Cash, GCash, or Credit Card. The method is selected at finalization time. If a customer wants to pay partly cash and partly GCash, that's two separate Availments (two transactions) — split-tender is explicitly deferred to Phase 11+.

- **D-09:** **Automatic server-side cash change computation.** For Cash payment method:
  - Staff enters `cash_received` (the amount the customer handed over).
  - Backend computes `change_due = cash_received - total` (where `total` includes all line items, discounts applied, and tax).
  - Client cannot submit an arbitrary `change_amount`; it's computed server-side always.
  - For GCash/Credit Card, there is no `change_due` field (those methods settle the exact amount).

- **D-10:** **Payment records the method and amount, not a gateway charge.** The Payment row stores `payment_method` (Cash/GCash/Credit Card) and `amount_received`. For GCash and Credit Card, the backend does NOT perform live gateway capture/settlement — it only records that the staff claimed the payment method and amount. Full gateway integration (charge capture, webhook handling, refunds) is out of scope.

### Receipt Generation & Storage (User-Confirmed)

- **D-11:** **Synchronous receipt generation at finalization.** When an Availment is finalized, the receipt is generated and sent to the printer immediately (via the `device-bridge` printing service from the existing architecture). This blocks the finalization API call until the receipt generation completes (or timeout/fails in a controlled way). Staff see the receipt print; the transaction is considered complete.

- **D-12:** **Store Receipt records in the database.** A `Receipt` table/entity is created in the `dgfy_business_*` tenant schema, capturing:
  - Availment reference
  - All line items (product name, quantity, unit price, subtotal)
  - All discounts applied (promo code, manual, SC/PWD, each shown separately with the discount amount)
  - Tax breakdown
  - Payment method and amount received
  - Change due (for cash)
  - Timestamp and staff ID
  
  This allows staff to search/audit receipts later and verify they match the underlying Availment data. Receipt records are immutable (append-only, like `INVENTORY_MOVEMENT`).

- **D-13:** **Tax computation: per-item hierarchical structure, currently uniform VAT.** The schema/data model is built to support category-based VAT rates (Food might be 12%, Services might be different, etc.). However, for Phase 9 implementation, all products are treated with a single 12% VAT rate. The structure anticipates future per-category rates without requiring schema changes later. Tax is computed per line item first, then summed for the receipt total.

- **D-14:** **Receipt content includes all required elements.** Each receipt shows:
  - Store/branch name
  - Date/time
  - Cashier ID / staff name
  - Line items (product name, qty, unit price, line total)
  - Subtotal
  - Discounts (each listed separately: promo codes, manual, SC/PWD)
  - Subtotal after discounts
  - Tax (per item and/or total)
  - Total amount due
  - Payment method
  - Amount received (cash only)
  - Change (cash only)
  - Receipt ID / transaction number
  - Compliance mode (Fiscal/Non-Fiscal) — required by Phase 8's FSC-02 gate port

### Integration with Phase 8 Foundations

- **D-15:** **Compliance gate port usage.** Before an Availment can be finalized, the backend calls `assertComplianceGate({ businessId, operation: 'POS_CHECKOUT', requestedDocumentContext })` (gate port from Phase 8). The `requestedDocumentContext` value is determined by which app build the client is using (Fiscal vs. Omni) and passed in the finalization request. The gate returns `ALLOW` (proceed), `REQUIRES_SETUP` (business not ready), or `BLOCKED` (business cannot use this context). Per Phase 8's D-05, `compliant_active` businesses can use both `fiscal` and `non_fiscal` contexts; only `non_compliant_active` businesses are blocked from fiscal.

- **D-16:** **Shift precondition for Availment finalization.** Availment finalization requires an open shift for the cashier and terminal (CHK-06). The backend checks that a shift exists in the `shifts` table with `open_at` set and `closed_at` NULL for the (cashier_id, terminal_id) pair. This is enforced at the database level via Phase 8's generated-column unique constraint; no soft-check fallback needed.

- **D-17:** **Inventory ledger integration.** When an Availment finalizes, the backend creates `INVENTORY_MOVEMENT` rows through `modules/inventory` for every line item where `stock_effect_type = 'inventory_issue'`. These rows have `movement_type = 'sale'` and link back to the Availment. Lines marked `stock_exempt` do not create movements. This follows Phase 8's ADR 0029 single-writer contract: only `modules/inventory` writes movements; `modules/availments` requests the effect, never writes directly.

### Resolved During Discussion (User-Confirmed)

- **D-18:** **Soft-delete for removed lines improves auditability.** Rather than hard-deleting a line from `AVAILMENT_ITEM`, the line is marked with `cancelled_at` or similar flag. Restoring the line sets `cancelled_at = NULL`. This gives staff the ability to undo a removal, and auditors can see what was removed and when. The Receipt still only includes non-cancelled lines (current state only), but the full line history is preserved.

### Claude's Discretion

- Exact endpoint/command names for availment creation, line addition/removal/modification, and finalization — planner's call, following `routes → controllers → usecases → repositories → models` module shape.
- Exact discount entity shape and how promo codes are stored/validated (are they hardcoded, or a database table?) — planner's call.
- Exact Receipt table schema beyond the mandatory fields listed in D-14 — planner's call.
- Whether `modules/discounts` is a separate module or logic embedded in `modules/availments` — planner's call, but keep `modules/inventory` as the sole writer of stock effects (D-17).
- The timeout/error handling for synchronous receipt printing (D-11) — planner's call; if device-bridge is unavailable, how should finalization behave? (Fail the transaction? Log and continue? Retry?)
- SC/PWD ID scanning library/approach (D-06) — planner's call. No specific OCR tool is mandated; use whatever is practical for the POS environment. Format validation rules for the ID number can be added later once the ID format is officially confirmed (currently flagged as "to be confirmed").
- Whether customer name is stored as a separate field or embedded in structured metadata on the SC/PWD verification record (D-06) — planner's call; the requirement is that it's optional and stored for audit purposes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/ROADMAP.md` §"Phase 9" — goal, success criteria, requirement list, Phase 8 dependency.
- `.planning/REQUIREMENTS.md` — CHK-01 through CHK-06, FSC-03 (this phase); context on prior phases' scope.
- `.planning/PROJECT.md` — "v2.0 Commerce Domain zero-touch (Phases 8-11): No writes/edits/migrations to any file under `backend/` — not even an approved-seam exception."
- `.planning/STATE.md` — session history.

### Phase 8 Context (CRITICAL)
- `.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-CONTEXT.md` — D-05 (Compliance-mode gate port must accept `requestedDocumentContext` as first-class input), D-06 (Inventory Movement single-writer contract), completion status and verified truths. **Must read before planning Phase 9's compliance gating and inventory integration.**
- `.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-VERIFICATION.md` — All 8/8 success criteria verified; Phase 8 is complete and stable.

### Research and Domain Specification
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §9 — Availment schema, AvailmentItem structure, fulfillment modes, fulfillment stages, inventory movement ledger, and the single-transaction-per-purchase principle.
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §5 — Stock/availability mechanisms (Basic Inventory, Booking Status, per-line `stock_effect_type` flexibility).

### Architecture Governance & Patterns
- `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — `routes → controllers → usecases → repositories → models` layering for `modules/availments`.
- ADR `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md` — the single-writer rule ("POS requests stock effects. Only Inventory records stock effects.") that Phase 9 must follow (D-17).
- ADR `docs/architecture/adr/0003-migration-facade-strategy.md` — Strangler Fig, no-legacy-mutation constraint; this phase's new tables are genuinely new `dgfy_business_*` tables.

### BIR and Compliance Rules
- `backend/src/modules/compliance/policy/complianceConstants.js` — Compliance state/decision/operation/reason enums (read to understand gate output values).
- **BIR SC/PWD Discount Rule:** 20% discount on the VAT-exclusive base of an Availment for customers with valid SC/PWD status. This phase implements the computation (D-07, D-05 rule from requirement FSC-03); Phase 8's compliance gate determines whether the business can issue receipts that include this discount.

### Legacy Precedent (Read-Only Reference, DO NOT EDIT)
- `backend/src/modules/compliance/policy/compliancePolicyEngine.js` — legacy gate implementation; study the gate's structure and decision logic (but Phase 8's new gate port supersedes this for new code).
- `backend/src/models/PosTransactionLine.js` — legacy Availment/transaction line model structure (pattern reference only).

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — module and coding conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/dgfy-api/src/modules/inventory`** — already exists and is the single writer for stock effects. Phase 9's `modules/availments` will call `inventory.recordMovement()` or similar to record sale movements, never write directly.
- **`apps/dgfy-api/src/modules/compliance`** — already built by Phase 8; the gate port is ready. Phase 9 imports and calls it at finalization time.
- **`apps/dgfy-api/src/models/Tenant/*`** — Phase 8 created Shift, Product, InventoryMovement, ComplianceModeState, etc. Phase 9 adds Availment, AvailmentItem, Payment, Receipt models.
- **`backend/device-bridge`** — existing device printing service; Phase 9 calls it for synchronous receipt printing (D-11).

### Established Patterns
- **Single-writer contract (ADR 0029)** — only `modules/inventory` writes `InventoryMovement` rows; `modules/availments` requests via a method call, never writes directly.
- **Append-only ledgers** — `INVENTORY_MOVEMENT`, `CASH_DRAWER_EVENT` (Phase 8), and now `AVAILMENT_ITEM` (soft-delete marked with `cancelled_at`; rows never physically deleted) and `RECEIPT` (immutable).
- **Gate port called from inside usecase bodies** — Phase 8 established the pattern; Phase 9 follows it when calling `assertComplianceGate` during availment finalization.
- **Soft-delete for audit trails** — Phase 8 flagged shifts as stale (D-11 in 08-CONTEXT.md); Phase 9 soft-deletes availment lines for the same reason.

### Integration Points
- `modules/compliance`'s gate port (`assertComplianceGate`) is called from `modules/availments` finalization usecase with the mandatory `requestedDocumentContext` parameter (D-05, D-15).
- `modules/inventory`'s `recordMovement()` method is called from `modules/availments` finalization for lines with `stock_effect_type = 'inventory_issue'` (D-17).
- Shift verification uses Phase 8's one-open-shift database constraint (D-16); no need for a soft check in the usecase.

</code_context>

<specifics>
## Specific Ideas and Rationale

### Why Independent Discount Calculation (D-05)?

The user chose independent calculation (each discount on the base subtotal) over cascading (discount-on-discount) for simplicity and customer fairness. At DGFY's current scale (<100 users), the rounding/fairness edge cases of cascading aren't worth the complexity. Independent calculation is also easier to explain to staff ("SC/PWD is always 20% off the subtotal, no matter what other discounts are applied") and to audit on receipts.

### Why Soft-Delete for Lines (D-02, D-18)?

Soft-delete with restore capability gives staff a safety net (undo a removal) and gives auditors a complete transaction history (what was added, removed, when). This matches Phase 8's pattern for shifts (flagged but not auto-closed; operator can see the full lifecycle). It also respects the append-only principle — the `AVAILMENT_ITEM` table grows with events (added, modified, deleted), never shrinks.

### Why Sync Receipt Printing (D-11)?

Synchronous printing ensures staff immediately see if there's a printer problem before they hand change to the customer. Async printing would leave a gap where the transaction is recorded but the staff doesn't know if the receipt printed. For POS workflows, that gap is a real operational risk. Async can be added later as an optimization if high-latency printing becomes a bottleneck.

### Why Store Receipt Records (D-12)?

Storing Receipt records (not just generating on-demand from Availment) enables fast lookup for staff reprints, customer inquiries, and compliance audits. A generated-on-demand Receipt is still useful for verification (D-12 mentions regenerating to audit), but having stored records for the happy path is practical.

</specifics>

<deferred>
## Deferred Ideas

- **Split-tender (multiple payment methods per Availment)** — explicitly deferred to Phase 11+. Current single-method-per-availment covers MVP; splitting is future-proofed by designing Payment as a separate entity from Availment (not a single `payment_method` field baked into Availment), so Phase 11 can add multiple Payment rows per Availment without schema changes.

- **Live payment gateway capture/settlement** — recording payment method/amount is Phase 9; actual charge capture, webhooks, chargebacks, and settlements are out of scope. Phase 11+ can add the gateway integration by calling an external service, not changing Phase 9's Payment schema.

- **MEMC group-meal 5% loyalty discount** — not implemented. SC/PWD discount is 20% only. MEMC (5%) can be added as a separate discount type later if needed.

- **Automatic compliance-state transition** — Phase 8 explicitly deferred automation in favor of manual review (D-04 of 08-CONTEXT.md). Phase 9 doesn't change this; compliance states are still manually managed by operators.

- **Availment cancellation and refunds** — out of scope. Once finalized, an Availment is immutable (per D-01). Cancellation or refunds would be a separate workflow (return/refund transaction), not implemented in Phase 9.

- **Per-category tax rates** — the schema supports it (D-13), but Phase 9 implementation uses a uniform 12% VAT for all products. Per-category rates can be added in Phase 11+ by querying the Product's category at finalization time.

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 9-POS Checkout & Payment*
*Context gathered: 2026-07-13*
