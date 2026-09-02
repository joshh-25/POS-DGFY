---
status: reference
owner: engineering
last_reviewed: 2026-08-31
declaration_id: 2026-08-31-affiliate-slot-cap-admin-write-endpoint
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: none
policy_version: 2026.08.31
verification_evidence: node --check on all changed apps/dgfy-api and apps/dgfy-migration-runner files (syntax-only, no build step exists for this app),apps/dgfy-api/tests/tenantAffiliateSlotsAdminUseCase.unit.test.js (12 passed, new),apps/dgfy-api/tests/tenantAffiliateSlotsValidator.test.js (10 passed, new),apps/dgfy-api/tests/platformAdminRouteClassification.test.js (extended, 3 new rows, passed),apps/dgfy-api/tests/tenantAdminAuditLogActions.contract.test.js (extended, passed),apps/dgfy-api/tests/adminTenantCapabilityValidator.test.js (2 passed, unmodified, regression check),apps/dgfy-api/tests/adminTenantHandlers.transport.test.js (extended for the new use-case mocks, passed),apps/dgfy-api/tests/adminTenantCapabilities.transport.test.js (extended for the new handler mocks, passed),apps/dgfy-api/tests/dgfyAffiliateRepository.slotEnforcement.unit.test.js (unmodified, regression check, passed),apps/dgfy-api/tests/dgfyAffiliateReactivationUseCase.unit.test.js (unmodified, regression check, passed)
rollback_note: Revert the three new platform-admin endpoints under /api/v1/admin/tenants/:id/affiliate-slots (route, validator, handlers, controller-barrel entries, use cases, DI wiring), the one-line upsertSettings transaction-option addition, and the new tenant_admin_audit_logs.action enum value (model + migration). The migration's down() re-maps any `affiliate_slots_update` row to `capability_update` before shrinking the ENUM -- lossy by construction, matching the existing precedent's own down() behavior (20260615000001, 20260625000001). No schema change to tenant_affiliate_settings, no new table, no change to Phase 198's slot-cap enforcement semantics, no enrollment/invite row ever written by this phase.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.394Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-31-AFFILIATE-SLOT-CAP-ADMIN-WRITE-ENDPOINT
---

# Landlord-Admin Write Endpoint for `max_affiliate_slots`

## Compliance Impact Classification

`regulatory`, `settings,compliance` surfaces, per `scripts/check-compliance-impact.js`'s three
`adminTenants`/`adminTenantController`/`adminTenantHandlers` rules (floor `regulatory`,
`settings,compliance`) — not a judgment call, all three patterns match unavoidably:

- `^apps/dgfy-api/src/routes/adminTenants\.js$`
- `^apps/dgfy-api/src/controllers/adminTenantController\.js$`
- `^apps/dgfy-api/src/modules/tenants/controllers/adminTenantHandlers\.js$`

A new route file at a fresh, unclassified path was deliberately **not** used to route around this
declaration (see `PHASE_213_PLAN.md` §7.1) — the guardrail is asking "does a platform admin gain a
new authority over tenant configuration," and the honest answer here is yes: this phase gives a
platform admin the ability to raise or lower a tenant's paid affiliate-enrollment allocation.

## Affected Surfaces

1. **Three new backend endpoints**, mounted under `/api/v1/admin/tenants/:id/affiliate-slots`
   (`apps/dgfy-api/src/routes/adminTenants.js`,
   `apps/dgfy-api/src/controllers/adminTenantController.js`,
   `apps/dgfy-api/src/modules/tenants/controllers/adminTenantHandlers.js`,
   `apps/dgfy-api/src/modules/tenants/usecases/updateTenantAffiliateSlotsUseCase.js`,
   `apps/dgfy-api/src/modules/tenants/usecases/listTenantCapabilityAuditLogsUseCase.js`,
   `apps/dgfy-api/src/modules/tenants/index.js`, `apps/dgfy-api/src/validators/adminTenantValidator.js`):
   - `GET /:id/affiliate-slots` — `max_affiliate_slots`, `slots_used`, `program_enabled`, `over_cap`.
   - `GET /:id/affiliate-slots/audit-logs` — the audit trail for this action.
   - `PATCH /:id/affiliate-slots` — the only write path for `max_affiliate_slots`, requiring a
     `reason` (3–500 chars) and bounding the value to `1..100`.
2. **Authorization** — mounted under the existing `/^\/api\/v1\/admin\/tenants(?:\/|$)/`
   `resolvePlatformAdminRoutePolicy` row (`apps/dgfy-api/src/middleware/auth.js`), so the endpoint
   is reachable by any `admin.tenants` delegate, not master-only. This is Pat's E1 decision on
   #1190 (2026-08-31), matching how `capabilities` and `pos-metadata` are scoped — no new
   permission key was introduced.
3. **Audit trail** — one new `tenant_admin_audit_logs.action` enum value, `'affiliate_slots_update'`
   (`apps/dgfy-api/src/models/Landlord/TenantAdminAuditLog.js`,
   `apps/dgfy-migration-runner/migrations/20260831000001-extend-tenant-admin-audit-actions-affiliate-slots.cjs`).
   No new table, no new model, no new repository method beyond one additive
   `{ transaction }` option on the existing `upsertSettings`
   (`apps/dgfy-api/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`) and one new module
   export (`apps/dgfy-api/src/modules/dgfy/index.js`).

## Compliance Preconditions

1. **No checkout totals, discounts, taxes, payments, receipts, refunds, voids, or shift cash
   calculations are changed by this commit.** This is a landlord back-office admin write to a
   single integer column; it never runs on the checkout or POS terminal path.
2. **No POS terminal operation, fiscal document, or persisted transaction record is touched.**
3. **No merchant-facing surface gains write access to `max_affiliate_slots`.** The tenant-facing
   `PUT /affiliates/settings` allowlist in `buildUpdateAffiliateSettingsUseCase`
   (`apps/dgfy-api/src/modules/dgfy/usecases/dgfyAffiliateUseCases.js`) is unchanged and was not
   touched by this commit — pinned by a regression test
   (`tenantAffiliateSlotsAdminUseCase.unit.test.js`, "regression: buildUpdateAffiliateSettingsUseCase
   never writes max_affiliate_slots from the tenant-facing body").
4. **No existing enrollment or invite is read-modified-written by this phase, regardless of how the
   cap is changed.** Pat's E2 decision on #1190 (2026-08-31): lowering the cap below current
   consumption is allowed and never suspends, revokes, or otherwise mutates any existing enrollment
   or invite — those are grandfathered. `slots_used` at write time is recorded in both the audit
   row (`before_snapshot.slots_used`, `metadata.over_cap_after_write`) and the API response
   (`over_cap`) so an over-cap state is visible, not hidden.
5. **Authorization is the existing platform-admin plane** (`req.admin`, `authenticateAdmin` +
   `resolvePlatformAdminRoutePolicy`) — no new permission key was introduced, and the tenant-staff
   permission plane (`checkPermission(PERMISSIONS.AFFILIATES.*)`, `req.user`) is untouched and was
   never used for this endpoint (that plane would make it reachable by a merchant's own owner
   account, which is the outcome #1190 exists to prevent).
6. **The write is transactional and lock-ordered.** `acquireAffiliateSlotLock` (the #1187 RF-1 fix)
   is taken as the first statement of the transaction, before any read, and the settings write plus
   the audit-log insert commit or fail together in the same transaction — so a cap write can never
   interleave with a concurrent slot-consuming write's stale read, and can never land without its
   audit row.
7. **Landlord table only — no tenant-schema interaction.** `tenant_admin_audit_logs` lives in the
   landlord DB; this migration has no deploy-order dependency on
   `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`.

## Verification Evidence

1. `node --check` on every changed `apps/dgfy-api` and `apps/dgfy-migration-runner` file —
   syntax-only (this app has no real build step; its own `build` script is a literal no-op `echo`).
   All passed.
2. Frontend builds: **not applicable.** This phase is backend-only (A8) — no
   `packages/web-core`, `apps/dgfy-ims`, `apps/dgfy-pos`, or `apps/dgfy-storefront` file changed.
3. `apps/dgfy-api/tests/tenantAffiliateSlotsAdminUseCase.unit.test.js` (new) — covers: raising the
   cap and writing exactly one audit row; a missing/short `reason` producing `422` with no writes;
   an unknown tenant id producing `404` with no writes; the audit row's `before_snapshot.slots_used`
   matching `countConsumedSlots`; a no-op (same-value) write still auditing; lock-before-read
   ordering and shared-transaction propagation to the write and the audit insert (A5); the E2
   below-consumption-lowering case (succeeds, `over_cap: true`, no enrollment/invite mutation
   method exists on the mock so any such call would fail the test); and the §1.3 regression pin on
   `buildUpdateAffiliateSettingsUseCase`. GET-path coverage included.
4. `apps/dgfy-api/tests/tenantAffiliateSlotsValidator.test.js` (new) — bounds/required-field cases
   for `max_affiliate_slots` (0, -1, 1.5, 101, missing, string-that-converts) and `reason`
   (missing, 2 chars, 501 chars), plus an unknown-key rejection.
5. `apps/dgfy-api/tests/platformAdminRouteClassification.test.js` — extended with two rows
   asserting `/api/v1/admin/tenants/:id/affiliate-slots` and its `/audit-logs` sibling resolve to
   `{ permissions: ['admin.tenants'] }` — the checked-in expression of the E1 authorization
   decision.
6. `apps/dgfy-api/tests/tenantAdminAuditLogActions.contract.test.js` — extended to assert
   `'affiliate_slots_update'` appears in both the model and the new migration file.
7. `apps/dgfy-api/tests/adminTenantHandlers.transport.test.js` and
   `apps/dgfy-api/tests/adminTenantCapabilities.transport.test.js` — both pre-existing suites mock
   the full `modules/tenants/index.js` / `controllers/adminTenantController.js` module surface;
   extended with mock entries for the three new use cases/handlers so the router's static imports
   resolve under the mock (both passed).
8. `apps/dgfy-api/tests/adminTenantCapabilityValidator.test.js` (unmodified, regression check),
   `apps/dgfy-api/tests/dgfyAffiliateRepository.slotEnforcement.unit.test.js` (unmodified,
   regression check — Phase 198's slot-cap enforcement is untouched by this phase),
   `apps/dgfy-api/tests/dgfyAffiliateReactivationUseCase.unit.test.js` (unmodified, regression
   check) — all passed.
9. **What this phase cannot verify itself, stated rather than skipped:** the migration is not
   executed against a live MySQL instance (no reachable DB with working credentials in this
   sandbox, same limitation Phase 198's and Phase 207's PRs recorded); no live end-to-end
   authorization check confirms an `admin.tenants` delegate actually reaches the endpoint on a
   running server (asserted only against the resolver function via
   `platformAdminRouteClassification.test.js`); the production over-cap census (#447's own
   precondition) remains a manual pre-deploy step inherited from Phase 198, not discharged here.
10. **Preflight methodology note:** `preflight_request_ref` is `NOT-EXECUTED-PHASE-213` because
    this PR targets `develop`. Per `docs/compliance/request-time-preflight-protocol.md`, the live
    preflight sweep runs once per batch at the `develop → staging` promotion, not per-PR — this is
    expected and not a gap in this declaration.
