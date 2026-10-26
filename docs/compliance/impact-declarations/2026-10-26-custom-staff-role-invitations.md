---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-26
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md
declaration_id: 2026-10-26-custom-staff-role-invitations
classification: major
surfaces: pos,settings
reason_codes_impacted: ALLOWED,AUDIT_ADMIN_ROLE_REQUIRED,PERMISSION_DENIED,VALIDATION_FAILED,AUTHORIZATION_FAILED,CONFLICT
policy_version: 2026.10.25
verification_evidence: Pending implementation checks; see Phase 554 in docs/features/IMPLEMENTATION_PHASE_LEDGER.md
rollback_note: Revert the custom staff-role invitation path, cancellation synchronization, UI, tests, ADR amendments, and migration together. If the landlord migration has already run, preserve invitation rows and restore the added nullable metadata columns only through an explicitly approved migration rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-25T16:51:32Z
preflight_request_ref: NOT-EXECUTED-2812-CUSTOM-STAFF-ROLE-INVITATIONS
---

# Custom Staff-Role Invitations (#2812, Phase 554)

## Compliance Impact Classification

Major. The changed staff-role authorization and user-list paths compute a major
classification floor for POS and settings under `scripts/check-compliance-impact.js`.
The implementation adds tenant-scoped invitation assignment and cancellation behavior
while retaining the existing owner/admin authority and active-location grant checks.

## Affected Surfaces

- POS authorization resolves invited users through the existing tenant staff-role
  capability source and assigned active locations.
- Settings administration exposes custom-role invitation and pending-invitation
  cancellation through OPIS Team & Access.

## Compliance Preconditions

- Tenant `users.staff_role_id`, active staff-role capabilities, and active location grants
  remain authoritative. Landlord invitation metadata is descriptive lifecycle data only.
- Only a tenant owner or legacy admin can send a custom-role invitation; the existing
  `users:manage` invitation gate remains in force.
- Acceptance revalidates the DGFY account membership, tenant invitation state, active role,
  and active location grants before activation. Deactivation cancels pending invitations
  before attempting landlord synchronization; retry failures are reported and logged.
- The live `POST /api/v1/compliance/preflight` endpoint was not run in this Worker session.
  The `no_breach`, `ALLOWED`, and `preflight_run_at` front-matter values are shape-only
  placeholders; `NOT-EXECUTED-2812-CUSTOM-STAFF-ROLE-INVITATIONS` is the outstanding
  reference for the normal develop-branch sweep. This is not evidence of a policy-engine
  result or a deployed check.
- No live tenant or deployed environment was changed or verified.

## Verification Evidence

Implementation validation is underway. Final focused test, build, architecture, schema,
documentation, compliance, app-version, and rendered-UI results will be recorded here and
in Phase 554 before the migration checkpoint is presented for review.
