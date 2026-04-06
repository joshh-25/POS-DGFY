# POS Readiness Status (Canonical)

Status: authoritative-for-pos-readiness
Last updated: 2026-03-31
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
5. Incoming online queue UI distinguishes access states:
- no `pos:view` -> permission message (not empty queue)
- load failure -> explicit error state
- zero records -> explicit empty queue state
6. Incoming order status actions are disabled when `pos:transact` is missing.
7. Locked terminal disables navigation mode switching until terminal unlock.

## 3) Automated Gate Status (Latest)

1. `npm run install:all` -> PASS
2. `npm --prefix backend run migrate` -> PASS (schema already up to date)
3. `npm run check:architecture` -> PASS
4. `npm run lint:docs` -> PASS
5. `npm --prefix backend run doctor:runtime` -> PASS (`status=healthy`, `missing_migrations=0`, `missing_columns=0`)
6. `npm --prefix backend run audit:indexes` -> PASS (`status=healthy`, `missing=0`)
7. `npm run smoke:pos-local` -> PASS (all endpoint checks `200`)
8. `npm --prefix backend run lint` -> PASS
9. `npm --prefix frontend run lint` -> PASS
10. `npm --prefix backend test` -> PASS (`140 passed suites / 143 total`, `624 passed tests / 631 total`)
11. `npm --prefix frontend test -- --run` -> PASS (`15 files / 57 tests`)
12. `npm run build:skupervisor` -> PASS
13. `npm run build:pos` -> PASS
14. `npm run build:store` -> PASS

## 4) Canonical UAT Assets

1. Checklist: `docs/testing/pos-e2e-uat-checklist.md`
2. Execution script: `docs/testing/pos-e2e-uat-execution-script.md`
3. Evidence template: `docs/testing/pos-e2e-uat-evidence-template.md`
4. Current run log: `docs/testing/pos-e2e-uat-run-2026-03-28.md`

## 5) Update Rule

When POS readiness status changes, update this file first, then align references in:

1. `docs/testing/nonprod-gap-closure-checklist.md`
2. `docs/testing/production-readiness-audit.md`
