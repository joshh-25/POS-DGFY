# Push delivery

This module sends best-effort Storefront order-status push notifications to Expo tokens. It owns
token registration, provider adapters, delivery history, receipt processing, and token retention.
Routes and controllers call use cases; repositories are the only layer that reads the landlord
models.

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

See [ADR 0097](../../../../docs/architecture/adr/0097-outbound-push-notification-delivery-contract.md),
[ADR 0094](../../../../docs/architecture/adr/0094-outbound-sms-delivery-contract-log-and-pii-retention.md),
and [Expo's send-notifications guide](https://docs.expo.dev/push-notifications/sending-notifications/).
