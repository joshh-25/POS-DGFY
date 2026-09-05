---
status: reference
owner: engineering
last_reviewed: 2026-09-06
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
  (third dated "## Amendments" block added in this same PR -- the client-derived-variant
  contract, the graceful-ladder trust model, the original-retention resolution, and
  buildBulkCatalogImageUpload's contract change)
declaration_id: 2026-09-06-client-derived-upload-contract
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.06
verification_evidence: see "## Verification Evidence" section below (Tier 0 node --check on every
  changed .js file, the full existing + extended Jest suite for every touched module, no schema
  change, no new dependency)
rollback_note: Plain revert restores today's single-file `image` upload contract end to end -- the
  `.fields()` multer wiring, the optional `image_medium`/`image_thumbnail` fields, and
  `client_image_manifest` are all additive; every existing caller (posCatalogService.js,
  storefrontCatalogService.js, the IMS/POS/storefront UI) keeps sending a bare `image` field today
  and continues to work identically after a revert. No migration, no new endpoint, no permission
  change. The one non-additive change -- `storefrontCatalogImageStorage.js`'s `retainOriginal`
  flipping from `false` to `true` -- reverts cleanly to discarding the raw original again; no data
  is destroyed by reverting (a revert only stops *retaining* future originals, it does not delete
  any already retained).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-265-297-CLIENT-DERIVED-UPLOAD-CONTRACT
---

# Client-derived image upload contract + fan-out to catalog upload services (Phase 297, #265 epic)

## Compliance Impact Classification

Major. Confirmed against `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
before finalizing this declaration -- the only rules this PR's changed files actually trip are:

- `^apps/dgfy-api/src/modules/pos/` -- matches `usecases/posUseCases.js` and
  `repositories/posCatalogImageStorage.js` -> surfaces `pos,terminal`, floor `major`.
- `^apps/dgfy-api/src/routes/pos\.js$` -- matches the `.fields()` multer wiring change at the POS
  single-image catalog route -> surfaces `pos,terminal`, floor `major`.

**`settings` is deliberately not declared.** Neither `apps/dgfy-api/src/modules/settings/`,
`apps/dgfy-api/src/routes/settings.js`, nor `storefrontAssetStorage.js` (the settings/branding
asset uploader) are touched by this phase at all -- confirmed by grep, no compliance rule for
`modules/settings/` matches any file in this diff. Declaring `settings` speculatively (as a rote
copy of the Phase 294 declaration's surface list) would misstate this PR's actual scope; if a
later phase needs a settings-adjacent change, that phase re-verifies and adds the surface then.

**Not `regulatory`**: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, authentication, authorization, or a tenant-admin configuration surface. This
is an image-transport and image-derivation contract change -- new optional multipart fields, a
server-side validation/fast-path for client-pre-optimized variants, and a filename-parsing
extension for bulk uploads -- with every existing single-file behavior preserved unchanged when the
new optional fields are absent (the common case for every caller today).

`apps/dgfy-api/src/modules/inventory/` (storefront catalog changes: `itemHandlers.js`,
`storefrontCatalogUseCases.js`, `storefrontCatalogImageStorage.js`) and
`apps/dgfy-api/src/routes/items.js` are **not covered by any rule** in
`check-compliance-impact.js` -- confirmed by grep, no pattern matches `modules/inventory/` or
`routes/items.js` anywhere in that script. Neither is `apps/dgfy-api/src/modules/shared/utils/`
(where `imageAssetStorage.js`, `imageUploadValidation.js`, and the new
`bulkCatalogImageFilename.js` live) or `apps/dgfy-api/src/config/uploadConfig.js`. Taken alone, the
storefront-catalog half of this phase would not trigger this guardrail at all -- but since the same
PR necessarily also touches `modules/pos/` and `routes/pos.js` (the POS half of the identical
contract), this declaration is still required, floor `major`, driven entirely by the POS-surface
rules above.

## Affected Surfaces

**In scope this phase** (the four endpoints the epic plan named: POS single-image, storefront
single-image, POS bulk-50, storefront bulk-50):

1. **`apps/dgfy-api/src/modules/shared/utils/imageAssetStorage.js`** -- reorders
   `storeOptimizedImageAsset`'s metadata fetch to happen *before* `classifyImageAsset` (a real
   ordering bug fix, not just a refactor: `sourceMimeHint`/`metadata` were added in Phase 296 but
   never actually reachable by the classify call they were meant to feed); wires `sourceMimeHint`
   through; adds the accepted-large fast path (`acceptedAsClientLarge`) and the client-supplied
   medium/thumbnail fast path (`clientVariantFiles`), both fully optional and both first callers of
   the already-merged, already-tested `deriveVariantsFromAcceptedLarge`; adds additive
   `provenance`/`original_source`/`original.source_mime_hint` response fields. `MAX_INPUT_IMAGE_PIXELS`
   moved to `imageUploadValidation.js` as its single source of truth (re-exported from there).
2. **`apps/dgfy-api/src/modules/shared/utils/imageUploadValidation.js`** -- new exports
   `validateClientVariant` (header-only sharp metadata check: format, width, pixel cap, never a
   trust boundary -- a failed variant is discarded, never a request failure) and
   `parseClientImageManifest` (parses the optional `client_image_manifest` text field; a malformed
   or absent manifest resolves to `null`, never throws).
3. **`apps/dgfy-api/src/modules/shared/utils/bulkCatalogImageFilename.js`** (new) -- single source
   of truth for the SKU-stem filename convention (`getSkuStem`, previously duplicated verbatim in
   both `posUseCases.js` and `storefrontCatalogUseCases.js`) and its Phase 297 extension
   (`parseBulkCatalogFilename`, `groupBulkCatalogFilesBySku`): a bare `<SKU>.<ext>` still means
   exactly what it means today; `<SKU>__large/medium/thumbnail.<ext>` is the new opt-in suffix
   convention correlating up to three files per SKU into one upload.
4. **`apps/dgfy-api/src/config/uploadConfig.js`** -- `posCatalogImageUpload` and
   `storefrontCatalogImageUpload` grow `limits.files` from 1 to 3 (still the same
   `buildStrictImageUpload` factory, same per-file byte cap) to admit the two new optional fields
   at the route. The two bulk uploaders and every other exported uploader
   (`storefrontAssetUpload`, `posPaymentProofUpload`, menu-import uploaders) are unchanged.
5. **`apps/dgfy-api/src/routes/pos.js`** (line ~195) and **`apps/dgfy-api/src/routes/items.js`**
   (line ~180) -- the two single-image catalog routes migrate `.single('image')` to
   `.fields([{name:'image'},{name:'image_medium'},{name:'image_thumbnail'}])`. Every other route in
   both files, including the async/queued single-image route at `items.js` (which shares the same
   underlying multer instance but keeps its own `.single('image')` call), is untouched.
6. **`apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`** (`uploadCatalogImage`) and
   **`apps/dgfy-api/src/modules/inventory/controllers/itemHandlers.js`**
   (`uploadStorefrontCatalogImage`) -- read `req.files` (the `.fields()` shape) instead of
   `req.file`, and forward a parsed `client_image_manifest`.
7. **`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`** -- `buildUploadPosCatalogImageUseCase`
   accepts either the legacy singular `file` or the new `files`/`clientImageManifest` shape (no
   existing caller needs to change); `buildUploadBulkPosCatalogImagesUseCase` is restructured to
   group the batch by SKU (via the new shared helper) before processing, still exactly one
   `imageStorage.store()` call per bare `<SKU>.<ext>` file as today. New failure code
   `duplicate_variant_for_sku`, distinct from the existing `duplicate_filename` (which still fires,
   unchanged, for two bare files sharing a stem).
8. **`apps/dgfy-api/src/modules/inventory/usecases/storefrontCatalogUseCases.js`** -- mirror of
   item 7 for `buildUploadStorefrontCatalogImageUseCase` (also keeps `itemImageWorker.js`'s
   existing singular-`file` call working unchanged -- that AI-image-generation path is untouched)
   and `buildUploadBulkStorefrontCatalogImagesUseCase`. The gallery use cases
   (`buildUploadStorefrontCatalogGalleryImagesUseCase`, `queueStorefrontCatalogImage`,
   `queueStorefrontCatalogGalleryImages`) in this same file are **not touched**.
9. **`apps/dgfy-api/src/modules/pos/repositories/posCatalogImageStorage.js`** and
   **`apps/dgfy-api/src/modules/inventory/repositories/storefrontCatalogImageStorage.js`** --
   `.store()` grows the same three optional params (`sourceMimeHint`, `acceptedAsClientLarge`,
   `clientVariantFiles`), threaded straight through to `storeOptimizedImageAsset`.
   `storefrontCatalogImageStorage.js` additionally flips `retainOriginal` from the previous
   unconditional `false` to `true` -- see "Original-retention resolution" below.

**Explicitly out of scope this phase** (confirmed untouched, restated so a reviewer doesn't go
looking for them): `settingsHandlers.js` / `storefrontAssetStorage.js` / `routes/settings.js`;
`posPaymentProofStorage.js` / `uploadOrderBalancePaymentProof`; `menuImportController.js` /
`menuImportService.js`; the gallery/async endpoints in `itemHandlers.js`
(`queueStorefrontCatalogImage`, `queueStorefrontCatalogGalleryImages`,
`uploadStorefrontCatalogGalleryImages`, `itemImageWorker.js`,
`workers/catalogImageUploadWorker.js`); any `packages/web-core`, `apps/dgfy-ims`, `apps/dgfy-pos`,
or `apps/dgfy-storefront` frontend file (zero client wiring this phase -- the client encoder module
that would actually populate the new optional fields for real traffic is a separate, later phase).

## Original-retention resolution (#265 epic decision)

Resolved: keyed off which storage module handles the call, **not** a new client-sent signal.
`storefrontCatalogImageStorage.js`'s `.store()` now passes `retainOriginal: true` to
`storeOptimizedImageAsset` (storefront-catalog-image uploads are IMS's managed surface);
`posCatalogImageStorage.js` keeps `retainOriginal: false` (POS terminals stay capped). No new
multipart field, no new client-sent origin signal -- this is purely which storage module is called,
already determined today by which endpoint received the request. Recorded as the third dated
`## Amendments` block on ADR 0017 (see `related_adr` above).

## Compliance Preconditions

1. **No new auth/permission path.** Every touched endpoint keeps its existing
   `checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS)` gate, unchanged. The multer
   `.fields()` migration and the new optional fields are transport-shape changes only; permission
   checks happen after multer in the same middleware chain, unmoved.
2. **No schema change, no migration.** No new columns, no new tables. The new
   `client_image_manifest` field is an ephemeral multipart text part, never persisted; the new
   `provenance` / `original_source` / `source_mime_hint` fields are additive keys inside the
   already-existing `asset.json` per-asset manifest file and the already-existing use-case response
   payloads.
3. **Graceful-ladder trust model preserved.** `validateClientVariant` never fails a request -- a
   rejected client-supplied variant is discarded and the server falls back to deriving that variant
   itself, exactly today's behavior. `parseClientImageManifest` never throws on malformed input.
   Confirmed by test: `imageUploadValidation.util.test.js`'s existing `mime_signature_mismatch`
   test (verbatim, unmodified) still passes, proving that trust boundary didn't move.
4. **Bulk backward compatibility.** A bare `<SKU>.<ext>` filename (today's only format) is
   confirmed, by test, to produce byte-identical grouping/summary/result behavior to before this
   phase -- including the existing `duplicate_filename` status for two bare files sharing a stem,
   which is preserved unchanged and not reclassified as the new `duplicate_variant_for_sku`.

## Verification Evidence

- `node --check` on all 12 changed/new `apps/dgfy-api` `.js` files -- this app has no real build
  step (`build` script is a no-op), so this is Tier 0's stated minimum.
- Full existing Jest suites for every touched module, run unmodified and re-run after every edit:
  `imageAssetStorage.util.test.js`, `imageUploadValidation.util.test.js`,
  `posUsecases.applicationResult.test.js`, `storefrontCatalogUseCases.test.js`,
  `posHandlers.transport.test.js`, `itemHandlers.transport.test.js`,
  `storefrontCatalogImagePersistence.integration.test.js` -- all pass except one pre-existing,
  unrelated flake (see "## Residual Risks").
- New/extended tests added this phase (see the PR's own Testing Evidence section for pass counts):
  classification-ordering regression test, 5 accepted-large-path tests, 5 `validateClientVariant`
  tests, 6 `.fields()` multipart transport tests (3 per controller), 13 pure
  `bulkCatalogImageFilename` unit tests, 4 bulk-use-case variant-grouping integration tests (2 pos,
  2 storefront).
- `node scripts/check-app-version-bump.js --staged` -- confirms the `dgfy-api` 1.4.0 -> 1.5.0 bump.
- `npm run check:architecture`, `npm run check:compliance`, `npm run lint:docs` / `check:adr` --
  confirm this declaration and the ADR 0017 amendment don't trip anything else.

## Residual Risks

1. **Pre-existing, unrelated test flake** (not introduced by this phase, reproduced identically
   against an unmodified `origin/develop` checkout in isolation):
   `storefrontCatalogImagePersistence.integration.test.js`'s single test calls
   `storeOptimizedImageAsset` (via the real, unmocked `storefrontCatalogImageStorage`) twice in one
   run under `--runInBand`, producing two different `asset_id`s and failing the path-equality
   assertion. Confirmed reproducible against a clean `origin/develop` worktree with zero
   modifications from this PR -- flagged here as a pre-existing gap for `pm`/a future session to
   investigate, not fixed in this PR (out of scope).
2. **This phase ships an unused capability from the client's point of view** until the separate,
   future client-encoder phase wires a real caller to `image_medium` / `image_thumbnail` /
   `client_image_manifest`. Every existing caller keeps sending a bare `image` field; the
   accepted-large and client-variant fast paths are exercised only by this PR's own tests today.
3. **Gallery (5-photo) uploads and the async/queued upload path are entirely unaffected** by this
   PR, by design -- they keep running today's full server-side derivation path unchanged. Any
   future phase that extends the client-derived contract to those paths is materially more work
   (up to 15 files per request across 5 gallery slots x 3 size variants) and should be scoped and
   declared separately, not folded in silently.
4. **A merge-conflict is expected on `apps/dgfy-api/package.json`'s single `"version"` line** when
   this PR merges into `develop` -- `develop` advanced to `dgfy-api` 1.4.1 (an unrelated patch bump)
   after this branch was cut from `03bff70f2`; this PR's `1.4.0 -> 1.5.0` bump still satisfies
   `check-app-version-bump.js`'s `any-increase` mode against develop's current tip (1.4.1 < 1.5.0),
   the conflict is a single trivial line, not a real design conflict.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-265-297-CLIENT-DERIVED-UPLOAD-CONTRACT`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` reconciles this after merge.
