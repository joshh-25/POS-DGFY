---
status: reference
owner: engineering
last_reviewed: 2026-09-04
related_adr: docs/architecture/adr/0080-item-multi-category-membership.md (Decision 4 [default] --
  this PR is the explicit, shipped opt-in for exactly one surface, the storefront catalog listing;
  Decision 1 [binding] -- the four named money-adjacent primary-only readers are untouched and
  pinned by a new static regression guard, see Affected Surfaces below)
declaration_id: 2026-09-04-storefront-catalog-secondary-categories
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: apps/dgfy-api/tests/storeRepositorySecondaryCategories.test.js -- actually executed (Jest) 5/5 passing (secondary_categories attached with folder names ordered by sort_order alongside the unchanged primary folder_id/folder_name; defaults to [] with no memberships; fails open to [] -- never throws -- when the membership lookup errors; skips the membership query entirely for an empty catalog result; a membership pointing at a since-deleted/renamed folder resolves to folder_name: null rather than throwing),apps/dgfy-api/tests/storeCatalogSecondaryCategories.usecase.test.js -- actually executed (Jest) 3/3 passing (buildListStoreCatalogUseCase/serializeStoreCatalogItem threads secondary_categories from the repository row into the public response; defaults to [] for a pre-Phase-285 row shape with no secondary_categories field; a non-array value from the repository is normalized to [] rather than propagated),apps/dgfy-api/tests/adr0080PrimaryOnlyReadersGuard.test.js -- actually executed (Jest) 6/6 passing (new static source-grep regression guard: none of the six ADR 0080 Decision 1 [binding] primary-only files -- affiliateCommissionAccrual.js/voucherFolderScope.js/voucherRepository.js/fnbRepository.js/effectiveFnbModifierGroups.js/posRepository.js -- reference secondary_categories/attachSecondaryCategories/listItemFolderMemberships),apps/dgfy-api/tests/itemFolderMembershipPrimaryOnlyInvariant.test.js + affiliateCommissionAccrual.unit.test.js + voucherFolderScope.unit.test.js + effectiveFnbModifierGroups.test.js (Phase 257's own characterization suite plus the three primary-only resolvers' own unit tests) -- actually executed (Jest) 4 suites / 44 tests all passing, unmodified by this diff -- the evidence that this PR did not touch any of ADR 0080 Decision 1's named resolutions,apps/dgfy-api/tests/storeRepository.locationStockFallback.test.js + storeCatalogPaymentMode.unit.test.js + storeUsecases.applicationResult.test.js (pre-existing storeRepository.js/storeUseCases.js coverage) -- actually executed (Jest) 3 suites / 77 tests all passing unmodified -- the evidence that the new itemRepository cross-module import and the two mapCatalogRows call-site edits are additive only,node --check on every changed/added apps/dgfy-api .js file (5 files: storeRepository.js, storeUseCases.js, and the 3 new test files -- 0 errors -- dgfy-api has no build step so this is its Tier 0 equivalent per .agents/skills/implement/SKILL.md),npm run check:compliance -- confirmed to fail first (named exactly storeRepository.js and storeUseCases.js as the 2 sensitive files with no declaration) then pass once this declaration was added,npm run check:architecture -- passed (54 modules / 561 code files, 94 controller files)
rollback_note: Revert this PR's diff. No migration and no schema change -- item_folder_memberships already exists (Phase 257, #1503) and this PR only reads it via the existing listItemFolderMemberships. Reverting removes the secondary_categories field from the public storefront catalog response and the ItemFolder-name batch lookup in storeRepository.js; no money value, no primary folder_id/folder_name value, and no write path is touched by this PR at all, so rollback is a pure subtraction with zero data-shape risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T10:57:30.000Z
preflight_request_ref: NOT-EXECUTED-1318-STOREFRONT-CATALOG-SECONDARY-CATEGORIES
---

# Storefront catalog API projection of secondary categories (Phase 285, #1318, Wave C/C1)

## Compliance Impact Classification

**Major.** The floor is mechanical, not judgment: `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES` matches `apps/dgfy-api/src/modules/store/**` to the `payments`
surface at a `major` floor (`docs/compliance/compliance-classification-matrix.md`'s Path Matrix).
Confirmed live by running `npm run check:compliance` against this diff before this file existed --
it failed and named exactly the two files this PR touches:
`apps/dgfy-api/src/modules/store/repositories/storeRepository.js` and
`apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`.

Substantively, `major` is a conservative floor rather than a close call: this diff adds a **read-only,
additive projection field** (`secondary_categories`) to the public storefront catalog listing. It
introduces no new write path, does not change `default_sale_price`/`folder_id`/any pricing input,
and does not touch checkout, payments, or voucher/affiliate resolution. `regulatory` is not reached
-- nothing in this diff touches `apps/dgfy-api/src/modules/compliance/` or
`middleware/compliancePolicy.js`.

`reason_codes_impacted: ALLOWED` -- no reason code is added, removed, or changed by this diff.

## What this phase does (and does not do)

Wave C/C1 of #1318 (item multi-category membership). Phase 257 (#1503, merged) built the
foundation: the `item_folder_memberships` join table, the `ItemFolderMembership` model, and
`itemRepository.js`'s `listItemFolderMemberships(itemIds)`/`replaceItemFolderMemberships`. Phase
268 added the IMS authoring UI for it. Neither touched any of the ~34 existing item-folder read
sites -- every catalog listing surface still projected only the single primary
`folder_id`/`folder_name` (ADR 0080 Decision 4's stated default: primary-only until an explicit
phase opts in).

**This phase is that explicit opt-in, for exactly one surface: the storefront catalog listing**
(`storeRepository.js`'s `listStoreCatalog` / `storeUseCases.js`'s
`buildListStoreCatalogUseCase`/`serializeStoreCatalogItem`). It makes an item's secondary
categories available on the public catalog response so a later phase (C2, not this one) can group
items into every category they belong to, per ADR 0080 Decision 5's `{sectionId}:{itemId}` keyed
rendering. **This phase does not implement that grouping/rendering** -- it only projects the data.

## Field shape

`secondary_categories: [{ folder_id, folder_name }]`, ordered by each membership's `sort_order`
(inherited from `listItemFolderMemberships`'s own `ORDER BY item_id, sort_order`). Chosen over a
bare array of folder ids because C2's Decision-5 grouping needs a display name per section without
a second round trip, mirroring the existing primary projection's own `{folder_id, folder_name}`
pair (`folder_id`/`folder_name` at the top level). An item with zero secondary memberships gets
`secondary_categories: []`, never `null` or an absent key -- every catalog row carries the field
so a C2 consumer never has to null-check it.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/store/repositories/storeRepository.js` -- `listStoreCatalog`'s
   `mapCatalogRows` closure is unchanged (still projects only the primary `folder_id`/`folder_name`
   scalar). A new `attachSecondaryCategories` helper batches
   `itemRepository.listItemFolderMemberships(itemIds)` (reused, not duplicated, per the task's
   explicit instruction) plus one `ItemFolder.findAll` batch query for folder names, and is called
   once per `mapCatalogRows(...)` call site (the main query path and its schema-fallback retry
   path) before the existing location-availability/location-stock pipeline runs -- both of which
   already spread `{...row, ...}` and so pass `secondary_categories` through unmodified. New
   cross-module import: `itemRepository` from `../../inventory/index.js`, matching existing
   precedent (`itemRepository.js` itself imports `getAllSettingsUseCase` from
   `../../settings/index.js`; `store/index.js` already imports `voucherRepository` from
   `../vouchers/index.js`).
2. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- `serializeStoreCatalogItem`
   (the single choke point every `buildListStoreCatalogUseCase` response item passes through) adds
   one field, `secondary_categories: Array.isArray(item.secondary_categories) ?
   item.secondary_categories : []`, immediately after the existing `folder_name` line. No other
   line in this file changes. The second `serializeStoreCatalogItem` caller
   (`buildResolveStoreQrUseCase`, a single-item barcode/QR lookup) is deliberately **not** wired
   into `attachSecondaryCategories` -- ADR 0080 Decision 5 names single-label surfaces as
   primary-only-by-design, so that caller's rows simply lack the field and the same
   `Array.isArray` guard defaults it to `[]`.

## Compliance Preconditions

1. **Fails open, never closed.** A membership-lookup or folder-name-lookup error inside
   `attachSecondaryCategories` is caught, logged (`logger.warn`,
   `storefront_catalog_secondary_categories_fallback`), and every row gets
   `secondary_categories: []` -- the additive projection can never break the public storefront
   catalog listing. Pinned by a dedicated test (a rejected `listItemFolderMemberships` call still
   returns the catalog with an empty array, not a thrown error).
2. **Zero change to the primary projection or to money inputs.** `folder_id`/`folder_name` are
   read from the exact same source expressions as before this PR; `default_sale_price`,
   `cost_per_unit`, and every affiliate/voucher-facing field on the catalog row are untouched.
   Pinned by the existing `storeRepository.locationStockFallback.test.js` /
   `storeCatalogPaymentMode.unit.test.js` / `storeUsecases.applicationResult.test.js` suites all
   passing unmodified (77 tests).
3. **ADR 0080 Decision 1 `[binding]`'s four named money-adjacent primary-only readers are
   untouched, both by inspection and by a new automated guard.** This PR's diff touches exactly
   two files (`storeRepository.js`, `storeUseCases.js`); it does not touch
   `affiliateCommissionAccrual.js`, `voucherFolderScope.js`, `voucherRepository.js`,
   `fnbRepository.js`, `effectiveFnbModifierGroups.js`, or `posRepository.js`. A new static test,
   `adr0080PrimaryOnlyReadersGuard.test.js`, reads those six files' source directly and asserts
   none of them reference `secondary_categories`, `attachSecondaryCategories`, or
   `listItemFolderMemberships` -- a durable regression guard against a future change accidentally
   widening any of Decision 1's four resolutions, distinct from (and complementary to) Phase 257's
   own behavioral characterization suite (`itemFolderMembershipPrimaryOnlyInvariant.test.js`),
   which this PR also reran unmodified (44 tests passing across that file plus the three resolvers'
   own unit suites).
4. **POS report category grouping/filtering (`posRepository.js`'s `resolveReportItemCategory`,
   `buildReportInclude`, `normalizeReportLineRows`) is explicitly out of scope, per ADR 0080
   Consequences item 3 (POS reports stay primary-only permanently, by design, not a gap to fix) --
   not touched in this diff, confirmed by the same static guard above.
5. **POS/IMS catalog filter chips (`posCatalogWorkflow.js`, the chip components,
   `itemRepository.js`'s `getItems()` folder filter) are a separate, parallel phase (C3, in a
   different worktree) and are not touched here.** No overlap was found during this PR's own
   implementation.
6. **The new `itemRepository` cross-module import does not widen any architecture boundary.**
   `npm run check:architecture` passed against this diff (54 modules / 561 code files, 94
   controller files, zero violations) -- the guardrail script's rules (module structure, controller
   naming, use-case-layer model-import leakage, non-repository model imports) have no rule against
   a repository file importing another module's public `index.js` surface, and this repo already
   has two such precedents (`itemRepository.js` -> `../../settings/index.js`,
   `roadDistanceProvider.js` -> a sibling module's `index.js`).

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary:

- 3 new test files, 14/14 tests passing: repository-level projection behavior (5), use-case-level
  threading into the serialized response (3), and the new ADR 0080 Decision 1 static regression
  guard (6).
- 7 pre-existing, unmodified test files rerun as regression evidence: 44 tests across Phase 257's
  own primary-only characterization suite plus the three named resolvers' own unit tests, and 77
  tests across the existing `storeRepository.js`/`storeUseCases.js` coverage -- all passing,
  confirming this PR's changes are additive-only.
- `node --check` on every changed/new `.js` file -- 0 errors.
- `npm run check:compliance` -- confirmed to fail first (naming exactly the two sensitive files
  with no declaration), then pass once this declaration was added.
- `npm run check:architecture` -- passed.

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-1318-STOREFRONT-CATALOG-SECONDARY-CATEGORIES`, the expected state for a
  `develop`-targeting PR per `docs/compliance/request-time-preflight-protocol.md`'s "Where live
  preflight actually runs"; the continuous sweep reconciles it post-merge. No authenticated
  `SYSTEM.EDIT_SETTINGS` session against a running backend was available from this session.
- **`npm run gate:release:local` has not been run** -- no longer a promotion step at all since
  #1431 Phase C/D, and never `implement`'s job at PR time per `.agents/skills/implement/SKILL.md`.
