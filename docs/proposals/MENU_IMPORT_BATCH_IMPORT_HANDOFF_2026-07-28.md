---
status: reference
authority_level: reference
owner: backend
last_reviewed: 2026-07-28
applies_to: menu_import, pos_frontend, backend
topic: menu_import_batch_handoff
---

# Batch Menu Import (Multi-File + Camera Capture) — Handoff

Date: July 28, 2026
Branch: `develop` — **uncommitted working-tree changes** (see "Commit status" below; nothing in
this doc has been committed yet)

## Purpose

This note is for whoever (human or AI) picks up this build next. It exists so a different
assistant/tool can continue without re-deriving the design decisions already made, or the
constraints that shaped them. Only Phase 1 of a 7-phase plan is built. Read this whole doc before
touching the code — the "don't re-derive" section especially.

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
  single file only, mounted in the POS Items view (`TerminalOperationsWorkspace.jsx`).
- `docs/compliance/impact-declarations/2026-07-25-pos-pdf-menu-import.md` — the impact
  declaration for that original feature.

## The ask and the constraints that shaped the design

The user wants to extend this to: **multiple PDFs**, **multiple images**, and **in-app photo
capture** (with a pre-shutter quality check that warns but never blocks), all *before* anyone
evaluates whether the AI extraction itself is any good. Four things made "just accept more files"
not viable as a small change:

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
- **Preview request** (full tenant context, Phase 2, not yet built): merge + dedup → one signed
  CSV → `previewItemsImportUseCase`.
- **Confirm request**: unchanged, reuses the existing single-file handler directly.

Consequence worth remembering: every request in this design is sub-second, so **the 60s axios
timeout needed no change** — that blocker turned out to be a non-issue once the design moved
extraction off the request path.

**D2 — Job state lives in Redis only, never a DB table.** One hash per job, key
`menu_import:job:<tenantId>:<jobId>`, one field per file (`file:<fileId>` → JSON) plus a `meta`
field. TTL 3600s (matches `cleanupService.js`'s 1-hour temp-file rule). A tenant table would need a
migration replicated across every tenant schema and would drag tenant DB context back into the
worker (killing D1); a landlord table would put cross-tenant menu text in the shared DB for no
durability benefit — the real audit trails already exist elsewhere (`AiUsageLog`,
`productUsageTelemetryService`, the item audit trail on confirm). Job **status is never stored** —
it's derived on every read from the per-file statuses (queued/running/completed/
completed_with_errors/failed), which sidesteps keeping an aggregate field in sync entirely.

**Concurrency note (an improvement over the original plan write-up, not a deviation from its
intent):** each file is queued as its own task
(`{tenantId, jobId, fileId}` pushed to a shared `menu_import:queue` list). Because Redis `rPop` is
atomic, exactly one worker "owns" a given file task at a time, so every write to a `file:<fileId>`
hash field is made by exactly one writer — there is **no read-modify-write race to guard against
at all**, not even via CAS.

**D3 — Files stay on disk; Redis holds paths only, never bytes.** Manifest per file:
`{file_id, path, mime_type, size, original_name, status, ...}`. Cleanup: the worker unlinks a file
the moment its extraction attempt settles (success or failure); `cleanupService.js`'s existing
15-min cron is the backstop. **Single-instance assumption**: PM2 runs `exec_mode: 'fork', instances:
1`, so uploader and worker are the same process; do not design for multi-host without revisiting
this.

**D4 — Merge + dedup will run in the (not-yet-built) preview use case, server-side, never the
client.** Not implemented in Phase 1. When built: key on **normalized name alone**, not
name+price (two photos of the same board routinely disagree on price by one OCR digit; a
name+price key would produce duplicate-looking items). Price conflicts must be **surfaced, never
silently resolved** (`price_conflict: true` + `observed_prices`) — this is a money field. No fuzzy
auto-merge; flag near-duplicates (Levenshtein ≤2, matching price) as a review-only warning.

**D5 — Batch-wide SKU uniqueness (implemented in Phase 1).**
`buildSignedCsv(items, { skuPrefix = 'PDFMENU', batchToken = '' } = {})` in
`menuExtractionService.js` now hoists the timestamp **out of** the row `.map()` (fixing the
straddling-second bug) and accepts a `batchToken` so a multi-file batch's SKUs stay unique and
contiguous across the whole batch, not per-file. Defaulted params keep the existing single-file
test suite green untouched.

**D6 — Cost control: five caps, all server-side**, added to `backend/src/config/menuImportFeature.js`:
`MENU_IMPORT_MAX_FILES_PER_BATCH` (20), `MENU_IMPORT_MAX_PDF_PAGES` (15, for Phase 3's rasterizer),
`MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH` (25), `MENU_IMPORT_DAILY_USD_BUDGET` (5.0, USD/tenant/24h,
checked via a new `(tenant_id, timestamp)` composite index — see migration below),
`MENU_IMPORT_WORKER_CONCURRENCY` (2 in-flight OpenAI calls — don't raise without reconsidering PM2's
512MB `max_memory_restart` ceiling).

**D7 — A separate flag, in the same config file.** `MENU_IMPORT_BATCH_ENABLED` +
`VITE_MENU_IMPORT_BATCH_ENABLED`. The batch path adds a background worker, a hard Redis
dependency, and materially more AI spend per import — it must be killable independently of the
single-file path that already shipped. Guard requires
`MENU_IMPORT_ENABLED && MENU_IMPORT_BATCH_ENABLED && OPENAI_API_KEY && REDIS_URL`.

**D8 — Both single-file endpoints stay; confirm is reused, not duplicated.**
`/items/import/pdf/preview` and `/confirm` are untouched. `POST /items/import/menu/confirm` points
at the **same** `confirmPdfImport` handler — there is nothing batch-specific about persisting
already-previewed rows.

## What's built so far — Phase 1 only (this session)

**New backend module** — `backend/src/modules/menuImport/` (passes both
`node scripts/check-architecture-guardrails.js` and `check-controller-boundaries.js`):
- `repositories/menuImportJobRepository.js` — `createJob`, `dequeueFileTask`, `beginProcessingFile`
  (marks a file `processing` and returns its stored record in one call), `setFileResult`, `readJob`
  (derives status live), `deleteJob`, `isMenuImportQueueAvailable`.
- `repositories/menuImportBudgetRepository.js` — `getTenantAiSpendSince(tenantId, since)`, sums
  `AiUsageLog.cost_usd` for the daily-budget check.
- `usecases/createMenuImportJobUseCase.js` — file-count cap → queue-availability check → fnb
  workflow-mode check (via `menuExtractionService.resolveTenantWorkflowMode()`, now exported) →
  daily-budget check → `createJob`. Business-specific error reasons (e.g. `WORKFLOW_MODE_NOT_FNB`,
  `MENU_IMPORT_BUDGET_EXCEEDED`, `TOO_MANY_FILES`) live in `DomainError.details.code` — the shared
  `DomainErrorCode` enum is small/frozen and wasn't meant to carry feature-specific reasons.
- `usecases/getMenuImportJobUseCase.js` — reads a job, strips `items`/`path` before it reaches the
  client (those are server-only — items go through the not-yet-built preview use case, path is a
  filesystem detail), returns a distinguishable `JOB_EXPIRED_OR_NOT_FOUND` rather than a bare 404.
- `controllers/menuImportBatchHandlers.js` — `createMenuImportJob` (assigns each file a fresh
  `crypto.randomUUID()` `file_id`, unlinks all uploaded temp files if the use case rejects),
  `getMenuImportJob`.
- `index.js` — composition root (mirrors `modules/csv/index.js`'s pattern).

**New worker** — `backend/src/workers/menuImportWorker.js`, structural copy of
`geoInventoryWorker.js` but with an in-flight concurrency semaphore instead of a serial per-tick
batch (each task here is an OpenAI call, not a fast DB upsert). `processFileTask` is exported for
testing (same convention `menuExtractionService.js` already uses). Never throws — a bad file
becomes that file's `failed` result, never blocks the rest of the job.

**Modified** (all backward-compatible, existing single-file tests pass unchanged):
- `backend/src/services/menuExtractionService.js` — split out
  `extractMenuItemsFromFile(buffer, mimeType, user) → {items, kind, pages}` (the item-producing
  half, no workflow check — this is what the worker calls directly since it has no tenant DB
  access); exported `resolveTenantWorkflowMode`; `buildSignedCsv` signature per D5.
- `backend/src/config/menuImportFeature.js`, `backend/src/config/uploadConfig.js` (new
  `menuImportBatchUpload` — its own `diskStorage` with UUID filenames rather than reusing the
  shared storage, whose filename callback interpolates `file.originalname` directly — a `../` there
  is a traversal primitive not worth widening on a 20-file endpoint).
- `backend/src/routes/items.js` — `POST /import/menu/jobs`, `GET /import/menu/jobs/:jobId`,
  `POST /import/menu/confirm`, all behind a `requireMenuImportBatchEnabled` guard (404 if the flag's
  off, 503 if on-but-misconfigured).
- `backend/src/server.js` — starts/stops the worker alongside the geo worker, gated on the flag.
- 13 nginx `location = /api/v1/items/import/menu/jobs` blocks (`client_max_body_size 64m`,
  `proxy_read_timeout 120s`) across `infrastructure/docker/nginx/nginx.conf.template` (6, the live
  Docker edge), `nginx/dgfy.ph.conf` (4, now staging-only per its own header but kept in sync for
  parity), and `infrastructure/docker/nginx/conf.d.local-test/*.conf` (3).
- `.github/workflows/deploy-frontend.yml`, `infrastructure/docker/frontend/Dockerfile`,
  `do-not-commit/local-test/docker-compose.yml`, `frontend/.env.shared.example`,
  `frontend/.env.vps.example` — new `VITE_MENU_IMPORT_BATCH_ENABLED` flag threaded through.
- `backend/migrations/20260728000001-add-tenant-timestamp-index-to-ai-usage-logs.cjs` — composite
  `(tenant_id, timestamp)` index on `ai_usage_logs`. Needed because that table is a shared landlord
  table logging every tenant's AI usage platform-wide, and the new daily-budget query
  (`SUM(cost_usd) WHERE tenant_id=? AND timestamp>=?`) would otherwise only have two single-column
  indexes to work with. Idempotent guard, follows the `addIndexIfMissing` convention from
  `20260723000001-create-affiliates-program.cjs`.

**Tests added, all passing (34 total, run via
`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand
--runTestsByPath tests/menuExtractionService.test.js tests/menuImportJobRepository.test.js
tests/menuImportWorker.test.js`):**
- `backend/tests/menuImportJobRepository.test.js` — status derivation across all transitions
  (queued/running/completed/completed_with_errors/failed), Redis-unavailable handling, job
  expiry. Overrides the global `config/redis.js` mock from `tests/setup.js` (which only supports
  plain KV, not hashes/lists) with a richer in-memory fake supporting `hSet`/`hGet`/`hGetAll`/
  `lPush`/`rPop` — same override technique `tests/rateLimiterStoreMode.test.js` already uses.
- `backend/tests/menuImportWorker.test.js` — the per-file isolation guarantee specifically: one
  file failing (concurrently, via `Promise.all`) has zero effect on another file's outcome.
- `backend/tests/menuExtractionService.test.js` — extended with coverage for the new
  `skuPrefix`/`batchToken` options, the timestamp-hoisting fix, and `extractMenuItemsFromFile`'s
  "no workflow-mode check" behavior. **Note:** the PDF branch of `extractMenuItemsFromFile` is
  deliberately *not* exercised with a real PDF buffer — `pdf-parse`'s `pdfjs-dist` dependency needs a
  native canvas binding (`@napi-rs/canvas`) that failed to load in this sandbox
  (`Cannot load "@napi-rs/canvas" package`), throwing a raw `ReferenceError: DOMMatrix is not
  defined` for any non-trivial PDF byte content. This is pre-existing — the original single-file
  test suite never exercised real PDF parsing either (its workflow-mode check always
  short-circuits first). **This is very likely the same risk Phase 3 (PDF rasterization) already
  flags as its Phase-0-spike reason** — confirm the native binding actually resolves in the real
  Docker image (`infrastructure/docker/backend/Dockerfile`, `node:22-alpine`/musl) before relying on
  either the existing PDF-text path or the future rasterizer in production.

## Commit status — read this before doing anything else

**Nothing above has been committed.** All of it sits as uncommitted changes directly on `develop`
(not a feature branch). Before continuing, whoever picks this up should decide whether to:
(a) commit Phase 1 as-is on a new branch cut from this working tree, or
(b) keep building Phases 2+ on top of the uncommitted tree and commit everything together.
Either is fine — just don't let `git status` surprise you, and don't `git stash`/`checkout` away
these changes without knowing that's what you're doing.

## One blocker from this session, needs a human (or a differently-permissioned session)

`backend/.env.example` is blocked by this session's permission settings (a directory-level deny
rule denied both `Read` and `Bash cat` on that specific path, while the sibling frontend `.env.*
.example` files were freely readable/editable). The following was never added there — append it
manually:
```
MENU_IMPORT_BATCH_ENABLED=false
MENU_IMPORT_MAX_FILES_PER_BATCH=20
MENU_IMPORT_MAX_PDF_PAGES=15
MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH=25
MENU_IMPORT_DAILY_USD_BUDGET=5.0
MENU_IMPORT_WORKER_CONCURRENCY=2
```

## What's NOT done yet — Phases 2–7 of the original plan

2. **Merge, dedup, preview endpoint** (`POST /import/menu/jobs/:jobId/preview`) — the actual D4
   logic (normalized-name dedup, price-conflict surfacing, near-duplicate flagging, post-dedup
   200-item cap) doesn't exist yet. Right now a completed job's per-file `items` arrays just sit in
   Redis with no consumer.
3. **Scanned-PDF rasterization** — `menuPdfRasterService.js` (pdfjs-dist + a canvas backend,
   render pages → images → vision path) doesn't exist. `PDF_TEXT_EMPTY` is still a dead end for
   image-only PDFs, same as before this work started. **Do the Phase-0 spike first** (prove
   `@napi-rs/canvas` actually resolves in the real Docker image) — see the test-coverage note above.
4. **Frontend multi-file UI** — `PdfMenuImportModal.jsx` still only accepts one file. No
   `useMenuImportJob` polling hook, no `menuImportService.js`, no progress bar exist yet. The three
   new backend routes have no caller anywhere in the frontend.
5. **Camera capture + quality scoring** — no `menuPhotoQuality.js`, no capture sheet. This was a
   headline ask from the user and is entirely unbuilt.
6. **Governance** — no ADR for this work exists yet (would need to be
   `docs/architecture/adr/0039-...` or later — **check the directory first**, several numbers are
   duplicated there, e.g. two `0036-*`, two `0029-*`, two `0030-*`), and no impact declaration
   (`docs/compliance/impact-declarations/`) covers the batch path — `frontend/src/features/pos/**`
   is compliance-classified and Phase 4 (frontend UI) cannot merge without one, modeled on
   `2026-07-25-pos-pdf-menu-import.md`.
7. **Deprecation of the old single-file endpoints** — not applicable until Phases 2–6 ship.

## Sandbox limitations that affected how this was verified

No live Redis, no live MySQL, and `@napi-rs/canvas`'s native binding failed to load in this
environment (see the test note above). As a result:
- The job repository and worker were verified against **mocked** Redis (a hand-built in-memory
  fake supporting hash/list ops), never a real Redis instance. The concurrency-correctness argument
  in D1/D2 rests on Redis's documented `rPop` atomicity, not on anything empirically observed here.
- The new migration was verified with `node --check` (syntax only) and by matching the existing
  `addIndexIfMissing` idempotent-guard pattern — **never run against a real database.**
- nginx changes were verified with a brace-balance script (`grep -c '{' / '}'` per file) and a
  location-count check — **never `nginx -t`** (no nginx binary in this sandbox).
- The full module import graph (routes → controllers → use cases → repositories → worker) **was**
  verified for real, via a throwaway Jest smoke test that imported each new file through the
  project's actual `jest.config.cjs` env (not just `node --check`), then deleted before finishing.
  This caught real path/naming mistakes, not just syntax errors.

## Verification checklist for whoever picks this up next

- [ ] Run `npx sequelize-cli db:migrate` against a real MySQL instance; confirm the new composite
      index exists on `ai_usage_logs`; confirm `db:migrate:undo` cleanly drops it.
- [ ] Start a real Redis instance, set `REDIS_URL`/`MENU_IMPORT_ENABLED=true`/
      `MENU_IMPORT_BATCH_ENABLED=true`/`OPENAI_API_KEY`, boot the backend, confirm the worker logs
      its "Started (concurrency=2)" line.
- [ ] `curl -F 'files=@a.jpg' -F 'files=@b.jpg' .../import/menu/jobs` → get a `job_id`; poll
      `GET .../jobs/:id` to a terminal status; confirm `backend/uploads/temp` is empty afterward
      (both files should be unlinked regardless of success/failure).
- [ ] Flip `MENU_IMPORT_BATCH_ENABLED` off → both new routes 404. Unset `REDIS_URL` with the flag
      on → 503 with `missing: ['REDIS_URL']`.
- [ ] `sudo nginx -t` against the real rendered nginx config once `envsubst`'d, confirming the new
      `location =` blocks don't conflict with the existing `location /api` prefix match.
- [ ] `npm run check:architecture && npm run check:compliance && npm run lint:docs` from repo root.
- [ ] Re-run the full backend Jest suite (not just the 3 files touched here) to catch any
      unexpected interaction with the new worker/Redis mock override technique.
- [ ] Verify `@napi-rs/canvas`'s native binding actually loads inside
      `infrastructure/docker/backend/Dockerfile`'s image (`node:22-alpine`, musl) — build the image
      and run `node -e "require('@napi-rs/canvas')"` inside a container. If it fails there too,
      Phase 3 needs the `poppler-utils`/`pdftoppm` fallback plan instead, and the *existing*
      single-file PDF-text path's `pdf-parse` dependency should be spot-checked in that same image
      for the same reason.
