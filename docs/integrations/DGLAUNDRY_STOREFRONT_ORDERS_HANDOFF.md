---
status: draft_pr
authority_level: implementation_handoff
owner: DGFY commerce/integration
applies_to: codex/dglaundry-storefront-orders
---

# DGLaundry storefront-orders handoff (stacked PR2)

This branch is intentionally stacked on `codex/dglaundry-provider-foundation`
and must not be merged until PR1 is merged to `develop`. After PR1 lands,
rebase/rebuild this branch on the refreshed `origin/develop`, rerun the
terminal checks, and only then retarget the PR to `develop`.

## What is implemented

- DGFY-owned catalog, availability, order, event-inbox, and idempotency tables.
- Signed DGLaundry event receiver at
  `POST /api/v1/integrations/dglaundry/events`.
- Sanitized catalog/media, availability, order tracking, customer activity,
  and notification projections; internal machines, staff, holds, register
  data, credentials, and private notes are not persisted.
- Duplicate event protection, monotonic aggregate versions, stale-event
  suppression, version-gap quarantine, dead-letter metadata, and mapping
  checks.
- DGFY quote/submit/update/cancel forwarding with explicit references and
  idempotency keys.
- DGFY-originated orders are bound at submit time to the authenticated,
  immutable `dgfy_account_id`. Reads, updates, and cancellations require that
  same account plus the mapped company/location scope. Provider- and
  counter-originated projections remain unowned and cannot be claimed by a
  customer by guessing an external reference. Email, name, slug, and shared
  company membership are never used as ownership evidence.

The ownership column is added by migration
`20260906000001-add-dglaundry-order-ownership.cjs`. It is nullable by design
for provider/counter events and is preserved during inbound status/progress/
fulfillment upserts. A submit creates a pending owner-bound projection before
the signed provider request, so a retry after an outage cannot be claimed by a
different account.

## Required configuration

Mount `DGLAUNDRY_PARTNER_BASE_URL`, `DGLAUNDRY_INTEGRATION_SECRET` and
`DGLAUNDRY_INTEGRATION_KEY_ID` only for local/sandbox HMAC fixtures. Production
must set `DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1`, mount the
provider verification public key and DGFY signing private key from the secret
manager, and use the separate `DGLAUNDRY_PARTNER_TOKEN` as applicable. Never
place these values in source, browser storage, or a shared database.

## Qualification still required

- MySQL migration/restart/concurrency tests for the new inbox and projection
  tables.
- Cross-repository signed catalog, availability, quote, order, replay,
  out-of-order, dead-letter/redrive, outage, and wrong-branch scenarios.
- Cross-account order access tests covering owner success, same-company
  account denial, wrong-branch denial, duplicate retries, and unowned
  provider projections.
- Responsive storefront integration against the customer
  `dgfy.ph/tenant-store/<handle>` URL.
- Provider sandbox/hosted evidence and the approved-branch readiness matrix.

Passing local tests means “DGFY storefront-orders implementation ready for
review”; it is not provider, hosted, or production authorization.
