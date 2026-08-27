---
status: reference
owner: engineering
last_reviewed: 2026-08-27
declaration_id: 2026-08-27-storefront-fulfillment-method-availability
classification: major
surfaces: payments, settings
reason_codes_impacted: FULFILLMENT_METHOD_NOT_AVAILABLE
policy_version: 2026.08.27
verification_evidence: apps/dgfy-api/tests/tenantLocationFulfillmentMethodGuard.usecases.test.js (7 passed, new/extended for RF-2), apps/dgfy-api/tests/settingsCustomerAccessModeFulfillmentGuard.usecases.test.js (8 passed, new), apps/dgfy-api/tests/updateTenantCapabilitiesFulfillmentGuard.usecases.test.js (3 passed, new), apps/dgfy-api/tests/tenantLocationUsecases.applicationResult.test.js (8 passed, unaffected), apps/dgfy-api/tests/orderMethods.crossLayer.contract.test.js (4 passed, extended), apps/dgfy-api/tests/storeUsecases.applicationResult.test.js (55 passed, unaffected), apps/dgfy-api/tests/tenantLocationRepository.referenceGuard.test.js + tenantLocationReferenceSources.coverage.test.js (5 passed, unaffected), apps/dgfy-api/tests/settingsUsecases.applicationResult.test.js + settingsValidator.* (7 files, 140 passed, unaffected), apps/dgfy-api/tests/updateTenantCapabilitiesUseCase.rollback.test.js + tenantCapabilitySettings.test.js + adminTenantCapabilities.transport.test.js + adminTenantCapabilityValidator.test.js + listTenantCapabilityAuditLogs.usecase.test.js + tenantCapabilityReadiness.schemaCompatibility.test.js + tenantCapabilityRouteGates.test.js (unaffected), apps/dgfy-storefront/src/shared/model/__tests__/storefrontOrderMethodOptions.test.js (12 passed, new), apps/dgfy-storefront/src/__tests__/checkoutRules.test.js (14 passed, extended), apps/dgfy-storefront/src/__tests__/simpleCheckoutOnlinePayments.contract.test.js + fnbStorefront.contract.test.js + retailCheckoutOnlinePayments.contract.test.js + storefrontClosedHoursMessaging.contract.test.js (48 passed, unaffected), full apps/dgfy-storefront suite (140 files / 760 tests, unaffected), npm run build:store (apps/dgfy-storefront), npm run build:skupervisor (apps/dgfy-ims), npm run check:architecture, npm run check:controller-boundaries, npm run lint:docs
rollback_note: Revert this commit. The storeUseCases.js change is a pure rename (ORDER_METHOD_LOCATION_SUPPORT_MAP -> the identical map now sourced from packages/shared-constants/src/orderMethods.js as ORDER_METHOD_LOCATION_SUPPORT_KEYS), verified behavior-identical by the full storeUsecases.applicationResult.test.js suite passing unmodified. The tenantLocationUseCases.js/tenantLocationRepository.js/customerAccessModeFulfillmentPolicy.js/updateSettingsUseCase.js/updateSettingByKeyUseCase.js/updateTenantCapabilitiesUseCase.js changes add validation guards plus new read-only settings/location queries -- no schema, migration, or persisted-state change; reverting restores the prior (present) gap where a location could be saved with both delivery and pickup disabled while the store still accepted online orders, in either write direction (location-first or access-mode-first). The Settings.jsx change is UI-only (disables a switch, adds explanatory text) -- no new setting key, no new write path.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-27T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1093-STOREFRONT-FULFILLMENT-METHOD-AVAILABILITY
---

# Storefront Checkout Now Honors Per-Location Delivery/Pickup Availability

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/` is `check-compliance-impact.js`'s exact-prefix floor at
`major`/`payments` (this PR touches `storeUseCases.js`); `apps/dgfy-api/src/modules/settings/` is
a tracked `major`/`settings` surface (three files touched: `index.js`,
`updateSettingsUseCase.js`, `updateSettingByKeyUseCase.js`, plus the new
`customerAccessModeFulfillmentPolicy.js`); `apps/dgfy-ims/Pages/Settings.jsx` is a tracked
`major`/`settings` surface. None of these changes add a new payment method, provider, capture
path, schema, or migration -- one is a same-behavior rename, the rest are new validation guards
(plus one UI affordance) closing both directions of the same invalid state.

`apps/dgfy-api/src/modules/tenants/usecases/updateTenantCapabilitiesUseCase.js` (the
platform-admin tenant-capability write path) is also touched, adding the same guard to that third
write path -- not currently matched by any `check-compliance-impact.js` floor rule (a pre-existing
gap in that script's own coverage, not introduced here), named here for completeness since it is a
real compliance-relevant write path.

## What is wrong and why

Filed as #1093: `tenant_locations.supports_delivery`/`supports_pickup` already exist (default
`true`), are already enforced server-side at checkout (`storeUseCases.js`'s
`assertCheckoutLocationOperationalReadiness`, a `409 CONFLICT`), and are already editable per
location in IMS Settings -- but the storefront's own checkout UI never read them. A customer at a
pickup-disabled location could select "Pickup", complete the entire checkout flow, and only
discover the order was impossible on final submit. This is an advertise/enforce mismatch, the same
shape as #926 (payment capabilities).

Driven by a concrete case: Surebiz (Retail) needs to be delivery-only.

**Follow-up in the same declaration (PR #1096 review, RF-1):** the first version of this change
only guarded the location-write direction (`tenantLocationUseCases.js`) -- a merchant could switch
to Catalog Only, disable both delivery and pickup at a location (explicitly allowed under Catalog
Only), then switch `customer_access_mode` back to `transaction` through the settings/tenant-
capability write paths, none of which checked tenant locations. The store would re-enter
Transaction mode with no usable online fulfillment method -- the exact invalid state this
declaration's guard exists to prevent, just approached from the other direction. Closed by adding
the same check to every write path that can move the *effective* `customer_access_mode` toward
`transaction`.

## Affected Surfaces

- `payments`/checkout surface — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`:
  `ORDER_METHOD_LOCATION_SUPPORT_MAP` (private, duplicated) replaced with an import of the new
  `ORDER_METHOD_LOCATION_SUPPORT_KEYS` shared constant (`packages/shared-constants/src/
  orderMethods.js`) -- identical contents, now the single source of truth the storefront's own
  availability resolver also imports, rather than two independently-maintained copies.
- `settings` surface, direction 1 (location write) — `apps/dgfy-api/src/modules/tenantLocations/
  usecases/tenantLocationUseCases.js` gains `assertFulfillmentMethodAvailable`: rejects a create,
  or an update that *transitions into a reachable* both-off state (`is_active: true` and both
  `supports_delivery`/`supports_pickup` false), while the store's effective `customer_access_mode`
  is `transaction`. An inactive location is exempt regardless of its supports_* values (never
  reachable by checkout); a location already active-and-both-off prior to this change is exempt
  from an unrelated edit, but **activating** a previously-inactive both-off location is treated as
  the transition it is, not an unrelated edit (PR #1096 review, RF-2 -- the settings-side guards
  below only ever see active locations, so this direction closes what RF-1's fix would otherwise
  still miss). `apps/dgfy-api/src/modules/tenantLocations/repositories/tenantLocationRepository.js`
  gains one new read-only method, `getCustomerAccessModeSettings`, mirroring `storeRepository.js`'s existing
  `getSettingsByKeys` shape.
- `settings` surface, direction 2 (access-mode write) — new
  `apps/dgfy-api/src/modules/settings/usecases/customerAccessModeFulfillmentPolicy.js`: a shared,
  pure `assertNoUnfulfillableLocationForTransactionMode` check, plus
  `assertFulfillmentMethodAvailableForAccessModeTransition` (fetches current settings + tenant
  locations, resolves the *resulting* effective access mode, and applies the pure check). Wired
  into `updateSettingsUseCase.js` (bulk `PUT /settings`) and `updateSettingByKeyUseCase.js`
  (single-key `PUT /settings/:key`) via a new `tenantLocationRepository` dependency, injected in
  `apps/dgfy-api/src/modules/settings/index.js` (mirrors that file's existing cross-module
  `tenantRepository` import). A no-op, with no repository call at all, unless the write actually
  touches `customer_access_mode` -- `platform_max_customer_access_mode`, the only other lever that
  affects the resolved mode, is already unconditionally blocked from both of these tenant-facing
  paths.
- `settings` surface, direction 2, platform-admin path —
  `apps/dgfy-api/src/modules/tenants/usecases/updateTenantCapabilitiesUseCase.js` (the one path
  that can move `customer_access_mode` *and* its ceilings in a single write) re-checks the
  already-computed post-write `after` state inside the same Sequelize transaction before it
  returns, reusing the shared pure check with a direct `TenantLocation` query (this file's own
  existing data-access idiom, not the `tenantLocationRepository` used elsewhere) -- a rejection
  rolls back the whole transaction, so a rejected transition writes nothing.
- `apps/dgfy-ims/Pages/Settings.jsx` — the existing Delivery/Pickup switches (already shipped, no
  new setting key) now disable turning off the last-enabled method while Customer Access Mode is
  Transaction, with inline text pointing to Catalog Only as the way to actually stop taking online
  orders. Convenience only; the backend guards above are authoritative.
- Storefront (not itself compliance-tracked, listed for completeness): `apps/dgfy-storefront`
  checkout now filters delivery/pickup options through the resolved location's real
  `supports_delivery`/`supports_pickup`, self-corrects a stale/unavailable selection, and degrades
  gracefully (a new `no_fulfillment_method` checkout-block reason) if a location is ever
  reachable with neither enabled.

## Compliance Preconditions

- No new payment method, provider, or capture path is added or enabled.
- No new database column, table, or migration -- `tenant_locations.supports_delivery`/
  `supports_pickup` already existed and are unchanged in shape.
- `dine_in`/`takeout` availability and the `customer_access_mode` axis (Catalog/Inquiry/
  Transaction) are untouched -- the two axes are deliberately kept orthogonal (see the PR's
  design notes / ADR 0017): a dine-in-only restaurant expresses "no online orders" via Catalog
  Only, never by disabling both delivery and pickup.
- The location-write guard's prior-state exemption means no already-provisioned tenant sitting at
  both-off-in-transaction-mode is retroactively blocked from saving other location fields.
- The access-mode-write guard is a no-op (no repository call at all) for the large majority of
  settings/capability writes that never touch `customer_access_mode`.
- `platform_max_customer_access_mode` cannot be moved by either tenant-facing settings write path
  (already unconditionally blocked before this change); the platform-admin path, which can move
  it, is covered directly.
- `ORDER_METHOD_LOCATION_SUPPORT_KEYS`'s contents are byte-identical to the map it replaces --
  verified by the full `storeUsecases.applicationResult.test.js` suite (55/55) passing unmodified.

## Verification Evidence

- `apps/dgfy-api/tests/tenantLocationFulfillmentMethodGuard.usecases.test.js` — 7/7 passing
  (location-write direction): rejects a transition into both-off in transaction mode; allows
  delivery-only (Surebiz); allows both-off in Catalog Only mode; allows an unrelated edit to an
  already-active-both-off location without even querying access mode; rejects creating a new
  location with both off in transaction mode; **RF-2 regression pair** — rejects activating a
  previously-inactive both-off location while in transaction mode, and allows an unrelated edit to
  a location that stays inactive and both-off (no access-mode query at all, since it's still
  unreachable).
- `apps/dgfy-api/tests/settingsCustomerAccessModeFulfillmentGuard.usecases.test.js` — new, 8/8
  passing (access-mode-write direction, bulk + single-key settings paths): the pure check's own
  transaction/no-transaction/all-fulfillable truth table; rejects switching to `transaction` while
  a location is both-off; allows switching to Catalog Only regardless of location state; never
  queries locations for a write that doesn't touch `customer_access_mode`.
- `apps/dgfy-api/tests/updateTenantCapabilitiesFulfillmentGuard.usecases.test.js` — new, 3/3
  passing (platform-admin path): rejects switching to Transaction mode while a location is
  both-off, with the reject verified to actually roll back the setting write (a simulated
  Sequelize-transaction snapshot/restore in the test's own mock, since the mocked transaction
  doesn't otherwise model rollback); allows the same transition when every location is
  fulfillable; allows an unrelated capability write regardless of location state.
- `apps/dgfy-api/tests/orderMethods.crossLayer.contract.test.js` — extended, 4/4 passing: pins
  `STOREFRONT_FULFILLMENT_ORDER_METHODS` to exactly `['delivery', 'pickup']` and confirms every
  `STOREFRONT_ORDER_METHODS` member resolves to a real `ORDER_METHOD_LOCATION_SUPPORT_KEYS` entry.
- `apps/dgfy-api/tests/tenantLocationUsecases.applicationResult.test.js` (8/8),
  `tenantLocationRepository.referenceGuard.test.js` + `tenantLocationReferenceSources.coverage.
  test.js` (5/5), `storeUsecases.applicationResult.test.js` (55/55), the full
  `settingsUsecases.applicationResult.test.js` + `settingsValidator.*` (7 files, 140 tests), and
  every tenant-capability test file (`updateTenantCapabilitiesUseCase.rollback.test.js`,
  `tenantCapabilitySettings.test.js`, `adminTenantCapabilities.transport.test.js`,
  `adminTenantCapabilityValidator.test.js`, `listTenantCapabilityAuditLogs.usecase.test.js`,
  `tenantCapabilityReadiness.schemaCompatibility.test.js`, `tenantCapabilityRouteGates.test.js`)
  — all pass unmodified, confirming no regression from the rename or either new guard.
- `node --check` on every changed `apps/dgfy-api` `.js` file.
- `npm run build:store` (`apps/dgfy-storefront`) and `npm run build:skupervisor`
  (`apps/dgfy-ims`) — real Vite builds, both changed frontend apps.
- `npm run check:architecture`, `npm run check:controller-boundaries`, `npm run lint:docs`.

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-1093-STOREFRONT-FULFILLMENT-METHOD-AVAILABILITY`
is expected on a PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`/`main`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.
