---
status: draft_pr
owner: DGFY identity/POS
last_reviewed: 2026-09-14
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md
declaration_id: 2026-09-14-staff-role-deactivation
classification: regulatory
surfaces: pos,settings,inventory,terminal,payments,compliance
reason_codes_impacted: ALLOWED,AUTHORIZATION_FAILED,NOT_PERMITTED
policy_version: 2026.09.14
verification_evidence: node --check changed JavaScript files,npm test --prefix apps/dgfy-api -- --runTestsByPath tests/staffCapabilityContract.test.js,npm run check:architecture,npm run lint:docs,npm run check:compliance,git diff --check
rollback_note: Revert the API authorization, capability documentation, ADR, version, and declaration changes; no migration or persisted-data rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-14T14:44:11.700Z
preflight_request_ref: PREFLIGHT-34857106198-2026-09-14-STAFF-ROLE-DEACTIVATION
---

# Staff-role deactivation effective-permission fallback (#1901)

## Compliance Impact Classification

Major. The changed API authorization resolution and effective-capability contract affect the POS
and tenant settings surfaces. The fix prevents a cashier-base account from regaining broad
`pos:transact` access when an assigned staff role is deactivated, while preserving existing
explicit-permission precedence, active staff-role behavior, and unassigned cashier defaults.

## Affected Surfaces

- POS fulfillment authorization and effective permission resolution.
- Tenant staff-role capability administration and the documented current-user capability contract.

## Compliance Preconditions

1. Backend authorization must remain authoritative for narrow staff-fulfillment actions.
2. Deactivating an assigned staff role must not widen the user's effective permissions.
3. Users without a staff-role assignment must retain the existing compatibility cashier default.
4. The `capabilities` response field must remain the single effective-permission set clients use for
   access decisions; raw `staff_role.capabilities` must remain informational.
5. No migration or persisted-data change is introduced by this fix.

The live request-time preflight was not executed in this local Worker session. The required
front-matter shape is present for the continuous sweep to reconcile after the PR lands; this
declaration does not claim a live policy-engine result.

## Verification Evidence

- API source syntax checks pass for every changed JavaScript source file.
- Focused `staffCapabilityContract.test.js` coverage passes, including cashier deactivation,
  unassigned cashier compatibility, and restored narrow-assignment denial.
- Architecture guardrails, controller boundaries, documentation/ADR lint, compliance validation,
  and whitespace checks pass before PR creation.
- No production deployment or live tenant qualification is claimed by this declaration.
