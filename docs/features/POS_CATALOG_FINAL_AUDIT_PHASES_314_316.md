---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-09
topic: pos_catalog_final_audit
---

# POS catalog final audit and repair plan

## Baseline and scope

Audited local branch: `POS-Development`, application commit `d4879eacb`.
All tracked application work was already committed when this audit began.
Untracked archives, nested worktrees, obsolete app directories, and build outputs
are excluded from the application change set. No push, PR, migration, or deployment
is part of this request.

This audit covers the recent HD image viewer (Phases 308-312) and shared category
ordering/presentation (Phase 313), including their API consumers. It is not a
certification of every historical checkout, payment, or image-upload change.

## Authoritative constraints

- [Architecture boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md)
  (last reviewed 2026-03-06): persistence stays in repositories.
- [Architecture governance](../architecture/ARCHITECTURE_GOVERNANCE.md)
  (last reviewed 2026-05-21): require behavior tests and rendered UI evidence.
- [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md)
  (last reviewed 2026-07-14): Catalog owns categories; Storefront owns presentation.
- [ADR 0080](../architecture/adr/0080-item-multi-category-membership.md)
  (last reviewed 2026-09-05): primary category remains the sole money/modifier
  tiebreak; secondary-only and uncategorized items are legal.
- [ADR 0019](../architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md):
  POS and Storefront consume the same effective folder/item modifiers.
- [ADR 0014](../architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md)
  (last reviewed 2026-08-27): retain tenant-scoped cache behavior.
- [ADR 0067](../architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md)
  (last reviewed 2026-08-29): preserve the Chrome 80 runtime floor.

Classification: within existing boundaries, restoring existing contracts.
No new ADR, architecture allowlist, database migration, or data deletion is needed
for the confirmed repairs. Do not alter binding money/modifier rules to fit the UI.

## Findings

### G1 — High: category visibility changes inherited modifiers (resolved in Phase 314)

The previous Phase 313 implementation filtered the shared `folder` include to
active/non-deleted rows. That include is also used by checkout-item loading and
contains inherited F&B modifier groups. Phase 314 removed that shared filter and
loads the folder status fields for presentation-only redaction; the resolver can
therefore continue to consume the same folder modifier source as POS.

### G2 — High: presentation mapping changes voucher inputs (resolved in Phase 314)

The previous mapper assigned `folder_id` from the filtered association, replacing
the stored primary ID with null when its folder was inactive. Phase 314 now keeps
`row.folder_id` for voucher and modifier business inputs while redacting only the
public `folder_name`/sort projection. The serializer hides the public ID when no
live display folder exists. This keeps voucher preview and checkout scope inputs
consistent without exposing stale category controls.

### G3 — Medium: the expanded API regression gate fails (resolved in Phase 314)

`apps/dgfy-api/tests/storeRepository.locationStockFallback.test.js:118` expected
`folder_name: 'Rocket Fuel'` from a fixture containing only legacy
`product_folder`. Phase 314 repaired the fixture with an explicit active folder,
so the stock fallback remains covered without restoring inferred categories.

### G4 — Validation gap: rendered behavior and latency are not certified

The viewer's three jsdom tests pass, but they stub image dimensions and do not
prove actual mobile overflow, zoom edge reachability, resize behavior, or network
cost. Category model/toolbar tests also do not prove a save propagates between
running POS and Storefront sessions. These are unverified acceptance conditions,
not confirmed UI defects. In particular inspect the viewer's centered scrolling
container and dimensions recorded only on image load before claiming zoom is safe.

## Evidence from this audit

- API: 28 passed across `storeRepository.locationStockFallback.test.js`,
  `storeRepositorySecondaryCategories.test.js`, and
  `storeCatalogSecondaryCategories.usecase.test.js`; voucher/store use-case
  suites passed 81 tests; dedicated F&B modifier suites passed 3 tests; and
  resolver/primary-membership safeguards passed 6 tests.
- Storefront: 30 focused model/toolbar tests passed; the full suite passed
  218 files and 1,171 tests, and the production build completed successfully.
- POS: 3 passed in `tests/unit/PosItemImageViewer.test.jsx`.
- `npm run check:architecture`: passed.
- `npm run check:compliance`, `npm run check:docs`, and
  `npm run check:app-versions`: passed; the changed API files pass ESLint.
- No image-viewer browser E2E or latency measurement was rerun for this audit;
  those remain Phase 316 work. Phase 315 now has rendered POS component
  coverage, API projection coverage, and a live public Storefront smoke.
- Phase 314 readiness: implementation and focused validation complete. Phase 315
  is complete for category regression/reconciliation coverage; Phase 316 remains
  pending for rendered image-viewer and performance evidence.

## Phase 314 — Isolate category presentation from business rules

Status: completed. Depends on Phase 313. Addresses G1 and G2.

1. In `storeRepository.js`, remove presentation filtering from the shared folder
   association. Select `is_active` and `deleted_at` alongside folder ID/name/order
   so visibility can be decided in the presentation mapper.
2. Retain `row.folder_id` as the internal primary category ID consumed by voucher
   and other business calculations. Never derive it from a visibility-filtered
   association, replace it with a secondary category, or update the database ID.
3. Project `folder_name` and `folder_sort_order` only for a matching, active,
   non-deleted primary folder. In `serializeStoreCatalogItem`, emit the public
   category ID only when this live display category exists. Keep legacy text
   excluded, secondary membership handling intact, and unassigned items in All.
4. Add regression fixtures for active, inactive, deleted, missing, and null primary
   folders. Prove modifier inheritance still follows the established resolver
   and item overrides; prove voucher display receives the stored primary ID even
   when public category fields are null. Cover both catalog and checkout loaders.
5. Run focused repository, voucher-display, F&B modifier, and serializer tests;
   run architecture/compliance gates. Bump affected app versions using repo policy.

Acceptance: inactive categories produce no filter button; hiding them does not
change business category inputs or inherited modifiers; All retains the items.
No migration, category deletion, price-policy change, or secondary-category
expansion of money calculations is permitted.

Completion evidence: the shared include now retains folder associations and
status fields; the mapper keeps the stored primary ID for internal business
inputs and redacts only stale public category fields. API repository/catalog
tests passed 28/28, voucher/store use-case tests passed 81/81, dedicated F&B
modifier tests passed 3/3, resolver safeguards passed 6/6, and architecture,
compliance, docs, and app-version gates passed. Completion date: 2026-09-09.

## Phase 315 — Close category regression and synchronization coverage

Status: completed. Depends on Phase 314. Addresses G3 and category portion of G4.

1. Verify the Phase 314 repair in `storeRepository.locationStockFallback.test.js`:
   explicit active-folder and legacy-only fixtures remain separate and the stock
   fallback assertions stay intact.
2. Expand F&B/services tests: null primary with valid secondary category; invalid
   category IDs; two distinct IDs with colliding names; inactive/deleted category;
   every item present exactly once in All; saved relative order preserved.
3. In local rendered POS and Storefront sessions for the same tenant/location,
   reorder a category, verify persisted order after reload, then verify the
   Storefront order. Record the refresh/invalidation mechanism and observed delay.
   Test rejected/stale-list save restores or refreshes the correct POS order.
4. Check a second tenant does not receive the first tenant's order or invalidation.
   Use isolated test data and restore its original ordering after verification.
5. Fix only reproduced synchronization defects; keep existing tenant-scoped cache
   mechanisms, avoid polling loops and per-item API requests.

Acceptance: all expanded suites pass; the category reorder path submits the
complete ID list and reconciles a rejected stale save from the authoritative
tenant-scoped list; Storefront model and public catalog rendering preserve the
saved eligible-category order; All remains first; unassigned items remain
visible; no cross-tenant effect. Empty/invisible categories may be absent from
Storefront, so compare the relative order of eligible categories rather than
requiring identical category counts.

Validation evidence: POS rendered category behavior tests passed 16/16,
including optimistic reorder and stale-list refresh recovery. Storefront F&B and
services model tests passed 24/24, and the full Storefront suite passed 218 files
and 1,175 tests. API repository/category suites passed 96/96, including persisted
secondary sort order and active/deleted filtering. The local API catalog payload
and rendered public Storefront for Masu Cafe exposed the same eligible category
order; a second tenant's payload had a distinct category set with no ID overlap.
POS and Storefront production builds, architecture, compliance, documentation,
app-version, and diff checks passed. Authenticated browser credentials were not
available for a destructive live POS reorder, so the cross-app mutation itself is
covered by the rendered POS handler test and the API atomic reorder contract; no
production or tenant data was changed. Completion date: 2026-09-09.

## Phase 316 — Rendered image and release-readiness validation

Status: in_progress. Depends on Phase 315. Addresses remaining G4.

1. Check the actual POS image viewer at desktop and 360px mobile width, plus short
   landscape height. Exercise open, next/previous, fallback failure, zoom in/out,
   resize/orientation change, Escape, focus restoration, and close/reopen.
2. Prove close/price/navigation stay reachable, the complete zoomed image can be
   scrolled into view, and resizing cannot leave stale image dimensions or page
   overflow. If reproduced, repair only the relevant layout/measurement code in
   `packages/web-core/src/features/pos/components/PosItemImageViewer.jsx` and add
   a targeted rendered regression test.
3. Capture network/storage evidence: opening requests only the active HD image
   (plus necessary thumbnails); navigating requests the selected image; closing
   removes the viewer. POS adds no persistent image copy, prefetch loop, or new
   dependency. Browser HTTP caching remains allowed. Record request counts/bytes
   and controlled before/after timing; do not promise zero latency without data.
4. Run all affected tests and builds (POS, Storefront, and IMS if shared reach
   requires it), architecture, compliance, docs, and actual changed-app version
   gates. Resolve every failure or document a precise external blocker.
5. Record evidence and completion dates in the phase ledger; commit by domain on
   POS-Development after the marker scan. Final report lists commits, tests,
   reproduced fixes, limitations, current phase, and next eligible phase.

Acceptance: rendered evidence covers required interactions without runtime errors,
all required gates pass, and no measured avoidable network/storage work is added.
Physical iMin validation is excluded per the user's instruction; do not describe
desktop emulation as proof on a physical APK device. No PR/push/deploy unless asked.

### Phase 316 execution record — 2026-09-09

- Reproduced the stale-dimension gap at the rendered component level: a zoomed
  image kept explicit pixel dimensions after a narrow viewport change.
- Updated `PosItemImageViewer.jsx` to listen for `resize` and
  `orientationchange`, clear zoom and stale metrics immediately, then remeasure
  the loaded image on the next animation frame (with a timer fallback).
- Added a focused POS regression test covering 800px-to-320px resizing, stale
  style removal, remeasurement, and safe re-enlargement. The POS viewer suite
  passes 4/4 and the POS production build passes.
- The local POS browser was reachable but authentication-gated at the login
  screen. No credentials were available, so authenticated desktop/mobile
  interaction, HAR request counts/bytes, and live close/reopen proof remain
  unexecuted. No production or tenant data was changed.
- Phase 316 remains `in_progress` until that authenticated rendered and network
  evidence is available; this is an external access limitation, not a test
  failure. Physical iMin validation remains excluded.

## Execution handoff

Read this document and its authoritative references before editing. Phases 314 and
315 are completed; implement Phase 316 when approved, and require its gates before
marking it completed. Existing application work is committed; preserve unrelated
untracked files. Do not silently broaden scope, delete tenant data, disable cache
safety, or claim existing passing unit tests prove G1/G2 absent. Current completed
phase is 315; Phase 316 is active and remains the next eligible implementation
phase until its required authenticated evidence passes.
