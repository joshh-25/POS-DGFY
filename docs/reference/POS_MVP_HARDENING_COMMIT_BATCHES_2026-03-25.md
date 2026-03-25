---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-03-25
applies_to: pos_mvp_hardening_release
topic: phased_commit_batches
---

# POS MVP Hardening - Phased Commit Batches

This guide prepares commit batches in review-safe phases.

## Preconditions
1. Verify branch is correct.
2. Verify tests/lint before committing each phase.
3. Keep live canary work out of these batches until credentials are available.

## Phase A - POS Data + Backend Core
Scope:
- `backend/migrations/20260325000001-add-item-vat-type-for-pos.cjs`
- `backend/migrations/20260325000002-create-pos-transactions.cjs`
- `backend/migrations/20260325000003-add-pos-reference-type-and-settings.cjs`
- `backend/src/models/PosInvoiceCounter.js`
- `backend/src/models/PosTransaction.js`
- `backend/src/models/PosTransactionLine.js`
- `backend/src/modules/pos/**`
- `backend/src/controllers/posController.js`
- `backend/src/routes/pos.js`
- `backend/src/validators/posValidator.js`
- `backend/tests/posUsecases.applicationResult.test.js`
- `backend/tests/posHandlers.transport.test.js`
- `backend/tests/posCheckout.db.integration.test.js`

Commands:
```powershell
git add backend/migrations/20260325000001-add-item-vat-type-for-pos.cjs
git add backend/migrations/20260325000002-create-pos-transactions.cjs
git add backend/migrations/20260325000003-add-pos-reference-type-and-settings.cjs
git add backend/src/models/PosInvoiceCounter.js backend/src/models/PosTransaction.js backend/src/models/PosTransactionLine.js
git add backend/src/modules/pos backend/src/controllers/posController.js backend/src/routes/pos.js backend/src/validators/posValidator.js
git add backend/tests/posUsecases.applicationResult.test.js backend/tests/posHandlers.transport.test.js backend/tests/posCheckout.db.integration.test.js
git commit -m "feat(pos): add POS schema, module, and backend checkout flow"
```

## Phase B - POS Frontend MVP
Scope:
- `frontend/src/features/pos/**`
- POS route wiring in `frontend/src/main.jsx` (if included in this release)

Commands:
```powershell
git add frontend/src/features/pos
git add frontend/src/main.jsx
git commit -m "feat(pos-ui): add POS route, terminal flow, and receipt view"
```

## Phase C - Hardening and Lint Burn-Down
Scope:
- Runtime and non-runtime backend cleanup touched during hardening:
  - `backend/src/config/**`
  - `backend/src/constants/**`
  - `backend/src/middleware/**`
  - `backend/src/modules/**` (non-POS hardening updates)
  - `backend/src/routes/**` (non-POS hardening updates)
  - `backend/src/services/**`
  - `backend/src/templates/**`
  - `backend/src/utils/**`
  - `backend/src/scripts/**`
  - `backend/src/seeders/**`
  - related backend tests adjusted for contract consistency

Commands (review with `git status` before commit):
```powershell
git add backend/src/config backend/src/constants backend/src/middleware
git add backend/src/modules backend/src/routes backend/src/services
git add backend/src/templates backend/src/utils backend/src/scripts backend/src/seeders
git add backend/tests
git add backend/scripts/audit-billing-funnel.js
git commit -m "chore(hardening): burn down lint debt and stabilize runtime contracts"
```

## Phase D - Documentation + Ops Cleanup
Scope:
- `SKUpervisor Digital POS MVP Implementation Plan (Hardened).md`
- `docs/testing/production-readiness-audit.md`
- this file
- cleanup of stale generated artifact: `backend/jest-results.json`

Commands:
```powershell
git add "SKUpervisor Digital POS MVP Implementation Plan (Hardened).md"
git add docs/testing/production-readiness-audit.md docs/reference/POS_MVP_HARDENING_COMMIT_BATCHES_2026-03-25.md
git add -u backend/jest-results.json
git commit -m "docs(release): update readiness evidence, canary note, and phased commit plan"
```

## Validation Checklist Per Phase
1. `cd backend && npm run lint`
2. `cd .. && npm run check:architecture`
3. `cd backend && npm test -- tests/posCheckout.db.integration.test.js`
4. `cd .. && npm test`

## Live Canary Follow-Up (Deferred)
Commit separately once credentials are available:
- PayPal live/sandbox canary config
- canary run artifacts
- updated readiness audit with canary evidence
