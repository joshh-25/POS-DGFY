---
status: reference
authority_level: reference
owner: backend
last_reviewed: 2026-07-23
applies_to: affiliates_program, backend, pos_frontend
topic: affiliates_program_backend_pos_handoff
---

# Affiliates Program — Backend + POS Handoff

Date: July 23, 2026
Branch: `claude/affiliates-program-study-592zhd` (base: `develop`)

## Purpose

This note is for whoever (human or AI) picks up the Affiliates Program build next. It exists so
a different assistant/tool can continue without re-deriving the design decisions already made and
already implemented in this branch.

Read in this order:
1. `docs/proposals/2026-07-22-affiliates-program-study.md` — the full design study (why the feature
   exists, the original user story, all the open policy questions and their chosen defaults).
2. This file — what has actually been built, slice by slice, against that study.

## Scope boundary (still in force)

**Do not touch `frontend/apps/store`.** The storefront app is mid-refactor on a separate branch/effort.
This entire phase is scoped to `backend/` (the live, deployed Express+Sequelize backend — **not**
`apps/dgfy-api`, which is a parallel rewrite not yet cut over, see
`docs/architecture/COMPATIBILITY_INVENTORY.md`) plus the POS frontend
(`frontend/src/features/pos/`).

Owner-facing UI lives in the **POS mini-back-office** (the terminal's Settings workspace,
`TerminalOperationsWorkspace.jsx`'s view-mode switch) — explicitly **not** skupervisor (that's the IMS)
and **not** a new admin app. This was an explicit user decision; do not relitigate it.

Deferred to a later storefront phase (backend hooks exist and are dormant, but no UI):
- Online/storefront QR-scan attribution capture on page load.
- The affiliate's own self-service UI (payout methods, cashout requests, earnings dashboard) — the
  API for this exists (`/api/v1/dgfy/affiliate/*`) but has no frontend caller yet.
- Email-invite redemption UI.

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

## What's in progress / next

5. **Payout methods + cashout backend/API** (current work as of this handoff) — full CRUD for
   `dgfy_affiliate_payout_methods` (self-service, mirrors the existing `DgfyCustomerAddress` CRUD 1:1:
   multiple methods, one `is_default`) and the cashout state machine on
   `dgfy_affiliate_cashouts` (`requested` → `approved` → `paid`, or `rejected`/`cancelled`), including
   row reservation (a cashout claims specific `earned` commission rows via `cashout_id` so they can't
   be double-cashed-out or reversed out from under it) and an owner-side approval queue added to
   `AffiliatesWorkspacePanel.jsx`.
6. **Online attribution backend + lifecycle hooks + cookie util + capture endpoint** — dormant
   backend-only work (cookie util in `backend/src/utils/browserSessionCookies.js`, a
   `pending`→`earned`/`reversed` hook in the online order status use case, a pending-row hook in
   store checkout, and a public capture endpoint) that readies the storefront phase without touching
   `frontend/apps/store` itself.
7. **Not started**: a dedicated ADR under `docs/architecture/adr/` (cite ADR 0012 fee-basis, ADR 0027
   PayMongo split-settlement) — required before this can be considered fully governed per
   `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, since this is a cross-boundary, money-touching
   feature.

## Sandbox limitations that affected how prior work was verified

The environment this was built in had **no live MySQL database** and **no `node_modules` installed**
for either `backend/` or the frontend workspace. As a result:
- Backend migrations/models/use-cases were verified with `node --check <file>` (syntax only) — never
  actually run against a database.
- Frontend changes were verified by manual diff review plus a crude brace/paren/bracket balance
  script — never a real bundler/lint/test run.

**Before this branch merges, someone with a real dev environment must**: run the migration against a
real MySQL DB (`npx sequelize-cli db:migrate`, confirm all 6 tables + indexes, confirm clean
`db:migrate:undo`), run the backend test suite, and run `npm install && npm run build`/`npm run lint`/
the Vitest suite on the frontend workspace. This has been flagged in every relevant commit message but
is still outstanding.

## Verification checklist (from the plan, unchanged)

- Unit: bps rounding + base excludes delivery/DGFY-fee; commission `findOrCreate` idempotency;
  in-store earn-at-commit; void→reversed; online pending→earned→reversed; cookie map per-tenant
  isolation + last-scan-wins; balance aggregation (`earned & cashout_id IS NULL`); cashout row
  reservation/settlement; self-referral guard.
- Integration: POS in-store checkout with `affiliate_code` → one `earned` commission + attribution
  row; void → `reversed`; cashout request reserves rows, approve→mark-paid flips `earned→paid`; admin
  settings/rate override reflected in next accrual; capture endpoint sets a store-scoped cookie and
  rejects a code from another tenant.
- Manual (POS only): in the POS terminal, open Settings → Affiliates, enable program + provision an
  affiliate (get `AF-XXXXXX`/QR); ring up an in-store sale entering that code; confirm the affiliate's
  balance rises in the panel; approve+mark-paid a cashout; confirm balance moves to paid.
- Guardrails/CI: `npm run check:architecture` (controller/boundary guardrails) + backend & POS
  frontend test suites before each PR. Do not modify `frontend/apps/store` in any PR of this phase.
