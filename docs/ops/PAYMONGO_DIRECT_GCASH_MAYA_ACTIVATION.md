---
status: authoritative
owner: payments_operations
last_reviewed: 2026-08-25
applies_to: paymongo_direct_gcash_maya_production
---

# PayMongo Direct GCash and Maya Production Activation

This runbook is for the project manager or infrastructure operator with access to the production
Linode environment and the live PayMongo dashboard. It covers the *additional* activation steps
needed on top of the existing PayMongo Hosted Checkout / QR Ph setup
(`docs/ops/PAYMONGO_PRODUCTION_ACTIVATION.md`, `PaymongoConfig.md`) to turn on **direct GCash** and
**direct Maya** — a Payment Intent + provider-authorization flow that skips PayMongo Hosted
Checkout for those two wallets specifically. Never paste live keys into source control, chat,
screenshots, or frontend environment files.

## 0. Prerequisite — do not start until this is true

This runbook covers [#679](https://github.com/Sieitzz/dgfy-platform/issues/679), implemented in
PR [#681](https://github.com/Sieitzz/dgfy-platform/pull/681). As of this writing that PR is
**draft**, unreviewed, and only targets `develop`. None of the steps below are executable — the
flags and code paths they reference do not exist in production — until:

1. PR #681 is reviewed (`pr-reviewer`, or a manual review) and merged into `develop`.
2. It is promoted `develop → release/<label> → main` (the default since ADR 0074/#980,
   2026-08-25 — a `develop → staging → main` soak is also fine, as an optional per-batch route
   under the same policy) per `docs/ops/RELEASE_CANDIDATE_POLICY.md`, and actually deployed via a
   `deploy-main.yml` dispatch.

Confirm the merge commit is live in production (`/health`, and the release SHA) before proceeding
to section 1.

## 1. PayMongo account-side activation (new — Hosted Checkout never needed this)

Direct GCash/Maya use PayMongo **Payment Intents restricted to `gcash` or `paymaya`**, attached
from a browser-created Payment Method using the account's public/client key — a different API
surface from Hosted Checkout. Request from PayMongo, for the live DGFY merchant account:

- GCash enabled as a direct payment source for Payment Intents (independent of whatever wallet
  support already backs Hosted Checkout/QR Ph).
- Maya (PayMaya) enabled as a direct payment source for Payment Intents.

These can be activated independently — the two feature flags below are independent, so it's valid
to enable only GCash first, verify it, then enable Maya later (or vice versa). Confirm activation
is visible in the PayMongo dashboard before flipping either `*_LIVE_CONFIRMED` flag in section 3.

## 2. No new webhook configuration needed

Direct GCash/Maya still finalize an order only through the existing signed `payment.paid` /
`payment.failed` webhook already configured for QR Ph
(`PaymongoConfig.md` section 2, `https://dgfy.ph/api/v1/commerce-payments/paymongo/webhook`). The
browser return from PayMongo authorization is explicitly non-authoritative — it never marks an
order paid. There is nothing to add or change in the PayMongo dashboard's webhook screen for this
feature. If the existing live webhook and its events (`payment.paid`, `payment.failed`,
`qrph.expired`, `payment.refund.updated`, `payment.refunded`) are already configured and working,
skip straight to section 3.

## 3. Production backend environment

Add to `/opt/dgfy-platform/.env` on the production Linode host (the current plaintext secrets
mechanism — see `docs/ops/DEPLOYMENT_GUIDE.md`; the SOPS/age cutover in ADR 0060 is still draft and
not yet in effect, so this is a plain edit of that file, not a `sops` operation):

```dotenv
# Direct GCash is opt-in and independent of direct Maya below.
# Live mode additionally requires the explicit confirmation flag.
STOREFRONT_DIRECT_GCASH_ENABLED=true
STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true

# Direct Maya is opt-in and independent of direct GCash above.
# Live mode additionally requires the explicit confirmation flag.
STOREFRONT_DIRECT_MAYA_ENABLED=true
STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED=true
```

Set only the pair(s) for the wallet(s) actually activated in section 1 — leave the other wallet's
`*_ENABLED` at `false` (or omitted) until it's ready. Setting `*_ENABLED=true` in live mode without
setting the matching `*_LIVE_CONFIRMED=true` is a **hard startup failure**, not a silent no-op —
the backend's production environment validation rejects it explicitly
(`apps/dgfy-api/src/config/productionEnvValidation.cjs`).

**Confirm, don't re-source, these already-required values** — they should already be set from the
existing Hosted Checkout/QR Ph activation (`docs/ops/PAYMONGO_PRODUCTION_ACTIVATION.md` section 2);
direct GCash/Maya reuses them as-is:

```dotenv
PAYMONGO_MODE=live
PAYMONGO_LIVE_PUBLIC_KEY=pk_live_...     # already required for Hosted Checkout — confirm present
PAYMONGO_LIVE_SECRET_KEY=sk_live_...     # already required — confirm present
PAYMONGO_LIVE_WEBHOOK_SECRET=whsk_...    # already required — confirm present
```

If any of the three above is missing, direct GCash/Maya is not the cause — Hosted Checkout would
already be broken in production. Fix that first via
`docs/ops/PAYMONGO_PRODUCTION_ACTIVATION.md` before proceeding.

## 4. Restart and validate

1. Restart the backend container(s) so the new environment values are picked up.
2. Confirm production environment validation passes (the backend fails closed at startup if a
   `*_ENABLED` flag is `true` in live mode without its matching `*_LIVE_CONFIRMED` flag — check
   startup logs for `STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED=true is required...` or the Maya
   equivalent if this fires unexpectedly).
3. Confirm `/health` returns healthy.

No database migration is required for this feature — do not run one.

## 5. Controlled live canary

Run independently for each wallet actually enabled. Do not skip straight to a real customer order.

1. Create a Storefront order and select GCash (or Maya).
2. Confirm the customer is redirected to the **PayMongo/GCash (or Maya) provider authorization
   screen** — not a PayMongo Hosted Checkout page. This is the one behavior change to visually
   verify; everything else reuses the existing payment pipeline.
3. Complete the payment with a real low-value amount.
4. Confirm PayMongo sends one signed `payment.paid` webhook and the delivery returns HTTP 2xx.
5. Confirm the Storefront order becomes paid and appears exactly once in POS.
6. Confirm settlement is `on_hold` before POS completion, and moves to `pending` after — same
   behavior as the existing QR Ph flow (`PaymongoConfig.md` section 6).
7. Trigger (or wait for) a duplicate webhook delivery and confirm it does not duplicate the
   payment, order, or revenue record.
8. Repeat for the second wallet if both were enabled together.

If a canary step fails, do not proceed to enabling the other wallet — go straight to section 6.

## 6. Rollback

Rollback is a flag flip, not a deploy or code revert:

```dotenv
STOREFRONT_DIRECT_GCASH_ENABLED=false
STOREFRONT_DIRECT_MAYA_ENABLED=false
```

Restart the backend. The corresponding wallet(s) fall back to PayMongo Hosted Checkout immediately.
No migration, redeploy, or PayMongo dashboard change is needed to roll back. Existing payment
sessions already in flight remain governed by their stored provider state and are unaffected.

## 7. Completion checklist

- [ ] PR #681 merged and deployed to `main` (section 0)
- [ ] PayMongo live GCash direct-payment activation confirmed (section 1)
- [ ] PayMongo live Maya direct-payment activation confirmed (section 1), if enabling Maya
- [ ] Existing live webhook endpoint/events confirmed unchanged and working (section 2)
- [ ] `STOREFRONT_DIRECT_GCASH_ENABLED` / `STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED` set, if enabling
      GCash (section 3)
- [ ] `STOREFRONT_DIRECT_MAYA_ENABLED` / `STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED` set, if enabling
      Maya (section 3)
- [ ] `PAYMONGO_LIVE_PUBLIC_KEY` / `PAYMONGO_LIVE_SECRET_KEY` / `PAYMONGO_LIVE_WEBHOOK_SECRET`
      confirmed already present (section 3)
- [ ] Backend restarted and `/health` passed (section 4)
- [ ] Live GCash canary passed, redirected to provider authorization not Hosted Checkout
      (section 5), if enabling GCash
- [ ] Live Maya canary passed, redirected to provider authorization not Hosted Checkout
      (section 5), if enabling Maya
- [ ] Duplicate webhook protection verified for each enabled wallet (section 5)
- [ ] Rollback path confirmed understood (section 6)
- [ ] Project Manager recorded production evidence
