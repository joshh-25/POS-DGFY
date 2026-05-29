---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-05-29
applies_to: dgfy_reviews, storefront_fnb_item_detail, storefront_tracking
topic: fulfilled_guest_item_reviews
---

# ADR 0024: Fulfilled Guest Item Reviews For Storefront Menu Details

## Context

ADR 0023 governs the front-facing DGFY customer account and currently treats customer reviews as account-gated and purchase-gated. The storefront now needs an additive item-level `Reviews & Ratings` section on F&B menu detail pages plus a low-friction fulfilled-order review path for guest checkout users. The release must remain localized: no storefront shell redesign, no reply system, and no account-history redesign.

This ADR composes with ADR 0023 rather than replacing it. Signed-in customer reviews remain owned by the DGFY account/history flow; guest review invites are a separate fulfilled-order tracking path for customers who checked out without signing in.

## Decision

1. Public storefront menu detail pages may display approved item-level reviews for `target_type = fnb_item`.
2. Review submission remains purchase-gated, but the write path expands from account-only to fulfilled guest-token submission for this rollout.
3. Guest review submission is allowed only after fulfillment terminal states:
   - delivery: `completed` / delivered
   - pickup: `completed` / picked up
4. Review entry for guests is issued per fulfilled activity target through a landlord-scoped review invite token.
5. Review invite links must resolve to the exact F&B item detail page, not a generic review page.
6. Submitted guest reviews remain `pending` by default and continue through the existing moderation workflow.
7. Guest invite tokens are single-use for review submission; submitted, revoked, expired, and duplicate target attempts must be rejected.
8. Merchant replies stay out of scope for this release.
9. Signed-in review history and review management stay out of scope for this release.

## Consequences

1. Storefront item pages gain trustworthy public review content without requiring account adoption for all browsing users.
2. Guest checkout users can review fulfilled items without creating a DGFY account, but only through issued review invites.
3. The canonical review subsystem remains the DGFY review module; no parallel storefront review store is introduced.
4. Tracking/completion flows become the primary review-conversion surface for fulfilled orders.
5. Account history remains the primary signed-in customer surface and must not be mutated by guest invite validation.

## Validation

Required validation for this flow:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. Backend DGFY review tests for public item summaries, invite validation, fulfilled guest submission, duplicate rejection, and moderation compatibility
4. Storefront F&B detail tests proving the review section is additive and deep-link review intent works without breaking existing product detail layout
5. Tracking/order storefront tests proving fulfilled review entry appears only for completed delivery or pickup states
