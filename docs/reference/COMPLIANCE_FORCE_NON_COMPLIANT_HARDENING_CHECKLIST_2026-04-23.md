---
status: reference
authority_level: reference
owner: platform
last_reviewed: 2026-04-23
applies_to: admin_tenant_compliance_controls
topic: force_non_compliant_hardening_checklist
---

# Force Non-Compliant Hardening Checklist (2026-04-23)

## Scope
Prevent repeat `POST /api/v1/admin/tenants/:id/force-non-compliant` operator failures caused by UI/runtime state drift.

## Authoritative Inputs
1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/architecture/adr/0011-compliance-downgrade-escape-hatches.md`

## Phase 1: Server-Driven Eligibility (Priority 0)
- [x] Backend `GET /admin/tenants` returns:
  - `can_force_non_compliant`
  - `force_non_compliant_block_reason`
- [x] Frontend Force button is driven by backend eligibility fields first.
- [x] Frontend fallback remains for older API payloads.

Acceptance:
1. UI does not issue force request when backend says blocked.
2. UI helper text matches backend-provided reason.

## Phase 2: Contract Tests (Priority 0)
- [x] Add backend usecase test covering state matrix:
  - `null`
  - `non_compliant_active`
  - `compliant_pending`
  - `compliant_active`
- [x] Add frontend integration test to assert backend `can_force_non_compliant=false` blocks action even when mode appears compliant.

Acceptance:
1. Regression fails in CI if FE and BE diverge on eligibility logic.

## Phase 3: Ops & Deploy Hardening (Priority 1)
- [ ] Add deploy parity gate to verify latest frontend asset manifest/chunk hash is being served.
- [ ] Add structured metric/log for force endpoint:
  - `tenant_id`, `compliance_mode_state`, `status_code`, `error_code`
- [ ] Add alert threshold for repeated `422` on force endpoint.

Acceptance:
1. Stale frontend bundle serving is detected during deploy.
2. Repeated force failures trigger actionable alerting.

## Phase 4: Data Invariant Hygiene (Priority 1)
- [ ] Add scheduled audit report for ambiguous compliance lifecycle (`NULL` mode state for active tenants).
- [ ] Define remediation runbook for converting ambiguous state to explicit lifecycle.

Acceptance:
1. Ambiguous lifecycle combinations are visible and trendable.
2. Operators have deterministic remediation steps.

