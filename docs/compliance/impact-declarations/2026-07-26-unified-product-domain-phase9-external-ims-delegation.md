---
declaration_id: 2026-07-26-unified-product-domain-phase9-external-ims-delegation
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: INVENTORY_COMMAND_PORT_UNWIRED,TRACKING_MODE_REQUIRES_DELEGATED_INVENTORY_AUTHORITY,INVENTORY_AUTHORITY_DELEGATED_DENIED
policy_version: 2026.07.26
verification_evidence: architecture_and_controller_boundary_checks,lint_docs,compat_seams_check,targeted_backend_tests,full_backend_suite_ab_diff
rollback_note: Revert this PR's commits. inventory_authority defaults to 'platform' for every tenant (no data migration involved), so no tenant is left in a delegated state; the new items/purchaseOrders route gate and posUseCases DI change are both no-ops for every tenant already at the default, so reverting is a pure code rollback with no data cleanup required.
preflight_result: no_breach
preflight_reason_code: EXTERNAL_IMS_DELEGATION_LOCAL_LEDGER_PRESERVED
preflight_run_at: 2026-07-26T00:00:00Z
preflight_request_ref: PHASE9-UNIFIED-PRODUCT-DOMAIN-EXTERNAL-IMS
---

# Unified Product Domain Phase 9: external_ims Delegation Compliance Impact

## Compliance Impact Classification
Classified as `major` because it touches the `pos` surface (`backend/src/modules/pos/usecases/posUseCases.js`) and the `settings` surface (`backend/src/modules/settings/usecases/updateSettingsUseCase.js`, `updateSettingByKeyUseCase.js`, `backend/src/modules/settings/repositories/settingsRepository.js`). It does not touch `payments` or `compliance` modules and does not change any fiscal/receipt/e-sales behavior, so it does not reach the `regulatory` floor.

The `pos` surface change is a dependency-injection hardening, not a behavior change for any currently-wired tenant: it removes an `inventoryCommandService || stockMovementService` fallback from three POS use-case builders (`buildCheckoutPosUseCase`, `buildVoidPosTransactionUseCase`, `buildUpdateOnlineOrderStatusUseCase`). Production wiring (`pos/index.js`) already only ever supplied `inventoryCommandService`, so removing the unused fallback parameter changes nothing for any real tenant; it only removes a code path that could have silently substituted a different stock-writing implementation if the DI container were ever mis-wired in the future.

The `settings` surface change adds one new master-admin-gated tenant setting, `inventory_authority` (values `platform` default / `external_ims`), mirroring the existing `ops_enabled_capabilities` governance shape exactly (same authorization gate shape, same Joi validation pattern, same normalizer pattern). No existing tenant's stored settings change; every tenant continues to resolve `inventory_authority` to `platform` until a master admin explicitly delegates it.

## Affected Surfaces
- POS checkout/void/online-order-status use cases (`posUseCases.js`) - DI fallback removed, no behavior change for existing wiring.
- Settings bulk-update and single-key-update use cases - new `inventory_authority` key, master-admin write gate, Joi validation.
- Items and Purchase Orders write routes gain a new tenant-setting-driven middleware (`requireLocalInventoryLedgerOwnership`) that is a no-op unless a tenant has explicitly set `inventory_authority` to `external_ims` (not yet possible for any existing tenant prior to this PR).
- Item create/update/finalize use cases gain a new authorization check that only fires when a caller explicitly sets `tracking_mode: 'external_ims'` on an item, gated on the same `inventory_authority` setting.

## Compliance Preconditions
- `inventory_authority` write path requires `actorUser.is_master_admin === true` (both the bulk `updateSettingsUseCase` and single-key `updateSettingByKeyUseCase` paths), matching the existing `ops_enabled_capabilities`/`ops_workflow_mode` precedent.
- `tracking_mode: 'external_ims'` on an item is rejected (422, `TRACKING_MODE_REQUIRES_DELEGATED_INVENTORY_AUTHORITY`) unless the tenant's `inventory_authority` is already `external_ims`.
- Every local ledger write invariant is preserved: `stockBearingPolicy.js`'s new `external_ims` descriptor branch keeps `tracks_quantity` and `emits_movements` mandatorily `true`, so POS/Storefront checkout still writes a local `stock_movements` row for a delegated item in the same transaction as the sale (ADR 0014) - this PR does not let any tenant skip the local audit trail.
- The new `requireLocalInventoryLedgerOwnership` middleware fails closed (403, `INVENTORY_AUTHORITY_DELEGATED_DENIED`) rather than silently allowing a local stock write to proceed when a tenant has delegated inventory authority, and the DI hardening in `posUseCases.js`/`receivePurchaseOrderUseCase.js` fails closed (409, `INVENTORY_COMMAND_PORT_UNWIRED`) rather than silently falling back to a different write path when the inventory stock-command port is mis-wired.

## Verification Evidence
- `npm run check:architecture` (guardrails + controller boundaries) - PASS.
- `npm run lint:docs` - PASS.
- `npm run check:compat-seams` - PASS (0 seams; no `@compat-seam` marker was needed - see the PR description for why).
- Targeted backend tests for every touched/added file (`stockBearingPolicy.test.js`, `modeFinancialTracking.contract.test.js`, `settingsUsecases.applicationResult.test.js`, `purchaseOrderUsecases.applicationResult.test.js`, `posCheckoutFnbContracts.usecase.test.js`, `posOperationReplayParity.usecase.test.js`, `posUsecases.applicationResult.test.js`, `itemUseCasesInventoryAuthorityGate.test.js`, `delegatedInventoryLookup.test.js`, `inventoryAuthorityGate.test.js`, `itemsCategoryRoutes.contract.test.js`) - all passing.
- Full backend suite run twice (with changes vs. `git stash` baseline on `origin/develop`) and diffed by failing-suite name: identical failing-suite set except one pre-existing failure (`modeFinancialTracking.contract.test.js`) that this PR fixes as a documented drive-by; zero new failures introduced across 2072 tests.
