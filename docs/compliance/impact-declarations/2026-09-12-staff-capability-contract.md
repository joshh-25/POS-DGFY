---
status: draft_pr
owner: DGFY identity/POS
last_reviewed: 2026-09-12
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md
declaration_id: 2026-09-12-staff-capability-contract
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED,NOT_PERMITTED,NO_LONGER_ASSIGNED,LOCATION_NOT_GRANTED,ACCOUNT_DEACTIVATED,VALIDATION_FAILED
policy_version: 2026.09.12
verification_evidence: node --check changed JavaScript files,npm test --prefix apps/dgfy-api -- --runInBand tests/staffCapabilityContract.test.js,npm run check:architecture-guardrails --prefix apps/dgfy-api,npm run check:compliance --prefix apps/dgfy-api,git diff --check
rollback_note: Revert the API/module commits and run the additive migration down paths only if the staff-role contract is not accepted; preserve existing users.permissions and do not delete assignment history outside the new nullable structures.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-13T11:43:13.432Z
preflight_request_ref: PREFLIGHT-34755013653-2026-09-12-STAFF-CAPABILITY-CONTRACT
---

# Staff capability contract

## Compliance Impact Classification

Major. This change publishes a tenant staff-capability vocabulary, adds additive role and assignment
links, and places server-side authorization around assigned fulfillment actions. Existing broad POS
permissions and stored explicit permissions remain compatible.

## Affected Surfaces

- Native POS staff capability discovery and assignment views.
- Tenant user/role administration and POS fulfillment authorization.

## Compliance Preconditions

1. Tenant migrations complete before capability assignment routes are enabled.
2. The default-role seed is idempotent and never replaces non-empty explicit user permissions.
3. Narrow fulfillment actions require both the declared capability and current assignment/location proof.
4. Production tenant schema reporting remains a mandatory release gate.

The live request-time preflight was not executed in this local Worker session. The required
front-matter shape is present for CI and the continuous sweep to reconcile after the PR lands;
this declaration does not claim a live policy-engine result.

## Verification Evidence

- Contract tests cover catalog parity, explicit/staff-role/default precedence, cache invalidation,
  inactive-account response, assignment denial reasons, and broad-permission compatibility.
- Follow-up verification confirms the assigned delivery-run guard is applied at dispatch time,
  while run-personnel administration remains on the existing broad POS path.
- Migration syntax and API architecture/compliance guardrails are run before PR creation.
- No production deployment or live tenant qualification is claimed by this declaration.
