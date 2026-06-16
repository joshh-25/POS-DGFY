---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-06-16
applies_to: compliance_docs_navigation
topic: compliance_docs_index
---

# Compliance Docs Index

Core compliance documentation:
- `docs/compliance/ph-pos-software-developer-compliance-guide.md` (authoritative)
- `docs/compliance/control-matrix.md`
- `docs/compliance/request-time-preflight-protocol.md`
- `docs/compliance/compliance-classification-matrix.md`
- `docs/compliance/compliance-ops-regulatory-verification.md`
- `docs/compliance/DGFY Compliance Certification Checklist.md`

Evidence and submission packet:
- `docs/compliance/evidence/open-controls-matrix.md`
- `docs/compliance/evidence/residual-risk-closure-matrix.md`
- `docs/compliance/evidence/rbac-sensitive-action-matrix.md`
- `docs/compliance/evidence/drills/`
- `docs/compliance/submission/`

Final Review self-serve:
- Tenant documentary requirements are completed in Settings > Compliance > Final review (upload or external URL).
- Backend stores tenant documentary records and sign-off metadata; submission docs remain internal reference artifacts.

Current compliance lifecycle operations:
- Platform Admin compliance mode switching is source-current in `docs/features/TENANT_MANAGEMENT.md` and `docs/api/specification.md`.
- `admin_compliance_mode_action` tells Tenant Manager whether the next action is legacy mode selection, upgrade to `compliant_pending`, force non-compliant, or no action.
- Platform Admin can move a tenant toward compliance only to `compliant_pending`; `compliant_active` remains gated by the existing fiscal checklist.
- All platform-admin lifecycle actions require a reason and primary compliance audit persistence. The governing impact declaration is `docs/compliance/impact-declarations/2026-06-15-platform-admin-compliance-mode-switch.md`.
- Tenant schema sync residual risk for old/test-like active schemas is tracked separately in `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`; do not treat that ops debt as part of the compliance-mode UI switch.

Change declaration workflow:
- `docs/compliance/impact-declarations/`
- `scripts/check-compliance-impact.js` computes the minimum classification from the changed sensitive surfaces.
- `major` and `regulatory` declarations must include strict preflight metadata and `preflight_result=no_breach`.
- `scripts/check-compliance-api-contracts.js` runs with `npm run check:compliance` and blocks contract drift against `docs/api/specification.md`.

Historical remediation packets from April 2026 were moved to:
- `docs/archive/compliance/2026-04-07/`
