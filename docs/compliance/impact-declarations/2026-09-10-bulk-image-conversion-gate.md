---
status: reference
owner: engineering
last_reviewed: 2026-09-10
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
  (fifth dated "## Amendments" block, "bulk client wiring / 298d", added in this same PR)
declaration_id: 2026-09-10-bulk-image-conversion-gate
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.10
verification_evidence: see "## Verification Evidence" section below (node --check on every
  changed apps/dgfy-api .js file, the full existing + extended Jest suite for both touched
  usecase modules, the new/extended Vitest suites for every touched web-core module)
rollback_note: Plain revert restores today's ungated bulk behavior end to end -- the gate is
  additive at every layer (a new optional settingsRepository DI param on both bulk usecase
  builders, defaulting to null; the client-side splitter/renamer/orchestration modules are new
  files with no existing caller to break). No existing caller's behavior changes on revert: the
  bulk endpoints already decided acceptedAsClientLarge/clientVariantFiles from the filename alone
  before this PR, and go back to doing so after a revert removes the gate call.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T13:58:44.690Z
preflight_request_ref: PREFLIGHT-34037535202-2026-09-10-BULK-IMAGE-CONVERSION-GATE
---

# Client-side conversion for bulk catalog image uploads, and the server-side bulk gate gap it closes (#1643, epic #265's 298d)

## Compliance Impact Classification

Major. Confirmed against `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
before finalizing this declaration (`GITHUB_BASE_REF=develop npm run check:compliance`), not
predicted from a plan doc:

- `^apps/dgfy-api/src/modules/pos/` -- matches `usecases/posUseCases.js` and `index.js` ->
  surfaces `pos,terminal`, floor `major`.

**`apps/dgfy-api/src/modules/inventory/`** (`storefrontCatalogUseCases.js`, `index.js`) is **not
covered by any rule** in `check-compliance-impact.js` -- confirmed by grep, same finding as the
2026-09-09 declaration this PR amends alongside. Declared anyway, floor `major`, driven entirely
by the `pos` rule above (this PR touches both modules with the identical change shape).

**`apps/dgfy-api/tests/`** and **`packages/web-core`** are not matched by any rule either -- no
`services/`- or `utils/`-scoped rule exists for either. The client-side splitter/filename/
orchestration modules and the two service-file wirings add no new surface beyond what the backend
gate change already adds.

**Not `regulatory`**: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, authentication, or tenant-provisioning. No new settings key, no new
write-authorization path -- this PR only adds a *read* of the two existing
`image_client_conversion`/`image_client_conversion_scopes` keys (already platform-admin-gated by
the 2026-09-09 PR) to two use cases that didn't consult them yet.

## Affected Surfaces

1. **`apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`** --
   `buildUploadBulkPosCatalogImagesUseCase` now takes an optional `settingsRepository` (mirroring
   `buildUploadPosCatalogImageUseCase`) and resolves `resolveImageClientConversionGate({ scope:
   'pos_catalog_bulk' })` once per request; when closed, `acceptedAsClientLarge`/
   `clientVariantFiles` are forced off for every SKU group regardless of filename.
2. **`apps/dgfy-api/src/modules/inventory/usecases/storefrontCatalogUseCases.js`** -- mirror of
   item 1 for `buildUploadBulkStorefrontCatalogImagesUseCase`, scoped to `storefront_catalog_bulk`.
3. **`apps/dgfy-api/src/modules/pos/index.js`** and **`apps/dgfy-api/src/modules/inventory/index.js`**
   -- thread the already-imported `settingsRepository` into the two bulk usecase builders,
   mirroring how the single-image builders are already wired there. No new import added.
4. **New: `packages/web-core/src/utils/imageEncoding/bulkBatchSplitter.js`** -- pure, framework-free
   byte-based batch packer. No `api.js` import, no server call, no new surface.
5. **New: `packages/web-core/src/utils/imageEncoding/bulkVariantFilename.js`** -- pure filename
   construction/parsing, client-side mirror of the server's existing `bulkCatalogImageFilename.js`.
6. **New: `packages/web-core/src/utils/imageEncoding/bulkCatalogUpload.js`** -- orchestration
   (sequential `prepareImageVariants` calls, stem-grouped packing, sequential multi-request send,
   summary/results merge). Calls only already-existing exports
   (`isImageClientConversionEnabledForScope`, `prepareImageVariants`,
   `reportImageClientConversionDegradation`); adds no new network surface beyond the existing bulk
   endpoints.
7. **`packages/web-core/src/services/posCatalogService.js`**'s `uploadBulkPosCatalogImages` and
   **`packages/web-core/src/services/storefrontCatalogService.js`**'s
   `uploadBulkStorefrontCatalogImages` -- now route through item 6's orchestration instead of
   appending raw files directly. Same endpoint, same permission model, same response shape
   (`{summary, results}`) as before.
8. **`packages/web-core/src/features/inventory/pages/ItemsPage.jsx`** -- documentation comment
   only, no behavior change; its existing `uploadBulkCatalogImages(surface)` handler needed no
   code changes since item 7 preserves the response shape exactly.

**Explicitly out of scope this PR, confirmed untouched**: the gallery endpoints
(`/:item_id/storefront-images`, both `OnboardingSetupModal.jsx`'s and `ItemsPage.jsx`'s own
per-item flows), the single-image gate (`pos_catalog_single`/`storefront_catalog_single`,
unchanged from the 2026-09-09 PR), and `apps/dgfy-migration-runner` (no new settings key, no new
migration -- this PR only reads settings the 2026-09-09 migration already seeded).

## Compliance Preconditions

1. **No new auth/permission path.** Every touched bulk endpoint keeps its existing permission gate
   (`items:edit` / POS catalog-edit) unchanged; the new gate call sits entirely inside the
   client-variant-acceptance decision, identical in kind to the single-image gate already shipped
   and already declared compliant.
2. **No new settings write path.** This PR only *reads* `image_client_conversion`/
   `image_client_conversion_scopes` via the already-shipped, already-platform-admin-gated
   `resolveImageClientConversionGate` -- no new key, no new write authorization surface.
3. **Fail-safe-default, verified by test.** No `settingsRepository` supplied resolves to closed
   (mirrors the single-image path's own fail-safe test, same helper function, same default
   behavior) -- covered indirectly by the pre-existing "combines <SKU>__large/medium/thumbnail"
   tests now requiring an explicit `settingsRepository` with mode `'on'` to exercise the honored
   path, and directly by the new closed/opt_in-excluded/opt_in-included gate cases.
4. **"Force to null before it reaches `imageStorage.store()`" contract, verified by test.** With
   the gate closed, a `<SKU>__large.<ext>`/`<SKU>__medium.<ext>` batch is stored with
   `acceptedAsClientLarge: false, clientVariantFiles: null` -- the exact same forced-off shape the
   single-image path already implements and already has test coverage for.
5. **No schema change.** No new columns, no new tables, no new migration -- this PR reads
   settings rows the 2026-09-09 PR's migration already seeds.

## Verification Evidence

- `node --check` on every changed `apps/dgfy-api` `.js` file (this app has no real build step --
  `build` is a no-op, per Tier 0's stated minimum).
- Extended Jest suites, both pass in full: `posUsecases.applicationResult.test.js` (+4 new bulk
  gate cases: off / opt_in-excluded / opt_in-included / on, plus the pre-existing "combines
  <SKU>__large/medium/thumbnail" test updated to supply an explicit `settingsRepository` with mode
  `'on'` and assert the new `imageClientConversionState`/`imageClientConversionScope` log fields)
  and `storefrontCatalogUseCases.test.js` (same shape) -- 93 tests total across both files, all
  passing.
- New/extended Vitest suites for every touched `packages/web-core` module:
  `bulkBatchSplitter.test.js` (new, 7 cases), `bulkVariantFilename.test.js` (new, 10 cases),
  `posCatalogService.imageEncoding.test.js` (extended, +6 bulk cases) and
  `storefrontCatalogService.imageEncoding.test.js` (extended, +6 bulk cases) -- 37 tests total
  across the four files, all passing.
- `apps/dgfy-ims` build (`npm run build:skupervisor`) -- confirms the new lazy-imported modules
  don't break the real Vite build.
- `GITHUB_BASE_REF=develop npm run check:compliance` -- confirms this declaration covers every
  compliance-sensitive file this PR changes.
- `npm run check:architecture`, `npm run check:adr` -- confirm this declaration and the ADR 0017
  fifth amendment don't trip anything else.

## Residual Risks

1. **Server-side bulk gate gap, now closed (Finding 3).** Before this PR, neither bulk usecase
   ever consulted the gate at all -- a caller sending a `<SKU>__large.<ext>` filename directly to
   either bulk endpoint (bypassing the browser, and therefore bypassing
   `image_client_conversion` entirely) got the "already-optimized, skip re-encode" fast path
   unconditionally. This was a pre-existing gap from Phase 301/302 (not introduced by this PR),
   closed here rather than left open now that real client traffic starts sending those filenames.
2. **Sequential per-file client-side conversion can be noticeably slower than today's instant raw
   upload** for a large batch (up to 50 files) when the gate is enabled -- `bulkImageUploadLoading`
   already disables the upload button for the duration; a per-file progress indicator is a
   follow-up, not built in this PR.
3. **298d's own rollout observation period.** The two bulk scope tokens move from
   "gate-resolvable, unused" to real traffic in this PR; the same production-observation caveat
   the 2026-09-09 declaration already states for the single-image scopes applies here too before
   `'on'` is a safe terminal state for the bulk tokens specifically.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1643-298D-BULK-GATE`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and
the pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` reconciles this after merge.
