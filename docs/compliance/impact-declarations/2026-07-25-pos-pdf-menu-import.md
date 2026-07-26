---
status: reference
owner: engineering
last_reviewed: 2026-07-25
declaration_id: 2026-07-25-pos-pdf-menu-import
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.25
verification_evidence: backend/tests/menuExtractionService.test.js (8 passed),backend/tests/csvImportService.workflowMode.test.js (19 passed),backend/tests/itemsCategoryRoutes.contract.test.js (1 passed),frontend vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js+itemsPagination.contract.test.js+src/features/inventory/__tests__/itemProductWizard.contract.test.js+externalProductLookup.contract.test.js (68 passed),node --check on all new/changed backend files
rollback_note: Revert this PR's diff. The only change to TerminalOperationsWorkspace.jsx is one new state variable, one new conditionally-rendered button (desktop + mobile), and one new conditionally-rendered modal, all gated behind canCreateItems && VITE_MENU_PDF_IMPORT_ENABLED (default false); the new backend routes 404 unless MENU_IMPORT_ENABLED is explicitly set to true. Reverting removes the feature cleanly without touching any existing Items-page, checkout, shift, or catalog behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-25T17:00:00Z
preflight_request_ref: PR-98
---

# POS PDF Menu Import

## Compliance Impact Classification

Major. This adds a new, env-gated "Import from PDF" capability to the POS terminal's Items page,
letting an owner/manager bulk-create menu items from an uploaded PDF menu instead of adding items
one by one. Classified `major` per the `pos`/`terminal` surface floor since the only
compliance-sensitive file touched is `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`
(a POS-surface file); no payments, settings, or compliance-classified file is touched anywhere in
this PR, and the feature is off by default in every environment.

## Affected Surfaces

- `frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`: adds one `useState` flag,
  one `pdfMenuImportEnabled` read of `VITE_MENU_PDF_IMPORT_ENABLED`, and an "Import from PDF" button
  (desktop + mobile) next to the existing "Add Item" button in the Items view, plus the new
  `PdfMenuImportModal` render call. All three additions are conditionally rendered behind
  `canCreateItems && pdfMenuImportEnabled` — the same permission gate that already guards "Add Item" —
  so no existing Items-page, checkout, shift, or catalog behavior changes when the flag is off (the
  default), and no new capability is exposed to any role that couldn't already create items manually.
- `frontend/Components/items/PdfMenuImportModal.jsx` (new), `frontend/src/hooks/usePdfMenuImport.js`
  (new): self-contained upload -> editable review -> confirm wizard and its API-client hook; neither
  file is imported by, nor modifies, any existing checkout/shift/payment code path.
- `backend/src/routes/items.js`: adds two new routes, `POST /items/import/pdf/preview` and
  `POST /items/import/pdf/confirm`, both placed before the `:item_id` routes (matching the existing
  CSV-import route placement) and both gated by a `requireMenuImportEnabled` middleware that 404s
  the route entirely unless `MENU_IMPORT_ENABLED=true` is set, then by the existing
  `items:import` permission. No existing route's path, order, or behavior is modified.
- `backend/src/controllers/menuImportController.js`, `backend/src/services/menuExtractionService.js`,
  `backend/src/config/menuImportFeature.js` (all new): preview calls the extraction service then
  delegates to the pipeline's own confirm reuses `csvImportService.confirmImport` — the exact same
  server-side re-validation/de-duplication/bulk-create path the existing CSV item import already uses
  in production — no new persistence or validation logic is introduced for item creation itself.

## Compliance Preconditions

1. The feature is disabled by default in every environment: the backend routes return 404 unless
   `MENU_IMPORT_ENABLED=true` is explicitly configured, and the frontend button/modal never render
   unless `VITE_MENU_PDF_IMPORT_ENABLED=true` is explicitly configured. No existing deployment's
   behavior changes from this PR alone.
2. Item creation authorization is unchanged: the new routes are gated by the same
   `PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS` permission the existing CSV import routes already use,
   and the frontend button only renders for the same `canCreateItems` role check that already gates
   "Add Item" — no new unauthenticated or under-permissioned mutation path is introduced.
3. PDF-extracted rows never bypass validation: `menuExtractionService.js` formats extracted items as a
   signed CSV and hands it to the same `csvImportService.previewImport` / `confirmImport` functions the
   existing CSV import already uses in production, so PDF-imported rows get identical Joi-schema
   validation, SKU de-duplication, and mode-taxonomy checks as CSV-imported rows — confirmed by a test
   asserting the generated CSV round-trips through the real, unmocked `previewImport`.
4. The feature is further restricted to Food & Beverage workflow-mode tenants (the only mode with a
   `menu_item` item preset) — a non-F&B tenant's PDF upload is rejected up front with a clear message
   before any extraction or item-creation attempt.
5. No fiscal-document, payment, or tax-computation logic is touched; created items go through the
   exact same POS-catalog surfacing (`GET /api/v1/pos/catalog`) that manually-created and
   CSV-imported items already use — no new catalog-visibility or pricing pathway is introduced.

## Verification Evidence

The commands listed in front matter were run directly in this session (dependencies were installed
for both `backend/` and `frontend/`, unlike some prior declarations that had no `node_modules`
available): all 28 backend tests across `menuExtractionService.test.js`,
`csvImportService.workflowMode.test.js`, and `itemsCategoryRoutes.contract.test.js` passed; 68
frontend vitest tests across the Items/terminal/inventory contract suites passed; `node --check`
passed on every new/changed backend file. `npm run lint:docs` and the full `npm run check:compliance`
/ `npm run check:architecture` CI jobs should still be re-run in CI to confirm before merge.
