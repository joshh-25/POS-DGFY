---
status: authoritative
owner: platform_operations
last_reviewed: 2026-08-03
applies_to: batch_menu_import_ai_extraction
---

# Batch Menu Import — Enablement Runbook

How to turn on AI-powered batch menu import (multi-file PDF/photo → extracted items)
in a local stack or on a real server, how to tell which prerequisite is missing from
the API response alone, and how to roll it back.

Design rationale lives in `docs/architecture/adr/0049-batch-menu-import-async-extraction.md`.
The build log is `docs/proposals/MENU_IMPORT_BATCH_IMPORT_HANDOFF_2026-07-28.md`.
Never paste a live `OPENAI_API_KEY` into source control, chat, screenshots, or any
`VITE_*` frontend variable — Vite bakes those into a public bundle.

## 1. What the feature requires

The endpoint is `POST /api/v1/items/import/menu/jobs` (multipart, field `files`).
It is gated by `requireMenuBatchImportConfig()` in
`backend/src/config/menuImportFeature.js`, which requires **all four** of:

| Variable | Why | Where it is set |
|---|---|---|
| `MENU_IMPORT_ENABLED=true` | Base single-file tier; batch builds on it | backend process env |
| `MENU_IMPORT_BATCH_ENABLED=true` | Batch tier — **also gates the worker at boot** | backend process env |
| `OPENAI_API_KEY` | Extraction calls (`services/menuExtractionService.js`) | backend process env |
| `REDIS_URL` | Job state and queue — there is no DB table for jobs | already hardcoded in both `docker-compose.yml` files; nothing to do |

Optional caps, all with working defaults — set only to tune cost or throughput:

```dotenv
MENU_IMPORT_MAX_FILES_PER_BATCH=20      # also multer's hard `files` limit
MENU_IMPORT_MAX_PDF_PAGES=15            # pages rasterized per scanned PDF
MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH=25
MENU_IMPORT_DAILY_USD_BUDGET=5.0        # per tenant, rolling 24h
MENU_IMPORT_WORKER_CONCURRENCY=2        # in-flight OpenAI calls
MENU_IMPORT_MAX_MERGED_ITEMS=200        # post-dedup ceiling
# MENU_IMPORT_MODEL=gpt-4o              # falls back to OPENAI_MODEL, then 'gpt-4o'
# MENU_IMPORT_PDF_RASTER_ENABLED=false  # kill switch for scanned-PDF rasterization
```

Upload constraints enforced server-side (`backend/src/config/uploadConfig.js`):
`application/pdf`, `image/jpeg`, `image/png` only; 10MB per file;
`MENU_IMPORT_MAX_FILES_PER_BATCH` files per request. Job state expires from Redis
after **1 hour** — a preview must be confirmed within that window.

### Prerequisites that are not environment variables

1. **Worker start is boot-time gated.** `backend/src/server.js` only calls
   `startMenuImportWorker()` when `MENU_IMPORT_BATCH_ENABLED` is true at process
   start. Flipping the flag needs a container **recreate**, not a reload — otherwise
   uploads return 202 and the jobs sit in Redis forever.
2. **The tenant must be in F&B workflow mode.** Anything else gets 422
   (`WORKFLOW_MODE_NOT_FNB`) from `createMenuImportJobUseCase.js`.
3. **`ai_usage_logs` must exist, with its tenant/timestamp index.** Migrations
   `20260220000001-create-ai-usage-logs.cjs` and
   `20260728000001-add-tenant-timestamp-index-to-ai-usage-logs.cjs`. The daily budget
   check reads this table; a restored production snapshot can be behind on it.
4. **nginx must allow a 64MB body on this one path.** Already provisioned — see
   `location = /api/v1/items/import/menu/jobs` in
   `infrastructure/docker/nginx/nginx.conf.template` and
   `infrastructure/docker/nginx/conf.d.local-test/*.conf`. The global limit is 8MB,
   so a custom reverse proxy in front of this stack needs the same exception.
5. **The frontend flag is baked at build time**, not read at runtime — see §3.

## 2. Local stack (`do-not-commit/local-test/`)

The backend container reads `.env.compose`, **not** `.env`. `.env.compose` is a
mechanical copy of `.env` with every `$` doubled, because Compose interpolates `$VAR`
inside `env_file` contents and `ADMIN_PASSWORD_HASH` is a bcrypt hash full of `$`.

```bash
cd do-not-commit/local-test

# 1. See what's already set
grep -E '^(MENU_IMPORT|OPENAI)' .env

# 2. Add or update in .env:
#      MENU_IMPORT_ENABLED=true
#      MENU_IMPORT_BATCH_ENABLED=true
#      OPENAI_API_KEY=sk-...

# 3. Regenerate the escaped copy -- skipping this silently no-ops the change
sed 's/\$/\$\$/g' .env > .env.compose

# 4. Recreate the backend (not just restart -- the worker is gated at boot)
docker compose --env-file .env.compose up -d --build backend
```

Confirm it came up configured:

```bash
docker compose logs backend | grep -i "batch menu import"
```

Expect `Batch menu import ready (MENU_IMPORT_BATCH_ENABLED=true, all dependencies
configured).` The other two possible lines name the exact problem: `... enabled but
not fully configured — missing: OPENAI_API_KEY` or `... disabled because
MENU_IMPORT_BATCH_ENABLED is not true.`

The local-test compose already defaults both frontend flags
(`VITE_MENU_PDF_IMPORT_ENABLED`, `VITE_MENU_IMPORT_BATCH_ENABLED`) to `true`, so the
wizard renders without extra work.

Redis persists to `./data/redis/dump.rdb` across restarts. Before a clean test run,
clear stale job state:

```bash
docker compose exec redis redis-cli --scan --pattern 'menu_import:*'
docker compose exec redis redis-cli --scan --pattern 'menu_import:*' | xargs -r docker compose exec -T redis redis-cli DEL
```

## 3. Production

The backend and frontend halves are enabled by **different mechanisms**. Doing only
one leaves either a live button hitting a 404, or a working API nobody can reach.

**Backend — server-side `.env`, no rebuild:**

```bash
ssh <production-host>
cd <DOCKER_DIR>            # holds infrastructure/docker/docker-compose.yml + .env

# Add to .env:
#   MENU_IMPORT_ENABLED=true
#   MENU_IMPORT_BATCH_ENABLED=true
#   OPENAI_API_KEY=sk-...

docker compose up -d --force-recreate backend
docker compose logs --tail=200 backend | grep -i "batch menu import"
```

`REDIS_URL` is set by `docker-compose.yml` itself and must not be added to `.env` —
the compose `environment:` block overrides `env_file` either way.

**Frontend — a GitHub Actions variable plus a rebuild:**

`VITE_MENU_IMPORT_BATCH_ENABLED` is consumed as a Docker build arg in
`.github/workflows/deploy-frontend.yml` and compiled into the static bundle. Set it to
`true` in the target GitHub **Environment** variables (PROD/QA/DEV), then re-run the
deploy so a new frontend image is built and published. Editing the server's `.env`
does nothing for this flag.

**Migrations:** confirm the two `ai_usage_logs` migrations from §1.3 have run against
the landlord database before enabling.

## 4. Reading failures from the response

Every prerequisite fails with a distinct, identifiable response.

| Response | Meaning | Fix |
|---|---|---|
| `404` + `"Batch menu import is not enabled for this environment."` | `MENU_IMPORT_ENABLED` or `MENU_IMPORT_BATCH_ENABLED` is not `true` | §2 / §3 |
| `404` + `"Route ... not found"` (has `data` and `timestamp`) | Express catch-all — the routes are not registered in this build. This was issue #165's original bug | Deploy a build containing the four route registrations in `backend/src/routes/items.js` |
| `503` + `"Batch menu import is enabled but not fully configured."` + `missing: [...]` | Flags on, but `OPENAI_API_KEY` and/or `REDIS_URL` absent | Set what `missing` names |
| `503` + `QUEUE_UNAVAILABLE` | Flags and keys fine, but Redis is not connected right now | Check the redis container/healthcheck |
| `422` + `WORKFLOW_MODE_NOT_FNB` | Tenant is not an F&B business | Expected behaviour — not a misconfiguration |
| `429` + `MENU_IMPORT_BUDGET_EXCEEDED` | Tenant hit `MENU_IMPORT_DAILY_USD_BUDGET` in the last 24h | Wait, or raise the cap deliberately |
| `400` + `"No files provided..."` | Multipart field is not named `files`, or every file was rejected by the mime filter | Send PDF/JPEG/PNG under `files` |
| `202` + `job_id` | Working | Poll `GET /api/v1/items/import/menu/jobs/:jobId` |

The two 404s are the pair most easily confused. The flag guard's body has **no**
`data` and **no** `timestamp`; the catch-all's has both.

### When the job itself fails

A `202` only means the job was accepted. Extraction happens later in the worker, and
every per-file failure is reported the same generic way — job `status: "failed"`, file
`error_code: "EXTRACTION_REQUEST_FAILED"`, message `"Failed to extract menu items from
this image."`. **The real cause is only in the backend logs**, deliberately, so provider
errors are never echoed to a tenant:

```bash
docker compose logs backend --since 10m | grep -iE "menu image extraction|menu pdf extraction"
```

The most common cause is an invalid, revoked, or wrong-project `OPENAI_API_KEY` —
it surfaces there as `OpenAI request failed 401 Incorrect API key provided: sk-...`.
Note the flags-and-config check at boot only verifies the key is **present**, never
that it is valid, so a bad key gives a healthy-looking startup and 202s that all fail.
Verify a key independently before blaming the pipeline:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"    # expect 200
```

## 5. Cost

Extraction is one OpenAI call per text PDF, and one **vision** call per rendered page
for scanned/image-only PDFs and photos. At the default `gpt-4o`, a scanned 15-page
menu is 15 vision calls. The three caps that actually bound spend are
`MENU_IMPORT_MAX_PDF_PAGES` (per file), `MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH`
(per job, enforced with an atomic Redis counter), and `MENU_IMPORT_DAILY_USD_BUDGET`
(per tenant per 24h, checked before a job is enqueued).

Hitting a page/vision cap **truncates and flags** — the items already extracted are
kept and the result carries `truncated: true` plus `pages`/`pages_total`. It is never
a silent drop and never a hard failure. Setting `MENU_IMPORT_MODEL=gpt-4o-mini`
lowers cost substantially at some extraction-quality cost.

## 6. Rollback

```bash
# In the server .env (or local-test .env -> .env.compose):
MENU_IMPORT_BATCH_ENABLED=false
docker compose up -d --force-recreate backend
```

This stops the worker and returns the batch routes to 404 without touching the
single-file path. **`POST /items/import/pdf/preview` and `/confirm` stay live
deliberately** — they need no Redis and are the fallback when the batch worker is
unavailable. Do not remove them; ADR 0049's four ordered removal criteria are not
met, and criterion 3 may legitimately resolve to "keep it".

In-flight jobs are lost on rollback (Redis-only state, 1h TTL). Nothing is written to
a tenant database until a preview is explicitly confirmed, so a rollback mid-job
cannot leave partial items behind.

## 7. Known environment-specific failure

PDF rasterization uses `@napi-rs/canvas`, whose prebuilt Skia binary needs AVX-family
instructions. On a host without them (notably a KVM guest left on the default
`qemu64` CPU model), rasterization is unavailable. `menuPdfRasterService.js` probes
for this in a throwaway child process — a SIGILL is a signal, not a catchable
exception — so the server does not crash; scanned PDFs simply fail per-file with
`PDF_RASTER_UNSUPPORTED` while text PDFs and photos keep working.

If that appears, either move to a host/CPU model with the required ISA level, or set
`MENU_IMPORT_PDF_RASTER_ENABLED=false` to skip the probe and fail scanned PDFs fast.
