# POS Readiness Status (Canonical)

Status: authoritative-for-pos-readiness
Last updated: 2026-03-30
Overall status: in_progress

## 1) Canonical Blockers

1. Human cashier/admin UAT signoff is pending.
2. No production rollout is in scope for this pass (non-production only).

## 2) Current Behavior Snapshot

1. POS catalog eligibility is item-level with explicit defaults:
- override row present => use `pos_visible`
- no override row =>
  - finished goods visible by default
  - non-finished categories hidden by default until enabled
2. POS override and POS image write actions require `items:edit`.
3. Folder POS visibility (`show_in_pos_filter`) controls POS category chips only.
4. Terminal opening float defaults from configured petty cash when input is empty/zero-like and no shift is open.

## 3) Automated Gate Status (Latest)

1. `npm run check:architecture` -> PASS
2. `npm run lint:docs` -> PASS
3. `npm --prefix backend test -- tests/posUsecases.applicationResult.test.js tests/posHandlers.transport.test.js tests/posCheckout.db.integration.test.js` -> PASS
4. `npm --prefix frontend run build` -> PASS

## 4) Canonical UAT Assets

1. Checklist: `docs/testing/pos-e2e-uat-checklist.md`
2. Execution script: `docs/testing/pos-e2e-uat-execution-script.md`
3. Evidence template: `docs/testing/pos-e2e-uat-evidence-template.md`
4. Current run log: `docs/testing/pos-e2e-uat-run-2026-03-28.md`

## 5) Update Rule

When POS readiness status changes, update this file first, then align references in:

1. `docs/testing/nonprod-gap-closure-checklist.md`
2. `docs/testing/production-readiness-audit.md`
