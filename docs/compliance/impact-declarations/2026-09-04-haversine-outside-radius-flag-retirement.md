---
status: reference
owner: engineering
last_reviewed: 2026-09-04
related_adr: docs/architecture/adr/0078-customer-delivery-fee-modes.md (2026-09-04 Amendment --
  corrects the Context section's stale "outside_radius_flag survives" claim; no Decision clause
  changed)
declaration_id: 2026-09-04-haversine-outside-radius-flag-retirement
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: apps/dgfy-api/tests/storeOutsideRadiusFlagRetirement.unit.test.js -- actually executed (Jest), 7 passing (new),apps/dgfy-api/tests/storeCheckoutRoadDistanceCapture.unit.test.js -- actually executed (Jest), 5 passing, unchanged/regression-clean,apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutInventoryReservation.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeUsecases.applicationResult.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCartQuotePreviewNoContactRequired.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutDeliveryFeeThreeEntryPointConsistency.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutCalculatedDeliveryFee.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutAutoAppliedDelivery.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutDeliveryWaiverDualAxis.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/posOrderRejectionAndAddressEdit.usecase.test.js -- actually executed (Jest), 8 passing, unchanged/regression-clean,node --check on every changed/new apps/dgfy-api and apps/dgfy-migration-runner .js/.cjs file,npm run check:architecture -- passed (54 modules, 94 controller files),npm run lint:docs -- passed (29 governed docs, 88 ADRs, confirms ADR 0078's status: amended + new ## Amendments block validate),node scripts/check-tenant-schema-registry-coverage.js --staged -- PASS (1 migration file checked),npm run check:compliance -- confirmed to fail first (listing storeUseCases.js and posUseCases.js as the sensitive files with no declaration), then pass once this declaration was added
rollback_note: Reverting this PR's diff restores haversineDistanceKm/resolveDeliveryRadiusFlag, the outside_radius_flag column (via the new migration's down(), which re-adds it BOOLEAN NOT NULL DEFAULT false AFTER store_customer_id), the PosTransaction model field, and every read/write site. No fee-math, enforcement, or read path anywhere in the codebase depends on any of the removed code -- resolveStoreDeliveryFee and the road-distance pipeline (ADR 0078 Decision 2) are untouched by this diff, confirmed by the unchanged regression suite above. The only data loss on a forward migration + later rollback is the flag's own already-unread historical boolean values.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T16:07:17.508Z
preflight_request_ref: PREFLIGHT-33893050690-2026-09-04-HAVERSINE-OUTSIDE-RADIUS-FLAG-RETIREMENT
---

# Haversine `outside_radius_flag` retirement (#1565, #478 residue)

## Compliance Impact Classification

Major. Both `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (`modules/store/` --
`payments` surface) and `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` (`modules/pos/` --
`pos`,`terminal` surfaces) are touched, each an exact-prefix floor at `major` in
`check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` -- the union floors this declaration at
`major` across `pos,terminal,payments`. No capture, refund, settlement, or fiscal-document logic is
touched; no new reason code is introduced; `reason_codes_impacted: ALLOWED` reflects that this is a
pure removal of already-inert code, not a behavior change to any evaluated surface.

## What this PR does and does not do

Retires the legacy haversine `outside_radius_flag`, per #1565's own decision framing (Option 1 of
the two the ticket named -- see the PR body for the full reasoning against Option 2):

- Removed `haversineDistanceKm` and `resolveDeliveryRadiusFlag`
  (`apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`) -- confirmed write-only with zero
  consumers anywhere in the backend or any of the three frontend apps before removal (`git grep`
  across `apps/`/`packages/` found no reader of `outside_radius_flag`/`outsideRadiusFlag` other
  than the write sites removed here).
- Removed the `outside_radius_flag` column from `pos_transactions`
  (`apps/dgfy-migration-runner/migrations/20260909000001-drop-outside-radius-flag.cjs`, fanning out
  over the landlord DB and every active tenant DB, mirroring the
  `20260902000001-add-delivery-distance-capture.cjs` pattern) and the matching `PosTransaction`
  model field.
- Removed both write sites (`resolveCheckoutContext`'s quote-response field and the
  `PosTransaction` create payload) and the order-serialization echo
  (`serializeOrderBase`'s `outside_radius_flag: order?.outside_radius_flag`).
- Fixed the resulting live anchor-reference gap: `sync-tenant-schemas.js`'s
  `REQUIRED_TENANT_SCHEMA_COLUMNS.pos_transactions.delivery_distance_meters` entry used to say
  `AFTER \`outside_radius_flag\`` -- re-anchored to `AFTER \`store_customer_id\`` so a straggler
  tenant's self-repair path keeps working once `outside_radius_flag` is gone.
- Updated two now-stale comments in `posUseCases.js` (the address-edit use case) that referenced
  `outside_radius_flag` by name, without changing that use case's actual behavior (still no radius
  re-enforcement on an address edit -- unchanged).
- **The false-vs-null distinguishability gap the ticket also named is now moot**, stated explicitly
  per the ticket's own instruction: `resolveDeliveryRadiusFlag` no longer exists, so there is no
  function left to return `false` instead of `null` for the missing-coordinate case.
- **Untouched, confirmed by the unchanged regression suite**: `resolveStoreDeliveryFee`, the
  GraphHopper-backed road-distance capture/await pipeline, `resolved.delivery.outOfRange`, and
  every ADR 0078 Decision 2 enforcement path. These were explicitly out of scope for #1565 and
  remain byte-identical.

## Affected Surfaces

- `payments` -- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`: removes two internal
  helpers, one field from `resolveCheckoutContext`'s returned object, one field from the
  cart-quote response, one field from the `PosTransaction` create payload, and one field from the
  order-serialization base. No signature of any exported use case changes; no return field other
  than `outside_radius_flag` itself is affected.
- `pos`,`terminal` -- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`: comment-only changes
  in `buildUpdateOnlineOrderDeliveryAddressUseCase`; the use case's actual persisted-fields object
  and behavior are unchanged.
- Not compliance-sensitive by the guardrail's own rule set, named anyway for completeness:
  `apps/dgfy-api/src/models/PosTransaction.js` (model field removal),
  `apps/dgfy-migration-runner/migrations/` (new migration), `apps/dgfy-api/scripts/sync-tenant-schemas.js`
  (anchor-reference fix), `docs/architecture/adr/0078-customer-delivery-fee-modes.md` (dated
  Amendment correcting stale Context prose).

## Compliance Preconditions

- No refund, settlement, or fiscal-document code path is touched.
- `resolveStoreDeliveryFee`'s return value is unchanged -- it never read `outsideRadiusFlag` before
  this PR and reads nothing new after it. Confirmed by the unchanged
  `storeCheckoutRoadDistanceCapture.unit.test.js` fee-boundary regression tests (still asserting
  identical `delivery_fee`/`total_amount` across road/large/unavailable distance-provider results)
  and every other checkout regression test in the Verification Evidence list, all passing with no
  edits.
- The real out-of-range enforcement signal (`resolved.delivery.outOfRange`, ADR 0078 Decision 2
  [binding]) is untouched -- confirmed directly by this PR's own new test
  (`storeOutsideRadiusFlagRetirement.unit.test.js`, "sanity: the retirement didn't collaterally
  remove the REAL out-of-range signal").
- The removed column had exactly zero readers anywhere in the codebase prior to this PR (backend
  and all three frontend apps grepped) -- its removal cannot change any decision path because no
  decision path ever consulted it.
- The new migration is additive-safe in reverse: `down()` restores the column with its original
  `NOT NULL DEFAULT false` shape, positioned back where it was (`AFTER store_customer_id`), not
  appended at the end of the table.

## Verification Evidence

See front matter `verification_evidence` for the full command/test list. Summary:

- New test file `storeOutsideRadiusFlagRetirement.unit.test.js` (7 tests): a structural guard that
  `storeUseCases.js`/`posUseCases.js` no longer reference the retired identifiers at all; the
  `PosTransaction` model no longer defines the column (and still defines the unrelated
  `delivery_distance_meters`/`delivery_distance_source` columns); a checkout with a delivery pin
  ~85km outside the location's `delivery_radius_km` (5) -- exactly the case the old haversine logic
  would have flagged `true` for -- persists no `outside_radius_flag` key at all, in either the
  persisted create-payload header or the serialized order in the response; the cart-quote response
  carries no `outside_radius_flag` key either, while still carrying the real
  `delivery_out_of_range` signal; a non-delivery (pickup) order also persists cleanly with the key
  absent.
- Full existing store-checkout regression suite (12 test files, 157 tests) and the
  `posOrderRejectionAndAddressEdit.usecase.test.js` suite (8 tests) -- all passing, zero test edits
  needed, confirming zero prior coverage depended on the removed code (consistent with the ticket's
  own "zero consumers" premise) and that the comment-only `posUseCases.js` change didn't alter that
  use case's behavior.
- `node --check` on every changed/new `apps/dgfy-api` and `apps/dgfy-migration-runner` `.js`/`.cjs`
  file -- no syntax errors.
- `npm run check:architecture` -- passed (54 modules, 561 code files; 94 controller files, no
  unauthorized model imports).
- `npm run lint:docs` -- passed (29 governed docs; 88 ADRs, confirming ADR 0078's
  `status: accepted -> amended` plus its new `## Amendments` block validate).
- `node scripts/check-tenant-schema-registry-coverage.js --staged` -- PASS, 1 migration file
  checked (the coverage check's static regex only inspects `queryInterface.addColumn`/`createTable`
  literal calls; this migration's raw-SQL tenant-fanout `DROP COLUMN`, matching the established
  `20260902000001` pattern, triggers neither a violation nor a registry-entry requirement).
- `npm run check:compliance` -- confirmed to fail first, listing exactly
  `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` and
  `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js` as the sensitive files with no
  declaration, then passed once this file was added.
- **Not exercised in this environment**: a real migration run (`up`/`down`) against a live MySQL
  instance with multiple tenant databases -- no reachable database was available from this
  dispatch context. The migration's raw-SQL fan-out logic is structurally identical to
  `20260902000001-add-delivery-distance-capture.cjs`, which has already run in this codebase's own
  history; the `information_schema`-based existence guards (`tableExists`/`columnExists`) make both
  `up()` and `down()` idempotent against a database in any prior state.

## Changed Files

- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/models/PosTransaction.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-migration-runner/migrations/20260909000001-drop-outside-radius-flag.cjs` (new)
- `apps/dgfy-api/tests/storeOutsideRadiusFlagRetirement.unit.test.js` (new)
- `docs/architecture/adr/0078-customer-delivery-fee-modes.md` (dated Amendment, `status: amended`)

## Preflight Reconciliation

`NOT-EXECUTED-1565-HAVERSINE-OUTSIDE-RADIUS-FLAG-RETIREMENT` is expected on a PR targeting
`develop`, not a finding -- per `docs/compliance/request-time-preflight-protocol.md`, "Where live
preflight actually runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`)
triggers automatically once this declaration lands on `develop` and reconciles this front matter
within minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call
was made from this session -- no authenticated `SYSTEM.EDIT_SETTINGS` session against a running
backend was available, matching every other `develop`-targeting PR under this protocol.
