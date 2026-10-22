---
status: draft_pr
owner: engineering
last_reviewed: 2026-10-22
related_adr: none
declaration_id: 2026-10-22-effective-permission-rbac
classification: regulatory
surfaces: pos,terminal,settings,inventory,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,UNAUTHORIZED
policy_version: 2026.10.22
verification_evidence: check-architecture-guardrails,check-controller-boundaries,check-tenant-schema-coverage-staged,focused-pos-vitest-102-tests,pos-production-build,git-diff-cached-check
rollback_note: Revert the effective-permission dependency helpers, API authorization changes, migration, and related tests together with this declaration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T22:00:00+08:00
preflight_request_ref: NOT-EXECUTED-20261022-EFFECTIVE-RBAC
---

# Effective Permission Dependencies and RBAC Enforcement

## Compliance Impact Classification

Regulatory. The change strengthens server-side authorization and permission dependency
enforcement across tenant users, POS operations, inventory/catalog actions, and assisted
provisioning. It does not bypass compliance policy checks or grant permissions outside the
authenticated tenant and operating scope.

## Affected Surfaces

- POS terminal, cashier attendance, operator authority, and transaction authorization.
- POS terminal navigation, button visibility, cashier lock/unlock, and shift-resume flows.
- Tenant user management, role permissions, and effective-capability projection.
- Inventory/catalog actions whose access depends on view and management permissions.
- Tenant provisioning and compliance-sensitive authorization boundaries.

## Compliance Preconditions

1. The API remains the final authority for authentication, authorization, tenant scope, location
   scope, and POS operator authority; frontend capability projections are advisory only.
2. Dependent permissions are effective only when their required parent/view capability is active;
   disabling a parent capability must not leave an actionable child permission active.
3. Master administrators retain the existing explicit bypass behavior, while ordinary users remain
   constrained by their assigned permissions and operating scope.
4. The permission-mode migration is additive and must be applied through the migration runner; no
   existing user or tenant records are deleted.
5. This branch uses the required PR-stage `NOT-EXECUTED-*` preflight reference. No live production
   preflight is claimed here; the promotion-time compliance sweep must reconcile it before staging
   or main.

## Verification Evidence

- API architecture guardrails passed.
- API controller-boundary checks passed.
- Tenant-schema migration coverage passed for the staged migration set.
- `git diff --cached --check` passed before commit.
- Focused POS Vitest coverage passed: 4 files, 102 tests.
- `npm run build` passed in `apps/dgfy-pos`; only existing Vite chunk-placement warnings were emitted.
