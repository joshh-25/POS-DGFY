---
status: proposal
authority_level: reference
owner: engineering
last_reviewed: 2026-07-22
applies_to: storefront,dgfy_accounts,commerce_payments,permissions
topic: affiliates_program_study
---

# Affiliates Program — Implementation Study

**Status: not implemented.** This is a design/method write-up for review before any planning or
coding begins. It documents how an Affiliates Program would be built on top of the existing DGFY
platform, the specific files/patterns it would reuse, the data model, and the open policy
decisions that still need a final call. Nothing in this document has been implemented yet — no
migrations, models, routes, or UI exist for any of the tables/endpoints described below.

Once this study is reviewed and revised as needed, the next steps are: open a dedicated ADR under
`docs/architecture/adr/` (this is a cross-boundary, money-touching feature per
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`), then produce a phased implementation plan for
Phase 1 (see **Phasing** below).

---

## Context — why we're building this

Stores on DGFY want to grow sales through word-of-mouth. The Affiliates Program lets a store
recruit people (affiliates) who promote the store via a scannable QR/link; when a shopper they
referred buys, the affiliate earns a **commission** that accumulates and is later **cashed out**.
Today none of this exists — a repo-wide search for "affiliate" turns up nothing; this is
greenfield.

**Regular user story** (as given):
- A store invites an affiliate via email.
- The affiliate either already has a DGFY account, or creates one via the invite link.
- The store owner sets a base commission rate (and can override it per affiliate).
- The affiliate manages payout/bank details from their DGFY account settings, on the Storefront
  (ecommerce) side.
- The store owner generates an affiliate QR code. Scanning it redirects to that storefront and
  stores the affiliate reference in a cookie scoped to that storefront only (no leakage to other
  stores). When the referred shopper completes a purchase, the affiliate earns commission, which
  stacks up and can eventually be cashed out.
- Cashout is manual for now (affiliate requests → owner approves → owner pays externally → owner
  marks paid), with an explicit intent to automate a share of PayMongo settlement later.

**Confirmed decisions** (locked in for this study; see **Open policy decisions** below for what's
still adjustable):

1. **Build in the live deployed `backend/`** (`sku-backend`, Express + Sequelize), *not*
   `apps/dgfy-api`. Rationale: `backend/` is the only tree actually serving the live storefront
   today. `apps/dgfy-api` is a parallel Clean-Architecture rewrite running *beside* legacy
   (`docs/architecture/COMPATIBILITY_INVENTORY.md` — "dgfy-api and dgfy-migration-runner run
   beside legacy" during a database-first cutover), and its cutover to serve the storefront is a
   future milestone (`CUT-02`), not yet scheduled. Building the affiliate feature there would mean
   it can't reach real customers or move real money until that cutover happens.
2. **Commission = a percentage of the order item subtotal**, configurable per store, with a
   **system default of 5%**, plus an optional per-affiliate override. Stored as **basis points**
   (5% = `500`) for exactness.
3. **Windowed, last-scan-wins attribution.** A QR scan drops a **store-scoped** cookie; every
   *completed* order within an attribution window (default **60 days**) earns commission for
   whichever affiliate's code is currently in that cookie; a newer scan replaces the prior one.
   Attribution **must not leak across stores** — scanning store A's QR must never attribute a
   purchase made at store B.
4. **Multi-method payouts, one marked primary.** Local **bank** (bank name + account name +
   account number) and **e-wallets** (GCash/Maya via mobile number). This is a Philippines-domestic
   flow — SWIFT/IBAN are for international wires and are intentionally **not** part of this model.
5. **Manual cashout for now.** Affiliate requests a cashout → store owner approves → owner pays
   externally (bank transfer/GCash/Maya, outside DGFY) → owner marks it paid. The data model is
   designed so that a future automated PayMongo disbursement (splitting a portion of settlement to
   the affiliate) can be added **without reworking the schema**.
6. **No `ref`/`refId` in the public link.** Per instruction, the codebase convention (see
   `DgfyReviewInvite`) of persisting only a SHA-256 hash of an opaque code is reused; the public
   query parameter name is also deliberately non-obvious (see **Attribution flow**).

---

## Where this lives in the existing system (verified against the codebase)

- **Affiliate identity = DGFY account.** The storefront's global user identity is `DgfyAccount`
  (`backend/src/models/Landlord/DgfyAccount.js`), authenticated via a `sku_dgfy_session` cookie /
  `token_scope==='dgfy'` JWT (`backend/src/middleware/storeAuth.js`). Payout methods belong to the
  **person** (account-level, one set of bank/e-wallet details usable across any store they
  affiliate for); enrollments and commission balances are **per store**.
- **The "closed deal" = a completed storefront order.** Storefront checkout — both the current
  cash-on-delivery/pickup path and the PayMongo QR Ph online-payment path (gated today, per ADR
  0027) — funnels through a single use case, `storeCheckoutUseCase` in
  `backend/src/modules/store/usecases/storeUseCases.js`, which finalizes the order into a
  **tenant-DB** `pos_transactions` row. The PayMongo path reaches the same use case via
  `backend/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`. Building the
  commission hook against this one use case means both payment paths are covered automatically.
- **A single post-order accrual funnel already exists and is idempotent.**
  `recordDgfyOrderActivity(...)` in `backend/src/modules/dgfy/utils/customerActivityRecorder.js`
  runs after every order commit, records a `DgfyCustomerActivity` row, and already accrues loyalty
  points exactly once per order (`createLoyaltyIfMissing`, keyed off the order's `tracking_pin`).
  Commission accrual is designed to slot in right beside this — same call sites, same idempotency
  pattern.
- **Cross-database reality.** New affiliate tables must be **landlord** tables (`dgfy_core`,
  conceptually) — an affiliate's enrollments, commissions, and payout methods must be queryable
  across every store they work with, and `DgfyAccount` itself lives landlord-side. Orders
  (`pos_transactions`) live in the **per-tenant DB**. MySQL cannot enforce a foreign key across two
  separate databases, so — exactly as `DgfyCustomerActivity` and `DgfyLoyaltyTransaction` already
  do — the join between a commission ledger row and its order is by **value**: `tenant_id` +
  `tracking_pin` (normalized uppercase/trim, matching existing order-reference handling), not a
  database-enforced FK.

### Existing patterns this design reuses (rather than inventing new ones)

| Need | Reused pattern |
|---|---|
| Enrollment / membership shape (who's affiliated with which store, status lifecycle) | `backend/src/models/Landlord/DgfyAccountTenantMembership.js` |
| Opaque public code + hash-at-rest, already models `delivery_channel: 'qr'` | `backend/src/models/Landlord/DgfyReviewInvite.js` + `backend/src/modules/dgfy/utils/reviewInviteIssuer.js` |
| Delta-style ledger | `backend/src/models/Landlord/DgfyLoyaltyTransaction.js` |
| Multi-row-per-account CRUD with an `is_default`/primary flag | `backend/src/models/Landlord/DgfyCustomerAddress.js` + `dgfyCustomerHandlers.js` / `dgfyCustomerRepository.js` |
| Post-order accrual hook, idempotent-by-construction | `backend/src/modules/dgfy/utils/customerActivityRecorder.js` |
| Storefront QR + slug-based public URL | `frontend/apps/store/src/storefrontQrUrl.js`, `frontend/apps/store/src/features/qr/utils/storefrontQrExport.js`, `frontend/apps/store/src/Components/storefront/hero/StorefrontShareQr.jsx` |
| Hand-rolled session cookie utilities | `backend/src/utils/browserSessionCookies.js` |
| Tokenized email invite + redemption UI | `backend/src/services/emailService.js` (`sendInvitationEmail`) + `backend/src/templates/emailTemplates.js`; redeem UI `frontend/Pages/AcceptInvite.jsx` |
| Permission catalog + role gating | `backend/src/config/permissions.js`, `backend/src/middleware/auth.js` |
| Fee-basis precedent (a fee computed from subtotal, not net) | ADR 0012 (DGFY 1% convenience fee) and `computeDgfyConvenienceFee` in `storeUseCases.js` — commission on subtotal is consistent with how the platform already defines "subtotal" as the money basis |

---

## Data model (new **landlord** tables, `backend/src/models/Landlord/`)

All money is stored as **INTEGER centavos** (never DECIMAL, to avoid rounding drift across sums).
Every ledger row **snapshots** the commission rate at the time it was earned — a later rate change
must never retroactively change a historical row. There are no cross-database foreign keys; order
linkage is always by value (`tenant_id` + `tracking_pin`). Migrations follow the existing
sequelize-cli convention: `.cjs` files in `backend/migrations/`, timestamp-prefixed
(`YYYYMMDDNNNNNN-*.cjs`), using `queryInterface.createTable` + explicit `addIndex` for unique
composite indexes, inline ENUM types, no FK constraints.

### 1. `dgfy_affiliate_enrollments` — one row per `(dgfy_account_id, tenant_id)`

The relationship between one affiliate and one store.

| Column | Type | Notes |
|---|---|---|
| `enrollment_id` | INTEGER, PK, autoincrement | |
| `dgfy_account_id` | UUID, not null | the affiliate |
| `tenant_id` | UUID, not null | the store |
| `share_code_hash` | STRING(128), not null, unique | SHA-256 of the opaque public code — **only the hash is ever persisted**, mirroring `DgfyReviewInvite` |
| `short_code` | STRING(16), not null, unique | a typable short code (e.g. `AF-XXXXXX`) shown to the affiliate and embedded in the QR |
| `commission_rate_bps` | INTEGER, nullable | per-affiliate override in basis points; `null` = inherit the store default |
| `status` | ENUM(`pending`, `active`, `suspended`, `revoked`) | |
| `source` | ENUM(`invite`, `self_serve`, `admin_provisioned`) | |
| `invited_email` | STRING(255), nullable | populated for invite-before-account-exists |
| `activated_at` | DATE, nullable | |

Indexes: unique `(dgfy_account_id, tenant_id)`; unique `share_code_hash`; unique `short_code`;
`(tenant_id, status)`.

### 2. `dgfy_affiliate_attributions` — scan/click audit trail

Records every QR scan / link visit that resolved to a valid affiliate code. The cookie is the
*live* source of attribution credit at checkout; this table exists for fraud review and to
reconstruct history.

| Column | Type | Notes |
|---|---|---|
| `attribution_id` | INTEGER, PK, autoincrement | |
| `tenant_id` | UUID, not null | |
| `enrollment_id` | INTEGER, not null | |
| `store_slug` | STRING(160), nullable | snapshot for readability |
| `visitor_fingerprint` | STRING(128), nullable | hashed IP+user-agent, a fraud signal, never raw PII |
| `dgfy_account_id` | UUID, nullable | filled in if the scanner happened to be logged in |
| `occurred_at` | DATE, not null, default now | |

Indexes: `(tenant_id, enrollment_id, occurred_at)`; `(tenant_id, occurred_at)`.

### 3. `dgfy_affiliate_commissions` — the ledger, one row per order

| Column | Type | Notes |
|---|---|---|
| `commission_id` | INTEGER, PK, autoincrement | |
| `enrollment_id` | INTEGER, not null | |
| `tenant_id` | UUID, not null | |
| `dgfy_account_id` | UUID, not null | denormalized for fast balance queries |
| `pos_transaction_id` | INTEGER, nullable | order id inside the tenant DB |
| `order_reference` | STRING(24), not null | the order's `tracking_pin` — the real cross-database join key |
| `commissionable_base_centavos` | INTEGER, not null | item subtotal minus discount; **excludes** delivery fee and the DGFY 1% platform fee |
| `rate_bps_snapshot` | INTEGER, not null | the rate actually applied, frozen at accrual time |
| `amount_centavos` | INTEGER, not null | `round(base_centavos * rate_bps / 10000)` |
| `currency` | STRING(3), default `PHP` | |
| `status` | ENUM(`pending`, `earned`, `reversed`, `paid`) | see lifecycle below |
| `reason` | STRING(120) | e.g. `order_placed`, `order_completed`, `order_reversed`, `cashout_settled` |
| `cashout_id` | INTEGER, nullable | set once a cashout batch reserves/consumes this row |
| `earned_at` / `reversed_at` / `paid_at` | DATE, nullable | |

Indexes: **unique `(tenant_id, order_reference)`** — this is the idempotency guarantee, one
commission row per order per store; `(dgfy_account_id, status)` — balance queries;
`(enrollment_id, status)`; `(cashout_id)`.

### 4. `dgfy_affiliate_payout_methods` — account-level, multiple + one primary

| Column | Type | Notes |
|---|---|---|
| `payout_method_id` | INTEGER, PK, autoincrement | |
| `dgfy_account_id` | UUID, not null | |
| `method_type` | ENUM(`bank`, `gcash`, `maya`) | |
| `label` | STRING(100), nullable | e.g. "BPI Savings" |
| `bank_name` | STRING(120), nullable | bank only |
| `account_name` | STRING(160), nullable | bank account holder / e-wallet display name |
| `account_number` | STRING(64), nullable | bank account number — domestic PH, no SWIFT/IBAN |
| `mobile_number` | STRING(24), nullable | GCash/Maya |
| `is_default` | BOOLEAN, default false | exactly one primary per account, enforced in the use case layer (same pattern as address defaults) |
| `provider_recipient_ref` | STRING(120), nullable | **forward-compatibility only** — unused today, reserved for a future PayMongo beneficiary/recipient token |

Index: `(dgfy_account_id, is_default)`.

### 5. `dgfy_affiliate_cashouts` — request → approval → paid state machine

Represents one cashout request, which settles a batch of `earned` commission rows.

| Column | Type | Notes |
|---|---|---|
| `cashout_id` | INTEGER, PK, autoincrement | |
| `enrollment_id` | INTEGER, not null | a cashout is always scoped to one store |
| `tenant_id` | UUID, not null | |
| `dgfy_account_id` | UUID, not null | |
| `payout_method_id` | INTEGER, not null | which method was selected |
| `payout_snapshot` | JSON, not null | the bank/wallet details **frozen at request time**, so later edits to the method don't rewrite history |
| `amount_centavos` | INTEGER, not null | sum of the commission rows this cashout consumes |
| `currency` | STRING(3), default `PHP` | |
| `status` | ENUM(`requested`, `approved`, `paid`, `rejected`, `cancelled`) | |
| `requested_at` / `approved_at` / `paid_at` / `rejected_at` | DATE, nullable | |
| `approved_by_user_id` | INTEGER, nullable | the tenant staff user who approved |
| `external_payment_ref` | STRING(160), nullable | owner-entered receipt/transaction reference on mark-paid |
| `rejection_reason` | STRING(500), nullable | |
| `disbursement_provider` | STRING(40), nullable | **forward-compatibility only** — `null` today, would become `'paymongo'` once automated |
| `disbursement_payload` | JSON, nullable | **forward-compatibility only** — reserved for a future automated split/disbursement response |

Indexes: `(tenant_id, status)`; `(dgfy_account_id, status)`; `(enrollment_id, status)`.

**Why the manual → automated upgrade needs zero schema rework:** the manual path fills in
`external_payment_ref` by hand when the owner clicks "mark paid." A future automated path would
instead populate `disbursement_provider` + `disbursement_payload` and drive the identical
`approved → paid` transition from a PayMongo webhook — same state machine, same ledger settlement.
`provider_recipient_ref` on payout methods is the future beneficiary token. Reserving commission
rows via `cashout_id` while a cashout is in flight is exactly the mechanism an asynchronous
disbursement needs anyway (funds locked until settlement confirms).

### 6. `tenant_affiliate_settings` — one row per store

| Column | Type | Notes |
|---|---|---|
| `tenant_id` | UUID, PK | |
| `program_enabled` | BOOLEAN, default false | store must opt in |
| `default_rate_bps` | INTEGER, default `500` | **system default 5%** |
| `attribution_window_days` | INTEGER, default `60` | |
| `min_cashout_centavos` | INTEGER, default `20000` (₱200) | |
| `auto_approve_enrollment` | BOOLEAN, default false | invite-only vs. open self-serve join |

---

## Attribution flow, end to end

1. **QR / link.** The affiliate's shareable URL is the existing storefront URL builder
   (`buildStorefrontQrUrl({ slug })` in `frontend/apps/store/src/storefrontQrUrl.js`) with a query
   parameter appended: **`?p={short_code}`** — `p` for "partner," deliberately not `ref`/`refId`.
   The store owner generates this from the admin app using the existing branded-QR exporter
   (`features/qr/utils/storefrontQrExport.js`), just pointed at the affiliate's specific URL instead
   of the bare storefront URL.
2. **Capture (public, unauthenticated).** `POST /api/v1/dgfy/affiliate/attribution/capture`, gated
   by the existing `tenantHandler` (resolves the store from the `x-store-slug` header) plus
   `optionalStoreCustomer`. Given `{ code }`, the handler hashes it and looks up an **active**
   enrollment **scoped to that request's `tenant_id`** — if the code actually belongs to a
   different store, the lookup simply fails. This is where cross-store leakage is blocked, at the
   source, not just by convention. A capture also writes an attribution audit row (§2 above).
3. **Cookie.** Name `sku_aff_attr`; `HttpOnly`; `SameSite=Lax`; `Secure` in production;
   `Max-Age` = the store's `attribution_window_days` in seconds. The value is a small JSON map
   **keyed by `tenant_id`**: `{ "<tenantId>": { "c": "<short_code>", "e": <expiryEpoch> } }`. Keying
   by tenant means a shopper who has scanned codes for multiple stores keeps each store's
   attribution independent — writing store B's entry never touches store A's — and "last-scan-wins"
   is naturally scoped per store, not global. The map is capped at a small number of entries
   (oldest evicted first) to bound cookie size. This requires adding an exported
   `setAffiliateAttributionCookie` / `getAffiliateAttributionCookie` pair (and a new
   `SESSION_COOKIE_NAMES.affiliateAttribution` entry) to `backend/src/utils/browserSessionCookies.js`
   — the one shared-util edit this feature needs, since the existing `serializeCookie` helper there
   is currently module-private.
4. **Read at checkout.** The checkout **controller/route** layer (not the use case, which stays
   pure) reads the cookie, extracts the entry for the **current checkout's tenant only**, checks it
   hasn't expired, hashes the stored code, and resolves it to an active enrollment for that tenant.
   If valid, an `attribution_enrollment_id` is threaded into the checkout payload passed down to
   `storeCheckoutUseCase`. **Self-referral guard:** if the buyer's own `dgfy_account_id` matches the
   enrollment's `dgfy_account_id`, attribution is dropped — an affiliate cannot earn commission on
   their own purchase.

---

## Commission accrual (a single hook, exercised at two call sites)

A new utility, `backend/src/modules/dgfy/utils/affiliateCommissionAccrual.js`, backed by a new
repository `backend/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`.

- **Order creation** (`storeUseCases.js`, immediately after the order-creation transaction
  commits — the same point `recordDgfyOrderActivity` is already called): if the checkout carried an
  `attribution_enrollment_id`, `findOrCreate` a commission row with `status: 'pending'` on the
  unique `(tenant_id, order_reference)` index. Because it's `findOrCreate` against a unique index,
  this is safe against checkout idempotency replays and PayMongo webhook re-delivery hitting the
  same use case twice. Like the activity recorder, this call is non-blocking (`.catch()`'d) — a
  commission-accrual failure must never fail the customer's order.
  - **Commissionable base** = `round(order.subtotal_amount − order.discount_amount)`, in centavos,
    explicitly **excluding** `delivery_fee` and `service_fee_amount` (the DGFY 1% fee) — the
    affiliate is compensated for merchandise sold, not for the DGFY platform's own fee or the
    logistics cost.
  - **Amount** = `round(base_centavos × rate_bps / 10000)`, where `rate_bps` resolves as
    `enrollment.commission_rate_bps ?? tenant_affiliate_settings.default_rate_bps ?? 500`.
- **Fulfillment transition** (`posUseCases.js`, at the same point a fulfillment-status change
  already triggers the activity recorder): when an order's status moves to `completed`, flip the
  matching commission row `pending → earned` (`earned_at` set). When it moves to `rejected` or is
  otherwise cancelled, flip `pending`/`earned → reversed` (`reversed_at` set).

**Lifecycle:** `pending` (order placed) → `earned` (order completed) → `paid` (settled by a
cashout). Side branch: `pending`/`earned` → `reversed` (order cancelled, rejected, or refunded).
Only rows that are `earned` **and** not yet attached to an in-flight cashout (`cashout_id IS NULL`)
count toward an affiliate's available balance.

---

## Balance and cashout

- **Available balance** (per affiliate, per store) = `SUM(amount_centavos WHERE status='earned' AND
  cashout_id IS NULL)`. Pending commissions are shown separately as "pending"; reversed and paid
  rows are excluded from the available total.
- **State machine:** `requested → approved → paid`; `requested`/`approved → rejected`;
  `requested → cancelled` (affiliate withdraws their own request).
- **Row reservation (prevents double-spending the same commission across two concurrent cashout
  requests):** on `requested`, inside a single transaction, every eligible `earned` row for that
  enrollment is stamped with the new `cashout_id` and the cashout's `amount_centavos` is set to
  their sum. If the cashout is later rejected or cancelled, those rows' `cashout_id` is cleared,
  returning them to the affiliate's available balance. If it's marked `paid`, those rows bulk-flip
  `earned → paid` and the cashout's `external_payment_ref` is recorded. The chosen payout method's
  details are copied into `payout_snapshot` at request time so a later edit to that payout method
  never rewrites settled history.
- A request below `tenant_affiliate_settings.min_cashout_centavos` is rejected outright.

---

## Invite flow

The invitation itself **is** the enrollment row — there's no separate invite table. An invite
creates a `dgfy_affiliate_enrollments` row with `status: 'pending'`, `source: 'invite'`,
`invited_email` set, plus a one-time hashed acceptance token (reusing
`reviewInviteIssuer`'s `buildPublicToken()` — `crypto.randomBytes(24).toString('hex')` — as the
literal template; this token is distinct from the enrollment's own `share_code`, which is only
minted once the invite is accepted).

1. **Owner invites** by email (`POST /affiliate/admin/invites`, store-owner/admin auth): creates the
   pending enrollment, generates the acceptance token, sends an email via a new
   `sendAffiliateInvitationEmail` (cloned from the existing `sendInvitationEmail` in
   `emailService.js`, with a new template in `emailTemplates.js`).
2. **Email link → redemption UI.** Reuses the existing tokenized-link redemption pattern
   (`frontend/Pages/AcceptInvite.jsx` / `backend/src/routes/auth.js`), adapted for the affiliate
   acceptance endpoint.
3. **Redeem** (`POST /affiliate/invites/accept`, authenticated as a DGFY account): if the invited
   email matches the logged-in account (or the person just registered via the standard DGFY signup
   flow using the invite link), the enrollment links to that `dgfy_account_id`, flips to
   `status: 'active'`, sets `activated_at`, and mints the `short_code` / `share_code_hash` pair that
   the affiliate will actually use.
4. **Self-serve** (only if the store has `auto_approve_enrollment` on): `POST /affiliate/enroll`
   creates an already-`active` enrollment directly, `source: 'self_serve'`.

---

## API surface (new endpoints)

Controllers, use cases, and repository mirror the existing `dgfyCustomerHandlers` /
`dgfyCustomerUseCases` / `dgfyCustomerRepository` trio: new
`backend/src/modules/dgfy/controllers/dgfyAffiliateHandlers.js`,
`backend/src/modules/dgfy/usecases/dgfyAffiliateUseCases.js`,
`backend/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`.

**Store owner / admin** (tenant staff/owner auth via `backend/src/middleware/auth.js`, gated by new
permissions — see below; new `backend/src/routes/affiliateAdmin.js`):
- `GET` / `PUT /affiliate/admin/settings` — program enable, default rate, window, min cashout
- `GET /affiliate/admin/affiliates` — list enrollments with earnings summary
- `POST /affiliate/admin/invites` — invite by email
- `PATCH /affiliate/admin/affiliates/:enrollment_id` — set rate override, suspend/revoke
- `GET /affiliate/admin/affiliates/:enrollment_id/qr` — generate the affiliate's QR (URL with `?p=`)
- `GET /affiliate/admin/cashouts`, `PATCH /affiliate/admin/cashouts/:id/approve|mark-paid|reject`
- `GET /affiliate/admin/commissions` — ledger view for reconciliation

**Affiliate self-service** (`authenticateDgfyAccount`; mounted in `backend/src/routes/dgfy.js`
alongside `/customer/addresses`):
- `GET /dgfy/affiliate/enrollments` — my stores, status, share link
- `POST /dgfy/affiliate/enroll` — self-serve join, if the store allows it
- `POST /dgfy/affiliate/invites/accept` — accept an invite token
- `GET /dgfy/affiliate/earnings?tenant_id=` — pending/earned/paid balance and commission list
- Payout methods CRUD, cloned 1:1 from the address CRUD:
  `GET`/`POST /dgfy/affiliate/payout-methods`, `PUT`/`PATCH`/`DELETE /:id`,
  `PATCH /:id/default`
- `POST`/`GET /dgfy/affiliate/cashouts`, `PATCH /dgfy/affiliate/cashouts/:id/cancel`

**Public** (no auth):
- `POST /dgfy/affiliate/attribution/capture` — the QR-scan capture endpoint

---

## Frontend surfaces

- **Admin app (`frontend/apps/skupervisor/`)** — a new affiliate-management screen: program
  settings (enable, default rate, window, minimum cashout), an affiliate list with an invite modal,
  per-affiliate rate override / suspend controls, QR generation (reusing
  `storefrontQrExport.js` / `StorefrontShareQr.jsx` with the `?p=` param appended), and a cashout
  approval queue (approve / mark-paid-with-reference / reject).
- **Storefront customer dashboard (`frontend/apps/store/src/customer-dashboard/`)** — this is the
  "DGFY account settings" surface the affiliate uses: add a nav entry in
  `model/customerDashboardPresentation.jsx`, a corresponding `views` entry in
  `pages/DgfyCustomerAccountPage.jsx`, and a new `components/AffiliateSection.jsx` (structured like
  the existing `LoyaltySection.jsx`) covering: enrollments + share link/QR per store, earnings
  (pending / available / paid), payout-methods management (bank + GCash/Maya, primary selector,
  cloned from the addresses UI), and cashout request + history.
- **Attribution capture on storefront load** — when the storefront app boots on a URL carrying
  `?p=`, it POSTs the code to the capture endpoint (via the existing `requestJson` helper, which
  already sends `x-store-slug`) and then strips the parameter from the visible URL.

---

## Permissions (`backend/src/config/permissions.js`)

A new `AFFILIATES` group, following the existing `{ label, actions }` shape:

- `affiliates:view`
- `affiliates:manage` — invite, rate override, suspend/revoke
- `affiliates:settings` — enable program, change default rate/window/min cashout
- `affiliates:cashout_approve`
- `affiliates:cashout_pay`

The store owner (membership `source: 'founder'` / `tenant.owner_dgfy_account_id`) gets all of these
by default; other staff roles opt in via the existing default-role-permission mapping. Affiliate
self-service needs **no** new permission — it's gated purely by DGFY account authentication,
scoped to the caller's own `dgfy_account_id`.

---

## Open policy decisions

The architecture above is settled; these are business-rule defaults chosen so the design is
concrete, and are the ones most worth revising during your review.

| # | Decision | Default in this study | Alternative |
|---|---|---|---|
| P1 | Commission base: before or after a promo discount is applied | **Post-discount** — commission on what the customer actually paid for goods | Pre-discount |
| P2 | What happens if an order is refunded *after* its commission has already been paid out | **Negative compensating ledger row** that reduces the affiliate's *next* available balance — no attempt to claw back cash already sent | Hard clawback / manual dispute with the affiliate |
| P3 | Minimum cashout amount | **₱200** (`20000` centavos) | Any other floor, or none |
| P4 | Attribution window length | **60 days** | 30 / 90 days |
| P5 | Public QR query-parameter name | **`?p=`** | `?ac=`, or an opaque path segment like `/s/AF-XXXX` |
| P6 | Whether an affiliate can earn commission by referring themselves | **Blocked** | Allowed |
| P7 | Default enrollment mode for a new store | **Invite-only** (`auto_approve_enrollment = false`) | Open self-serve join |

---

## Phasing

- **Phase 0 — This study + ADR.** This document (done). Next: open a dedicated ADR under
  `docs/architecture/adr/` — required because this is a cross-boundary feature that touches money,
  citing ADR 0012 (fee-basis precedent) and ADR 0027 (PayMongo split-settlement precedent, relevant
  to the future automated-payout phase). **Gate: your review and revision of this document.**
- **Phase 1 — MVP.** Tables 1, 3, 6. Cookie setter/getter. Attribution capture endpoint + storefront
  `?p=` capture. The single accrual hook at both call sites. Self-serve enrollment and share-link
  generation. A read-only earnings view. No cashout, no invite email yet.
- **Phase 2 — Payout + manual cashout.** Tables 4, 5. Payout-methods CRUD. Cashout
  request → approve → mark-paid. Admin cashout queue. Reversal handling on order
  cancellation/rejection.
- **Phase 3 — Invites + polish.** Attribution audit table (2) surfaced in an admin view, the email
  invite flow, admin rate overrides/suspend controls, basic fraud/reconciliation dashboards.
- **Phase 4 — Automated PayMongo disbursement** (later; no schema rework needed) via the
  forward-compatibility columns already reserved on the payout-method and cashout tables.

---

## Hardest risks and edge cases

1. **Cross-database order↔affiliate join.** The only durable link is `tenant_id` + `tracking_pin`
   (there is no cross-DB foreign key). Tracking pin formatting must be normalized
   (uppercase/trimmed) exactly as the existing activity recorder does, or the unique
   `(tenant_id, order_reference)` index could mis-key against a legacy-formatted pin.
2. **Refund/clawback timing.** A commission can already be `paid` out by the time a late refund or
   cancellation comes in. See policy P2 above — this is a business decision, not just an
   engineering one, and is worth confirming explicitly.
3. **Attribution fraud.** The capture endpoint is public and unauthenticated by design (it has to
   work for an anonymous shopper who just scanned a QR). It should be rate-limited, log a hashed
   visitor fingerprint, enforce the self-referral block (P6), and treat "last scan overwrote a
   prior legitimate attribution" as an accepted tradeoff of last-scan-wins, not a bug — but it
   should still be logged/auditable via the attribution table.
4. **Money rounding.** Centavos as integers everywhere; the commission amount is computed once at
   accrual time and snapshotted — never recomputed later from a rate that may have since changed. A
   cashout's total must always equal the exact sum of the commission rows it consumes.
5. **Idempotency.** The unique `(tenant_id, order_reference)` index plus `findOrCreate` handles
   checkout idempotency replays and PayMongo webhook redelivery cleanly. Cashout row-reservation via
   `cashout_id`, done inside a transaction, prevents the same earned commission from being consumed
   by two concurrent cashout requests.
6. **The two accrual hook sites must stay in sync.** If any future code path creates a `completed`
   order without going through the normal `posUseCases` fulfillment-transition flow, its commission
   would get stuck at `pending` forever. A reconciliation/backfill job (following the existing
   backfill-run pattern used elsewhere in the `dgfy` module) is worth adding as a safety net once
   Phase 1 ships.

---

## Verification plan (once implementation begins)

- **Unit:** commission math (basis-point rounding, base correctly excludes delivery fee and the
  DGFY 1% fee), cookie map read/write (per-tenant isolation, last-scan-wins, expiry handling),
  balance aggregation, cashout row-reservation and settlement, the self-referral guard.
- **Integration:** a scan/capture against store A never attributes an order placed at store B;
  placing then completing an order produces exactly one `earned` commission; cancelling produces
  exactly one `reversed` row; an idempotent re-finalize (e.g. a duplicate webhook delivery) creates
  no duplicate commission row; a refund after cashout follows policy P2.
- **Manual end-to-end:** generate an affiliate QR in the admin app → scan it → complete a cash
  checkout on `frontend/apps/store` → confirm the commission shows as `pending` then `earned` in
  the affiliate's dashboard → request a cashout → approve and mark paid as the store owner → confirm
  the affiliate's balance reflects `paid`.
- Run `npm run check:architecture` (controller/boundary guardrails) and the backend + frontend test
  suites before any PR, per `docs/architecture/ARCHITECTURE_BOUNDARIES.md`.
- PRs should cite this study, the eventual ADR, ADR 0012, and ADR 0027, and follow
  `docs/ai/PR.md` (Conventional Commits, `develop` as the base branch, Summary/Motivation/Testing
  sections).
