# Billing Funnel Integrity Audit

This audit is a data-integrity guard for billing-funnel telemetry. It is not proof of real-world engagement.

## What It Checks

For recent billing-funnel rows in `engagement_events`, the audit flags:

1. Missing `correlation_id`
2. Missing `metadata.outcome`
3. Duplicate event keys for the same `(tenant_id, subscription_id, correlation_id, event_type)`
4. Orphan attempt events for:
   - `company_registration_attempted`
   - `premium_upgrade_attempted`
5. Completed PayPal payments without matching telemetry rows
6. Success telemetry rows whose tenant state does not match the recorded success
7. Processed webhook logs without matching webhook telemetry rows
8. Billing route outcomes without matching success/failure telemetry

An orphan attempt means the attempt is older than the grace window and has no matching terminal event:

- `*_succeeded`
- `*_failed`
- `*_failed_*`
- `*_blocked_*`

## What It Does Not Prove

1. Product engagement
2. Retention
3. Feature adoption
4. End-to-end production parity by itself
5. Causal impact on user behavior

## Health Exposure

`GET /health` now includes:

- `services.billingFunnelTelemetry.status`
- `services.billingFunnelTelemetry.recent_write_failures`
- `services.billingFunnelTelemetry.recent_skips`
- `services.billingFunnelTelemetry.missing_correlation_count`
- `services.billingFunnelTelemetry.missing_outcome_count`
- `services.billingFunnelTelemetry.orphan_attempt_count`
- `services.billingFunnelTelemetry.duplicate_event_count`
- `services.billingFunnelTelemetry.payment_without_telemetry_count`
- `services.billingFunnelTelemetry.tenant_state_mismatch_count`
- `services.billingFunnelTelemetry.webhook_without_telemetry_count`
- `services.billingFunnelTelemetry.route_outcome_mismatch_count`

If the audit is enabled and degraded, `/health` returns `503`.

## Environment Variables

Optional runtime controls:

```env
BILLING_FUNNEL_AUDIT_ENABLED=true
BILLING_FUNNEL_AUDIT_INTERVAL_MINUTES=60
BILLING_FUNNEL_AUDIT_LOOKBACK_HOURS=24
BILLING_FUNNEL_AUDIT_ATTEMPT_GRACE_MINUTES=15
BILLING_FUNNEL_AUDIT_ISSUE_LIMIT=20
BILLING_FUNNEL_THRESHOLD_MISSING_CORRELATION=0
BILLING_FUNNEL_THRESHOLD_MISSING_OUTCOME=0
BILLING_FUNNEL_THRESHOLD_ORPHAN_ATTEMPTS=0
BILLING_FUNNEL_THRESHOLD_DUPLICATE_EVENTS=0
BILLING_FUNNEL_THRESHOLD_PAYMENT_WITHOUT_TELEMETRY=0
BILLING_FUNNEL_THRESHOLD_TENANT_STATE_MISMATCH=0
BILLING_FUNNEL_THRESHOLD_WEBHOOK_WITHOUT_TELEMETRY=0
BILLING_FUNNEL_THRESHOLD_ROUTE_OUTCOME_MISMATCH=0
BILLING_FUNNEL_THRESHOLD_WRITE_FAILURES=0
BILLING_FUNNEL_THRESHOLD_SKIPS=0
```

The audit degrades when a metric exceeds its configured threshold.

## Scripted Audit

You can also run the integrity audit directly:

```bash
cd backend
npm run audit:billing-funnel
```

The command exits `0` when the audit is healthy and non-zero when integrity drift is detected.

## Operational Use

Use this audit before user testing and during rollout to catch telemetry drift early:

1. Run the app
2. Hit billing/register flows
3. Check `GET /health`
4. Investigate any degraded counters before trusting the telemetry
