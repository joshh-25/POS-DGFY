---
status: reference
authority_level: reference
owner: expansion_program
last_reviewed: 2026-03-31
applies_to: storefront_discovery_and_guest_checkout
topic: phased_remediation_execution_plan
---

# Storefront Discovery Phased Remediation Execution Plan (2026-03-31)

> Note (2026-03-31): This file is retained for historical traceability.
> Active findings/ratings/remediation baseline now lives in:
> `docs/reference/SKU_EXPANSION_FINDINGS_PHASED_PLAN_2026-03-31.md`
> and `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`.

## 1. Authoritative Basis Used

1. `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
4. `docs/architecture/adr/0001-modular-monolith-boundaries.md`
5. `docs/architecture/adr/0002-error-contract-unification.md`
6. `docs/architecture/adr/0006-skupervisor-expansion-program-boundaries.md`

## 2. Current Quality Ratings (Evidence-Based)

| Area | Rating (1-10) | Evidence Snapshot |
|---|---:|---|
| Security (discovery/public store) | 8.5 | `company_token` removed from discovery payload + `x-store-slug` resolution + limiter active |
| Scalability (discovery hot path) | 6.5 | Discovery and slug resolver still do runtime tenant fan-out reads (`storefrontDiscoveryRepository.js`, `storefrontTenantResolver.js`) |
| Correctness (contracts/runtime) | 8.0 | Gates pass; no runtime/index health issues; however topology still transitional |
| Test coverage confidence | 6.5 | Added repository test, but no full route+integration coverage for index/sync path (not yet built) |
| UX resilience (guest flow) | 8.0 | Quote/checkout error states added in `frontend/apps/store/src/main.jsx` |
| User readiness | 7.8 | Usable now, but scale posture still incomplete until landlord index model is in place |

## 3. Findings, Root Causes, and Affected Areas

### F1 (Highest) Discovery/slug resolution still fan out across tenant DBs
- Evidence:
  - `backend/src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js`
  - `backend/src/services/storefrontTenantResolver.js`
- Root cause:
  - Read model not yet materialized in landlord DB; discovery and resolver each compute from tenant sources at runtime.
- Affected areas:
  - Public discovery latency and connection pressure
  - Store route tenant resolution (`x-store-slug`)
  - Potential duplicated work during cache expiry

### F2 Missing landlord index data contract and sync lifecycle
- Evidence:
  - No `storefront_discovery_index` migration/model in `backend/migrations` and landlord models.
- Root cause:
  - Stage 3 hardening not yet completed beyond interim fan-out approach.
- Affected areas:
  - Scale readiness
  - Drift management and operational diagnostics

### F3 Documentation consistency drift
- Evidence:
  - `docs/api/specification.md` still includes a `company_token` response example in admin section (`GET /admin/tenants`) while storefront section moved to slug-based public tenant context.
- Root cause:
  - Mixed token references across domains (admin/internal vs storefront/public) can be misread.
- Affected areas:
  - Integration onboarding
  - QA test interpretation

### F4 Coverage gap for final Stage 3 shape
- Evidence:
  - Current tests cover repository token leakage regression but not final index-backed discovery/sync lifecycle.
- Root cause:
  - Index-backed architecture not yet implemented, so target-path tests are absent.
- Affected areas:
  - Regression confidence after topology shift

## 4. Phased Remediation Plan (Execution Order)

## Phase A - P0 Evidence Freeze and Governance Lock
- [ ] Capture baseline outputs with timestamp:
  - `npm run check:architecture`
  - `npm run lint:docs`
  - `npm --prefix backend run doctor:runtime`
  - `npm --prefix backend run audit:indexes`
- [ ] Link this plan in `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`.
- [ ] Confirm ADR scope:
  - add ADR 0006 addendum if landlord index/sync semantics materially alter cross-surface data topology.

Exit gate:
- [ ] All four checks pass and are logged.

## Phase B - Landlord Discovery Index Foundation (Fix F1/F2)
- [ ] Add migration for landlord read model table (example: `storefront_discovery_index`) with:
  - unique `slug`
  - `tenant_id`, `tenant_name`, storefront visibility/open flags
  - location and support capability columns
  - catalog count snapshot + last sync timestamps
  - indexes for hot filters/sorts (`slug`, `storefront_open`, `tenant_name`, geo fields as supported)
- [ ] Add landlord model under landlord model boundary.
- [ ] Add repository method(s) to read discovery from index only.
- [ ] Keep temporary fallback fan-out behind explicit feature flag with removal target.

Exit gate:
- [ ] `/api/v1/storefront/discovery` hot path no longer scans tenants per request.

## Phase C - Index Sync and Drift Controls (Fix F1/F2/F4)
- [ ] Add sync service to upsert index per tenant.
- [ ] Trigger sync from:
  - storefront settings updates
  - tenant location create/update/deactivate/reactivate
  - relevant catalog visibility changes
- [ ] Add periodic reconciliation job for drift repair.
- [ ] Add structured logs/metrics for sync failures and stale rows.

Exit gate:
- [ ] Index stays accurate under mutation workflows and reconciliation run.

## Phase D - Public Tenant Resolution Refactor to Index (Fix F1)
- [ ] Refactor `storefrontTenantResolver` to read slug -> tenant context from landlord index (not tenant fan-out).
- [ ] Keep tenant token internal only; do not expose in discovery payload.
- [ ] Add guardrails for slug not visible / inactive store.

Exit gate:
- [ ] `x-store-slug` resolution uses index-backed lookup and remains backward-compatible for store routes.

## Phase E - Test, Docs, and Readiness Closure (Fix F3/F4)
- [ ] Backend tests:
  - index repository unit tests
  - sync trigger tests
  - discovery route integration tests (pagination/filter/ranking)
  - slug resolution integration tests via store routes
- [ ] Docs:
  - clarify admin/internal `company_token` usage vs public storefront `x-store-slug` usage
  - update runbook and checklist evidence
- [ ] Final gate run:
  - `npm run check:architecture`
  - `npm run lint:docs`
  - `npm --prefix backend run doctor:runtime`
  - `npm --prefix backend run audit:indexes`
  - `npm --prefix backend run lint`
  - `npm --prefix frontend run build:store`
  - targeted + full test suites

Exit gate:
- [ ] Stage 3 marked complete with evidence links and rollback notes.

## 5. File Ownership Map (to avoid missed areas)

- Discovery read path:
  - `backend/src/modules/storefrontDiscovery/**`
  - `backend/src/routes/storefrontDiscovery.js`
- Public tenant resolution:
  - `backend/src/middleware/tenantHandler.js`
  - `backend/src/services/storefrontTenantResolver.js`
- Landlord data model/migrations:
  - `backend/migrations/*`
  - `backend/src/models/Landlord/*`
- Store public contracts:
  - `backend/src/routes/store.js`
  - `backend/src/middleware/requireTenantContext.js`
- Storefront app:
  - `frontend/apps/store/src/main.jsx`
- Docs/readiness:
  - `docs/api/specification.md`
  - `docs/reference/SKU_EXPANSION_PHASE_CHECKLIST.md`
  - `docs/testing/sku-expansion-manual-test-runbook-2026-03-31.md`

## 6. Rollback Strategy

- Phase B/D changes:
  - feature-flag rollback to previous discovery + slug resolver path (temporary only)
- Phase C changes:
  - disable scheduler/reconciliation while keeping read path intact
- Any rollback must preserve:
  - no public `company_token` in discovery payload
  - discovery limiter still active
