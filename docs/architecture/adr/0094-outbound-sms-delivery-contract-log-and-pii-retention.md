---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: outbound_sms_delivery
topic: outbound_sms_delivery_contract_and_log
---

# ADR 0094: Outbound SMS delivery contract, log, and PII retention

## Context

Order alerts and promotional messages need one outbound SMS boundary before a delivery provider
has been selected. Storing message bodies in delivery history would retain customer content and
could expose order details or future credentials. Philippine mobile numbers also have a small
enough keyspace that an unkeyed digest is not an adequate retained identifier.

## Decision

1. Outbound SMS requests use a provider-neutral adapter contract, with explicit `fake` and
   `unconfigured` modes. Production resolves `fake` to `unconfigured`; no unconfigured or simulated
   result may claim real delivery. `[default]`
2. One landlord-scoped `sms_delivery_logs` row is written per recipient. `tenant_id` and `order_id`
   have no foreign keys so the delivery history survives tenant and order lifecycle changes.
   `[default]`
3. Delivery logs never store message content. They retain a keyed HMAC of the normalized E.164
   recipient and a coarse prefix; `recipient_phone` is nullable and redacted after 30 days by
   default. Production requires `SMS_PHONE_HASH_SECRET`; non-production may use a local fallback.
   `[default]`
4. Delivery logging and retention are enabled by default and can be disabled with their respective
   explicit `false` flags. Provider failures raise a throttled operational alert with delivery ID,
   provider, and error code only. `[default]`
5. No provider, sender identity, API credential, webhook, consent policy, or real delivery claim is
   selected here. Those require provider onboarding and later issue scope. `[snapshot]`

## Consequences

- Future provider drivers register behind the adapter boundary and must pass sandbox verification
  before use.
- A fake adapter is suitable for contract tests and explicitly enabled development simulations;
  it is blocked in production.
- Redacted rows remain useful for coarse delivery analysis, while exact recipient lookup no longer
  works after the retention window.
- Production environments must configure a strong SMS phone HMAC secret before this version starts.

## Amendments

### 2026-10-10 — Best-effort transactional order alerts (#2416)

1. Order-received (`placed`) and order-delivered SMS alerts dispatch after the owning database
   transaction commits. The implementation uses bounded, best-effort dispatch rather than an
   outbox. A process crash between commit and dispatch can lose an alert; a persisted failed-send
   row is not retried because the sender's durable dedupe record short-circuits every existing
   outcome. A failure to write the log can leave no dedupe row. This is accepted for this alert
   wave; callers must not roll back or fail an order transition because dispatch failed.
   `[default]`
2. “Delivered” for this alert means the manual delivery job transitions to `delivered`. The order's
   `completed` fulfillment status is not used because it also represents pickup completion.
   `[default]`
3. Order-alert log rows leave `order_id` null. The SMS log column is UUID while the order's
   `pos_transaction_id` is an integer; the schema remains unchanged and dedupe uses the event key
   plus recipient hash. `[default]`
4. Order-alert dispatch is bounded to five seconds. A real provider adapter must enforce its own
   request timeout because the caller's timeout does not cancel an underlying provider request.
   `[default]`

## References

- ADR 0054 — outbound email delivery log and bounce capture (landlord log precedent).
- `apps/dgfy-api/src/modules/smsDelivery/README.md` — module boundary.
- `docs/ops/OUTBOUND_SMS_PROVIDER_ONBOARDING.md` — provider-specific rollout checklist.
- Issue #2415 — provider-neutral sender foundation.
- Issue #2416 — order-received and order-delivered alert integration.
