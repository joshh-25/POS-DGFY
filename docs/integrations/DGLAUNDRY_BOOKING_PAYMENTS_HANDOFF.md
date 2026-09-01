---
status: draft_pr
authority_level: implementation_handoff
owner: DGFY payments/integration
applies_to: codex/dglaundry-payments-hosting
---

# DGLaundry booking payments and hosting handoff (stacked PR3)

This branch is stacked on `codex/dglaundry-storefront-orders` and must not be
merged until PR1 and PR2 have landed in that order. Once PR2 lands, rebuild
this branch from the refreshed `origin/develop`, rerun all terminal checks, and
retarget this PR to `develop`.

## Implemented in this draft

- Additive `dglaundry_booking` payment-session target and migration.
- Dark feature flag (`DGLAUNDRY_BOOKING_PAYMENTS_ENABLED`), global kill switch,
  and comma-separated disabled-branch switch.
- Fixed, per-kilo, and mixed booking preparation; only the fixed child creates
  a PayMongo QR Ph session, while per-kilo remains an explicit reservation for
  authenticated attendant conversion.
- Immutable quote/reservation/payment snapshots in the landlord session.
- Paid finalization emits one idempotent signed
  `dgfy.laundry_order.submitted.v1` event to DGLaundry.
- PayMongo failure/expiry releases explicit reservations; successful refunds
  emit a payment-status event for the provider reconciliation path.
- DGFY remains the online payment authority, collects without PayMongo split,
  and retains the session/refund ledger. Counter tenders remain DGLaundry-owned.

## Required production configuration and hosting

Keep DGFY and DGLaundry on separate runtimes, databases, Redis instances,
storage, service identities, secrets, backups, and internal networks. The
Nginx edge may join only the external `dgfy-dglaundry-edge` network and route
`laundry.dgfy.ph` to the DGLaundry gateway; do not join either private
application network or database.

Set the booking flag only after the approved-branch list, provider sandbox,
PayMongo sandbox, hosted callback, and refund/receipt evidence are complete.
Production requests must use the asymmetric HTTP Message Signature profile;
local HMAC is test-only. Mount signing keys and partner tokens from the secret
manager and rotate any credential that was ever exposed to a developer shell.

## Qualification still required

- Real MySQL migration/restart/concurrency checks and payment-session refund
  reconciliation.
- PayMongo sandbox payment, expiry, cancellation, refund, and receipt evidence.
- Cross-repository event delivery with provider outage, retry, duplicate, and
  redrive coverage.
- Nginx same-host-but-isolated network preflight and dark deployment.
- Freeze and independently validate every approved branch, run one controlled
  low-value production payment/refund/receipt, then enable all approved
  branches together only with explicit human approval.

Local tests and a draft PR do not authorize production credentials, merging,
or deployment.
