---
status: reference
owner: engineering
last_reviewed: 2026-09-06
related_adr: docs/architecture/adr/0066-voucher-sale-time-price-resolution.md (Decision 9 --
  eligibility conditions as first-class columns, extended here; Decisions 1-3 preserved, not
  touched)
declaration_id: 2026-09-06-voucher-max-order-value-and-audit-columns
classification: major
surfaces: pos,terminal
reason_codes_impacted: VOUCHER_MAX_ORDER_VALUE_EXCEEDED,VOUCHER_ORDER_VALUE_RANGE_INVALID,VOUCHER_ACTOR_REQUIRED
policy_version: 2026.09.06
verification_evidence: node --check on every changed/added apps/dgfy-api file (0 errors),apps/dgfy-api/tests/addVoucherOrderValueAndAuditColumns.migration.test.js (new -- migration/sync-tenant-schemas DDL-identity coverage, all passing),apps/dgfy-api/tests/voucherEligibilityPolicy.unit.test.js (extended -- 5 new max_order_value_centavos cases, all passing),apps/dgfy-api/tests/voucherValidator.test.js (extended -- forbidden-field + nullability + cross-field cases, all passing),apps/dgfy-api/tests/voucherUseCases.usecases.test.js (extended -- actor 401, created_by/updated_by stamping, order-value-range guard, all passing; every pre-existing create/update test in the file still passes via a defaulted-actor test wrapper),apps/dgfy-api/tests/voucherDisplayUseCases.usecases.test.js (extended -- confirms VOUCHER_MAX_ORDER_VALUE_EXCEEDED stays excluded from DISPLAY_RELEVANT_REASON_CODES),full targeted regression run alongside the above (addDeliveryFeeBreakdown/addDeliveryFeeModeDiscoveryIndex/addDeliveryVoucherBenefit/addVoucherAutoApply migration tests, autoAppliedCampaignPolicy, finalizePaidCommerceSession, pricelistUseCases, pricelistValidator, storeCancelVoucherReversal, storeCheckoutAutoAppliedDelivery, storeCheckoutDeliveryFeePin, storeCheckoutDeliveryWaiverDualAxis, tenantSchemaSyncScripts, voucherRedemptionUseCases, voucherReversalUseCases -- 16 suites, 264 tests, all passing, zero edits),npm run build:pos (packages/web-core is mounted there; clean build, no new errors),apps/dgfy-ims-hosted vitest run of packages/web-core/src/features/pos/__tests__/voucherManagementPayload.test.js (extended -- 12 tests, all passing)
rollback_note: Revert this PR's diff, including the migration's down() (drops the three additive
  columns per active tenant DB, reverse order) and the matching sync-tenant-schemas.js repair
  entries. All three columns are additive/nullable; no existing voucher row, index, or persisted
  redemption is touched or recomputed. created_by/updated_by carry no DB-level FK anywhere (model,
  migration, or repair registry), so there is no constraint to unwind either.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1490-1494-VOUCHER-ORDER-VALUE-AUDIT-COLUMNS
---

# Voucher `max_order_value_centavos` + `created_by`/`updated_by` audit columns (Phase 259, #1490 + #1494)

## Compliance Impact Classification

**Major.** Every changed source file under `apps/dgfy-api/src/modules/vouchers/` matches
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` pattern for
`^apps/dgfy-api/src/modules/vouchers/` at a `major` floor on the `pos`/`terminal` surfaces. This is
also independently a change to a shared voucher eligibility check (ADR 0066-governed money/
eligibility surface) and a new write-path for staff identity, both of the class AGENTS.md requires
a declaration for regardless of the automated floor.

Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs"
(#884/#1163/#1248): `preflight_request_ref` carries a `NOT-EXECUTED-*` placeholder, which is the
accepted, expected state for a PR targeting `develop` -- the continuous compliance-preflight sweep
reconciles it to a real run within minutes of merge, not at PR time.

## Scope

Batched into one migration/one phase per #1496's "Wave 1 -- batch the migrations" instruction (both
#1490 and #1494 add columns to `vouchers`). Full file list and design rationale:
`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`'s Phase 259 entry (to be added on merge) and this
PR's own body.

- `apps/dgfy-api/src/models/Voucher.js` -- 3 new columns (`max_order_value_centavos`, `created_by`,
  `updated_by`).
- `apps/dgfy-api/src/models/index.js` -- 2 new `belongsTo(User, ...)` associations,
  `constraints: false` (no DB-level FK).
- `apps/dgfy-migration-runner/migrations/20260906000002-add-voucher-order-value-and-audit-columns.cjs`
  -- new, batched migration, tenant-fanned-out (same template as
  `20260905000002-add-voucher-auto-apply.cjs`).
- `apps/dgfy-api/scripts/sync-tenant-schemas.js` -- 3 new `REQUIRED_TENANT_SCHEMA_COLUMNS.vouchers`
  repair entries, DDL strings string-identical to the migration (enforced by the new migration
  test).
- `apps/dgfy-api/src/validators/voucherValidator.js` -- `max_order_value_centavos` field (nullable,
  same bounds as `min_spend_centavos`); `created_by`/`updated_by` added to `FORBIDDEN_FIELDS`; a
  same-request cross-field check (max < min is a 422).
- `apps/dgfy-api/src/modules/vouchers/domain/voucherEligibilityPolicy.js` -- new
  `VOUCHER_MAX_ORDER_VALUE_EXCEEDED` reason code and eligibility check, compared against the same
  `context.subtotalCentavos` `min_spend_centavos` already uses (item subtotal, excludes the delivery
  fee).
- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js` -- `VOUCHER_ORDER_VALUE_RANGE_INVALID`
  (min/max deadlock guard) and `VOUCHER_ACTOR_REQUIRED` (missing-actor 401) reason codes; a new
  `voucherUnauthorized` error constructor.
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherUseCases.js` -- `max_order_value_centavos`
  added to `WRITABLE_VOUCHER_COLUMNS`/`NUMERIC_VOUCHER_COLUMNS`; `created_by`/`updated_by`
  deliberately NOT added there (server-owned, injected directly from the authenticated actor); new
  `assertOrderValueRangeInvariant` guard on create and update; `created_by`/`updated_by` stamped
  from `req.user` -- **hard-fails 401 (`VOUCHER_ACTOR_REQUIRED`) when the actor is missing**, matching
  `deliveryRunUseCases.js`'s stricter behavior rather than silently persisting a null actor;
  `presentVoucher` projects `created_by_username`/`updated_by_username` alongside the raw IDs.
- `apps/dgfy-api/src/modules/vouchers/repositories/voucherRepository.js` -- opt-in `includeActors`
  join on `findById`/`listVouchers` (two `LEFT JOIN`s to `User`), so the hot transactional paths
  (create/update/redeem, which call `findById` repeatedly inside a lock) never pay for it. Get/list
  -- the staff-admin-only, low-QPS read paths, capped at 100 rows/page -- always request it.
- `apps/dgfy-api/src/modules/vouchers/controllers/voucherHandlers.js` -- `createVoucher`/
  `updateVoucher` now pass `user: req.user` into the use case.
- `packages/web-core/src/features/pos/components/voucherFormModel.js` /
  `VoucherManagementPanel.jsx` -- new form field ("Max order value"), round-tripped through
  `buildVoucherPayload`/`voucherToForm`; a read-only "Created by / Last modified by" line on the
  edit view and a compact "Created by" suffix on the list card. Both audit fields are display-only,
  never part of the outgoing request payload.

## Affected Surfaces

1. **New eligibility check** (`pos`/`terminal`, checkout-facing): a voucher with
   `max_order_value_centavos` set is now refused (`VOUCHER_MAX_ORDER_VALUE_EXCEEDED`) once the item
   subtotal exceeds the cap. Nullable, defaults to no cap -- every existing voucher (column is
   absent until this migration runs, then `NULL`) is unaffected; the new check only fires once a
   staff admin explicitly sets the field on a voucher via `VoucherManagementPanel.jsx`.
2. **`VOUCHER_MAX_ORDER_VALUE_EXCEEDED` deliberately excluded from two existing allowlists** --
   `voucherDisplayUseCases.js`'s `DISPLAY_RELEVANT_REASON_CODES` (a cart subtotal is unknowable
   before a cart exists, same reasoning already documented there for
   `VOUCHER_MIN_SPEND_NOT_MET`/quantity) and `finalizePaidCommerceSession.js`'s
   `VOUCHER_REDEMPTION_UNAVAILABLE_REASON_CODES` (a fixed cart total is deterministic for a given
   payload, not a race, same class as the two min-spend/min-quantity codes already excluded there).
   Verified both allowlists already correctly omit the new code -- no edit was needed to either
   file, and the display-side omission is covered by a new regression test that would fail loudly
   if someone later added it.
3. **Create/update now require an authenticated actor.** `POST /vouchers` and `PUT /vouchers/:id`
   hard-fail 401 (`VOUCHER_ACTOR_REQUIRED`) if `req.user.user_id` is missing/invalid. Both routes
   already require `authenticate` ahead of the controller, so this should never actually trigger in
   production -- it closes the gap where a future routing change could otherwise silently persist a
   `null` `created_by`/`updated_by`.
4. **`created_by`/`updated_by` carry no DB-level FK, by design** -- plain nullable `INTEGER`, no
   `REFERENCES` clause in the model, the migration, or the `sync-tenant-schemas.js` repair entry;
   the ORM association uses `constraints: false`. Rationale (cross-tenant-DB ALTER risk via this
   migration's landlord-only connection, plus `sync-tenant-schemas.js`'s column-presence-only repair
   gate that would otherwise permanently starve already-active tenants of a constraint added after
   the fact) is documented in full in the migration's own header comment.
   `Employee.created_by`/`updated_by` and `DeliveryPersonnel.created_by`/`updated_by` already use
   this same shape.
5. **`includeActors` always-on for get/list, opt-in elsewhere.** Two additional `LEFT JOIN`s on
   `GET /vouchers` and `GET /vouchers/:id` (staff-admin-only, capped at 100 rows/page) -- every other
   `findById` call site (create/update/redeem/activate/pause/archive, several of which run inside a
   version-locked transaction) is unchanged and does not request the join.

## Compliance Preconditions

1. **ADR 0066 Decision 9 (`[binding]` on eligibility conditions as first-class WHERE-clause-capable
   columns, not JSON) is extended, not weakened** -- `max_order_value_centavos` is a real BIGINT
   column, mirroring `min_spend_centavos`'s own shape exactly (same nullability, same comparison
   basis, same `_centavos` BIGINT convention every other money column on `vouchers` already uses).
2. **No persisted voucher, redemption, or discount computation changes for any existing row.** All
   three new columns are additive and nullable; a pre-existing voucher's `max_order_value_centavos`
   is `NULL` (no cap, byte-identical eligibility outcome) and its `created_by`/`updated_by` are
   `NULL` (no audit trail for rows created before this phase -- not backfilled, since no reliable
   source of truth exists for who originally created those rows).
3. **Fail-closed on a real ambiguity, not fail-open.** The min/max deadlock guard
   (`assertOrderValueRangeInvariant`) refuses a voucher whose `max_order_value_centavos` would be
   less than its `min_spend_centavos` (a permanent, unsatisfiable eligibility window) -- checked
   against the merged row on both create and update, so a PATCH sending only one of the two fields
   is still caught against the other's stored value, not just a same-request check.
4. **Server-owned identity, never client-writable.** `created_by`/`updated_by` are in
   `FORBIDDEN_FIELDS` (rejected outright, not silently stripped, matching every other server-owned
   field on this validator) and are deliberately absent from `WRITABLE_VOUCHER_COLUMNS` -- they are
   stamped directly from the authenticated actor inside the use case, never derived from the
   request payload.
5. **Zero regression to the existing voucher benefit/eligibility/redemption surface.** Confirmed by
   running the full pre-existing voucher-adjacent test suite (16 files, 264 tests, listed in
   `verification_evidence`) unmodified alongside the extended files, all passing.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: `node --check`
clean on every changed/added `apps/dgfy-api` file; the new migration test asserts DDL-string
identity between the migration and `sync-tenant-schemas.js`'s repair entries for all three columns;
the extended eligibility/validator/use-case/display test files all pass, including new cases for
the 401 hard-fail, the `created_by`/`updated_by` stamping, the min/max deadlock guard (both the
validator's same-request check and the use case's merged-row check), and the display-allowlist
exclusion; a broader 16-suite/264-test regression run across every voucher-adjacent test file
passes unmodified; `npm run build:pos` (POS mounts `VoucherManagementPanel.jsx` via
`TerminalOperationsWorkspace.jsx`) builds clean; the extended frontend payload test
(`voucherManagementPayload.test.js`, run via `apps/dgfy-ims`'s vitest config per
`docs/architecture/frontend-split-sync.md` -- `packages/web-core` has no vitest setup of its own)
passes all 12 cases.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-1490-1494-VOUCHER-ORDER-VALUE-AUDIT-COLUMNS`, expected on a `develop`-targeting PR
  per `docs/compliance/request-time-preflight-protocol.md`; the continuous sweep reconciles it
  post-merge.
- **`npm run gate:release:local` has not been run** -- this PR's Tier 0/2 self-verification (syntax
  check + build + a targeted-but-broad test subset covering the entire voucher-adjacent surface) is
  scoped evidence, not the full local gate; that gate is delegated to `promotion-quality-gate.yml`
  at promotion time (#1431 Phase C/D), not `implement`'s job at PR time.
- **The pre-existing `validateFormLocally` min-spend gap** (only validated under
  `isDeliveryCampaign`, not `promo_code` -- found during this phase, not introduced by it) is
  deliberately NOT fixed in this PR, to keep this phase's scope tight; a follow-up issue is filed
  separately for it. The new `max_order_value_centavos` client-side check does not inherit this gap
  -- it runs unconditionally for both voucher kinds.
