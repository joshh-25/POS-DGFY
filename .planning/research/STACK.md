# Stack Research

**Domain:** DGFY v2.0 Commerce Domain — Product/Availment/Booking, POS Checkout & Payment, Shift & Cash Drawer, Fiscal/Compliance, Storefront Online Ordering, Order Fulfillment (backend-only, `apps/dgfy-api`)
**Researched:** 2026-07-12
**Confidence:** HIGH — every recommendation below is grounded in either (1) a proven, already-shipped implementation elsewhere in this exact monorepo (`backend/`), which this milestone can port/adapt rather than invent from scratch, or (2) current PayMongo API documentation verified via Context7, or (3) npm registry version checks run 2026-07-12.

> This document supersedes the previous milestone's `STACK.md` (database-first Strangler Fig refactor, researched 2026-07-10, archived in git history). That milestone's migration-runner/Umzug/Sequelize-CLI guidance remains valid and unchanged — it is simply out of scope for this document, which covers only the new v2.0 Commerce Domain additions.

## Executive framing

This milestone needs almost **no new libraries**. The legacy `backend/` app already contains hardened, tested implementations of every hard problem in scope — PayMongo REST integration + webhook HMAC verification, a hand-rolled fiscal/compliance policy engine, a MySQL generated-column trick for partial-unique shift constraints, and a DB-trigger-enforced append-only audit table. The correct move for `apps/dgfy-api` is to **port these proven patterns into the new Clean-Architecture module structure**, not to reach for new dependencies (SDKs, rules engines, state-machine libraries, decimal libraries). The one genuinely new package is a schema validator (`joi`), because the new commerce payloads (cart line items, discount applications, payment attributes) are meaningfully more complex than anything `dgfy-api` has validated by hand so far.

## Recommended Stack

### Core Technologies (unchanged — no framework changes needed)

| Technology | Version (pinned in `apps/dgfy-api`) | Purpose | Why no change |
|------------|---------|---------|-----------------|
| Express | 4.22.2 | HTTP routing | New commerce routes/controllers slot into the existing `routes -> controllers -> usecases -> repositories -> models` structure; no reason to touch the pinned major (Express 5 is latest upstream but out of scope — see What NOT to Use) |
| Sequelize | 6.37.8 | ORM + migrations (via `apps/dgfy-migration-runner`'s Umzug runner) | All new tables (products, availments, shifts, ledgers, fulfillment events) are additive migrations following the same idempotent `tableExists`/`hasIndex` helper pattern already used in `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs` |
| mysql2 | 3.6.5 | MySQL driver | No change; current pin is several minors behind npm's latest (3.22.6) but bumping it is an unrelated maintenance task, not part of this milestone's scope |
| Node.js runtime | `node:22-alpine` (`infrastructure/docker/dgfy-api/Dockerfile`) | Runtime | Node 22 ships a GA, stable global `fetch` (undici-backed) — this is what makes "no axios needed" viable (see below) |
| MySQL | 8.0 (`infrastructure/docker/docker-compose.yml`) | Database | MySQL 8.0 supports `GENERATED ALWAYS AS (...) STORED` columns, which is the mechanism this milestone needs for the shift uniqueness constraint (MySQL has no native partial/filtered unique index, unlike Postgres) |

### Supporting Libraries — new additions

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `joi` | `^18.2.3` (current latest, published 2026-06-17 per npm registry) | Request schema validation for checkout/cart/discount/shift/fulfillment payloads | `dgfy-api` currently hand-validates simple payloads inline in usecases (see `locationUseCases.js`'s `DomainError`-based checks); the commerce domain's nested/array payloads (cart line items, discount applications with per-line eligibility, payment attributes) cross the complexity threshold where hand-rolled validation gets error-prone. Legacy `backend` already depends on Joi (pinned at `^17.11.0`) for exactly this class of payload in `backend/src/validators/commercePaymentValidator.js` and `backend/src/validators/posValidator.js` — the pattern is proven in this org. Install Joi's current major independently in `apps/dgfy-api/package.json`; there is no version coupling with `backend`'s package since they are separate deployables. |
| *(none — use Node's built-in `fetch`)* | Node 22 builtin | PayMongo REST calls | Replaces `axios`. See "What NOT to Use" for rationale. |
| *(none — use Node's built-in `crypto`)* | Node builtin | PayMongo webhook HMAC-SHA256 signature verification, timing-safe comparison | Same primitives legacy already uses successfully (`crypto.createHmac`, `crypto.timingSafeEqual`) |

That's the entire net-new dependency list for this milestone's payment/checkout/shift/fiscal/ledger scope: **one package, `joi`**.

### Development Tools

No changes. `jest` (^29.7.0), `supertest` (^6.3.4), `eslint` (^10.0.0) already cover the testing/linting needs of new usecases, repositories, and controllers in the same way they cover Phase 4's Accounts/Businesses/Tenancy code.

## Installation

```bash
cd apps/dgfy-api
npm install joi@^18.2.3
```

No other `npm install` is required for the payment gateway, checkout math, ledger, shift, or fiscal-gate work described in this document.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Native `fetch` for PayMongo calls | `axios` (`^1.18.1` latest; already a dependency of `backend` and the repo root) | Only if the team strongly prefers mirroring `backend/src/services/paymongoService.js`'s exact per-call `axios.post(...).catch(...)` error-shape style for a literal line-by-line port. Functionally both work identically against PayMongo's REST API; `fetch` avoids adding a dependency `dgfy-api` doesn't otherwise need. |
| Hand-rolled PayMongo REST client (ported from `backend/src/services/paymongoService.js`) | Official `paymongo-node` SDK (`github.com/paymongo/paymongo-node`), or community wrappers (`paymongo`, `paymongo-nodejs`) | Only if the team wants SDK-level type coverage across PayMongo's *entire* API surface (recurring billing, split payments, merchant onboarding, etc.). This milestone only needs ~6-8 endpoints (payment intents, payment methods, sources, refunds, webhooks), all of which are already implemented, tested, and running in production inside `backend/`. Adopting a third-party SDK here would mean re-learning a different error/response shape for no functional gain, and re-doing webhook signature verification work that is already solved. |
| Hand-rolled `evaluateComplianceDecision`-style policy engine | `json-rules-engine` / `nools` / other RETE-style rules engines | Only if fiscal/compliance rules become **end-user-authored or hot-swappable at runtime** (e.g., a compliance officer editing rules through an admin UI without a deploy). That is not this milestone's shape — PH BIR/NPC/BSP rules are code-owned, versioned via `policyPacks.js`-style objects, and change on a regulatory cadence measured in months, not per-tenant at runtime. |
| Plain `Number` + explicit rounding boundaries for money math | `decimal.js` / `dinero.js` | Only if this domain later needs arbitrary-precision multi-currency math or sub-centavo intermediate values that must survive many chained operations. For PHP-only POS/storefront totals with a fixed 2-decimal-place (centavo) final currency unit, `backend/src/modules/pos/domain/posDiscountCalculator.js`'s proven `round4`-then-settle-to-2dp convention is simpler, dependency-free, and already validated against real VAT/senior-PWD discount math in production. |
| Enum + guarded usecase transitions for shift status | `xstate` | Only if shift/cash-drawer logic grows into a genuinely large state graph (many states, many guarded transitions, need for visualization/tooling). A shift only has `open`/`closed` (plus maybe a `voided` audit state) and a handful of guarded actions — a full state-machine library is disproportionate to the problem. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Official or community PayMongo Node SDK | Adds a third-party dependency with its own error/response shape, version-drift risk, and no coverage advantage over what's already built; this org has already hardened a hand-rolled client (webhook HMAC verification with timestamp tolerance and timing-safe compare, idempotent webhook logging) against the exact endpoints this milestone needs | Port `backend/src/services/paymongoService.js` into `apps/dgfy-api`'s module structure, rebuilt on native `fetch` |
| `axios` in `apps/dgfy-api` purely to match legacy style | `dgfy-api`'s Docker image is pinned to `node:22-alpine`, where global `fetch` is GA/stable; adding `axios` only for stylistic parity increases dependency surface with no functional benefit | Native `fetch` |
| A generic rules/policy-engine library (`json-rules-engine`, `nools`, etc.) for the fiscal/compliance gate | The actual value of those libraries — dynamic, declarative, non-engineer-authored rules — doesn't apply here; PH BIR/NPC/BSP compliance rules are code-owned and reviewed via git, not runtime-editable. `backend/src/modules/compliance/policy/compliancePolicyEngine.js` proves a hand-rolled pure-function approach scales to ~1,000 lines of nested regulatory logic while staying fully unit-testable and dependency-free | Pure functions + versioned `policyPacks.js`-style config objects, mirroring the existing module |
| An event-sourcing / CQRS framework (e.g. `eventstore`, `node-cqrs`) for the inventory ledger or fulfillment stage history | These features need an append-only audit trail with occasional running-balance projections — not full event replay, snapshots, or CQRS read-model infrastructure. That's a large, unjustified architectural addition for what a single well-indexed Sequelize table already does | An append-only Sequelize table + a MySQL `BEFORE UPDATE`/`BEFORE DELETE` trigger enforcing immutability (see Stack Patterns below), exactly as `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs` already does for `tenant_compliance_audit_logs` |
| `xstate` (or any state-machine library) for shift/cash-drawer lifecycle | Two real states (`open`/`closed`) plus a small set of guarded transitions doesn't justify a state-machine library's learning curve/bundle weight; the actual correctness guarantee this milestone needs is a **DB-level uniqueness constraint**, not a client-side state graph | Status `ENUM` column + guarded usecase functions (mirrors every other lifecycle transition already in `apps/dgfy-api`, e.g. `businessUseCases.js`, `tenantSessionUseCases.js`) + the MySQL generated-column unique-index pattern below |
| MySQL partial/filtered unique indexes (e.g. copying a Postgres `CREATE UNIQUE INDEX ... WHERE status = 'open'` pattern) | MySQL has no native support for indexes with a `WHERE` predicate | `GENERATED ALWAYS AS (...) STORED` column + a plain `UNIQUE INDEX` on that generated column — MySQL treats each `NULL` in a unique index as distinct, so the trick works. Already shipped in `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs`. |
| `decimal.js`/`dinero.js` as a blanket money-safety layer | Not justified for this milestone's single-currency (PHP), 2-decimal-place-final domain; adds a dependency and a new mental model on top of a convention (`DECIMAL` columns + `round4`-then-settle pattern) that's already proven in `PosTerminalShift`/`posDiscountCalculator.js` | `DECIMAL(12,2)`/`DECIMAL(14,4)` Sequelize columns + a small shared rounding helper, converting to integer centavos only at the PayMongo API boundary |

## Stack Patterns by Variant

**(d) Enforcing "one open shift per cashier+terminal" (MySQL 8.0):**

Adapt the already-shipped `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs` pattern, extended to a composite key since this milestone's requirement is cashier+terminal, not terminal alone:

```sql
ALTER TABLE shifts
  ADD COLUMN active_terminal_cashier_key VARCHAR(150)
  GENERATED ALWAYS AS (
    CASE WHEN status = 'open' THEN CONCAT_WS('|', terminal_id, cashier_account_id) ELSE NULL END
  ) STORED;

CREATE UNIQUE INDEX uq_shifts_active_terminal_cashier ON shifts (active_terminal_cashier_key);
```

MySQL treats every `NULL` in a unique index as distinct, so closed/voided shifts (which generate `NULL`) never collide with each other — only two concurrently-`open` rows for the same terminal+cashier pair would collide, which is exactly the desired invariant. Write this as an idempotent migration in `apps/dgfy-migration-runner/src/migrations/schema/`, following the existing `tableExists`/`hasIndex`/`addIndexIfMissing` helper pattern from `20260710021000-create-dgfy-business-foundation.cjs`. Pair it with `sequelize.transaction()` plus a guard `SELECT ... FOR UPDATE` read inside the "open shift" usecase — the unique index is the actual correctness guarantee (defense in depth against the open-shift race condition), while the transaction/lock exists to turn a raw DB constraint violation into a clean 409 `DomainError` instead of an unhandled SQL error bubbling to the controller. `terminal_identities` (already migrated in Phase 2, see `apps/dgfy-api/src/models/Tenant/TerminalIdentity.js`) is the FK target for `terminal_id`.

**(c) Append-only ledger for inventory movements and fulfillment stage history:**

Model shape: `BIGINT UNSIGNED` autoincrement PK, tenant/business scope FK, subject FK (`product_id` / `order_id`), an `ENUM` action/movement-type column, a `quantity_delta` (inventory) or `from_status`/`to_status` pair (fulfillment), an actor reference, an optional JSON before/after snapshot, and `created_at` only — deliberately **no** `updated_at`, no Sequelize `paranoid` (soft-delete). This mirrors `tenant_audit_logs`'s shape exactly (see `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs`, lines ~244-283).

Enforce true immutability at the DB level with the trigger pattern already shipped for `tenant_compliance_audit_logs` in `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs`:

```sql
CREATE TRIGGER trg_<table>_append_only_update
BEFORE UPDATE ON <table>
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '<table> is append-only and cannot be updated';
END;

CREATE TRIGGER trg_<table>_append_only_delete
BEFORE DELETE ON <table>
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '<table> is append-only and cannot be deleted';
END;
```

Write these as Umzug migrations executed through `apps/dgfy-migration-runner` (its `queryInterface.sequelize.query` raw-SQL escape hatch already exists for exactly this kind of statement), not as ad hoc scripts. Repository-layer convention: only ever call `.create()`/`.bulkCreate()` on these Sequelize models; never expose `.update()`/`.destroy()` in the repository's public methods — the DB trigger is the hard backstop if that convention is ever violated.

**(b) Server-verified POS checkout totals/change:**

Never trust a client-submitted `total`/`change_due`. Recompute the canonical total server-side inside the usecase from server-held data (item price snapshot at time of sale × quantity, minus discount calc, minus/plus tax), exactly as `backend/src/modules/pos/domain/posDiscountCalculator.js` already does as a pure function: `calculatePosDiscount({ lines, application }) -> { subtotal_amount, discount_amount, total_amount, lines }`. If the client submits a `total` for optimistic UI purposes, compare it to the server-computed total within a small epsilon (legacy's convention: round both to 4 decimal places before comparing) and reject the checkout on mismatch rather than trusting it. Compute `change_due = tendered_amount - server_total` server-side only, using the same rounding boundary. Store monetary columns as `DECIMAL(12,2)` (final totals) or `DECIMAL(14,4)` (if intermediate VAT-removal precision must survive before final rounding, matching `PosTerminalShift`'s existing `DECIMAL(14,4)` columns) — Sequelize + `mysql2` return `DECIMAL` as strings by default, which avoids float round-trip loss on read; convert to `Number` only inside the pure calculation function and re-round immediately before persisting. Convert to integer centavos **only** at the PayMongo API boundary (`Math.round(totalPhp * 100)`), in one shared adapter function rather than scattered across usecases — PayMongo requires amounts in the smallest currency unit (confirmed via Context7 `/websites/developers_paymongo`).

**(a) PayMongo integration — online orders only; POS in-person Cash/GCash/Card is manual tender recording, no gateway call, per this milestone's explicit scope:**

Build a `paymongoClient.js` in `apps/dgfy-api` using native `fetch` and HTTP Basic Auth (`Buffer.from(secretKey + ':').toString('base64')`) against `https://api.paymongo.com/v1` — port the endpoint coverage already proven in `backend/src/services/paymongoService.js` (create payment intent → create payment method → attach → poll/webhook for status). Mount a dedicated raw-body-capturing JSON parser on the webhook route specifically:

```js
app.use('/v1/commerce/payments/webhook', express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); }
}));
```

matching the `Paymongo-Signature: t=<ts>,te=<test-digest>,li=<live-digest>` HMAC-SHA256 scheme already implemented and unit-tested in `backend/tests/paymongoWebhookSignature.test.js`: verify with `crypto.timingSafeEqual`, reject signatures with a timestamp older than a configurable tolerance (default 300s), and pick the `te`/`li` slot based on `PAYMONGO_MODE`. For idempotency, persist a `payment_webhook_events` table with a `UNIQUE` constraint on the PayMongo event id and short-circuit reprocessing, mirroring `findOrCreateWebhookLog` in `backend/src/modules/commercePayments/repositories/commercePaymentRepository.js`. Reuse legacy's exact env var naming (`PAYMONGO_MODE`, `PAYMONGO_TEST_SECRET_KEY`/`PAYMONGO_LIVE_SECRET_KEY`, `PAYMONGO_TEST_WEBHOOK_SECRET`/`PAYMONGO_LIVE_WEBHOOK_SECRET`, `PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`) so ops tooling and secrets management stay consistent across `backend` and `dgfy-api`.

**(e) Fiscal/compliance policy gate:**

Structure a new `modules/fiscalCompliance/policy/{policyEngine.js, policyPacks.js, constants.js}` mirroring `backend/src/modules/compliance/policy/`'s existing split. `policyEngine.js` exports a pure `evaluateComplianceDecision({ tenant, operation, context, ... })` function returning `{ decision: ALLOW|DENY|REQUIRES_SETUP, reason_code, obligations }`, called synchronously from usecases (checkout, receipt render, shift open) before they're allowed to proceed. Keep the actual policy data (required fields/artifacts per compliance mode) in a versioned `policyPacks.js` object selected by effective date, not in a database table or an external DSL — this keeps "rules" in code review and git history, which is appropriate for compliance logic that changes on a regulatory cadence, not a runtime-editable one.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `joi@^18.2.3` | Node >=20 | `apps/dgfy-api` runs `node:22-alpine`, fully compatible. Legacy `backend` stays pinned on Joi `^17.11.0` — no cross-package coupling since these are independent `package.json`s in the same monorepo. |
| Native `fetch` | Node >=18 (stable), GA in Node 22 | `apps/dgfy-api`'s Docker image (`infrastructure/docker/dgfy-api/Dockerfile`) is already pinned to `node:22-alpine`. |
| `GENERATED ALWAYS AS (...) STORED` + `UNIQUE INDEX` | MySQL >=5.7 for stored generated columns; verified in production use on MySQL 8.0 | `infrastructure/docker/docker-compose.yml` pins `mysql:8.0`. |
| `BEFORE UPDATE`/`BEFORE DELETE` triggers with `SIGNAL SQLSTATE` | Standard MySQL/InnoDB trigger syntax, MySQL 8.0 | Already exercised in production by `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs`. |

## Sources

- Context7 `/websites/developers_paymongo` — `payment_intents`, `sources`, `webhooks` endpoint shapes and the amount-in-smallest-currency-unit convention (queried 2026-07-12)
- `backend/src/services/paymongoService.js`, `backend/tests/paymongoWebhookSignature.test.js` — proven, unit-tested, production hand-rolled PayMongo REST client and webhook HMAC verification implementation in this monorepo
- `backend/src/modules/compliance/policy/compliancePolicyEngine.js`, `backend/src/modules/compliance/policy/policyPacks.js` — proven hand-rolled fiscal/compliance policy-gating engine
- `backend/migrations/20260703000002-enforce-one-open-shift-per-terminal.cjs` — proven MySQL generated-column + unique-index pattern for one-open-shift-per-terminal, extended in this document to cashier+terminal
- `backend/migrations/20260408000003-harden-compliance-audit-immutability.cjs` — proven MySQL trigger-based append-only enforcement pattern
- `backend/src/modules/pos/domain/posDiscountCalculator.js` — proven server-side POS discount/total calculation pattern (senior/PWD statutory discount, VAT removal, rounding convention)
- `backend/src/models/PosTerminalShift.js` — existing shift model field shapes (`DECIMAL(14,4)` money columns, `open`/`closed` status enum) and its gap (indexes only, no DB-level uniqueness — closed properly in this milestone via the generated-column pattern)
- `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs` — `tenant_audit_logs` append-only table shape, idempotent `tableExists`/`hasIndex`/`addIndexIfMissing` migration helpers, and the existing `terminal_identities` table this milestone's shifts FK against
- `apps/dgfy-api/src/models/Tenant/TerminalIdentity.js` — confirms `terminal_identities` already exists with a `unique` `terminal_code` index to build shift FKs against
- `apps/dgfy-api/package.json`, `apps/dgfy-api/src/server.js`, `apps/dgfy-api/src/app.js`, `apps/dgfy-api/src/config/env.js` — current `dgfy-api` dependency baseline and middleware conventions (plain `express.json()`, no raw-body capture yet, no schema validator yet) this milestone builds on
- `apps/dgfy-api/src/modules/businesses/repositories/businessRepository.js` — confirms the existing `sequelize.transaction(async (transaction) => {...})` convention to reuse for atomic ledger writes / shift-open guard reads
- `infrastructure/docker/dgfy-api/Dockerfile` — confirms `node:22-alpine` runtime (native `fetch` is GA)
- `infrastructure/docker/docker-compose.yml` — confirms `mysql:8.0` pinned (required for the generated-column pattern)
- npm registry (`npm view <pkg> version / versions --json / dist-tags`, run 2026-07-12) — confirmed current versions: `joi` latest `18.2.3` (published 2026-06-17T16:54:59Z, dist-tag `latest-17` still available at `17.13.4` for reference), `axios` latest `1.18.1`, `sequelize` latest `6.37.8` (matches repo's existing pin — no change needed), `mysql2` latest `3.22.6` (repo stays pinned at `3.6.5` — bump is out of scope for this milestone), `express` latest `5.2.1` (repo stays pinned at `4.22.2` — bump is out of scope for this milestone)

---
*Stack research for: DGFY v2.0 Commerce Domain (Product, Availment/Checkout, Booking, Shift, Fiscal, Storefront Ordering, Fulfillment)*
*Researched: 2026-07-12*
