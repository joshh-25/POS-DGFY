---
status: reference
owner: engineering
last_reviewed: 2026-09-10
declaration_id: 2026-09-10-pos-bulk-image-import-lint-fix
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.10
verification_evidence: npx eslint (0 errors on both touched files), npm run lint (0 errors repo-wide), node scripts/audit-dependencies.js --omit-dev (PASS), node scripts/check-architecture-guardrails.js, node scripts/check-controller-boundaries.js
rollback_note: Revert the three eslint-disable/comment additions; no runtime behavior, validation logic, or data handling changes in either touched file.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T11:42:20.669Z
preflight_request_ref: PREFLIGHT-1757497340-2026-09-10-POS-BULK-IMAGE-IMPORT-LINT-FIX
---

# POS bulk image-import subsystem: lint-only fix

## Compliance Impact Classification

Major (per the repo's computed path-based minimum for this surface, matching the classification
already used for the 2026-09-06 POS-Development integration declaration that first introduced
these files). Substantively minor in effect -- see Affected Surfaces and Verification Evidence
below. Resolves 4 real `dgfy-api-quality` ESLint failures (`no-control-regex` x3, `no-empty` x1)
found on `release/2026-09-10-01-r1`'s promotion-quality-gate run, introduced by PR #1777's bulk
ZIP/CSV image-import subsystem. Purely cosmetic/lint fixes: a justified `eslint-disable-next-line
no-control-regex` on each of the three intentional control-character-rejection regexes (SKU and
filename input validation), and an explanatory comment inside a previously-empty `catch {}` around
a best-effort `zipFile.close()`. No regex pattern, validation logic, or control flow changed.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/domain/posBulkImageImportManifest.js` — CSV row SKU/filename
   validation (comment-only change).
2. `apps/dgfy-api/src/modules/pos/repositories/posBulkImageImportStorage.js` — safe-filename
   pattern and ZIP-extraction error handling (comment-only change).

## Compliance Preconditions

1. SKU and filename validation must continue rejecting the same set of inputs as before this
   change (no regex pattern altered).
2. The bulk image-import job's error handling on a failed ZIP entry must behave identically.

## Verification Evidence

`npx eslint` reports 0 errors/0 warnings on both touched files; the full `npm run lint` for
`apps/dgfy-api` reports 0 errors (11 pre-existing, unrelated warnings only).
`node scripts/audit-dependencies.js --omit-dev` PASS across all 7 trees. Architecture guardrails
and controller-boundary checks pass unchanged.
