---
status: reference
owner: engineering
last_reviewed: 2026-07-29
related_adr: docs/architecture/adr/0049-batch-menu-import-async-extraction.md
declaration_id: 2026-07-29-pos-menu-photo-capture
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.29
verification_evidence: npx vitest run src/utils/__tests__/menuPhotoQuality.test.js (8 passed),npx vitest run Components/items/__tests__/MenuPhotoCaptureSheet.behavior.test.jsx (7 passed),npx vitest run src/services/__tests__/menuImportService.contract.test.js src/hooks/__tests__/useMenuImportJob.test.js src/features/pos/__tests__/menuImportBatchEntry.contract.test.js src/utils/__tests__/menuPhotoQuality.test.js Components/items (48 passed),npm --prefix frontend run build (succeeded),npx eslint on all new/changed frontend files (0 errors)
rollback_note: Revert this PR's diff. The camera surface is entirely contained in two new files (MenuPhotoCaptureSheet.jsx, menuPhotoQuality.js) plus a Take Photos button and one conditional render inside MenuImportBatchModal.jsx, which itself only renders behind VITE_MENU_IMPORT_BATCH_ENABLED (default off). No compliance-classified file is touched, and no camera permission is requested unless an operator explicitly opens the capture surface.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-29T07:00:00+08:00
preflight_request_ref: PR-133-BATCH-MENU-IMPORT-PHASE5
---

# POS Menu Photo Capture

## Compliance Impact Classification

Major. No file matched by the compliance classification matrix is changed by this diff — the camera
surface lives entirely in `frontend/Components/items/**` and `frontend/src/utils/**`, and
`TerminalOperationsWorkspace.jsx` is untouched since the Phase 4 declaration
(`2026-07-29-pos-batch-menu-import`). The declaration is filed anyway, at the `pos`/`terminal`
floor those surfaces carry, because the change introduces a **new device-permission surface**
(camera access) reachable from the POS terminal by a store operator. A capability that asks a user
for hardware permission warrants a declaration on its own terms, independent of which files the
path-matching rules happen to cover.

## Affected Surfaces

- `frontend/Components/items/MenuPhotoCaptureSheet.jsx` (new): requests `getUserMedia` with the rear
  camera preferred, renders a live preview with pre-shutter quality warnings, captures frames to
  JPEG `File` objects, and lets the operator discard any shot before handing them over. Camera
  tracks are stopped when the sheet is cancelled, when captures are handed over, and on unmount.
  Rendered inline inside the batch wizard rather than as its own dialog.
- `frontend/src/utils/menuPhotoQuality.js` (new): pure scoring heuristic (sharpness, exposure,
  glare, source resolution). No DOM, no network, no storage.
- `frontend/Components/items/MenuImportBatchModal.jsx`: adds a "Take Photos" button, the conditional
  render of the capture sheet, and the handler that appends captured files to the same staged list
  the picker and drop zone feed. The button is always offered and the sheet reports why the camera
  is unreachable when it is, rather than the entry point silently disappearing. The
  file input moved out of its wrapping label so the capture sheet's fallback can trigger it; its
  behavior is unchanged.
- No backend file is changed. Captured photos travel the identical authenticated upload path picked
  files already use, and the server cannot distinguish the two.

## Compliance Preconditions

1. The capability inherits the batch import gate: the capture surface is inside
   `MenuImportBatchModal`, which renders only when `VITE_MENU_IMPORT_BATCH_ENABLED=true` (default
   off in every environment) and only for a user who passes the existing `canCreateItems` check.
   No new permission, role, or route is introduced.
2. Camera permission is requested only on explicit operator action — opening the capture surface —
   never on page load or modal open. Denial is non-blocking: the surface degrades to the existing
   file picker rather than trapping the operator. A POS served over plain HTTP (a LAN-host terminal,
   per ADR 0025) has no `mediaDevices` API at all; that case is reported as an HTTPS requirement
   with the same file-picker fallback, matching how `ProductQrScannerModal` already handles it.
3. The quality check never blocks. `analyzeMenuPhotoQuality` returns `blocking: false`
   unconditionally, no threshold refuses a capture, and a warned-about shot is still added if the
   operator keeps it. This is an explicit product decision, asserted by a test.
4. Captured images stay in browser memory for the life of the wizard: they are held as `File`
   objects, previewed through object URLs that are revoked on discard and unmount, and never written
   to local storage, IndexedDB, or any third-party endpoint. The only place a captured photo goes is
   the same tenant-authenticated menu-import upload a picked file goes to.
5. Extracted items from a captured photo receive identical treatment to any other source: merged and
   deduped server-side, validated through the CSV import pipeline, and shown in the editable review
   step before anything is persisted. No item is created from a photo without an explicit confirm.
6. No fiscal-document, payment, tax-computation, receipt, shift, or catalog-visibility logic is
   touched.

## Verification Evidence

The commands in front matter were run directly in this session: 8 quality-heuristic tests, 7 capture
component tests (rear-camera request, warn-don't-block, JPEG `File` hand-off, slot limit, permission
refusal falling back to the picker, and track cleanup on unmount), and 48 tests across the full
menu-import frontend suite all passed; the frontend production build succeeded; eslint reported no
errors on any new or changed file.

Outstanding before merge, none of which is reachable from this sandbox:

- The camera path has been exercised only against a mocked `getUserMedia` in jsdom. It needs a real
  device pass — Android Chrome and iOS Safari at minimum — covering permission prompt, rear-camera
  selection, orientation, and the permission-denied fallback.
- The quality thresholds (`MENU_PHOTO_QUALITY_THRESHOLDS`) are calibrated against synthetic frames,
  not real menu photos. They should be re-tuned against a sample of genuine store photos before the
  flag is enabled for tenants; because the check only ever warns, a mis-tuned threshold degrades to
  noisy or absent advice rather than a blocked capture.
- `POST /api/v1/compliance/preflight` has not been executed against a live tenant environment, for
  the same reason recorded in `2026-07-29-pos-batch-menu-import`. The front-matter preflight fields
  record the classification decision, not an observed API response.
