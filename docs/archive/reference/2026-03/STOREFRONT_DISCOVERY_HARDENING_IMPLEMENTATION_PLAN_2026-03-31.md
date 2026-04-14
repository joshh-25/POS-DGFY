---
status: reference
authority_level: reference
owner: expansion_program
last_reviewed: 2026-03-31
applies_to: storefront_discovery_and_guest_checkout
topic: implementation_plan
---

# Storefront Discovery Hardening Implementation Plan (2026-03-31)

> Note (2026-03-31): This file is retained for historical traceability.
> Active findings/ratings/remediation baseline now lives in:
> `docs/reference/SKU_EXPANSION_FINDINGS_PHASED_PLAN_2026-03-31.md`
> and `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`.

## 1) Authoritative Inputs (Decision Basis)

1. `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
4. `docs/architecture/adr/0001-modular-monolith-boundaries.md`
5. `docs/architecture/adr/0002-error-contract-unification.md`
6. `docs/architecture/adr/0003-migration-facade-strategy.md`
7. `docs/architecture/adr/0004-architecture-compliance-automation.md`
8. `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`

## 2) Problem Statement (Evidence-Backed)

### F1: Discovery leaks tenant company token
- Evidence:
  - `backend/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js` includes `company_token` in response row.
- Risk:
  - Tenant boundary weakening and secret-like token exposure.

### F2: Discovery hot path uses cross-tenant fan-out
- Evidence:
  - Discovery iterates active tenants, opens tenant DB connections, and reads per-tenant settings/location/item count.
- Risk:
  - Latency and connection pressure growth as tenant count scales.

### F3: Discovery has no dedicated throttle lane
- Evidence:
  - `backend/src/routes/storefrontDiscovery.js` does not apply endpoint-specific limiter.
- Risk:
  - Abuse amplification on expensive public endpoint.

### F4: Guest checkout UX has incomplete error handling
- Evidence:
  - `frontend/apps/store/src/main.jsx` quote/checkout flow lacks full catch-path user feedback.
- Risk:
  - Broken UX with unclear recovery when network/API fails.

### F5: Discovery failure telemetry is weak
- Evidence:
  - Per-tenant discovery build errors are currently swallowed.
- Risk:
  - Hidden partial outages and slow diagnosis.

### F6: Coverage gap for new discovery contracts
- Evidence:
  - Missing dedicated discovery route/usecase/repository tests.
- Risk:
  - Regression risk in future changes.

## 3) Change Classification and ADR Impact

- Classification: `cross-boundary` (public discovery model, security contract, routing, frontend flow).
- ADR impact:
  - Existing ADR 0006 governs current expansion approach.
  - If we add landlord index table + sync pipeline semantics that alter cross-surface data topology, add ADR 0006 addendum section (or ADR 0007 if change scope widens).

## 4) Phased Implementation Sequence

## Phase P0 - Baseline, Freeze, and Safety Rails

### Objectives
1. Freeze target behavior and risk criteria before modifying contracts.
2. Capture baseline gates and rollback anchors.

### Tasks
- [ ] Record this plan and link it from `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`.
- [ ] Capture and store outputs:
  - `npm run check:architecture`
  - `npm run lint:docs`
  - `npm --prefix backend run doctor:runtime`
  - `npm --prefix backend run audit:indexes`
- [ ] Capture current discovery response samples for before/after diff.
- [ ] Define rollback bundle per phase (files + commands + expected state).

### Exit Criteria
- [ ] Baseline evidence logged with timestamps.
- [ ] No stage proceeds without rollback notes.

---

## Phase P1 - Security Containment (Highest Priority)

### Objectives
1. Remove public exposure of `company_token`.
2. Introduce scoped store access handoff for public store API use.
3. Add discovery-specific abuse controls.

### Tasks
- [ ] Backend: remove `company_token` from discovery row contract.
  - Target file:
    - `backend/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js`
- [ ] Introduce public storefront access token flow:
  - Add endpoint to mint short-lived, slug-scoped store access token.
  - Add middleware for `/api/v1/store/*` public routes to accept store access token and resolve tenant safely.
  - Keep existing `requireTenantContext` compatibility path during migration behind explicit fallback branch.
- [ ] Add discovery route limiter:
  - Extend `backend/src/middleware/rateLimiter.js` with storefront discovery profile.
  - Apply in `backend/src/routes/storefrontDiscovery.js`.
- [ ] Add security event logs for:
  - invalid store access token
  - repeated discovery abuse signatures
  - slug probing patterns

### Affected Areas
- Backend routing/middleware/security:
  - `backend/src/routes/storefrontDiscovery.js`
  - `backend/src/middleware/rateLimiter.js`
  - `backend/src/middleware/*` (new store discovery auth guard)
  - `backend/src/modules/storefrontDiscovery/**`
  - `backend/src/routes/store.js`

### Exit Criteria
- [ ] Discovery payload has no `company_token`.
- [ ] Public store requests function using scoped access token.
- [ ] Discovery limiter active and tested.

---

## Phase P2 - Discovery Data Topology Hardening (Scale + Robustness)

### Objectives
1. Eliminate hot-path multi-tenant fan-out.
2. Move to index-backed read model for discovery.

### Tasks
- [ ] Add landlord discovery index table/model (e.g. `storefront_discovery_index`).
- [ ] Add index updater/synchronizer:
  - writes triggered by settings/location updates
  - periodic reconciliation job for drift repair
- [ ] Refactor discovery repository to read from index only.
- [ ] Keep temporary fallback guarded by explicit feature flag and removal plan.

### Affected Areas
- `backend/migrations/*` (new landlord index migration)
- `backend/src/models/Landlord/*` (new index model)
- `backend/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js`
- `backend/src/modules/settings/**` and `backend/src/modules/tenantLocations/**` (index update hooks/events)
- scheduler/service registration (if periodic reconciliation added)

### Exit Criteria
- [ ] No per-request tenant DB fan-out for `/storefront/discovery`.
- [ ] Measured response latency remains stable under synthetic load.

---

## Phase P3 - Guest UX Reliability and Error Semantics

### Objectives
1. Make guest checkout/tracking resilient and clear.
2. Prevent silent failures in quote/checkout.

### Tasks
- [ ] Add robust `try/catch` paths for quote + checkout + tracking in store UI.
- [ ] Add explicit error display zones and retry actions.
- [ ] Add per-action pending/disabled states with clear labels.
- [ ] Normalize user copy for operational state errors (closed store, unsupported method, auth token expired).
- [ ] Confirm map/list/grid behavior parity and selection persistence.

### Affected Areas
- `frontend/apps/store/src/main.jsx`
- (optional extraction) `frontend/apps/store/src/components/*`

### Exit Criteria
- [ ] No unhandled promise rejection in guest critical path.
- [ ] UX clearly communicates failures and recovery actions.

---

## Phase P4 - Observability and Operational Diagnostics

### Objectives
1. Ensure discovery/storefront failures are diagnosable.
2. Add traceable telemetry around new flows.

### Tasks
- [ ] Replace silent catch in discovery build path with structured logging.
- [ ] Emit telemetry counters/events:
  - discovery tenant scan failures
  - discovery empty-result causes
  - checkout quote failures by reason
  - store access token failures
- [ ] Verify health/runtime checks include discovery/index drift status where applicable.

### Affected Areas
- `backend/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js`
- `backend/src/config/logger.js` consumers
- runtime audit surfaces (if extended)

### Exit Criteria
- [ ] Partial tenant failures are visible in logs/metrics with request correlation.

---

## Phase P5 - Coverage Closure and Release Readiness

### Objectives
1. Raise confidence from current ~5/10 coverage to release-grade.
2. Prove cross-surface behavior remains correct.

### Tasks
- [ ] Backend tests:
  - discovery routes (query validation, pagination, slug lookup, limiter behavior)
  - token leakage regression test
  - store access token auth tests
  - index sync and fallback behavior tests
- [ ] Frontend tests:
  - discovery mode switches (list/grid/map)
  - guest quote/checkout error states
  - tracking state rendering
- [ ] Cross-surface regression checks:
  - guest checkout -> POS incoming queue visibility
  - tracking contract returns `200 + status payload`

### Required Gates
- [ ] `npm run check:architecture`
- [ ] `npm run lint:docs`
- [ ] `npm --prefix backend run doctor:runtime`
- [ ] `npm --prefix backend run audit:indexes`
- [ ] `npm --prefix backend run lint`
- [ ] `npm --prefix frontend run lint`
- [ ] `npm --prefix backend test`
- [ ] `npm --prefix frontend test -- --run`
- [ ] `npm run build:store`

### Exit Criteria
- [ ] All gates pass.
- [ ] Stage checklist evidence updated.
- [ ] Manual UAT flow validated from guest discovery to cashier queue.

## 5) Rollback Strategy Per Phase

### P1 rollback
- Revert new discovery token/middleware contracts and limiter binding.
- Restore previous discovery payload contract only in non-production branches if needed.

### P2 rollback
- Disable index-backed read path via feature flag.
- Re-enable temporary fallback fan-out path with explicit warning logs.

### P3 rollback
- Revert store app UI changes to last stable tag while preserving backend contract changes.

### P4/P5 rollback
- Revert telemetry/test-only commits independently without touching contract-critical code.

## 6) Quality Targets (Post-Remediation)

1. Security: >= 8.5/10
2. Scalability: >= 8/10
3. Correctness: >= 8.5/10
4. Coverage confidence: >= 8/10
5. User readiness: >= 8.5/10
6. Production readiness: >= 8/10
