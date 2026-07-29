---
status: accepted
date: 2026-07-29
last_reviewed: 2026-07-29
classification: authoritative
---

# ADR 0039: Batch Menu Import via Asynchronous Extraction

## Context

ADR 0019 defines Food & Beverage workflow mode, and a single-file PDF/image menu importer already
ships behind `MENU_IMPORT_ENABLED` / `VITE_MENU_PDF_IMPORT_ENABLED`
(`backend/src/services/menuExtractionService.js`, `backend/src/controllers/menuImportController.js`,
`frontend/Components/items/PdfMenuImportModal.jsx`). It accepts exactly one file per HTTP request,
extracts items synchronously, and hands the result to the existing CSV import pipeline as a signed
CSV so imported rows get the same validation CSV-imported rows get.

Onboarding an F&B tenant realistically means several files: a multi-page PDF, a stack of phone
photos of a menu board, and scanned/image-only PDFs with no text layer. Four existing constraints
made "accept more files" impossible as a small change: nginx `client_max_body_size 8m` across every
server block (20 phone photos ≈ 40 MB), the shared axios `timeout: 60000` (20 sequential vision
calls ≈ 2 minutes), multer `files: 1`, and the absence of any job queue (the only precedent is
`backend/src/workers/geoInventoryWorker.js`, a Redis list). Batch extraction also multiplies AI
spend per import, which the single-file path never had to bound.

This change crosses the Inventory/POS and external-integration boundary. It follows
`docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`,
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0019, and ADR 0029.

## Decision

### Request/worker split

- Extraction moves off the request path into `backend/src/workers/menuImportWorker.js`. Upload,
  status, preview, and confirm requests are each sub-second, so the shared 60s axios timeout needs
  no change and no request holds an OpenAI call open.
- The worker performs **extraction only** and touches no tenant database. Every tenant-scoped check
  — F&B workflow mode, file-count cap, daily AI budget — runs in request context before the job is
  enqueued. The worker's only landlord write is the existing `AiUsageLog` logging inside
  `menuExtractionService`, which reaches the landlord DB through a static `models/index.js` import
  rather than tenant `dbStore` context.
- Uploader and worker are the same PM2 process (`exec_mode: 'fork'`, `instances: 1`). Multi-host
  deployment requires revisiting the on-disk temp-file assumption below.

### Job state

- Job state lives in Redis only, never a database table: one hash per job keyed
  `menu_import:job:<tenantId>:<jobId>`, one field per file plus `meta` and a `vision_calls_used`
  counter, TTL 3600s to match `cleanupService.js`'s temp-file rule. A tenant table would need a
  migration replicated across every tenant schema and would drag tenant DB context into the worker;
  a landlord table would place cross-tenant menu text in the shared DB for no durability benefit.
  The durable trails already exist elsewhere: `AiUsageLog`, `productUsageTelemetryService`, and the
  item audit trail written on confirm.
- Aggregate job status is never stored. It is derived on every read from the per-file statuses
  (`queued` / `running` / `completed` / `completed_with_errors` / `failed`), which removes any
  possibility of an out-of-sync aggregate field.
- Each file is enqueued as its own task on a shared `menu_import:queue` list. Redis `rPop` is
  atomic, so exactly one worker owns a given file task and every write to a `file:<fileId>` field
  has exactly one writer — there is no read-modify-write race to guard. The shared
  `vision_calls_used` counter uses `HINCRBY` plus a compensating `HINCRBY -1` when a reservation
  exceeds the cap, which is race-free under Redis's single-threaded execution without Lua.
- Uploaded files stay on disk; Redis holds paths only, never bytes. The worker unlinks a file the
  moment its extraction attempt settles either way, and `cleanupService.js`'s 15-minute sweep is the
  backstop. Batch uploads use their own multer `diskStorage` with UUID filenames rather than the
  shared storage, whose filename callback interpolates `file.originalname`.

### Merge and preview

- Merge and dedup run server-side in the preview use case, never in the client.
- Items are keyed on **normalized name alone**, not name plus price: two photos of the same board
  routinely disagree on price by one OCR digit, and a name+price key would emit both as separate
  items.
- Price conflicts are **surfaced, never silently resolved**. The first observed price is kept and
  the merged row carries `price_conflict: true` plus `observed_prices`, staying inside the normal
  editable preview flow. Price is a money field; a batch must not resolve one on the operator's
  behalf.
- Near-duplicates (Levenshtein ≤ 2 on normalized names, matching price) are reported as a
  review-only warning and never auto-merged.
- The merged batch is rendered as one signed CSV and passed through the same
  `previewItemsImportUseCase` the single-file and CSV paths use, so batch rows receive identical
  Joi validation, SKU de-duplication, and mode-taxonomy checks. Batch-wide SKU uniqueness comes from
  a `batchToken` derived from the job id plus a timestamp hoisted out of the per-row map.

### Scanned PDFs

- When a PDF yields no text layer, its pages are rendered to PNG buffers
  (`backend/src/services/menuPdfRasterService.js`, built on `pdfjs-dist` + `@napi-rs/canvas`) and
  each page runs through the existing image vision path. No new OpenAI-calling code is introduced.
- Truncation is **partial and flagged, never a silent drop and never a hard failure**. If either the
  per-file page cap or the batch-wide vision-call cap cuts a file short, the items already extracted
  are kept and the result carries `truncated: true` with `pages` and `pages_total`. Both the batch
  job status and the single-file preview response expose these fields, and the POS wizard renders
  them.

### In-app photo capture

- The POS wizard can capture menu photos directly from the device camera
  (`getUserMedia`, rear camera preferred). Captured frames are encoded as ordinary JPEG `File`
  objects and join the same staged list the file picker and drop zone feed, so job creation,
  polling, merge, and confirm cannot distinguish a captured photo from a picked one and needed no
  changes to support capture.
- A quality heuristic scores the live preview before the shutter and the captured frame after it:
  sharpness (std-dev of the Laplacian over luma), mean exposure, clipped-highlight ratio for glare,
  and source resolution.
- **The quality check warns and never blocks.** No threshold refuses a capture, no warned-about shot
  is discarded, and the scorer's `blocking` field is always false. A cheap heuristic cannot separate
  an unreadable photo from an unusual but legible menu (dark chalkboard, spotlit letterboard), and
  refusing an operator's photo on that basis is worse than letting the extraction try and showing
  them the result. This is the same rule the pipeline already applies to price conflicts and
  truncated scans.
- Camera access is requested only when the operator opens the capture surface, never on modal open.
  A denied permission, an absent camera, or a browser without `mediaDevices` degrades to the file
  picker rather than dead-ending, and camera tracks are stopped when the sheet is dismissed, when
  captures are handed over, and on unmount.
- Captured frames never leave the browser except as files on the same authenticated upload the
  picker uses; nothing is written to local storage and no preview is retained after the wizard
  closes.

### Cost control

Six server-side caps live in `backend/src/config/menuImportFeature.js`, all env-overridable:
`MENU_IMPORT_MAX_FILES_PER_BATCH` (20), `MENU_IMPORT_MAX_PDF_PAGES` (15),
`MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH` (25, enforced across the whole job),
`MENU_IMPORT_DAILY_USD_BUDGET` (5.0 USD per tenant per 24h, read from `ai_usage_logs` through a new
`(tenant_id, timestamp)` composite index), `MENU_IMPORT_WORKER_CONCURRENCY` (2 in-flight OpenAI
calls, also the per-file page-render concurrency; raising it must be weighed against PM2's 512MB
`max_memory_restart`), and `MENU_IMPORT_MAX_MERGED_ITEMS` (200 post-dedup, rejecting an over-large
batch outright rather than truncating it silently).

### Feature gating and endpoints

- Batch import has its own flags, `MENU_IMPORT_BATCH_ENABLED` and `VITE_MENU_IMPORT_BATCH_ENABLED`,
  both default off. The backend guard requires `MENU_IMPORT_ENABLED && MENU_IMPORT_BATCH_ENABLED &&
  OPENAI_API_KEY && REDIS_URL`; routes 404 when the flag is off and 503 with the missing list when
  the flag is on but configuration is incomplete. The batch path must be killable without regressing
  the single-file path that already shipped.
- Both single-file endpoints remain. `POST /items/import/menu/confirm` points at the same
  `confirmPdfImport` handler — there is nothing batch-specific about persisting already-previewed
  rows.
- Client flow: `POST /items/import/menu/jobs` (multipart `files`) → poll
  `GET /items/import/menu/jobs/:jobId` → `POST /items/import/menu/jobs/:jobId/preview` once the job
  reaches a terminal status → `POST /items/import/menu/confirm`. The job status projection strips
  extracted `items` and on-disk `path` before reaching the client.
- The POS Items wizard polls rather than holds a connection, caps its own polling at 10 minutes, and
  invalidates in-flight polls on reset so a stale response can never overwrite a newer run. Where
  the batch flag is on it replaces the single-file wizard at the same permission-gated entry point;
  neither wizard renders for a user who cannot already create items manually.

## Consequences

- Batch import has a hard Redis dependency the single-file path does not. With Redis down, the
  routes fail closed (503) and the single-file path continues to work.
- Job state is deliberately non-durable. A job lost to a Redis restart or its 1-hour TTL is
  unrecoverable and the operator re-uploads; nothing has been persisted to the tenant database at
  that point, so there is nothing to reconcile.
- A tenant that exhausts the daily USD budget is refused new jobs until the 24-hour window rolls,
  which is the intended failure mode for an AI-spend control.
- Extraction quality itself is unevaluated. This ADR governs the pipeline, caps, and review surface;
  whether the model reads a given menu well is a separate, still-open question, which is why every
  extracted row stays editable and every gap (conflict, near-duplicate, truncation, unreadable file)
  is shown rather than smoothed over.
- Multi-host deployment is out of scope: the design assumes uploader and worker share a filesystem.
- `pdfjs-dist` and `@napi-rs/canvas` are promoted from transitive to direct dependencies. Rendering
  was verified on darwin/arm64 and inside `node:22-alpine` on linux/arm64 with no extra system
  packages; linux/amd64 remains to be smoke-checked.

## Validation

- Unit-test job-status derivation across every transition, Redis-unavailable handling, job expiry,
  and the atomic vision-call reservation including its compensating decrement.
- Unit-test worker per-file isolation: a failing file becomes that file's `failed` result and never
  blocks the rest of the job.
- Unit-test merge/dedup: normalized-name keying, price-conflict surfacing, near-duplicate flagging,
  section/description retention, and the post-dedup item cap.
- Unit-test the preview use case for job-not-found, job-not-ready, no-completed-files, over-cap, and
  the happy path's merge shape and row annotation.
- Unit-test the rasterizer against real PDF buffers: every page under the cap, truncation flagged
  over it, single-page documents, corrupt buffers, and bounded concurrency.
- Unit-test the client job hook: polling to a terminal status then auto-preview, upload rejection
  surfacing the server's message and code, the polling ceiling, and reset abandoning an in-flight
  run.
- Component-test the POS wizard rendering price conflicts, near-duplicates, truncated scans, and
  unreadable files, and confirming only the rows still selected.
- Unit-test the photo quality heuristic against synthetic frames for each warning, that resolution
  is judged on the source frame rather than the analysis sample, and that the worst possible frame
  still returns `blocking: false`.
- Component-test capture: the rear camera is requested, a warned-about frame still allows the
  shutter and is still added, the batch's remaining slots bound the shutter, a refused permission
  falls back to the file picker, and camera tracks stop on hand-off and on unmount.
- Verify both flags off returns 404 on every batch route, and flag-on-without-Redis returns 503 with
  the missing configuration listed.
- Run architecture guardrails, controller-boundary checks, the compliance impact check, the frontend
  production build, and the menu-import backend suites.
