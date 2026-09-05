---
status: reference
owner: engineering
last_reviewed: 2026-09-05
related_adr: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
  (cited for context, no amendment made -- this PR enforces the existing "## Hosted POS Image
  Delivery And Navigation Addendum (2026-07-23)" clause, "POS catalog cards request the thumbnail
  variant," at render sites that were not honoring it; it does not change the clause itself, so no
  `## Amendments` block is needed per ADR 0039's tiers)
declaration_id: 2026-09-05-pos-thumbnail-render-fix-and-storefront-fallback
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: see "## Verification Evidence" section below (Tier 0 builds + syntax
  checks + governance scripts -- no ADR file itself is edited, no schema change, no new dependency)
rollback_note: Plain revert restores today's flat-image render (a raw `<img src>` at each touched
  site) and, on the backend, the pre-#218 `pos_image_url`-only response shape from
  `listCatalogOverrides` and `resolveCatalogScan` (no `storefront_image_url` fallback, no
  `pos_image_source`). No schema change, no migration, no new endpoint, no new permission path --
  every field this PR adds is additive on existing response payloads.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T21:00:00.000Z
preflight_request_ref: NOT-EXECUTED-265-218-POS-IMAGE-RENDER-FIX
---

# POS thumbnail render fix + storefront-fallback for #218 (Phase 294, PR 1 of the #265 epic)

## Compliance Impact Classification

Major. Confirmed against `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` before
finalizing this declaration -- the only rules this PR's changed files actually trip are:

- `^apps/dgfy-api/src/modules/pos/` (`posRepository.js`) -> surfaces `pos,terminal`, floor `major`.
- `^packages/web-core/src/features/pos/` (`POSCheckoutTerminalView.jsx`,
  `TerminalOperationsWorkspace.jsx`, `SkupervisorPOSCheckoutTerminal.jsx`,
  `POSDiscountWorkspace.jsx`) -> surfaces `pos,terminal`, floor `major`.
- `^apps/dgfy-ims/Pages/Settings\.jsx$` -> surfaces `settings`, floor `major`.

None of `packages/web-core/src/components/media/`, `packages/web-core/src/utils/`,
`packages/web-core/Components/items/`, `packages/web-core/Components/products/wizard/`,
`apps/dgfy-storefront/`, or `apps/dgfy-api/src/modules/shared/utils/imageAssetStorage.js` match any
compliance-sensitive rule. `storefront` is not included in `surfaces:` above -- it isn't one of the
five surfaces the live preflight endpoint accepts in the first place
(`docs/compliance/request-time-preflight-protocol.md`'s "Not applicable to live preflight" section:
only `pos, terminal, settings, payments, compliance`).

Not `regulatory`: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, authentication, authorization, or a tenant-admin configuration surface. This
is a rendering/presentation fix (which image variant a slot requests) plus an additive backend
response-field fix (wiring two already-existing helpers into two call sites that were bypassing
them) -- no new write path, no new permission gate, no schema change.

## Affected Surfaces

1. **`packages/web-core/src/components/media/ResponsiveImage.jsx`** (new) -- shared presentational
   `<picture>`/`<img>` shell, no data resolution.
2. **`packages/web-core/src/utils/imageVariantSources.js`** (new) -- generic
   `buildImageVariantSources` primitive for callers with no existing feature-specific resolver.
3. **`packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx`** -- local
   `PosResponsiveImage` deleted, replaced with the shared `ResponsiveImage` shell (no prop-contract
   change at its one call site).
4. **`apps/dgfy-storefront/src/shared/components/storefront/StorefrontResponsiveImage.jsx`** --
   thin-wrapped over `ResponsiveImage`, external `imageSources` prop contract unchanged for every
   existing storefront call site.
5. **`packages/web-core/src/features/inventory/pages/ItemsPage.jsx`** -- threads
   `pos_image_variants`/`storefront_image_variants` through `resolvePosConfig`,
   `resolveStorefrontConfig`, and `normalizeStorefrontGallery`; fixes the one real `<img>` render
   site (the POS-readiness-checklist table's `h-16 w-20` POS-menu cell) that was loading a flat
   1920px `large` image into an 80x64px box.
6. **`packages/web-core/Components/items/StorefrontImageCarousel.jsx`**,
   **`packages/web-core/Components/items/SelectedItemImageCarousel.jsx`** (main image + thumbnail
   strip), **`packages/web-core/Components/items/ItemFormModal.jsx`** (gallery mapper only),
   **`packages/web-core/Components/products/wizard/POSSetupStep.jsx`** (gallery mapper only) --
   same variant-threading pattern; `SelectedItemImageCarousel`'s thumbnail strip was the worst
   byte-per-pixel offender (a full-size image into a 64x56px thumbnail).
7. **`apps/dgfy-ims/Pages/Settings.jsx`** -- storefront branding cover/profile preview `<img>`
   sites swapped to `ResponsiveImage` for shell consistency and the free `onError` source-stripping
   fix; no variant system exists for these flat uploads, so no bandwidth win here.
8. **`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`** --
   `normalizeStorefrontItemGallery`'s gallery mapper threads `variants`; the list-card render
   upgrades from a string `resolveAssetVariantUrl` rewrite to the full
   `resolvePosCatalogImageSources(item)` sources object; the Storefront Media branding section's
   four cover/profile `<img>` sites get the same like-for-like shell swap as Settings.jsx.
9. **`packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`** --
   `CartItemThumbnail`, the add-to-cart toast's resolved string, and the catalog grid card all
   upgrade to `resolvePosCatalogImageSources(item)`.
10. **`packages/web-core/src/features/pos/components/POSDiscountWorkspace.jsx`** -- the discount
    line's tiny thumbnail upgrades to `resolvePosCatalogImageSources(catalogItem)`, with a
    string-based last-resort fallback preserved for the edge case where the line's item has left
    `safeCatalog`.
11. **`apps/dgfy-api/src/modules/pos/repositories/posRepository.js`** (#218) --
    `resolvePosDisplayImage` gains a `.source` field (`'override' | 'storefront' | null`);
    `listCatalogOverrides` and `resolveCatalogScan` now call the already-existing
    `loadStorefrontCatalogImageMap`/`resolvePosDisplayImage` helpers (already correctly wired into
    `applyCatalogOverrides`/`listCatalog` since #871) instead of computing `pos_image_url` inline
    from the override alone -- fixing the bug where a POS item with only a storefront image (no
    POS-specific override) rendered blank on the Items page and on barcode-scan lookup.
12. **`apps/dgfy-api/src/modules/shared/utils/imageAssetStorage.js`** -- adds a structured
    `logger.info` line (8 fields: `asset_id`, `classification`, `source_bytes`, `source_w`,
    `source_h`, `encode_count`, `wall_ms`, `cpu_ms`) at the end of `storeOptimizedImageAsset`'s
    success path, as a pre-change CPU/wall-time baseline ahead of Phase 295's AVIF-drop
    measurement. Success path only -- no log on the `catch` path in this PR.

## Compliance Preconditions

1. **No new auth/permission path.** Every touched frontend call site renders data through the
   existing `pos_visible`/`categories:manage`-gated catalog and item-edit surfaces, unchanged. The
   two backend sites (`listCatalogOverrides`, `resolveCatalogScan`) are unchanged in their
   permission gating -- only their response payload's image fields are corrected.
2. **The POS override-vs-storefront-fallback precedence is an existing, already-documented
   contract**, not a new one: `docs/compliance/impact-declarations/2026-06-15-pos-shared-item-image-gallery.md`
   established "...pos_image_url first, then the shared Storefront catalog primary item image as a
   display fallback... Legacy POS-only image data remains compatible and remains preferred when
   present." This PR extends that precedence to the two sites (`listCatalogOverrides`,
   `resolveCatalogScan`) that were missing it -- it does not change the precedence itself.
3. **No schema change, no migration.** Every new/changed response field (`pos_image_variants`,
   `pos_image_source`, `storefront_image_url`, `storefront_image_variants` on the two backend call
   sites) is derived from data already stored and already returned by `applyCatalogOverrides`
   elsewhere in this same file -- these two sites are brought into line with that existing shape,
   not given a new one.
4. **ADR 0014 is enforced, not amended.** See the `related_adr` front matter key and the dedicated
   section below.

## Why no ADR 0014 amendment

`docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`,
"## Hosted POS Image Delivery And Navigation Addendum (2026-07-23)" (line ~125), already states:
"POS catalog cards request the thumbnail variant." This PR's entire frontend scope is bringing
render sites that were requesting the flat `large`/original image (or a raw string URL with no
variant awareness at all) into compliance with that existing `[default]`-tier clause -- it does not
change what the clause says, so per ADR 0039's tiers no `## Amendments` block is needed. Stated here
explicitly so a reviewer doesn't ask for one.

## Verification Evidence

- `npm run build:pos`, `npm run build:store`, `npm run build:skupervisor` -- all three touch
  `packages/web-core`, consumed by all three frontend apps.
- `node --check` on both changed `apps/dgfy-api` files (`posRepository.js`, `imageAssetStorage.js`)
  -- this app has no real build step (`build` script is a no-op), so this is Tier 0's stated
  minimum.
- `package-lock.json` sync check for each of the three bumped `package.json` files
  (`apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`) -- version-only edits, no dependency
  tree change expected.
- `node scripts/check-app-version-bump.js` -- confirms the three patch bumps satisfy ADR 0081
  Decision 6 for a PR into `develop`.
- `npm run check:architecture`, `npm run check:compliance`, `npm run lint:docs`, `npm run check:adr`
  -- confirm this declaration and the ADR 0014 citation don't trip anything (no ADR file itself is
  edited).

See the PR's own `## Testing Evidence` section for the actual pass/fail results of each of the
above, captured at PR-open time.

## Residual Risks

1. **`ItemCard.jsx`** (`@/components/items/ItemCard`, used at `ItemsPage.jsx`'s grid-view render
   sites) was not investigated -- not named in this task's scope, no line reference given. May have
   its own flat-image render of the same class; flagged as a follow-up candidate, not fixed here.
2. **`TerminalOperationsWorkspace.jsx`'s second `<img>`** (the external barcode-registry product
   preview inside the manual-barcode-entry flow) renders a third-party image with no DGFY variant
   system at all -- confirmed out of scope, same pattern as `ItemFormModal.jsx`'s equivalent
   external-lookup preview, not a variant-threading gap.
3. **`SkupervisorPOSCheckoutTerminal.jsx`'s "POS Menu Image Preview" enlarge modal** shows the
   `thumbnail` variant blown up to `max-h-[70vh]` instead of the `large` variant -- the same class
   of wrong-variant-for-slot bug this PR otherwise fixes, deliberately left unfixed because it was
   not in the named scope. Cheap follow-up.
4. **`PosAddToCartToastContainer.jsx`'s toast thumbnail** stays a flat resolved string
   (`resolvePosCatalogImageSources(item).src`), not a full sources object -- deliberately excluded
   (low-value target, would require touching an unlisted component).
5. **Four independent, hand-patched copies of the same gallery-normalizing mapper** now exist
   (`ItemsPage.jsx`, `ItemFormModal.jsx`, `POSSetupStep.jsx`, `TerminalOperationsWorkspace.jsx`) --
   extracting a shared helper (e.g. `packages/web-core/src/utils/storefrontImageGallery.js`) is a
   reasonable immediate follow-up, deliberately not done in this PR to keep the diff bounded to
   what was asked.
6. **The `storeOptimizedImageAsset` instrumentation added here only covers the success path.** A
   thrown/aborted encode has no logged `wall_ms`/`encode_count` data point in this PR -- acceptable
   for a pre-change baseline measurement, per the task's own scope discipline.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-265-218-POS-IMAGE-RENDER-FIX`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` reconciles this after merge.
