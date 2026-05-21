---
status: reference
owner: engineering
last_reviewed: 2026-04-14
declaration_id: 2026-04-14-pos-asset-url-and-upload-validation
classification: major
surfaces: pos,terminal,skupervisor,store
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm run check:architecture,npm --prefix backend test -- backend/tests/posHandlers.transport.test.js,npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js,manual host-level /uploads render checks on 5000/5173/5174/5175
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
1. Change touches POS catalog image upload validation and image rendering across IMS/POS/storefront surfaces.
2. Compliance lifecycle and fiscal receipt contracts remain unchanged.

## Affected Surfaces
- POS catalog image upload validation (backend use-case guard).
- POS/IMS/Storefront image rendering for POS catalog overrides and item images.

## Compliance Preconditions
1. Compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) remains unchanged.
2. POS checkout and receipt contracts remain unchanged.
3. Validation only blocks unsupported image files; valid images continue to upload.

## Verification Evidence
1. `npm run check:architecture`
2. `npm --prefix backend test -- backend/tests/posHandlers.transport.test.js`
3. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
4. Manual verification: uploaded POS image returns `200 image/*` on backend and local IMS/POS/Store hosts (`5000`, `5173`, `5174`, `5175`).
