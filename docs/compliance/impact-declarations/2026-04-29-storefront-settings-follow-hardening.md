---
declaration_id: 2026-04-29-storefront-settings-follow-hardening
classification: major
surfaces: settings
reason_codes_impacted: STOREFRONT_CONTENT_CONFIGURATION
policy_version: 2026.04.07
verification_evidence: npm run check:architecture,npm --prefix backend test -- tests/storeUsecases.applicationResult.test.js tests/storeHandlers.transport.test.js tests/storeValidator.follow.test.js,npm --prefix frontend run build:store
rollback_note: Revert storefront settings/follow commits and redeploy previous stable master.
preflight_result: no_breach
preflight_reason_code: NO_COMPLIANCE_BREACH_DETECTED
preflight_run_at: 2026-04-29T10:30:00+08:00
preflight_request_ref: STORE-V2-HARDENING-2026-04-29
---

## Compliance Impact Classification
This change is `major` because it updates compliance-sensitive settings UI/configuration paths while keeping behavior additive and backward-compatible.

## Affected Surfaces
- settings

## Compliance Preconditions
- Existing permissions and policy enforcement remain unchanged.
- No payment, tax, or compliance decision logic is altered.
- Storefront follow hardening and additional settings keys are additive only.

## Verification Evidence
- `npm run check:architecture`
- `npm --prefix backend test -- tests/storeUsecases.applicationResult.test.js tests/storeHandlers.transport.test.js tests/storeValidator.follow.test.js`
- `npm --prefix frontend run build:store`
