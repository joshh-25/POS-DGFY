# Phase 10: Storefront Discovery & Online Ordering - Research

**Researched:** 2026-07-13
**Domain:** Consumer storefront discovery + async webhook-driven online ordering with a first-in-system Landlord→Tenant cross-database finalization; real PayMongo QR Ph payment sessions
**Confidence:** HIGH (all findings grounded in in-repo pattern references; no external dependency guesses)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Real PayMongo QR Ph integration (not record-only). Dynamic QR Ph via the Payment Intent workflow, webhook-driven confirmation, landlord-owned session records. Single biggest scope commitment in this phase.
- **D-02:** No 1% DGFY platform-fee split for now. Single DGFY-controlled PayMongo account collects the full amount. **Must remain adjustable later** — split routing is decided at PayMongo intent-creation time (provider-side config), NOT baked into the order/payment schema.
- **D-03:** No refunds/reversals. A cancelled/failed online order is a fulfillment concern (Phase 11), not a payment-reversal concern.
- **D-04:** Async, webhook-driven order finalization is inherent — finalization into the tenant Availment happens on webhook receipt, not on order-submit.
- **D-05:** Guest verification via email OTP (not phone OTP). Phone captured (contact, unverified) + email OTP-verified via existing `emailOtp.js`. No new SMS provider.
- **D-06:** Guest orders create a lightweight persistent guest identity keyed by verified email, persisting across orders. Lives Landlord-side. `customer_account_id` is an application-level cross-DB reference, not a DB FK.
- **D-07:** Placing an order reserves stock immediately (temporary hold), not just validate-at-submit + decrement-at-finalize.
- **D-08:** Reservation expiry is tied to the PayMongo QR Ph session's own expiry window — one shared clock.
- **D-09:** Expired reservations auto-release; the order moves to an expired/abandoned status. No manual step.
- **D-10:** Fail fast if the tenant DB is unreachable at order-placement time — reject before any payment session is created.
- **D-11:** Scheduled pickup/delivery is independent of Booking. Simple `requested_for` timestamp validated against business hours, NO capacity mechanism.
- **D-12:** Business-hours + minimum-lead-time constraint required. Exact lead-time value is research/planner's call.
- **D-13:** Maximum advance-scheduling window is capped. Exact cap value is research/planner's call.

### Claude's Discretion
- Exact lead-time minimum and max-advance-scheduling cap (D-12, D-13) — informed by legacy precedent if any.
- Exact PayMongo QR Ph session table shape, webhook handler design, and idempotency mechanism for order→Availment finalization.
- Whether the manual-resolution state needs an operator-facing resolution API in Phase 10, or just the data-model/state with tooling deferred to Phase 11 — at minimum the state must exist and be reachable, never silent.
- Exact discovery/search mechanics (proximity radius, category filters, "open now", full-text matching) building on `storefront_discovery_index` + Redis geo caching.
- Reservation table/mechanism shape (new table vs status flag) — as long as it satisfies D-07 through D-10.

### Deferred Ideas (OUT OF SCOPE)
- Mobile/SMS OTP for guest checkout — no provider exists.
- 1% DGFY platform-fee split settlement (ADR 0027's full pattern) — design must stay adjustable (provider-side config, not schema-baked).
- Refunds/reversals on storefront payments.
- Booking-style branch-capacity for scheduled orders.
- New frontend apps (`dgfy-storefront`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STF-01 | Browse/search stores & Products via map-based discovery surface | `storefront_discovery_index` landlord projection + `ST_Distance_Sphere` geo query + FULLTEXT item search (`geo_store_items`) + Redis cache — legacy `geoSearchRepository.js` is the exact template to re-implement under `apps/dgfy-api` (§Discovery/Search) |
| STF-02 | View store page, add Products to a cart | Store page reads discovery projection + Phase 8 `modules/products` catalog; cart is a client/request-shaped payload validated server-side at placement (legacy `checkout_payload` JSON pattern) (§Order Placement) |
| STF-03 | Guest checkout (durable contact) OR logged-in DGFY Account, no forced account creation | Reuse `emailOtp.js` (add new purpose) for guest email verification; landlord-side persistent guest identity keyed by verified email; `authenticateAccount` optional for logged-in path (§Guest Identity) |
| STF-04 | pickup/delivery, immediate/scheduled, payment method (cash / GCash / Credit Card via PayMongo) | `requested_for` + business-hours/lead-time/advance-window validation; PayMongo QR Ph session (GCash/Card); cash = no-session branch (§Scheduling, §PayMongo) |
| STF-05 | Landlord-first durable order → idempotent tenant Availment finalization, safe against interrupted cross-DB write, explicit manual-resolution state | Landlord-owned session/order (`commercePaymentRepository` pattern) + webhook finalize into `modules/availments` + natural idempotency guard + `finalize_failed_manual_resolution_required` state + retry usecase (§Cross-DB Finalization) |
</phase_requirements>

## Summary

Phase 10 re-implements, under `apps/dgfy-api`, a payment/ordering pattern that already exists and is proven in the legacy `backend/` monolith (ADR 0027 + `backend/src/modules/commercePayments` + `backend/src/modules/store`). The single most important research finding is that **you are not inventing this flow — you are porting a battle-tested one**, minus split (D-02) and refunds (D-03). Every hard mechanic the CONTEXT flags as uncertain (QR Ph lifecycle, webhook signature verification, idempotency, manual-resolution status, landlord-owned-session-resolves-tenant) has a concrete, readable in-repo implementation to mirror.

The genuinely new work — never done before in this codebase — is **the Landlord→Tenant cross-database write for a consumer order**. Phase 9's `availments` finalize is entirely tenant-side and POS-context-bound (it requires an open shift, a terminal, and a cashier, and runs the `pos.checkout` compliance gate). A storefront order has none of those. So Phase 10 cannot call `buildFinalizeAvailmentUseCase` as-is; it needs a **storefront-order finalize path** in the availments module (or a sibling) that creates an Availment with a `customer_account_id` cross-DB reference, no shift/terminal, payment already confirmed, and converts a stock reservation into a sale effect — all inside one tenant-DB transaction, invoked from the webhook handler after the landlord order is durably recorded.

Stock reservation (D-07..D-10) is the second net-new decision. ADR 0029 explicitly deferred reservation semantics and mandates that **only Inventory writes stock effects**. Reservation is a stock effect, so it must be an Inventory-owned capability (a reservation table + `available = on_hand - active_reservations`) that Storefront *requests* via a port, exactly like `recordSaleEffect`. The reservation write is the tenant-DB write that D-10 fails-fast on.

**Primary recommendation:** Build a new `apps/dgfy-api/src/modules/storefront` module (discovery + store page + cart + order placement) and a new `apps/dgfy-api/src/modules/commercePayments` module (landlord-owned QR Ph sessions + webhook + finalize), re-implementing the legacy patterns file-for-file with split/refund excised. Add an Inventory-owned reservation capability and a storefront-order finalize path in `modules/availments`. Use native `fetch` for the PayMongo client (apps/dgfy-api has no axios and already uses `fetch`) — **zero new external packages**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Map/store/product discovery & search (STF-01) | API / Backend (Landlord DB) | Cache (Redis) | Reads the landlord `storefront_discovery_index` projection; spatial + FULLTEXT are DB-owned; Redis is a cache with DB fallback |
| Store page + cart (STF-02) | API / Backend | — | Cart is a validated request payload, not persisted server state until placement; catalog from Phase 8 products |
| Guest identity + email OTP (STF-03, D-05/D-06) | API / Backend (Landlord DB) | — | Accounts/identity are landlord-scoped (per existing architecture); OTP infra is landlord-side |
| Payment session lifecycle (STF-04, D-01) | API / Backend (Landlord DB) | External (PayMongo) | Landlord-owned session so webhooks resolve tenant before touching tenant DB (ADR 0027 #3, ARCHITECTURE.md:201) |
| Stock reservation (D-07..D-10) | API / Backend (Tenant DB, Inventory-owned) | — | ADR 0029: only Inventory records stock effects; reservation reduces available-to-sell = a stock effect |
| Order→Availment finalization (STF-05) | API / Backend (Landlord order → Tenant Availment) | External (PayMongo webhook trigger) | The cross-DB seam; landlord record is durable-first, tenant finalize is idempotent |
| Scheduling validation (STF-04, D-11..D-13) | API / Backend | — | Pure server-side validation against branch business hours + lead/advance windows |

## Standard Stack

### Core (all already present — no installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | ^4.22.2 | Routing (routes → controllers → usecases → repos → models) | Established layering across all `apps/dgfy-api` modules [VERIFIED: apps/dgfy-api/package.json] |
| `sequelize` | ^6.37.8 | Landlord + tenant ORM, transactions, row locks | All finalize/idempotency uses `sequelize.transaction` + `LOCK.UPDATE` [VERIFIED: availmentRepository.js:434-439] |
| `mysql2` | ^3.6.5 | MySQL driver; `ST_Distance_Sphere`, FULLTEXT | Geo + item search run as raw SQL over MySQL spatial funcs [VERIFIED: geoSearchRepository.js:90] |
| `redis` | ^4.6.13 | Discovery/geo-search cache | `apps/dgfy-api/src/config/redis.js` already exists; `setEx` TTL pattern [VERIFIED: apps/dgfy-api/src/config/redis.js, geoSearchRepository.js:213] |
| `crypto` (Node built-in) | — | HMAC-SHA256 webhook signature verify, request_hash, OTP hash | Legacy signature verify uses `crypto.createHmac('sha256', secret)` + `timingSafeEqual` [VERIFIED: paymongoService.js:546-554] |
| **native `fetch`** (Node ≥18 built-in) | — | PayMongo HTTP client | apps/dgfy-api has **no axios**; already uses `fetch` in `infra/backendProxy.js` and `infra/deviceBridgeClient.js` [VERIFIED: grep] |
| `jsonwebtoken` | ^9.0.2 | Guest-checkout-proof token (optional, legacy used a signed proof JWT) | Present in deps [VERIFIED: apps/dgfy-api/package.json] |
| `nodemailer` | ^9.0.1 | Email OTP delivery (via existing `emailService`) | `emailOtp.js` depends on it [VERIFIED: emailOtp.js:4] |

### Supporting (existing modules to call, never duplicate)

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `apps/dgfy-api/src/infra/emailOtp.js` | Guest email verification | Add a new `EMAIL_OTP_PURPOSES` value (e.g. `storefront_guest_checkout`); request+verify (D-05) |
| `apps/dgfy-api/src/modules/availments` | Availment creation/finalize | Storefront finalize creates the Availment; needs a NEW non-POS finalize path (see gap below) |
| `apps/dgfy-api/src/modules/inventory` | Sole stock writer | Reservation + sale effects requested through it (ADR 0029) |
| `apps/dgfy-api/src/modules/products` | Catalog snapshots | Cart line pricing/name snapshots at placement |
| `apps/dgfy-api/src/infra/tenantConnector.js` | Resolve tenant DB by name | Cross-DB step; throws `TenantDatabaseUnavailableError` for fail-fast (D-10) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| native `fetch` | add `axios` (legacy parity) | axios matches legacy `paymongoService.js` line-for-line, but adds a dependency; `fetch` keeps zero-new-packages and matches apps/dgfy-api convention. **Recommend `fetch`.** |
| Inventory-owned reservation table | status flag on product/stock row | A flag can't express per-order holds, expiry, or auto-release cleanly and risks lost-update races. **Recommend a reservation table.** |
| Reuse Phase 9 `finalizeAvailment` | new storefront finalize usecase | Phase 9 finalize hard-requires open shift + terminal + cashier + `pos.checkout` gate — none apply online. **Recommend a new path.** |

**Installation:** None required. All dependencies present in `apps/dgfy-api/package.json`.

## Package Legitimacy Audit

**No new external packages are introduced by this phase.** The PayMongo HTTP client uses Node's built-in `fetch` and `crypto`; all ORM/cache/mail dependencies already exist in `apps/dgfy-api/package.json` and were verified this session.

- **Packages removed due to [SLOP] verdict:** none
- **Packages flagged as suspicious [SUS]:** none
- **New installs requiring `checkpoint:human-verify`:** none

## Architecture Patterns

### System Architecture Diagram

```
                          CONSUMER (guest or DGFY account)
                                     │
        ┌────────────────────────────┼─────────────────────────────┐
        │ (browse)                    │ (place order)                │ (poll status)
        ▼                             ▼                              ▼
  GET /discovery/search       POST /storefront/checkout        GET /storefront/orders/:ref
        │                             │                              │
        ▼                             ▼                              │
 ┌──────────────┐        ┌────────────────────────────┐             │
 │ Discovery UC │        │  PlaceOrder UC (Landlord)  │             │
 │ (Landlord DB)│        │  1. validate cart+contact  │             │
 │ Redis cache  │        │  2. schedule validation    │             │
 │  └─fallback→ │        │     (D-11..D-13)           │             │
 │  storefront_ │        │  3. guest identity / OTP   │─(D-05/D-06)─┐│
 │  discovery_  │        │     (Landlord DB)          │             ││
 │  index +     │        │  4. DURABLE order record   │◄── Landlord-first (STF-05)
 │  geo_store_  │        │     status=pending_payment │             ││
 │  items       │        │  5. RESERVE stock ─────────┼──► Inventory port (Tenant DB)
 └──────────────┘        │     (D-07; fail-fast D-10) │     available = on_hand − reserved
                         │  6. create QR Ph session ──┼──► PayMongo  (createPaymentIntent
                         │     expires_at = 5 (D-08)  │     → createPaymentMethod(qrph)
                         │  7. return QR + ref        │     → attach → next_action.code)
                         └────────────┬───────────────┘             ││
                                      │ (customer scans & pays,     ││
                                      │  minutes later — async D-04)││
                                      ▼                             ││
                    POST /commerce-payments/paymongo/webhook        ││
                                      │                              │
                          verify HMAC-SHA256 signature (raw body)   │
                          + timestamp tolerance (replay guard)      │
                                      │                              │
                    ┌─────────────────┼──────────────────┐          │
             payment.paid        qrph.expired /      account.* /    │
                    │            payment.failed       refund.* ─────┘ (IGNORE per D-02/D-03)
                    ▼                 │
        FINALIZE (idempotent)   RELEASE reservation
        ─ guard: already        ─ order → expired/failed
          finalized? return     ─ session → expired/failed (D-09)
        ─ resolve tenant
          (session.tenant_id)
        ─ ONE tenant txn:
            • create Availment (customer_account_id ref)
            • reservation → sale effect (Inventory)
            • payment/receipt rows
        ─ write availment_id back to landlord order+session
        ─ session/order → finalized
             │
             ├─ tenant finalize THREW after paid?
             ▼
        order+session → finalize_failed_manual_resolution_required  (NEVER silent — STF-05)
             │
             ▼
        operator retry endpoint (mirror legacy retry usecase) → re-run finalize idempotently
```

### Recommended Project Structure
```
apps/dgfy-api/src/modules/
├── storefront/              # NEW — discovery, store page, cart, order placement
│   ├── routes.js            # public GET discovery; POST checkout (auth optional)
│   ├── controllers/
│   ├── usecases/            # searchDiscovery, getStorePage, placeOrder, getOrderStatus, requestGuestOtp
│   ├── repositories/        # storefrontDiscoveryRepository (Landlord), guestIdentityRepository (Landlord), storefrontOrderRepository (Landlord)
│   └── entities/
├── commercePayments/        # NEW — landlord-owned QR Ph sessions + webhook + finalize
│   ├── routes.js            # POST /commerce-payments/paymongo/webhook (raw body!)
│   ├── controllers/
│   ├── usecases/            # createQrphSession, handlePayMongoWebhook, finalizePaidOrder, retryFinalization
│   ├── repositories/        # commercePaymentRepository (Landlord)
│   └── services/            # payMongoClient.js (native fetch; createQrphPaymentIntent, verifyWebhookSignature)
├── availments/              # EXISTING — ADD storefront-order finalize path (no shift/terminal)
└── inventory/               # EXISTING — ADD reservation capability (reserve / release / commit)

apps/dgfy-api/src/models/
├── Landlord/                # commerce_payment_sessions, storefront_orders, storefront_guest_identities,
│                            #   tenant_payment_accounts, storefront_discovery_index (mirror), geo_store_items (mirror)
└── Tenant/                  # inventory_reservations (NEW, Inventory-owned)
```

### Pattern 1: Landlord-owned session resolves tenant BEFORE tenant write
**What:** The payment session and durable order live in the Landlord DB. The webhook arrives with only PayMongo IDs + metadata; the handler resolves the session (by metadata `commerce_payment_session`, then payment_intent id, then payment id), reads `session.tenant_id`, then opens the tenant connection to finalize.
**When to use:** Every cross-DB write in this phase.
**Example:**
```javascript
// Source: backend/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js:34-45 (legacy pattern)
const tenant = await commercePaymentRepository.findTenantById(plainSession.tenant_id);
const sequelizeInstance = await tenantConnector.getConnection(tenant); // resolve tenant AFTER landlord truth
// ... run tenant-side finalize inside dbStore/tenant context
```
```javascript
// Source: backend/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js:214-233
// session resolution order: metadata reference → payment_intent id → payment id
const findSessionForResource = async (resource) => {
  const ref = getSessionReference(resource);            // attrs.metadata.commerce_payment_session
  if (ref) { const s = await repo.findSessionByPublicReference(ref); if (s) return s; }
  const piId = getPaymentIntentId(resource);
  if (piId) { const s = await repo.findSessionByProviderPaymentIntent(piId); if (s) return s; }
  const payId = getPaymentId(resource);
  if (payId) return repo.findSessionByProviderPayment(payId);
  return null;
};
```

### Pattern 2: PayMongo dynamic QR Ph via Payment Intent (3-call dance)
**What:** QR Ph is created with `createPaymentIntent` → `createPaymentMethod({type:'qrph'})` → `attachPaymentIntent`; the QR image URL and expiry come from `attachedIntent.attributes.next_action.code`.
**When to use:** QR Ph session creation at placement (GCash/Card rails).
**Example:**
```javascript
// Source: backend/src/services/paymongoService.js:284-323 (legacy; re-implement with native fetch)
async createQrphPaymentIntent({ amount, currency='PHP', description, billing, metadata, returnUrl }) {
  const paymentIntent  = await this.createPaymentIntent({ amount, currency, description,
                            paymentMethodAllowed: ['qrph'], metadata /* NO splitPayment per D-02 */ });
  const paymentMethod  = await this.createPaymentMethod({ type: 'qrph', billing, metadata });
  const attachedIntent = await this.attachPaymentIntent({ paymentIntentId: paymentIntent.id,
                            paymentMethodId: paymentMethod.id, returnUrl });
  const nextAction = attachedIntent?.attributes?.next_action || {};
  const code = nextAction?.code || {};
  return { paymentIntent, paymentMethod, attachedIntent,
           qrCodeImageUrl: code?.image_url ?? null,
           expiresAt: code?.expires_at ?? nextAction?.expires_at ?? attachedIntent?.attributes?.expires_at ?? null };
}
```
- **Base URL:** `https://api.paymongo.com/v1` (unified test/live; overridable via `PAYMONGO_API_BASE_URL`) [CITED: ADR 0027 #16, paymongoService.js:33].
- **Auth:** HTTP Basic — `Authorization: Basic base64(SECRET_KEY + ':')` [VERIFIED: paymongoService.js:67].
- **D-02 excision:** simply pass **no `split_payment`** on `createPaymentIntent` and store no `split_payload`. The legacy `attributes.split_payment` is conditional (`if (splitPayment)`) — omitting it is the entire change. Because split is a provider-side arg at intent creation, a future phase can re-add it **without any schema migration** (satisfies the "keep adjustable" clause of D-02).

### Pattern 3: Webhook signature verification (must use RAW body)
**What:** HMAC-SHA256 over `` `${timestamp}.${rawBody}` `` compared with `timingSafeEqual`; reject stale timestamps.
**When to use:** First line of the webhook handler, before any DB work.
**Example:**
```javascript
// Source: backend/src/services/paymongoService.js:499-558
// Header: paymongo-signature: t=<ts>,te=<testSig>,li=<liveSig>
const expected = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
const ok = expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(provided,'hex'), Buffer.from(expected,'hex'));
// reject if |now - t| > PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS (default 300)
```
- **CRITICAL:** the webhook route MUST capture the **raw request body** (e.g. `express.raw()` or a `req.rawBody` capture) — signature is computed over raw bytes, not the parsed JSON. The controller passes `rawBody: req.rawBody` [VERIFIED: commercePaymentHandlers.js:40].
- Events to subscribe/handle for Phase 10: **`payment.paid`** (finalize), **`payment.failed`** (release+fail), **`qrph.expired`** (release+expire). **Ignore** `account.*` and `payment.refunded`/`payment.refund.updated` (D-02/D-03) [VERIFIED: handlePayMongoCommerceWebhookUseCase.js:264-304].

### Pattern 4: Idempotent finalize with natural guard + row lock
**What:** The finalize is safe to call twice (duplicate webhook, retry) because (a) a status/foreign-id guard short-circuits an already-finalized session, and (b) the tenant Availment write row-locks and rejects non-draft.
**Example:**
```javascript
// Source: finalizePaidCommerceSession.js:29-32 — natural idempotency guard
if (plainSession.pos_transaction_id || plainSession.tracking_pin || plainSession.status === 'finalized') {
  return plainSession; // already finalized — no-op
}
// Source: availmentRepository.js:436-442 — row-lock + non-draft rejection inside the txn
const availment = await AvailmentModel.findOne({ where:{...}, lock: transaction.LOCK.UPDATE });
if (availment.status !== 'draft') throw new AvailmentFinalizedError();
```

### Anti-Patterns to Avoid
- **Parsing the webhook body before signature verification** — breaks HMAC (raw bytes differ from re-serialized JSON). Always verify against `req.rawBody`.
- **Two independent timers for session expiry and reservation expiry** — D-08 forbids it. Persist ONE `expires_at` (the PayMongo `next_action.code.expires_at`) and stamp it on both the session and the reservation.
- **Storefront writing stock directly** — ADR 0029 boundary rule #2. Reserve/commit/release must go through an Inventory port.
- **Calling Phase 9 `finalizeAvailment` for online orders** — it demands open shift + terminal + cashier + `pos.checkout` gate. Build a storefront finalize path.
- **Baking the split into the schema** — D-02: no `split_payload`/recipient columns should be *required*; split is a provider arg. (Legacy has `split_payload`/`platform_fee_centavos` columns — you may keep nullable columns for future-proofing, but nothing in Phase 10 populates or requires them.)
- **Silently treating a paid-but-unfinalized order as done** — STF-05 + ADR 0027 #8: it must enter a manual-resolution status.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PayMongo signature verify | Custom HMAC comparison | Port `paymongoService.verifyWebhookSignature` (timing-safe, tolerance) | Timing attacks + replay; legacy already correct [VERIFIED: paymongoService.js:499] |
| Email OTP | New OTP table/logic | `emailOtp.js` (`requestEmailOtp`/`verifyEmailOtp`) + a new purpose | Hashing, TTL, attempt-limit, single-active-OTP already solved [VERIFIED: emailOtp.js] |
| Spatial "nearby stores" | Manual haversine in JS | `ST_Distance_Sphere(POINT(lng,lat), POINT(:lng,:lat))/1000` | MySQL spatial + `(latitude,longitude)` index; POINT is (lng,lat) SRID 4326 [VERIFIED: geoSearchRepository.js:57-113] |
| Item text search | LIKE '%q%' | MySQL `MATCH(...) AGAINST(:q IN BOOLEAN MODE)` on `geo_store_items` | FULLTEXT is indexed; legacy sanitizes boolean operators [VERIFIED: geoSearchRepository.js:43-47] |
| Discovery cache | New cache layer | Existing Redis `config/redis.js` + `setEx` with `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS` | Flags + fallback-on-miss pattern already exist [VERIFIED: geoSearchRepository.js:213] |
| Cross-DB atomic finalize | Two-phase commit / distributed txn | Landlord-durable-first + idempotent tenant txn + manual-resolution status | The proven ADR 0027 pattern; true 2PC is unavailable across two MySQL schemas [CITED: ADR 0027 #7-8] |
| Money math | Float arithmetic | Reuse `availments/usecases/money.js` (centavos, `roundHalfUp`) | Phase 9 already solved VAT/discount/centavo rounding [VERIFIED: availmentUseCases.js:5-15] |

**Key insight:** Almost every "hard" part of this phase is a solved problem sitting in `backend/` (read-only) or Phase 8/9 (`apps/dgfy-api`). The engineering risk is in the *seams* — the new storefront finalize path, the reservation port, and the raw-body webhook wiring — not in the primitives.

## Common Pitfalls

### Pitfall 1: Webhook body parsed before signature check
**What goes wrong:** Signature verification always fails (or is bypassed) because the HMAC is computed over re-serialized JSON, not the raw bytes PayMongo signed.
**Why it happens:** Global `express.json()` runs before the route; `req.body` is already parsed and `req.rawBody` is lost.
**How to avoid:** Mount the webhook route with a raw-body capture (`express.raw({type:'*/*'})` or a verify-callback that stashes `req.rawBody`) BEFORE the JSON parser consumes it. Legacy controller reads `req.rawBody` explicitly [VERIFIED: commercePaymentHandlers.js:40].
**Warning signs:** All webhooks return 401 invalid-signature in sandbox, or signature "works" only when `PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS=true`.

### Pitfall 2: Duplicate/replayed webhook creates two Availments
**What goes wrong:** PayMongo may deliver `payment.paid` more than once; concurrent deliveries race the finalize.
**Why it happens:** No idempotency guard, or a guard that isn't transactional.
**How to avoid:** (a) natural guard — short-circuit if the landlord session/order already has an `availment_id`/`finalized` status; (b) inside the tenant txn, row-lock and reject non-draft; (c) add a **unique constraint on the tenant Availment keyed by the landlord order reference** (e.g. a `source_reference` column unique per business) so even a lost-guard race collapses to one row. Legacy relies on (a)+(b) [VERIFIED: finalizePaidCommerceSession.js:30, availmentRepository.js:442]; (c) is the recommended belt-and-suspenders for the new cross-DB path.
**Warning signs:** Two Availments / two stock deductions for one payment.

### Pitfall 3: Reservation clock drifts from session clock
**What goes wrong:** Stock is released while the QR is still payable, or held long after expiry — oversell or phantom out-of-stock.
**Why it happens:** Two independently-computed `expires_at` values.
**How to avoid (D-08):** Take the single `expires_at` from PayMongo's `next_action.code.expires_at` and stamp the SAME value on session and reservation. For the cash branch (no PayMongo), pick one server-computed hold TTL and use it for both the order-hold and reservation.
**Warning signs:** Reservation `expires_at` ≠ session `expires_at` in the DB.

### Pitfall 4: Tenant DB unreachable mid-flow leaves orphaned payment
**What goes wrong:** A QR is shown for stock that could not be reserved; customer pays; finalize can't land.
**Why it happens:** Reservation attempted after (or in parallel with) session creation.
**How to avoid (D-10):** Order strictly — durable landlord order → reserve stock (tenant write) → **only then** create the PayMongo session. If the reservation write throws `TenantDatabaseUnavailableError`, reject with 503 and never create a session [VERIFIED: availmentUseCases.js:50-87 maps this to 503].
**Warning signs:** Sessions in `awaiting_payment` with no matching reservation row.

### Pitfall 5: Storefront order can't finalize because the POS finalize path is POS-only
**What goes wrong:** Reusing `buildFinalizeAvailmentUseCase` throws on missing `terminalId`/`cashierAccountId`/open shift, or a spurious `pos.checkout` compliance DENY.
**Why it happens:** Phase 9 finalize is terminal/shift-bound and runs `COMPLIANCE_OPERATION.POS_CHECKOUT` [VERIFIED: availmentUseCases.js:616-621, 731].
**How to avoid:** Add a dedicated storefront-order finalize usecase/repo method: creates the Availment with `customer_account_id` (guest/account cross-DB ref), no shift/terminal, `payment_method` mapped (see Pitfall 6), reservation→sale conversion, and the appropriate compliance operation (storefront checkout, not POS). Confirm with the compliance-policy owner which operation/gate applies online.
**Warning signs:** `NO_OPEN_SHIFT` 409 or a compliance DENY on an online order.

### Pitfall 6: Tenant `payments.payment_method` ENUM has no `qrph`
**What goes wrong:** Writing `payment_method: 'qrph'` to the tenant Payment row fails — the ENUM is `('cash','gcash','credit_card')` [VERIFIED: apps/dgfy-api/src/models/Tenant/Payment.js:45].
**How to avoid:** Map the QR Ph rail to the real instrument: GCash-via-QR → `gcash`, card-via-QR → `credit_card`, and store the PayMongo `pay_...` reference in a separate field/metadata (legacy carries `payment_reference`/`payment_provider` on the checkout payload [VERIFIED: finalizePaidCommerceSession.js:60-70]). Avoid a tenant-DB ENUM migration unless the planner deliberately chooses one.
**Warning signs:** Sequelize ENUM constraint error at finalize.

### Pitfall 7: `commerce_payment_sessions` uses UUID `tenant_id`
**What goes wrong:** Coercing tenant IDs to integers breaks session/tenant resolution.
**How to avoid:** Landlord commerce tables use UUID `tenant_id` matching `tenants.id` — never integer-coerce [VERIFIED: CommercePaymentSession.js:14-16, CITED: ADR 0027 #17].

## Code Examples

### Session creation ordering (placement) — recommended sequence
```javascript
// Recommended for apps/dgfy-api storefront placeOrder usecase (synthesized from legacy)
// 1) Landlord durable order FIRST (STF-05)
const order = await storefrontOrderRepository.createOrder({ tenant_id, status:'pending_payment',
                 idempotency_key, request_hash, checkout_payload, customer_account_id, requested_for });
// 2) Reserve stock in TENANT DB via Inventory port; fail-fast (D-07/D-10)
try {
  await inventory.reserveStock({ businessId, lines, referenceType:'storefront_order',
                                 referenceId: order.public_reference, expiresAt: null /* set in step 3 */ });
} catch (e) { if (e.name==='TenantDatabaseUnavailableError') return fail(503); throw e; }
// 3) Create PayMongo QR Ph session; NO split (D-02); expires_at shared clock (D-08)
const pm = await payMongoClient.createQrphPaymentIntent({ amount: totalCentavos, metadata:{ commerce_payment_session: order.public_reference, tenant_id }});
await inventory.setReservationExpiry(order.public_reference, pm.expiresAt); // one clock
await commercePaymentRepository.createSession({ tenant_id, order_ref: order.public_reference,
                 status:'awaiting_payment', expires_at: pm.expiresAt, qr_code_image_url: pm.qrCodeImageUrl, ... });
```

### Idempotency key at the API boundary (client-supplied)
```javascript
// Source: backend/src/modules/store/usecases/storeUseCases.js:2392-2403
const requestHash = crypto.createHash('sha256').update(stableStringify(normalizedPayload)).digest('hex');
const existing = await repo.findSessionByIdempotency({ tenantId, targetType:'store_checkout', idempotencyKey });
if (existing) {
  if (existing.request_hash !== requestHash) throw conflict(409, 'idempotency_key reused with a different payload');
  return ok({ idempotent_replay: true, payment_session: serialize(existing) }); // safe replay
}
// unique index enforces it: (tenant_id, target_type, idempotency_key) [VERIFIED: CommercePaymentSession.js:171]
```

### Discovery geo query (STF-01)
```sql
-- Source: backend/src/modules/geoSearch/repositories/geoSearchRepository.js:61-114
SELECT sdi.*, ST_Distance_Sphere(POINT(sdi.longitude, sdi.latitude), POINT(:userLng, :userLat))/1000 AS distance_km
FROM storefront_discovery_index sdi
INNER JOIN geo_store_items gsi ON gsi.tenant_id = sdi.tenant_id  -- only when a text query is present
WHERE sdi.is_visible = 1
  AND sdi.latitude IS NOT NULL AND sdi.longitude IS NOT NULL
  AND ST_Distance_Sphere(POINT(sdi.longitude, sdi.latitude), POINT(:userLng, :userLat))/1000 <= :radiusKm
ORDER BY distance_km ASC
LIMIT :limit OFFSET :offset;
-- "open now": filter on sdi.storefront_open (boolean projection) and/or business-hours check
-- category filter: sdi.storefront_categories JSON, or gsi item category
```

## State of the Art / Concrete Recommendations for Discretion Items

| Discretion item | Recommendation | Rationale / precedent |
|-----------------|----------------|-----------------------|
| **Session/reservation expiry (D-08)** | Use PayMongo's `next_action.code.expires_at`; fallback **30 min** if absent | Legacy fallback is `Date.now() + 30*60*1000` [VERIFIED: storeUseCases.js:2504] |
| **Min lead time (D-12)** | **30 minutes** for immediate-day scheduled orders (configurable via env, e.g. `STOREFRONT_MIN_LEAD_MINUTES=30`) | No legacy min-lead exists (legacy only checks business hours [VERIFIED: storeUseCases.js:569-585]); 30 min is the realistic PH food-prep floor. Tag [ASSUMED] — confirm with product. |
| **Max advance window (D-13)** | **14 days** (configurable via `STOREFRONT_MAX_ADVANCE_DAYS=14`) | No legacy cap exists; 14 days avoids stale far-future orders while covering normal pre-orders. Tag [ASSUMED] — confirm with product. |
| **Scheduling validation (D-11/D-12)** | Reuse the legacy shape: `requested_for` ISO validated, then `isDateWithinStorefrontBusinessHours(requested_for, storefront_hours)`; then min-lead + max-advance bounds; NO capacity check | Business-hours validator pattern exists [VERIFIED: storeUseCases.js:556-585]; capacity intentionally omitted (D-11) |
| **Manual-resolution API now vs later** | **Include the data-model state + a minimal operator retry endpoint now**; full reconciliation dashboard → Phase 11 | Legacy `retryCommercePaymentFinalizationUseCase` is ~20 lines and re-runs finalize idempotently for `paid`/`*_manual_resolution_required` [VERIFIED: commercePaymentAdminUseCases.js:721-740]. Cheap to port; makes the state actionable rather than inert. |
| **Idempotency mechanism** | (a) client `idempotency_key` unique per `(tenant_id, target_type, key)` + `request_hash`; (b) natural guard on landlord session `availment_id`/status; (c) unique `source_reference` on tenant Availment | Combines legacy (a)+(b) [VERIFIED] with a new (c) for the cross-DB race |
| **Reservation shape** | New **Inventory-owned tenant table** `inventory_reservations(id, business_id, product_id, quantity, reference_type, reference_id, status[active/committed/released], expires_at)`; available-to-sell = on_hand − Σ active reservations; `reserve`/`commit`/`release` ports mirror `recordSaleEffect` | ADR 0029 single-writer + the reserved-contract style of `inventoryEffectContracts.js` [VERIFIED] |
| **Cash online orders (STF-04)** | No PayMongo session. Recommend: create landlord order + reserve, then **finalize the Availment immediately at placement** (payment_method=`cash`, unpaid/pay-on-fulfillment marker), converting reservation→sale in the same tenant txn | No async payment to await; keeps guest cash orders durable. Flag as planner-confirmable (see Open Questions). |
| **HTTP client** | Native `fetch` + `crypto`, no axios | apps/dgfy-api convention; zero new packages [VERIFIED: grep] |

**Deprecated/not-applicable for Phase 10:**
- Legacy `split_payload`, `platform_fee_centavos`, `tenant_payment_accounts` readiness gating (`qrph_enabled && split_enabled && charges_enabled`), and the whole child-merchant lifecycle — all split/settlement machinery, excluded by D-02. A single DGFY account is used; the pre-checkout readiness gate [VERIFIED: storeUseCases.js:2355-2386] should be reduced to "commerce payments configured" only.
- `CommercePaymentRefund` model and all refund webhook handling — excluded by D-03.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Min lead time = 30 min | Recommendations (D-12) | Too-short blindsides kitchen; too-long blocks near-term orders. Product should confirm. |
| A2 | Max advance window = 14 days | Recommendations (D-13) | Too-short rejects legit pre-orders; too-long allows stale orders. Product should confirm. |
| A3 | Cash online orders finalize immediately at placement (no webhook) | Recommendations / Open Q | If cash should finalize at fulfillment instead, this belongs partly in Phase 11. |
| A4 | QR Ph rail maps to `gcash`/`credit_card` for the tenant Payment ENUM (no ENUM migration) | Pitfall 6 | If a distinct `qrph`/`online` value is wanted, a tenant migration is needed. |
| A5 | The storefront compliance operation is distinct from `pos.checkout` (or the gate is relaxed for online) | Pitfall 5 | If online must run the full POS compliance gate, finalize design changes. Confirm with compliance owner. |
| A6 | PayMongo QR Ph event names are `payment.paid` / `payment.failed` / `qrph.expired` and QR data is at `next_action.code.image_url/expires_at` | Patterns 2-3 | These are read from legacy code, not re-verified against current PayMongo docs this session (web providers disabled). Validate in PayMongo sandbox before go-live. |

## Open Questions

1. **Cash online-order finalization timing (STF-04/STF-05).**
   - What we know: PayMongo orders finalize on `payment.paid` webhook (D-04). Cash has no webhook.
   - What's unclear: Does a cash online order finalize into an Availment at placement, or at pickup/handover (Phase 11)?
   - Recommendation: Finalize immediately at placement (A3); revisit if Phase 11 needs to own the money event.

2. **Which compliance gate applies to an online storefront order?**
   - What we know: Phase 9 uses `COMPLIANCE_OPERATION.POS_CHECKOUT`; online orders have no terminal/shift.
   - What's unclear: Whether a storefront checkout operation exists in the compliance policy, or the gate is bypassed online.
   - Recommendation: Confirm with the compliance-policy module owner before building the storefront finalize path.

3. **Does `storefront_discovery_index` (and `geo_store_items`) already exist in the `dgfy_core`/landlord schema reachable by `apps/dgfy-api`, or only in the legacy landlord DB?**
   - What we know: Phase 2 established `dgfy_core.storefront_discovery_index`; the model exists in `backend/src/models/Landlord`.
   - What's unclear: Whether a mirror model + the projection's freshness pipeline is wired for `apps/dgfy-api`.
   - Recommendation: Verify the table is populated for the standalone API's landlord connection; if item-level search (STF-01) is required, confirm `geo_store_items` is likewise available.

4. **Folded todo** ("wrap compliance verification and state writes in one transaction") — CONTEXT flags it as a keyword false-positive (Phase 8/9 compliance debt). Recommendation: planner assesses actionability; likely re-defer. Not a Storefront/Ordering concern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MySQL (landlord + per-tenant) | All persistence, spatial, FULLTEXT | ✓ (assumed running) | mysql2 ^3.6.5 | none — hard requirement |
| Redis | Discovery/geo cache | ✓ config present | redis ^4.6.13 | Direct DB query on cache miss/unavailable (legacy pattern) |
| PayMongo API + sandbox keys | QR Ph sessions (D-01) | ✗ needs env config | — | none — `PAYMONGO_*` env must be set; without them QR Ph returns 503 SERVICE_UNAVAILABLE (legacy `requireCommerceQrphConfig`) |
| SMTP (via `emailService`) | Guest email OTP (D-05) | ✓ if configured | nodemailer ^9.0.1 | OTP returns 503 `EMAIL_OTP_DELIVERY_UNAVAILABLE` if unconfigured [VERIFIED: emailOtp.js:85] |
| Node ≥18 (global `fetch`) | PayMongo client | ✓ (apps/dgfy-api uses fetch) | — | add axios if targeting older Node |

**Missing dependencies with no fallback:**
- PayMongo sandbox credentials + a registered webhook endpoint (`POST /v1/commerce-payments/paymongo/webhook`) with the raw-body route wired — required to exercise the full paid path. Env vars: `PAYMONGO_MODE`, `PAYMONGO_SECRET_KEY` (or mode-specific), `PAYMONGO_WEBHOOK_SECRET` (or mode-specific), `PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`, commerce feature flags (`COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`). **Note:** `PAYMONGO_DGFY_MERCHANT_ID` and `COMMERCE_PAYMONGO_SPLIT_ENABLED` are NOT needed (D-02).

**Missing dependencies with fallback:**
- Redis — geo/discovery cache degrades to direct MySQL queries.

## Project Constraints (from CLAUDE.md / ADRs)

- **Zero `backend/` writes.** `backend/src/modules/commercePayments`, `backend/src/modules/store`, `backend/src/services/paymongoService.js`, and all `backend/src/models/Landlord/*` are **read-only pattern references**; Phase 10 re-implements under `apps/dgfy-api` and must never import or edit them. [CITED: 10-CONTEXT.md, PROJECT.md]
- **Layering:** routes → controllers → usecases → repositories → models. [CITED: ARCHITECTURE_BOUNDARIES.md / GOVERNANCE]
- **ADR 0029 single-writer:** only `modules/inventory` writes stock effects/balances; Storefront *requests* effects (reservation, sale). [CITED: ADR 0029 boundary rule #2]
- **ADR 0003 Strangler Fig:** no legacy mutation. [CITED: ADR 0003]
- **No new frontend app ships** (backend API only, same as Phases 8-9). [CITED: 10-CONTEXT.md]
- **Landlord commerce tables use UUID `tenant_id`** — never integer-coerce. [CITED: ADR 0027 #17]
- **Split stays adjustable** — provider-side config at intent creation, not schema-baked. [CITED: D-02]

## Security Domain

**security_enforcement:** enabled, ASVS Level 1, block-on: high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Guest email OTP via `emailOtp.js` (hashed codes, TTL, max-attempts, single-active-OTP); logged-in path via `authenticateAccount` |
| V3 Session Management | yes (light) | Optional bearer for account path; guest identity is not a login session — keyed by verified email, no elevated capability |
| V4 Access Control | yes | Order/session lookups by opaque public reference (`CPS-`/order ref), scoped to tenant; prevent IDOR — never expose sequential IDs; a guest may read only their own order via reference (+ optionally email match) |
| V5 Input Validation | yes | Validate cart lines, `requested_for` ISO + bounds, contact fields, `idempotency_key` (min length), payment method enum; server recomputes all money in centavos (never trust client totals) [VERIFIED: availmentUseCases.js recompute] |
| V6 Cryptography | yes | HMAC-SHA256 webhook verify with `timingSafeEqual` + timestamp tolerance; OTP hashing via `crypto` — never hand-roll (§Don't Hand-Roll) |
| V13 API / Webhooks | yes | Raw-body signature verify BEFORE processing; reject stale timestamps; idempotent handling of duplicate deliveries |

### Known Threat Patterns for {storefront ordering + payment webhooks}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/replayed webhook | Spoofing / Tampering | HMAC over raw body + timestamp tolerance; reject if unsigned in prod [VERIFIED: paymongoService.js:499-558] |
| Duplicate webhook → double order/double stock deduction | Tampering | Natural idempotency guard + row lock + unique `source_reference` on Availment (Pitfall 2) |
| Client-tampered cart total / fee | Tampering | Server-side recompute in centavos from catalog snapshots (Phase 9 `money.js`) |
| IDOR on order/session reference | Information Disclosure / Elevation | Opaque references; tenant-scoped lookups; optional email binding for guest reads |
| OTP brute force / spam | Elevation / DoS | `EMAIL_OTP_MAX_ATTEMPTS` + single-active-OTP + `express-rate-limit` on OTP + checkout endpoints |
| Oversell race (two guests, last unit) | Tampering (integrity) | Immediate reservation with atomic available-to-sell check (D-07); fail-fast on tenant-DB (D-10) |
| Paid-but-unfinalized silently dropped | Repudiation | Explicit `finalize_failed_manual_resolution_required` state + operator retry (STF-05, ADR 0027 #8) |
| Amount too low / degenerate | Tampering | Validate `total_centavos > 0`; drop the legacy split-specific `platform_fee < total` check (split excluded) |
| Discovery endpoint scraping/DoS | DoS | Redis cache + `express-rate-limit`; public read-only |

## Sources

### Primary (HIGH confidence — in-repo, read this session)
- `backend/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js` — webhook event routing, session resolution, signature gate
- `backend/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js` — natural idempotency guard, landlord→tenant finalize, manual-resolution status
- `backend/src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js` — retry finalization usecase (lines 721-740)
- `backend/src/services/paymongoService.js` — QR Ph 3-call flow (284-323), signature verify (499-558), base URLs/auth (33-67)
- `backend/src/modules/store/usecases/storeUseCases.js` — session creation (2330-2519), idempotency+request_hash, scheduling validation (556-585), guest proof (169-196), 30-min fallback (2504)
- `backend/src/models/Landlord/CommercePaymentSession.js` / `TenantPaymentAccount.js` — landlord table shapes, UUID tenant_id, unique idempotency index
- `apps/dgfy-api/src/modules/availments/usecases/availmentUseCases.js` + `repositories/availmentRepository.js` — Phase 9 finalize discipline, atomic tenant txn, row-lock, `TenantDatabaseUnavailableError`→503, `customer_account_id`
- `apps/dgfy-api/src/modules/inventory/usecases/inventoryEffectContracts.js` + `inventoryMovementUseCases.js` — single-writer contract, reserved effect shape, MOVEMENT_TYPES (no reservation type yet)
- `apps/dgfy-api/src/infra/emailOtp.js` — OTP purposes/TTL/attempts/enforcement
- `apps/dgfy-api/src/models/Tenant/Payment.js` — payment_method ENUM (cash/gcash/credit_card)
- `backend/src/modules/geoSearch/repositories/geoSearchRepository.js` + `backend/src/models/Landlord/StorefrontDiscoveryIndex.js` / `GeoStoreItem.js` — spatial + FULLTEXT + Redis cache
- `docs/architecture/adr/0027-*.md` (#3,#7,#8,#16,#17,#18) and `docs/architecture/adr/0029-*.md` (boundary rules)
- `.planning/codebase/ARCHITECTURE.md:200-205` (landlord-session-resolves-tenant), `.planning/codebase/INTEGRATIONS.md` (env vars, webhook endpoints, cache flags)

### Secondary (MEDIUM confidence)
- 10-CONTEXT.md decisions D-01..D-13 (upstream, locked)

### Tertiary (LOW confidence — validate before go-live)
- PayMongo QR Ph exact event names & payload shape (`payment.paid`/`qrph.expired`, `next_action.code.*`) — sourced from legacy code, NOT re-verified against live PayMongo docs this session (web providers disabled in config). Validate in PayMongo sandbox (A6).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps verified in `apps/dgfy-api/package.json`; zero new packages.
- Architecture / patterns: HIGH — every pattern has a concrete in-repo reference (legacy + Phase 8/9).
- Cross-DB finalization & reservation: HIGH on approach, MEDIUM on exact new-table shapes (planner's design call within stated constraints).
- PayMongo API surface: MEDIUM — read from in-repo client, not re-confirmed against external docs (see A6); sandbox validation required.
- Scheduling values (lead/advance): LOW (ASSUMED) — no legacy precedent; product confirmation needed.

**Research date:** 2026-07-13
**Valid until:** 2026-08-12 (30 days; stable internal patterns). PayMongo external API facts (A6) should be sandbox-verified regardless of date.
