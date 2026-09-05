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

## Amendment — 2026-09-05 (pr-reviewer RF-1/RF-2/RF-3/RF-6)

Codex-run `pr-reviewer` (`.agents/skills/pr-reviewer/SKILL.md`, first live run in this environment,
report-only per that skill's calibration rule) reviewed PR #1616 and posted a `BLOCK` verdict with
one blocker and several should-fixes/nits. All addressed in the same PR, same commit set:

- **RF-1 (blocker, fixed):** `scripts/propose-version-level.js` classified the boot-time SMTP
  verification commit as a bare `feat` requiring a **minor** bump, while only a patch bump had been
  applied. `dgfy-api` re-bumped `1.2.3 -> 1.3.0`; both changed apps' lockfiles regenerated
  (`npm install --package-lock-only`, version-string-only diffs).
- **RF-2 (should-fix, fixed):** the RF-1-adjacent error-contract fix (Finding A in this same PR)
  had placed the internal `EMAIL_OTP_DELIVERY_FAILED`/`_UNAVAILABLE` code in `DomainError.details`,
  which `useCaseResponder.js` serializes straight into the public response body -- exactly the
  anti-pattern `domainErrors.js`'s own constructor comment warns against. Moved to
  `observabilityReasonCode` instead (never serialized), with a new regression assertion that
  `result.error.details` is `null` and the internal code appears only on
  `observabilityReasonCode`.
- **RF-3 (should-fix, fixed):** both changed apps' `package-lock.json` had stale version fields
  after the original version bumps. Regenerated via `npm install --package-lock-only`; confirmed
  version-string-only diffs via `git diff --stat`.
- **RF-4 (should-fix, addressed in the PR body, not this file):** added a Rollout And Safety
  disclosure that `email_otps` is a landlord-only table with no dependency on
  `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`'s open per-tenant findings.
- **RF-5 (should-fix, addressed in the PR body, not this file):** filled out the full
  `.github/pull_request_template.md` section set (Architecture Impact/Compliance Evidence,
  Rollout And Safety, etc.) rather than only the two required minimum sections.
- **RF-6 (nit, fixed):** extracted the boot-time SMTP verification into a standalone, injectable,
  exported function (`runStartupEmailVerification`, `server.js`) with a new focused unit test
  (`tests/serverStartupEmailVerification.unit.test.js`) covering configured-success,
  configured-failure/alert, unconfigured/no-call, and unexpected-rejection paths.

No change to this declaration's `classification`, `surfaces`, or `reason_codes_impacted` -- these
are all fixes/refinements within the scope already declared above, not a new compliance-sensitive
surface.
