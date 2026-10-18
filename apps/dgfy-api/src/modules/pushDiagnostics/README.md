# Push diagnostics

Operator-only diagnostics for outbound push delivery (ADR 0097, issue #2579). The module is read-mostly
and lives behind the Platform Admin console (`apps/dgfy-admin`, ADR 0047/0089) under the
`admin.push_diagnostics` page grant. Each deployment shows only the data of the API environment it is
connected to; the environment label comes from `DEPLOY_ENV_LABEL` (falling back to
`SENTRY_ENVIRONMENT`, otherwise `unknown`) because `NODE_ENV` is `production` on staging and production
alike.

What it exposes, all without raw tokens, secret values, owner ids, or customer/order PII:

- Provider and secret *presence* indicators (booleans only).
- Registration counts and a capped list keyed by a pseudonymous `ref` (first 12 hex characters of the
  keyed token hash, the same prefix the delivery log stores).
- Recent delivery attempts with a derived state (`no_provider`, `rejected_by_expo`,
  `accepted_receipt_pending`, `receipt_ok`, ...). These describe what the provider pipeline reported;
  they never claim a notification was shown on a device.
- Recent dispatch decisions from `push_dispatch_events`, including skipped/suppressed reasons such as
  `no_active_tokens`. Order references are shown only as a keyed one-way correlation ref.

Test sends go only to an *enrolled diagnostic device*. An operator creates a single-use, 10-minute
enrollment code in the admin page; the device presents that code and its Expo token to the session-less
`POST /api/v1/push-diagnostics/enroll`. The token is stored server-side in `push_diagnostic_devices` and
is never returned. A test send takes a device id and no body, is rate limited per admin and per device,
and is written to `push_delivery_logs` with purpose `diagnostic_test` so it follows the normal receipt
poller.

Opening the overview, creating an enrollment code, enrolling and revoking a device, and every test send
write `platform_admin_audit_logs` rows (`push_diagnostics.*`). Dispatch events and revoked diagnostic
devices follow the 30-day push log retention in `pushReceiptScheduler`.

Controllers are transport only; use cases coordinate; repositories own persistence and the audit writes.

For operator status meanings, triage, environment labeling, and the diagnostic-device workflow, see
the [Platform Admin push diagnostics runbook](../../../../../docs/ops/PUSH_DIAGNOSTICS_RUNBOOK.md).
