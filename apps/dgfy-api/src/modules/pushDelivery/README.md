# Push delivery

This module sends best-effort Storefront order-status and POS staff new-online-order push
notifications to Expo tokens. It owns token registration, provider adapters, delivery history,
receipt processing, and token retention. Routes and controllers call use cases; repositories are
the only layer that reads landlord models.

## Delivery contract

- Account-owned orders dispatch only after `createNotificationIfMissing` creates the matching
  in-app notification. Guest orders dispatch from the shared customer-activity recorder only when
  the order status changed and the order has neither a Storefront customer nor a DGFY account.
- Pushable statuses are `confirmed`, `preparing`, `ready_for_pickup`, `out_for_delivery`,
  `completed`, `rejected`, and `cancelled`. `placed` remains SMS-owned; `packed`, `delivered`, and
  `picked_up` do not produce order-status pushes.
- A push contains the shared status title/body and `data.tracking_pin`. It includes
  `data.store_slug` only when the public Storefront discovery index resolves a tenant or location
  slug. It never uses `company_token` or includes customer contact, address, or order-line data.
- Dispatch runs after the owning order transaction commits and is detached from status updates.
  The module does not use an outbox: a process crash between commit and dispatch can lose a push.
- A unique event/token dedupe key prevents repeat delivery. Expo tokens have one active owner;
  reassignment revokes the old binding. Guest orders allow at most five active devices, serialized
  under the landlord tenant row lock.

### POS staff new-online-order wake-up

POS staff register with `POST /api/v1/pos/staff-push-tokens` and delete with
`DELETE /api/v1/pos/staff-push-tokens`. Both routes use the authenticated tenant user, the existing
POS limiter/device-proof middleware, and the `pos:view` permission gate. Registration accepts
`token`, `platform` (`ios` or `android`), `app` (`pos` or `fiscalpos`), and `brand`; optional
`previous_token` lets a client replace a refreshed Expo token. The owner is always the authenticated
`(tenant_id, user_id)` pair. Sign-out calls `DELETE`; tenant switching may re-register the same token
under the new tenant, which moves its single active owner. Clients should register on launch to
refresh `last_seen_at`.

After a fresh online-order transaction commits, the API sends one detached, best-effort
`staff_new_online_order` event. Idempotent checkout replays do not dispatch. Audience checks run for
each user at send time: the user must be active, not deleted, have effective `pos:view`, and pass
the existing location-access rule for the order. If `location_id` is null, the existing
`resolveMovementLocation` rule resolves it; the staff member does not need an open shift. A failure
to resolve one user's permissions or location skips that user without blocking others. Deactivation
and removal revoke the user's staff tokens best-effort. Permission or location-grant changes are
enforced by the next dispatch-time check. The retention scheduler revokes staff tokens not refreshed
for the same 90-day window used for account tokens.

The fixed title/body are `New online order` and `A new online order is waiting in POS.` The
notification data contains only `event: pos_new_online_order`, the numeric `order_id`, and the
resolved `location_id` (or `null`). It never carries a tracking PIN, customer details, order lines,
`company_token`, or access tokens. Staff logs use their own purpose and per-order cap so fan-out does
not consume the Storefront order-status limit. `GET /api/v1/pos/incoming-orders` remains authoritative;
push is only a wake-up hint.

As with the existing status events, there is no outbox. A process crash after commit but before the
detached dispatcher runs can lose the wake-up push. Provider/network/logging failures never fail or
delay checkout. Expo remains disabled until separately provisioned credentials and provider
configuration are enabled.

## Guest proof

Guest registration and removal use `POST` and `DELETE`
`/api/v1/store/track/:tracking_pin/push-tokens`. Both require a dedicated `store_push_proof` JWT
returned from eligible checkout responses. The proof is separate from `cancel_proof`, binds the
tenant, order id, and tracking PIN, and expires after 24 hours by default. Registration rejects
linked Storefront customers and final orders. Guest bindings are revoked after a final-status push,
after a claim links the order to a Storefront customer, or after the seven-day guest-token TTL.

Webhook-finalized online-paid guest orders currently do not return the existing `cancel_proof` from
the payment-session status response. This implementation does not add another proof-distribution
channel; those orders cannot register guest push tokens unless a checkout response already returned
the dedicated proof.

## Provider and operations

`PUSH_PROVIDER` defaults to `unconfigured`. `fake` is available outside production and resolves to
`unconfigured` in production. `expo` uses the Expo Push Service through the existing `axios`
dependency, sends batches of at most 100 messages, and polls at most 1,000 receipts per request.
Requests have a bounded timeout and retry network failures, HTTP 429, and HTTP 5xx responses; HTTP
400 responses are not retried. `EXPO_ACCESS_TOKEN` is optional for Expo enhanced push security.

The receipt scheduler runs every 15 minutes under a distributed cache lock. It polls accepted
tickets after the 15-minute delay and before the 24-hour receipt expiry, revokes tokens reported as
`DeviceNotRegistered`, and applies retention. Guest tokens expire after seven days; account tokens
are revoked after 90 days without registration refresh; revoked tokens and delivery logs are purged
after 30 days. All intervals and the provider mode are configurable through `apps/dgfy-api/.env`.

`PUSH_TOKEN_HASH_SECRET` is required for production HMAC token hashes. Raw Expo tokens are only in
the active token table and provider request; they are never written to logs or delivery history.
Delivery history contains no message content. Provider credentials and production secrets belong
in SOPS, not source control. No provider is selected or enabled by this module's default
configuration.

## Operator diagnostics (#2579)

Dispatch decisions that never create a per-token delivery log (no eligible device, policy skips such
as `status_not_notifiable`, rate caps, hash failures) are recorded best-effort in
`push_dispatch_events` through `utils/dispatchEventRecorder.js`; a recording failure is logged and
swallowed so checkout and status transitions are unaffected. Operator-enrolled diagnostic devices are
kept in `push_diagnostic_devices` (not `push_device_tokens`), and their test sends reuse
`push_delivery_logs` with purpose `diagnostic_test` and the receipt poller. The read-only Platform
Admin views, enrollment codes, and the test send live in
[`modules/pushDiagnostics`](../pushDiagnostics/README.md). Set `DEPLOY_ENV_LABEL` (for example
`staging` or `production`) in the API environment file so those views identify the environment;
`NODE_ENV` is `production` on both.

See [ADR 0097](../../../../docs/architecture/adr/0097-outbound-push-notification-delivery-contract.md),
[ADR 0094](../../../../docs/architecture/adr/0094-outbound-sms-delivery-contract-log-and-pii-retention.md),
and [Expo's send-notifications guide](https://docs.expo.dev/push-notifications/sending-notifications/).
