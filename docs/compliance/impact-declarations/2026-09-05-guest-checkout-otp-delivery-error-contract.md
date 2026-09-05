---
status: reference
owner: engineering
last_reviewed: 2026-09-05
related_adr: docs/architecture/adr/0021-email-otp-verification-for-account-email-ownership.md
declaration_id: 2026-09-05-guest-checkout-otp-delivery-error-contract
classification: major
surfaces: payments,settings
reason_codes_impacted: ALLOWED,SERVICE_UNAVAILABLE
policy_version: 2026.09.05
verification_evidence: apps/dgfy-api/tests/storeGuestCheckoutOtp.unit.test.js -- actually executed (Jest), 6 passing (1 new),apps/dgfy-api/tests/emailOtpService.test.js -- actually executed (Jest), 19 passing (2 updated for the new explicit delivery_status write),apps/dgfy-api/tests/addPendingEmailOtpDeliveryStatus.migration.test.js -- actually executed (Jest), 6 passing (new),apps/dgfy-api/tests/fixEmailOtpDeliveryStatus.migration.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/authEmailOtpTenantScope.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/tenantHandler.emailOtp.test.js -- actually executed (Jest), unchanged, regression-clean,node --check on every changed apps/dgfy-api .js file and the new migration .cjs file,node scripts/check-app-version-bump.js -- confirmed to require and receive a dgfy-api patch bump
rollback_note: No destructive change. The ENUM widening (pending added to email_otps.delivery_status, default flips from sent to pending) is additive and forward-compatible -- reverting the code alone (leaving the migration applied) is safe, since no code path after this revert writes or reads 'pending'. The migration's own down() is provided and collapses any 'pending' row to 'failed' with an explanatory delivery_error before narrowing the enum back, the same lossy-but-honest approach the prior 20260807000001 migration's down() already established for 'recorded'/'bounced'. The error-contract change (storeUseCases.js) and the boot-time SMTP verify (server.js) are both pure code; reverting either needs no data migration.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T03:48:59.000Z
preflight_request_ref: NOT-EXECUTED-1614-GUEST-CHECKOUT-OTP-DELIVERY-ERROR-CONTRACT
---

# Guest checkout OTP delivery error contract, boot-time SMTP verify, honest delivery_status (#1614)

## Compliance Impact Classification

Major, per the classification floor for any change under `apps/dgfy-api/src/modules/store/`
(`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`, `minimumClassification:
'major'`) -- not because this change itself alters payment authorization, tax calculation, pricing,
or compliance activation policy. It doesn't. This is a hardening fix for the #1614 production
incident: the guest checkout OTP request path returned a misleading `INTERNAL_ERROR` for what was
actually a well-classified `EMAIL_OTP_DELIVERY_FAILED`/`EMAIL_OTP_DELIVERY_UNAVAILABLE` 503, and
nothing detected the underlying SMTP credential failure until a customer hit it in production.

`preflight_request_ref` is `NOT-EXECUTED-*` at PR-open time targeting `develop`, per
`docs/compliance/request-time-preflight-protocol.md` -- the continuous sweep reconciles this to a
real `PREFLIGHT-*` value (or `NOT-APPLICABLE-*`) once it runs against this branch; this is expected
at PR-open time on `develop`, not a defect (see `pr-reviewer`'s own note on this exact lifecycle).

## Affected Surfaces

- Storefront guest checkout OTP request (`POST /api/v1/store/checkout/guest-otp/request`) -- the
  HTTP error contract on delivery failure changes from `code: INTERNAL_ERROR` to `code:
  SERVICE_UNAVAILABLE` (still `statusCode: 503`), matching the sibling `delivery_status !== 'sent'`
  guard in the same use case, which already returns this exact contract. No other field of the
  response, and no success-path behavior, changes.
- Backend process startup (`apps/dgfy-api/src/server.js`) -- adds a non-blocking, fire-and-forget
  SMTP connection verification (reusing the pre-existing `emailService.verifyConnection()`) so a
  broken SMTP credential surfaces in logs/Sentry at boot rather than only on the first live customer
  OTP/email request. Cannot delay or fail server startup; sends no mail.
- `email_otps` table schema (all OTP purposes, not just guest checkout: company registration,
  tenant-user registration, invitation acceptance, email change, DGFY account/password/business-step-
  up flows also use this same table and column) -- `delivery_status` ENUM gains a `pending` value and
  its default moves from `sent` to `pending`. `emailOtpService.js` now sets `delivery_status`
  explicitly at every stage (create -> `pending`, confirmed send -> `sent`, any failure ->
  `failed`), so this is additive and does not change any existing success-path return value.

## Compliance Preconditions

1. OTP enforcement must continue to fail closed on any email delivery failure -- unchanged; this
   change only relabels the error code returned on an already-existing fail-closed path, and does
   not add or remove any success condition.
2. A delivery failure must remain distinguishable from an unrelated internal error in both the
   client response and Sentry/log output -- this change is what makes that distinction possible;
   previously both cases were reported identically.
3. No `email_otps` row may claim `delivery_status: 'sent'` before a send has actually been
   confirmed -- the `pending` default plus explicit writes at every stage close exactly this gap.
4. The boot-time SMTP check must never block or fail server startup regardless of SMTP health --
   verified by the `.then()`/`.catch()` fire-and-forget shape (no `await` on the outer verification
   call within `startServer`).

## Verification Evidence

- `apps/dgfy-api/tests/storeGuestCheckoutOtp.unit.test.js` -- actually executed (Jest), 6 passing,
  including a new regression test asserting `EMAIL_OTP_DELIVERY_FAILED` and
  `EMAIL_OTP_DELIVERY_UNAVAILABLE` both map to `SERVICE_UNAVAILABLE` / 503, never `INTERNAL_ERROR`.
- `apps/dgfy-api/tests/emailOtpService.test.js` -- actually executed (Jest), 19 passing; two
  pre-existing assertions updated to expect the new explicit `delivery_status: 'sent'` write on a
  confirmed send (previously implicit via the column default).
- `apps/dgfy-api/tests/addPendingEmailOtpDeliveryStatus.migration.test.js` -- new, actually executed
  (Jest), 6 passing: no-op when the table doesn't exist, widens+defaults correctly, is idempotent,
  and the `down()` backfill-then-narrow ordering and idempotency are covered.
- `apps/dgfy-api/tests/fixEmailOtpDeliveryStatus.migration.test.js`,
  `tests/authEmailOtpTenantScope.test.js`, `tests/tenantHandler.emailOtp.test.js` -- actually
  executed (Jest), unchanged, regression-clean.
- `node --check` on every changed `.js` file (`storeUseCases.js`, `emailOtpService.js`, `server.js`,
  `models/Landlord/EmailOtp.js`) and the new migration `.cjs` file -- dgfy-api has no real build
  step, this is the Tier 0 equivalent per `implement`'s checkpoint policy.
- `node scripts/check-app-version-bump.js` -- confirmed to require, then pass with, a `dgfy-api`
  patch version bump for this change set.
- Production root cause for #1614 is a rejected SMTP credential at the mail provider, verified
  read-only via `ssh dgfy` (log correlation to the exact repro timestamp, a live `nodemailer.verify()`
  auth probe against both port 465 and 587, and a SOPS-decrypt fingerprint match confirming the
  encrypted secret matches what's live in the container) -- **not fixed by this PR**. This PR is
  hardening only; restoring OTP requires a credential reset + redeploy tracked separately on #1614.
