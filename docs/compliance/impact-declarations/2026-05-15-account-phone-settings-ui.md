---
status: reference
owner: engineering
last_reviewed: 2026-05-15
related_adr: none
declaration_id: 2026-05-15-account-phone-settings-ui
classification: major
surfaces: settings,user_registration
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.05.15
verification_evidence: npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx,npm --prefix frontend run build,npm run check:compliance,npm run lint:docs,git diff --check
rollback_note: Revert frontend phone validation utility usage, Settings profile phone enforcement, and User Management phone visibility while leaving nullable backend phone fields in place.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-15T01:23:00+08:00
preflight_request_ref: ACCOUNT-PHONE-SETTINGS-UI-2026-05-15
---

# Account Phone Settings UI Requirement

## Compliance Impact Classification

Major.

This declaration covers frontend Settings and registration UI changes for account phone collection and correction. It does not alter compliance lifecycle state, POS receipt issuance, tax calculation, payment authorization, or tenant compliance activation gates.

## Affected Surfaces

- Public user registration and invitation acceptance phone validation.
- Public company registration founder/admin phone validation.
- Settings > Profile inline phone validation.
- Settings > Company > Manage Users phone display and missing-phone marker.

## Compliance Preconditions

1. The frontend validation must match backend-supported phone format closely enough to prevent avoidable `422` responses.
2. Existing users must have a visible Settings path to add or correct phone numbers.
3. Settings profile saves must not intentionally clear a required account phone number.
4. Admin missing-phone visibility must apply to accepted users, not pending invitation rows.

## Verification Evidence

- `npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx`
- `npm --prefix frontend run build`
- `npm run check:compliance`
- `npm run lint:docs`
- `git diff --check`
