---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-10-17
last_reviewed: 2026-10-18
review_by: 2027-04-17
applies_to: outbound_push_delivery
topic: outbound_push_notification_delivery_contract
---

# ADR 0097: Outbound push-notification delivery contract

## Status

Amended on 2026-10-18 by the POS staff new-online-order push contract below. Originally accepted on
2026-10-17. Expo delivery remains disabled until its credentials and provider configuration are
provisioned.

## Context

Storefront order-status transitions can notify DGFY customers in-app, but customers may not have
the Storefront open when an order changes. Push delivery adds a provider boundary and device-token
lifecycle across DGFY accounts, guest checkout, the landlord database, and Storefront order
transitions. Raw device tokens and customer details must not enter delivery logs. The existing SMS
contract in ADR 0094 provides the best-effort adapter, disabled-provider, and retention precedent;
SMS behavior remains unchanged.

## Decision

1. Outbound order-status push uses a provider-neutral adapter with `fake`, `unconfigured`, and
   `expo` modes. `PUSH_PROVIDER` defaults to `unconfigured`, and production resolves `fake` to
   `unconfigured`; no unconfigured or simulated outcome claims real delivery. `[default]`
2. Account pushes dispatch only when the matching in-app notification is newly created. Guest
   pushes dispatch from the shared post-commit activity recorder only when the order status changed
   and the order has neither a Storefront customer nor a DGFY account. The pushable status allowlist
   is `confirmed`, `preparing`, `ready_for_pickup`, `out_for_delivery`, `completed`, `rejected`, and
   `cancelled`. `placed` remains SMS-owned; `packed`, `delivered`, and `picked_up` do not produce
   status pushes. `[default]`
3. Pushes use the shared status copy and contain only the tracking PIN plus a public Storefront
   discovery slug when one resolves. They do not include `company_token`, customer contact details,
   delivery addresses, order lines, or other customer PII. SMS `delivered` (a delivery-job event)
   and push `completed` (an order event) remain separate; v1 has no cross-channel suppression.
   `[default]`
4. Landlord tables store Expo tokens and delivery logs without foreign keys to tenant orders.
   Each token row has exactly one account or guest-order owner. One token value has at most one
   active owner; registering it under a new owner revokes its previous binding, while re-registering
   for the same owner refreshes `last_seen_at`. Guest orders have a five-active-device cap enforced
   under a landlord tenant-row lock. `[default]`
5. Guest token writes require a dedicated `store_push_proof` JWT, separate from cancellation proof,
   bound to tenant, order id, and tracking PIN, with a 24-hour default expiry. The proof is returned
   only for eligible guest checkout orders. Registration rejects linked Storefront customers and
   final orders. Final guest status, account claim, and seven-day token TTL revoke guest bindings.
   Webhook-finalized online-paid guest orders currently have a proof-distribution gap: payment
   session status does not expose `cancel_proof`; this ADR does not add another distribution
   channel. `[default]`
6. Delivery logs store a keyed HMAC of the token, event dedupe key, status, provider ticket and
   receipt metadata, coarse order identity, timestamps, and safe error codes. They never store raw
   tokens or message content. Production requires `PUSH_TOKEN_HASH_SECRET`. Revoked tokens and
   delivery logs are purged after 30 days by default; account tokens inactive for 90 days are
   revoked. `[default]`
7. Expo sends are batched at no more than 100 messages with a bounded request timeout. Network,
   HTTP 429, and HTTP 5xx failures receive bounded retries; HTTP 400 is not retried. Receipt polling
   checks tickets after about 15 minutes and before the provider's 24-hour expiry, at no more than
   1,000 ticket IDs per request. `DeviceNotRegistered` from a ticket or receipt revokes the token.
   `[default]`
8. Dispatch is detached, best-effort, and runs after the order transaction commits. Provider and
   logging failures never fail checkout or a status transition. This version has no outbox: a
   process crash between commit and dispatch can lose a push, and failed sends are not replayed.
   `[default]`
9. Push token registration and deletion are exposed to authenticated DGFY accounts and to guest
   tracking clients holding the dedicated push proof. The Storefront tracking limiter protects
   guest writes; account writes have a dedicated account/IP limiter. `[default]`
10. This contract does not add a mobile consumer, web push, marketing/broadcast push, POS/staff push,
    or push for Storefront-customer orders not linked to a DGFY account. Provider onboarding,
    real-device validation, and production credentials remain separate operational work.
    `[default]`

## Consequences

- An Expo project token, APNs/FCM credentials, and server secrets must be provisioned before
  enabling `PUSH_PROVIDER=expo`; production remains `unconfigured` until then.
- Best-effort post-commit dispatch intentionally accepts a delivery-loss window and no retry of a
  persisted failed event. Unique event/token keys prevent duplicate sends of already-recorded
  events.
- Guest order registration requires possession of the checkout-issued proof. The existing online
  payment-session read path does not currently provide that proof for webhook-finalized guest
  orders, so those orders cannot use guest push registration through a new channel in this scope.
- The keyed token hash supports safe delivery history correlation. Rotating
  `PUSH_TOKEN_HASH_SECRET` changes those hashes and should be coordinated with the retention
  window.
- `DeviceNotRegistered` receipt revocation depends on scheduler availability before Expo receipts
  expire; the 90-day account inactivity policy remains a fallback.

## References

- ADR 0094 — outbound SMS delivery contract, log, and PII retention.
- [Issue #2554](https://github.com/Sieitzz/dgfy-platform/issues/2554).
- [Expo send-notifications guide](https://docs.expo.dev/push-notifications/sending-notifications/).
- [Push delivery module README](../../../apps/dgfy-api/src/modules/pushDelivery/README.md).

## Amendments

### 2026-10-18 — POS staff new-online-order wake-up push (#2569)

- **Clauses amended:** Decisions 4, 9, and 10 (`[default]`). No `[binding]` clause changes.
- **Decision 4:** A token has exactly one owner: a DGFY account, a guest order, or a tenant staff
  user (`staff_tenant_id` + `staff_user_id`). The existing single-active-owner-per-token rule
  applies across all three types. A staff refresh may supply `previous_token`; the old binding is
  revoked as `refreshed` only when it is still active and owned by that same tenant/user pair.
- **Decision 9:** POS staff registration and deletion use authenticated
  `/api/v1/pos/staff-push-tokens` routes gated by `pos:view` and the existing POS middleware. The
  tenant and user owner values come from the authenticated request, never the body. Re-registering
  the same token refreshes `last_seen_at`; sign-out deletes the token, while a tenant switch may
  re-register it under the new tenant and move its single active binding.
- **Decision 10:** The sole POS/staff event is a best-effort `pos_new_online_order` push after a
  fresh online-order transaction commits. It targets active, non-deleted staff with effective
  `pos:view` permission and location access for that order. If the order has no location, targeting
  uses the existing `resolveMovementLocation` rule; shift state is not required. The payload uses
  fixed generic copy and only `order_id` plus `location_id`; it excludes the tracking PIN, customer
  data, order lines, `company_token`, and access tokens. `GET /pos/incoming-orders` remains the
  authoritative queue. Replays do not dispatch, and the existing no-outbox crash-loss window
  remains accepted.
- Staff events use the separate `staff_new_online_order` delivery purpose, so their per-order
  reservation cap does not consume the Storefront order-status cap. Token hourly limits, HMAC
  logging, adapter modes, receipt polling, and `DeviceNotRegistered` revocation remain shared.
- Eligibility is checked again at dispatch time. Deactivation and staff removal revoke bindings
  best-effort; permission or location-grant changes stop targeting without a separate revoke hook.
  Staff bindings inactive for the existing 90-day account-token window are revoked by retention.
  Clients call deletion on sign-out and re-register on launch to refresh `last_seen_at`.
- Expo remains `unconfigured` by default. This amendment does not add a mobile client, provider
  credentials, web push, an outbox, or any other staff-notification event.
