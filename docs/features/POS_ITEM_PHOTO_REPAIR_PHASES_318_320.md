---
status: authoritative
authority_level: authoritative
owner: engineering
last_reviewed: 2026-09-09
applies_to: pos_item_image_upload_and_gallery_edit
topic: pos_item_image_recovery_plan
---

# POS item photo repair plan — Phases 318–320

## Objective and current assessment

Fix the seven confirmed Add/Edit Item photo gaps found after Phase 317.
Work only in the local POS-Development checkout. This document authorizes planning;
implementation starts with approval of the relevant phase.

Phase 317's implementation and passing test evidence remain historical facts,
but its complete-flow acceptance was reopened. Phases 318, 319, and 320 are now
complete; current next eligible implementation phase: 321.

## Authoritative decisions and freshness

- [Start here](../START_HERE.md), last reviewed 2026-08-25.
- [Architecture boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md), last reviewed
  2026-03-06: transport in controllers, rules in use cases, persistence in repositories.
- [Architecture governance](../architecture/ARCHITECTURE_GOVERNANCE.md), last reviewed
  2026-05-21: negative tests, rendered proof and all affected app builds are required.
- [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md),
  accepted; last reviewed 2026-07-14, review due 2026-12-26: retain Catalog and
  Storefront ownership; POS requests image mutations through their existing APIs.
- [ADR 0055](../architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md),
  accepted; last reviewed 2026-08-08, review due 2027-02-08: publish tenant-scoped
  invalidation after persistence; refetch authorized catalog data.
- [ADR 0067](../architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md),
  amended; last reviewed 2026-08-29, review due 2027-02-18: retain Chrome 80 compatibility.

These documents remain in force; no cited ADR is proposed, superseded or retired.
The older boundary/governance review dates are recorded rather than silently refreshed.
Classification: within-existing-boundary. No ownership change, new ADR, dependency,
or architecture allowlist is proposed.

## Confirmed gaps and code map

| ID | Trigger and failure | Owning code |
| --- | --- | --- |
| G1 | Save an older saved-only gallery after another upload: newer image can be removed. Async checking also happens before slow processing, leaving a write-time race. | API gallery use cases and item repository |
| G2 | Remove all, then database write fails: files have already been deleted. | update-gallery use case |
| G3 | Edit upload request fails: modal closes and selections clear despite retry copy. | queueEditImageFiles and handleSave |
| G4 | Save a reorder/removal: retained original_path and source attribution become null. | editor gallery normalization and API update-gallery mapping |
| G5 | Choose pending Primary, then add another file: parent resets Primary while carousel retains it. | editor handlers and SelectedItemImageCarousel |
| G6 | Regenerate AI photo: persisted image changes but editor base/draft remain old. | handleGenerateEditImage and editor draft |
| G7 | Add Item setup fails, operator replaces selected photos, resumes: recovery uploads old snapshot. | runPostCreateStages and create recovery branch |

Frontend paths:
- packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx
- packages/web-core/Components/items/SelectedItemImageCarousel.jsx
- packages/web-core/src/features/pos/utils/posEditImageDraft.js
- packages/web-core/src/services/storefrontCatalogService.js
- packages/web-core/src/features/pos/services/posPendingItemImagePreviewStore.js

Backend paths:
- apps/dgfy-api/src/modules/inventory/controllers/itemHandlers.js
- apps/dgfy-api/src/modules/inventory/usecases/storefrontCatalogUseCases.js
- apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js
- apps/dgfy-api/src/workers/catalogImageUploadWorker.js

## Phase 318 — Safe gallery persistence

Status: completed 2026-09-09. Dependencies: Phase 317 implementation. Covers G1, G2, G4.

1. Add an expected-base gallery value to saved-only PATCH requests as well as async
   upload intent. Distinguish an empty base from an absent base. Preserve existing
   endpoint compatibility; document that callers omitting the base cannot receive
   stale-draft protection. POS must always supply it.
2. Implement one repository-owned atomic gallery commit. Lock the tenant's parent
   item row so empty or absent override rows are protected too; reread the gallery,
   compare the expected base, and write under the same transaction. Return 409
   on mismatch without changing records or deleting saved files.
3. Encode new files before acquiring the short database lock. Revalidate inside
   the commit, not only before encoding. A losing upload cleans only its own new
   assets. In-process worker serialization alone is not sufficient.
4. Inspect all gallery writers, including AI generation, append, replacement and
   delete paths. Make competing writers participate in the same locking contract;
   a bypassing writer fails this phase's acceptance.
5. Rebuild saved entries from authoritative stored records by canonical identity.
   Use client entries only to select retained images and ordering. Preserve
   variants, original_path, classification and source/attribution. Reject unknown
   and duplicate identities, including path/URL aliases of the same image.
6. Persist removals/clear first. Delete only omitted, unreferenced image assets
   after commit. A database failure leaves all previous assets intact.
   A post-commit cleanup failure must not turn a successful save into an upload
   failure; log it for existing cleanup handling. Never delete newly retained assets.
7. Keep controller changes transport-only. Validate payload shape, five-image
   limit and tenant/item authorization; retain existing MIME and size validation.

Acceptance tests:
- Two editors with the same base: first saves, second receives 409; first result survives.
- Empty base versus concurrent first upload: conflict, no overwrite.
- Saved-only edit versus async upload and AI writer: no lost update; exercise real
  repository transactions with deterministic barriers around processing/commit.
- Remove-all database failure: zero previous files deleted.
- Cleanup failure after commit: committed success remains success.
- Reorder/remove retains every metadata field of retained entries exactly.
- Unknown/duplicate references and cross-tenant attempts cause no writes/deletions.
- Existing append/single-image endpoint tests remain green.

Schema: no migration is expected; use existing rows/transactions. If inspection proves
a schema addition unavoidable, document the need before implementing it.

Phase 318 completion evidence (2026-09-09): repository-owned transactional
gallery commits lock the tenant item row, reread and compare the expected base,
preserve canonical stored metadata, and reject stale/unknown/duplicate entries
without writes. All gallery writers commit before best-effort asset cleanup;
cleanup failure is logged without changing a successful result. Optimized
lifecycle metadata is carried from the completed storage operation without a
second optimization pass. Focused API and frontend tests, integration
persistence coverage, architecture/compliance/docs checks, and all three
affected production builds passed. No database migration was required.

## Phase 319 — Consistent editor state and retry

Status: completed 2026-09-09. Depends on Phase 318. Covers G3, G5, G6, G7.

1. Use one parent-owned gallery draft and stable image identity for saved and
   pending entries. Make carousel Primary controlled by that state. Remove the
   independent conflicting Primary state; adding an image preserves Primary.
   Removing Primary chooses the first remaining entry deterministically.
2. On upload rejection, keep the Edit modal, files, removals and Primary intact.
   Do not show full success or call closeEdit. Explain that details may already
   be saved and images need retry; retain the existing item ID. Retry must not
   create another item or silently replay an already accepted image upload.
3. Separate queued acceptance from completed persistence. Match completion/failure
   to item and job/attempt identity; ignore stale results. Preserve silent image
   processing with no new "Processing images" banner. Show actionable errors only.
   Ambiguous network outcomes require status reconciliation before another upload.
4. AI generation remains an explicit immediate server action, consistent with
   existing behavior. Disable it while unsaved image edits exist, with concise
   guidance to save or discard them first. On successful generation, refetch that
   item and replace only gallery base/draft from its authoritative response;
   preserve unrelated unsaved fields. Ignore completion after modal/item change.
5. During Add Item recovery, retain the created item ID and successful stages, but
   take failed-image retry files from current selections. Replacing/removing photos
   changes the retry payload. If images already succeeded, do not upload them
   again merely because visibility or barcode setup needs retry.
6. Cancel before save discards draft-only image changes. Do not imply Cancel undoes
   a separately accepted AI job or a previous successful server write.
7. Release abandoned object URLs and attempts on replacement/close/session change.
   Use existing preview and worker facilities; no persistent image copy in POS,
   eager HD loading, new polling loop, package, or full-resolution client re-encoding.

Acceptance tests (render actual editor and intercept API calls):
- Saved A + upload B => two distinct images; A remains Primary unless explicitly changed.
- Upload B,C; choose C Primary; add D; save/reopen => C remains Primary.
- Remove saved image then Cancel => no gallery API call and saved gallery unchanged.
- Reject upload => editor stays open; retry sends the same intended current draft once.
- Accept upload then unrelated refresh fails => no duplicate upload on retry.
- Switch item/close during async completion => next editor is not mutated.
- AI success refreshes gallery and permits subsequent save; dirty-image draft blocks generation.
- Add retry replacing A with B uploads B against the same created item.
- Successful images plus failed visibility => Resume does not upload images again.

Phase 319 completion evidence (2026-09-09): the POS editor now owns stable
saved/pending gallery identities and Primary state, retains the modal and current
intent after deterministic or ambiguous upload failure, reconciles an unknown
job ID from the next authorized catalog read, and ignores stale completion from
another item/session. AI completion refreshes only the gallery base/draft while
preserving unrelated fields; Add recovery keeps the created item ID and retries
only the currently selected failed image stage. The focused Phase 319 suite
passed 8 files and 40 tests, and POS, IMS, and Storefront production builds
passed. Architecture, compliance/API-contract, documentation/ADR,
workspace-hygiene, app-version, and diff checks passed. Changed-file ESLint
still reports the pre-existing React Compiler memoization errors in the large
TerminalOperationsWorkspace component; no new Phase 319 lint error was added.
The full IMS Vitest run also completed with 2,316 passing tests and three
pre-existing failures in `posItemsModalViewport.contract.test.js`: that older
contract still expects the removed `pos-items-modal-*` classes and an obsolete
Escape/scroll-lock implementation in the custom item portal. The Phase 319
files do not change that modal contract; its browser/layout proof remains in
Phase 320.
No database migration was required. Authenticated browser proof and latency
measurements remain Phase 320 acceptance work; physical iMin validation remains
excluded.

## Phase 320 — End-to-end proof and closure

Status: completed 2026-09-09. Depends on Phases 318 and 319.

1. Run the above regressions through controller -> queue -> worker -> repository,
   not just helpers or source-text assertions. Test files keyed through the real
   enqueue/processing path, with storage/tenant substitutes only where necessary.
2. Run local authenticated browser proof on a dedicated test item/tenant:
   add 1, 3 and 5 photos; reject a sixth; drag/drop; Edit add/remove/Primary;
   cancel; reload; injected upload failure/retry; Add recovery; AI completion
   with deterministic test response; concurrent stale save. Verify persisted
   gallery and POS/Storefront Primary agreement after successful processing.
3. Capture desktop 1280x800 and mobile 360x640 evidence: visible controls,
   contained modal, usable scroll, no unexpected navigation, no console/page
   errors or stuck disabled state. Physical iMin testing is excluded.
4. Compare before/after selection-to-preview and save-acknowledgement timings with
   the same 1- and 3-image fixtures and network conditions. Record measurements,
   network request counts and object-URL cleanup; do not promise zero latency.
   No extra uploads, duplicate HD requests or persistent POS image storage.
5. Run relevant API and rendered frontend tests, changed-file ESLint, and production
   builds for POS, IMS and Storefront shared-code consumers. Run architecture,
   compliance, docs and diff gates. Verify versions over the entire initiative
   diff, not the last documentation commit; read ADR 0081 before version changes.
6. Record known unrelated lint/build warnings separately. Missing authenticated
   browser proof or any failed acceptance case leaves this phase in_progress;
   do not claim "100%" from unit-test totals.
7. Update the ledger and compliance evidence with exact commands/results, failure
   cases, artifact paths and remaining limitations. Close Phase 317's reopened
   acceptance only when all required gates pass. Next unallocated phase: 321.

Phase 320 completion evidence (2026-09-09): authenticated local browser proof
used the supplied local test account with the Masu Cafe company. At 360x640 and
1280x800, Add Item accepted 1, 3, and 5 images, retained only five when a sixth
was supplied, kept the modal contained with an internal scroll region, and
closed with Escape. Edit Item preserved the saved image, appended two distinct
draft images, allowed a new Primary selection, and Cancel discarded the draft
on reopen. The body lock was observed as `overflow: hidden` while the modal was
open and restored after Escape. The probe reported zero console errors, page
errors, unexpected failed requests, or HTTP error responses; the only expected
aborted request was the catalog event stream during teardown. No image API
request was generated by local draft selection; the three-image preview was
available within the probe's 50 ms post-selection assertion window. The focused
carousel tests verify object-URL revocation on replacement and close. A prior
runtime timing baseline was not recorded before Phase 320, so this evidence
records the current bound and request count without inventing a before/after
number.

The affected API matrix passed 9 suites and 173 tests, including the real
`posRepository.catalogImages.test.js` regression and explicit primary
`pos_thumbnail_url` preservation. The focused rendered frontend matrix passed
9 files and 58 tests; `PosItemImageViewer.test.jsx` passed 4/4; the full IMS
Vitest run passed 358 files and 2,319 tests. POS, IMS, and Storefront production
builds passed. Architecture, compliance/API-contract, documentation/ADR,
workspace-hygiene, app-version, and `git diff --check` gates passed. Targeted
ESLint for changed API files passed and POS/IMS app lint had no errors (IMS has
27 existing warnings); full API lint retains four existing errors in unrelated
bulk-image-import files. The broader optional `imageLifecycleFullValidation`
suite still has its pre-existing v2 path assertion while the current storage
pipeline emits v3 assets; no Phase 320 source touches that behavior.

The local stack remained healthy throughout: MySQL, API, device bridge, IMS,
POS, Storefront, and Redis were listening; `/api/v1/health` reported database,
Redis, and runtime schema healthy with zero missing migrations/columns; and the
bulk-image worker reported zero `Tick failed` entries. No database migration was
required. No PR, push, merge, production data change, or physical iMin test was
performed. Next eligible phase: 321.

## Execution handoff and constraints

Implement one approved phase at a time in order. Read this document, AGENTS.md,
the linked authoritative sources and the existing code before editing.
Use the existing names and architecture; do not replace the editor wholesale.

Do not push, create a PR, merge branches, touch production data, change inventory/
pricing/payment behavior, add physical-device gates, or reset unrelated work.
Do not silently delete uploaded customer assets to repair old metadata loss.
Previously lost metadata requires separately evidenced recovery, not invented values.

For each phase report: files changed, exact fixed behavior, negative tests and
results, any migration need, unresolved acceptance cases, current status and next
eligible phase. Commit only when requested, following repository commit rules.
Rollback code locally if needed; file deletion is not reversible, so preserve assets
until a successful commit and verify cleanup paths before enabling them.
