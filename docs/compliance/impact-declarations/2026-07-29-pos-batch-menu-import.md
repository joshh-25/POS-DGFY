---
status: reference
owner: engineering
last_reviewed: 2026-07-29
related_adr: docs/architecture/adr/0039-batch-menu-import-async-extraction.md
declaration_id: 2026-07-29-pos-batch-menu-import
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.29
verification_evidence: npx vitest run src/services/__tests__/menuImportService.contract.test.js src/hooks/__tests__/useMenuImportJob.test.js Components/items/__tests__/MenuImportBatchModal.behavior.test.jsx src/features/pos/__tests__/menuImportBatchEntry.contract.test.js (15 passed),npx vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/itemsPagination.contract.test.js src/features/pos/__tests__/posPageShell.contract.test.js Components/items (69 passed),backend jest menu-import suites - menuExtractionService/menuImportJobRepository/menuImportWorker/mergeMenuImportItems/previewMenuImportJobUseCase/menuImportBatchHandlers/menuPdfRasterService (75 passed),npm --prefix frontend run build (succeeded),npm --prefix backend run check:architecture-guardrails,npm --prefix backend run check:controller-boundaries
rollback_note: Revert this PR's diff. The only change to TerminalOperationsWorkspace.jsx is one added flag read (isMenuImportBatchEnabled), two derived constants, a label swap on the existing import button, and a modal branch that renders MenuImportBatchModal instead of PdfMenuImportModal - all still behind the same canCreateItems gate. With VITE_MENU_IMPORT_BATCH_ENABLED unset (the default) the rendered POS Items page is byte-for-byte the behavior that shipped before, and the backend batch routes 404 unless MENU_IMPORT_BATCH_ENABLED is explicitly true.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-29T05:20:00+08:00
preflight_request_ref: PR-133-BATCH-MENU-IMPORT-PHASE4
---

# POS Batch Menu Import (Multi-File Wizard)

## Compliance Impact Classification

Major. The classification floor comes from `frontend/src/features/pos/**`
(`pos`, `terminal`, `major`) per `docs/compliance/compliance-classification-matrix.md`, which is
matched by the single compliance-sensitive file this change touches,
`frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`. No payments, settings,
fiscal-document, or compliance-classified file is touched. Item creation itself is unchanged: batch
rows are rendered as a signed CSV and pass through the same
`csvImportService.previewImport`/`confirmImport` path CSV-imported and single-file-PDF-imported rows
already use in production, so no new persistence, pricing, or validation logic is introduced. The
whole capability is off by default in every environment.

The backend half of this feature (async job backbone, merge/dedup preview, scanned-PDF
rasterization) landed earlier on the same branch and is governed by ADR 0039; this declaration
covers the full batch capability, including the POS-surface wizard that makes it reachable by an
operator for the first time.

## Affected Surfaces

- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx` (compliance-sensitive):
  adds one `isMenuImportBatchEnabled()` flag read and two derived constants
  (`menuImportEntryEnabled`, `menuImportButtonLabel`); the existing "Import from PDF" button
  (desktop and mobile) now reads its label from that constant and renders when either import flag is
  on; the modal render branches to `MenuImportBatchModal` when the batch flag is on and otherwise
  keeps rendering `PdfMenuImportModal` exactly as before. Every one of these remains behind the
  `canCreateItems` permission gate that already guards "Add Item" — no new capability is exposed to
  any role that could not already create items manually, and no checkout, shift, catalog, or
  Items-list behavior is modified.
- `frontend/Components/items/MenuImportBatchModal.jsx` (new),
  `frontend/src/hooks/useMenuImportJob.js` (new), `frontend/src/services/menuImportService.js`
  (new): the multi-file upload → poll → merged-review → confirm wizard, its job-polling hook, and
  its API client. None of these files is imported by, nor modifies, any checkout, shift, payment, or
  receipt code path.
- `backend/src/modules/menuImport/usecases/getMenuImportJobUseCase.js`: adds `pages_total` and
  `truncated` to the public per-file projection so the wizard can tell an operator that a long
  scanned PDF was only partly read. The projection continues to strip extracted `items` and the
  on-disk `path`; no field is removed.
- `backend/.env.example`: documents the batch flag and its six server-side caps. Configuration
  documentation only — no runtime code path reads this file.

## Compliance Preconditions

1. The capability is disabled by default in every environment. The backend batch routes return 404
   unless `MENU_IMPORT_BATCH_ENABLED=true` (and 503 listing the missing configuration if the flag is
   on without `MENU_IMPORT_ENABLED`, `OPENAI_API_KEY`, or `REDIS_URL`), and the batch wizard never
   renders unless `VITE_MENU_IMPORT_BATCH_ENABLED=true`. No existing deployment's behavior changes
   from this PR alone.
2. Item-creation authorization is unchanged. Every batch route is gated by the same
   `PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS` permission the existing CSV and single-file PDF
   import routes use, and the wizard entry point renders only for the same `canCreateItems` role
   check that already gates "Add Item". No unauthenticated or under-permissioned mutation path is
   introduced.
3. Extracted rows never bypass validation. The merged batch is rendered as one signed CSV and
   handed to the same `previewItemsImportUseCase`/`confirmImport` functions CSV import uses, so
   batch rows receive identical Joi-schema validation, SKU de-duplication, and mode-taxonomy checks.
   Client-side `valid`/`included` flags are advisory only — confirm re-validates server-side.
4. The capability stays restricted to Food & Beverage workflow-mode tenants: a non-F&B tenant's
   upload is rejected with `WORKFLOW_MODE_NOT_FNB` before any file is queued or any AI call is made.
5. No money value is decided on the operator's behalf. Where two files disagree on an item's price,
   the row is flagged `price_conflict` with every observed price shown next to an editable price
   field rather than silently resolved; near-duplicate items are flagged and kept separate rather
   than merged; and a partly-read scanned PDF is reported with its page counts rather than presented
   as complete.
6. No fiscal-document, payment, tax-computation, receipt, or shift logic is touched. Created items
   reach the POS through the same `GET /api/v1/pos/catalog` surfacing manually-created and
   CSV-imported items already use.
7. AI spend is bounded server-side per tenant and per batch (file count, PDF pages, vision calls per
   job, and a daily USD budget read from `ai_usage_logs`), so enabling the flag cannot expose a
   tenant to unbounded third-party cost. Job state lives only in Redis with a 1-hour TTL and holds
   file paths, never uploaded bytes; uploaded files are unlinked as soon as extraction settles.

## Verification Evidence

The commands in front matter were run directly in this session (dependencies were installed for both
`backend/` and `frontend/`): 15 new frontend tests across the batch service, job hook, wizard
component, and POS entry-point contract passed; 69 existing POS/Items tests passed unchanged; the 75
backend menu-import tests across 7 suites passed after the `getMenuImportJobUseCase` projection
change; `npm run build` produced a clean frontend production build; and both backend architecture
guardrail checks passed.

Outstanding before merge, none of which is reachable from this sandbox (no live backend, tenant
database, Redis, or nginx binary):

- `POST /api/v1/compliance/preflight` has **not** been executed against a live tenant environment.
  The front-matter preflight fields record this change's classification decision — `pos`/`terminal`
  surfaces, no compliance-controlled operation touched, therefore `no_breach`/`ALLOWED` — and a
  reviewer with a live environment must run the endpoint and reconcile `preflight_run_at` /
  `preflight_request_ref` before merge.
- The end-to-end batch flow (real Redis, real worker, real OpenAI key) has been exercised only
  against mocks and unit tests; the manual checklist in
  `docs/proposals/MENU_IMPORT_BATCH_IMPORT_HANDOFF_2026-07-28.md` covers it.
- `npm run check:compliance` and `npm run lint:docs` should be re-run in CI to confirm before merge.
