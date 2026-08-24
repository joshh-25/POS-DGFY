---
status: reference
owner: engineering
last_reviewed: 2026-08-21
related_adr: docs/architecture/adr/0069-retail-downpayment-multi-method-capture-and-refund-policy.md
declaration_id: 2026-08-21-downpayment-config-surface
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.21
verification_evidence: apps/dgfy-api/tests/downpaymentSettingsUseCases.unit.test.js (14 passed),apps/dgfy-api/tests/downpaymentSettingsRepository.unit.test.js (3 passed),apps/dgfy-api/tests/downpaymentSettingsValidator.unit.test.js (6 passed),npm run check:architecture (ArchitectureGuardrails OK / ControllerBoundary OK),node --check on every new/changed file
rollback_note: Revert this PR's diff. Every change is additive -- a new landlord table+migration, a new modules/downpayment/ module, a new route mounted at /api/v1/downpayment, a new COMPLIANCE_SENSITIVE_RULES entry, and this declaration. Nothing in this PR is read by any existing checkout, quote, or payment-capture code path (that starts at Phase 139/#821) -- reverting removes the new surface cleanly with no effect on any currently-running flow.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-21T20:00:00+08:00
preflight_request_ref: ISSUE-820-DOWNPAYMENT-CONFIG-SURFACE
---

# Downpayment Config Surface (Phase 138, #820)

## Compliance Impact Classification

Major. The classification floor comes from the new
`apps/dgfy-api/src/modules/downpayment/**` path, which this PR itself adds to
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
(`surfaces: payments`, `minimumClassification: major`) — mirroring the
existing `modules/payments/`/`modules/commercePayments/` entries. That
registration is a deliberate design decision, not incidental: this module is
substantively a payment/checkout config surface (ADR 0069's own
`ARCHITECTURE_GOVERNANCE.md` Implementation Hardening Contract names
"payment, checkout" as a trigger domain regardless of which folder the code
lands in), so leaving it uncovered by the existing pattern list would have
silently dodged the guardrail rather than correctly tripping it.

No capture, refund, or checkout code path is touched by this PR — it is a
config-surface phase only (ADR 0069 clause 5). `tenant_downpayment_settings`
has no reader anywhere in the codebase yet; the first reader is Phase 139
(#821, server-authoritative downpayment resolution at quote/checkout).

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260821000005-create-tenant-downpayment-settings.cjs`
   (new) — landlord-DB migration, one new table, additive, idempotent
   (`describeTable(...).catch(()=>null)` guard, matching
   `tenant_affiliate_settings`'s own precedent). Not itself compliance-sensitive
   under any existing rule (the migration-runner app has no
   `COMPLIANCE_SENSITIVE_RULES` entry), listed here for completeness.
2. `apps/dgfy-api/src/models/Landlord/TenantDownpaymentSettings.js` (new),
   `apps/dgfy-api/src/models/index.js` (registration) — Sequelize model + the
   standard `hasOne`/`belongsTo` association wiring. Not itself
   compliance-sensitive (`src/models/` matches no rule), listed for
   completeness.
3. `apps/dgfy-api/src/modules/downpayment/**` (new module: `index.js`,
   `README.md`, `repositories/downpaymentSettingsRepository.js`,
   `usecases/downpaymentSettingsUseCases.js`,
   `controllers/downpaymentSettingsHandlers.js`) — **the compliance-sensitive
   surface itself**. `downpaymentSettingsUseCases.js`'s update use case
   rejects a `payment_mode = 'customer_choice'` write outright (`422
   PAYMENT_MODE_NOT_SUPPORTED`) since it isn't built yet. Every write
   re-validates the full *effective* (merged) settings row, not just the
   fields the request touches. **Updated 2026-08-21 (#833, ADR 0070)**: this
   use case originally also rejected `payment_mode = 'downpayment_required'`
   for any non-Retail tenant (ADR 0069 clause 7). That rejection was a scope
   error, corrected the same day — see Compliance Preconditions #2 below.
4. `apps/dgfy-api/src/validators/downpaymentSettingsValidator.js` (new) — Joi
   shape/bounds validation (enum literals, bps/centavos ranges). Deliberately
   does not attempt cross-field "required given the effective type"
   requiredness via `.when()`, since Joi only ever sees one request body, not
   the stored row — that check lives in the use case instead (see #3).
5. `apps/dgfy-api/src/config/permissions.js` — new `DOWNPAYMENT` permission
   block (`VIEW_DOWNPAYMENT_SETTINGS`/`MANAGE_DOWNPAYMENT_SETTINGS`);
   `VIEW_DOWNPAYMENT_SETTINGS` added to the `manager` default-role array
   (view-only, mirroring how `VIEW_AFFILIATES` was added there).
6. `apps/dgfy-api/src/routes/downpaymentSettings.js` (new),
   `apps/dgfy-api/src/server.js` (mount at `/api/v1/downpayment`) — `GET`/`PUT
   /settings`, gated by the permissions in #5 and the Joi validator in #4.
7. `packages/shared-constants/src/downpaymentDefaults.js` (new),
   `apps/dgfy-api/src/modules/shared/constants/downpaymentDefaults.js`
   (re-export) — a per-vertical-defaults registry, not wired into any live
   read path yet (plumbing for a future phase/frontend).
8. `scripts/check-compliance-impact.js`,
   `docs/compliance/compliance-classification-matrix.md` — this PR's own
   compliance-registry change (see Classification above).
9. `docs/database/schema.md`, `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`
   — documentation only.

## Compliance Preconditions

1. No new capability is reachable by any existing role beyond
   `admin` (which receives every permission by default,
   `DEFAULT_ROLE_PERMISSIONS.admin = getAllPermissions()`) and `manager`
   (view-only, via the new `VIEW_DOWNPAYMENT_SETTINGS` grant). `staff` gets
   neither permission and cannot reach either endpoint.
2. **Amended 2026-08-21 (#833, ADR 0070).** This precondition originally asserted that
   `payment_mode = 'downpayment_required'` could not be set on a non-Retail tenant. That
   restriction was a scope error, corrected the same day by ADR 0070 (superseding ADR 0069's
   clauses 6-7): downpayment is authorized for every workflow mode, not Retail-only. The rejection
   this precondition described has been removed from `downpaymentSettingsUseCases.js`; the
   corrected behavior is unit-tested (`downpaymentSettingsUseCases.unit.test.js`, "accepts
   downpayment_required for a non-Retail tenant (ADR 0070)"). This declaration's `major`/`payments`
   classification is unaffected — the surface being classified (a new payment-config module) is
   unchanged; only which tenants may use it changed.
3. `payment_mode = 'customer_choice'` cannot actually be set — schema/Joi
   accept the literal (so no future migration is needed when it ships), but
   the use case rejects it unconditionally. Unit-tested.
4. No money is captured, refunded, or moved by this PR. `PosOrderPayment`
   (Phase 137) is untouched; no PayMongo/commerce-payment-session code path is
   touched; this table has no reader anywhere in the codebase yet.
5. The migration is purely additive (`CREATE TABLE`, idempotent guard) — no
   existing table, column, or row is altered.

## Verification Evidence

23 new unit tests (14 use-case, 3 repository, 6 validator), all passing, no
database required (both use-case builders and the repository test mock their
dependencies — no live DB, matching the established pattern in
`tests/dgfyAffiliatePriceRuleUseCases.unit.test.js` and
`tests/emailDeliveryLogRepository.unit.test.js`). `npm run check:architecture`
passed for both the guardrails and controller-boundary checks against the new
module. `node --check` passed on every new/changed file.

Outstanding before merge, neither reachable from this session (no live
backend, tenant database, or landlord database available):

- `POST /api/v1/compliance/preflight` has **not** been executed against a
  live environment. The front-matter preflight fields record this change's
  classification decision — a new `payments`-surfaced module, no
  capture/checkout code path touched, therefore `no_breach`/`ALLOWED` — and a
  reviewer with a live environment must run the endpoint and reconcile
  `preflight_run_at`/`preflight_request_ref` before merge (same gap and same
  disclosure shape as `2026-07-29-pos-batch-menu-import.md`).
- The migration's `up()`/`down()` has not been run against a live/scratch
  MySQL database — same open gap carried forward from Phase 137 (#819), for
  the same reason (no local DB available this session).
- `npm run check:compliance` and `npm run lint:docs` should be re-run in CI
  to confirm before merge.
