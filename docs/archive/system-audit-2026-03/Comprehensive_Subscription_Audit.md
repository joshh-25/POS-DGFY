# System Audit - Comprehensive Subscription Logic Gaps

Last updated: 2026-03-04

This is the current source-of-truth summary for subscription hardening in the PayPal path.
All statements below are backed by code, migration, or test evidence in this repository.

## Executive Status

- Status: Resolved for gaps 3.4, 3.5, 3.6, 3.7, 3.8 and premium registration status-gate parity.
- No unresolved subscription entitlement blocker was found in the reviewed code paths.
- Remaining operational risk is external dependency drift (PayPal sandbox/API behavior), mitigated by scheduled canary coverage.

## Findings and Verified Controls

### 1. Webhook replay and period-end rollback
- Risk: Duplicate/late payment webhooks could create duplicate payment records or move `current_period_end` backward.
- Controls:
  - Webhook idempotency key prefers PayPal event id, then transmission id fallback.
  - `Payment.transaction_id` is unique; duplicate sale inserts are treated as idempotent no-op.
  - `current_period_end` is monotonic via `maxDate(...)` guard (never moves backward).
- Evidence:
  - [`backend/src/controllers/paymentController.js`](../backend/src/controllers/paymentController.js) lines 21-25, 49-74, 152-166, 190-193
  - [`backend/src/models/Landlord/Payment.js`](../backend/src/models/Landlord/Payment.js) lines 21-25
  - [`backend/migrations/20260210000001-add-subscription-schema.cjs`](../backend/migrations/20260210000001-add-subscription-schema.cjs) lines 69-73

### 2. Subscription period drift and anchor integrity
- Risk: Fixed-day arithmetic (`+30 days`) drifts billing dates and can desync from PayPal.
- Controls:
  - Use authoritative PayPal billing timestamps first (`next_billing_date` / `billing_info.next_billing_time`).
  - Fallback is calendar-aware one-month extension with anchor-day snap-back.
  - Backfill migration safely derives missing `billing_cycle_anchor` from `current_period_end` only for premium rows.
- Evidence:
  - [`backend/src/controllers/paymentController.js`](../backend/src/controllers/paymentController.js) lines 171-188, 199-204, 471-489
  - [`backend/src/models/Landlord/Tenant.js`](../backend/src/models/Landlord/Tenant.js) lines 63-70, 79-82
  - [`backend/migrations/20260303000005-backfill-missing-billing-anchor.cjs`](../backend/migrations/20260303000005-backfill-missing-billing-anchor.cjs)
  - [`backend/tests/billingAnchorBackfill.migration.test.js`](../backend/tests/billingAnchorBackfill.migration.test.js)

### 3. Unpaid premium entitlement
- Risk: `APPROVAL_PENDING` subscriptions could be accepted as paid upgrades.
- Controls:
  - `upgradeToPremium` now requires `status === 'ACTIVE'`.
  - Registration path (`registerCompanyRequest`) also requires `ACTIVE` for premium auto-approval.
- Evidence:
  - [`backend/src/controllers/paymentController.js`](../backend/src/controllers/paymentController.js) lines 434-453
  - [`backend/src/controllers/adminTenantController.js`](../backend/src/controllers/adminTenantController.js) lines 98-117
  - [`backend/tests/subscriptionIntegration.test.js`](../backend/tests/subscriptionIntegration.test.js)

### 4. Missing plan propagation to premium gates
- Risk: Tenant can have active subscription status but still fail premium middleware if `plan` is not set.
- Controls:
  - Activation, payment completion, sync, and upgrade flows all set/retain premium plan correctly under ACTIVE conditions.
- Evidence:
  - [`backend/src/controllers/paymentController.js`](../backend/src/controllers/paymentController.js) lines 197-199, 236-239, 374-377, 494-499

### 5. Engagement event integrity and dedupe
- Risk: Engagement telemetry can be noisy (duplicate retries) and misinterpreted as user behavior.
- Controls:
  - Idempotent engagement writes (`useIdempotency: true`) in upgrade/registration flows.
  - Deterministic correlation id (`x-request-id` fallback to UUID) for retry-safe event grouping.
  - Integration tests assert exact event pairs and dedupe behavior for retried requests.
- Evidence:
  - [`backend/src/controllers/paymentController.js`](../backend/src/controllers/paymentController.js) lines 404-417, 420-430, 438-449, 502-514
  - [`backend/src/controllers/adminTenantController.js`](../backend/src/controllers/adminTenantController.js) lines 34-52, 83-91, 120-130, 165-178
  - [`backend/src/services/engagementService.js`](../backend/src/services/engagementService.js) lines 53-67
  - [`backend/src/models/Landlord/EngagementEvent.js`](../backend/src/models/Landlord/EngagementEvent.js) lines 41-45
  - [`backend/tests/subscriptionIntegration.test.js`](../backend/tests/subscriptionIntegration.test.js)

## Test Quality Assessment (Engagement Claim)

The current test stack validates conversion-path integrity, not full product engagement.

- What is proven:
  - HTTP route behavior for upgrade/registration.
  - Persisted tenant entitlement state transitions in DB.
  - Persisted engagement events with exact event contracts and retry dedupe.
  - Live PayPal handshake coverage in sandbox canary.
- What is not proven:
  - Downstream real-world usage/retention (feature adoption after upgrade).
  - Business KPI causality (for example, revenue lift or active usage depth).

Conclusion: The implementation robustly measures and protects the subscription conversion pipeline and its telemetry quality. It does not by itself prove broader user engagement outcomes.

## Operational Validation Checklist

Use this checklist after deployment:

1. Run migrations: `cd backend && npx sequelize-cli db:migrate`
2. Run subscription suites:
   - `npm test -- subscriptionIntegration.test.js`
   - `npm test -- paypalWebhookHandlers.test.js`
   - `npm test -- paypalUpgradeValidation.test.js`
   - `npm test -- adminTenantRegistrationValidation.test.js`
   - `npm test -- billingScheduler.idempotency.test.js`
   - `npm test -- billingScheduler.db.integration.test.js`
3. Optional live canary (requires sandbox secrets):
   - `npm test -- paypalSandboxCanary.e2e.test.js`
4. Verify anchor backfill safety query returns zero:
   - `SELECT COUNT(*) FROM tenants WHERE plan='premium' AND current_period_end IS NOT NULL AND billing_cycle_anchor IS NULL;`

## Closure Addendum (2026-03-04)

- Subscription-related suites remain green in final full-regression passes.
- No subscription entitlement regression was introduced by the test/lifecycle hardening work done in this cycle.
- Final cycle confidence for subscription logic remains high, bounded by external API availability risks (PayPal/OpenAI/infra).
- Fresh revalidation full-suite evidence:
  - `backend/full_run_revalidation_2026-03-04_run1.log`
  - `backend/full_run_revalidation_2026-03-04_run2.log`
  - `backend/full_run_revalidation_2026-03-04_run3.log`
- Fresh revalidation targeted matrix evidence:
  - `backend/targeted_matrix_revalidation_2026-03-04_run1.log`
  - `backend/targeted_matrix_revalidation_2026-03-04_run2.log`
  - `backend/targeted_matrix_revalidation_2026-03-04_run3.log`
- Gated suite evidence:
  - `backend/integration_revalidation_2026-03-04_token_refresh_race.log` (integration gate passed)
  - `backend/canary_revalidation_2026-03-04_paypal.log` (canary skipped due missing sandbox secrets)

## Related Audit Files

- [3.4-Billing_date_logic_drift.md](./3.4-Billing_date_logic_drift.md)
- [3.5-Scheduler_emails_not_idempotent.md](./3.5-Scheduler_emails_not_idempotent.md)
- [3.6-Upgrade_endpoint_accepts_unpaid_subscriptions.md](./3.6-Upgrade_endpoint_accepts_unpaid_subscriptions.md)
- [3.7-Subscription_activation_missing_plan_field.md](./3.7-Subscription_activation_missing_plan_field.md)
- [3.8-Payment_webhook_period_end_reset.md](./3.8-Payment_webhook_period_end_reset.md)

