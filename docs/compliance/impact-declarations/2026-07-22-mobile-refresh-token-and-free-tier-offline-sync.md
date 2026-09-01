---
status: reference
owner: engineering
last_reviewed: 2026-08-29
related_adr: docs/architecture/adr/0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-07-22-mobile-refresh-token-and-free-tier-offline-sync
classification: regulatory
surfaces: pos,terminal,settings,payments,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.29
verification_evidence: focused rateLimiter.behavior.test.js including successful-round reuse per device and failed-request restoration,mobilePosReplayGuard.test.js payment mutation replay coverage,API architecture and compliance checks,existing mobile auth and sync contract suites
rollback_note: Revert mobilePosFreeSyncRoundLimiter routing and restore mobilePosFreeSyncLimiter mounts; revert mobilePosReplayGuard wiring while retaining immutable mutation IDs. No migration or stored business data needs rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-29T19:00:00+08:00
preflight_request_ref: NOT-EXECUTED-MOBILE-SYNC-ROUND-20260829
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
now reachable by both tiers with no cap. `POST /mobile-pos/sync/*` ledger
routes carry a free-tier round limiter (Redis-backed via the existing
`DynamicStore` infrastructure) capped at
`MOBILE_SYNC_LIMIT_PER_DAY` (2, already advertised to clients in
`sync_policy`/`sync_limit_policy` but never previously enforced). As amended
on 2026-08-29, the limiter is keyed per tenant/device and treats a bounded,
stable `client_sync_run_id` as one successful full round even when dependency
replay crosses several endpoint calls. Failed requests restore the slot. A tenant
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
3. The free-tier sync cap is enforced server-side (Redis-backed with the
   existing memory fallback), not only
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
7. A run ID never replaces mutation idempotency. Every ledger effect continues
   to use its immutable mutation ID; run identity is used only for rate-limit
   accounting and expires after a bounded reuse interval.
8. Rejected validation, authorization, and server-error requests do not consume
   one of the two successful-round slots.
9. Mobile payment mutations retain their immutable mutation IDs and are checked
   against the persisted replay result before any financial effect is repeated.
   The sync-run identifier controls rate-limit accounting only and never replaces
   checkout, refund, reversal, or drawer-event idempotency.

## Verification Evidence

The commands listed in front matter must pass before deployment.
`check:architecture-guardrails` and `check:controller-boundaries` confirm no
module-boundary or controller/model-import violations were introduced.
`eslint src` is clean. The listed Jest suites (auth/rate-limiter/mobile-pos
transport + behavior tests, run together and in isolation) cover: mobile
vs. browser refresh-token body inclusion, cookie-priority-over-body
ordering, `requirePremium`'s unchanged behavior post-refactor, and the new
mobile sync limiter (cap enforcement, bounded run reuse, premium bypass, and
tenant/device isolation). A full backend suite
run before/after this change shows an identical set of pre-existing
(environment-only, `ECONNREFUSED`/missing-app-dependency) failing suites —
no new regressions. Manual verification against a real, locally running
instance of this backend (migrated MariaDB + Redis, no mocking) confirmed:
`x-client-platform: mobile` login returns a `refreshToken`; submitting it to
`/auth/refresh-token` rotates it correctly; reusing the spent refresh token
is rejected ("reused or revoked"); a `standard`-plan tenant reaches
`/mobile-pos/bootstrap/settings` (403'd before this change); and
the original `/mobile-pos/sync/checkouts` path allowed exactly 2 requests before the 3rd returned
`429` with `limitScope: "mobile_pos_free_sync"` and `requiresUpgrade: true`.

The 2026-08-29 amendment adds focused behavior coverage proving that multiple
successful endpoint calls with one run ID consume one slot, a third distinct
run is rejected, different devices do not share the business allowance,
legacy clients retain per-request accounting, and 4xx responses do not spend a
successful-round slot. No production preflight was claimed for this local
change; `preflight_request_ref` records that explicitly.

Focused `mobilePosReplayGuard.test.js` coverage verifies that a persisted replay
result is returned without repeating the payment mutation and that a mismatched
operation type fails closed. The guard adds no payment field, provider claim,
schema migration, or stored financial effect.

## Update 2026-09-01: POS payment and device workflow hardening

The local reconciliation batch also carries existing POS corrections for
employee-credit repayment validation, refund/reversal scope, mobile financial
sync replay, receipt-device audit payloads, payment breakdown normalization,
and free-tier sync-round accounting. These changes preserve the existing
transaction and allocation ownership boundaries: server use cases remain the
only financial mutation authority, provider evidence is not inferred from the
client, and hardware follow-up failure does not roll back a committed sale.

Focused backend tests cover employee-credit repayment validation, mobile sync
transport and financial replay, cash refund behavior, receipt-device payloads,
payment breakdowns, and rate-limit restoration. No model or migration-runner
file changes are included, so this update introduces no schema migration.

### Cashier access and catalog mutation controls

The same reconciliation preserves least-privilege behavior for cashier item
maintenance and POS settings access. Cashiers may edit catalog items through
the existing authorized path but cannot delete them, and non-master-admin
settings access continues to require the configured branch PIN. Permission
matrix, cashier POS permission, and mobile settings-bootstrap tests cover the
server-authoritative enforcement; no credential or PIN value is logged or
added to a client-owned authorization decision.
