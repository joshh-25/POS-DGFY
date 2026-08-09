---
status: reference
owner: engineering
last_reviewed: 2026-08-09
declaration_id: 2026-08-09-store-template-writepath-hardening
classification: major
surfaces: settings,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.09
verification_evidence: settingsUsecases.applicationResult.test.js,applyTemplateToTenantUseCase.test.js,applyTemplateToTenantUseCase.cacheInvalidation.test.js,resolveStoreProfile.usecase.test.js,tenantProvisioningStoreProfileProvenance.test.js,fnbKitchenQueueTemplateGate.route.test.js,storeProfile.equivalence.contract.test.js,modeItemTaxonomy.contract.test.js,WorkflowModeContext.profile.test.jsx,check:architecture
rollback_note: Revert the cache-invalidation calls, the two new validation checks (CAPABILITY_SELECTION_CONTRADICTORY, the re-validated materialized selection in applyTemplateToTenantUseCase), and the POSCheckoutTerminal.jsx/TerminalPageLayout.jsx/TerminalPage.jsx effectiveCapabilities threading together with this declaration -- they were verified and reviewed as one batch. Each falls back to its pre-change behavior (writes still succeed; caches simply stay stale for their existing TTL; the POS terminal falls back to mode-only panel resolution) -- no data migration, no schema change, nothing to unwind.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-09T00:00:00+08:00
preflight_request_ref: STORE-TEMPLATES-PHASE20-23-20260809
---

# Store Template Write-Path Hardening (issue #178 Phases 20-23)

## Compliance Impact Classification

Major, per the classification matrix's floor for both
`backend/src/modules/settings/**` and `frontend/src/features/pos/**`. Two
files under the settings path are touched: `updateSettingsUseCase.js` gains a
stricter rejection (a capability requested in both the enabled and disabled
overlays at once is now rejected outright, where it previously resolved
silently), and `resolveStoreProfile.js` gains a cache-clear export plus
documentation corrections. Three files under the POS surface are touched —
`POSCheckoutTerminal.jsx`, `TerminalPageLayout.jsx`, `TerminalPage.jsx` — to
thread the tenant's effective capability set into the terminal's workflow
resolver, so a curated (subtractive) template renders the correct POS panel.
No fiscal, VAT, or payment logic in either surface is touched — this is
validation strictness, cache freshness, and terminal-panel rendering for the
existing `ops_workflow_mode` / `ops_enabled_capabilities` /
`ops_disabled_capabilities` / `ops_store_profile_read` settings, which this
same ADR 0056 / issue #178 arc already governs.

## Affected Surfaces

1. `updateSettingsUseCase.js` and `updateSettingByKeyUseCase.js` now reject a
   write that would leave a capability in both the enabled and disabled overlays
   at once (`CAPABILITY_SELECTION_CONTRADICTORY`, 422) — previously this resolved
   silently via `resolveEffectiveCapabilities`'s subtraction-wins ordering. The
   resolved *effective* set is unchanged (subtraction still wins); only the
   contradictory *request* is now rejected instead of silently accepted.
2. `applyTemplateToTenantUseCase.js` now re-validates the materialized
   `{mode, enabled, disabled}` selection against `validateModuleSelection()`
   before persisting it, and normalizes the resolved workflow mode rather than
   trusting a template row's `base_mode` verbatim.
3. Three settings write paths (`updateSettingsUseCase`, `updateSettingByKeyUseCase`,
   `applyTemplateToTenantUseCase`) now clear the capability-gate cache, the Store
   Profile resolver's cache, and item-taxonomy validation's settings cache
   whenever a write touches one of the four capability-cache-sensitive setting
   keys — closing a staleness window (up to 15s / 5min) where a just-applied
   change would not yet be visible to the next request.
4. `resolveStoreProfile.js`'s and `storeProfile.js`'s doc comments are corrected
   to state that the resolver is wired to `requireWorkflowCapability` (issue #178
   Phase 19) rather than the pre-Phase-19 "not wired to any consumer yet"
   language — a documentation-only change with no runtime effect.
5. **POS surface.** `resolvePosWorkflow(mode, effectiveCapabilities)`
   (`packages/shared-constants/src/posWorkflows.js`) gains an optional second
   argument: an fnb-family store whose effective capabilities are missing
   both `tableService` and `kitchenQueue` now resolves to the existing
   `POS_WORKFLOW_CONFIGS.counter` UI config instead of the full-service `fnb`
   one. `POSCheckoutTerminal.jsx` reads `profile.modules` (via a new
   `effectiveCapabilities` prop, prop-drilled through `TerminalPageLayout.jsx`
   from `TerminalPage.jsx`) and passes it into the resolver. This is a
   **presentation-only** change — which POS panel/buttons render — not a
   change to what the backend accepts or how a transaction is priced,
   recorded, or fiscalized. The backend capability gate (Phase 19, unchanged
   here) already enforces the same subtraction independently; this closes the
   gap where the terminal rendered a panel the backend would then 403.
   Omitting the new prop/argument (every pre-existing caller) preserves
   exact prior behavior.

## Compliance Preconditions

1. No fiscal, VAT, payment, or receipt logic is touched — this is entirely
   within the workflow-mode / capability-overlay settings surface issue #178 has
   governed since Phase 6.
2. The fail-closed guarantee is unaffected: every new rejection path returns a
   422 through the same `DomainError` -> `fail()` contract every other settings
   validation failure already uses; no new "allow on error" branch is
   introduced anywhere.
3. `fiscalProfile` and `customerAccessMode` (the catalog's two `locked` modules)
   remain unreachable by any of these write paths — neither belongs to
   `ALL_WORKFLOW_CAPABILITIES`, so neither can appear in a contradictory-write
   rejection or a materialized template selection in the first place.
4. The contradictory-write rejection is strictly narrower than the previous
   behavior (it rejects a request the write path used to silently accept) — no
   previously-accepted, non-contradictory write is newly rejected.
5. The POS panel change never affects checkout, payment, discount, tax, or
   receipt logic — `POSCheckoutTerminal.jsx`'s own checkout/payment code
   paths are untouched; only which vertical panel (dining floor vs. counter)
   is shown before checkout begins.

## Verification Evidence

1. `backend/tests/settingsUsecases.applicationResult.test.js` — full suite (71
   tests) green, including two new `CAPABILITY_SELECTION_CONTRADICTORY` cases
   (bulk and single-key write paths).
2. `backend/tests/applyTemplateToTenantUseCase.test.js` (7 tests) and the new
   `backend/tests/applyTemplateToTenantUseCase.cacheInvalidation.test.js` (4
   tests) — cache invalidation on success, no invalidation on a rejected write,
   the new `CAPABILITY_SELECTION_UNBUILDABLE` rejection path, and `base_mode`
   normalization.
3. `backend/tests/tenantProvisioningStoreProfileProvenance.test.js` — the ADR
   0056 clause 2 (no-dereference) acceptance criterion, rewritten to resolve
   through `resolveStoreProfile()` end-to-end and assert the template repository
   is never called during the read.
4. `backend/tests/fnbKitchenQueueTemplateGate.route.test.js` — the real
   `requireWorkflowCapability` mounted exactly as `routes/fnb.js` wires it,
   proving two differently-templated tenants get different real 200/403
   outcomes.
5. `backend/tests/storeProfile.equivalence.contract.test.js` — a
   counter-service Profile resolves `pos_workflow.mode === 'counter'`; a
   full-service fnb tenant and a hospitality tenant are unaffected
   (zero-behavior-change controls).
6. `frontend/src/features/settings/__tests__/WorkflowModeContext.profile.test.jsx`
   — `hasCapability` honors the disabled overlay, the consumer
   `PosPageShell.jsx`'s panel rendering depends on.
7. `npm run check:architecture` passed (46 modules / 451 files; 84 controller
   files, no unauthorized model imports).
8. `npm run check:compliance -- --staged` passed with this declaration staged
   alongside the settings-module and POS-surface changes it covers.
