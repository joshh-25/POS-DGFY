---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-24
last_reviewed: 2026-09-01
review_by: 2027-01-24
applies_to: affiliates_program, backend, pos_frontend, storefront
topic: affiliates_program_commission_and_cashout
---

# ADR 0036: Affiliates Program — Commission Ledger, Attribution, and Cashout

## Status
Accepted (2026-07-24)
Amended (2026-07-29): commission-base clause tiered and amended; see Amendments.

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
   historical ledger entries. `[binding]`

3. **Commission base excludes the DGFY convenience fee and delivery fee (per ADR 0012).** Base =
   `round(subtotal − discount)` in centavos. `amount = round(base × bps / 10000)`. This keeps
   affiliate commission strictly a function of the tenant's own subtotal, not of DGFY's or a
   delivery provider's separately-governed fees. `[default]` — see Amendments: this base
   changes under [ADR 0050](0050-affiliate-buyer-facing-pricing-rule-engine.md) when a tenant opts
   into `commission_base_mode = base_price_subtotal`.

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

## Amendments

### 2026-07-29 — Commission base gains a tenant-opt-in alternative (decision A3)
- Clause amended: Decision 3 (`default`)
- Change: [ADR 0050](0050-affiliate-buyer-facing-pricing-rule-engine.md) adds
  `tenant_affiliate_settings.commission_base_mode`. The value here,
  `discounted_subtotal`, remains the default and is unchanged for every tenant
  that never touches the new setting — the commission base is still
  `round(subtotal − discount)`. A tenant may opt into `base_price_subtotal`,
  under which the commission base is the catalog subtotal regardless of any
  buyer-facing discount, per ADR 0050.
- Reason: ADR 0050 makes an affiliate's identity an input to the buyer-facing
  price for the first time. Once an affiliate discount can itself reduce
  `subtotal`, this clause's original base silently lets an affiliate's own
  discount shrink their own commission — the opt-in flag exists so a tenant can
  choose the recording's "affiliate earns the same whether or not a discount is
  running" behavior instead, without changing it for tenants who never asked
  for it.
- Consequence 4 above (no user-facing behavior change for
  `frontend/apps/store`) no longer holds once ADR 0050 ships — the storefront
  now shows and charges an affiliate-adjusted price. That consequence described
  this ADR's own scope at the time it was written and is superseded by ADR
  0050's consequences, not restated here.
- PR: affiliate pricing rule engine, Phase 1

### 2026-08-30 — Share link moves to a path-based short code; `?p=` retired (Decision 7, #452 / Phase 212)
- Clause amended: Decision 7 (untagged, therefore `[default]` per ADR 0039)
- Change: the affiliate share URL is now `{STOREFRONT_PUBLIC_ORIGIN}/s/{short_code}` — the store
  slug is no longer carried in the link at all, and `?p={short_code}` is **retired entirely**, both
  from emission and from the storefront's read path. This is a stricter cutover than Decision 7's
  original context line ("tracked via a public `share_code`/`?p=` link") anticipated: there is no
  back-compat shim for `?p=` links already in the wild (Pat's 2026-08-30 decision on #452: the
  feature was not yet meaningfully distributed, so an indefinite read-only fallback was judged not
  worth the extra surface). A visitor holding a pre-cutover `?p=` link lands on the storefront's
  ordinary discovery home instead of being attributed — see the new resolver's degrade behavior
  below.
- New surface: a public, unauthenticated `GET /api/v1/dgfy/affiliate/s/:short_code` resolves a
  short code to a store slug (and nothing else — no `tenant_id`, `enrollment_id`, or affiliate
  identity) so the storefront can boot the right store from a path-only link before the existing
  capture endpoint fires. It is mounted on a dedicated **browse-tier** rate limiter
  (`affiliateShareResolveLimiter`, ~90/min, `docs/api/RATE_LIMITING.md`), deliberately **not**
  `authLimiter` — the capture POST's 5-requests/5-minutes budget is survivable for a fire-and-forget
  write, but the resolver is now a page-load dependency and would turn a shared-network 429 into a
  visible outage if it shared that budget.
- **Decision 7's anti-enumeration property is qualified, not preserved unconditionally.** The
  original text states the capture endpoint "never errors on an unknown code/store... so it cannot
  be used to enumerate either." That remains true of the capture endpoint itself. The new resolver
  is a distinct surface with a narrower but real oracle: given a syntactically valid code, its
  response body's `resolved` field reveals whether that code exists (and points at a public,
  program-enabled store) — a fact a QR scan already reveals to whoever holds the code, but which an
  automated scan of the code space could now query directly. This is deliberately narrowed as far
  as it reasonably goes, not eliminated:
  - Uniform HTTP 200 on every path (valid-but-unknown, invalid format, program disabled, no
    discovery-index row) — never a 4xx that would itself leak which case occurred.
  - The response body carries only `{ resolved, store_slug, short_code }` — no tenant, enrollment,
    or affiliate-identity field a successful guess could harvest beyond the slug a scan already
    exposes.
  - The code space is `AF-` + 6 characters from a 32-symbol alphabet (Crockford-like, no `0/O/1/I`)
    — 32⁶ ≈ 1.07 × 10⁹ combinations — plus the browse-tier rate limiter above, which bounds how much
    of that space one IP can probe per minute.
  - A short code is syntactically distinguished from a store slug by a strict discriminator
    (`AF-` followed by 6 characters from the same 32-symbol alphabet, applied before any slug
    handling) so a code can never reach `resolveTenantByStoreSlug`'s unknown-slug miss-repair path
    — an availability concern, not an enumeration one, but recorded here since it constrained the
    same design.
  - A reader of Decision 7 must not come away believing the whole attribution surface is
    enumeration-proof after this change — the capture endpoint still is; the resolver is
    enumeration-*resistant*, not enumeration-*proof*.
- Degrade behavior (new, not in the original Decision 7): on an unresolved code, a rate-limit
  response, or a network error, the storefront falls through to the ordinary discovery home — no
  error page, no retry loop, matching the best-effort posture Decision 7 already established for
  the whole attribution path.
- Supersedes decision P5 in `docs/proposals/2026-07-22-affiliates-program-study.md`, which is left
  unedited as a dated study (its own header reads "Status: not implemented";
  `AGENTS.md`'s leave-alone rule for dated/historical records applies — this Amendments block is
  where the current, governing truth lives).
- PR: #452, Phase 212 (`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`)

### 2026-08-31 — Per-tenant enrollment cap (retro-documented) and its landlord-admin write path (#1190, Phase 213)
- Clause amended: none directly — this is new material this ADR omitted, not a
  correction of an existing Decision. Filed under the `[default]`/untagged route
  per ADR 0039 (no `[binding]` clause governs enrollment capacity today).
- **Retro-documentation of a shipped mechanism (Phase 198, #1177, PR #1187,
  not previously recorded here):** every tenant carries a per-tenant affiliate
  enrollment cap, `tenant_affiliate_settings.max_affiliate_slots`
  (`NOT NULL DEFAULT 1`). "Consumed" slots are active enrollments plus live
  pending invites (revoked/suspended enrollments and
  expired/cancelled invites do not consume). Every write that can consume a
  new slot (`createEnrollment`, `createInvite`,
  `materializeInviteEnrollment`, and the #1191/Phase 207 reactivation
  endpoint) calls `assertAffiliateSlotAvailable` inside its own transaction,
  which first takes a row lock on the tenant's settings row
  (`acquireAffiliateSlotLock`) so two concurrent slot-consuming writes for
  the same tenant serialize rather than both reading a stale count (#1187
  RF-1/RF-6). Before this cap shipped, enrollment was unbounded (#447's own
  precondition) — a production reconciliation of tenants that were already
  over this cap at cutover remains a manual, un-automated step, not
  discharged by any phase to date.
- **New surface (this phase): the only write path for the cap.**
  `PATCH /api/v1/admin/tenants/:id/affiliate-slots` (plus `GET` and
  `GET .../audit-logs` siblings) is the sole way to change
  `max_affiliate_slots` — a hand-written `UPDATE` against the production
  landlord DB was the only way to do this before. Two decisions Pat made on
  #1190 (2026-08-31), both binding on this endpoint's behavior:
  - **Access (E1):** delegable to any `admin.tenants` holder, not
    Platform-Master-Admin-only — mounted under
    `/api/v1/admin/tenants/:id/…`, which `resolvePlatformAdminRoutePolicy`
    (`middleware/auth.js`) grants automatically via its existing
    `admin.tenants` path-regex row. This matches how `capabilities` and
    `pos-metadata` are scoped (delegable), unlike `admin/templates`
    (platform-wide curation, kept master-only on the reasoning that a
    published template shapes what every future tenant provisions with —
    that reasoning does not apply to a single tenant's own cap).
  - **Lowering the cap (E2):** allowed, including below current
    consumption. Every existing enrollment and pending invite is
    grandfathered — lowering the cap **never** suspends, revokes, or
    otherwise mutates any of them; it binds only future slot-consuming
    writes. The observed `slots_used` at write time is recorded on the
    audit row (`before_snapshot.slots_used`,
    `metadata.over_cap_after_write`) and in the endpoint's own response
    (`over_cap`), so an over-cap tenant is visible in the record, not
    hidden by it. This governs only what a *human platform admin* may do —
    it does not establish any automated lapse/dunning downgrade behavior,
    which remains unbuilt.
  - Raising the cap is still exactly what #447 D5 already established: "a
    manual, out-of-band admin action, negotiated between DGFY and the
    Business" — this phase gives that action an authenticated, validated,
    audited interface, it does not make the cap self-serve. The
    merchant-facing `PUT /affiliates/settings` allowlist
    (`buildUpdateAffiliateSettingsUseCase`) still cannot write
    `max_affiliate_slots`, unchanged by this phase.
  - Audited via the existing `tenant_admin_audit_logs` table (one new
    `action` enum value, `affiliate_slots_update`) rather than a new table —
    that table already carries every field this write needs
    (`actor_username`, `reason` `NOT NULL`, `before_snapshot`,
    `after_snapshot`, `metadata`, `created_at`), keyed per-tenant.
- Explicitly out of scope, named rather than silently absent: a billing/
  purchase flow for buying additional slots, a generic tenant × resource ×
  limit entitlements primitive, and any system-driven downgrade on payment
  lapse — all three remain #488/#491's open scope, not this ADR's.
- PR: #1190, Phase 213 (`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`)

### 2026-09-01 — Enrollment status history: a new events table, authoritative over the Phase 199 columns (#1202, Phase 214)

- Clause amended: none — this is new material the ADR omitted, not a correction of an existing
  clause. No `[binding]` clause governs enrollment status history (the ADR's only `[binding]`
  clause, Decision 2, governs rate snapshotting). Filed per ADR 0039's `[default]`/untagged tier,
  same route the 2026-08-31 amendment above took.
- Change: a new landlord table, `dgfy_affiliate_enrollment_status_events`, records every
  `dgfy_affiliate_enrollments.status` transition — enrollment, suspension, revocation, and
  reactivation alike — as an append-only row: `from_status`/`to_status`, a derived `event_type`,
  an `actor_type` (`tenant_user` | `dgfy_account` | `system`) with a denormalized `actor_username`
  (resolved once, at write time, from `req.user.username` — the same pattern
  `dgfy_account_admin_audit_logs`/`tenant_admin_audit_logs` already use), an optional `reason`, and
  a `source` distinguishing a captured event from a backfilled one. `tenant_id`/`enrollment_id` are
  held by value, no FK — the same landlord by-value convention Decision 1 already establishes for
  this module, so a future enrollment hard-delete cannot cascade away audit evidence.
- **Authority relative to the three Phase 199 columns
  (`revoked_at`/`revoked_by`/`revocation_reason`): those columns are UNCHANGED — same names, same
  semantics, kept as a documented denormalized cache of the most recent DEMOTION event, not
  retired.** Phase 207's compliance declaration lists their preservation as a verified
  precondition, and `GET /affiliates` already returns them with no serializer change needed.
  **The one invariant this creates:** the three columns and the events table can disagree about
  *which kind* of demotion happened (`revoked_at` conflates `suspended`/`revoked`, since it stamps
  on either transition into either status) — the events table records `from_status`/`to_status`
  exactly and does not have this conflation. **On any disagreement, the events table is
  authoritative.**
- **Four instrumented write sites**, all in `dgfyAffiliateRepository.js`, three already
  transactional (`createEnrollment`, `materializeInviteEnrollment`'s two callers,
  `reactivateEnrollment`); the fourth (`updateEnrollment`, the generic PATCH) previously had no
  transaction at all and now does, specifically so the status read that determines `from_status`
  shares the same snapshot as the write it feeds. The event write is transactional with the status
  change everywhere, not best-effort — a status change that lands without its audit row is exactly
  the class of gap `tenant_admin_audit_logs`' own #1190 reasoning (quoted in the amendment above)
  exists to close, and ADR 0036 Decision 4's best-effort posture governs accrual bookkeeping on the
  sale path, not admin status changes; it is not borrowed here. Residual risk, stated rather than
  hidden: the auto-enroll-on-register write site runs inside the account-creation transaction, so
  an event-insert failure there would abort a registration that would otherwise have succeeded —
  accepted, since the alternative (skip the event write on that one path) leaves a permanent hole
  in the history for every invite-accepted affiliate.
- **Read endpoint:** `GET /api/v1/affiliates/affiliates/:enrollment_id/status-events`, gated on
  `VIEW_AFFILIATES` (read permission, matching `GET /affiliates` and the existing `/qr` sibling —
  not `MANAGE_AFFILIATES`), a dedicated endpoint rather than inlining an unbounded array into
  `GET /affiliates`, mirroring the #1190/Phase 213 `GET /:id/affiliate-slots/audit-logs` precedent
  cited in the amendment above. Tenant-isolated by resolving the enrollment for the caller's tenant
  first (404 if absent) before querying events — never queried by `enrollment_id` alone.
- **Open decision, stated rather than silently deferred (J2): affiliate-facing visibility.** This
  phase ships **no** affiliate-facing surface for this data — not the storefront customer
  dashboard, not `listEnrollmentsForAccount` — and **defaults to merchant-only visibility**. The
  events carry a merchant's free-text `reason`, and whether to surface any of this to the affiliate
  themselves is a relationship/tone product decision, not an engineering one; it does not block
  this phase and is not answered here. Whoever eventually builds an affiliate-facing read path must
  answer it first, not assume merchant-only was merely an oversight.
- **Partial backfill (J3):** an `enrolled` row is synthesized per existing enrollment from its
  `created_at`. A demotion row is synthesized only where `revoked_at IS NOT NULL` **and** the
  enrollment's current status is `suspended`/`revoked` (the demotion target is knowable there,
  `from_status` assumed `active` and flagged as such in `metadata`). Rows where `revoked_at` is set
  but the current status is `active`/`pending` are skipped outright — the demotion target is
  genuinely unknowable from the three legacy columns alone (they conflate `suspended`/`revoked` and
  never recorded a reactivation timestamp), and fabricating either field would be worse than a gap.
  Backfilled rows carry `source: 'backfill'`, never conflated with a captured event.
- Explicitly out of scope, named rather than silently absent: status events for invites, cashouts,
  or commissions (each already has its own state machine/columns); changing what `revoked_at` means
  (its suspend/revoke conflation stops mattering for anything reading the new table, but is not
  itself corrected); retention/pruning of status events (neither existing landlord audit table has
  one either).
- **Correction (PR #1232 review RF-4):** this amendment originally described #1203/Phase 215 as the
  pure-frontend consumer of this phase's new read endpoint. **That is wrong — #1203/Phase 215
  already merged independently, as PR #1231, before this correction was written, and does not call
  or depend on `GET .../status-events` at all** (it only renders the pre-existing
  `revoked_at`/`revoked_by`/`revocation_reason` columns already on `GET /affiliates`, per its own
  `IMPLEMENTATION_PHASE_LEDGER.md` entry). This phase's new endpoint currently has **no** frontend
  consumer; the eventual UI for a real per-affiliate timeline with names is unscheduled follow-up
  work, not something #1203/Phase 215 covers.
- PR: #1232, Phase 214 (`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`)

### 2026-08-31 — Enrollment re-verified at commit time, on both channels (#1199, #450 D2, Phase 206 + Phase 220)

- Clause amended: none — this is new material the ADR omitted, not a correction of an existing
  clause. No `[binding]` clause governs this (the ADR's only `[binding]` clause, Decision 2,
  governs rate snapshotting, untouched here). Decision 4 ("in-store earns immediately, online is
  pending until settled") is the clause this amendment operates under and is untagged, i.e.
  `[default]`. Filed per ADR 0039's `[default]`/untagged tier, same route the 2026-09-01 amendment
  above took.
- **Retroactive documentation, in part.** Phase 206 (`#450` decision D2, PR #1200) shipped this
  behavior on the storefront checkout path first, without an ADR 0036 amendment — this is the first
  record of it. Phase 220 (`#1199`) extends the identical semantics to the in-store POS checkout
  path; this single amendment covers both, filed together rather than backfilling Phase 206's own
  entry separately.
- **The rule, stated once for both channels:** the affiliate enrollment used to decide whether — and
  to whom — a commission accrues is re-resolved against the database, by enrollment id, at
  commit time (immediately post-`transaction.commit()`), rather than trusting whatever enrollment
  object was resolved earlier in the request (pricing time on storefront, entry/validation time on
  POS). If the enrollment is no longer `active` — revoked, suspended, or the tenant's affiliate
  program disabled — in the window between the earlier resolve and commit, the commission accrual
  is silently skipped and a `logger.warn` is emitted (`[StorefrontCheckout] Affiliate attribution
  dropped: enrollment inactive at commit` / `[PosUseCases] Affiliate attribution dropped: enrollment
  inactive at commit`). **The order/sale itself always stands, unchanged, on both channels** — no
  buyer- or cashier-facing surface reflects the drop; it is discoverable only in server logs. This
  is the same non-blocking, "silent drop, buyer unaffected" convention Phase 208's lifetime earnings
  cap already established for the same accrual path.
- **Mechanism:** both channels call the same helper,
  `resolveActiveAffiliateEnrollmentById({ tenantId, enrollmentId, repository })`
  (`apps/dgfy-api/src/modules/dgfy/utils/affiliateCommissionAccrual.js`) — a plain, non-locking read
  on the default connection (the order/sale's own transaction has already committed by the time this
  runs, so it necessarily sees current committed state; no lock, no `FOR UPDATE`, no transaction
  handle). No new helper or shared abstraction was introduced for either phase — this export already
  existed and both channels reuse it as-is.
- **Storefront-specific detail:** the re-check does not touch pricing. `resolved.affiliatePricing`
  (the price rule, rate, and `commission_base_mode`) remains the source of the commission *math*;
  only the enrollment used to decide *whether, and to whom* commission accrues is re-resolved. The
  drop branch there is guarded (`else if (affiliatePricing?.enrollment)`) to avoid re-logging an
  enrollment that was already stale at pricing time, not newly dropped in this window.
- **POS-specific detail — a real, deliberate divergence from storefront:** on POS, the affiliate
  enrollment affects nothing but the commission (no price, discount, VAT, or receipt field is ever
  touched by it), and an unresolvable affiliate code already hard-rejects the whole checkout with a
  `422 AFFILIATE_CODE_INVALID` gate before any write. Because that entry-time gate already excludes
  the "already stale when the cashier typed it" case, POS's drop branch is a bare `else` (not
  storefront's `else if`) — every null at commit-time re-check on POS is, by construction, an
  in-flight transition, always worth logging. The entry-time 422 gate itself is unchanged by this
  amendment — two checks at two times is the design, not redundancy.
- **Idempotency, unaffected on both channels.** Accrual is already guarded by the commission
  ledger's unique `(tenant_id, order_reference)` index; re-resolving the enrollment a second time
  adds no new race or double-accrual surface.
- **Known limitation, named rather than silently absent — POS's primary checkout route cannot
  reach this fix today.** `checkoutPosSchema` (`apps/dgfy-api/src/validators/posValidator.js`)
  strips `affiliate_code` on `POST /pos/checkouts` (no declared key, no `.unknown(true)`,
  `stripUnknown: true`), so on that route the field never reaches the use case and no in-store
  commission has ever accrued through it. This amendment's POS-side semantics are live only on the
  split-payment-completion and mobile-offline-sync paths, which do carry a live `affiliate_code`
  through. Restoring the primary route's field is a separate, money-affecting feature restoration,
  filed as its own follow-up (`Refs #1199, #446`), deliberately not bundled into Phase 220.
- **Known limitation, named rather than silently absent — a pre-existing POS split-payment
  rollback hazard.** When `checkoutPosUseCase` is invoked from `buildCompletePosPaymentSessionUseCase`
  with a caller-provided transaction (`ownsTransaction === false`), the `:4399` commit is a no-op and
  the affiliate accrual block runs while the outer transaction is still open; that caller can still
  throw and roll back afterwards, and the affiliate commission/attribution rows (landlord DB, a
  different connection) do not roll back with it. Pre-existing, unrelated to #1199/#450, found while
  verifying this amendment's POS half. This re-verify can only ever *reduce* the number of rows
  written relative to today's behavior on that path, never increase the risk. Filed separately for
  `pm` to shape.
- Explicitly out of scope, named rather than silently absent: an offline POS sale synced after the
  affiliate was revoked (`syncMobilePosCheckouts`) is rejected outright at its own entry gate, not
  merely uncommissioned — a different, and arguably worse, defect at a different point in the flow;
  filed separately. Neither channel's drop has an operator- or merchant-facing surface yet — named
  as a gap, not proposed as work.
- PR: #1200 (storefront, Phase 206), #1242 (POS, Phase 220) — see
  `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`
