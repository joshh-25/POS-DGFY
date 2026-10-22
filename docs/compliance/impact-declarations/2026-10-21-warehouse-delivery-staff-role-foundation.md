---
status: draft_pr
owner: DGFY identity/POS
last_reviewed: 2026-10-21
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md
declaration_id: 2026-10-21-warehouse-delivery-staff-role-foundation
classification: major
surfaces: pos,settings
reason_codes_impacted: ALLOWED,AUDIT_ADMIN_ROLE_REQUIRED,PERMISSION_DENIED
policy_version: 2026.10.21
verification_evidence: focused staff-role Jest suites,tenant schema registry Jest suite,API JavaScript syntax checks,OPIS and POS production builds,OPIS lint,npm run check:architecture,npm run lint:docs,npm run check:compliance,git diff --check
rollback_note: Revert the API authorization and OPIS role-management changes with the capability catalog and docs. Preserve staff_roles and audit history; restore cleared per-user permissions only through a reviewed administrative action using the audit snapshot.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T06:07:55.730Z
preflight_request_ref: PREFLIGHT-39731474926-2026-10-21-WAREHOUSE-DELIVERY-STAFF-ROLE-FOUNDATION
---

# Warehouse and Delivery staff-role foundation (#1182, Phase 524)

## Compliance Impact Classification

Major. The changed API capability catalog and tenant staff-role authorization
affect POS fulfillment access and tenant settings administration. The change
registers separate narrow capability slugs but does not grant them access to
loading, delivery-job mutation, or payment routes in this phase. Assigning or
clearing a staff role intentionally clears the user's stored permission
overrides. Only the tenant owner or legacy Admin may write staff roles.

## Affected Surfaces

- POS fulfillment capability discovery and effective-permission resolution.
- Tenant role administration and branch-grant workflow in OPIS Team & Access.
- Tenant schema repair and runtime schema readiness for `staff_roles` and
  `users.staff_role_id`.

## Compliance Preconditions

1. API permission checks remain authoritative; role display names grant no
   authority and the new slugs remain distinct from `delivery_runs:act`.
2. The role assignment and permission-snapshot clearing commit atomically, with
   the previous snapshot retained in the audit row. Clearing a role leaves the
   permission array empty and resolves to the existing base-role defaults.
3. Role edits and deactivation evict every assigned user's auth cache entry
   after commit. Branch-grant changes retain their existing cache eviction.
4. The tenant schema report must confirm the additive staff-role table and user
   reference before rollout. This PR adds no migration under the migration runner.
5. No checkout, fiscal, balance-collection, custody, or remittance route is
   changed in this phase.

The live request-time preflight was **not executed** in this Worker session.
The front-matter `no_breach` value is the repository's accepted PR-time
placeholder shape, not a claim of a policy-engine result. The continuous
develop sweep must reconcile `NOT-EXECUTED-1182-STAFF-ROLE-FOUNDATION` before
promotion.

## Verification Evidence

- Focused API tests cover assignment clearing, audit snapshot, cache eviction,
  admin/owner write gates, cashier-base fallback, and capability parity.
- Tenant schema registry and runtime audit tests cover the repair/readiness
  contract; API syntax, OPIS/POS builds, OPIS lint, architecture and docs
  checks are run before PR creation.
- No live tenant, deployed environment, or policy-engine preflight is claimed.
