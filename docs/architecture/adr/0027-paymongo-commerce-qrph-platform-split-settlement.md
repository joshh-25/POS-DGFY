---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-05-19
last_reviewed: 2026-06-08
review_by: 2026-11-19
applies_to: storefront_commerce_payments
topic: paymongo_qrph_platform_split_settlement
---

# ADR 0027: PayMongo QR Ph Commerce Payment Sessions and Platform Split Settlement

## Status
Accepted (2026-05-19)

## Context
ADR 0012 defines a mandatory `DGFY convenience fee` equal to `round4(gross_subtotal * 0.01)` for POS and Storefront checkout. Storefront online checkout now needs an online payment handoff that collects the full customer total and automatically routes that 1% platform fee to the DGFY PayMongo account while routing the remaining net amount to the tenant merchant wallet.

## Decision
1. Storefront QR Ph uses commerce payment sessions, not subscription `/payments/*` billing routes.
2. QR Ph checkout uses PayMongo dynamic QR Ph through the Payment Intent workflow.
3. Payment sessions are landlord-owned so PayMongo webhooks can resolve the tenant before touching tenant databases.
4. Tenant PayMongo child merchant readiness is tracked in `tenant_payment_accounts`.
5. `commerce_payment_sessions` stores immutable pricing, PayMongo IDs, QR image URL, split payload, webhook status, and final order linkage.
6. The DGFY platform split uses a fixed centavo amount equal to the stored `service_fee_amount`; `percentage_net` is not used for the 1% because it is based on net settlement after provider fees.
7. Product/F&B Storefront orders are finalized only after PayMongo confirms `payment.paid`. Expired/failed QR Ph sessions do not create orders.
8. If payment succeeds but order finalization or split allocation fails, the session enters a manual-resolution status instead of silently treating settlement as successful.
9. Refund submission may reserve refundable balance as `refund_pending`, but it must not mark a tenant order as `partial_refunded` or `refunded` until PayMongo reports a terminal successful refund state through the API response or webhook.
10. Refund webhooks must reconcile by PayMongo refund ID before falling back to session metadata because refund resources are not guaranteed to carry the original commerce session metadata.
11. Settlement reporting in this app may compute stored gross, fixed DGFY split, estimated tenant gross, refund exposure, and reconciliation variance from local records. It must not represent PayMongo provider fees or payout status as final truth until PayMongo reporting/payout data is integrated.
12. Sandbox certification must distinguish app-verifiable checks from external PayMongo evidence. Config/signature/payload-shape checks can be automated; QR payment completion, child merchant activation, split acceptance, and refund shoulder allocation require real PayMongo sandbox evidence.
13. Tenant readiness may not be set active or enabled for QR Ph/split/charges unless `tenant_payment_accounts.metadata` includes a PayMongo verification reference and verification timestamp.
14. Split/charge readiness also requires enabled-wallet evidence (`wallet_status=enabled` and `wallet_verified_at`) because wallet state affects settlement readiness and PayMongo payment-method eligibility.
15. If the platform uses PayMongo parent-account operations on behalf of child accounts, child-account webhook endpoint registration must be verified because PayMongo documents that those webhook events are delivered to the child account webhook endpoint.
16. PayMongo API calls use the documented unified `https://api.paymongo.com/v1` base URL for both test and live keys unless `PAYMONGO_API_BASE_URL` is intentionally overridden for a verified PayMongo environment.
17. Landlord commerce payment tables use UUID `tenant_id` values to match `tenants.id`; readiness APIs and reporting filters must not coerce tenant IDs to integers.
18. Webhook signature verification is enforced by default, must use the raw request body, and must reject stale timestamps outside the configured tolerance.
19. The DGFY platform fee contract is explicit: the 1% is computed from item subtotal only, is added to the customer's checkout total, and is not computed from PayMongo net settlement.
20. PayMongo/provider processing, payout, bank, dispute, and related provider fees are the tenant/company responsibility and reduce the tenant/company net settlement unless a separate signed PayMongo/provider contract states otherwise.
21. DGFY must not be modeled as holding seller funds. PayMongo handles collection, wallet/settlement movement, split routing, and payout rails; the app stores local evidence and requests provider operations.
22. Full refunds reverse the payment according to the stored split/refund policy: the DGFY 1% and tenant/company share are both returned through PayMongo refund/split-refund behavior, subject to provider status reconciliation.
23. Tenant PayMongo child merchant creation may be initiated after tenant database provisioning, but customer-visible QR Ph must remain disabled until PayMongo activation/readiness evidence is recorded by webhook or operator evidence.

## Consequences
1. ADR 0012 remains the pricing source of truth; this ADR governs settlement and provider handoff.
2. `PAYMENTS_ENABLED=false` can continue disabling SaaS subscription billing while `COMMERCE_PAYMENTS_ENABLED=true` enables Storefront commerce payments independently.
3. Tenant onboarding must capture and verify PayMongo child merchant IDs before QR Ph is offered to customers.
4. Refunds and failed splits require provider-aware reconciliation, not simple order cancellation.
5. Admin readiness controls are an operational fallback until PayMongo hosted/API onboarding and capability sync are implemented; setting readiness manually is not provider verification.
6. Production go-live remains blocked until PayMongo sandbox evidence covers dynamic QR payment confirmation, split settlement, refund behavior, and child merchant readiness.
7. Manual readiness setup is now evidence-gated, but it remains a bridge until PayMongo hosted/API onboarding and automated capability sync are implemented.
8. Wallet readiness is now part of the go-live contract; manual child-merchant readiness without enabled-wallet evidence is not sufficient for split/charge checkout.
9. Terms and conditions must disclose the customer-paid DGFY 1% platform fee and tenant/company responsibility for PayMongo/provider fees before company registration and checkout enablement.
10. Tenant onboarding automation can reduce manual dashboard entry, but PayMongo account activation, KYC/requirements due, wallet status, and live-payout readiness remain provider-controlled external facts.

## Original Scope Evaluation Backlog
The following items are considered part of the original PayMongo QR Ph commerce-payment program for completion evaluation, even when delivered in later implementation slices:

1. **Refunds and reversals**: add full, partial, and failed-finalization refund flows that reconcile PayMongo refund status, split reversal behavior, DGFY fee treatment, tenant order status, and audit logs before exposing any customer/operator refund action.
2. **Tenant PayMongo onboarding**: add platform-admin or tenant-admin onboarding screens and sync jobs for PayMongo child merchant creation/status, requirements due, QR Ph readiness, split readiness, charge readiness, and safe disabling.
3. **Services and reservation payments**: extend QR Ph sessions to Services, F&B reservations, and Hospitality reservations only after the payment session binds to a valid hold token or equivalent reservation lock.
4. **Payment reconciliation dashboard**: add an operator view for `awaiting_payment`, `paid`, `finalized`, `failed`, `expired`, and manual-resolution sessions with filters, provider IDs, split metadata, final order links, and evidence export.
5. **Webhook replay and finalization retry**: add idempotent admin retry controls for paid sessions that failed local order finalization, with duplicate-order prevention and immutable replay audit events.
6. **Settlement and fee reporting**: add tenant/DGFY settlement ledgers and exports that show gross amount, provider fees when available, DGFY fixed 1% split, tenant transfer target, payout status, and reconciliation variance.
7. **PayMongo sandbox certification tests**: add credential-backed sandbox validation for QR Ph creation, expiration, `payment.paid`, split payload acceptance, webhook signature verification, and refund/split-refund behavior.
