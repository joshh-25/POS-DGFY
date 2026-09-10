---
status: draft_pr
authority_level: implementation_handoff
owner: DGFY commerce/integration
last_reviewed: 2026-09-09
applies_to: dglaundry_surebizcorp_storefront_connection
topic: dglaundry_storefront_connection_acceptance
---

# DGLaundry storefront connection and acceptance checklist

Follow-up to [PR #1721](https://github.com/Sieitzz/dgfy-platform/pull/1721)
and [issue #519](https://github.com/Sieitzz/dgfy-platform/issues/519).
The provider handoff is merged. This does not mean its requested configuration
or the customer journey has been implemented, deployed, or accepted.
This document assigns the remaining integration work and evidence to the DGFY
team and DGLaundry owner; it does not enable payments or deploy either runtime.

## Source and authority

Reviewed DGFY source: `3ce45d095` (resolve and record the full SHA when qualifying).
Reviewed DGLaundry source: `3d071db124bc528b64e2fbec7388a8a8cd94f217`.
Recheck both deployed SHAs before acceptance; source presence is not live proof.

Read `docs/START_HERE.md`, architecture boundaries/governance, accepted ADRs
0013 and 0029, and the Surebizcorp provider handoff first. DGFY ADR 0079 is
proposed, so unresolved architectural decisions must be finalized through
DGFY governance rather than treated as already accepted. DGLaundry accepted
ADRs 0005, 0010 and 0012 govern its payment, public-storefront and publication
boundaries. This checklist changes no binding policy. Resolve conflicting
provider policy in the implementation PR before enabling a branch.

## Owners and destinations

| Work | Owner | Destination |
| --- | --- | --- |
| Public shop, map, customer cart, payment, history, notifications, tracking | DGFY storefront/API team | `https://dgfy.ph/tenant-store/<handle>` |
| Staff operations, catalog/pricing, branch availability, intake and fulfillment | DGLaundry owner | `https://laundry.surebizcorp.com` |
| Client registration, OIDC keys, partner access and approved mappings | DGFY identity/platform team | `https://api.dgfy.ph` |
| TLS, gateway, deployment, app-owned secrets and recovery | Surebizcorp deployer | Independent DGLaundry runtime |
| Cross-system tests and release evidence | Both owners | One approved company and explicitly mapped locations |

Set DGFY `DGLAUNDRY_PARTNER_BASE_URL=https://laundry.surebizcorp.com`.
Keep the staff callback exactly
`https://laundry.surebizcorp.com/api/v1/session/dgfy/callback`.
The former `laundry.dgfy.ph` and shared-edge instructions in the older booking
handoff do not apply to Surebizcorp. DGFY connects over signed HTTPS, not a
shared host network, database, runtime or secret store.

## Current findings to resolve before claiming readiness

- `apps/dgfy-api/src/routes/dgfyLaundryOrders.js` exposes catalog, availability,
  quotes and orders through `authenticateDgfyAccount` and `chooseCompany`.
  Prove that an ordinary customer can browse/order from a published shop
  without merchant membership. Provide the public/store-customer adapter if
  needed; do not grant merchant membership or weaken staff authorization.
- The source search in `packages/web-core/src` and `apps/dgfy-storefront/src`
  found the staff launch helper but did not establish a complete laundry
  checkout UI using these APIs. Attach exact component/route references and
  rendered acceptance evidence; implement missing bindings in Storefront.
- DGFY `contracts.js` sanitizes catalog branches to location/online/status.
  Verify that handle, shop presentation, ordering settings, options and branch
  availability reach the public projection without being dropped. Missing
  fields need an agreed schema/adapter; a generic successful event ACK is
  insufficient.
- DGLaundry's event catalogue lists `dgfy.laundry_order.updated.v1` and
  `dgfy.laundry_order.payment_status_changed.v1`, but the reviewed integration
  route does not establish explicit business application for those types.
  Both owners must prove durable update/refund effects or deliver matching
  producer/consumer fixes. Do not equate inbox acceptance with application.
- DGFY's partner client calls `GET /api/v1/integrations/dgfy/health`; this GET
  is not established in the reviewed DGLaundry integration route. Confirm its
  mounted implementation or fix the mismatch; SPA HTML is not API health.
- Production event transport must interoperate byte-for-byte. DGFY uses the
  Ed25519 HTTP-message-signatures profile; do not reuse the separate P-256
  partner/identity credential contract. Some older catalog prose describes
  HMAC: that is fixture-only, not production configuration.

## Wire-level connection map

These paths come from the reviewed source. DGFY customer routes below still
require customer-authorization qualification; they are not declared public.

| Caller → receiver | Method/path | Required effect |
| --- | --- | --- |
| DGLaundry → DGFY | POST `/api/v1/integrations/dglaundry/events` | Persist verified event, update sanitized projection exactly once |
| Customer UI → DGFY | GET `/api/v1/dgfy/laundry/catalog` | Published selected-location catalog only |
| Customer UI → DGFY | GET `/api/v1/dgfy/laundry/availability` | Selected-location bookability and public schedule |
| Customer UI → DGFY | POST `/api/v1/dgfy/laundry/quotes` | Server-priced quote with expiry, never browser price authority |
| Customer UI → DGFY | POST `/api/v1/dgfy/laundry/orders` | Owner-bound submission; no paid-order bypass |
| Customer UI → DGFY | GET/PATCH `/api/v1/dgfy/laundry/orders/:externalOrderReference` | Owner-scoped status/allowed changes |
| Customer UI → DGFY | POST `/api/v1/dgfy/laundry/orders/:externalOrderReference/cancel` | Eligible cancellation plus payment reconciliation |
| DGFY → DGLaundry | POST `/api/v1/integrations/dgfy/quotes` | Calculate centavos/grams, reserve relevant stock |
| DGFY → DGLaundry | POST `/api/v1/integrations/dgfy/booking-groups/prepare` | Prepare fixed/per-kilo child with immutable references |
| DGFY → DGLaundry | POST `/api/v1/integrations/dgfy/events` | Submit, cancel, receipt confirmation and qualified update/payment events |
| DGFY → DGLaundry | POST `/api/v1/integrations/dgfy/order-projections/resolve` | Reconcile child/group tracking without exposing private records |

Payment route: `apps/dgfy-api/src/routes/commercePayments.js` declares POST
`/dglaundry/booking-groups/payment-sessions`; confirm its mount prefix in
`src/server.js` and customer-safe tenant context before wiring the browser.
The route's current `requireTenantContext` is not proof of public checkout.
DGLaundry `booking-groups/:id/convert` and `:id/cancel` require local staff
principal/capabilities; never call them from the customer browser or ship a
staff session to DGFY. Use the signed cancellation contract for provider work.
Do not expose the internal `/materialize` route to customers.

## Shop configuration and publication contract

DGFY owns the public handle assignment/global uniqueness and company identity.
DGLaundry supplies mapped operational branch/catalog/settings projections.
Use immutable company→organization and location→branch IDs. Handles route to
an already published shop; they never grant identity or order ownership.

| Configuration | Required customer behavior and verification |
| --- | --- |
| Business mode/approval | Approved laundry company uses DGLaundry operations; no automatic IMS/POS activation |
| Public URL request | Optional organization handle is normalized and validated; DGFY returns assigned handle or conflict; refresh/restart preserves result |
| Branch lifecycle/mapping | Active, ready, explicitly mapped branches publish; setup/unmapped/archived branches do not appear or accept orders |
| `onlineOrderingEnabled` | Independent from visibility; default off for newly published branches; visible shop can show booking unavailable |
| Shop name, description, logo/cover, contact | Identify authoritative source per field; propagate changes and deletions; never overwrite identity from unsigned input |
| Address/map pin | Show selected mapped location and agreed service coverage; handle missing pin without invented coordinates |
| Hours/timezone/slots | Render local business time, closed days and delivery/pickup windows; revalidate at quote/submit |
| Catalog/variants/options | Preserve stable IDs, fixed/per-kilo mode, permitted service inputs, minimums/increments, duration, price and ordering |
| Media | Preserve ordered primary/gallery images and deletions; only safe customer-accessible media, no private proof-storage URLs |
| Stock/availability | Display public bookability; reserve/revalidate at selected branch; never leak raw stock, costs or machine/staff data |
| Fees/taxes/discounts | Define owner and quote fields; show exact server-calculated total; unsupported options remain unavailable |
| Cache | Apply newer versions, invalidate shop/catalog/map caches, retain tombstones; reject stale checkout even if a page is cached |

Test edits in DGLaundry Settings/catalog against the actual DGFY page after
refresh, branch switch and service restart. An event stored in DGFY without
a corresponding UI change does not pass this contract.

## Order and money lifecycle

- Fixed: DGLaundry prepares the quote/reservations; DGFY creates its payment
  session from that immutable snapshot. Only verified provider payment state
  finalizes one signed `dgfy.laundry_order.submitted.v1`. Browser redirects
  never mark a booking paid. A paid-but-undelivered event stays recoverable.
- Per-kilo: show reservation/estimate clearly; final weight is measured by
  authorized laundry staff. No invented final online charge. Attendant
  conversion records grams and local counter payment using the local contract.
- Mixed: maintain shared group/tracking references and distinct child/line
  references. Charge the fixed child online once; retain per-kilo reservation
  for counter conversion. Display both child states and separate amounts.
- On submission, prove the order appears in the correct DGLaundry branch,
  transaction/work-order/service-job views and survives restart. Retried
  submissions/payment webhooks must not duplicate work, charges or stock use.
- Cancel/expiry/rejection releases reservations through a durable retry path.
  DGFY owns online refund/void decisions and ledger; DGLaundry cannot refund
  that payment. A transport error must not silently discard cleanup work.
- DGLaundry emits accepted/rejected, per-line progress, aggregate status and
  fulfillment events. DGFY updates customer history, notifications and tracking
  without leaking staff, machines, internal holds/notes or private proof media.
- `dgfy.laundry_order.receipt_confirmed.v1` is bound to the authenticated order
  owner or approved guest capability. Group confirmation waits for every
  required child; duplicates have one effect. Display confirmation failure
  honestly instead of declaring the laundry job complete prematurely.
- Counter activities remain distinct from online payments. Guest claiming is
  DGFY-owned with explicit proof; never match ownership by email/phone/name.

## Security, retry and configuration acceptance

Record the exact method, path, body schema, error code, timeout, retry policy,
key ID and scopes for each hop. Keys remain private to their signer; exchange
only verification public keys and secure secret references. Validate digest,
signature, authority/path, timestamps, nonce replay, wrong key and overlapping
rotation. Bind customer mutations to account/guest capability, company,
location, external reference and request content. Changed payload with reused
idempotency key must conflict; restart must preserve that protection.

DGFY flags include `DGLAUNDRY_BOOKING_PAYMENTS_ENABLED`,
`DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH`, and
`DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES`. A disabled-list alone must not
admit an unqualified new branch: verify the approved mapping/readiness allowlist
at the server. Keep Stage B dark until every activated branch passes.

## Team completion checklist

- [ ] DGFY API owner records implemented routes, auth/mapping contract and exact deployed SHA; closes the customer-versus-merchant authorization gap.
- [ ] DGFY storefront owner attaches desktop/mobile evidence of listing → selected branch → options → quote → checkout → history → tracking → receipt confirmation.
- [ ] DGFY payments owner proves sandbox paid/failed/expired/refund, duplicate webhook and paid-during-outage recovery with no double charge.
- [ ] DGLaundry owner proves settings publication, fixed/mixed/per-kilo intake, updates/refunds, staff conversion, progress and completion against the same contract fixtures.
- [ ] Both owners test wrong customer/company/branch, unpublished shop, ordering off, stale catalog, expired quote, replay, reordered events, restart and bounded redrive.
- [ ] Both owners reconcile IDs, centavos, grams, versions and status at each hop; attach redacted request/result evidence and named unresolved blockers.
- [ ] Record customer-ready, API-ready, provider-ready and production-ready separately. Every unresolved contract mismatch keeps its affected feature disabled.
- [ ] After hosted readiness and explicit payment activation, qualify one approved company/branch with a controlled low-value payment/refund and rollback before expansion.

Return results in the linked PR/issue using:
`flow | owner | DGFY SHA | DGLaundry SHA | environment | test/evidence | pass/fail | blocker`.
The DGFY team can implement and release its side independently; this handoff
does not authorize accessing Surebizcorp, editing DGLaundry's database or
sharing production credentials. Deployment remains separately tracked.
