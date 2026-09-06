---
status: reference
owner: engineering
last_reviewed: 2026-09-09
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
  (fourth dated "## Amendments" block added in this same PR -- the image_client_conversion
  rollout flag, the corrected scope-token ladder, and the platform-admin write gate)
declaration_id: 2026-09-09-rollout-ladder-kill-switch
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.09.09
verification_evidence: see "## Verification Evidence" section below (Tier 0 node --check on
  every changed .js file, the full existing + extended Jest suite for every touched module,
  the extended Vitest suite for every touched web-core module, one new migration, no new
  dependency)
rollback_note: Plain revert restores today's inert Phase 296 stub end to end -- the gate is
  additive at every layer (new optional storeOptimizedImageAsset params, a new settings-repository
  DI param defaulting to null, a new client getter export). The one non-additive state is the two
  seeded system_settings rows themselves; a revert leaves them in place (harmless -- nothing reads
  them once the gate code is gone) rather than deleting tenant data via the migration's `down()`.
  No existing caller's behavior changes on revert: the flag was already 'off' by default before
  this PR and stays 'off' after a revert removes the write path, so every request keeps taking
  today's server-derivation path.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-09T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-265-298-ROLLOUT-LADDER-KILL-SWITCH
---

# Rollout ladder, server-authoritative kill switch, and fallback-rate measurement for
client-side image conversion (Phase 302, #265 epic, PR 5 of 5)

## Compliance Impact Classification

Major. Confirmed against `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
before finalizing this declaration (`GITHUB_BASE_REF=develop npm run check:compliance`, not just
read from the plan doc's line numbers, which had drifted) -- the rules this PR's changed files
actually trip:

- `^apps/dgfy-api/src/modules/pos/` -- matches `usecases/posUseCases.js`,
  `repositories/posCatalogImageStorage.js`, and `index.js` -> surfaces `pos,terminal`, floor
  `major`.
- `^apps/dgfy-api/src/modules/settings/` -- matches
  `usecases/updateSettingByKeyUseCase.js` and `usecases/updateSettingsUseCase.js` -> surfaces
  `settings`, floor `major`. **This corrects PR4's own declaration**, which cited the narrower
  `^apps/dgfy-api/src/routes/settings\.js$` rule as the only settings-adjacent trigger and
  deliberately left `settings` undeclared because that PR touched neither file. This PR is
  different: it adds a real platform-admin write gate inside the settings *usecases* layer
  itself, which the broader `modules/settings/` rule (a separate, pre-existing entry in the same
  rule table) catches directly -- confirmed live, not assumed from the plan doc.

**Not `regulatory`**: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, authentication, or tenant-provisioning. The settings-layer change is a
write-authorization check for one specific config key pair (mirroring the existing
`isPlatformControlledPosSoftwareKey` precedent exactly), not a new compliance/regulatory surface.

**`apps/dgfy-api/src/modules/inventory/`** (the storefront-catalog gate half:
`storefrontCatalogUseCases.js`, `storefrontCatalogImageStorage.js`, `index.js`) is **not covered
by any rule** in `check-compliance-impact.js` -- confirmed by grep, same as PR4's own finding.
Declared anyway, floor `major`, driven entirely by the `pos`/`settings` rules above (the same PR
also touches both).

**`packages/web-core`** (the client-side flag, both service wirings, `WorkflowModeContext.jsx`)
is not matched by any rule either -- no `services/`-scoped rule names
`posCatalogService.js`/`storefrontCatalogService.js`, and no rule scopes
`features/settings/WorkflowModeContext.jsx`. The client-side change alone adds no new surface
beyond what the backend touches already add.

## Affected Surfaces

1. **New: `apps/dgfy-api/src/modules/shared/utils/imageClientConversionGate.js`** -- resolves the
   effective gate (`enabled`/`mode`/`scope`) for one of four scope tokens
   (`pos_catalog_single`, `storefront_catalog_single`, `pos_catalog_bulk`,
   `storefront_catalog_bulk`) from the two new `system_settings` keys. Fails safe to closed for
   any unreadable, missing, or malformed state.
2. **`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`** --
   `buildUploadPosCatalogImageUseCase` gates `mediumFile`/`thumbnailFile`/`clientImageManifest` to
   null before they reach `imageStorage.store()` when the gate is closed for
   `pos_catalog_single`. Threads the resolved `mode`/`scope` through for logging.
3. **`apps/dgfy-api/src/modules/inventory/usecases/storefrontCatalogUseCases.js`** -- mirror of
   item 2 for `buildUploadStorefrontCatalogImageUseCase`, scoped to `storefront_catalog_single`.
4. **`apps/dgfy-api/src/modules/pos/index.js`** and **`apps/dgfy-api/src/modules/inventory/index.js`**
   -- static `settingsRepository` import + DI wiring. Verified safe before choosing static over
   dynamic: `posUseCases.js` (line 6) and `itemRepository.js` (line 5) already statically import
   from `modules/settings/index.js` with no reverse cycle -- the only settings->inventory imports
   in this codebase are the existing, deliberately-dynamic ones in `updateSettingsUseCase.js`/
   `updateSettingByKeyUseCase.js` (a different direction, for a different purpose:
   `clearItemRepositorySettingsCache`).
5. **`apps/dgfy-api/src/modules/settings/usecases/updateSettingByKeyUseCase.js`** and
   **`updateSettingsUseCase.js`** -- both reject a non-platform-admin actor writing
   `image_client_conversion`/`image_client_conversion_scopes`, mirroring the existing
   `isPlatformControlledPosSoftwareKey` gate exactly (single-key and bulk write paths both
   covered, so a tenant can't bypass the single-key protection via `PUT /settings`).
6. **`apps/dgfy-api/src/modules/shared/utils/imageAssetStorage.js`** -- `storeOptimizedImageAsset`
   gains two additive, optional, observability-only params
   (`imageClientConversionState`/`imageClientConversionScope`), logged on the existing
   Phase 294 `storeOptimizedImageAsset completed` line. No behavior change for any pre-existing
   caller that omits them.
7. **`apps/dgfy-api/src/modules/pos/repositories/posCatalogImageStorage.js`** and
   **`apps/dgfy-api/src/modules/inventory/repositories/storefrontCatalogImageStorage.js`** --
   thread the same two new params through, unchanged otherwise.
8. **New migration**: `apps/dgfy-migration-runner/migrations/20260909000002-add-image-client-conversion-settings.cjs`
   -- seeds `image_client_conversion` ('off') and `image_client_conversion_scopes` ('[]'),
   modeled directly on `20260503000001-add-customer-access-mode-settings.cjs`'s idempotent
   upsert pattern.
9. **`packages/web-core/src/utils/imageEncoding/rolloutFlag.js`** -- real getter/setter,
   replacing the Phase 296 inert stub. `getImageClientConversionFlag()` keeps its existing
   zero-arg contract; adds `isImageClientConversionEnabledForScope(scope)` as a second, additive
   export.
10. **`packages/web-core/src/services/posCatalogService.js`** -- switched to the scoped getter.
    **`packages/web-core/src/services/storefrontCatalogService.js`** -- new wiring for
    `uploadStorefrontCatalogImage`, mirroring `posCatalogService.js` exactly.
11. **New: `packages/web-core/src/utils/imageEncoding/reportDegradation.js`** -- emits the
    client-side fallback-rate PostHog event via the existing `analyticsClient.js` `trackEvent`.
12. **`packages/web-core/src/features/settings/WorkflowModeContext.jsx`** -- calls the new setter
    from every branch of its existing `refreshWorkflowMode`/`handleAuthLogout` flow, populating
    the flag from the same bootstrap `/settings` response `identifySentryUser`/
    `setAnalyticsContext` are already populated from.

**Explicitly out of scope this phase** (298d, deferred to a follow-up issue, confirmed
untouched): `posCatalogService.js`'s `uploadBulkPosCatalogImages`,
`storefrontCatalogService.js`'s `uploadStorefrontCatalogImages`, any byte-based batch splitter, and
any bulk-endpoint gate logic beyond the two scope tokens (`pos_catalog_bulk`/
`storefront_catalog_bulk`) already defined as valid tokens for that follow-up to consume.

## Compliance Preconditions

1. **No new auth/permission path for image uploads.** Every touched upload endpoint keeps its
   existing permission gate unchanged; the new gate sits entirely inside the
   client-variant-acceptance decision, not the request-authorization decision.
2. **A new, narrow auth path for settings writes** -- the platform-admin gate on the two new
   keys -- is additive and mirrors an already-shipped, already-tested pattern
   (`isPlatformControlledPosSoftwareKey`) exactly; it does not change authorization for any other
   setting key.
3. **Fail-safe-default, verified by test.** An unset/never-migrated settings row, an unreadable
   settings repository, a thrown settings read, and an unrecognized mode value all resolve to
   closed/`'off'` -- both server-side (`imageClientConversionGate.util.test.js`) and client-side
   (`rolloutFlag.test.js`).
4. **"Ignores the manifest and extra parts entirely" contract, verified by test.** With the gate
   closed, a request carrying `image_medium`/`image_thumbnail`/`client_image_manifest` is stored
   with the exact same `imageStorage.store()` call shape as a bare `image`-only request --
   `posUsecases.applicationResult.test.js` and `storefrontCatalogUseCases.test.js` both cover this
   explicitly, plus the `'opt_in'`-with-excluded-scope case and the no-settingsRepository
   fail-safe case.
5. **No schema change beyond the new settings rows.** No new columns, no new tables besides the
   two `system_settings` rows the migration seeds.

## Verification Evidence

- `node --check` on all changed/new `apps/dgfy-api` `.js` files -- this app has no real build step
  (`build` script is a no-op), so this is Tier 0's stated minimum.
- Full existing + new Jest suites for every touched module:
  `imageClientConversionGate.util.test.js` (new, 10 cases), `posUsecases.applicationResult.test.js`
  (4 new gate cases added), `storefrontCatalogUseCases.test.js` (4 new gate cases added),
  `settingsUsecases.applicationResult.test.js` (4 new write-gate cases added) -- all pass.
  `imageAssetStorage.util.test.js` and `storefrontCatalogImagePersistence.integration.test.js`
  re-run unmodified: the latter's one failure is a pre-existing, unrelated flake (see "## Residual
  Risks" -- already documented against a clean `origin/develop` checkout in PR4's own declaration;
  re-confirmed here against this PR's branch and, separately, against a fresh `origin/develop`
  worktree, both fail identically).
- New/extended Vitest suites for every touched `packages/web-core` module:
  `rolloutFlag.test.js` (new, 9 cases), `posCatalogService.imageEncoding.test.js` (extended, +1
  degradation-metric case, existing 3 cases updated to the new scoped-getter mock shape),
  `storefrontCatalogService.imageEncoding.test.js` (new, 4 cases) -- all pass, plus the full
  existing `dgfy-ims` Vitest suite (2217 tests, 347 files) re-run clean, confirming
  `WorkflowModeContext.jsx`'s existing tests are unaffected.
- `GITHUB_BASE_REF=develop node scripts/check-app-version-bump.js` -- confirms `dgfy-api`
  1.5.0 -> 1.6.0, `dgfy-ims` 1.3.0 -> 1.4.0 (both direct, real behavior change),
  `dgfy-migration-runner` 1.1.3 -> 1.1.4 (direct, new migration), `dgfy-pos` 1.3.0 -> 1.3.1 and
  `dgfy-storefront` 1.4.0 -> 1.4.1 (both fan-out-only via `packages/web-core` -- neither app's own
  bundle imports any changed web-core file, confirmed by grep, but the check is conservative about
  the shared dependency graph regardless of tree-shaking, per its own design; patch-bumped rather
  than argued with).
- `npm run check:architecture`, `npm run check:compliance` (this declaration), `npm run check:adr`
  -- confirm this declaration and the ADR 0017 amendment don't trip anything else.

## Residual Risks

1. **Pre-existing, unrelated test flake** (not introduced by this PR, already flagged in PR4's own
   declaration, re-confirmed here): `storefrontCatalogImagePersistence.integration.test.js`'s
   single test calls `storeOptimizedImageAsset` twice in one run under `--runInBand`, producing
   two different `asset_id`s and failing a path-equality assertion. Reproduced identically against
   a clean `origin/develop` worktree with zero modifications from this PR.
2. **`imageLifecycleFullValidation.test.js` asserts a stale `-v2-` asset-path substring** --
   `RESPONSIVE_ASSET_VERSION` is already `3` on `origin/develop` (unrelated to this PR, from the
   Phase 296/301 AVIF-deprecation work), so this test already fails identically pre-existing.
   Flagged here rather than silently worked around.
3. **298d (bulk client wiring) is out of scope**, tracked in a new follow-up issue filed alongside
   this PR (see the PR body's "Deferred to follow-up" note for the issue number) -- the two bulk
   scope tokens are valid, gate-resolvable values today but have no client caller yet.
4. **This PR's own ladder needs a real production observation period** (298b -> c -> e, each
   watched via the `image_client_conversion_state`/`_scope`-tagged structured log vs. the client
   `trackEvent` degradation signal) before the terminal `'on'` state is safe -- this PR ships the
   mechanism, not the observed rollout itself.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-265-298-ROLLOUT-LADDER-KILL-SWITCH`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` reconciles this after merge.
