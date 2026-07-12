# Project Research Summary

**Project:** DGFY Standalone Refactor — v2.0 Commerce Domain
**Domain:** SMB multi-vertical POS + storefront commerce backend (Philippines market), built as new module code inside `apps/dgfy-api`
**Researched:** 2026-07-12
**Confidence:** HIGH

## Executive Summary

This milestone adds a Commerce Domain (Product Catalog, POS Checkout & Payment, Shift/Cash-Drawer, Fiscal/Compliance, Storefront Online Ordering, Order Fulfillment) as new module code inside `apps/dgfy-api`, following the exact `routes -> controllers -> usecases -> repositories -> models` layering and per-module folder shape already proven in Phases 1-6 (Accounts/Businesses/Tenancy). The single biggest advantage this project has is that almost every hard problem in scope — PayMongo integration with HMAC-verified webhooks, a fiscal/compliance policy engine, MySQL generated-column tricks for partial-unique constraints, DB-trigger-enforced append-only ledgers, server-side discount/tax math for SC/PWD compliance — already has a hardened, production-tested implementation in the legacy `backend/` app. The correct strategy is to port these proven patterns into the new Clean-Architecture module structure rather than inventing new approaches or reaching for new dependencies; the only net-new package needed is `joi` for payload validation.

The recommended build order is dependency-driven: Product Catalog + Inventory ledger first (nothing else has a `product_id` to reference), Shift & Cash Drawer in parallel (no Product dependency), Booking after Product, Fiscal/Compliance policy engine/gate port built in parallel with all of the above (so its contract is stable before Checkout is written against it), then POS Checkout & Payment, then Storefront Online Ordering (the first module to legitimately cross Landlord/Tenant databases in one usecase), then Order Fulfillment. Feature scope is essentially backend API parity with legacy plus explicit legal requirements (SC/PWD discount, BIR-compliant receipts) — no new frontends, and several tempting features (live courier APIs, loyalty programs, N-way split-tender, staff calendars) are explicitly out of scope given the sub-100-active-user target.

The dominant risk category is regression of already-known legacy bugs under a new schema name — client-trusted change/tender arithmetic, client-declared payment status, stock double-decrement races, no-shift checkouts, compliance gate under/over-gating, and (new to this milestone) unsafe cross-database Landlord/Tenant writes for storefront orders. Every one of these has a concrete, codebase-grounded mitigation pattern (atomic guarded `UPDATE`, server-side `change_due` computation, DB-level unique constraints via generated columns, landlord-durable-record + idempotent tenant finalization) that must be designed in from the start of the relevant phase, not retrofitted. The second-order risk is architectural: recreating the "DGFY shares schema with legacy IMS" coupling problem inside the new system by taking data-modeling shortcuts (reading legacy `items` directly "just for one field").

## Key Findings

### Recommended Stack

No framework changes are needed — Express 4.22.2, Sequelize 6.37.8, mysql2, and MySQL 8.0 stay exactly as pinned in `apps/dgfy-api`. The only new dependency is `joi@^18.2.3` for validating the commerce domain's more complex nested payloads (cart line items, discount applications, payment attributes). PayMongo integration uses Node 22's native `fetch` and `crypto` (no SDK, no axios) — porting `backend/src/services/paymongoService.js`'s proven HMAC-SHA256 webhook verification and REST client logic. Money math stays as `DECIMAL` columns + a small rounding helper (no `decimal.js`/`dinero.js`), and shift lifecycle stays as an enum + guarded usecase transitions (no `xstate`) — both proven sufficient at this codebase's existing scale.

**Core technologies:**
- Express 4.22.2 + Sequelize 6.37.8 + mysql2 + MySQL 8.0 — unchanged; new commerce tables/routes slot into the existing layered structure
- `joi@^18.2.3` — request schema validation for checkout/cart/discount/shift/fulfillment payloads (new dependency, one package total)
- Native `fetch`/`crypto` (Node 22 builtins) — PayMongo REST calls and webhook HMAC verification, replacing any need for axios or a PayMongo SDK
- MySQL `GENERATED ALWAYS AS (...) STORED` + `UNIQUE INDEX` — enforces "one open shift per cashier+terminal" (MySQL has no native partial/filtered unique index)
- MySQL `BEFORE UPDATE`/`BEFORE DELETE` triggers with `SIGNAL SQLSTATE` — enforces true DB-level append-only immutability for ledger tables

### Expected Features

Feature scope is backend API parity with the legacy system plus PH-specific legal requirements. The SC/PWD statutory discount (RA 9994, RR 7-2010, RMC 71-2022) is the highest-stakes table-stakes item — it directly shapes BIR-compliant receipt structure and must be treated as a fiscal-domain concern sharing the same tax/discount computation module as Fiscal/Compliance, not a generic manual discount. Guest checkout is a hard requirement (forced signup measurably hurts conversion); shift-open is a hard precondition for checkout; fiscal/compliance gating is a genuine differentiator vs. Square/Shopify/Loyverse (none of them model "can't legally issue a receipt yet" as a first-class state) and must not regress in the rebuild.

**Must have (table stakes):**
- Product Catalog (Food/Service/Retail, stock/non-stock, folders, Basic Inventory ledger)
- Server-verified checkout totals, line items, discounts, tax, change (non-negotiable per PROJECT.md scope)
- Discount codes + permission-gated manual discounts + SC/PWD regulatory discount
- Payment method selection recorded on Availment (Cash/GCash/Card) — record only, no live gateway capture required
- Shift open/close with starting cash float + cash-drawer reconciliation (Expected/Actual/Difference, Loyverse's 3-field model)
- Fiscal/compliance policy-engine gating on checkout, shift-open, and receipt issuance
- Storefront browse/search/cart, guest-or-account checkout, pickup/delivery scheduling
- Order fulfillment status tracking (shared core pipeline + type-specific handoff leg) + manual courier assignment/payout tracking
- BIR-compliant receipt generation reflecting all discounts/taxes, gated by compliance state

**Should have (competitive/differentiators):**
- Fiscal/compliance policy-engine gating itself — the standout competitive differentiator vs. international platforms
- Unified Product model spanning Food/Service/Retail under one entity (simplifies hybrid-vertical onboarding)
- Branch-level booking capacity without staff calendars (right-sized MVP cut for service businesses)

**Defer (v2.x / v3+):**
- Blind-count shift closing, 2-way split-tender payments (add only once real demand is observed)
- Live PayMongo capture/settlement, real courier API integration (Grab/Lalamove), staff-level appointment calendars, loyalty/rewards program, multi-channel order routing, comprehensive Inventory/IMS integration — all explicitly out of scope per `.planning/PROJECT.md`

### Architecture Approach

Commerce Domain is entirely new module code inside `apps/dgfy-api` (never touching legacy `backend/`), organized as one module per bounded concern (`products`, `inventory`, `booking`, `shifts`, `compliance`, `availment`, `storefrontOrdering`, `fulfillment`) mirroring the existing `modules/accounts`/`modules/businesses` shape exactly. Two architectural rules are enforced structurally, not by convention: (1) fiscal/compliance gating lives behind a narrow injected port called from inside each gated usecase's own body (never middleware, never scattered per-call checks); (2) each mutable/append-only resource has exactly one writer module (`modules/inventory` is the only writer of stock-movement rows, `modules/availment` the only writer of stage-event rows) — everyone else calls a port. Storefront Ordering is the first usecase in the codebase to legitimately cross Landlord and Tenant databases in one flow, resolved at the application layer (no DB FK, no 2PC) via a landlord-durable-record-first + idempotent-tenant-finalization pattern that mirrors the existing `CommercePaymentSession` precedent.

**Major components:**
1. `modules/products` + `modules/inventory` — Product identity/catalog and the single-writer stock-movement ledger (atomic guarded UPDATE, not read-then-write)
2. `modules/shifts` — shift open/close, cash-drawer events, one-open-shift-per-terminal DB-level invariant
3. `modules/compliance` — compliance-mode state machine exposed as a narrow gate port (`assertComplianceGate`) consumed by checkout, shift, and receipt usecases
4. `modules/availment` — POS checkout usecases, `AVAILMENT`/`AVAILMENT_ITEM`/`AVAILMENT_STAGE_EVENT`, server-computed totals/change
5. `modules/storefrontOrdering` — cart, guest-or-account checkout, first real Landlord↔Tenant crossing, first mount of the already-built-but-unmounted `tenantContextResolver`
6. `modules/fulfillment` — order status/stage-event lifecycle, manual courier assignment, payout tracking

### Critical Pitfalls

1. **Server verifies order totals but still trusts client-submitted `change_amount`/`cash_received`** — treat cash tender as first-class checkout input; compute `change_due` server-side and reject if `cash_received < total`; never accept a client-computed `change_amount` on the write path.
2. **`payment_status` stays client-declared under a new name for non-gateway methods** — split into gateway-verified (`paid`, webhook-confirmed only) vs. attested (`cashier_attested`, requires `attested_by_staff_id`/`shift_id`) tiers; never let a plain client PATCH set the paid-equivalent status.
3. **Stock double-decrement / oversell between concurrent POS and Storefront sales** — route all stock effects through one centralized command service using an atomic guarded `UPDATE ... WHERE quantity >= :qty` (check `affectedRows === 1`), never read-then-write; same pattern for booking slot capacity.
4. **Checkout succeeds with no open shift, or a shift silently spans days** — enforce shift-open as a server-side precondition inside the checkout usecase itself (not a UI guard), backed by a DB-level unique constraint (generated-column trick); flag (don't auto-close) stale shifts.
5. **Fiscal/compliance gate mis-calibration (over- or under-gating)** — centralize the gate call in shared usecase code every sale-completing path must call (POS, Storefront, Fulfillment), with a mechanical guardrail test asserting coverage; model gating as multiple named modes, not one boolean.
6. **Cross-database (Landlord↔Tenant) storefront-order writes treated as a single transaction** — no native cross-DB transaction exists; use landlord-durable-record-first + idempotent tenant finalization + explicit manual-resolution fallback state, mirroring the existing `CommercePaymentSession` pattern.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Product Catalog + Basic Inventory Ledger
**Rationale:** Nothing else in scope has a `product_id` to reference; this is the true root dependency. Also the phase where the "no legacy `items` coupling" boundary must be locked in before anything else builds on Product.
**Delivers:** `modules/products`, `modules/inventory` with a centralized, concurrency-safe stock command service (atomic guarded UPDATE), append-only `InventoryMovement` ledger (insert-only Sequelize model + DB trigger).
**Addresses:** Product Catalog (Food/Service/Retail, stock/non-stock, folders), Basic Inventory ledger — both P1 table stakes.
**Avoids:** Pitfall 3 (stock double-decrement) via the atomic-guard contract shipped with a concurrency test up front; Pitfall 7 (IMS coupling) via a manifest-registered seam requirement and guardrail grep test — no FK/model import into legacy `items`/`PosTransactionLine`.

### Phase 2: Shift & Cash Drawer (can run parallel to Phase 1)
**Rationale:** Only depends on existing Business/Location/StaffAccount/TerminalIdentity — no Product dependency — so it can be built alongside Phase 1. Must land before or alongside Checkout since it's a hard checkout precondition.
**Delivers:** `modules/shifts` — open/close usecases, cash-drawer event log (insert-only), close-time Expected/Actual/Difference reconciliation, one-open-shift-per-terminal+cashier DB-level generated-column unique index.
**Uses:** MySQL `GENERATED ALWAYS AS (...) STORED` + `UNIQUE INDEX` pattern from STACK.md; `sequelize.transaction()` + guard read convention.
**Implements:** the shift-gating port that Checkout will call as a precondition.

### Phase 3: Booking (after Product Catalog)
**Rationale:** A bookable Service is presented as a Product subtype/category, so the catalog's category model must exist first.
**Delivers:** `modules/booking` — branch-level slot capacity checks against Product's slot/capacity fields, using the same atomic-decrement-with-guard pattern as inventory for `slots_remaining`.
**Addresses:** Booking (branch-level capacity, no staff calendar) — correctly scoped MVP cut per FEATURES.md.

### Phase 4: Fiscal/Compliance Policy Engine + Gate Port (parallel with Phases 1-3)
**Rationale:** Zero data dependency on Product/Availment, but its gate-port contract must be stable before Checkout/Shift-close usecases are written against it — build in parallel and have it ready by the time Phase 5 starts, not retrofitted afterward.
**Delivers:** `modules/compliance` — compliance-mode state machine, `assertComplianceGate({ businessId, operation })` port with multiple named gate modes (`blocks_checkout`, `blocks_receipt_issuance`, `blocks_shift_open`), versioned `policyPacks.js`.
**Addresses:** Fiscal/compliance gating — the standout competitive differentiator per FEATURES.md.
**Avoids:** Pitfall 5 (over/under-gating) by designing the port contract and multi-mode gating from the start, plus flagging the open decision on whether `ComplianceModeState` is Landlord- or Tenant-scoped for roadmap/phase-planning confirmation.

### Phase 5: POS Checkout & Payment (Availment/AvailmentItem)
**Rationale:** Depends on Phase 1 (Product), Phase 2 (Shift, for terminal/cashier attach and the gating precondition), Phase 4 (compliance gate). This is the core commerce primitive everything downstream hangs off.
**Delivers:** `modules/availment` — checkout usecase (compliance gate → shift check → server-computed totals/change → Availment+AvailmentItem write → inventory effect request → first stage-event row, all in one transaction), SC/PWD discount math, receipts.
**Addresses:** Availment + server-verified totals/change, discount codes + manual + SC/PWD discounts, payment method recording, receipts — all P1.
**Avoids:** Pitfall 1 (client-trusted change/tender), Pitfall 2 (client-declared payment status), Pitfall 8 (name the new payment entity `AvailmentPayment`/`PosPaymentAttestation`, never bare `Payment` — collides with existing landlord subscription-billing model).

### Phase 6: Storefront Discovery & Online Ordering
**Rationale:** Depends on Phase 1 (catalog to browse) and Phase 5 (Availment shape to write into). This is the first real Landlord↔Tenant crossing in the whole codebase — genuinely new risk surface, budget extra time.
**Delivers:** `modules/storefrontOrdering` — guest-or-account checkout, first mount of the already-built `tenantContextResolver` middleware, landlord-durable-order-record + idempotent tenant-Availment-finalization pattern with an explicit manual-resolution state.
**Addresses:** Storefront browse/search/cart, guest checkout (P1), pickup/delivery scheduling.
**Avoids:** Pitfall 6 (cross-DB write consistency) — this phase must design the order-creation flow around the landlord-first/idempotent-finalization pattern from the start, including a reconciliation/retry sweep as part of the phase, not a later TODO.

### Phase 7: Order Fulfillment & Delivery Coordination
**Rationale:** Depends on Phase 5 (POS-originated fulfillment) and mainly Phase 6 (online orders are its primary source) — orders must exist before they can be fulfilled.
**Delivers:** `modules/fulfillment` — full `AVAILMENT_STAGE_EVENT` lifecycle, manual delivery/courier assignment, payout tracking (mirrors legacy's "outbound links" capability, not live courier API integration).
**Addresses:** Order fulfillment status tracking + manual courier assignment (P1), correctly scoped as non-integration.
**Avoids:** Pitfall 5 (compliance gate must also cover any new sale-completing/receipt-issuing transitions this phase introduces) and inherits Pitfall 6 risk if Phase 6's cross-DB pattern isn't solid first.

### Phase Ordering Rationale

- Dependency-driven: Product Catalog is the true root (nothing else has a `product_id`); Shift has zero Product dependency so it runs in parallel; Fiscal/Compliance has zero data dependency but a hard contract-timing dependency (must be ready before Checkout is written, not after).
- Storefront Ordering is deliberately its own phase, not folded into Checkout, because it's the only place that legitimately crosses Landlord and Tenant databases in one usecase — genuinely different risk shape, not just "checkout with a different UI."
- This ordering directly avoids the two most expensive-to-recover-from pitfalls identified in PITFALLS.md: shipping Checkout before Shift-gating exists (Pitfall 4, recovery cost LOW-MEDIUM but preventable at zero cost by sequencing), and shipping any new sale-completing path without the compliance gate wired in from day one (Pitfall 5, recovery cost HIGH — compliance exposure).

### Research Flags

Phases likely needing deeper research during planning:
- **Storefront Discovery & Online Ordering (Phase 6):** first real Landlord↔Tenant cross-database write pattern in this codebase; PayMongo storefront QR Ph payment integration is explicitly flagged in ARCHITECTURE.md as out of that research's depth — flag for phase-specific research when this phase is planned.
- **Fiscal/Compliance (Phase 4):** open decision on whether `ComplianceModeState` is Landlord-scoped or Tenant-scoped is unresolved and must be confirmed before building `modules/compliance` — flagged explicitly in ARCHITECTURE.md's "Open Decisions."
- **Order Fulfillment (Phase 7):** fulfillment status shape (two-field `status`+`fulfillment_stage` vs. legacy's single-field state machine) is an assumed-not-confirmed design decision per ARCHITECTURE.md.

Phases with standard patterns (skip research-phase):
- **Product Catalog + Inventory (Phase 1):** stock command service pattern is a direct, well-documented port of `backend/src/modules/inventory/commands/stockCommandService.js` and ADR 0029.
- **Shift & Cash Drawer (Phase 2):** generated-column unique-index pattern and Loyverse's 3-field reconciliation model are both fully specified with working SQL in STACK.md.
- **POS Checkout & Payment (Phase 5):** server-verified totals/change and payment-status tiering patterns are fully specified in PITFALLS.md and STACK.md with direct legacy precedent (`posDiscountCalculator.js`, `commercePaymentRepository.js`).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every recommendation grounded in either an already-shipped legacy implementation in this exact monorepo, current PayMongo API docs verified via Context7, or npm registry version checks run 2026-07-12 |
| Features | MEDIUM | PH regulatory findings (BIR/SC-PWD) cross-checked across multiple official + vendor sources (HIGH-confidence primary sources cited); competitor UX/data-model findings are single-search web-sourced and directional, not authoritative |
| Architecture | HIGH | Grounded directly in the live codebase (`apps/dgfy-api/src`, migration-runner schema contracts, `backend/src/modules/*`) and four authoritative ADRs (0003, 0024, 0029, 0034), not external ecosystem research |
| Pitfalls | HIGH | Grounded in this codebase's own reconciliation findings and `.planning/codebase/*` mapping; MEDIUM specifically where a pitfall extrapolates to the not-yet-built Fulfillment/Delivery surface |

**Overall confidence:** HIGH

### Gaps to Address

- **Compliance-mode state ownership (Landlord vs. Tenant scope):** ARCHITECTURE.md assumes Tenant-scoped but flags this as unconfirmed against where `Business` billing state ultimately lives — resolve explicitly during Phase 4 planning, before `modules/compliance` schema is finalized.
- **Fulfillment status shape (two-field event-sourced vs. legacy single-field):** ARCHITECTURE.md assumes the two-field/event-sourced design because it satisfies the milestone's explicit `AVAILMENT_STAGE_EVENT` requirement, but flags this as a real design decision for the roadmap to confirm, not assume — resolve during Phase 7 planning.
- **PayMongo storefront payment integration depth:** explicitly out of ARCHITECTURE.md's research depth; STACK.md covers the REST/webhook mechanics but the full storefront payment flow design needs phase-specific research when Phase 6 is planned.
- **Competitor/UX feature findings (FEATURES.md):** several claims (e.g., Square split-tender API limits, Chowbus OMS patterns) are single-search web-sourced at MEDIUM/LOW confidence — treat as directional inputs to prioritization, not hard requirements; the PH-regulatory findings (SC/PWD, BIR) are the parts of FEATURES.md that are load-bearing and HIGH confidence.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/developers_paymongo` — payment_intents, sources, webhooks endpoint shapes, amount-in-smallest-currency-unit convention (queried 2026-07-12)
- Context7 `/sequelize/website` — Sequelize v6 hooks (`beforeUpdate`/`beforeBulkUpdate`) as the correct mechanism for insert-only model enforcement
- `backend/src/services/paymongoService.js`, `backend/tests/paymongoWebhookSignature.test.js` — production-proven PayMongo REST client + webhook HMAC verification
- `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `policyPacks.js` — proven fiscal/compliance policy-gating engine
- `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs`, `20260408000003-harden-compliance-audit-immutability.cjs` — proven MySQL generated-column and trigger patterns
- `backend/src/modules/pos/domain/posDiscountCalculator.js`, `backend/src/models/PosTerminalShift.js` — proven server-side discount/total calculation and shift field shapes
- `apps/dgfy-api/src/infra/tenantConnector.js`, `middleware/tenantContextResolver.js`, `models/Landlord/Account.js`, `modules/dgfyAuth/models/DgfyAccount.js`, `config/db.js` — current dgfy-api implementation baseline
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, ADRs 0003, 0024, 0029, 0034 — authoritative governance and precedent
- `refactor-do-not-commit/DGFY_Domain_02_Product.md`, `DGFY_Plan_vs_Reality_Reconciliation.md` — target ER shape and plan-vs-reality gap findings
- `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `INTEGRATIONS.md` — milestone scope and codebase mapping
- BIR Revenue Regulation No. 7-2010, RMC No. 71-2022, RR No. 16-2018 — primary PH regulatory sources for SC/PWD discount compliance
- npm registry version checks (`npm view`, run 2026-07-12) — confirmed current package versions

### Secondary (MEDIUM confidence)
- Shopify/Square/Loyverse/Toast official vendor documentation — discount management, split-tender limits, shift reconciliation, fulfillment status patterns
- Hashmicro PH, Respicio & Co., StoreHub Care — PH-market BIR/SC-PWD compliance implementation guidance, cross-referenced against primary regulatory sources
- Idempotency-key and inventory-reservation pattern articles (dev.to, Adyen docs, dasroot.net) — corroborate existing codebase patterns for cross-DB writes and stock concurrency

### Tertiary (LOW confidence)
- Qashier Help Center SC/PWD guide — summarized secondhand via search results only (direct fetch returned HTTP 403), treat corroborating detail as unverified
- Cointab cash-drawer reconciliation blog, Chowbus OMS blog — general industry commentary, directional only

---
*Research completed: 2026-07-12*
*Ready for roadmap: yes*
