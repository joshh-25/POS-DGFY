---
status: draft
authority_level: reference
owner: engineering
last_reviewed: 2026-08-31
applies_to: apps/dgfy-storefront
topic: downpayment_nonrefundable_terms
terms_version: downpayment-nonrefundable-v1
effective_date: 2026-08-31
legal_review_status: pending (#280)
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
---

<!--
GENERATED, DO NOT EDIT THE BODY BY HAND.
Source of truth: apps/dgfy-storefront/src/shared/model/downpaymentTermsDocument.js
Regenerate: see the sync test at apps/dgfy-storefront/src/__tests__/downpaymentTermsDocument.test.js
DRAFT: not reviewed by a lawyer. Does not close #280.
-->

# Non-refundable downpayment terms

> Draft wording, pending formal legal review. These terms describe how this store currently handles non-refundable downpayments. They have not yet been reviewed by a lawyer and may change.

Version: `downpayment-nonrefundable-v1` | Effective: 2026-08-31

## What you are paying now

A downpayment is a part-payment of your order total, taken now to reserve your order. It is not an extra fee, and it is not a separate charge on top of the order total.

The remaining balance is due when your order is delivered or picked up, as shown at checkout.

## Why this downpayment is non-refundable

This store has marked its downpayment non-refundable. Once you pay, the store begins reserving stock, scheduling, or preparing your order for you specifically, and that commitment has a cost the store cannot recover.

This applies only where the checkout screen tells you the downpayment is non-refundable, at the moment you pay. It does not apply retroactively: if the store changes this setting later, the terms shown to you when you paid are the terms that govern your order.

## If you cancel your order

If you cancel after paying the downpayment, the store keeps the downpayment. You are not charged anything further, and the remaining balance is never collected.

Only the downpayment amount is affected. The store never keeps, and never charges, the full order total for a cancelled order.

## When you still get your money back

If the store rejects or cancels your order for any reason -- including being unable to fulfil it, running out of stock, or closing -- your downpayment is refunded in full. This is true even though the downpayment is marked non-refundable.

If your payment is charged but the order is never actually placed, that payment is refunded in full.

## How refunds are returned

Refunds are returned to the payment method you used. How long that takes depends on your bank or e-wallet provider, and is outside the store’s control.

## Questions or disputes

Contact the store directly using the contact details on your order confirmation. If you believe a downpayment was kept in error, raise it with the store first -- most cases are a store-side cancellation, which is always refunded.

## Version of these terms

These are version downpayment-nonrefundable-v1, effective 2026-08-31. The version shown to you at the time you pay is the version that applies to your order.
