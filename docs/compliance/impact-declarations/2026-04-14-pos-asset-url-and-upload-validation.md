---
status: reference
owner: engineering
last_reviewed: 2026-04-14
declaration_id: 2026-04-14-pos-asset-url-and-upload-validation
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm --prefix backend run check:architecture-guardrails,npm --prefix backend run check:controller-boundaries,npm run check:compliance
rollback_note: Revert POS catalog image validation and asset URL normalization changes together to keep POS image handling consistent across IMS/POS/storefront.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-14T20:10:00+08:00
preflight_request_ref: POS-ASSET-URL-VALIDATION-2026-04-14
---

# 2026-04-14 POS Asset URL + Upload Validation

## Compliance Impact Classification
Major

Computed classification rationale:
1. Change touches POS catalog image upload validation and terminal-facing POS catalog rendering.
2. Compliance lifecycle and fiscal receipt contracts remain unchanged.

## Affected Surfaces
- POS catalog image upload validation (backend use-case guard).
- POS/IMS/Storefront image rendering for POS catalog overrides and item images.

## Compliance Preconditions
1. Compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) remains unchanged.
2. POS checkout and receipt contracts remain unchanged.
3. Validation only blocks unsupported image files; valid images continue to upload.

## Verification Evidence
1. `npm --prefix backend run check:architecture-guardrails`
2. `npm --prefix backend run check:controller-boundaries`
3. `npm run check:compliance`
