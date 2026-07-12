# Pitfalls Research

**Domain:** Adding a Commerce Domain (Product Catalog, POS Checkout/Payment, Shift/Cash-Drawer, Fiscal/Compliance, Storefront Online Ordering, Order Fulfillment/Delivery) to an existing multi-tenant Landlord+Tenant POS/Storefront platform (DGFY)
**Researched:** 2026-07-12
**Confidence:** HIGH (grounded in this codebase's own reconciliation findings, `.planning/codebase/*` mapping, and ADR-documented precedent; MEDIUM where a pitfall extrapolates to the not-yet-built Fulfillment/Delivery surface)

This document is written against the specific milestone in `.planning/PROJECT.md` ("v2.0 Commerce Domain") and the specific known-risk findings in `refactor-do-not-commit/DGFY_Plan_vs_Reality_Reconciliation.md` §6. It intentionally does not re-litigate those findings as discoveries — it treats each as a starting constraint and asks "what new mistake would re-introduce this same failure shape while building the *new* Product/Availment domain?"

---

## Critical Pitfalls

### Pitfall 1: Server "verifies" totals but still trusts client-submitted change/tender amounts

**What goes wrong:**
The legacy bug was `change_amount == cash_received − total_amount` never being checked server-side. The natural way to "fix" this while building the new Availment checkout is to add server-side total calculation (line items → discounts → tax → grand total) but still accept `cash_received` and `change_amount` as opaque fields on the checkout payload, only using them for the receipt. That reproduces the exact bug under a new schema, because "server-verified totals" (a target feature explicitly named in `PROJECT.md`) is easy to satisfy for the *order total* while leaving the *cash-tender arithmetic* unchecked.

**Why it happens:**
Total calculation (discounts, senior/PWD, promo codes) is the part everyone remembers to move server-side because it's revenue-correctness-visible. Change-making feels like "just arithmetic the cashier already did in their head" and gets left as a display-only client computation, especially because the POS UI needs instant change feedback while the cashier is still counting cash — nobody wants a network round-trip blocking that UX. This produces "verify the total, forget to verify the tender."

**How to avoid:**
Make cash tender a first-class part of the checkout payload contract, not a receipt-only field: `POST /checkout` accepts `{ payment_method, cash_received? }`; the use case computes `change_due = cash_received - total` server-side and rejects the request (`422`) if `cash_received < total` for cash payments, or if a caller tries to pass `change_amount` directly instead of `cash_received`. Never accept a client-computed `change_amount` field on the write path — compute it, don't validate it. Client-side "instant" display is fine; it's just a UI hint, and the server response is the source of truth echoed back onto the receipt.

**Warning signs:**
- The checkout DTO/contract has a `change_amount` input field at all (it should be an output-only field, never accepted from the client).
- The POS use-case test suite has no test asserting "checkout is rejected when `cash_received < total`".
- Any place `cash_received - total` is computed in more than one layer (frontend AND backend) without the backend result being the one persisted.

**Phase to address:**
POS Checkout & Payment phase — must be closed before that phase is considered done, not deferred to a later hardening pass.

---

### Pitfall 2: Non-gateway `payment_status` stays client-declared under a new name

**What goes wrong:**
The known risk is that cash/card/bank_transfer payments are marked `paid` purely because the client said so, with no independent confirmation. Renaming the field (e.g. `Availment.payment_status` instead of legacy's field) without changing *who sets it* doesn't fix anything — it just moves the same trust bug into new code. This is a realistic failure mode here specifically because `INTEGRATIONS.md` confirms GCash/Maya/Card/Bank are POS payment-method *labels*, not gateway integrations — only cash vs. "external hardware/app" is meaningfully distinguishable server-side today. There is no oracle to independently confirm a card payment happened; the honest fix is procedural, not technical.

**Why it happens:**
Engineers reach for "add a webhook/gateway check" as the fix, but for offline/external card terminals there frequently is no webhook to check. Without a deliberate decision, the easiest path is "trust the terminal's report" — same shape as before.

**How to avoid:**
Split payment confirmation into two explicit tiers instead of one `payment_status` boolean:
1. **Gateway-verified** (QR Ph/PayMongo): `payment_status` transitions to `paid` only from a webhook-confirmed or server-polled provider event — mirror the existing `commercePayments` module's landlord-owned `CommercePaymentSession` pattern (`verification_reference`, `verified_at`), which already does this correctly for storefront QR Ph.
2. **Attested cash/external**: introduce a distinct status such as `cashier_attested` (not `paid`) for cash/card/bank_transfer, recorded with the authenticated cashier/staff account ID and terminal ID performing the attestation, and require an open shift (Pitfall 4) as a precondition — the audit trail (who attested, when, under which shift) is the actual mitigation, not a false sense of independent verification. Reserve `paid` in the schema for states where the platform genuinely has independent evidence; don't let a cash sale and a webhook-confirmed QR Ph sale collapse into the same status value.

**Warning signs:**
- A single `payment_status` enum with `paid` reachable from both a webhook handler and a plain client-submitted PATCH.
- No `attested_by_staff_id` / `attested_at` / `shift_id` columns on the payment record for non-gateway methods.
- Any endpoint that lets a client set `payment_status: 'paid'` directly in the request body.

**Phase to address:**
POS Checkout & Payment phase for the schema/status-model decision; Fiscal/Compliance phase should audit that receipts/fiscal documents only issue against `paid` or `cashier_attested` (never a client-only-declared field with no audit trail).

---

### Pitfall 3: Stock double-decrement / oversell between concurrent POS and Storefront sales on the same Product

**What goes wrong:**
POS and Storefront are two independent write paths hitting the same Product's stock. A naive implementation reads current stock, checks `stock >= quantity`, then writes `stock - quantity` in a separate statement — classic check-then-act race. Under concurrency (a popular item sold in-store while also being ordered online at the same moment), two transactions can both read the same pre-decrement stock value and both succeed, driving stock negative and creating phantom sales the business can't fulfill. Booking/slot capacity (bookable Services, branch-level capacity) has the identical race shape — two customers booking the last slot simultaneously.

**Why it happens:**
It works perfectly in every manual QA pass and in isolated integration tests because there's no real concurrency in a single-threaded local test run. The bug only appears under real concurrent load, which is exactly the load pattern this milestone is trying to enable (POS + Storefront selling from the same catalog simultaneously) — so it's the kind of bug that ships clean and fails in production during a busy period.

**How to avoid:**
This codebase already has the right ownership boundary for this — reuse it rather than inventing a new one. `ARCHITECTURE.md` documents `backend/src/modules/inventory/commands/stockCommandService.js` as the single owner of stock truth/effects (ADR 0029: "POS or Storefront Updating Stock Truth" is a named anti-pattern already). The new Product/Availment stock effects must go through an equivalent centralized command service, and that service must do the decrement atomically:
- Prefer a single atomic SQL statement: `UPDATE item_location_stocks SET quantity = quantity - :qty WHERE item_id = :id AND location_id = :loc AND quantity >= :qty` and check `affectedRows === 1`; if `0`, the decrement failed (insufficient stock) and the use case aborts the sale line before any payment/receipt step runs.
- Where business logic needs to read-then-decide between the read and the write (e.g. combining multiple lines, applying partial-fulfillment rules), wrap in `SELECT ... FOR UPDATE` inside a transaction rather than a bare `SELECT`.
- For booking/slot capacity, apply the same atomic-decrement-with-guard pattern against a `slots_remaining` counter rather than counting existing bookings on every request.
- Keep the append-only `StockMovement` ledger as the audit trail (this pattern is already correct in the legacy system per the reconciliation doc's §2 validations) — the atomic guard prevents overselling; the ledger proves what happened afterward.

**Warning signs:**
- Any stock/slot check implemented as `const current = await Model.findOne(...); if (current.qty >= n) { await current.update(...) }` — two round trips, no lock, no WHERE-clause guard.
- Load/concurrency tests absent from the phase's test suite (a single concurrent-request test firing N simultaneous checkout calls against a fixed-stock item is a cheap, high-value regression test to require).
- POS and Storefront checkout use cases each importing their own stock-mutation logic instead of both calling one shared command service.

**Phase to address:**
Product Catalog domain phase must establish the centralized stock command service and its atomic-decrement contract; POS Checkout & Payment and Storefront Online Ordering phases must both be required to consume it rather than write stock directly — this is a cross-phase dependency the roadmap should make explicit (Product Catalog phase should ship its stock command service with a concurrency-safety test before either checkout-writing phase is considered done).

---

### Pitfall 4: Checkout succeeds with no open shift, or a shift silently spans days

**What goes wrong:**
Two related edge cases: (1) a sale is completed while no shift is open for that cashier/terminal — orphaning the transaction from cash-drawer reconciliation entirely; (2) a shift is opened and never explicitly closed (cashier forgets, app crashes, terminal loses network), so it silently spans into the next business day, corrupting per-day reconciliation math and potentially allowing a "yesterday's shift" to keep absorbing today's sales.

**Why it happens:**
Shift-open enforcement is easy to bolt on as a UI guard ("disable the checkout button if no shift") but that's client-side and bypassable/racy exactly like Pitfalls 1–2 — a client that thinks a shift is open (stale cache, offline queue replay) can still submit a checkout call after the shift was closed by another action. Cross-day drift happens because "close the shift" is a manual cashier action with no forcing function; nothing in a typical implementation asks "has this shift been open longer than a business day?"

**How to avoid:**
- Enforce shift-open as a server-side precondition inside the checkout use case itself (not just a route guard) — look up the active shift for `(cashier_id, terminal_id)` inside the same transaction that writes the sale, and reject with a specific `error_code` (e.g. `NO_OPEN_SHIFT`) if none exists. This mirrors the existing legacy pattern (`docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`, and `CONCERNS.md`'s note that new POS mutations must stay behind "selected active terminal, terminal-location binding, location grants, compliance state, and open-shift checks") — carry that same discipline into the new Availment checkout path rather than assuming it'll be added later.
- Preserve the existing DB-level constraint pattern noted in the reconciliation doc ("one open shift per cashier and per terminal enforced with DB-level constraints") in the new schema — a unique partial index on `(terminal_id) WHERE status = 'open'` (or equivalent) is stronger than an application-level check.
- Add an explicit **stale-shift detection** job/check: flag (don't silently auto-close) any shift open past a configurable threshold (e.g. > 20 hours, or past local midnight) for operator/manager attention — auto-closing risks corrupting reconciliation math the same way a hidden bug would; surfacing it forces a human decision.
- Log manual "no-sale" drawer pops explicitly — the reconciliation doc flags this as a confirmed gap in the legacy system ("a manual 'no-sale' drawer pop isn't logged anywhere"); the new Shift/Cash-Drawer module should not repeat this, since unlogged drawer opens are a well-known internal-theft blind spot in POS systems generally.

**Warning signs:**
- Shift-open checks exist only in a frontend route guard or disabled-button state, not in the checkout use case's own validation.
- No unique constraint (DB-level) preventing two simultaneously-open shifts for the same terminal.
- No query/report that can answer "which shifts are still open and how long has each been open" without manually scanning transaction timestamps.

**Phase to address:**
Shift & Cash Drawer phase must ship before or alongside POS Checkout & Payment — not after. Per the downstream roadmap concern, shift-gating is a checkout precondition, so sequencing checkout ahead of shift enforcement means checkout initially ships with no gate at all (or a bolted-on gate added under time pressure, which tends to be the client-side-only version of this pitfall). The two phases should either be combined or explicitly ordered with Shift gating landing first.

---

### Pitfall 5: Fiscal/compliance gate mis-calibration — either blocks legitimate sales or lets ungated sales through

**What goes wrong:**
Two opposite failure modes, both real:
- **Over-gating:** the policy engine treats "compliance not yet fully verified" as "block all checkout," which is fine for a business that genuinely can't legally sell yet, but wrong if it also blocks businesses mid-verification from doing *any* commerce, including modes that don't require BIR paperwork (e.g., internal testing, non-fiscal transaction types, or a grace period the business is explicitly allowed).
- **Under-gating:** a new checkout/receipt/shift code path (particularly ones added for Storefront online ordering, which didn't exist when the original `compliancePolicyEngine.js` was scoped to POS-only) forgets to call the gate at all, letting a fully ungated sale through a mode nobody thought to wire the check into.

**Why it happens:**
Over-gating happens because "block on any non-`verified` state" is the simplest implementation and nobody stress-tests the false-positive cases (grace periods, non-fiscal modes) until a real vendor is blocked mid-onboarding. Under-gating happens because the gate lives at the POS checkout call site today; when a second entry point to "complete a sale" is added (Storefront checkout, or a new Availment-based flow that isn't literally the old `checkoutPosUseCase`), it's easy to build the new use case by copying checkout/payment/receipt logic without also copying the compliance-gate call, since the gate isn't structurally forced to be present.

**How to avoid:**
- Put the compliance gate check *inside* the shared use-case layer that all checkout paths (POS, Storefront, any future Availment entry point) funnel through — not duplicated per-entry-point. If POS Checkout and Storefront Checkout end up as genuinely separate use cases (likely, given different preconditions), both must call the same policy-engine service function, and a contract/integration test should assert every checkout-completing code path calls it (a grep-based architecture guardrail, in the spirit of the existing `check:architecture` scripts, is a cheap way to enforce this mechanically rather than trusting review).
- Model gating as multiple named modes, not one boolean: e.g. `blocks_checkout`, `blocks_receipt_issuance`, `blocks_shift_open`, each independently evaluable against the specific compliance-mode state, so a business in a legitimate grace period isn't collapsed into the same "blocked" bucket as one with zero compliance evidence.
- Explicitly do **not** repeat the "paperwork presence, not correctness" limitation while it's fresh in scope for this milestone: if the new Fiscal/Compliance phase implements real BIR-rule validation (TIN/PTU/MIN format + cross-field checks) as scoped, make sure that validation runs at the point evidence is submitted (fail fast, actionable error) — not only as a background check that silently marks something "unverified" without telling the vendor why.

**Warning signs:**
- Grep for calls into the compliance policy engine turns up exactly one call site (POS checkout) when Storefront/Fulfillment also complete sales.
- No test fixture exercises "business in grace period, non-fiscal transaction type" as a should-not-be-blocked case.
- Compliance verification failures return a generic "not verified" without which specific rule failed.

**Phase to address:**
Fiscal/Compliance phase owns the policy engine and its gate modes; every phase that adds a new "sale completes" code path (Storefront Online Ordering, Order Fulfillment) must be checked against this gate as part of that phase's own acceptance criteria, not assumed to inherit it for free.

---

### Pitfall 6: Cross-database (Landlord ↔ Tenant) writes for storefront orders treated as a single transaction

**What goes wrong:**
A Storefront order originates from a Landlord-side DGFY Account (or guest) and must ultimately create/update a Tenant-side Availment (the sale record living in that business's `dgfy_business_*`/tenant schema). Landlord and Tenant are separate MySQL databases/connections (`TenantConnector.js`), so there is no native cross-database transaction — MySQL cannot atomically commit a write to the landlord DB and a write to a tenant DB as one unit. A naive implementation writes to one DB, then the other, and either has no failure handling for "first write succeeded, second write failed" (leaving an orphaned/dangling record), or worse, wraps both in application-level try/catch and treats a failure to roll back the first write as an edge case that "shouldn't happen."

**Why it happens:**
This looks like an ordinary two-step service call during development against a healthy local DB where the second call basically never fails, so the missing compensation/reconciliation logic is invisible until a real network blip, deploy-time restart, or tenant DB unavailability window hits in production between step one and step two.

**How to avoid:**
Don't invent a new cross-DB pattern — this platform already has a proven one for exactly this shape of problem, documented in `ARCHITECTURE.md`'s "Storefront Commerce Payment Flow" and `CONCERNS.md`'s PayMongo fragile-area notes: **landlord-owned payment/order-intent session as the durable source of truth, with idempotent tenant-side finalization as a separate, retryable step**, keeping any session that fails to finalize in an explicit **manual-resolution state** rather than silently lost. Apply the same shape to the new Storefront-order → tenant-Availment write:
1. Create the order/payment intent as a landlord-owned record first (this is the durable, reconciliation-visible source of truth — mirrors `CommercePaymentSession`).
2. Finalize into the tenant Availment as a second, **idempotent** step (safe to retry — keyed on the landlord order/session ID so a retry doesn't create a duplicate Availment).
3. If tenant-side finalization fails or the tenant DB is unreachable, leave the landlord record in a `paid_pending_finalization`-style manual-resolution state (exactly as already done for "paid-but-not-finalized" PayMongo sessions per `CONCERNS.md`) rather than silently dropping it or blocking the customer-facing payment confirmation on tenant DB availability.
4. Build the reconciliation/retry job (even a simple periodic sweep) as part of this phase, not as a "later" TODO — this is the exact category of gap `CONCERNS.md` already flags as a live test-coverage and fragility risk for the existing PayMongo flow, so it should not be quietly repeated for the broader Storefront-order case.

**Warning signs:**
- Storefront order creation code performs a landlord write then a tenant write inside a single `try { ... } catch` with no persisted "pending" state in between.
- No idempotency key on the tenant-finalization step (a retried finalize call would create two Availment rows for one order).
- No operator-visible view of "stuck" storefront orders that got landlord-recorded but never became a tenant Availment.

**Phase to address:**
Storefront Discovery & Online Ordering phase must design the order-creation flow around this pattern from the start; Order Fulfillment & Delivery Coordination phase depends on tenant Availments existing reliably, so it inherits risk if this isn't solved first — sequence Storefront Online Ordering's write-path design before Fulfillment work begins consuming it.

---

### Pitfall 7: New Product/Availment schema quietly recreates the legacy Item/IMS coupling

**What goes wrong:**
The single most emphasized known risk in the reconciliation doc (§1, "The Most Important Finding First") is that DGFY and SKUpervisor IMS don't just share a backend — they share the literal `items` table, with `PosTransactionLine.item_id` FK-ing into the same table the IMS uses for raw materials/purchase orders/FIFO costing. The milestone context explicitly requires the new schema NOT repeat this. The realistic way this mistake creeps back in isn't a deliberate decision to reuse the table — it's an incremental one: a developer building the new Product catalog needs "cost price" or "FIFO-costed value" or some other IMS-adjacent concept, finds it's easier to read from the existing IMS tables (or, worse, to reuse the existing item repository/model directly) "just for this one lookup," and that one seam becomes load-bearing.

**Why it happens:**
Reimplementing a genuinely new Product/Availment domain is a lot of work; the IMS tables already have real data (cost prices, categories) that's tempting to read directly rather than re-model. Under phase-deadline pressure, "just query `items` for this field" feels like a shortcut, not an architecture violation, especially since IMS and DGFY still share one backend process and one Sequelize instance today.

**How to avoid:**
- Treat this the same way Phase 5 of this project already treated legacy-code coupling: govern it mechanically, not by review discipline alone. This project already has the tooling pattern for exactly this problem — CMP-01/02/03's manifest-governed compatibility seams, the compat-import ESLint ban, and the `entities/` architecture guardrail scan (`ARCHITECTURE.md`/`Phase 5 complete` note in `PROJECT.md`). Extend that same seam-governance approach to the new `Product`/`Availment` models: no repository in the new Product/Availment modules imports IMS `Item`/`PosTransactionLine` models directly; any genuinely-needed cross-reference (e.g., "this Product used to be this legacy Item, for migration/reporting purposes") goes through an explicit, manifest-registered compatibility seam, not an ad hoc import.
- Decide deliberately (this is called out as still-open in the reconciliation doc §8) whether stock/non-stock and Food/Service/Retail categorization live on the new Product record or per-line — and once decided, make sure the new schema's FKs point only at new DGFY-owned tables, never at `items`.
- Since ADR 0029 already assigns Catalog/Inventory/POS/Storefront ownership boundaries for the *existing* system, write the equivalent boundary statement for the *new* Product domain as its own ADR before implementation starts, explicitly stating "Product/Availment tables are DGFY-owned; no FK or Sequelize model reference into `sku_*`/legacy `items`/`PosTransactionLine`."

**Warning signs:**
- Any new repository under the Product/Availment modules imports a model from `backend/src/models` that isn't itself a new `dgfy_*`-schema model.
- A migration or data-access path that reads `cost_per_unit`, FIFO batch data, or `Item.category` directly from the legacy table instead of through an explicit, reviewed migration/seam.
- The new Product schema's foreign keys reference `items.id` anywhere.

**Phase to address:**
Product Catalog domain phase — this is a foundational decision that must be locked in before Booking, POS Checkout, or Storefront phases build on top of the Product model, since all of them will reference Product/Availment records and inherit whatever coupling mistake ships here.

---

### Pitfall 8: Payment/entity naming collisions with existing landlord-scoped models

**What goes wrong:**
The reconciliation doc already flags that a `Payment` model exists but means *tenant subscription billing*, not order payment. If the new commerce-domain payment/order-payment entities are named generically (`Payment`, `PaymentRecord`, `Transaction`) without checking existing landlord models, they either collide at the model-registration level or — worse — pass code review individually while creating genuine confusion later about which "payment" a given piece of code means (subscription billing vs. an actual sale's tender). `INTEGRATIONS.md` confirms this is a real, populated area: `backend/src/models/Landlord/Payment.js`, `WebhookLog.js`, `CommercePaymentSession.js`, `CommercePaymentRefund.js`, `TenantPaymentAccount.js` already exist for PayPal subscriptions and PayMongo commerce sessions.

**Why it happens:**
Naming is done locally within the new module without a deliberate cross-check against existing landlord models, especially since the new Product/Availment work is explicitly being built "beside legacy," which can create a false sense that the new domain's naming is a clean slate.

**How to avoid:**
Adopt domain-qualified names from the start: `AvailmentPayment` / `PosPaymentAttestation` (or similar) for the new POS/checkout payment record, reserving unqualified `Payment` for the existing subscription-billing meaning. Do a one-time grep across `backend/src/models/Landlord/*` and the new `dgfy_*` schema definitions before finalizing entity names for this milestone.

**Warning signs:**
- A new model file named exactly `Payment.js` anywhere outside the existing subscription-billing module.
- Code comments or PR descriptions that need to clarify "payment (the sale kind), not payment (the subscription kind)."

**Phase to address:**
POS Checkout & Payment phase, at schema-design time — cheap to fix now, expensive later once API contracts and receipts reference the name.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Client-side-only change/tender display without server verification | Instant UI feedback, no round-trip | Reproduces the exact known client-trust bug this milestone must close | Never for the write path; fine as a non-authoritative UI preview only |
| Reading IMS `items`/`PosTransactionLine` directly "just for one field" instead of building the new Product equivalent | Saves re-modeling cost/price or category data | Recreates the shared-schema coupling this milestone exists to remove | Never without an explicit, manifest-registered compatibility seam |
| Skipping `SELECT ... FOR UPDATE` / atomic guarded UPDATE for stock decrement in favor of read-then-write | Simpler code, works in every non-concurrent test | Oversell/negative-stock bugs that only appear under real concurrent load | Never for the shared stock command service; acceptable only for advisory/estimate reads that don't mutate stock |
| Single-step landlord+tenant write with no pending/manual-resolution state | Simpler happy-path code | Orphaned or duplicated records when the second write fails mid-flight | Never for money-moving or Availment-creating flows; low-risk read-only cross-DB lookups can stay simple |
| Auto-closing shifts that exceed a time threshold instead of flagging them | Avoids a manual-intervention UI | Silently corrupts reconciliation math for a shift the system guessed the boundary of | Acceptable only as an operator-triggered "force close with reason" action, never a silent background auto-close |
| Presence-only compliance evidence checks (cert uploaded + marked verified, no rule validation) | Faster to ship the gating engine | Repeats the exact "paperwork presence not correctness" limitation this milestone is meant to improve on | Acceptable as an interim state only if visibly labeled `presence_verified` (not `compliant`) and the roadmap has a follow-up phase for rule validation |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| PayMongo (Storefront QR Ph) | Marking an order paid from the redirect/return URL instead of the webhook | Only transition to `paid` from a verified webhook event (or authenticated server-side poll), exactly as the existing `commercePayments` module already does — extend, don't bypass, that pattern for any new Availment-linked payment |
| PayMongo webhook | Treating webhook delivery as guaranteed exactly-once | Webhook handling must be idempotent (keyed on PayMongo event/session ID) since providers retry; this is already a documented fragile area in `CONCERNS.md` — the new Availment finalization step must inherit the same idempotency discipline, not just the payment session step |
| Cash/card/bank_transfer "gateway" (device bridge / external terminal) | Treating a card/bank_transfer POS sale as equivalently verified to a QR Ph sale because both eventually reach `payment_status = paid` | Use a distinct status tier (Pitfall 2) — don't let the UI or reporting treat attested and gateway-verified payments as the same trust level |
| Landlord ↔ Tenant DB boundary | Treating a Landlord-side write followed by a Tenant-side write as one logical transaction | Landlord-durable-record-first + idempotent tenant finalization + manual-resolution fallback state (Pitfall 6) — no native cross-DB transaction exists in this architecture |
| Device bridge (printer/cash drawer) | Backend or POS client directly manipulating drawer/printer instead of going through the bridge, or trusting a client claim that a drawer action happened | Authorize/audit drawer-open server-side, execute physically only via `backend/device-bridge` (existing boundary per `ARCHITECTURE.md`); log every drawer-open event including manual "no-sale" pops (Pitfall 4) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Row-level `SELECT ... FOR UPDATE` on a single hot Product row for every stock decrement | Checkout latency spikes and lock-wait timeouts during high-traffic windows (promotions, peak hours) for popular items sold from both POS and Storefront simultaneously | Prefer a single atomic guarded `UPDATE ... WHERE quantity >= :qty` over `SELECT FOR UPDATE` + separate `UPDATE` where possible; consider per-unit/reservation-row locking (`SKIP LOCKED`) only if a specific item becomes a proven hot-key bottleneck | Noticeable once concurrent checkout volume against the same SKU exceeds roughly tens of requests/second on one row — unlikely at this project's current beta/production scale, but worth designing for since Storefront + POS concurrency is the whole point of this milestone |
| Compliance policy-engine evaluation re-querying full compliance-mode state on every checkout call | Checkout latency grows as compliance evidence volume grows per tenant | Cache the resolved gate decision per tenant/session with a short TTL or invalidate-on-write, rather than re-evaluating full evidence chains per checkout | Only matters once compliance evidence records per tenant grow large or the policy engine's evaluation becomes non-trivial (multiple joined tables) |
| Tenant-by-tenant reconciliation/audit jobs (already a documented scaling limit in `CONCERNS.md` for schema-sync/audit scripts) extended to cover new Availment/stock-ledger audits | Job runtime grows linearly with tenant count; maintenance windows lengthen | Keep new audit/reconciliation jobs bounded-concurrency and per-tenant-reportable from day one, following the existing pattern already established for `audit-fifo-drift.js`/`audit-location-stock-parity.js` | Becomes visible once tenant count grows past what a single sequential sweep can finish inside an acceptable window |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting `change_amount` as client input on checkout | Cashier or compromised client can pocket/misreport change; direct financial-integrity bug | Compute `change_due` server-side from `cash_received` and the server-computed total; never accept `change_amount` as write input (Pitfall 1) |
| Trusting client-declared `payment_status: 'paid'` for non-gateway methods | Orders/receipts issued for sales that never actually collected payment | Split into gateway-verified vs. attested tiers with an audit trail; never allow a plain client PATCH to set `paid` (Pitfall 2) |
| Fiscal/receipt issuance without checking the compliance gate on every sale-completing code path | Ungated sales issue fiscal-looking receipts for a business that isn't legally cleared to issue them | Centralize the gate call in shared use-case code, not per-entry-point; add a mechanical guardrail test asserting all checkout paths call it (Pitfall 5) |
| New Product/Availment repositories importing legacy IMS models directly | Recreates the exact schema-coupling risk this milestone exists to remove, and creates an unreviewed privilege/data-boundary crossing between DGFY commerce data and IMS raw-material/costing data | Manifest-governed seam requirement, ESLint compat-import ban extended to the new modules (Pitfall 7) |
| Orphaned "paid" landlord payment/order records with no corresponding tenant Availment after a cross-DB failure | Customer believes they paid; business never sees the order; support/finance discrepancy with real money implications | Manual-resolution state + idempotent retry/finalize + operator-visible stuck-order view (Pitfall 6) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Compliance over-gating blocks all checkout during a legitimate grace/verification-in-progress period | A newly onboarded, legitimately-in-progress vendor can't sell at all, damaging first-week trust in the platform | Mode-scoped gating (`blocks_checkout` vs `blocks_receipt_issuance` vs `blocks_shift_open`) evaluated against the actual compliance-mode state, not a single blanket boolean (Pitfall 5) |
| Checkout silently fails or gives a generic error when no shift is open | Cashier doesn't know *why* checkout failed mid-rush, escalates to "the system is broken" | Return a specific `NO_OPEN_SHIFT` error code the frontend can render as an actionable "open a shift first" prompt, not a generic 400/500 |
| Stock decrement failure surfaces after payment/receipt steps have already started | Customer is told they've paid for an item that turns out to be unavailable, or a receipt prints for an item that wasn't actually deducted | Perform the atomic stock guard (Pitfall 3) before any payment-commit or receipt-render step in the checkout use case's ordering, so an oversell attempt fails fast and cleanly |
| Storefront order appears "confirmed" to the customer before the tenant-side Availment is guaranteed to exist | Customer sees a paid/confirmed order; business staff never sees it appear in their POS/Availment list because tenant finalization silently failed | Only surface "confirmed" to the customer once tenant finalization succeeds, or clearly communicate a "processing" interim state if the landlord record is durable but tenant finalization hasn't completed yet (Pitfall 6) |

## "Looks Done But Isn't" Checklist

- [ ] **Server-verified totals:** Often verifies the order/line total but not the cash-tender/change arithmetic — verify a checkout test exists asserting rejection when `cash_received < total`.
- [ ] **Payment confirmation:** Often has a `payment_status` field that "looks" server-owned but is still writable via a plain client PATCH for non-gateway methods — verify only gateway-webhook code paths and explicitly-attesting authenticated staff actions can set the paid-equivalent status.
- [ ] **Stock/slot decrement:** Often passes every manual/local test but uses a read-then-write pattern — verify there's a concurrency test firing simultaneous checkout/booking requests against one fixed-stock item/slot and asserting no oversell.
- [ ] **Shift gating:** Often exists as a frontend disabled-button guard — verify the checkout use case itself rejects a sale server-side when no shift is open, independent of what the UI allowed the client to attempt.
- [ ] **Compliance gate coverage:** Often wired into the original POS checkout call site only — verify every sale-completing code path (POS, Storefront, any Fulfillment-triggered status transition that issues a receipt) calls the same shared gate function.
- [ ] **Cross-DB order finalization:** Often "works" in every local dev run because the tenant DB never goes down mid-request — verify there's a manual-resolution/pending state and an idempotent retry path, not just a happy-path two-step write.
- [ ] **Product/Availment schema independence:** Often "new" at the model-definition level while still importing or FK-referencing legacy IMS `items`/`PosTransactionLine` under the hood for a "just this one field" convenience lookup — verify with a grep/guardrail, not a read-through of the schema file alone.
- [ ] **Cash-drawer audit completeness:** Often logs drawer-open events triggered by a completed sale but not manual "no-sale" pops — verify every drawer-open code path (sale-triggered and manual) writes an audit event.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Client-trusted change/`payment_status` shipped and later discovered | MEDIUM | Add server-side computation/verification behind a feature flag, backfill an audit query flagging historical mismatches for manual review, then flip enforcement on; no schema change needed if fields already exist, just move authority server-side |
| Stock oversell already occurred in production | MEDIUM–HIGH | Reconcile via the append-only `StockMovement`/equivalent ledger (source of truth for what actually happened) against current on-hand counts; manually resolve negative-stock items; then ship the atomic-guard fix and a regression test before reopening the affected flow |
| Shift left open across a day boundary already happened | LOW–MEDIUM | Add the stale-shift detection/flagging job retroactively; operator manually force-closes flagged shifts with a documented reason; audit reconciliation reports for the affected date range |
| Fiscal gate found to be under-gating a live code path | HIGH (compliance exposure) | Immediately wire the missing gate call behind a fast-follow deploy; audit which sales/receipts were issued ungated during the exposure window for compliance reporting; this is the most expensive pitfall to recover from late, which is the strongest argument for the mechanical guardrail test up front |
| Landlord/tenant orphaned records discovered in production | MEDIUM | Build the reconciliation sweep (if not already built) to find landlord records with no matching tenant Availment; replay idempotent finalization against each; escalate genuinely stuck ones through the existing manual-resolution operator flow already established for PayMongo |
| Product schema found to have quietly FK'd into legacy `items` | HIGH | This is effectively re-doing the coupling extraction — requires a dedicated migration to move the data/FK onto a genuinely new table plus a compatibility-seam bridge for any code still depending on the old reference during the transition; treat as its own mini-project, not a quick patch |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Client-trusted change/tender arithmetic | POS Checkout & Payment | Test: checkout rejects when `cash_received < total`; `change_amount` not accepted as input anywhere in the DTO |
| 2. Client-declared `payment_status` for non-gateway methods | POS Checkout & Payment (schema); Fiscal/Compliance (receipt-issuance audit) | Test: no route allows a plain client PATCH to set the paid-equivalent status; attested payments carry `attested_by`/`shift_id` |
| 3. Concurrent stock/slot double-decrement | Product Catalog (stock command service); consumed by POS Checkout & Payment and Storefront Online Ordering | Concurrency test: N simultaneous checkout/booking calls against one fixed-stock item/slot never oversell |
| 4. No-shift checkout / cross-day shift drift | Shift & Cash Drawer, sequenced before or with POS Checkout & Payment | Test: checkout use case (not just route/UI) rejects with `NO_OPEN_SHIFT`; DB-level unique constraint prevents two open shifts per terminal; stale-shift flag job exists |
| 5. Fiscal gate over/under-gating | Fiscal/Compliance; re-checked in Storefront Online Ordering and Order Fulfillment as new sale-completing paths land | Guardrail test asserting every sale-completing code path calls the shared gate function; fixture tests for grace-period and non-fiscal-mode should-not-block cases |
| 6. Landlord↔Tenant cross-DB write consistency | Storefront Discovery & Online Ordering (design); Order Fulfillment & Delivery Coordination (depends on it) | Test: simulated tenant-DB failure mid-finalization leaves a manual-resolution record, not an orphan or duplicate; idempotent retry produces exactly one Availment |
| 7. Product/Availment schema recreating IMS coupling | Product Catalog domain (foundational, before Booking/POS/Storefront build on it) | Guardrail/grep test: no new Product/Availment repository imports legacy `Item`/`PosTransactionLine` models or FKs into `items` outside a manifest-registered seam |
| 8. Payment entity naming collision with existing landlord `Payment` (subscription billing) | POS Checkout & Payment, at schema-design time | Review checklist item: new payment-record model names are domain-qualified and don't collide with `backend/src/models/Landlord/Payment.js`'s existing meaning |

## Sources

- `.planning/PROJECT.md` — current milestone scope, phase history, architecture constraints (project source, HIGH confidence)
- `refactor-do-not-commit/DGFY_Plan_vs_Reality_Reconciliation.md` — §1, §5, §6, §8 known-risk findings and open questions (project source, HIGH confidence)
- `.planning/codebase/ARCHITECTURE.md` — stock-effect ownership (ADR 0029), Storefront Commerce Payment Flow, module/layer boundaries (project source, HIGH confidence)
- `.planning/codebase/CONCERNS.md` — PayMongo readiness/manual-resolution fragile-area notes, tenant schema drift precedent, fragile POS fiscal/terminal area notes (project source, HIGH confidence)
- `.planning/codebase/INTEGRATIONS.md` — PayMongo/PayPal payment integration boundaries, landlord-owned commerce payment models (project source, HIGH confidence)
- [Idempotency Keys: The API Pattern That Saves You From Duplicate Payments and Phantom Records](https://dev.to/apikumo/idempotency-keys-the-api-pattern-that-saves-you-from-duplicate-payments-and-phantom-records-51b2) — general idempotent-payment-flow pattern (web, MEDIUM confidence, corroborates existing codebase pattern)
- [API idempotency | Adyen Docs](https://docs.adyen.com/development-resources/api-idempotency) — payment-provider idempotency-key convention reference (web, MEDIUM confidence)
- [Replacing Redis with MySQL: Scaling Inventory Reservations with SKIP LOCKED](https://dasroot.net/posts/2026/06/replacing-redis-mysql-scaling-inventory-reservations-skip-locked/) — atomic guarded UPDATE / SKIP LOCKED pattern for inventory race conditions (web, MEDIUM confidence)
- [Implementing Concurrent Control with ORM — Pessimistic and Optimistic Locking](https://leapcell.io/blog/implementing-concurrent-control-with-orm-a-deep-dive-into-pessimistic-and-optimistic-locking) — SELECT FOR UPDATE vs. optimistic-locking tradeoffs (web, MEDIUM confidence)

---
*Pitfalls research for: DGFY v2.0 Commerce Domain (Product, POS Checkout/Payment, Shift/Cash-Drawer, Fiscal/Compliance, Storefront Online Ordering, Order Fulfillment/Delivery)*
*Researched: 2026-07-12*
