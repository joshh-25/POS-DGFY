---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-24
last_reviewed: 2026-07-24
review_by: 2027-01-24
applies_to: affiliates_program, backend, pos_frontend
topic: affiliates_program_commission_and_cashout
---

# ADR 0036: Affiliates Program — Commission Ledger, Attribution, and Cashout

## Status
Accepted (2026-07-24)

## Context
The Affiliates Program lets a DGFY account earn a commission on sales it refers to a tenant's
store, tracked via a public `share_code`/`?p=` link or an in-store code entered at POS checkout.
This is a cross-boundary, money-touching feature per `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
(it changes checkout behavior, introduces a new ledger, and adds a payout/cashout flow), so it
requires an ADR before being considered fully governed.

The feature was built incrementally, backend + POS mini-back-office first
(`frontend/apps/store` was mid-refactor and explicitly out of scope for this phase; see
`docs/proposals/AFFILIATES_PROGRAM_BACKEND_POS_HANDOFF_2026-07-23.md` for the slice-by-slice
build log). It touches money handling already governed by two prior ADRs:

- **ADR 0012** (DGFY global convenience fee and UI brand separation) established that
  `service_fee_amount` (the DGFY 1% convenience fee) is computed on gross subtotal and is separate
  from any discount/commission math. Affiliate commission must not be computed on top of, or
  confused with, this fee.
- **ADR 0027** (PayMongo QRPh commerce payment sessions and platform split settlement) established
  how storefront online payments are split-settled between the platform and the tenant. Affiliate
  cashouts are a distinct, later, and currently manual money movement (DGFY/tenant owner pays the
  affiliate out-of-band) — not part of the PayMongo split-settlement path today, but the
  `dgfy_affiliate_cashouts` table's forward-compat `disbursement_provider`/`disbursement_payload`
  columns exist so a future PayMongo-driven auto-disbursement can be added without a schema change.
- **ADR 0029** (catalog, inventory, POS, and storefront ownership boundaries) established that POS
  and storefront are separate sales-execution surfaces sharing a modular-monolith backend. The
  affiliate ledger must join to a sale in either surface without violating that boundary or
  introducing a cross-database foreign key (landlord vs. tenant DB split).

## Decision

1. **Two databases, no cross-DB foreign keys.** The 6 new tables
   (`dgfy_affiliate_enrollments`, `dgfy_affiliate_attributions`, `dgfy_affiliate_commissions`,
   `dgfy_affiliate_payout_methods`, `dgfy_affiliate_cashouts`, `tenant_affiliate_settings`) live in
   the landlord DB, since an affiliate (a `DgfyAccount`) can be enrolled with multiple tenants. A
   commission row joins to its originating sale **by value**, not by FK:
   `(tenant_id, order_reference)`, where `order_reference = String(pos_transaction_id)` for both
   in-store POS sales and online storefront orders (the same id space). This mirrors the existing
   `DgfyCustomerActivity`/`DgfyLoyaltyTransaction` pattern already in the codebase.

2. **Money is always integer centavos; rate is basis points, snapshotted per row.** Never
   `DECIMAL`. `commission_rate_bps` defaults to 500 (5%), with a nullable per-affiliate override
   that falls back to the tenant's `default_rate_bps`. The resolved rate is snapshotted onto the
   commission row (`rate_bps_snapshot`) at accrual time so a later rate change never rewrites
   historical ledger entries.

3. **Commission base excludes the DGFY convenience fee and delivery fee (per ADR 0012).** Base =
   `round(subtotal − discount)` in centavos. `amount = round(base × bps / 10000)`. This keeps
   affiliate commission strictly a function of the tenant's own subtotal, not of DGFY's or a
   delivery provider's separately-governed fees.

4. **Channel-specific lifecycle: in-store earns immediately, online is pending until settled.**
   In-store POS sales are born `completed` at checkout (no pending stage in the POS transaction
   model), so their commission is written directly as `earned`. Online storefront orders instead
   start as `pending` and are flipped to `earned` (on `fulfillment_status → completed`) or
   `reversed` (on `→ cancelled`/`→ rejected`) by a post-commit hook in
   `buildUpdateOnlineOrderStatusUseCase`. A void of an in-store sale reverses its `earned` row the
   same way. All accrual/settlement is idempotent via a unique `(tenant_id, order_reference)` index
   and non-blocking (try/catch + `logger.warn`), mirroring the existing
   `recordDgfyOrderActivity` convention — a bookkeeping failure must never fail a sale or status
   update that already committed.

5. **Write-safety split: validate before commit, write after.** Affiliate code validation happens
   pre-commit (a bad code is rejected with a clean 422, so the cashier/customer gets immediate
   feedback); the attribution + commission write happens post-commit, best-effort.

6. **Self-referral is blocked wherever buyer identity is known.** In-store checkout does not
   capture a buyer identity today, so the guard is currently a no-op there; the online path does
   know the buyer (`storeCustomer.dgfy_account_id`) and enforces the guard live.

7. **Online attribution capture is a public, cookie-based, dormant endpoint.**
   `POST /api/v1/dgfy/affiliate/attribution/capture` resolves a tenant (by `tenant_id` or
   `store_slug`) and an affiliate's public `share_code`, records a `link`-channel attribution audit
   row, and sets an HttpOnly, `SameSite=Lax`, store-scoped cookie (`sku_aff_attr`) holding a JSON
   map keyed by `tenant_id` (a visitor can carry attribution for more than one store; last scan for
   a given store wins). The storefront checkout controller (`storeHandlers.js`) reads this cookie
   and threads the resolved enrollment id into the checkout payload — this is the only integration
   point with `frontend/apps/store`, and it requires zero changes there until a storefront page
   actually calls the capture endpoint on load. The endpoint never errors on an unknown code/store
   (soft `{ captured: false }`), so it cannot be used to enumerate either.

8. **Cashout is manual today; full-balance, not partial.** An affiliate requests a cashout, which
   reserves (via `SELECT ... FOR UPDATE`, in one transaction) every currently `earned`,
   not-yet-reserved commission row for that enrollment and sums them into the cashout's
   `amount_centavos` — always the affiliate's full available balance, never an arbitrary amount. A
   tenant owner approves, pays externally, and marks the cashout paid (bulk-flipping those reserved
   rows `earned → paid`); reject/cancel release the reservation (`cashout_id` back to `null`).
   `payout_snapshot` freezes the bank/wallet details used at request time so a later payout-method
   edit never rewrites cashout history. This is intentionally **not** wired to PayMongo
   split-settlement (ADR 0027) — the forward-compat columns exist for that future work but are
   unused today.

## Consequences

1. The commission ledger, attribution audit trail, and cashout state machine are fully specified
   and implemented in `backend/` (data model → domain → API) for both in-store and (dormant) online
   channels, with the storefront-facing UI and the actual capture-endpoint caller in
   `frontend/apps/store` deferred to a later, frontend-only phase.
2. No cross-DB foreign key was introduced; the value-based `(tenant_id, order_reference)` join
   preserves the existing landlord/tenant DB boundary (ADR 0029).
3. Commission math is provably independent of the DGFY convenience fee (ADR 0012) and does not
   touch PayMongo split-settlement (ADR 0027) — cashout disbursement remains a manual, owner-driven
   step until a future ADR revisits auto-disbursement using the forward-compat columns already in
   place.
4. Because online settlement and the public capture endpoint are dormant (no storefront caller
   exists yet), this phase carries no user-facing behavior change for `frontend/apps/store` and no
   regression risk to existing storefront checkout flows — verified by keeping the cookie bridge
   additive-only (it never overrides an explicit `attribution_enrollment_id` in the payload, and is
   a no-op when the cookie is absent).
5. Before this reaches production: a real migration run against a live MySQL DB, the backend test
   suite, and a frontend build/lint/test pass are still required (this branch was built in a
   sandbox with no live DB and no `node_modules` for either workspace — see the handoff doc's
   "Sandbox limitations" section for what was and wasn't verified).
