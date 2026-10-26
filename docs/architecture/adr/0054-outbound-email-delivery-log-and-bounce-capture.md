---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-08-07
last_reviewed: 2026-10-25
review_by: 2027-04-25
applies_to: email_delivery, auth, tenant_registration, dgfy_accounts, platform_invoicing
topic: outbound_email_delivery_log_and_bounce_capture
supersedes_in_part: docs/architecture/adr/0021-email-otp-verification-for-account-email-ownership.md
---

# ADR 0054: Outbound Email Delivery Log And Bounce Capture

## Status

Accepted (2026-08-07)
Amended (2026-10-25): storefront order confirmation delivery and presentation; see Amendments.

## Context

`emailService.sendEmail()` has always treated SMTP acceptance as success:
nodemailer's `accepted`/`rejected`/`response`/`messageId` were returned to
the caller but never persisted, and a downstream rejection was invisible
from our side. This is exactly why the Yahoo/iCloud DMARC failures in #135
went unnoticed for as long as they did — the backend logged "sent
successfully" for every message regardless of what happened after the relay
accepted it. `EmailOtp.delivery_status`/`delivery_error` existed but were
only ever written for OTPs at send time, and covered a synchronous send
failure only, not a downstream bounce.

Issue #279 also flagged a related decision: `sendEmailViaBrevoApi` — the
HTTPS API fallback used when outbound SMTP ports were blocked — was live
code exercising zero production traffic (production had moved to Namecheap
SMTP per #135's Decision), and being unauthenticated for our sending domain
it would have failed DMARC the same way SMTP could. Keeping two delivery
paths would have meant instrumenting both.

## Decision

1. **Remove the Brevo HTTPS API fallback entirely** (`sendEmailViaBrevoApi`,
   `isBrevoApiConfigured`, `buildBrevoRecipients`,
   `normalizeAttachmentsForBrevo`, the `brevo_api` and
   `smtp_with_brevo_api_fallback` branches of `getEmailProviderMode()`, and
   the `BREVO_API_KEY`/`BREVO_API_URL`/`EMAIL_DELIVERY_PROVIDER`/
   `EMAIL_DELIVERY_FALLBACK_TO_BREVO_API` env vars). `sendEmail()` has a
   single delivery path — SMTP or an `EMAIL_NOT_CONFIGURED` throw — with
   **no fallback on failure**. This amends ADR 0021 Decision 9, which named
   the Brevo fallback as an OTP delivery option.
2. **Every outbound send is recorded**, not just OTPs. A new landlord-scoped
   `email_delivery_logs` table (`EmailDeliveryLog` model, registered in
   `NON_TENANT_MODEL_EXPORTS`) is written by `sendEmail()` itself for every
   caller — OTPs, invoices, invitations, cashier credentials, billing
   reminders — capturing `accepted`/`rejected`/`response`, classifying the
   attempt as `sent`/`partial`/`failed`, and alerting on failure.
   `tenant_id` has no foreign key: deliverability history (which domains
   bounce, whether a provider rejects us) must survive tenant deletion, and
   most sends have no tenant context at all.
3. **Correlation is a self-generated Message-ID.** `sendEmail()` generates
   the delivery log row's UUID before attempting the send and embeds it in
   the outgoing `Message-ID` header (`<id@domain>`) plus a redundant
   `X-DGFY-Delivery-Id` header, rather than relying on the SMTP envelope
   sender (`MAIL FROM`) being predictable — authenticated relays commonly
   rewrite the envelope sender to the authenticated mailbox, which may not
   be the address a bounce-reply mailbox is actually watching.
4. **Async bounce capture is additive, not primary.** A synchronous
   rejection (e.g. a DMARC block at SMTP time, the actual shape of #135) is
   already visible from `sendMail()`'s `rejected`/`response` once Decision 2
   above records it. A scheduled IMAP poller against a bounce mailbox
   parses RFC 3464 delivery-status notifications, correlates them back to a
   log row by the embedded UUID, and flips `status` to `bounced`/`deferred`
   with a reason — covering bounces that only surface after acceptance.
   Idempotency is enforced at the database layer
   (`bounce_reported_at IS NULL` guard), not by IMAP message state, so a
   reprocessed or out-of-order DSN is a safe no-op.
5. **No email body is ever stored.** `sendCashierCredentialEmail` puts a
   temporary password in its body and `sendEmailOtpCode` puts the OTP code
   in its body; `email_delivery_logs` stores a truncated subject only, never
   `html`/`text`.
6. **Recipient PII is bounded.** `recipient_email` is nulled by a scheduled
   retention job after a configured window; `recipient_email_hash` and
   `recipient_domain` are retained so per-address and per-domain
   deliverability analysis (the "yahoo.com: 0 sent / 41 failed" query that
   would have surfaced #135 immediately) still works after redaction.
7. **Failures alert, not just log.** A new `operationalAlertService` raises
   a throttled (per-key, so an outage doesn't produce one alert per email)
   Sentry capture on send failure, partial rejection, or a confirmed bounce
   — the first place in the codebase that calls `Sentry.captureException`
   directly, since email failures were previously swallowed by their
   callers before ever reaching the Express error handler.

## Consequences

1. A downstream delivery failure is now visible from three places: the
   `email_delivery_logs` table directly, an admin-only delivery monitor
   view, and a Sentry alert — instead of only a log line indistinguishable
   from a success.
2. There is exactly one delivery path. A production SMTP outage now fails
   loudly (throw + alert) rather than silently retrying through a second
   provider that would likely fail the same way.
3. Deliverability history survives tenant deletion and is queryable by
   domain, which is what would have caught #135 without needing a manual
   Brevo events-API investigation.
4. The deliverability blind spot is only partly closed: DSN capture only
   sees bounces the receiving MTA actually returns. Silent drops and
   spam-foldering remain invisible; only a feedback-loop subscription or
   seed-list testing would close that remaining gap, and neither is in
   scope here.
5. A new operational dependency: the bounce poller needs IMAP credentials
   for a mailbox that actually receives DSNs for outbound mail, which is
   not necessarily `noreply@dgfy.ph` — authenticated relays often rewrite
   the envelope sender to the SMTP login mailbox. This must be confirmed
   against the live relay before the poller is enabled, and is independent
   of Decision 2 (which needs no mailbox at all).

## Amendments

### 2026-10-25 — Storefront order confirmation email (#532)

1. Storefront order confirmation sends use `meta.purpose =
   'storefront_order_confirmation'` and carry the tenant id into the existing
   landlord-scoped delivery log. The email body remains unstored; recipient
   retention and redaction follow Decisions 5 and 6 above. `[default]`
2. The order confirmation is dispatched best-effort after the new order's
   transaction commits. Idempotent checkout replays do not dispatch another
   email. There is no durable email dedupe key or outbox: a process crash
   between commit and send can lose the email, and this is accepted for this
   phase. Email failure or timeout must not fail or roll back checkout.
   `[default]`
3. `STOREFRONT_ORDER_CONFIRMATION_EMAIL_ENABLED` defaults to enabled; only the
   literal value `false` disables confirmation dispatch. Missing SMTP
   configuration or a missing usable customer email skips the send. The
   dispatcher bounds its wait to ten seconds, but that timeout does not cancel
   an SMTP send already in flight. `[default]`

### 2026-10-25 — Storefront confirmation email presentation parity (#532)

1. The customer confirmation email presents persisted order amounts using the
   storefront's breakdown rules; it does not recompute totals and never shows
   the legacy service-fee snapshot. The email-only VAT field is copied from the
   committed order and does not widen the customer API response. `[default]`
2. When available, the email includes the store's public profile image from the
   discovery index. A missing or unsafe URL uses a monogram. Email clients may
   block remote images; the adjacent store name and image alternative text
   remain available. The image URL is not recipient-specific and no tracking
   pixel is used. `[default]`
3. Relative `/uploads/storefront-assets/` image paths and the support link use
   the existing `STOREFRONT_PUBLIC_ORIGIN`; no additional environment setting
   is introduced. Missing origin or branding data omits the image/support link
   without blocking delivery. `[default]`

### 2026-10-25 — Storefront confirmation email customer-facing refinements (#532)

1. Item thumbnails use the tenant catalog's public `/uploads/storefront-catalog/`
   assets, resolved against the same `STOREFRONT_PUBLIC_ORIGIN` as store
   branding. Image lookup is best-effort and bounded; a missing, unsafe, or
   unavailable image never blocks checkout or email delivery. Remote images may
   be blocked by email clients. These URLs identify shared catalog assets and
   contain no recipient-specific values; no tracking pixel is used. `[default]`
2. The confirmation email presents the order PIN as its customer-facing order
   reference. It does not print the invoice number or provider payment
   reference; those remain available through their existing customer API
   contract and the separate official-receipt scope. `[default]`

## Rollback Notes

1. `EMAIL_DELIVERY_LOG_ENABLED=false` disables delivery-log writes; sending
   is unaffected since logging failures never block a send.
2. `EMAIL_BOUNCE_POLL_ENABLED=false` (default off) disables the IMAP
   poller entirely with no schema rollback required.
3. `EMAIL_DELIVERY_LOG_RETENTION_ENABLED=false` disables the prune job,
   leaving existing rows in place.
4. The Brevo fallback removal is **not** rollback-able by flag — this was a
   deliberate decision, not a phased rollout. Restoring it would mean
   reverting the commit that deleted it.
5. `email_delivery_logs` and the `email_otps.email_delivery_id` /
   `email_otps.delivery_status` enum widening are additive; a rollback of
   the observability work leaves both tables valid and unused.
