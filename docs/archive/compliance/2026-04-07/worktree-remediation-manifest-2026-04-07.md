---
status: historical
owner: compliance
last_reviewed: 2026-04-07
topic: worktree_remediation_manifest
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Worktree Remediation Manifest (2026-04-07)

## Historical Record Note
This manifest documents the branch-splitting strategy used during the April 7, 2026 remediation.
It is retained as evidence only and is not the current branch operation guide.

Final outcome:
1. Compliance fixes merged to `master` at `2c3a8a23c713abef01055899a1d4e2c72f4aec93`
2. CI passed for merged head (`24062846216`)

## Purpose
Freeze lane classification used to split a mixed dirty worktree into compliance delivery and parked parallel work.

## Safety Snapshot
- Full dirty-state snapshot branch: `backup/all-dirty-2026-04-07`
- Snapshot commit: `546ff6a`

## Lane A (Compliance Core)
- `backend/src/modules/compliance/**`
- `backend/src/routes/compliance.js`
- `backend/src/controllers/complianceController.js`
- `backend/src/middleware/compliancePolicy.js`
- `backend/src/validators/complianceValidator.js`
- `backend/migrations/20260406000001-add-tenant-compliance-program.cjs`
- `backend/migrations/20260407000002-compliance-hardening-phase1-2.cjs`
- `backend/src/models/Landlord/TenantCompliance*.js`
- `frontend/src/features/compliance/**`
- `frontend/src/services/complianceService.js`
- `scripts/check-compliance-impact.js`

## Lane B (Required Integration + Support)
- Tenant lifecycle, settings, POS, payments, and admin integration files required to enforce dual-mode behavior.
- Compliance-adjacent frontend wiring (`frontend/Pages/Settings.jsx`, `frontend/Pages/admin/TenantManager.jsx`, POS terminal/receipt components, admin service wiring).
- Compliance compatibility tests and policy tests.
- Compliance governance docs tied to accepted ADR scope:
  - `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
  - `docs/compliance/**`
  - `docs/api/specification.md`
  - `docs/database/schema.md`
  - root compliance guide markdown.

## Lane C (Parallel/Unrelated Parked Work)
- Branch: `wip/parallel-changes`
- Parked commit: `45173ff`
- Includes non-compliance testing-history doc churn and storefront/image utility work.

## Notes
- `feat/compliance-clean` is restricted to Lane A + Lane B.
- Lane C is intentionally excluded from compliance PR scope.
