---
status: reference
authority_level: reference
owner: expansion_program
last_reviewed: 2026-03-31
applies_to: skupervisor_expansion
topic: findings_ratings_and_phased_remediation
---

# SKU Expansion Findings And Phased Remediation (2026-03-31)

## Authoritative Inputs Used

1. `docs/START_HERE.md` (`last_reviewed: 2026-03-06`)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (`last_reviewed: 2026-03-06`)
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (`last_reviewed: 2026-03-06`)
4. ADR `0001` to `0006`
5. `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`
6. `docs/reference/SKU_EXPANSION_REMEDIATION_PLAN.md`

## Current Ratings (1-10)

1. Architecture compliance: **9.6**
2. Backend contract stability: **9.1**
3. POS sidebar/view correctness: **8.4**
4. Scroll UX reliability: **7.2**
5. Documentation consistency: **7.0**
6. Manual user readiness: **6.8**
7. Overall release readiness: **7.9**

## Findings, Root Causes, And Affected Areas

| ID | Finding | Root Cause | Affected Areas | Evidence |
|---|---|---|---|---|
| F-01 | Remaining closure gap | Manual UAT and signoff still open | Stage 5 readiness, release confidence | `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md` |
| F-02 | Scroll warnings and UX friction risk | Prior wheel interception patterns plus runtime cache/build mismatch | POS workspace panes and sidebar | `frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`, `frontend/src/features/pos/components/TerminalSidebarPanel.jsx`, `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` |
| F-03 | Docs drift across planning artifacts | Stale references not aligned to latest implemented state | Audit transparency, team onboarding | `docs/reference/STOREFRONT_DISCOVERY_EXECUTION_PLAN_PHASED_2026-03-31.md`, `docs/reference/STOREFRONT_DISCOVERY_HARDENING_IMPLEMENTATION_PLAN_2026-03-31.md` |
| F-04 | Cross-doc evidence mismatch risk | Mixed timestamps/test counts in docs | Governance traceability, QA handoff | `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`, `docs/testing/pos-readiness-status.md`, `docs/testing/nonprod-gap-closure-checklist.md` |

## Phased Implementation Plan (Ordered)

### Phase A - Evidence Baseline Lock

- [x] Re-run architecture/docs/runtime/index gates
- [x] Re-run targeted POS/store/tenant integration suites
- [x] Re-run POS frontend lint/tests/build
- [ ] Re-run full human UAT and signoff capture

Exit proof:

1. `npm run check:architecture` -> pass
2. `npm run lint:docs` -> pass
3. `npm --prefix backend run doctor:runtime` -> healthy
4. `npm --prefix backend run audit:indexes` -> healthy
5. Targeted test suites and POS build -> pass

### Phase B - Scroll Reliability Hardening

- [x] Remove custom `onWheel` interception from POS sidebar panes
- [x] Keep pane boundaries via native overflow and `overscroll-contain`
- [x] Rebuild POS app bundle after fix
- [ ] Manual browser verification of no wheel passive-listener warning in active session

Exit proof:

1. `npm --prefix frontend run lint` -> pass
2. `npm --prefix frontend test -- src/features/pos/__tests__` -> pass
3. `npm run build:pos` -> pass

### Phase C - View-Mode Content Integrity

- [x] Keep mode mapping coverage tests for sidebar/workspace/receipt
- [x] Validate operations workspace route surface remains mode-driven (not scroll-jump)
- [ ] Manual click-through verification for all modes in desktop and mobile drawer

Exit proof:

1. `frontend/src/features/pos/__tests__/terminalViewModeContracts.test.js` -> pass

### Phase D - Documentation Convergence

- [x] Publish this findings/ratings phase plan
- [x] Link findings plan from phase checklist
- [ ] Normalize all residual stale references and evidence counts in related docs

Exit proof:

1. `npm run lint:docs` -> pass
2. Checklist points to one current findings/remediation source

### Phase E - Final UAT Closure

- [ ] Execute manual user-standpoint walkthrough (admin, cashier, manager, storefront guest)
- [ ] Capture screenshots and notes in testing evidence docs
- [ ] Record approver signoff and close Stage 5 checkbox

Hard gate:

1. Stage 5 remains incomplete until manual signoff is recorded.

## Latest Command Evidence (2026-03-31)

1. `npm run check:architecture` -> pass
2. `npm run lint:docs` -> pass
3. `npm --prefix backend run doctor:runtime` -> healthy
4. `npm --prefix backend run audit:indexes` -> healthy
5. `npm --prefix backend test -- --runTestsByPath tests/posHandlers.transport.test.js tests/posUsecases.applicationResult.test.js tests/storeHandlers.transport.test.js tests/storeRouteTenantContext.integration.test.js tests/requireTenantContext.middleware.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontTenantResolver.test.js` -> pass
6. `npm --prefix frontend test -- src/features/pos/__tests__` -> pass
7. `npm --prefix frontend run lint` -> pass
8. `npm --prefix backend run lint` -> pass
9. `npm run build:pos` -> pass
10. `npm run build:store` -> pass
