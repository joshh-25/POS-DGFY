---
status: reference
authority_level: reference
owner: backend
last_reviewed: 2026-07-25
applies_to: affiliates_program, backend, pos_frontend, storefront_frontend
topic: affiliates_program_backend_pos_handoff
---

# Affiliates Program — Backend + POS + Storefront Handoff

Date: July 23, 2026 (updated July 24, 2026; updated again July 25, 2026 for Phase 7)
Branch: `claude/affiliates-program-study-592zhd` (base: `develop`)

## Purpose

This note is for whoever (human or AI) picks up the Affiliates Program build next. It exists so
a different assistant/tool can continue without re-deriving the design decisions already made and
already implemented in this branch.

Read in this order:
1. `docs/proposals/2026-07-22-affiliates-program-study.md` — the full design study (why the feature
   exists, the original user story, all the open policy questions and their chosen defaults).
2. This file — what has actually been built, slice by slice, against that study.

## Scope boundary (updated — the storefront freeze has lifted)

**Original rule (slices 1–6, no longer in force): do not touch `frontend/apps/store`.** The storefront
app was mid-refactor on a separate branch/effort, so the first phase (backend + POS, see "What's built
so far" below) was deliberately scoped away from it. That refactor landed on `origin/develop` (PRs
#67, #89) and this branch merged it cleanly (see "Develop merge" below) — the freeze is lifted, and
**Phase 7 (below) does touch `frontend/apps/store`**, specifically the customer-dashboard area under
`frontend/apps/store/src/customer-dashboard/` plus a small page-load hook in `StorefrontApp.jsx`.

The backend (`backend/` — **not** `apps/dgfy-api`, which is a parallel rewrite not yet cut over, see
`docs/architecture/COMPATIBILITY_INVENTORY.md`) and the POS frontend (`frontend/src/features/pos/`)
remain the same target as before.

Owner-facing UI lives in the **POS mini-back-office** (the terminal's Settings workspace,
`TerminalOperationsWorkspace.jsx`'s view-mode switch) — explicitly **not** skupervisor (that's the IMS)
and **not** a new admin app. This was an explicit user decision; do not relitigate it.

Still deferred (Phase 7 did not build these; no backend support exists for them yet either):
- **Self-serve enrollment UI.** The backend `POST /api/v1/dgfy/affiliate/enroll` endpoint exists and
  works (only succeeds where the tenant has `program_enabled && auto_approve_enrollment`), but no
  frontend calls it — enrollment stays **owner-only** (provisioned from the POS back-office panel) per
  an explicit scope decision when Phase 7 was planned. Do not add a "Become an affiliate" storefront
  flow without a fresh user decision.
- **Email-invite redemption UI.** No invite-email send/redeem flow exists anywhere in this program
  (owner provisioning is direct, not tokenized-invite-based) — this was called out as deferred from
  the very first slice and nothing since has changed that.
- **Choosing a specific payout method at cashout-request time.** The storefront's "Request Cashout"
  button omits `payout_method_id`, so the backend falls back to the account's default payout method
  (already-supported backend behavior) — a picker could be added later if a user has multiple methods
  and wants to route a specific cashout to a non-default one.

## Core design decisions (already settled, don't re-derive)

- **Two databases, no cross-DB FKs.** Landlord DB holds `DgfyAccount` + all 6 new
  `dgfy_affiliate_*` / `tenant_affiliate_settings` tables. Tenant DBs hold `pos_transactions`. Joins
  between a commission row and a POS sale are **by value**: `(tenant_id, order_reference)`, where
  `order_reference = String(posTransactionId)` for in-store sales. This mirrors the existing
  `DgfyCustomerActivity`/`DgfyLoyaltyTransaction` pattern already in the codebase.
- **Money is always integer centavos.** Never `DECIMAL`. Commission rate is basis points (bps);
  default 500 (5%), nullable per-affiliate override that falls back to the tenant's
  `default_rate_bps`.
- **Commission base** = order subtotal minus discount, in centavos — **excludes** delivery fee and
  DGFY's 1% platform fee.
- **Idempotency** via a unique `(tenant_id, order_reference)` index on the commission ledger +
  `findOrCreate`. A duplicate accrual call is a silent no-op.
- **QR/referral link param is `?p=`** — deliberately not `ref`/`refId` per explicit user requirement.
- **Share code** (`short_code`, e.g. `AF-K7QP2X`, Crockford-like alphabet excluding `0/O/1/I`) is a
  **public, shareable identifier**, not a secret — it's meant to be typed/scanned. `share_code_hash`
  (SHA-256) exists purely so lookups go through a hash index, matching the repo's existing
  hash-at-rest convention (`DgfyReviewInvite`) — it is not a secrecy boundary here.
- **In-store POS sales are born `completed`** (no pending stage), so in-store commission is **earned
  immediately** at checkout. Online orders (future storefront phase) will instead start `pending` and
  flip to `earned`/`reversed` on order status change — that lifecycle hook is designed but not yet
  wired to anything (no online attribution capture exists yet).
- **Write-safety pattern:** affiliate code validation happens **before** the POS transaction commits
  (bad code → clean 422, cashier gets immediate feedback). The actual commission/attribution write
  happens **after** commit, wrapped in try/catch + `logger.warn`, so a bookkeeping failure can never
  fail a sale that already succeeded. This mirrors the existing non-blocking
  `recordDgfyOrderActivity` convention.
- **Cashout is manual for now**: affiliate requests → owner approves → owner pays externally → owner
  marks paid. `disbursement_provider`/`disbursement_payload` columns exist on the cashout table purely
  as forward-compat for a future PayMongo-driven auto-disbursement; they are unused today.

## Architectural conventions to keep following

- Trio pattern per domain, in `backend/src/modules/dgfy/`: `repositories/dgfyAffiliateRepository.js`
  (plain object, direct Sequelize calls, local `toPlain()` helper) →
  `usecases/dgfyAffiliateUseCases.js` (`ok`/`fail` from `applicationResult.js`,
  `DomainError`/`DomainErrorCode` from `domainErrors.js`) →
  `controllers/dgfyAffiliateHandlers.js` (thin, `sendUseCaseResult`) → routes → composed as
  ready-built use-case instances exported from `backend/src/modules/dgfy/index.js`.
- Migrations in `backend/migrations/*.cjs`: idempotent (`describeTable`/`showIndex` guards),
  `createTable` + explicit `addIndex`, **no FK constraints** (cross-DB safety).
- Models in `backend/src/models/Landlord/*.js`: empty `class X extends Model {}`, all fields in
  `.init()`; associations wired centrally in `backend/src/models/index.js`, not via `static associate`.
- Permissions live in `backend/src/config/permissions.js` as a nested `{ label, actions: {...} }`
  group; `admin` role auto-gets everything via `getAllPermissions()`.
- Tenant staff/owner routes use `authenticate` + `checkPermission(...)` from
  `backend/src/middleware/auth.js`. DGFY-account self-service routes use `authenticateDgfyAccount`
  from `backend/src/middleware/dgfyAuth.js`.
- POS frontend: `frontend/apps/pos` is a thin shell; real UI is in `frontend/src/features/pos/`.
  New large features are **separate components** delegated to from
  `TerminalOperationsWorkspace.jsx`'s mode switch (that file is already ~7,200 lines against a
  1,500-line lint warning threshold — do not add more bulk to it directly). No shared permission
  hook exists; each panel duplicates a local `resolveUserPermissionList(user)` helper. No shared API
  client wrapper beyond the `api` axios instance from `@/services/api`; each feature gets its own flat
  `services/*.js` file of named async exports.

## What's built so far (slices 1–4, all committed and pushed to this branch)

1. **Data model** (`7d71993`) — migration `backend/migrations/20260723000001-create-affiliates-program.cjs`
   creating all 6 tables; models in `backend/src/models/Landlord/DgfyAffiliate*.js` +
   `TenantAffiliateSettings.js`; associations added to `backend/src/models/index.js`.
   Tables: `dgfy_affiliate_enrollments`, `dgfy_affiliate_attributions`, `dgfy_affiliate_commissions`,
   `dgfy_affiliate_payout_methods`, `dgfy_affiliate_cashouts`, `tenant_affiliate_settings`.
2. **Domain + admin API + permissions** (`5844eca`) — enrollment/settings CRUD, `AFFILIATES`
   permission group, owner/admin routes at `/api/v1/affiliates` (`backend/src/routes/affiliateAdmin.js`,
   mounted in `server.js`), self-service routes at `/api/v1/dgfy/affiliate/*`
   (`backend/src/routes/dgfy.js`).
3. **In-store attribution + earn** (`c1d1862`) — `backend/src/modules/dgfy/utils/affiliateCommissionAccrual.js`
   (pre-commit code resolution, post-commit accrual, void reversal); hooked into
   `buildCheckoutPosUseCase`/`buildVoidPosTransactionUseCase` in
   `backend/src/modules/pos/usecases/posUseCases.js`.
4. **POS back-office panel + checkout code field** (`7053837`) — new "Affiliates" nav entry in the
   terminal Settings group (admin-only), `AffiliatesWorkspacePanel.jsx` (settings, provisioning, rate
   override, suspend/revoke, QR/share-link via the `qrcode` package),
   `frontend/src/features/pos/services/affiliateService.js`, and an optional "Affiliate Code" field
   in `POSCheckoutTerminal.jsx`.
5. **Payout methods + cashout backend/API + owner approval queue** — full CRUD for
   `dgfy_affiliate_payout_methods` (self-service, mirrors the existing `DgfyCustomerAddress` CRUD 1:1:
   multiple methods, one `is_default`) and the cashout state machine on `dgfy_affiliate_cashouts`
   (`requested` → `approved` → `paid`, or `rejected`/`cancelled`). Row reservation happens in
   `dgfyAffiliateRepository.requestCashout`: inside one transaction, every currently `earned` row with
   `cashout_id IS NULL` for that enrollment is pulled, summed into `amount_centavos`, and stamped with
   the new cashout's id — a cashout is always a full-balance request, never a partial amount (matches
   the study's design, not a simplification). Reject/cancel clear `cashout_id` back to null; mark-paid
   bulk-flips those same rows `earned → paid`. Self-service routes on `/api/v1/dgfy/affiliate/*`
   (`payout-methods` CRUD + `default`, `cashouts` request/list/cancel); owner/admin queue routes on
   `/api/v1/affiliates/cashouts` (list/approve/mark-paid/reject), gated by the existing
   `affiliates:cashout_approve`/`affiliates:cashout_pay` permissions. `AffiliatesWorkspacePanel.jsx`
   got a new "Cashout Requests" section for the approval queue.
6. **Online attribution backend + lifecycle hooks + cookie util + capture endpoint** — dormant,
   backend-only, does not touch `frontend/apps/store`.
   - Cookie util: `SESSION_COOKIE_NAMES.affiliateAttribution = 'sku_aff_attr'` +
     `setAffiliateAttributionCookie`/`getAffiliateAttributionCookie` in
     `backend/src/utils/browserSessionCookies.js` — HttpOnly, `SameSite=Lax`, JSON map keyed by
     `tenant_id` (per-store isolation, last-scan-wins).
   - Repository: `createPendingCommissionIfMissing` (online twin of the existing
     `createEarnedCommissionIfMissing`, writes `status: 'pending'`) and
     `markCommissionEarnedByOrderReference` (`pending` to `earned`) added to
     `dgfyAffiliateRepository.js`.
   - Accrual util: `resolveActiveAffiliateEnrollmentById`, `accruePendingForOnlineOrder` (records a
     `link`-channel attribution + pending commission; the self-referral guard is now live since
     online checkout knows the buyer), and `settleAffiliateCommissionForOrder` (dispatches to
     earned/reversed) added to `affiliateCommissionAccrual.js`.
   - POS hook: `buildUpdateOnlineOrderStatusUseCase` in `posUseCases.js` now settles any pending
     commission post-commit — `completed` becomes `earned`; `cancelled`/`rejected` becomes
     `reversed`. Same non-blocking try/catch convention as the existing activity recorder.
   - Store hook + cookie bridge: `buildStoreCheckoutUseCase` in `storeUseCases.js` writes a pending
     commission post-commit when the checkout payload carries `attribution_enrollment_id`. The
     bridge lives in `storeHandlers.js`'s `checkout` controller — it reads the attribution cookie
     and injects the field into the payload (never overriding an explicit payload value). This is
     the **only** touch point with the `store` module; `frontend/apps/store` itself was not
     modified.
   - Public capture endpoint: `POST /api/v1/dgfy/affiliate/attribution/capture`
     (`backend/src/routes/dgfy.js`, no `authenticateDgfyAccount` — it's an anonymous-visitor
     endpoint) resolves a tenant (by `tenant_id` or `store_slug`) and a `?p=` short code, records a
     `link` attribution, and sets the cookie. Always soft-succeeds (`captured: false` on an
     unresolved code/store) so it can't be used to enumerate either.
7. **Governance ADR** — `docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md`,
   citing ADR 0012 (fee-basis), ADR 0027 (PayMongo split-settlement), and ADR 0029 (POS/storefront
   ownership boundaries). Satisfies the `cross-boundary` ADR requirement in
   `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.

## Develop merge (2026-07-24)

`frontend/apps/store`'s refactor (previously in flight and the reason this phase was scoped away
from it) landed on `origin/develop` via PRs #67 and #89. This branch merged 112 develop commits in
cleanly (`git merge-tree` predicted, and the actual merge confirmed, zero conflicts). Only 3 files
were touched by both sides — `backend/src/models/index.js`, `backend/src/server.js`,
`frontend/src/features/pos/components/POSCheckoutTerminal.jsx` — and all 5 affiliate touchpoints in
`POSCheckoutTerminal.jsx` (the affiliate-code input, its payload field, and the confirmation resets)
were confirmed intact post-merge. A second develop merge landed the next day (PR #90, storefront
in-app auth, 7 commits, again 0 conflicts and 0 file overlap with the affiliate work).

## Phase 7: Storefront affiliate self-service + online attribution wiring (2026-07-25)

With the storefront freeze lifted, this phase built the customer-facing half that Phase 1–6 left
dormant: an affiliate can now see their businesses, share their QR/link, manage payout methods, and
request/track cashouts entirely from the storefront customer dashboard, and the online
"scan QR → buy online → affiliate earns" path is now live end to end. **No backend changes were
needed for the self-service UI** — every endpoint it calls already existed from Phase 2/5. One small
backend enrichment (7B) was added to support it.

7A. **Online attribution capture on page load** (`a71026c`) —
`readAffiliateShortCode()` added to `frontend/apps/store/src/app/routing/storefrontRouting.js`
(mirrors the existing `readStoreItemId`/`readTrackingPinFromQuery` `?`-param readers). New
`frontend/apps/store/src/shared/hooks/useAffiliateAttributionCapture.js`: a once-per-load,
ref-guarded effect that fires a single best-effort `POST
/api/v1/dgfy/affiliate/attribution/capture` (`{ p, store_slug }`) once `routeSlug` resolves, wired
into `StorefrontApp.jsx` next to the route-state initializers. This closes the loop the backend
attribution lifecycle (`buildStoreCheckoutUseCase`'s pending-row hook, built in Phase 6) had been
waiting on — checkout's same-origin `requestJson` call already sends `credentials:'include'`, so
the resulting `sku_aff_attr` cookie rides along automatically; no checkout code changes were needed.
7B. **Backend enrichment: share link on self-service enrollments** (`6471c32`) —
`GET /affiliate/enrollments` returned `short_code` + `tenant:{id,name}` but no usable link/QR
target. `listMyAffiliateEnrollmentsUseCase` (`dgfyAffiliateUseCases.js`) now adds
`store_slug`/`share_path`/`share_url` per enrollment, reusing the existing `getStorefrontSlug` repo
method + `buildAffiliateShareUrl` helper (already used by the owner-side QR payload use case). This
is the only backend change in Phase 7.
7C. **Customer-dashboard Affiliate section — businesses/earnings/QR** (`ca2ec69`) — new "Affiliate"
nav item + views entry in the customer dashboard (`DgfyCustomerAccountPage.jsx`'s views-map
composition), loading `GET /affiliate/enrollments` + `GET /affiliate/earnings` alongside the existing
`Promise.all` in `useCustomerAccountPanel.js`. New `components/AffiliateSection.jsx`: an overall
available/pending/paid balance header, and a Businesses tab listing each enrollment with status,
commission rate, share link (copy button), a lazily-generated scannable QR preview
(`QRCode.toDataURL`, same call the POS back-office panel uses), a branded QR download (reusing
`storefrontQrExport.js`'s `buildStorefrontQrExportImage`/`downloadDataUrl` — no new QR-rendering code),
and a per-store earnings breakdown.
7D. **Payout methods CRUD** (`7d68ad6`) — a full bank/GCash/Maya payout-method CRUD in the Payout
Methods tab, cloning (not reusing directly — payout methods have no "select for checkout" concept and
need a bank/wallet icon, not a location pin) the existing address-management three-layer stack:
`model/payoutMethodPresentation.js`, `components/PayoutMethodCard.jsx`/`PayoutMethodEditorModal.jsx`/
`PayoutMethodsSection.jsx` (same visual structure as the address equivalents), and
`hooks/useCustomerDashboardPayouts.jsx` (save/set-default/delete against
`POST|PUT /affiliate/payout-methods(/:id)`, `PATCH .../default`, `DELETE .../:id` — same busy-token,
optimistic-set-default-with-rollback, toast + `handleLoadAccountPanel()` refresh pattern as the
address hook). The new handlers were threaded through the full runtime → route-bindings →
storefront-bridge → route-model → route-container → page prop chain (6 hops), matching every existing
address handler's path name-for-name.
7E. **Cashout request + history** (`68e65d1`) — a Cashouts tab: per-active-business "Request Cashout"
row (disabled with a hint once available balance is below the documented platform default of ₱200 —
a soft client-side hint only; the backend still enforces the store's real configured minimum on every
request) and a history list with status badges, amount, requested date, a payout-snapshot summary
(reusing `getPayoutMethodTitle` — the snapshot is the same shape as a payout method), and a Cancel
action on `requested` rows. `hooks/useCustomerDashboardCashouts.jsx` mirrors the same hook shape,
against `POST /affiliate/cashouts` / `PATCH /affiliate/cashouts/:id/cancel`.

## What's in progress / next

All backend + POS + storefront-self-service slices for this program are now complete. What remains is
the narrower list under "Still deferred" above (self-serve enrollment UI, email-invite redemption UI,
per-request payout-method selection) — none of it should start without a fresh user decision to open
that scope.

## Sandbox limitations that affected how prior work was verified

The environment this was built in had **no live MySQL database** and **no `node_modules` installed**
for either `backend/` or the frontend workspace (this held for Phase 7's `apps/store` work too — same
sandbox, same limitation). As a result:
- Backend migrations/models/use-cases were verified with `node --check <file>` (syntax only) — never
  actually run against a database. Where possible, the real project scripts were run directly instead
  of just `node --check` (they're pure Node with no `node_modules` dependency): `node
  scripts/check-architecture-guardrails.js`, `node scripts/check-controller-boundaries.js`, and `node
  scripts/check-compliance-impact.js` (via `COMPLIANCE_CHANGED_FILES=<diff> node
  scripts/check-compliance-impact.js` to simulate the CI diff) were all run against the real,
  accumulated diff at each step and passed genuinely, not just via `node --check`.
- Frontend changes (POS and, in Phase 7, storefront) were verified by manual diff review plus a crude
  brace/paren/bracket balance script — never a real bundler/lint/test run. For Phase 7's multi-hop
  prop wiring specifically, every new prop name was additionally traced end-to-end with `grep` across
  all 6+ files in each chain to catch naming mismatches a balance script can't detect.

**Before this branch merges, someone with a real dev environment must**: run the migration against a
real MySQL DB (`npx sequelize-cli db:migrate`, confirm all 6 tables + indexes, confirm clean
`db:migrate:undo`), run the backend test suite, and run `npm install && npm run build`/`npm run lint`/
the Vitest suite on the frontend workspace. This has been flagged in every relevant commit message but
is still outstanding.

## Verification checklist (updated for Phase 7)

- Unit: bps rounding + base excludes delivery/DGFY-fee; commission `findOrCreate` idempotency;
  in-store earn-at-commit; void→reversed; online pending→earned→reversed; cookie map per-tenant
  isolation + last-scan-wins; balance aggregation (`earned & cashout_id IS NULL`); cashout row
  reservation/settlement; self-referral guard.
- Integration: POS in-store checkout with `affiliate_code` → one `earned` commission + attribution
  row; void → `reversed`; cashout request reserves rows, approve→mark-paid flips `earned→paid`; admin
  settings/rate override reflected in next accrual; capture endpoint sets a store-scoped cookie and
  rejects a code from another tenant.
- Manual (POS): in the POS terminal, open Settings → Affiliates, enable program + provision an
  affiliate (get `AF-XXXXXX`/QR); ring up an in-store sale entering that code; confirm the affiliate's
  balance rises in the panel; approve+mark-paid a cashout; confirm balance moves to paid.
- Manual (storefront, Phase 7 — not yet run in a real environment): visit a store URL with `?p=AF-XXXXXX`
  → confirm `sku_aff_attr` cookie is set; buy something online while the cookie is set → confirm a
  `pending` commission is created; have the owner complete the order → confirm it flips to `earned`.
  In the customer dashboard (signed in as the affiliate's DGFY account), open the Affiliate section →
  confirm the business/QR/share-link/earnings show up; add a bank account and a GCash payout method,
  set one default, edit and delete one; request a cashout for a store above the minimum balance,
  confirm it appears in history, then cancel it.
- Guardrails/CI: `npm run check:architecture` (controller/boundary guardrails) + `npm run
  check:compliance` + backend & POS/storefront frontend test suites before merge. `frontend/apps/store`
  **was** modified in this phase (Phase 7) — the earlier "do not modify" restriction applied only to
  Phases 1–6 and has been lifted; see "Scope boundary" above.
