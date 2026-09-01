---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-server-side-road-distance-capture-observation-only
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.02
verification_evidence: apps/dgfy-api/tests/roadDistanceProvider.test.js -- actually executed (Jest), 9 passing,apps/dgfy-api/tests/routeCalculatorRepository.test.js -- actually executed (Jest), 6 passing incl. 2 new timeoutMs cases,apps/dgfy-api/tests/routeCalculatorUseCase.test.js -- actually executed (Jest), 8 passing incl. 2 new timeoutMs pass-through cases,apps/dgfy-api/tests/storeCheckoutRoadDistanceCapture.unit.test.js -- actually executed (Jest), 7 passing incl. the §6 fee-boundary regression (road/large/unavailable all resolve identical delivery_fee and total_amount),apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutInventoryReservation.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeUsecases.applicationResult.test.js -- actually executed (Jest), unchanged, regression-clean,node --check on every changed/new apps/dgfy-api .js file,npm run check:architecture -- passed (52 modules incl. new repositories/ dir on deliveryPricing),npm run check:compliance -- confirmed to fail first (listing storeUseCases.js as the sole sensitive file), then pass once this declaration was added
rollback_note: Two additive, nullable/defaulted columns on pos_transactions (delivery_distance_meters, delivery_distance_source) capture an observation only -- neither is read by resolveStoreDeliveryFee or folded into delivery_fee/total_amount anywhere in this diff (see the §6-equivalent fee-boundary regression test). The routeCalculator/ timeoutMs param is additive and optional; every pre-existing caller that omits it keeps today's env-driven default timeout, byte-identical. Reverting this commit set removes the new deliveryPricing/repositories/roadDistanceProvider.js adapter, its resolveCheckoutContext wiring, and the two routeCalculator param additions; the two new pos_transactions columns can be dropped with no dependent read path to break, and no fee-math change to undo anywhere in the codebase.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T18:51:27.077Z
preflight_request_ref: PREFLIGHT-33545741502-2026-09-02-SERVER-SIDE-ROAD-DISTANCE-CAPTURE-OBSERVATION-ONLY
---

# Server-side road-distance capture, observation only (Phase 236, #1328)

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` is
`check-compliance-impact.js`'s exact-prefix floor at `major`/`payments` (the checkout use-case
module) -- this phase must touch that file to wire the new fields into `resolveCheckoutContext`,
which floors the whole diff at `major`/`payments` regardless of how small the actual change is.
`apps/dgfy-api/src/modules/routeCalculator/` is **not** in `COMPLIANCE_SENSITIVE_RULES` at all, so
the two-file touch there (repository + use case, both additive) adds no further floor. No capture,
refund, settlement, or fiscal-document logic is touched, and no new reason code is introduced --
`reason_codes_impacted: ALLOWED` reflects that.

## What this phase does and does not do

Phase 236 of epic #1321 (Customer delivery pricing), observation-only by design -- the ticket's own
central claim, restated and directly tested here (see Verification Evidence):

- New repository `apps/dgfy-api/src/modules/deliveryPricing/repositories/roadDistanceProvider.js`:
  wraps the existing `routeCalculator` module's `calculateRouteUseCase` (which already normalizes
  every failure mode -- disabled, timeout, GraphHopper 4xx/5xx, unmapped -- into a non-throwing
  `ApplicationResult`) with a per-call timeout (600ms, provisional -- see the module's own header
  comment) and a small in-process, tenant-scoped cache (6h TTL, 500-entry FIFO cap). Never throws,
  never rejects; every failure collapses to `{ distanceMeters: null, source: 'unavailable' }`.
- `apps/dgfy-api/src/modules/routeCalculator/`: `calculateRouteUseCase` and
  `routeCalculatorRepository.calculateRoute` both gain an additive, optional `timeoutMs` param.
  Omitted by every pre-existing caller (the map-display use case), which keeps falling through to
  the env-driven default (`routeCalculatorTimeoutMs()`, 6000ms) -- byte-identical to before this
  phase. Only the new road-distance adapter passes it, to bound its own added checkout-path latency
  independently of the map-display feature's own timeout.
- `resolveCheckoutContext` (`storeUseCases.js`): fires (does not await) the road-distance call as
  soon as location + delivery coordinates are resolved, guarded on `orderMethod === 'delivery'` and
  finite origin/destination coordinates (same guard shape `resolveDeliveryRadiusFlag` already
  uses). Awaited at the return-object assembly point and mapped to the persisted vocabulary:
  `orderMethod !== 'delivery'` -> `{meters: null, source: 'none'}`; a successful road resolution ->
  `{meters: <value>, source: 'road'}`; any adapter failure -> `{meters: null, source: 'fallback'}`.
  This mapping happens ONLY at this layer -- the adapter itself has no notion of
  `orderMethod`/`fallback`/`none`.
  **Fee math (`resolveStoreDeliveryFee`, `deliveryFee`, `totalAmount`) is completely untouched by
  this change** -- neither new field is read by any fee-computing line in this diff.
- Two new columns on `pos_transactions`, persisted at the single real checkout-persist call site
  (`buildStoreCheckoutUseCase`'s `createOnlineTransactionWithLines` header): `delivery_distance_meters`
  (nullable integer) and `delivery_distance_source` (`road|fallback|none`, defaulted `none`).
  Neither is surfaced on the public tracking-page serializer (`serializeOrderForCustomer`) -- this
  is an internal capture, not a customer-facing field, per the ticket's own "observation only"
  framing.

## Affected Surfaces

- `payments` -- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`:
  `resolveCheckoutContext` gains the fire-and-await road-distance call plus two new return fields
  (`deliveryDistanceMeters`, `deliveryDistanceSource`); `buildStoreCartQuoteUseCase`/
  `buildStoreCheckoutUseCase` gain an additive, optional `roadDistanceProvider` injection param
  (mirrors the existing `downpaymentSettingsRepository` pattern) so tests can supply a fake without
  touching the real GraphHopper integration. `resolveStoreDeliveryFee`'s signature, internal logic,
  and return value are byte-identical to before this PR.
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-api/src/modules/deliveryPricing/` (new `repositories/` layer dir, new adapter file) and
  `apps/dgfy-api/src/modules/routeCalculator/` (the additive `timeoutMs` param, two files).

## Compliance Preconditions

- No refund, settlement, or fiscal-document code path is touched.
- `resolveStoreDeliveryFee`'s return value is provably unchanged: neither
  `deliveryDistanceMeters`/`deliveryDistanceSource` nor the road-distance provider result is read by
  that function or by the `totalAmount` computation immediately after it -- confirmed by the
  fee-boundary regression test in `storeCheckoutRoadDistanceCapture.unit.test.js`, which asserts
  identical `delivery_fee`/`total_amount` across three checkout runs differing only in what the
  (mocked) road-distance provider returns (zero-distance road, large-distance road, and
  unavailable/failure).
- The road-distance adapter has zero blocking failure modes reaching checkout: every path through
  `routeCalculatorUseCases.js`/`routeCalculatorRepository.js` (disabled, axios timeout,
  GraphHopper 4xx/5xx, unmapped) already resolves to a non-throwing `ApplicationResult`; the
  adapter's own try/catch is defensive insurance on top of that, not the primary safety mechanism.
- The in-process cache is keyed on `tenantId:locationId:roundedLat:roundedLng` -- `tenantId` is a
  required part of the key specifically because `location_id` is a tenant-scoped, not globally
  unique, integer in this repo's multi-tenant model; omitting it would let one tenant's cached
  distance leak into another tenant's read for the same numeric `location_id`. Only a *successful*
  result is cached -- a transient GraphHopper failure never poisons the same address for the TTL.
- The two new `pos_transactions` columns are additive, nullable/defaulted, and read by nothing else
  in this diff -- no existing query, report, or serializer changes shape.

## Verification Evidence

- `apps/dgfy-api/tests/roadDistanceProvider.test.js` (new, 9 tests): the adapter's own contract
  directly -- success mapping, failure-to-`unavailable` mapping, the belt-and-suspenders catch
  around an unexpected rejection, cache-hit (same grid cell, provider invoked once), no-cache-on-
  failure, tenant-scoped cache isolation, timeoutMs pass-through, and a late-settling promise
  resolving cleanly with no unhandled rejection. All passing.
- `apps/dgfy-api/tests/routeCalculatorRepository.test.js` (2 new cases added to the existing suite):
  omitted `timeoutMs` uses the env-driven 6000ms default (byte-identical to pre-#1328); a supplied
  `timeoutMs` overrides it. All passing (6/6 total in the file).
- `apps/dgfy-api/tests/routeCalculatorUseCase.test.js` (2 new cases added to the existing suite):
  `timeoutMs` forwarded to the repository when supplied; omitted forwards `undefined`, unchanged
  from before. All passing (8/8 total in the file).
- `apps/dgfy-api/tests/storeCheckoutRoadDistanceCapture.unit.test.js` (new, 7 tests): a successful
  resolution persists `{source: 'road', meters: <value>}`; GraphHopper down/unavailable still
  completes checkout and persists `{source: 'fallback', meters: null}`; a non-delivery order never
  calls the provider and persists `{source: 'none', meters: null}`; omitting the injected provider
  falls back to the real singleton without breaking the checkout call; and the §6 fee-boundary
  regression (parameterized across zero-distance road / large-distance road / unavailable) asserting
  `delivery_fee`/`total_amount` are byte-identical across all three. All passing.
- Regression gate: `storeCheckoutDownpaymentResolution.unit.test.js`,
  `storeCheckoutVoucherPromoStacking.unit.test.js`, `storeCheckoutInventoryReservation.unit.test.js`,
  `storeCheckoutAffiliatePricing.unit.test.js`, `storeUsecases.applicationResult.test.js` -- 97 tests
  across this group, all passing, none of these fixtures inject a `roadDistanceProvider` at all, so
  they exercise the "falls back to the real singleton, non-delivery guard, or no coordinates" paths
  for real, not just by construction.
- `node --check` on every changed/new `apps/dgfy-api` `.js` file -- no syntax errors (dgfy-api has
  no build step; this is its Tier 0 equivalent per `.agents/skills/implement/SKILL.md`).
- `npm run check:architecture` -- passed (52 modules checked, including the new `repositories/`
  layer directory under `deliveryPricing/`, satisfying `check-architecture-guardrails.js`'s module
  shape rule).
- `npm run check:compliance` -- confirmed to fail first, listing exactly
  `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` as the sensitive file with no
  declaration, then passed once this file was added.
- **Real-latency measurement against self-hosted GraphHopper (§7 of the Phase 236 plan): NOT taken
  in this environment.** No reachable staging-class GraphHopper instance was available from this
  dispatch context to run the planned ≥20 real, non-mocked calls. The 600ms adapter timeout above is
  therefore explicitly provisional, sized off "self-hosted GraphHopper should answer in
  tens-to-low-hundreds of ms" reasoning, not a measured p95/p99. This measurement is a stated
  follow-up needed before #237 sizes its own real production timeout off this adapter's behavior --
  flagged here rather than silently omitted or fabricated.

## Changed Files

- `apps/dgfy-api/src/modules/deliveryPricing/repositories/roadDistanceProvider.js` (new)
- `apps/dgfy-api/src/modules/deliveryPricing/index.js`
- `apps/dgfy-api/src/modules/routeCalculator/repositories/routeCalculatorRepository.js`
- `apps/dgfy-api/src/modules/routeCalculator/usecases/routeCalculatorUseCases.js`
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/tests/roadDistanceProvider.test.js` (new)
- `apps/dgfy-api/tests/routeCalculatorRepository.test.js`
- `apps/dgfy-api/tests/routeCalculatorUseCase.test.js`
- `apps/dgfy-api/tests/storeCheckoutRoadDistanceCapture.unit.test.js` (new)

Note: the migration adding the two `pos_transactions` columns
(`apps/dgfy-migration-runner/migrations/20260902000001-add-delivery-distance-capture.cjs`), the
matching `apps/dgfy-api/scripts/sync-tenant-schemas.js` entry, and the `PosTransaction.js` model
field additions are a Worker checkpoint per `.agents/skills/implement/SKILL.md` and, as of this
declaration, are held pending explicit approval -- not yet committed. This declaration will be
amended (or the PR updated with those files under the same declaration) once that approval lands;
see the PR body for the current status.

## Preflight Reconciliation

`NOT-EXECUTED-1328-SERVER-SIDE-ROAD-DISTANCE-CAPTURE` is expected on a PR targeting `develop`, not a
finding -- per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually
runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was made
from this session -- no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend was
available, matching every other `develop`-targeting PR under this protocol.
