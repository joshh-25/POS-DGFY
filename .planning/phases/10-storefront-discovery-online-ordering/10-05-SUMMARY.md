---
phase: 10-storefront-discovery-online-ordering
plan: 05
subsystem: payments
tags: [paymongo, qrph, fetch, hmac, webhook-signature, sequelize, dgfy_core]

# Dependency graph
requires:
  - phase: 10-01
    provides: "commerce_payment_sessions table + CommercePaymentSession Sequelize model (dgfy_core landlord schema)"
provides:
  - "buildPayMongoClient(): native-fetch PayMongo client — createQrphPaymentIntent (3-call dance, no split_payment arg) + verifyWebhookSignature (raw-body HMAC-SHA256, timing-safe, timestamp tolerance)"
  - "CommercePaymentRepository: landlord persistence over commerce_payment_sessions (createSession + session resolution by public reference / provider payment-intent id / provider payment id)"
  - "buildCreateQrphSessionUseCase() / useCases.createQrphSession: order -> real PayMongo QR Ph session, fails closed 503 when unconfigured"
  - "buildCommercePaymentsModule() composition root exposing verifyWebhookSignature + session-resolution helpers for reuse"
affects: [10-06, 10-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native fetch + Node crypto for external HTTP/HMAC (zero new packages, matches infra/deviceBridgeClient.js precedent)"
    - "Injectable checkQrphConfig default param for testable config-gate branches without process.env/module-reset gymnastics"
    - "D-02 split excision: omit provider-side split_payment arg entirely rather than schema-baking it"

key-files:
  created:
    - apps/dgfy-api/src/modules/commercePayments/services/payMongoClient.js
    - apps/dgfy-api/src/modules/commercePayments/repositories/commercePaymentRepository.js
    - apps/dgfy-api/src/modules/commercePayments/usecases/createQrphSessionUseCases.js
    - apps/dgfy-api/src/modules/commercePayments/index.js
    - apps/dgfy-api/src/modules/commercePayments/README.md
    - apps/dgfy-api/tests/commercePayments/payMongoClient.test.js
    - apps/dgfy-api/tests/commercePayments/createQrphSession.test.js
  modified:
    - apps/dgfy-api/src/config/env.js

key-decisions:
  - "D-02 excised by omission: createPaymentIntent's attributes literally never include split_payment; no PAYMONGO_DGFY_MERCHANT_ID/COMMERCE_PAYMONGO_SPLIT_ENABLED added to env.js"
  - "verifyWebhookSignature accepts a match against EITHER te (test) or li (live) signature field using the caller-resolved secret, rather than requiring a separate mode parameter"
  - "checkQrphConfig made an injectable (defaulted) dependency on the usecase so the config-disabled 503 branch is unit-testable without mutating process.env after config/env.js's module-load-time resolution"
  - "Tasks 1 and 2 committed together (single commit) — see Deviations"

patterns-established:
  - "PayMongo services/ layer never imports Sequelize; repositories/ own all DB access; usecases/ never call fetch/crypto directly"
  - "Typed PayMongoError / PayMongoServiceUnavailableError duck-typed by .name in the usecase layer and mapped to DomainError/ApplicationResult, mirroring shifts/inventory's TenantDatabaseUnavailableError convention"

requirements-completed: [STF-04]

coverage:
  - id: D1
    description: "PayMongo client performs the QR Ph 3-call dance via native fetch (createPaymentIntent -> createPaymentMethod -> attachPaymentIntent) and returns the QR image URL + shared expiresAt, with no split_payment argument ever sent (D-01, D-02)"
    requirement: "STF-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/payMongoClient.test.js#payMongoClient — createQrphPaymentIntent (3-call dance)"
        status: pass
    human_judgment: false
  - id: D2
    description: "verifyWebhookSignature verifies HMAC-SHA256 over the raw body with a timing-safe comparison, accepting either test-mode or live-mode signature fields, and rejects tampered bodies / stale timestamps / wrong secrets without ever throwing (T-10-05-01)"
    requirement: "STF-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/payMongoClient.test.js#payMongoClient — verifyWebhookSignature (raw-body HMAC, timing-safe)"
        status: pass
    human_judgment: false
  - id: D3
    description: "createQrphSession persists a landlord commerce_payment_sessions row carrying the order's public_reference + UUID tenant_id in PayMongo metadata, the intent's shared expires_at, and no split payload; fails closed with 503 (not a broken session) when PayMongo is unconfigured or the provider rejects the request"
    requirement: "STF-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/createQrphSession.test.js#createQrphSession use case (STF-04, D-01, D-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "commercePaymentRepository resolves sessions by public reference / provider payment-intent id / provider payment id (the resolution order 10-08's webhook will use) and never integer-coerces tenant_id (Pitfall 7)"
    verification:
      - kind: unit
        ref: "apps/dgfy-api/tests/commercePayments/createQrphSession.test.js (repository exercised indirectly via createSession assertions)"
        status: pass
    human_judgment: true
    rationale: "Repository's findSessionBy* methods are exercised only indirectly through mocked createSession assertions in this plan's unit tests, not against a real MySQL dgfy_core connection — a live-DB integration pass (matching 10-01's RUN_PHASE10_STOREFRONT_COMMERCE_SCHEMA_INTEGRATION pattern) would be needed to fully prove the resolution queries against real rows; deferred to whichever plan first exercises the webhook (10-08) against real MySQL."

duration: 30min
completed: 2026-07-13
status: complete
---

# Phase 10 Plan 05: Landlord PayMongo QR Ph Payment Layer Summary

**Native-fetch PayMongo QR Ph client (3-call Payment Intent dance + raw-body HMAC webhook signature verification), a landlord `commerce_payment_sessions` repository, and the `createQrphSession` usecase — the D-01 payment substrate for STF-04, with D-02's platform-fee split excised by simply omitting a provider-side argument.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-13T12:16:25Z
- **Tasks:** 2
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- `payMongoClient.js` re-implements the legacy QR Ph 3-call dance (`createPaymentIntent` -> `createPaymentMethod` -> `attachPaymentIntent`) with native `fetch` — zero new packages — and returns `{ paymentIntentId, paymentMethodId, qrCodeImageUrl, expiresAt }`, with `expiresAt` falling back to +30min when PayMongo omits `next_action.code.expires_at`, matching legacy behavior exactly.
- `verifyWebhookSignature` computes HMAC-SHA256 over `${timestamp}.${rawBody}`, compares with `crypto.timingSafeEqual`, rejects timestamps outside the configurable tolerance window, and never throws — always resolves to `true`/`false`.
- `config/env.js` gained mode-aware PayMongo secret/webhook-secret resolution, `PAYMONGO_API_BASE_URL`, feature flags (`COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`), and `requireCommerceQrphConfig()` — deliberately omitting `PAYMONGO_DGFY_MERCHANT_ID`/`COMMERCE_PAYMONGO_SPLIT_ENABLED` (D-02: not needed).
- `commercePaymentRepository.js` persists sessions to `dgfy_core.commerce_payment_sessions` (10-01's model) and exposes the three-step session resolution order (`findSessionByPublicReference` -> `findSessionByProviderPaymentIntent` -> `findSessionByProviderPayment`) that 10-08's webhook will consume.
- `createQrphSessionUseCases.js` wires the client + repository into `createQrphSession({ order })`: validates the order shape, gates on `requireCommerceQrphConfig()` (fails closed 503 before any PayMongo call when unconfigured), calls PayMongo with `metadata: { commerce_payment_session, tenant_id }`, and persists the session with the intent's shared `expires_at`.
- `index.js` composes `buildCommercePaymentsModule()`, exposing `useCases.createQrphSession` plus `verifyWebhookSignature` and the repository's resolution helpers at the top level for 10-08 to reuse without constructing a second, divergent client/repository pair. No webhook routes mounted (10-08's scope).

## Task Commits

Both tasks landed in a single commit (see Deviations for why):

1. **Task 1: PayMongo client service (QR Ph 3-call dance + raw-body signature verify)** + **Task 2: Commerce payment repository + createQrphSession usecase** — `bed9474f` (feat)

_No separate plan-metadata commit — this is a worktree-mode execution; STATE.md/ROADMAP.md updates are the orchestrator's responsibility after the wave completes._

## Files Created/Modified

- `apps/dgfy-api/src/modules/commercePayments/services/payMongoClient.js` - native-fetch PayMongo client: `createQrphPaymentIntent` (3-call dance, no split_payment) + `verifyWebhookSignature` (raw-body HMAC, timing-safe, timestamp tolerance); `PayMongoError`/`PayMongoServiceUnavailableError` typed errors
- `apps/dgfy-api/src/modules/commercePayments/repositories/commercePaymentRepository.js` - landlord `commerce_payment_sessions` persistence: `createSession`, `findSessionByPublicReference`, `findSessionByProviderPaymentIntent`, `findSessionByProviderPayment`, `updateSessionStatus`; `generateSessionPublicReference()` (`CPS-` + 10 alphanumeric)
- `apps/dgfy-api/src/modules/commercePayments/usecases/createQrphSessionUseCases.js` - `buildCreateQrphSessionUseCase()`: validates `order`, gates on config, calls PayMongo, persists session, returns `{ session_public_reference, qr_code_image_url, expires_at, amount_centavos }`
- `apps/dgfy-api/src/modules/commercePayments/index.js` - `buildCommercePaymentsModule()` composition root
- `apps/dgfy-api/src/modules/commercePayments/README.md` - module doc (D-02 excision rationale, config gate, tenant_id UUID discipline, session resolution order, prohibitions honored)
- `apps/dgfy-api/src/config/env.js` - added `PAYMONGO_MODE`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`, `PAYMONGO_API_BASE_URL`, `COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`, `requireCommerceQrphConfig()`
- `apps/dgfy-api/tests/commercePayments/payMongoClient.test.js` - 13 tests: 3-call dance, D-02 no-split assertion, Basic-auth header, expiry fallback, PayMongoError mapping, PayMongoServiceUnavailableError on missing secret, 7 signature-verify cases
- `apps/dgfy-api/tests/commercePayments/createQrphSession.test.js` - 7 tests: happy path (shared expires_at, no split payload), metadata carries order reference + UUID tenant_id, validation failures, PayMongoServiceUnavailableError/PayMongoError -> 503 mapping, config-disabled 503 gate

## Decisions Made

- **D-02 excision is literal, not a flag:** `createPaymentIntent`'s attributes object never has a `split_payment` key — there is no `if (splitPayment)` branch to accidentally trigger later. Re-adding split is a provider-side argument at intent-creation time (per 10-RESEARCH.md Pattern 2), requiring zero schema migration since 10-01's `split_payload`/`platform_fee_centavos` columns already exist nullable and unpopulated.
- **`verifyWebhookSignature` accepts either `te` or `li`:** rather than adding a `mode` parameter, the function accepts a match against EITHER signature field using the already-mode-resolved `secret` the caller passes (or the client's own `PAYMONGO_WEBHOOK_SECRET`, itself mode-aware). This keeps the function signature exactly as specified in the plan (`{rawBody, signatureHeader, secret, now}`) while still being correct — an attacker cannot forge either HMAC without the real secret.
- **`checkQrphConfig` is an injectable, defaulted dependency:** `buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig = requireCommerceQrphConfig })`. This lets the config-disabled 503 branch be unit-tested deterministically (inject a stub returning `{configured:false}`) without needing `jest.resetModules()`/dynamic-import gymnastics to work around `config/env.js`'s constants being resolved once at module-load time.
- **`expiresAt` is a `Date` object, not a raw string/number:** matches the legacy consumer pattern at `backend/src/modules/store/usecases/storeUseCases.js:2504` (`new Date(providerResult.expiresAt)`), confirming PayMongo's `next_action.code.expires_at` is directly `Date`-parseable (not Unix-seconds requiring `*1000`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tasks 1 and 2 committed together instead of two atomic per-task commits**
- **Found during:** Task 1's commit attempt (after `payMongoClient.js` + `env.js` + its test were staged)
- **Issue:** The repo's `.husky/pre-commit` hook runs `check:architecture:dgfy-api`, which scans the **entire** `apps/dgfy-api/src/modules/` tree on disk (not just staged/diffed files) and requires every module directory to have `index.js` + `README.md` plus at least one of `controllers`/`usecases`/`repositories`. Task 1's file set alone (`services/payMongoClient.js` only) cannot satisfy this — there is no way to commit Task 1 in isolation and pass the hook, since `index.js`, `README.md`, and a `usecases`/`repositories` directory are all Task 2 deliverables per the plan's own file split.
- **Fix:** Built both tasks' code first, then committed everything (client, repository, usecase, `index.js`, `README.md`, both test files, `env.js`) in a single commit `bed9474f`, satisfying the guardrail's whole-module-tree structural check.
- **Files modified:** All 8 files in this plan's `files_modified` list, plus `apps/dgfy-api/src/modules/commercePayments/README.md` (not in the plan's original file list — required by the architecture guardrail, see #2 below).
- **Verification:** `npm run check:architecture:dgfy-api` passes (`[ArchitectureGuardrails] OK`); pre-commit hook completed successfully; both test suites pass (20/20).
- **Committed in:** `bed9474f`

**2. [Rule 2 - Missing Critical] Added `apps/dgfy-api/src/modules/commercePayments/README.md`**
- **Found during:** Same commit attempt as #1 above
- **Issue:** Not listed in the plan's `files_modified`, but the architecture guardrail (`REQUIRED_MODULE_FILES = ['index.js', 'README.md']`) hard-requires it for every module directory — every other `apps/dgfy-api/src/modules/*` module has one (e.g. `shifts/README.md`).
- **Fix:** Added a README documenting this plan's scope (client/repository/usecase only, no webhook wiring), the D-02 excision rationale, the config gate, tenant_id UUID discipline (Pitfall 7), the session-resolution order for 10-08, and prohibitions honored.
- **Files modified:** `apps/dgfy-api/src/modules/commercePayments/README.md`
- **Verification:** `npm run check:architecture:dgfy-api` passes.
- **Committed in:** `bed9474f`

---

**Total deviations:** 2 auto-fixed (1 blocking commit-structure adjustment, 1 missing-critical doc file)
**Impact on plan:** No code/behavior deviation from the plan's `<behavior>`/`<action>` specs — only the commit granularity and one required doc file were adjusted to satisfy a pre-existing, repo-wide CI gate unrelated to this plan's design. All planned functionality (client, repository, usecase, config gate) is exactly as specified.

## Issues Encountered

- This execution ran in the **main working directory, not an isolated git worktree** (`.git` is a directory, `git worktree list` shows only the primary checkout). A sibling wave-2 agent (building the `apps/dgfy-api/src/modules/storefront` module, likely 10-02/10-06/10-07/10-08) was writing files to the same shared filesystem concurrently, which transiently tripped the same whole-module-tree architecture guardrail (missing `storefront/README.md`, then missing `storefront/controllers/discoveryController.js` naming) on the first commit attempt. This resolved itself once the sibling agent's own files landed — no action was taken on `storefront/` files (out of scope, another agent's in-flight work). This is worth flagging to the orchestrator: the pre-commit hook's repo-wide (non-diff-scoped) scan makes concurrent non-worktree-isolated execution fragile whenever any sibling module is mid-construction.
- Initial usecase test attempts relied on mutating `process.env` after `config/env.js`'s constants had already been resolved at import time (ES module import hoisting runs before any same-file top-level statement) — this produced two false results (tests appeared to pass/fail for the wrong reason). Refactored `buildCreateQrphSessionUseCase` to accept an injectable `checkQrphConfig` (defaulting to the real `requireCommerceQrphConfig`), making the config-gate branches deterministically testable. See Decisions above.

## User Setup Required

None for this plan — no external service configuration is exercised yet (no real PayMongo API calls are made; all HTTP is mocked in tests). **[ASSUMED A6, carried forward from the plan]:** PayMongo event names/response shapes were read from legacy code (`backend/src/services/paymongoService.js`, ADR 0027), not re-verified against live PayMongo docs — sandbox validation with real `PAYMONGO_SECRET_KEY`/`PAYMONGO_WEBHOOK_SECRET` credentials is required before go-live. This flag is inherited by 10-06 (placement, calls `createQrphSession`) and 10-08 (webhook, calls `verifyWebhookSignature`).

## Next Phase Readiness

- **10-06 (placement flow)** can call `useCases.createQrphSession({ order })` directly — `order` must be shaped `{ id, public_reference, tenant_id, total_centavos, billing? }` (the durable `storefront_orders` row from 10-01, created via STF-05's ordering: landlord order first, then stock reservation, then this session).
- **10-08 (webhook)** can call `verifyWebhookSignature` and the three session-resolution helpers directly off `buildCommercePaymentsModule()`'s return value — no need to construct a second client/repository pair. It still owns: raw-body route wiring, event parsing (`payment.paid`/`payment.failed`/`qrph.expired`), the tenant-Availment finalize transaction, and `updateSessionStatus` calls (this repository method exists but is unused by this plan).
- No blockers. Zero new packages, zero `backend/` writes, no webhook routes mounted — matches the plan's stated scope exactly.

---
*Phase: 10-storefront-discovery-online-ordering*
*Completed: 2026-07-13*
