---
status: draft_pr
owner: engineering
last_reviewed: 2026-10-05
declaration_id: 2026-10-05-platform-admin-app-extraction
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.05
verification_evidence: npm run compliance:reconcile-local -- 2026-10-05-platform-admin-app-extraction.md (no_breach; PREFLIGHT-LOCAL-1791207633150-2026-10-05-PLATFORM-ADMIN-APP-EXTRACTION),node --check scripts/check-compliance-impact.js,COMPLIANCE_CHANGED_FILES targeted npm run check:compliance (PASS; 2 sensitive Admin paths)
rollback_note: Revert the Platform Admin extraction and restore the Admin service and TenantManager to their former locations, then remove the new path rules and this declaration. No database schema or migration change is part of this extraction.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-05T13:41:51.054Z
preflight_request_ref: PREFLIGHT-LOCAL-1791207633150-2026-10-05-PLATFORM-ADMIN-APP-EXTRACTION
---

# Platform Admin App Extraction (#350)

## Compliance Impact Classification

Regulatory because the compliance path rules assign that floor to the Platform
Admin service and tenant-management UI. This extraction moves those files from
the shared trunk and IMS into `apps/dgfy-admin`; the path move must not remove
them from compliance review. The classification is the mechanical path floor,
not a claim that this change adds regulatory decision behavior.

## Affected Surfaces

- `settings` and `compliance` — the Platform Admin service moves to
  `apps/dgfy-admin/src/services/adminService.js`.
- `settings` and `compliance` — tenant administration moves to
  `apps/dgfy-admin/Pages/TenantManager.jsx`.

The app extraction and isolated Admin session namespace preserve the existing
Platform Admin operations and API authorization contract. No fiscal
calculation, payment decision, compliance policy engine, tenant schema, or
migration behavior is changed by moving these frontend files.

## Compliance Preconditions

- Existing API authorization remains authoritative; access to the new frontend
  route does not grant permission to call protected operations.
- Admin session cookies remain host-only and use the isolated `admin_*`
  namespace described by ADR 0089; no cross-host cookie scope is introduced.
- The local ephemeral request-time preflight returned `no_breach` and is
  recorded as `PREFLIGHT-LOCAL-1791207633150-2026-10-05-PLATFORM-ADMIN-APP-EXTRACTION`.

## Verification Evidence

- `node --check scripts/check-compliance-impact.js` — passed.
- `npm run compliance:reconcile-local -- 2026-10-05-platform-admin-app-extraction.md` —
  passed with `no_breach`; request reference
  `PREFLIGHT-LOCAL-1791207633150-2026-10-05-PLATFORM-ADMIN-APP-EXTRACTION`.
- `node --check scripts/check-compliance-impact.js` — passed.
- `COMPLIANCE_CHANGED_FILES`-targeted `npm run check:compliance` — passed and
  confirmed both moved Admin paths were counted as sensitive.
- The declaration's regulatory floor is derived from the two changed Admin
  paths in `scripts/check-compliance-impact.js` and
  `docs/compliance/compliance-classification-matrix.md`.
