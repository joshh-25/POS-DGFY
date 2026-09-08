---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-image-preview-contract-test-staleness-fix
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.09.07
verification_evidence: apps/dgfy-ims (npx vitest run contract.test integration.test, matching npm run test:frontend:contracts) -- 108/108 files, 563/563 tests passing
rollback_note: Test-only change (one assertion updated, one obsolete test file deleted). No application code, migration, or API surface touched. Rollback is a plain code revert with zero runtime effect.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T11:10:05.251Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-09-08-POS-IMAGE-PREVIEW-CONTRACT-TEST-STALENESS-FIX
---

# POS image-preview contract test staleness fix (candidate 2026-09-08-02 repair)

## Compliance Impact Classification

`major` (per `check:compliance`'s computed mechanical floor for these paths, which also flags a
`terminal` surface -- both accepted as-is rather than argued down, since the underlying paths do
sit in POS/terminal-sensitive territory even though this specific diff is test-only). No
application code, API endpoint, migration, or reason code is actually touched by this diff.

## What this changes and does not change

- PR #1744 (bd311e37f, "feat(pos): reconcile catalog image previews") replaced the old single-poll
  item-image-upload flow in `TerminalOperationsWorkspace.jsx` with the new pending-preview job
  mechanism (`stagePendingPosItemImagePreview` / `bindPendingPosItemImagePreviewJob`), but left two
  contract tests still asserting the removed implementation -- a pre-existing gap in that PR, not
  introduced here.
- `posCreateItemImageUploadPoll.contract.test.js` (the old #1410 contract) tested the entire removed
  poll-based flow (`getStorefrontCatalogImageUploadStatus`, `pollCatalogImageUploadStatus`,
  `CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS`) -- none of which exist in the current file. Deleted;
  the behavior it guarded was intentionally superseded, not silently dropped.
- `posCatalogPerformance.contract.test.js` asserted a literal `<PosItemImage` JSX string in
  `TerminalOperationsWorkspace.jsx` -- also removed by the same rewrite. Updated to assert the
  mechanism that actually replaced it (`stagePendingPosItemImagePreview` /
  `bindPendingPosItemImagePreviewJob`) instead of a stale string match.
- No behavior change to any shipped code. No new reason code, no new API surface, no money/tax/
  fiscal-document/customer-identity path touched.

## Affected Surfaces

- `packages/web-core/src/features/pos/__tests__/posCatalogPerformance.contract.test.js` (updated)
- `packages/web-core/src/features/pos/__tests__/posCreateItemImageUploadPoll.contract.test.js` (deleted)

## Compliance Preconditions

- No endpoint is accepted or exercised by this diff -- `preflight_result: not_applicable` /
  `NO_ENDPOINT_ACCEPTED_SURFACE`, matching the established pattern for test-only/no-API-surface
  diffs (e.g. `2026-09-05-discovery-delivery-from-price.md`).
- No refund, settlement, capture, checkout, or fiscal-document code path is touched.

## Verification Evidence

- `npx vitest run contract.test integration.test` from `apps/dgfy-ims` (matching CI's
  `npm run test:frontend:contracts`) -- 108/108 files, 563/563 tests passing (was 107/109 files
  passing, 7 tests failing across 2 files, before this fix).
