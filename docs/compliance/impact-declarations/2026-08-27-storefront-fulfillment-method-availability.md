---
status: reference
owner: engineering
last_reviewed: 2026-08-27
declaration_id: 2026-08-27-storefront-fulfillment-method-availability
classification: major
surfaces: payments, settings
reason_codes_impacted: FULFILLMENT_METHOD_NOT_AVAILABLE
policy_version: 2026.08.27
verification_evidence: apps/dgfy-api/tests/tenantLocationFulfillmentMethodGuard.usecases.test.js (5 passed, new), apps/dgfy-api/tests/tenantLocationUsecases.applicationResult.test.js (8 passed, unaffected), apps/dgfy-api/tests/orderMethods.crossLayer.contract.test.js (4 passed, extended), apps/dgfy-api/tests/storeUsecases.applicationResult.test.js (55 passed, unaffected), apps/dgfy-api/tests/tenantLocationRepository.referenceGuard.test.js + tenantLocationReferenceSources.coverage.test.js (5 passed, unaffected), apps/dgfy-storefront/src/shared/model/__tests__/storefrontOrderMethodOptions.test.js (12 passed, new), apps/dgfy-storefront/src/__tests__/checkoutRules.test.js (14 passed, extended), apps/dgfy-storefront/src/__tests__/simpleCheckoutOnlinePayments.contract.test.js + fnbStorefront.contract.test.js + retailCheckoutOnlinePayments.contract.test.js + storefrontClosedHoursMessaging.contract.test.js (48 passed, unaffected), npm run build:store (apps/dgfy-storefront), npm run build:skupervisor (apps/dgfy-ims), npm run check:architecture, npm run lint:docs
rollback_note: Revert this commit. The storeUseCases.js change is a pure rename (ORDER_METHOD_LOCATION_SUPPORT_MAP -> the identical map now sourced from packages/shared-constants/src/orderMethods.js as ORDER_METHOD_LOCATION_SUPPORT_KEYS), verified behavior-identical by the full storeUsecases.applicationResult.test.js suite passing unmodified. The tenantLocationUseCases.js/tenantLocationRepository.js change adds one new validation guard and one new read-only settings query -- no schema, migration, or persisted-state change; reverting restores the prior (present) gap where a location could be saved with both delivery and pickup disabled while the store still accepted online orders. The Settings.jsx change is UI-only (disables a switch, adds explanatory text) -- no new setting key, no new write path.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-27T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1093-STOREFRONT-FULFILLMENT-METHOD-AVAILABILITY
---

# Storefront Checkout Now Honors Per-Location Delivery/Pickup Availability

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/` is `check-compliance-impact.js`'s exact-prefix floor at
`major`/`payments` (this PR touches `storeUseCases.js`); `apps/dgfy-ims/Pages/Settings.jsx` is a
tracked `major`/`settings` surface. Neither change adds a new payment method, provider, capture
path, schema, or migration -- one is a same-behavior rename, the other is a new validation guard
plus a UI affordance for it.

## What is wrong and why

Filed as #1093: `tenant_locations.supports_delivery`/`supports_pickup` already exist (default
`true`), are already enforced server-side at checkout (`storeUseCases.js`'s
`assertCheckoutLocationOperationalReadiness`, a `409 CONFLICT`), and are already editable per
location in IMS Settings -- but the storefront's own checkout UI never read them. A customer at a
pickup-disabled location could select "Pickup", complete the entire checkout flow, and only
discover the order was impossible on final submit. This is an advertise/enforce mismatch, the same
shape as #926 (payment capabilities).

Driven by a concrete case: Surebiz (Retail) needs to be delivery-only.

## Affected Surfaces

- `payments`/checkout surface — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`:
  `ORDER_METHOD_LOCATION_SUPPORT_MAP` (private, duplicated) replaced with an import of the new
  `ORDER_METHOD_LOCATION_SUPPORT_KEYS` shared constant (`packages/shared-constants/src/
  orderMethods.js`) -- identical contents, now the single source of truth the storefront's own
  availability resolver also imports, rather than two independently-maintained copies.
- `settings` surface — `apps/dgfy-api/src/modules/tenantLocations/usecases/
  tenantLocationUseCases.js` gains `assertFulfillmentMethodAvailable`: rejects a create, or an
  update that *transitions into*, a location with both `supports_delivery` and `supports_pickup`
  false while the store's effective `customer_access_mode` is `transaction`. Does not reject a
  location already in that state prior to this change (checked against the pre-update row), so no
  existing tenant's next unrelated save is newly blocked. `apps/dgfy-api/src/modules/
  tenantLocations/repositories/tenantLocationRepository.js` gains one new read-only method,
  `getCustomerAccessModeSettings`, mirroring `storeRepository.js`'s existing `getSettingsByKeys`
  shape.
- `apps/dgfy-ims/Pages/Settings.jsx` — the existing Delivery/Pickup switches (already shipped, no
  new setting key) now disable turning off the last-enabled method while Customer Access Mode is
  Transaction, with inline text pointing to Catalog Only as the way to actually stop taking online
  orders. Convenience only; the backend guard above is authoritative.
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
- The new guard's prior-state exemption means no already-provisioned tenant sitting at
  both-off-in-transaction-mode is retroactively blocked from saving other location fields.
- `ORDER_METHOD_LOCATION_SUPPORT_KEYS`'s contents are byte-identical to the map it replaces --
  verified by the full `storeUsecases.applicationResult.test.js` suite (55/55) passing unmodified.

## Verification Evidence

- `apps/dgfy-api/tests/tenantLocationFulfillmentMethodGuard.usecases.test.js` — new, 5/5 passing:
  rejects a transition into both-off in transaction mode; allows delivery-only (Surebiz); allows
  both-off in Catalog Only mode; allows an unrelated edit to an already-both-off location without
  even querying access mode; rejects creating a new location with both off in transaction mode.
- `apps/dgfy-api/tests/orderMethods.crossLayer.contract.test.js` — extended, 4/4 passing: pins
  `STOREFRONT_FULFILLMENT_ORDER_METHODS` to exactly `['delivery', 'pickup']` and confirms every
  `STOREFRONT_ORDER_METHODS` member resolves to a real `ORDER_METHOD_LOCATION_SUPPORT_KEYS` entry.
- `apps/dgfy-api/tests/tenantLocationUsecases.applicationResult.test.js` (8/8),
  `tenantLocationRepository.referenceGuard.test.js` + `tenantLocationReferenceSources.coverage.
  test.js` (5/5), `storeUsecases.applicationResult.test.js` (55/55) — all pass unmodified,
  confirming no regression from the rename or the new guard.
- `node --check` on every changed `apps/dgfy-api` `.js` file.
- `npm run build:store` (`apps/dgfy-storefront`) and `npm run build:skupervisor`
  (`apps/dgfy-ims`) — real Vite builds, both changed frontend apps.
- `npm run check:architecture`, `npm run lint:docs`.

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-1093-STOREFRONT-FULFILLMENT-METHOD-AVAILABILITY`
is expected on a PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`/`main`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.
