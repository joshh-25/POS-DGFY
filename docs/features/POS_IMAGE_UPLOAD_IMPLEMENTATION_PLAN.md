---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-05
review_by: 2026-12-05
applies_to: pos_item_images_and_bulk_image_uploads
topic: pos_image_upload_implementation_plan
---

# POS Image Upload Implementation Plan

## Objective and execution status

Repair POS image uploads so Add/Edit Item, Items, and Sell show a lightweight local
preview promptly, retain the correct image during processing, and switch to the
persisted 144px POS thumbnail only after it loads successfully. Then complete the
500-image ZIP + CSV upload workflow without blocking normal POS interaction.

This is a recorded implementation plan, not completion evidence. The current
execution phase is **289, reopened for corrective work**. **Phase 290 is planned**
for bulk-upload delivery; the next unallocated local phase is **291**. The
[Implementation Phase Ledger](IMPLEMENTATION_PHASE_LEDGER.md) remains the source
of truth. Recheck its tip before starting new work, particularly after a merge.
Do not renumber historical phases. Letters below identify work packages inside
289 and 290, not a second phase-numbering sequence.

The user has requested this plan be saved. This documentation change does not
implement application code, run data migrations, or authorize deployment.

## Scope and critical assessment

In scope:

- POS-only upload, preview, thumbnail delivery, worker completion, and recovery.
- Reliable image parity between Items and Sell, including after Save Item.
- Bounded browser decoding, retries, refreshes, and rendered image counts.
- One bulk operation containing up to 500 images, mapped to existing items by SKU
  through ZIP + CSV, with progress and per-file outcomes.
- Tenant/session isolation, file validation, persistence, and measured APK QA.

Out of scope:

- Changing Storefront image selection, gallery ordering, visibility, or variants.
- Changing checkout, pricing, inventory stock effects, or item identity.
- Creating items implicitly from an unmatched bulk-image SKU.
- Automatic deletion/backfill of existing merchant assets, production schema
  changes, deployment, and promises of zero transfer time or guaranteed 60 FPS.

Reducing image dimensions alone does not fix premature preview removal, stale
upload completions, failed-image loops, or lost jobs. Reliability comes first.
An image preview means "selected/uploading," not "durably saved." A lost network
connection must never be presented as a successful upload.

## Authoritative documentation and architecture

The following active sources were checked for this plan on 2026-09-05. None of
the cited ADR review deadlines has passed. The boundary/governance documents do
not declare a review deadline; their older review dates are recorded, not renewed
by this plan.

| Source | Last reviewed | Application to this plan |
| --- | --- | --- |
| [Start Here](../START_HERE.md) | 2026-08-25 | Planning lookup order and architecture checks. |
| [Architecture Boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md) | 2026-03-06 | Routes -> controllers -> use cases -> repositories -> models. |
| [Architecture Governance](../architecture/ARCHITECTURE_GOVERNANCE.md) | 2026-05-21 | Behavioral, rendered, persistence, and final hardening evidence. |
| [ADR 0017](../architecture/adr/0017-customer-access-modes-and-inventory-display.md) | 2026-08-14 | Independent POS/Storefront assets, asynchronous acknowledgement, replacement ordering, production Redis requirement. Review by 2026-11-03. |
| [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md) | 2026-07-14 | Catalog identity, POS execution, and Storefront presentation ownership. Review by 2026-12-26. |
| [ADR 0055](../architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md) | 2026-08-08 | SSE invalidates; authorized catalog GET remains authoritative. Review by 2027-02-08. |
| [ADR 0071](../architecture/adr/0071-frontend-split-into-three-apps.md) | 2026-09-03 | POS placement, shared frontend trunk, and shared-test runner. Review by 2027-02-15. |

Structure follows the [implementation plan template](../templates/IMPLEMENTATION_PLAN_TEMPLATE.md).
This recording is `no-architecture-impact`; the repair targets existing boundaries.
Bulk transport and persistence contracts require an ADR 0017 amendment in their
implementing change. No binding ownership or catalog-read rule is being changed.
If design discovery identifies a new cross-boundary decision not covered by an
active ADR, record a new ADR before building that portion. Untagged ADR clauses
are `default`, per Start Here and the governance strictness section.

Resolve these contract gaps explicitly, not silently:

- ADR 0017 says interactive clients do not poll compression jobs. Restore
  event-driven catalog refresh for that path; do not retain permanent per-item
  polling. Bulk-job progress is a separate proposed contract to document.
- ADR 0017's historical bulk file/ingress limits do not establish a safe ZIP
  upload limit. Freeze archive, expanded-byte, per-image, and transfer limits
  against actual middleware and ingress configuration in 290-A.
- Do not put image or ZIP bytes in Redis, localStorage, or a new service-worker
  cache. Local preview blobs are temporary, not durable asset storage.
- Do not publish item data through SSE or bypass location/terminal grants using
  worker results. Both screens reconcile from their authorized catalog reads.

No architecture allowlist exception is planned. If one becomes necessary, stop
that slice for governed review and a named removal owner/phase; do not improvise
an exception. No SQL migration is presumed for the frontend correction. Any new
persisted metadata requirement must be proven against the existing schema and
recorded as an additive migration in `apps/dgfy-migration-runner` before execution.

## Confirmed gaps and implementation entry points

These are findings from the preceding local audit, not a claim that this plan
has repaired them. Reproduce them against the working tree at implementation time.

| Gap | Existing entry points | Required correction |
| --- | --- | --- |
| An old job can bind to/remove a newer preview; preview keys lack full session scope. | [Preview store](../../packages/web-core/src/features/pos/services/posPendingItemImagePreviewStore.js) | Stable attempt identity before asynchronous work; tenant/session cleanup. |
| Completion clears previews after a refresh without verifying successful thumbnail loading; Items and Sell reconcile separately. | [Items workspace](../../packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx), [Sell view](../../packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx) | Shared, version-aware handoff; retain a valid displayed image on errors. |
| Missing 144px metadata, larger source selection, and persistent hidden/error state can leave cards blank. | [POS repository](../../apps/dgfy-api/src/modules/pos/repositories/posRepository.js), [POS storage](../../apps/dgfy-api/src/modules/pos/repositories/posCatalogImageStorage.js), [asset storage](../../apps/dgfy-api/src/modules/shared/utils/imageAssetStorage.js) | Accurate asset URLs, explicit POS variant policy, URL-keyed error reset. |
| Repeated full-source decoding, uncancelled work, and repeated failed-image requests waste resources. | [Selected image carousel](../../packages/web-core/Components/items/SelectedItemImageCarousel.jsx), Items workspace, Sell view | One shared preview per selected file, bounded work/retries, cleanup. |
| Generic invalidations and multiple refresh triggers can repeatedly load the catalog. | [Catalog refresh helper](../../packages/web-core/src/features/pos/utils/posCatalogRefresh.js), Items workspace, Sell view | Coalesce authorized reads; retain UI state and unchanged item references. |
| Sequential HTTP batches are not the approved recoverable ZIP workflow; jobs/status can be lost or overwritten. | [Catalog service](../../packages/web-core/src/services/posCatalogService.js), [upload worker](../../apps/dgfy-api/src/workers/catalogImageUploadWorker.js), [status store](../../apps/dgfy-api/src/workers/catalogImageUploadStatusStore.js) | Durable per-job/per-file lifecycle, recovery, safe transport, bounded execution. |

## Phase 289 - Correct single-item image reliability and responsiveness

**Status:** in_progress, reopened; existing partial implementation is present.
**Owner:** POS frontend/backend implementer; QA owns independent validation.
**Dependency:** existing Phase 288 baseline, authoritative contracts above, and
preservation of unrelated working-tree changes.

### 289-A - Reproduce failures and freeze the repair contract

- Inputs: audit entry points above and existing frontend/backend image tests.
- Work: add executable regressions for old-job/new-preview overlap, failed
  catalog refresh, failed thumbnail preload, and Items/Sell navigation after save.
  Record current URL selection and processing behavior; separate POS-only and
  Storefront callers before changing shared helpers.
- Readiness: ready for local investigation. Actual-device access is not required
  to reproduce state-machine races.
- Exit gate:
  - [ ] Each confirmed failure has a failing behavioral regression or a precise
    reproduction with observed state; source-text assertions are not the proof.
  - [ ] Preview, persisted asset, failure, and cleanup transitions are specified.
  - [ ] Contract changes and schema impact are identified before application edits.
- Risk: a green existing test suite can conceal the observed races.

### 289-B - Unify preview identity and safe image handoff

- Owner: frontend implementer. Depends on 289-A.
- Work: assign an upload-attempt identity before any asynchronous operation and
  scope it to tenant, authenticated session, and item (draft identity until a new
  item is created). Binding and clearing must compare the same attempt. Both
  Items and Sell consume the shared preview. Reconcile the matching persisted
  version and preload/decode the thumbnail before swapping. Do not revoke a blob
  while an active consumer still needs it.
- Keep failure and retry feedback visible without covering the thumbnail with a
  processing label. On failure retain a bounded local preview or the previous
  persisted image with retry feedback; do not imply it was saved.
  Logout/tenant switching clears local previews and invalidates pending callbacks.
- Exit gate:
  - [ ] Save shows the chosen image in Items and Sell without a manual reload.
  - [ ] Old completions, out-of-order refreshes, or failed reads never clear a
    newer preview or attach it to another tenant/session/item.
  - [ ] A thumbnail 404/decode failure cannot remove the last usable image.
  - [ ] Reload discards transient previews safely and reconciles persisted state.
- Risk: independent screen lifecycles and a save that returns after navigation.

### 289-C - Deliver real 144px POS thumbnails

- Owner: backend/frontend implementer. Depends on 289-A; integrates with 289-B.
- Work: expose the actual generated POS thumbnail metadata and use it consistently
  in Items and Sell. Generate a POS-specific variant without forcing unrelated
  Storefront variants through the POS path. Use a 144x144 delivery canvas that
  preserves image aspect ratio rather than stretching it. Do not advertise a
  thumbnail path unless the asset exists. Keep a verified persisted fallback for
  legacy assets until a new thumbnail is available.
- Reset failed/hidden image state when the source changes. Prevent `picture` or
  `srcset` from selecting a larger asset for these POS thumbnails. Store the new
  asset, commit its association, and only then clean up replaced unreferenced
  POS assets through the existing lifecycle; never delete shared Storefront assets.
- Exit gate:
  - [ ] Actual newly generated thumbnails decode to 144x144 and return image
    content successfully; network evidence confirms both screens use them.
  - [ ] Replacing a failed URL makes the image visible again.
  - [ ] Five-image selection preserves the documented primary-image semantics.
  - [ ] Storefront image URLs, gallery order, visibility, and variants are unchanged.
- Risk: legacy asset metadata and shared ownership; no automatic destructive backfill.

### 289-D - Bound browser work and catalog refreshes

- Owner: frontend implementer. Depends on 289-B and 289-C.
- Work: decode each selected image once for the shared preview, validate source
  byte/pixel limits, prefer supported off-main-thread processing, and provide a
  bounded fallback for supported WebViews. Cancel remaining decode work after
  replacement/unmount. Release image bitmaps, blobs, timers, and listeners.
- Use a finite retry budget (initial request plus at most three automatic retries
  per image version), increasing delays, and a visible manual retry. A new URL
  resets its own budget. Coalesce save/SSE/reconnect refresh triggers, allow at most
  one in-flight read per catalog query key plus one pending rerun, and reject stale
  responses. Preserve grants, cart, draft, search, filters, and scroll position.
- Exit gate:
  - [ ] Broken images stop retrying after the budget, including after navigation.
  - [ ] Obsolete decode work stops; no active consumers reference revoked blobs.
  - [ ] Burst invalidations do not start overlapping identical catalog reads.
  - [ ] Image updates do not clear operational POS state or remount every card.
- Risk: full-source fallback decoding still costs memory; cap it and measure it.

### 289-E - Single-item acceptance and ledger closure

- Owner: QA with frontend/backend implementer. Depends on 289-B through 289-D.
- Inputs: local signed-in POS, controlled image fixtures, browser diagnostics,
  and the target APK device/WebView for the device acceptance gate.
- Exit gate:
  - [ ] 1-image and 5-image upload/save/replace flows pass in Items and Sell.
  - [ ] Tenant switch, logout, navigation, offline recovery, thumbnail failure,
    and rapid re-upload regressions pass.
  - [ ] Desktop/mobile rendered checks and the actual APK show no blank screen,
    uncaught runtime error, or repeated failing request loop.
  - [ ] Focused backend/frontend tests, affected builds, and governance gates pass.
  - [ ] Attach commands/results, asset dimensions/requests, screenshots/traces,
    device details, measured timings, and residual risks to the closure record.

Do not mark Phase 289 completed until every required gate above passes. If the
APK is unavailable, record `environment-access` as the missing evidence and keep
device acceptance open; desktop results do not substitute for it.

## Phase 290 - Recoverable 500-image ZIP + CSV upload

**Status:** in progress; work packages 290-A through 290-D are implemented and
290-E automated closure is complete. Actual APK evidence remains open.
**Owner:** backend implementer for transport/worker; frontend implementer for POS
workflow; QA for recovery, security, and performance evidence.
**Dependency:** Phase 289 acceptance for integrated delivery. Contract discovery
in 290-A may run alongside Phase 289; bulk delivery must not bypass its exit gate.

### Phase 290 transport and lifecycle candidate (2026-09-05)

290-A through 290-D are now implemented locally. Redis is available at
127.0.0.1:6379 with append-only persistence for local development; production must
provide its own durable shared Redis and worker-accessible persistent storage.
Manifest, storage, worker, catalog, and frontend tests cover the frozen contract.
Real Redis probes verify idempotent creation, chunk/final archive handling, reliable
dequeue/recovery, fencing, global concurrency, item exclusion, acknowledgement,
failure retention, and atomic failed-only retry. Phase closure still requires the
actual APK performance evidence specified in 290-E; automated evidence does not
substitute for it.

The approved workflow uses one ZIP plus one UTF-8 CSV manifest. The manifest has
the exact headers `sku_code,image_filename,replace_existing`; it contains 1-500
data rows, one unique SKU and one unique ZIP filename per row. `replace_existing`
must be `true` or `false`; replacement is never inferred. Every archive image must
be mapped exactly once and every mapping must resolve to one existing tenant item.
Unmatched, duplicate, missing, or extra entries make finalization fail before any
catalog image is changed. The workflow never creates items.

Transport is resumable and does not send the whole archive in one request:

1. `POST /api/v1/pos/catalog-image-imports` creates or replays an idempotent upload
   session from archive metadata and the CSV manifest.
2. `PUT /api/v1/pos/catalog-image-imports/:job_id/chunks/:chunk_index` writes one
   authenticated chunk after checking its declared SHA-256. A matching replay is
   a no-op; a conflicting replay fails closed.
3. `POST /api/v1/pos/catalog-image-imports/:job_id/complete` verifies all chunks,
   assembles the ZIP on persistent storage, validates/extracts entries lazily, and
   durably enqueues one task per mapped image before returning `202`.
4. `GET /api/v1/pos/catalog-image-imports/:job_id` returns tenant-scoped paginated
   per-file results. `POST .../:job_id/retry-failed` queues only retryable failures.

Frozen safety limits: 500 images; 10 MiB uncompressed per image; 512 MiB compressed
archive; 1 GiB total expanded image bytes; 1 MiB CSV; 6 MiB chunks; 25:1 maximum
per-entry and aggregate expansion ratio; 1,000 ZIP entries including directory
metadata; 24-hour upload/result retention; 30-minute processing lease; 3 attempts
per file with backoff; and 2 active processing tasks globally. Accepted files live
under the existing persistent `/app/uploads` volume, never Redis. Redis stores job,
chunk, lease, attempt, and result metadata and is fail-closed for create/finalize/
retry in production. The current one-instance topology and shared mounted uploads
volume satisfy worker access; scaling beyond one API host requires shared durable
object/file storage before enabling this feature there.

ZIP validation rejects absolute/traversal/backslash paths, nested paths/archives,
symlinks, encrypted entries, duplicate normalized names, unsupported compression,
unsupported extensions/signatures, oversized entries, and expansion-limit breaches.
Only JPEG, PNG, and WebP are accepted. Processing is idempotent and fenced per
item/version so an older bulk task cannot replace a newer accepted upload. Completed
files are not reprocessed by retry. Disabling new submissions does not stop already
accepted jobs. Storefront fields and assets are never read as write targets.

### 290-A - Freeze bulk limits, persistence, and mapping contract

- Inputs: existing upload middleware, ingress limits, Redis configuration, worker
  topology, filesystem lifecycle, SKU matching rules, permissions, and fixtures.
- Work: record the ZIP + CSV schema, one POS primary-image mapping per existing
  SKU, 500-image maximum, duplicate handling, explicit replacement confirmation,
  and per-file outcome contract. Reject ambiguous/unmatched mappings; never create
  items or silently overwrite duplicates. Preserve visibility and Storefront data.
- Define compressed/expanded total bytes, per-entry bytes/pixels, entry count,
  compression-ratio limits, transfer timeout/chunk budget, result retention, and
  cleanup ownership. Prove the transfer can fit actual ingress constraints; a
  resumable bounded-chunk transfer must not require one huge HTTP request.
- Verify Redis persistence/recovery and worker-accessible durable disk storage.
  Define job identity, per-file identities, idempotency, leases, attempt fencing,
  retry limits, expiry, and authenticated result access. Worker restart survival
  must cover both job metadata and accepted file bytes.
- Readiness: discovery-ready; delivery is not ready until these inputs are verified.
- Exit gate:
  - [ ] Contract and ADR 0017 amendment are recorded; all numerical limits and
    cleanup/retention behavior are explicit and tested against representative files.
  - [ ] Redis/storage requirements and any additive schema changes are documented.
  - [ ] Loss/expiry semantics are honest; no silent in-memory production fallback.
- Risk: queue metadata without surviving files is not a recoverable upload.

### 290-B - Safe upload transport and archive validation

- Owner: backend implementer. Depends on 290-A and Phase 289 acceptance.
- Work: stage bounded upload chunks on disk with progress/resume identity, enforce
  server-side authorization and limits, validate CSV mappings and image signatures,
  and inspect archives safely before work is accepted. Reject traversal paths,
  symlinks, nested archive abuse, ZIP bombs, duplicate mappings, and unexpected
  content. Do not extract everything into application memory or browser previews.
- Clearly distinguish transfer completion, durable acceptance, and processing
  completion. Processing does not keep the original upload request open. Safely
  expire abandoned partial uploads without touching active accepted jobs.
- Exit gate:
  - [ ] A valid 500-image package transfers under the agreed limits without an
    oversized ingress request or synchronous image conversion in the request.
  - [ ] Invalid/unauthorized/cross-tenant inputs fail safely with useful feedback.
  - [ ] Interrupted transfer can retry/resume within retention without duplicate jobs.
  - [ ] No success acknowledgement precedes the agreed persistence boundary.
- Risk: timeout or lost acknowledgement after acceptance; idempotent replay is required.

### 290-C - Durable processing and per-file recovery

- Owner: backend implementer. Depends on 290-B.
- Work: use persistent Redis-backed job state/queue with acknowledged ownership,
  recoverable leases, bounded attempts, and retry backoff. Begin with a global
  ceiling of two active image-processing tasks, enforce tenant fairness/backpressure,
  and tune only from measured API/worker resource evidence. Establish tenant context
  and authorization for each attach operation; do not derive authority from CSV data.
- Fence item-image writes so delayed workers cannot overwrite a newer interactive
  upload. Persist successful file outcomes before acknowledging work; reconcile a
  crash between asset persistence and queue acknowledgement idempotently. Derive
  aggregate progress from per-file state. Emit catalog invalidation after commits.
- Exit gate:
  - [ ] API/worker restart does not silently drop accepted work; expired leases recover.
  - [ ] Redis interruption fails safely and resumes as specified, without false success.
  - [ ] A failed file does not prevent unrelated files from completing; retrying failures
    does not repeat completed attachments or overwrite a newer image version.
  - [ ] Repeated submission, competing workers, and same-item uploads cannot corrupt
    associations; processing and memory stay within the agreed global budget.
- Risk: at-least-once processing requires idempotent effects, not an "exactly once" claim.

### 290-D - POS progress, results, and responsive catalog integration

- Owner: frontend implementer. Depends on 290-B and 290-C.
- Work: provide one POS upload workflow with separate transfer/processing progress,
  per-file failure reasons, completed/skipped/failed totals, and retry-failed action.
  Recover job status after navigation/reload using authenticated job identity, not
  cached file bytes. Use bounded bulk-status polling only while needed, with backoff
  and timer cleanup under the newly documented bulk contract.
- Keep results paginated and image rendering limited to the visible catalog page.
  Fix catalog pagination/completeness where a first-200-item read would omit some
  of the 500 targets. Refresh through authorized catalog GETs, coalescing bursts.
  For bulk files not locally decoded, show progress/previous imagery until each
  persisted thumbnail is ready; do not promise 500 immediate local previews.
- Exit gate:
  - [ ] Items and Sell receive processed images without manual reload or state loss.
  - [ ] All 500 results remain reachable beyond the first query window.
  - [ ] Closing the app after durable acceptance does not stop worker processing;
    closing during transfer is clearly distinguished and is resumable within policy.
  - [ ] Retrying failed files preserves successful counts and associations.
  - [ ] Scrolling and ordinary POS input remain usable while progress changes.
- Risk: unbounded result lists and refresh bursts can negate worker-side improvements.

### 290-E - Security, recovery, APK performance, and final closure

- Owner: QA with backend/frontend implementer. Depends on 290-D and all prior gates.
- Work: run the validation matrix below with bounded local processing, not 500
  concurrent HTTP/image operations. Capture before/after evidence using the same
  device, dataset, network profile, and interactions.
- Exit gate:
  - [ ] Every accepted file has exactly one reconciled terminal outcome; totals agree.
  - [ ] Recovery, idempotency, tenant isolation, archive abuse, and permissions pass.
  - [ ] Actual APK interaction/memory/network evidence meets the agreed budgets.
  - [ ] Storefront and existing single-image behavior remain regression-clean.
  - [ ] All required tests/builds/governance checks pass and operating instructions
    describe failures, retries, retention, worker recovery, and safe disabling.
  - [ ] Ledger evidence and completion date are recorded only after all gates pass.

## Validation matrix and measurement contract

| Scenario | Required evidence |
| --- | --- |
| 1 and 5 images | Save, immediate preview, matching loaded 144px handoff in Items/Sell; primary-image ordering preserved. |
| 500-image ZIP + CSV | Counts reconcile; bounded transfer/processing; results beyond item 200 reachable; failed-only retry. |
| Rapid replacement | Reverse-order responses and worker completions cannot remove/overwrite the latest attempt. |
| Missing/corrupt/oversized images | Bounded retry; useful errors; prior valid persisted image remains authoritative. |
| Disconnect/reload/restart | Transfer vs acceptance distinguished; accepted work recovers; no duplicate attachment. |
| Tenant/session/permission changes | No preview, job, asset association, or result leaks across scope; unauthorized mutations rejected. |
| Archive abuse | Traversal, symlink, nested archive, duplicate-entry, expanded-size, and signature checks enforced. |
| Storefront regression | Existing public URLs, gallery order, selection, visibility, and variants unchanged. |
| APK load | Repeatable input latency, scroll trace, memory trend, image request counts, and console health. |

Proposed performance gate: p95 time from ordinary tap/typing input to visible UI
response is at most **200ms** while background processing runs, measured over at
least 100 interactions on the named target device. Record device model/RAM,
Android/WebView versions, build SHA, image byte/pixel distribution, viewport,
network profile, sample count, and p50/p95/max. Report upload time and worker time
separately; neither is the interaction-latency metric. If the baseline cannot meet
the target, record the failing measurements and revise the budget explicitly,
not silently. Do not claim a guaranteed frame rate.

Memory/network gates: all replaced/unmounted preview resources and listeners are
released; repeated upload/navigation cycles leave no growing retained preview/job
collection. Capture heap/resource trends across at least ten cycles and record
the measured peak. Stop repeated 404 loops at the retry budget, show no overlapping
identical catalog reads, and keep only page-bounded images mounted. Freeze numerical
worker/heap budgets in 290-A after measuring the available environment.

Required checks at implementation closure:

- Executable frontend preview/renderer/refresh tests, including the failures from
  289-A. Shared frontend tests run from `apps/dgfy-ims`, per ADR 0071.
- Backend storage, catalog serialization, worker/status, validation, restart,
  idempotency, and tenant-isolation tests; real Redis integration, not mocks alone.
- POS build and all other builds affected by shared-code changes, plus Storefront
  regression proof where shared helpers are touched.
- Local desktop/mobile rendered checks and actual APK evidence; load testing stays
  local, bounded, and isolated from real merchant or financial data.
- `npm run check:architecture`, `npm run lint:docs` (includes ADR validation),
  applicable compliance checks, and `git diff --check`.

## Rollout, safety, and open prerequisites

Deliver the single-item repair before exposing bulk upload. Keep new bulk entry
points disabled until persistence and acceptance gates pass; select the flag/config
name using existing conventions during 290-A. Disabling new bulk submissions must
not discard accepted jobs or remove access to their results. Retain the proven
single-item path. Deployment and production operations require a separate request.

Do not reset databases, delete originals in a broad backfill, flush Redis, or remove
shared assets as part of this plan. Existing asset migrations/backfills require an
inventory, dry-run report, explicit scope, and recovery strategy. Any additive schema
change must be tested through the migration runner and tenant schema checks; no
database migration is executed merely to record the plan.

Open prerequisites are scoped, not reasons to stop independent work:

- `environment-access`: actual APK device and repeatable performance setup are
  required for 289-E/290-E; local race regressions can proceed independently.
- `missing-design` / `external-dependency`: production-equivalent Redis persistence,
  worker/storage topology, ingress/chunk limits, and retention must be verified in
  290-A before bulk delivery is considered implementation-ready.
- `missing-data`: representative authorized image fixtures and sizes are required
  to set realistic expanded-byte, pixel, and memory limits.

## Recording evidence and next action

On 2026-09-05, `npm run check:architecture` passed (54 modules / 561 code files;
94 controller files). This is architecture baseline evidence only, not upload
correctness or APK performance proof. The earlier Phase 289 completion claim is
withdrawn in the ledger with its historical test/build claims preserved as history.

### Phase 289 implementation handoff - 2026-09-05

The local corrective implementation is ready for user acceptance testing:

- Shared attempt-scoped previews, tenant/session invalidation, bounded decode
  leases, safe loaded-image handoff, finite image retries, and coalesced catalog
  reads are implemented. Items and Sell use the same image renderer.
- The backend generates real 144x144 POS assets and verifies derivative existence
  in POS catalog projections. Tests verify the Storefront manifest is unchanged.
- Post-create setup binds image tracking immediately after queue acceptance.
  Recovery resubmits only failed image stages, avoiding duplicate accepted uploads.
- ADR 0017's 2026-09-05 amendment records the POS-only delivery contract and
  event/read-driven status reconciliation; no per-item polling loop is added.
- No database migration, destructive backfill, commit, deployment, or Phase 290
  bulk implementation was performed in this corrective pass.

Automated evidence (local, not browser/device acceptance):

- IMS test runner: `npm test -- PosItemImage.test.jsx posPendingItemImagePreviewStore.test.js posCatalogReadCoordinator.test.js posImageUploadReconciliation.test.js posImagePreview.test.js posCheckoutTerminalUtils.test.js SelectedItemImageCarousel.behavior.test.jsx posCatalogPerformance.contract.test.js posItemsGalleryAndCsvImport.contract.test.js --maxWorkers=1`: **9 files, 39 tests passed**.
- API runner: `npm test -- --runTestsByPath tests/imageAssetStorage.util.test.js tests/posRepository.catalogImages.test.js tests/catalogImageUploadWorker.test.js tests/catalogImageUploadStatusStore.test.js`: **4 suites, 14 tests passed**.
- POS, IMS, and Storefront production builds passed. Architecture checks passed
  (54 modules, 561 files, 94 controllers). Documentation checks (29 governed docs,
  88 ADRs) and whitespace checks passed after the handoff update.
- The partial-create recovery assertion is a source contract, not a full rendered
  recovery test. Behavioral tests cover stale attempts, session cleanup, failed
  thumbnail retention, bounded retries, decode leases, and read coalescing.

User owns the remaining rendered/browser/APK testing, as explicitly requested.
No further browser automation will be run. Check one and five images, rapid
replacement, Items-to-Sell navigation, reload, failure/retry, logout/tenant switch,
and scrolling while uploads run. Record device/WebView details and observed timing;
unit tests and builds do not prove real-device latency. Existing large-bundle
warnings remain; zero lag and 500-image throughput are not claimed.

The user reported the visible upload test as successful on 2026-09-05. The test
surface/device details and measured timings were not supplied, so this is recorded
as user acceptance feedback rather than verified APK performance evidence.

Current execution: **Phase 290-E in progress**. Phase 289 remains in progress only
for its named device-evidence gate; its corrective code path is user-accepted.
The combined exit checkboxes above remain open where rendered/device evidence is
required; implementation readiness is not phase closure. Phase 290 is in progress
and depends on 289 acceptance. The next unallocated phase remains **291**.

290-B completion update (2026-09-05): raw packages and extracted originals now stage
under private `apps/dgfy-api/storage/pos-image-imports`, outside the public uploads
tree. UUID/path containment, exclusive chunk creation, durable file flushes, chunk
index/count/size bounds, flat ZIP entry rules, expansion limits, and partial-file
cleanup are implemented. Authenticated create/replay, chunk upload, completion, and
tenant-scoped status routes are wired behind the item-edit permission and feature
flag. A real local Redis probe passed create, chunk verification, archive assembly,
manifest/SKU mapping, enqueue, and status; the focused manifest/storage suites pass
19 tests, the unauthenticated live route returned 401, and API health remained 200.
290-B is complete; processing delivery is recorded in the 290-C update below.

290-C completion (2026-09-05): the Redis queue now uses a processing list and fenced
acknowledgement instead of destructive dequeue. Startup recovery requeues abandoned
tasks, global Redis slots cap processing at two files, per-item leases serialize bulk
and interactive POS image changes, latest-version checks supersede stale jobs, and
failed-only retry is atomic with three-attempt source retention/cleanup. The live
worker failure path passed drain, isolation, two retained retries, and final cleanup;
real Redis probes passed recovery, lease fencing, item exclusion, global concurrency,
acknowledgement, and concurrent retry (`1` accepted, `1` rejected). No merchant
catalog data was mutated for this verification. The isolated worker suite proves
the successful tenant-context commit contract,
fenced acknowledgement, catalog event, terminal staging cleanup, and stale-version
supersession. 290-C is complete.

290-D completion (2026-09-05): POS Items now accepts exactly one ZIP package and
one CSV manifest, uploads sequential 6 MiB chunks with per-chunk SHA-256, displays
non-blocking upload/processing totals, retrieves every paginated per-file result,
shows failed details, and offers failed-only retry. Browser memory remains bounded
to a chunk because the API streams the assembled archive hash. The control uses the
same `items:edit` permission as its endpoints, refreshes Items/Sell through the
existing catalog notification path, and does not change Storefront behavior. Nine
focused POS files pass 39 tests, the POS production build passes (with the existing
large-chunk warning), API/POS health return 200, and no browser automation ran.
290-D is complete; 290-E remains.

290-E automated closure update (2026-09-05): disabling the feature now rejects
only new session creation; accepted uploads, result reads, completion, retries, and
worker draining remain available. Reselecting the same ZIP/CSV package derives a
stable idempotency key from bounded metadata plus the manifest, so uploaded chunks
replay safely without reading the full ZIP into browser memory. Polling removes its
abort listener after every wait. Duplicate-case filenames and high-expansion ZIP
entries have dedicated rejection tests. Focused API suites pass 35 tests, focused
shared POS suites pass 40 tests, POS/IMS/Storefront production builds pass,
architecture and documentation checks pass, and the compliance declaration is
recorded. The existing large-bundle build warnings remain. Browser automation was
not run at the user's request. APK interaction, memory, and request-count evidence
is the only Phase 290-E gate still open.

### Phase 290 operating instructions

- Local development requires Redis at `127.0.0.1:6379`, `REDIS_URL`, append-only
  persistence, and `POS_BULK_IMAGE_IMPORT_ENABLED=true`. Production must use a
  monitored shared durable Redis; the code intentionally has no in-memory fallback.
- To stop new imports safely, set `POS_BULK_IMAGE_IMPORT_ENABLED=false`. Keep Redis,
  persistent staging, and the worker available until accepted jobs reach terminal
  outcomes and their 24-hour result window ends.
- A transfer interruption is resumed by selecting the same ZIP and CSV again. The
  create request replays the same job and already persisted matching chunks are
  no-ops; changed package metadata or manifest content creates a distinct identity.
- Retry only failed files from the job result. Completed, skipped, or superseded
  files are not repeated. Sources are retained through the third attempt and then
  removed by job-scoped cleanup.
- On worker/API restart, expired processing leases are returned to the reliable
  queue. Do not flush Redis or broadly delete `storage/pos-image-imports`; inspect
  tenant-scoped job results and Redis/storage health before any manual cleanup.
- No database migration is required. Storefront image data and rendering are outside
  this workflow and must not be changed during POS import operations.
