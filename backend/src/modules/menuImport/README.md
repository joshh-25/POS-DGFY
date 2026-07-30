# Menu Import Module

Batch menu import (multi-file: several PDFs/photos extracted in one job) — the
async-job capability tier layered on top of the pre-existing single-file PDF/
image menu importer (`services/menuExtractionService.js`,
`controllers/menuImportController.js`). Env-gated via
`config/menuImportFeature.js` (`MENU_IMPORT_BATCH_ENABLED`, default OFF).

Flow:

`routes -> menuImportBatchHandlers -> menuImport use-cases -> menuImportJobRepository (Redis) / menuExtractionService`

Job state lives only in Redis (`menuImportJobRepository.js`), never a DB table
— see the menu batch import ADR for why. The background worker
(`workers/menuImportWorker.js`) drains the job queue and calls
`menuExtractionService` directly; it never opens a tenant database connection
— all tenant-scoped work (workflow-mode checks, AI spend budget checks, the
final signed-CSV preview/confirm) happens in request context, in the
use-cases below, before/after the worker runs.
