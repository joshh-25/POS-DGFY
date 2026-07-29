---
status: reference
authority_level: reference
owner: backend
last_reviewed: 2026-07-29
applies_to: menu_import, pos_frontend, backend
topic: menu_import_batch_handoff
---

# Batch Menu Import (Multi-File + Camera Capture) — Handoff

Date: July 28–29, 2026 (Phases 1–4 + 6)
Branches:
- `claude/menu-import-batch-async` — Phases 1–3, **PRed to `main`**:
  https://github.com/Sieitzz/dgfy-platform/pull/133 (three commits: `447ceb03` Phase 1,
  `e1c02e69` Phase 2, `57c71030` Phase 3)
- `claude/menu-import-batch-handoff-2fnerq` — continues from the same history and adds **Phase 6
  (governance) and Phase 4 (frontend)**. See "What's built so far" below.

**Phase 5 (camera capture + quality scoring) and Phase 7 (single-file deprecation) are the only
phases still unbuilt.**

## Purpose

This note is for whoever (human or AI) picks up this build next. It exists so a different
assistant/tool can continue without re-deriving the design decisions already made, or the
constraints that shaped them. **Phases 1–4 and 6 of a 7-phase plan are built.** Read this whole
doc before touching the code — the "don't re-derive" section especially. This doc has already
saved one recovery: an earlier session lost its Phase 2 planning to a client crash, and the
previous version of this file (Phase-1-only) was what let a fresh session reconstruct Phase 2
correctly instead of guessing. Keep this doc current as later phases land — that's the whole point
of it.

## Background — what already existed before this work

A single-file PDF/image menu importer already shipped on `develop`, env-gated OFF
(`MENU_IMPORT_ENABLED` / `VITE_MENU_PDF_IMPORT_ENABLED`):

- `backend/src/services/menuExtractionService.js` — PDF via `pdf-parse` (text only, no OCR),
  PNG/JPG via `gpt-4o` vision. Produces a **signed CSV** that round-trips through the real
  `csvImportService.previewImport`/`confirmImport`, so imported rows get identical validation to
  CSV-imported ones.
- `backend/src/controllers/menuImportController.js` — `previewPdfImport`/`confirmPdfImport`,
  synchronous, one file per HTTP request.
- `backend/src/config/uploadConfig.js`'s `menuImportFileUpload` — multer, `files: 1`.
- `frontend/Components/items/PdfMenuImportModal.jsx` — 3-step wizard (Upload/Review/Result),
  single file only, mounted in the POS Items view (`TerminalOperationsWorkspace.jsx`). **Still
  single-file and untouched — Phase 4 deliberately added a sibling batch wizard rather than
  modifying it (see D11).**
- `docs/compliance/impact-declarations/2026-07-25-pos-pdf-menu-import.md` — the impact
  declaration for that original single-file feature.

## The ask and the constraints that shaped the design

The user wants to extend this to: **multiple PDFs**, **multiple images**, **scanned/image-only
PDFs** (no text layer), and **in-app photo capture** (with a pre-shutter quality check that warns
but never blocks), all *before* anyone evaluates whether the AI extraction itself is any good.
Four things made "just accept more files" not viable as a small change:

| Blocker | Location | Consequence |
|---|---|---|
| `client_max_body_size 8m` × 6 server blocks | `infrastructure/docker/nginx/nginx.conf.template` | 20 phone photos ≈ 40 MB → 413 at the edge |
| axios `timeout: 60000` | `frontend/src/services/api.js:199` | 20 sequential vision calls ≈ 2 min → client aborts |
| multer `files: 1` | `backend/src/config/uploadConfig.js` | multi-file wasn't expressible in the contract |
| No job queue anywhere | — | only precedent is `backend/src/workers/geoInventoryWorker.js` (a Redis list) |

Plus two latent correctness bugs that only bite at batch scale (both fixed in Phase 1, see below):
`slugForSku` used to recompute `new Date()` **inside** the row map (a batch straddling a second
boundary emitted mixed SKU stamps, and a SKU collision resolves to a silent **UPDATE** in
`previewImport`, overwriting a prior import's item), and `MAX_MENU_ITEMS_PER_IMPORT = 200` was
enforced *per OpenAI response*, so 20 files meant a 4,000-item ceiling, not a 200-item one.

**A third, unrelated bug was found by Phase 3's tests** (see D10) — `extractPdfText` had never
actually been exercised against a real PDF buffer in any test before Phase 3, and was calling
`pdf-parse@2`'s export using the old v1 API. Fixed as part of Phase 3; see below.

## Architecture decisions — already settled, do not re-derive

**D1 — The worker extracts only; all tenant DB work stays in request context.**
`geoInventoryWorker.js` is **not** a tenancy template — it uses the shared `sequelize` from
`config/database.js` against landlord `geo_*` tables and never calls `dbStore.run()` (verified: zero
`dbStore` references in that file). The batch import worker follows the same shape but is fully
tenant-DB-free by design:
- **Upload request** (full tenant context): fnb workflow-mode check → file-count cap → daily
  AI-budget check → write job manifest to Redis → return `job_id`. Sub-second.
- **Worker**: reads file paths off Redis, calls OpenAI, writes per-file results back. Touches no
  tenant DB. Its only write is `menuExtractionService`'s existing `AiUsageLog` logging, which
  reaches the landlord DB via a **static** `models/index.js` import — not `dbStore` context. (Do
  not "fix" that static-import quirk; it's existing, intentional behavior.)
- **Preview request** (full tenant context, **Phase 2, built**): merge + dedup → one signed
  CSV → `previewItemsImportUseCase`.
- **Confirm request**: unchanged, reuses the existing single-file handler directly.

Consequence worth remembering: every request in this design is sub-second, so **the 60s axios
timeout needed no change** — that blocker turned out to be a non-issue once the design moved
extraction off the request path.

**D2 — Job state lives in Redis only, never a DB table.** One hash per job, key
`menu_import:job:<tenantId>:<jobId>`, one field per file (`file:<fileId>` → JSON) plus a `meta`
field, **plus (Phase 3) a `vision_calls_used` counter field — see D10**. TTL 3600s (matches
`cleanupService.js`'s 1-hour temp-file rule). A tenant table would need a migration replicated
across every tenant schema and would drag tenant DB context back into the worker (killing D1); a
landlord table would put cross-tenant menu text in the shared DB for no durability benefit — the
real audit trails already exist elsewhere (`AiUsageLog`, `productUsageTelemetryService`, the item
audit trail on confirm). Job **status is never stored** — it's derived on every read from the
per-file statuses (queued/running/completed/completed_with_errors/failed), which sidesteps keeping
an aggregate field in sync entirely.

**Concurrency note (an improvement over the original plan write-up, not a deviation from its
intent):** each file is queued as its own task
(`{tenantId, jobId, fileId}` pushed to a shared `menu_import:queue` list). Because Redis `rPop` is
atomic, exactly one worker "owns" a given file task at a time, so every write to a `file:<fileId>`
hash field is made by exactly one writer — there is **no read-modify-write race to guard against
at all**, not even via CAS. Phase 3's `vision_calls_used` counter extends this same argument to a
shared field: `HINCRBY` is also atomic under Redis's single-threaded execution, so the
increment-then-compensate pattern in D10 is race-free without Lua too.

**D3 — Files stay on disk; Redis holds paths only, never bytes.** Manifest per file:
`{file_id, path, mime_type, size, original_name, status, ...}`. Cleanup: the worker unlinks a file
the moment its extraction attempt settles (success or failure); `cleanupService.js`'s existing
15-min cron is the backstop. **Single-instance assumption**: PM2 runs `exec_mode: 'fork', instances:
1`, so uploader and worker are the same process; do not design for multi-host without revisiting
this.

**D4 — Merge + dedup runs in the preview use case, server-side, never the client. Built in Phase 2**
(`modules/menuImport/support/mergeMenuImportItems.js`,
`modules/menuImport/usecases/previewMenuImportJobUseCase.js`). Key on **normalized name alone**,
not name+price (two photos of the same board routinely disagree on price by one OCR digit; a
name+price key would produce duplicate-looking items). Price conflicts are **surfaced, never
silently resolved** (`price_conflict: true` + `observed_prices` on the affected preview row) — this
is a money field, and the row stays in the normal editable preview flow rather than blocking the
batch or needing separate UI. No fuzzy auto-merge; near-duplicates (Levenshtein ≤2, matching price)
are flagged as a review-only warning (`merge.near_duplicates` in the preview response), never
merged automatically. A post-dedup item cap (`MENU_IMPORT_MAX_MERGED_ITEMS`, default 200) rejects
an over-large merged batch outright rather than truncating it silently.

**D5 — Batch-wide SKU uniqueness (Phase 1).**
`buildSignedCsv(items, { skuPrefix = 'PDFMENU', batchToken = '' } = {})` in
`menuExtractionService.js` now hoists the timestamp **out of** the row `.map()` (fixing the
straddling-second bug) and accepts a `batchToken` so a multi-file batch's SKUs stay unique and
contiguous across the whole batch, not per-file. Defaulted params keep the existing single-file
test suite green untouched.

**D6 — Cost control: six caps, all server-side**, in `backend/src/config/menuImportFeature.js`:
`MENU_IMPORT_MAX_FILES_PER_BATCH` (20), `MENU_IMPORT_MAX_PDF_PAGES` (15, **now consumed by Phase
3's rasterizer**), `MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH` (25, **now consumed by Phase 3 — see
D10**), `MENU_IMPORT_DAILY_USD_BUDGET` (5.0, USD/tenant/24h, checked via a `(tenant_id,
timestamp)` composite index — see migration below), `MENU_IMPORT_WORKER_CONCURRENCY` (2 in-flight
OpenAI calls, also reused as Phase 3's per-file page-render concurrency — don't raise without
reconsidering PM2's 512MB `max_memory_restart` ceiling), `MENU_IMPORT_MAX_MERGED_ITEMS` (200,
Phase 2's post-dedup ceiling).

**D7 — A separate flag, in the same config file.** `MENU_IMPORT_BATCH_ENABLED` +
`VITE_MENU_IMPORT_BATCH_ENABLED`. The batch path adds a background worker, a hard Redis
dependency, and materially more AI spend per import — it must be killable independently of the
single-file path that already shipped. Guard requires
`MENU_IMPORT_ENABLED && MENU_IMPORT_BATCH_ENABLED && OPENAI_API_KEY && REDIS_URL`.

**D8 — Both single-file endpoints stay; confirm is reused, not duplicated.**
`/items/import/pdf/preview` and `/confirm` are untouched. `POST /items/import/menu/confirm` points
at the **same** `confirmPdfImport` handler — there is nothing batch-specific about persisting
already-previewed rows. Still true after Phase 2/3 — no new confirm path was added.

**D9 — Preview response shape (Phase 2).** `POST /import/menu/jobs/:jobId/preview` returns the same
shape `previewItemsImportUseCase` already produces (`rows`, `validRows`, `invalidRows`, ...), plus
a `merge` object: `{files_considered, files_excluded, items_before_dedup, items_after_dedup,
conflicts, near_duplicates}`. Rows carrying a price conflict get `price_conflict: true` +
`observed_prices` merged in by index (row *i* ↔ merged item *i* — CSV/parse order is preserved
end-to-end from `buildSignedCsv` through `previewImport`).

**D10 — Scanned-PDF rasterization and its cost controls (Phase 3).** When `extractPdfText` returns
empty, `extractMenuItemsFromFile` (`menuExtractionService.js`) falls back to rendering the PDF's
pages to PNG buffers (`menuPdfRasterService.rasterizePdfPages`, built on `pdfjs-dist` +
`@napi-rs/canvas`) and running **one OpenAI vision call per page** through the existing
`extractMenuItemsFromImage` — no new OpenAI-calling code. Two caps apply:
- `MENU_IMPORT_MAX_PDF_PAGES` (15) — only the first N pages of a longer scan get rendered.
- `MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH` (25) — enforced **across the whole batch job**, not
  per file, via a new atomic Redis counter (`reserveVisionCall` in
  `menuImportJobRepository.js`, `vision_calls_used` hash field, `HINCRBY` +
  compensating `HINCRBY -1` if over cap — no Lua needed, see D2's concurrency note). The
  single-file synchronous path has no batch/shared budget, so it only respects the per-file page
  cap.

**Explicit product decision (user-confirmed, not inferred): truncation is partial + flagged, never
a silent drop, never a hard failure.** If a file's pages get cut short by either cap, whatever
items *were* extracted are kept, and the result carries `truncated: true` + `pages`/`pages_total`.
This applies to both the batch worker (`setFileResult`'s stored record) and the single-file
`previewPdfImport` response (`pages`/`pages_total`/`truncated` added to its JSON — it has no
"preview metadata" layer like Phase 2's batch preview does, so this needed its own wiring). Same
philosophy as D4's `price_conflict` handling: surface the gap, don't block, don't quietly hand back
an incomplete result that looks complete.

**D11 — The batch wizard is a sibling component, not a mode inside the single-file one (Phase 4).**
`frontend/Components/items/MenuImportBatchModal.jsx` is new; `PdfMenuImportModal.jsx` is untouched.
The batch flow has an asynchronous processing stage (progress bar, per-file status/failure list) and
a merge-review layer (price conflicts, near-duplicates, truncated scans) that the synchronous
single-file wizard has no concept of, and the two flags ship independently — folding both into one
component would have coupled a shipped path to an unshipped one for no reuse worth having. The POS
Items view (`TerminalOperationsWorkspace.jsx`) picks between them: batch wins where its flag is on,
otherwise the existing single-file wizard renders exactly as before. Both stay behind the same
`canCreateItems` gate that already guards "Add Item". Supporting pieces:
`src/services/menuImportService.js` (the only place batch HTTP calls live, per the project rule that
components never call axios) and `src/hooks/useMenuImportJob.js` (upload → poll → preview state
machine).

Two smaller decisions inside D11 worth not re-deriving:
- **Polling is bounded and run-scoped.** 2s interval, 10-minute ceiling (`POLL_TIMEOUT` error rather
  than an eternal spinner — a job that hasn't settled by then means a wedged/absent worker). Every
  `startJob`/`reset` bumps a run id that async continuations check, so a late poll or preview from
  an abandoned run can never overwrite a newer one, and unmount cancels the timer.
- **The review step opens from an `onReady` callback passed into `startJob`, not from a
  `useEffect` watching `phase`.** The merged preview lands deep inside the poll continuation; the
  repo's React lint rules reject `setState` in an effect body (`react-hooks/set-state-in-effect`),
  and the callback is the honest expression of "this happens once, when the preview arrives"
  anyway. Same reason `Date.now()` in the poll loop had to move to a module-scope helper
  (`react-hooks/purity` forbids clock reads inside a hook body).

**Phase-0 spike result, done live during Phase 3 planning (this is what unblocked D10):**
`pdfjs-dist@5.4.296` + `@napi-rs/canvas@0.1.80` (both already transitive deps of `pdf-parse@2.4.5`,
promoted to direct deps in Phase 3) were verified end-to-end rendering a real PDF page to a real
PNG buffer, both on darwin/arm64 **and inside a freshly-pulled `node:22-alpine` container on
`linux/arm64`** (`docker run`, fresh `npm install pdf-parse`, render — no `apk add` needed for
cairo/pango/poppler at all). **No `poppler-utils`/`pdftoppm` fallback is needed.** The one gap:
`linux/amd64` specifically wasn't tested (no QEMU emulation available on the arm64 sandbox host
that did this work) — see the verification checklist below, this is the top real-infra item still
outstanding.

## What's built so far — Phases 1, 2, 3, 4, and 6

**Module** — `backend/src/modules/menuImport/` (passes both
`node scripts/check-architecture-guardrails.js` and `check-controller-boundaries.js`):
- `repositories/menuImportJobRepository.js` — `createJob`, `dequeueFileTask`, `beginProcessingFile`
  (marks a file `processing` and returns its stored record in one call), `setFileResult`, `readJob`
  (derives status live), `deleteJob`, `isMenuImportQueueAvailable`, **`reserveVisionCall` (Phase
  3 — atomic batch-wide vision budget, see D10)**.
- `repositories/menuImportBudgetRepository.js` — `getTenantAiSpendSince(tenantId, since)`, sums
  `AiUsageLog.cost_usd` for the daily-budget check. A rasterized PDF's per-page vision calls each
  log their own `AiUsageLog` row (via the existing `extractMenuItemsFromImage` → `AiUsageLog.create`
  path), so this check already correctly picks up Phase 3's extra spend with no changes needed.
- `usecases/createMenuImportJobUseCase.js` — file-count cap → queue-availability check → fnb
  workflow-mode check (via `menuExtractionService.resolveTenantWorkflowMode()`, now exported) →
  daily-budget check → `createJob`. Business-specific error reasons (e.g. `WORKFLOW_MODE_NOT_FNB`,
  `MENU_IMPORT_BUDGET_EXCEEDED`, `TOO_MANY_FILES`) live in `DomainError.details.code` — the shared
  `DomainErrorCode` enum is small/frozen and wasn't meant to carry feature-specific reasons.
- `usecases/getMenuImportJobUseCase.js` — reads a job, strips `items`/`path` before it reaches the
  client (those are server-only — items go through the preview use case, path is a filesystem
  detail), returns a distinguishable `JOB_EXPIRED_OR_NOT_FOUND` rather than a bare 404. **Phase 4
  added `pages_total`/`truncated` to `PUBLIC_FILE_FIELDS`** — Phase 3 stored them but this
  projection dropped them, so the truncation flag D10 promises could never actually reach the batch
  client (the single-file path was unaffected; it has its own response wiring).
- **`usecases/previewMenuImportJobUseCase.js` (Phase 2)** — reads a job, requires it to be in a
  terminal status (`JOB_NOT_READY` 409 otherwise), collects completed files' items, merges/dedups
  them (`support/mergeMenuImportItems.js`), enforces `MENU_IMPORT_MAX_MERGED_ITEMS`
  (`MERGED_ITEM_LIMIT_EXCEEDED` otherwise), builds one signed CSV via `buildSignedCsv` with a
  `batchToken` derived from the job id, and delegates to the existing
  `previewItemsImportUseCase` — same validation single-file/CSV rows get. See D9 for response shape.
- **`support/mergeMenuImportItems.js` (Phase 2)** — pure, no I/O. `normalizeItemName`,
  `levenshteinDistance`, `mergeMenuImportItems`. Exhaustively unit tested in isolation.
- `controllers/menuImportBatchHandlers.js` — `createMenuImportJob` (assigns each file a fresh
  `crypto.randomUUID()` `file_id`, unlinks all uploaded temp files if the use case rejects),
  `getMenuImportJob`, **`previewMenuImportJob` (Phase 2)**.
- `index.js` — composition root (mirrors `modules/csv/index.js`'s pattern); now also wires
  `previewMenuImportJobUseCase`.

**Worker** — `backend/src/workers/menuImportWorker.js`, structural copy of
`geoInventoryWorker.js` but with an in-flight concurrency semaphore instead of a serial per-tick
batch (each task here is an OpenAI call, not a fast DB upsert). `processFileTask` is exported for
testing (same convention `menuExtractionService.js` already uses). Never throws — a bad file
becomes that file's `failed` result, never blocks the rest of the job. **Phase 3:** now builds a
job-scoped `reserveVisionCall` closure and passes it into `extractMenuItemsFromFile`; passes
`pages_total`/`truncated` through to `setFileResult` when present.

**Services** —
- `backend/src/services/menuExtractionService.js` — split out
  `extractMenuItemsFromFile(buffer, mimeType, user, {reserveVisionCall}) → {items, kind, pages,
  pages_total?, truncated?}` (the item-producing half, no workflow check — this is what the worker
  calls directly since it has no tenant DB access); exported `resolveTenantWorkflowMode`;
  `buildSignedCsv` signature per D5. **Phase 3:** the PDF branch now falls back to rasterization +
  per-page vision when text extraction is empty (`kind: 'pdf_rasterized'`); `extractMenuCsvFromFile`
  (single-file path) now also returns `pages`/`pages_total`/`truncated`.
- **`backend/src/services/menuPdfRasterService.js` (Phase 3, new)** —
  `rasterizePdfPages(pdfBuffer, {maxPages, concurrency}) → {buffers, pagesTotal, truncated}`. Pure,
  no Redis/OpenAI. Built on `pdfjs-dist/legacy/build/pdf.mjs` + `@napi-rs/canvas`'s
  `createCanvas`/`DOMMatrix`. Deliberately does **not** wire `standardFontDataUrl` — pdf.js's
  Node-side font fetcher uses global `fetch()`, which can't read `file://` URLs, so it would trade
  a harmless warning for a hard failure with no rendering difference (confirmed visually). Target
  render resolution ~1600px on the long edge.

**Frontend (Phase 4)** — see D11 for the design decisions:
- `frontend/src/services/menuImportService.js` (new) — the only place batch HTTP calls live:
  `createMenuImportJob` (multipart, field name `files`), `getMenuImportJob`,
  `previewMenuImportJob`, `confirmMenuImport`, plus `isMenuImportBatchEnabled()` and the shared
  accept-pattern/terminal-status constants.
- `frontend/src/hooks/useMenuImportJob.js` (new) — upload → poll → preview state machine.
  Phases: `idle → uploading → processing → previewing → ready → confirming → done`, `error`
  reachable from any of them. Exposes `progress` (derived from the job's `totals`), `busy`,
  `startJob(files, {onReady})`, `confirmImport(rows)`, `reset()`.
- `frontend/Components/items/MenuImportBatchModal.jsx` (new) — 3-step wizard. Step 1 doubles as the
  live progress view (bar + per-file status/`item_count`/`scanned PDF`/failure-reason/truncation
  line); step 2 renders the merge summary, the price-conflict banner + per-row badge + other
  observed prices, near-duplicate pairs, truncated-scan list, unreadable-file list, and the same
  editable row table the single-file wizard uses; step 3 is the created/failed result.
- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` — one flag read, two
  derived constants, a label swap on the existing import button (`Import Menu` vs `Import from
  PDF`), and a modal branch. With the batch flag off, the rendered page is what shipped before.

**Governance (Phase 6)**:
- `docs/architecture/adr/0039-batch-menu-import-async-extraction.md` — accepted; covers D1–D11.
  (0039 was genuinely free — the directory has duplicate 0022/0023/0024/0025/0029/0030/0036 numbers
  but tops out at 0038.)
- `docs/compliance/impact-declarations/2026-07-29-pos-batch-menu-import.md` — `major`,
  surfaces `pos,terminal`, the floor forced by touching `frontend/src/features/pos/**`.
  `npm run check:compliance` and `npm run lint:docs` both pass. **Read its Verification Evidence
  section before merging** — the request-time preflight (`POST /api/v1/compliance/preflight`) has
  *not* been run; it needs a live tenant environment, and the front-matter preflight fields record
  the classification decision, not an observed API response.

**Modified** (all backward-compatible, existing single-file tests pass unchanged):
- `backend/src/config/menuImportFeature.js`, `backend/src/config/uploadConfig.js` (new
  `menuImportBatchUpload` — its own `diskStorage` with UUID filenames rather than reusing the
  shared storage, whose filename callback interpolates `file.originalname` directly — a `../` there
  is a traversal primitive not worth widening on a 20-file endpoint). **Phase 2** added
  `MENU_IMPORT_MAX_MERGED_ITEMS`; Phase 3 added no new constants (both caps it needed already
  existed, just unused until now).
- `backend/src/controllers/menuImportController.js` (Phase 3: `previewPdfImport` now surfaces
  `pages`/`pages_total`/`truncated` in its JSON response when the extraction was truncated).
- `backend/src/routes/items.js` — `POST /import/menu/jobs`, `GET /import/menu/jobs/:jobId`,
  **`POST /import/menu/jobs/:jobId/preview` (Phase 2)**, `POST /import/menu/confirm`, all behind a
  `requireMenuImportBatchEnabled` guard (404 if the flag's off, 503 if on-but-misconfigured).
- `backend/src/server.js` — starts/stops the worker alongside the geo worker, gated on the flag.
- `backend/package.json` (Phase 3: `pdfjs-dist` and `@napi-rs/canvas` promoted from transitive
  (via `pdf-parse`) to direct dependencies, versions pinned to what was already resolved).
- 13 nginx `location = /api/v1/items/import/menu/jobs` blocks (`client_max_body_size 64m`,
  `proxy_read_timeout 120s`) across `infrastructure/docker/nginx/nginx.conf.template` (6, the live
  Docker edge), `nginx/dgfy.ph.conf` (4, now staging-only per its own header but kept in sync for
  parity), and `infrastructure/docker/nginx/conf.d.local-test/*.conf` (3). **Note: these were
  written for the base `/jobs` route; the Phase 2 `/jobs/:jobId/preview` route falls under the same
  prefix, so no nginx changes were needed for Phase 2 or 3.**
- `.github/workflows/deploy-frontend.yml`, `infrastructure/docker/frontend/Dockerfile`,
  `do-not-commit/local-test/docker-compose.yml`, `frontend/.env.shared.example`,
  `frontend/.env.vps.example` — new `VITE_MENU_IMPORT_BATCH_ENABLED` flag threaded through
  (Phase 1; unchanged since).
- `backend/migrations/20260728000001-add-tenant-timestamp-index-to-ai-usage-logs.cjs` — composite
  `(tenant_id, timestamp)` index on `ai_usage_logs`. Needed because that table is a shared landlord
  table logging every tenant's AI usage platform-wide, and the daily-budget query
  (`SUM(cost_usd) WHERE tenant_id=? AND timestamp>=?`) would otherwise only have two single-column
  indexes to work with. Idempotent guard, follows the `addIndexIfMissing` convention from
  `20260723000001-create-affiliates-program.cjs`.

**Bug fix (Phase 3, found by its own tests, unrelated to the rasterization feature itself):**
`extractPdfText` was calling `require('pdf-parse')(buffer)` — the old pdf-parse v1 callable-function
API. `pdf-parse@2.4.5` (already the version in `package.json`) exports a `PDFParse` class instead
(`new PDFParse({data}).getText()`); the old call would throw `TypeError: ... is not a function` on
any real PDF. This was never caught before Phase 3 because no test — single-file or batch — had
ever exercised the PDF branch with a real PDF buffer (the earlier belief was that `@napi-rs/canvas`
couldn't load in this sandbox; it turned out it does, see the Phase-0 spike above, and that's what
finally exercised this code path for real). Also disabled pdf-parse's default per-page `-- N of M
--` boundary marker (`pageJoiner: ''`) — left enabled, it makes even a completely blank page's
"text" non-empty, which would have permanently defeated `PDF_TEXT_EMPTY` detection and therefore
D10's whole rasterization fallback trigger.

**Backend tests added, all passing.** Phase 1 (34 tests) + Phase 2 (24 tests) + Phase 3 (17 tests)
= **75 tests across 7 suites** (Phase 4's one-line `PUBLIC_FILE_FIELDS` change kept all 75 green),
run via:
```
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand \
  --runTestsByPath tests/menuExtractionService.test.js tests/menuImportJobRepository.test.js \
  tests/menuImportWorker.test.js tests/mergeMenuImportItems.test.js \
  tests/previewMenuImportJobUseCase.test.js tests/menuImportBatchHandlers.test.js \
  tests/menuPdfRasterService.test.js
```
- `backend/tests/menuImportJobRepository.test.js` — status derivation across all transitions,
  Redis-unavailable handling, job expiry, **Phase 3: `reserveVisionCall` grants/denies/compensates
  correctly, tracked per-job**. Overrides the global `config/redis.js` mock from `tests/setup.js`
  with a richer in-memory fake supporting `hSet`/`hGet`/`hGetAll`/`hIncrBy`/`lPush`/`rPop`.
- `backend/tests/menuImportWorker.test.js` — per-file isolation guarantee, **Phase 3: passes
  `reserveVisionCall` through, `pages_total`/`truncated` reach `setFileResult`**.
- `backend/tests/menuExtractionService.test.js` — `skuPrefix`/`batchToken` options, timestamp
  hoisting, `extractMenuItemsFromFile`'s "no workflow-mode check" behavior. **Phase 3: the PDF
  branch is now exercised with real hand-built PDF buffers** (both a real-text PDF confirming the
  fast path skips rasterization entirely, and a blank/content-less PDF confirming the rasterization
  fallback, per-page concatenation, `reserveVisionCall` truncation, and the no-callback single-file
  case) — this is what caught the pdf-parse API bug above.
- `backend/tests/mergeMenuImportItems.test.js` (Phase 2) — dedup, price-conflict surfacing,
  near-duplicate flagging rules, section/description retention.
- `backend/tests/previewMenuImportJobUseCase.test.js` (Phase 2) — job-not-found, job-not-ready,
  no-completed-files, over-cap, full happy path (merge shape + row annotation).
- `backend/tests/menuImportBatchHandlers.test.js` (Phase 2) — transport-level `previewMenuImportJob`
  status/error_code mapping.
- `backend/tests/menuPdfRasterService.test.js` (Phase 3, new) — renders every page under the cap,
  caps + flags `truncated` over it, single-page doc, corrupt-buffer rejection, bounded concurrency.

**Frontend tests added (Phase 4), all passing** — 15 tests across 4 files, run via
`npx vitest run <paths>` from `frontend/`:
- `src/services/__tests__/menuImportService.contract.test.js` — the flag is exactly-`'true'`-gated,
  every file goes under the multipart `files` field, and each of the four routes is hit at the
  path the backend actually registers.
- `src/hooks/__tests__/useMenuImportJob.test.js` — polls to a terminal status then auto-previews
  and fires `onReady`; an upload rejection surfaces the server's message/`error_code` and never
  starts polling; the 10-minute ceiling ends the loop; `reset()` abandons an in-flight run so no
  further polls fire. Uses fake timers.
- `Components/items/__tests__/MenuImportBatchModal.behavior.test.jsx` — full render: multi-file
  staging → one job → review step showing price conflicts, near-duplicates, a truncated scan with
  both page counts, and an unreadable file with its reason → confirm submits only the still-checked
  rows.
- `src/features/pos/__tests__/menuImportBatchEntry.contract.test.js` — source-level gating contract
  for `TerminalOperationsWorkspace.jsx` (matches how the other POS contract tests in that directory
  are written).

Also re-run and green after Phase 4: the 69 existing POS/Items vitest tests
(`terminalViewModeContracts`, `itemsPagination`, `posPageShell`, `Components/items`),
`npm run build` in `frontend/`, `npx eslint` on every new/changed frontend file (0 errors),
`npm --prefix backend run check:architecture-guardrails` + `check:controller-boundaries`,
`npm run check:compliance`, and `npm run lint:docs`.

## Commit status — read this before doing anything else

**Phases 1–3** are on `claude/menu-import-batch-async` (`447ceb03`, `e1c02e69`, `57c71030`), PR
https://github.com/Sieitzz/dgfy-platform/pull/133 targeting `main`.
**Phases 6 and 4** continue from that same history on `claude/menu-import-batch-handoff-2fnerq`.
`git status` should be clean for everything this doc covers — uncommitted changes touching
`menuImport` are *new* work on top of this, not leftovers.

## Resolved: the `.env.example` blocker

Phase 1 and Phase 2/3 sessions were each blocked by a directory-level permission deny rule on
`backend/.env.example`. **That block did not recur in the Phase 4/6 session, and the file is now
updated** — `MENU_IMPORT_BATCH_ENABLED` plus all six caps are documented there. Nothing left to
append manually.

## What's NOT done yet — Phases 5 and 7

**Phase 5 is the actual next step.** The batch path is now usable end to end by a real operator
(upload several files from disk → progress → merged review → import), so what remains is the
in-app camera capture the user asked for, and then deprecation.

5. **Camera capture + quality scoring** — no `menuPhotoQuality.js`, no capture sheet. This was a
   headline ask from the user and is entirely unbuilt. It plugs into
   `MenuImportBatchModal.jsx`'s step 1: captured frames become `File` objects appended to the same
   `selectedFiles` list the picker/drop-zone feeds, so nothing downstream (job creation, polling,
   merge review, confirm) needs to change. The pre-shutter quality check **warns but never blocks**
   — that was explicit from the user, and it matches how every other gap in this feature is handled
   (surface it, don't block). Expect the real work to be `getUserMedia` plumbing, a canvas-based
   blur/exposure/glare heuristic, iOS Safari quirks, and permission-denied fallback to the file
   picker. Governance note: it touches `TerminalOperationsWorkspace.jsx` only if it adds a new entry
   point — if it stays inside the batch modal, the existing impact declaration's surfaces already
   cover it, but a **new declaration is still required** for the diff (camera access is a new
   device-permission surface worth declaring on its own).
6. ~~**Governance**~~ — done, see "What's built so far".
7. **Deprecation of the old single-file endpoints** — still not applicable until Phase 5 ships and
   the batch path has been exercised against a real environment.

## Sandbox limitations that affected how this was verified

No live Redis, no live MySQL. As a result:
- The job repository and worker were verified against **mocked** Redis (a hand-built in-memory
  fake supporting hash/list ops, extended in Phase 3 with `hIncrBy`), never a real Redis instance.
  The concurrency-correctness argument in D1/D2/D10 rests on Redis's documented `rPop`/`HINCRBY`
  atomicity, not on anything empirically observed here.
- The migration was verified with `node --check` (syntax only) and by matching the existing
  `addIndexIfMissing` idempotent-guard pattern — **never run against a real database.**
- nginx changes were verified with a brace-balance script (`grep -c '{' / '}'` per file) and a
  location-count check — **never `nginx -t`** (no nginx binary in this sandbox).
- The full module import graph (routes → controllers → use cases → repositories → worker) **was**
  verified for real, via jest suites that actually import each module through the project's real
  `jest.config.cjs` env — not just `node --check`.
- **Correction to Phase 1's version of this doc**: it's stated there that `@napi-rs/canvas` failed
  to load in "this sandbox," raising the possibility of needing a `poppler-utils` fallback for
  Phase 3. **That turned out not to hold** — Phase 3's own Phase-0 spike (see D10) verified
  `@napi-rs/canvas` loads and renders correctly, both directly in a sandbox of this same kind and
  inside a real `node:22-alpine` (musl) container. Whatever caused the earlier failure wasn't a
  fundamental incompatibility; it's not been root-caused, but it's now moot given the direct spike
  succeeded. Do not carry the old "needs poppler fallback" assumption forward.

## Verification checklist for whoever picks this up next

- [ ] Run `npx sequelize-cli db:migrate` against a real MySQL instance; confirm the new composite
      index exists on `ai_usage_logs`; confirm `db:migrate:undo` cleanly drops it.
- [ ] Start a real Redis instance, set `REDIS_URL`/`MENU_IMPORT_ENABLED=true`/
      `MENU_IMPORT_BATCH_ENABLED=true`/`OPENAI_API_KEY`, boot the backend, confirm the worker logs
      its "Started (concurrency=2)" line.
- [ ] `curl -F 'files=@a.jpg' -F 'files=@b.jpg' .../import/menu/jobs` → get a `job_id`; poll
      `GET .../jobs/:id` to a terminal status; call `POST .../jobs/:id/preview`; confirm
      `backend/uploads/temp` is empty afterward (files unlinked regardless of success/failure).
- [ ] Upload a batch containing the same item at two different prices across two files; confirm
      `merge.conflicts` has exactly one entry and the corresponding preview row carries
      `price_conflict: true`.
- [ ] Upload a genuinely scanned/image-only PDF (no text layer) through both the single-file
      `previewPdfImport` endpoint and a batch job; confirm items come back with
      `kind: 'pdf_rasterized'`. Upload one with more than 15 pages; confirm `truncated: true` with
      correct `pages`/`pages_total` on both paths.
- [ ] **`linux/amd64` Docker smoke check for `@napi-rs/canvas`** — the one real gap left by Phase
      3's spike (only arm64 was reachable from that sandbox host). Build the real
      `infrastructure/docker/backend/Dockerfile` image (or use whatever amd64 host/CI is
      available) and run `node -e "require('@napi-rs/canvas'); console.log('ok')"` inside it.
      Strong prior evidence it'll work (`pdf-parse` already depends on the x64-musl variant of the
      same napi-rs-published package), but not yet directly observed.
- [ ] Flip `MENU_IMPORT_BATCH_ENABLED` off → all new routes 404 (including `/preview`). Unset
      `REDIS_URL` with the flag on → 503 with `missing: ['REDIS_URL']`.
- [ ] `sudo nginx -t` against the real rendered nginx config once `envsubst`'d, confirming the
      `location =` blocks don't conflict with the existing `location /api` prefix match.
- [ ] `npm run check:architecture-guardrails && npm run check:controller-boundaries` from
      `backend/` (both passed in-sandbox for all four phases; re-confirm after any further changes).
- [ ] Re-run the full backend Jest suite (not just the 7 files touched here) — a full
      `npm test --runInBand` run OOM'd in the Phase 2 session's sandbox after only 2 of hundreds of
      suites (pre-existing sandbox memory limit, not something these phases caused — the targeted
      75-test run above is what actually verifies this feature).
- [x] Append the `.env.example` lines — **done in the Phase 4/6 session**, the permission block
      that stopped earlier sessions did not recur.
- [ ] **Run `POST /api/v1/compliance/preflight`** for declaration
      `2026-07-29-pos-batch-menu-import` against a live tenant environment and reconcile
      `preflight_run_at` / `preflight_request_ref` in its front matter. This is the one governance
      item Phase 6 could not close from a sandbox.
- [ ] Click through the batch wizard against a real backend with the flag on: 20-file cap toast,
      progress bar advancing as files settle, a failed file listed with its reason, a price-conflict
      row, and confirm creating only the checked rows. The component test covers the rendering
      contract; nothing has exercised it against a live job.
- [ ] Re-run the frontend vitest suite in full (`npm --prefix frontend test`) — only the 4 new files
      plus 9 POS/Items suites were run in-sandbox.

## Suggested next step

**Phase 5 — camera capture + quality scoring.** See "What's NOT done yet" for where it plugs into
`MenuImportBatchModal.jsx` (append captured frames to `selectedFiles`; nothing downstream changes)
and for the governance note (a new impact declaration is required for that diff even though the
surfaces are already declared). The warn-never-block rule for the pre-shutter quality check is a
user decision, not an inference — do not turn it into a hard gate.
