---
status: reference
owner: engineering
last_reviewed: 2026-07-10
declaration_id: 2026-07-10-pos-iphone-pwa-accessibility
classification: major
surfaces: pos,terminal,pwa
reason_codes_impacted: ALLOWED
policy_version: 2026.07.10
verification_evidence: POS production build,iPhone viewport Playwright suite,docs lint
rollback_note: Revert the mobile-only input typography rule and remove the dedicated iPhone QA suite.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-10T21:20:00+08:00
preflight_request_ref: POS-IPHONE-PWA-2026-07-10
---

# POS iPhone PWA Accessibility

## Compliance Impact Classification

Major. This change adjusts mobile input typography and text-size behavior on a compliance-sensitive POS terminal surface. It does not change POS transaction data, checkout rules, fiscal records, or server contracts.

## Affected Surfaces

- POS terminal login drawer and mobile input typography.
- iPhone PWA responsive QA coverage.

## Compliance Preconditions

- User-controlled pinch zoom remains available.
- The `16px` input rule is restricted to phone-width POS surfaces to prevent iOS focus zoom.
- Desktop and tablet behavior remains outside the mobile media query.

## Verification Evidence

- `npm --prefix frontend run build:pos`
- `npm --prefix frontend exec playwright test tests/e2e/pwa-iphone-responsive/pos-pwa-iphone.spec.js`
- `npm run lint:docs`
