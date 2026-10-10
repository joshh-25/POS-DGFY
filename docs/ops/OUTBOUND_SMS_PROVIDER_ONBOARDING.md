---
status: authoritative
authority_level: authoritative
owner: operations
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: outbound_sms_provider_onboarding
topic: outbound_sms_provider_onboarding
---

# Outbound SMS provider onboarding

No production SMS provider is configured by this change. `SMS_PROVIDER` defaults to
`unconfigured`; sending in that mode records an `unconfigured` result and does not claim delivery.
The `fake` adapter is for development and tests only and is blocked when `NODE_ENV=production`.

## Required provider inputs

Before choosing a driver, record and approve:

- Provider contract and supported Philippine routes.
- Sender ID or phone number, including Philippine sender-ID registration requirements.
- API credentials and their secret-storage/rotation owner.
- Sandbox account and permitted test destinations.
- Whether delivery-receipt webhooks are required, their authentication, replay protection, and
  callback ownership.
- Rate limits, throughput caps, per-message costs, and spend alerts.
- Required consent, suppression, and opt-out behavior for each message purpose.

## Connection and verification path

1. Add a provider driver under `apps/dgfy-api/src/modules/smsDelivery/adapters/` implementing
   `send({ id, to, purpose, content, correlation })` and mapping provider outcomes to
   `accepted`, `rejected`, or `failed`.
2. Register the explicit provider mode in `adapters/index.js`. Keep `unconfigured` as the default;
   never enable the fake adapter in production.
3. Add only required provider configuration to the API environment templates and production
   environment validation. Store credentials in the approved secret store.
4. Send an approved sandbox message to a controlled destination. Confirm the API result, one
   `sms_delivery_logs` row, provider message ID (if supplied), simulation flag, and failure alert
   behavior. Verify no message body is present in the row or alert context.
5. Confirm sender registration, rate/cost controls, opt-out handling, webhook decision, and
   operational ownership before enabling the provider for production traffic.

The retained raw phone is redacted after `SMS_DELIVERY_LOG_RETENTION_DAYS` (default 30). The HMAC
secret `SMS_PHONE_HASH_SECRET` is required in production and should be rotated only with a planned
hash continuity decision.
