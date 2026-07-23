---
status: reference
owner: engineering
last_reviewed: 2026-07-22
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-22-mobile-refresh-token-and-free-tier-offline-sync
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.22
verification_evidence: cd backend && npm run check:architecture-guardrails,cd backend && npm run check:controller-boundaries,cd backend && npx eslint src,cd backend && node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand tests/browserSessionCookies.test.js tests/dgfyTenantSession.transport.test.js tests/mobilePosHandlers.transport.test.js tests/requirePremium.middleware.test.js tests/authModuleExports.contract.test.js tests/rateLimiterStoreMode.test.js tests/rateLimiter.behavior.test.js,manual verification against a locally running instance (migrated MariaDB + Redis) of refresh-token issuance/rotation/reuse-rejection and the free-tier bootstrap/sync-cap behavior described below
rollback_note: Revert routes/mobilePos.js to re-add router.use(requirePremium); revert middleware/rateLimiter.js (drop mobilePosFreeSyncLimiter and its export); revert middleware/auth.js and utils/tenantPlan.js (drop isPremiumActiveTenant extraction, restore the inline logic in requirePremium); revert utils/browserSessionCookies.js (drop isMobileClientRequest/getSubmittedRefreshToken) and the two call-site changes in modules/auth/controllers/authHandlers.js and modules/dgfy/controllers/dgfyAuthHandlers.js that use them; revert the MOBILE_SYNC_LIMIT_PER_DAY export in modules/pos/usecases/mobilePosUseCases.js back to a local const. No migration, no data shape change, no stored data to roll back.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-22T00:00:00Z
preflight_request_ref: https://github.com/Sieitzz/dgfy-platform/pull/64
---

# Mobile Refresh Token Support and Free-Tier Offline-Sync Access

## Compliance Impact Classification

Major. This change touches two access-control paths under the `pos`/`terminal`
surfaces: (1) how the tenant Bearer refresh token is delivered to a
Bearer-authenticated (non-browser) client, and (2) removing a blanket
premium-subscription gate from `/api/v1/mobile-pos/*` in favor of a
server-enforced free-tier daily cap. No fiscal (BIR), payment, or PII data
shape changes are introduced; no new data is exposed to any tenant that
could not already reach it through the existing interactive `/api/v1/pos/*`
API (which is not premium-gated). Classified `major` per the `pos`/`terminal`
surface floor since the changed files are under `backend/src/modules/pos/`
and gate access to POS/terminal endpoints.

## Affected Surfaces

### 1. Mobile refresh token delivery (`utils/browserSessionCookies.js`, `modules/auth/controllers/authHandlers.js`, `modules/dgfy/controllers/dgfyAuthHandlers.js`)

A request carrying `x-client-platform: mobile` now receives the tenant
refresh token in the JSON response body from `POST /dgfy/auth/tenant-session`
(and the sibling `switchDgfyCompany`/`startDgfyPosSession` handlers that
share `stripTenantSessionRefreshPayload`), and `POST /auth/refresh-token`
now accepts a `refreshToken` submitted in the request body via
`getSubmittedRefreshToken`, falling back to it only when no
`sku_refresh_token` cookie is present. A request with no mobile header is
byte-for-byte unaffected: the refresh token stays httpOnly-cookie-only, and
the refresh endpoint still reads only from the cookie. This is opt-in
per-request behavior, not a default change, and does not touch how tokens
are verified, signed, or how long they are valid for.

### 2. Free-tier access to `/api/v1/mobile-pos/*` (`routes/mobilePos.js`, `middleware/rateLimiter.js`, `middleware/auth.js`, `utils/tenantPlan.js`)

`router.use(requirePremium)` is removed from `routes/mobilePos.js`.
`GET /mobile-pos/bootstrap/{catalog,settings,device-policy}` (read-only) is
now reachable by both tiers with no cap. `POST /mobile-pos/sync/*` (four
write routes: checkouts, shifts, hardware-events, checkpoint) now carries a
new `mobilePosFreeSyncLimiter` (Redis-backed via the existing `DynamicStore`
rate-limiter infrastructure, tenant-keyed, shared across all four routes so
the budget is per business per day, not per endpoint) capped at
`MOBILE_SYNC_LIMIT_PER_DAY` (2, already advertised to clients in
`sync_policy`/`sync_limit_policy` but never previously enforced). A tenant
on the `premium` plan with an active (or grace-period) subscription — the
same predicate `requirePremium` already computed, extracted to
`utils/tenantPlan.js#isPremiumActiveTenant` — bypasses the limiter entirely
and syncs uncapped, matching the mobile client's own `resolveSyncPolicy`.
No new fields, permissions, or capabilities are introduced by this route:
every use case invoked by `/mobile-pos/sync/*`
(`checkoutPosUseCase`/`openTerminalShiftUseCase`/etc., via
`modules/pos/usecases/mobilePosUseCases.js`) is the identical use case
already reachable, unrestricted by plan, through the interactive
`/api/v1/pos/*` API — this change only extends the same existing
capability set to the offline-batch-shaped endpoint, with an additional
rate limit premium tenants do not have.

## Compliance Preconditions

1. `checkPermission` (role-based, e.g. `pos:view`/`pos:transact`) is
   unchanged and still runs on every `/mobile-pos/*` route — removing
   `requirePremium` does not remove or weaken role/permission enforcement.
2. `authenticate` (JWT verification, tenant-status/subscription-inactive
   gating) is unchanged and still runs first on every `/mobile-pos/*` route.
3. The free-tier sync cap is enforced server-side (Redis-backed), not only
   advertised to or trusted from the client — a modified client cannot
   bypass it by ignoring its own local `dailyCap`.
4. `isPremiumActiveTenant` reproduces `requirePremium`'s exact
   billing-paused/grace-period rules (verified via the existing
   `requirePremium.middleware.test.js` suite, unchanged and still passing)
   — extracting it did not change premium-tenant behavior.
5. The refresh token is only returned in the body for a request that
   explicitly identifies itself as `x-client-platform: mobile`; no browser
   session's refresh-token exposure (httpOnly-cookie-only) changes.
6. No fiscal/BIR receipt fields, payment provider fields, or PII fields are
   added, removed, or reshaped by either change.

## Verification Evidence

The commands listed in front matter must pass before deployment.
`check:architecture-guardrails` and `check:controller-boundaries` confirm no
module-boundary or controller/model-import violations were introduced.
`eslint src` is clean. The listed Jest suites (auth/rate-limiter/mobile-pos
transport + behavior tests, run together and in isolation) cover: mobile
vs. browser refresh-token body inclusion, cookie-priority-over-body
ordering, `requirePremium`'s unchanged behavior post-refactor, and the new
`mobilePosFreeSyncLimiter` (cap enforcement, shared budget across the four
sync routes, premium bypass, per-tenant isolation). A full backend suite
run before/after this change shows an identical set of pre-existing
(environment-only, `ECONNREFUSED`/missing-app-dependency) failing suites —
no new regressions. Manual verification against a real, locally running
instance of this backend (migrated MariaDB + Redis, no mocking) confirmed:
`x-client-platform: mobile` login returns a `refreshToken`; submitting it to
`/auth/refresh-token` rotates it correctly; reusing the spent refresh token
is rejected ("reused or revoked"); a `standard`-plan tenant reaches
`/mobile-pos/bootstrap/settings` (403'd before this change); and
`/mobile-pos/sync/checkouts` allows exactly 2 calls before the 3rd returns
`429` with `limitScope: "mobile_pos_free_sync"` and `requiresUpgrade: true`.
