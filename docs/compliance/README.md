---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-05-18
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

Change declaration workflow:
- `docs/compliance/impact-declarations/`
- `scripts/check-compliance-impact.js` computes the minimum classification from the changed sensitive surfaces.
- `major` and `regulatory` declarations must include strict preflight metadata and `preflight_result=no_breach`.
- `scripts/check-compliance-api-contracts.js` runs with `npm run check:compliance` and blocks contract drift against `docs/api/specification.md`.

Historical remediation packets from April 2026 were moved to:
- `docs/archive/compliance/2026-04-07/`
