---
status: reference
authority_level: reference
owner: dgfy-api
last_reviewed: 2026-10-26
applies_to: outbound_email_delivery
topic: outbound_email_branding_inventory
---

# Outbound Email Inventory

This inventory records the active outbound email variants found in issue [#2830](https://github.com/Sieitzz/dgfy-platform/issues/2830). It was checked against the named exports in `apps/dgfy-api/src/services/emailService.js` and `apps/dgfy-api/src/templates/emailTemplates.js`, plus every direct send call in `apps/dgfy-api/src`. The branding guard test fails if an active template or email-specific wrapper is added without fixture coverage.

## Sender and rendering rules

- The generic sender display name resolves per message as `fromName` → `EMAIL_FROM_NAME` → `DGFY`. The sender address resolves as `fromEmail` → `EMAIL_FROM` → `SMTP_USER`. This change only changes the final display-name fallback; the precedence and addresses stay the same.
- Affiliate invitations, OTPs, and storefront order confirmations explicitly set the display name to `DGFY`. Other active variants use the generic policy. A configured `EMAIL_FROM_NAME` can still override the fallback for generic sends.
- “Generated text” means `sendEmail()` derives plain text from the HTML when no explicit `text` is passed. “Explicit text” means the sender supplies a separate plain-text body.
- URL cells name the current source or destination policy. Runtime-provided tenant, store, status, payment-provider, tracking, support, and login URLs are preserved.
- “Changed” records the authorship change in this task. Existing tenant/store names, legal issuer details, links, addresses, layouts, tokens, attachments, and delivery behavior remain unchanged.

## Staff and account email

| Variant and trigger | Caller / sender | Subject | Header, footer, body, and text | Links or domains | Branding change |
|---|---|---|---|---|---|
| Staff invitation creation or resend | `userService.createUserInvitation` / `resendUserInvitation` → `sendInvitationEmail`; generic policy | `You've been invited to join {tenantName} on DGFY` | DGFY header and footer; invitation role, inviter, expiry, and acceptance instructions; generated text | Existing `APP_URL/accept-invite?token=...` link with UTM parameters | Header, footer, and subject changed to DGFY; missing tenant-name fallback is DGFY. |
| Invitation accepted; welcome | `userService.acceptInvitation` → `sendWelcomeEmail`; generic policy | `Welcome to {tenantName} on DGFY` | Tenant name in header; DGFY in body and footer; generated text | Existing `APP_URL/login` link with UTM parameters | Subject, body, and footer changed to DGFY; missing tenant-name fallback is DGFY. |
| Cashier credentials provisioned or reset | `userService` provisioning/reset paths → `sendCashierCredentialEmail`; generic policy | `Your cashier login details for {tenantName}` | “Cashier Login Details” title; tenant, store, terminal, email, and temporary password; explicit text | Existing `APP_URL/login` and `/dgfy/reset-password?email=...` links with UTM parameters | No authored legacy brand was present; sender fallback changes to DGFY. Credentials and destinations are unchanged. |
| DGFY business invitation to an existing account | `dgfyAuthUseCases` inline `sendEmail`; generic policy | `Invitation to join {tenantName} on DGFY` | No shared header/footer; inviter, business name, and My Account → Business acceptance instructions; explicit text | No URL; recipient signs into their DGFY account and opens Business | Already DGFY-branded; sender fallback changes to DGFY. |
| Affiliate invitation, existing DGFY account | `dgfyAffiliateUseCases` → `sendAffiliateInviteEmail`; explicit DGFY | `You're invited to be an affiliate of {businessName} on DGFY` | DGFY header/footer; existing-account accept instructions; generated text | Existing `{STOREFRONT_PUBLIC_ORIGIN}/affiliate/accept?token=...` destination | Already DGFY-branded; content and URL are unchanged. |
| Affiliate invitation, new account | `dgfyAffiliateUseCases` → `sendAffiliateInviteEmail`; explicit DGFY | `You're invited to be an affiliate of {businessName} on DGFY` | DGFY header/footer; registration and automatic-enrollment instructions; generated text | Existing `{STOREFRONT_PUBLIC_ORIGIN}/register?email=...&aff_invite=...` destination | Already DGFY-branded; content and URL are unchanged. |

## Company lifecycle and verification email

| Variant and trigger | Caller / sender | Subject | Header, footer, body, and text | Links or domains | Branding change |
|---|---|---|---|---|---|
| Company approval status email | `sendCompanyApprovedEmail`; no production caller found; available to the explicit registration diagnostic script; generic policy | `Your company "{companyName}" has been approved!` | DGFY header/footer; company approval and status instructions; generated text | Existing supplied `statusUrl`, or `APP_URL/register-company` fallback | Header and footer changed to DGFY; subject and destinations are unchanged. |
| Company approved and ready for POS onboarding | `approveTenantUseCase`, registration draft materialization, and registration request flows → `sendCompanyOnboardingEmail`; generic policy | `Your company "{companyName}" is ready for POS onboarding` | DGFY header/footer; company approval and onboarding instructions; generated text | Existing supplied `posUrl` and optional `statusUrl` | Header and footer changed to DGFY; subject and destinations are unchanged. |
| Registration submission received | `registerCompanyRequestUseCase` → `sendCompanySubmissionReceivedEmail`; generic policy | `Registration received: {companyName}` | Inline HTML without shared header/footer; explicit text | Existing supplied `statusUrl` | Already neutral; sender fallback changes to DGFY. |
| Company registration rejected | `rejectTenantUseCase` and registration diagnostic script → `sendCompanyRejectedEmail`; generic policy | `Update on your "{companyName}" registration request` | DGFY header/footer; reason and resubmission instructions; generated text | Existing `statusUrl` or `APP_URL/dgfy/account` fallback; existing `support@skuinventorymanager.com` mailbox retained | Header/footer changed to DGFY; support address, body meaning, and destination are unchanged. |
| Registration re-submitted | `companyRegistrationStatusUseCase` → `sendResubmissionConfirmationEmail`; generic policy | `Registration Re-submitted: {companyName}` | DGFY header/footer; confirmation and review timing; generated text | No action link | Already neutral; shared sender fallback changes to DGFY. |
| Company registration OTP | `emailOtpService.sendEmailOtpCode`; purpose `company_registration`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. No current direct caller of this configured purpose was found. |
| Tenant-user registration OTP | `authService` → `emailOtpService.sendEmailOtpCode`; purpose `tenant_user_registration`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| Invitation acceptance OTP | `userService` / auth invitation flow → `emailOtpService.sendEmailOtpCode`; purpose `invitation_acceptance`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| Email change OTP | `userService` and `userHandlers` → `emailOtpService.sendEmailOtpCode`; purpose `email_change`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| DGFY account verification OTP | `dgfyAuthUseCases` signup/resend flows → `emailOtpService.sendEmailOtpCode`; purpose `dgfy_account_verification`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| DGFY password-reset OTP | `dgfyAuthUseCases` reset flows → `emailOtpService.sendEmailOtpCode`; purpose `dgfy_password_reset`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| DGFY business step-up OTP | `dgfyAuthUseCases` sensitive business actions → `emailOtpService.sendEmailOtpCode`; purpose `dgfy_business_step_up`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| DGFY legacy-account linking OTP | `dgfyLegacyLinkService` → `emailOtpService.sendEmailOtpCode`; purpose `dgfy_legacy_link`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| Storefront guest-checkout OTP | Storefront checkout use cases → `emailOtpService.sendEmailOtpCode`; purpose `storefront_guest_checkout`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |
| Platform-support contact OTP | Contact inquiry use cases → `emailOtpService.sendEmailOtpCode`; purpose `platform_support_contact`; explicit DGFY | `Your DGFY email verification code` | No shared header/footer; purpose label, code, and expiry; explicit text | None | Already DGFY-branded; unchanged. |

## Subscription, billing, and reactivation

| Variant and trigger | Caller / sender | Subject | Header, footer, body, and text | Links or domains | Branding change |
|---|---|---|---|---|---|
| Premium subscription expiring | `billingScheduler` → `sendSubscriptionExpiringEmail`; generic policy | `Your Premium subscription for {companyName} is expiring soon` | DGFY header; no footer; expiry and renewal guidance; generated text | Existing `APP_URL/settings?tab=subscription` link with UTM parameters | Header changed to DGFY; content, layout, and URL are unchanged. |
| Subscription cancelled | `billingScheduler` / PayMongo cancellation path → `sendSubscriptionCancelledEmail`; generic policy | `Subscription Cancelled: {companyName}` | DGFY header; no footer; downgrade date and access window; generated text | None | Header changed to DGFY; no CTA or footer was added. |
| Payment failed | `sendPaymentFailedEmail` remains an exported active wrapper; no production caller found; generic policy | `Action Required: Payment Failed for {companyName}` | DGFY header; no footer; retry timing and payment guidance; generated text | None | Header changed to DGFY; content and layout are unchanged. |
| Payment failed; grace period warning | `billingScheduler` → `sendPaymentFailedGracePeriodEmail`; generic policy | `Important: Action Required for Your {companyName} Subscription` | DGFY header; no footer; grace-period end and downgrade consequence; generated text | None | Header changed to DGFY; content and layout are unchanged. |
| PayMongo recurring setup | `setupPayMongoRecurringUseCase` → `sendPayMongoSetupEmail`; generic policy | `Action Required: Set Up PayMongo Recurring Billing for {companyName}` | Shared `emailWrap`; DGFY header/footer; plan, amount, expiry, and setup instructions; generated text | Existing `checkoutLink` to PayMongo | Shared header/footer and administrator wording changed to DGFY; provider URL and payment terms are unchanged. |
| PayMongo setup link expired | `billingScheduler` → `sendPayMongoSetupExpiredEmail`; generic policy | `PayMongo Setup Link Expired for {companyName}` | Shared `emailWrap`; DGFY header/footer; expiration and re-initiation instructions; generated text | No direct link | Shared header/footer changed to DGFY; delivery behavior is unchanged. |
| Plan change pending | `changePlanUseCase` → `sendPlanChangePendingEmail`; generic policy | `Plan Change Pending Approval for {companyName}` | Shared `emailWrap`; DGFY header/footer; old/new plans and re-consent instructions; generated text | Optional existing `approvalUrl` | Shared header/footer remain DGFY; copy, condition, and destination are unchanged. |
| Plan change applied | `changePlanUseCase` / payment webhook → `sendPlanChangeAppliedEmail`; generic policy | `Your {companyName} Plan Has Been Updated to {newPlan}` | Shared `emailWrap`; DGFY header/footer; plan change summary; generated text | None | Shared header/footer remain DGFY; no other content change. |
| Reactivation requested | `requestReactivationUseCase` → `sendReactivationRequestEmail`; generic policy | `Reactivation Request from {companyName}` | Shared `emailWrap`; DGFY header/footer; request details and admin review instruction; generated text | No direct link | Shared header/footer and admin description changed to DGFY; flow unchanged. |
| Reactivation approved | Platform admin handler → `sendReactivationApprovedEmail`; generic policy | `Your {companyName} Account Has Been Reactivated!` | Shared `emailWrap`; DGFY header/footer; company token and login instructions; generated text | Existing `APP_URL/login` link | Shared header/footer remain DGFY; token, content, and destination are unchanged. |

## Customer commerce, tracking, services, and invoices

| Variant and trigger | Caller / sender | Subject | Header, footer, body, and text | Links or domains | Branding change |
|---|---|---|---|---|---|
| Storefront order confirmation after committed checkout | `dgfyOrderConfirmationEmail` → `sendStorefrontOrderConfirmationEmail`; explicit DGFY | `Order confirmation {trackingPin} — {storeName}` | DGFY header and powered-by/footer text; store identity, order, payment, and fulfillment details; explicit text | Existing validated tracking, logo, and support URLs | Already DGFY-branded; tenant/store identity, receipt disclaimer, and order details are unchanged. |
| Customer tracking recovery code | `dgfyCustomerUseCases` inline `sender.sendEmail`; generic policy | `Your DGFY order recovery code` | Inline recovery code and expiry; explicit text; no header/footer | No URL | Already DGFY-branded; recovery semantics and response privacy are unchanged. |
| Due service booking reminder | `buildSendDueServiceRemindersUseCase` inline `emailService.sendEmail`; generic policy | `Reminder: {serviceName} on {scheduledTime}` | Neutral HTML reminder with customer, service, booking reference, reschedule/cancel guidance; generated text; no header/footer | No link | No legacy authored brand was present; sender fallback changes to DGFY. |
| Platform invoice, production mode | `platformInvoiceUseCases.deliverEmail` inline send; generic policy | `DGFY {invoiceNumber} invoice` | Inline notice naming legal issuer **Sieitz Solutions OPC (DGFY)**; explicit text; PDF attachment | None | No branding change; fiscal/legal issuer and attachment remain unchanged. |
| Platform invoice, QA mode | `platformInvoiceUseCases.deliverEmail` inline send; generic policy | `DGFY {invoiceNumber} invoice` | Same legal issuer notice plus `TEST DOCUMENT — NOT VALID AS A VAT INVOICE OR FOR INPUT TAX.` in HTML and explicit text; PDF attachment | None | No branding change; QA notice and legal issuer remain unchanged. |

## Operator tooling and disabled historical code

| Tool / condition | Sender and copy | Links or destinations | Change |
|---|---|---|---|
| `apps/dgfy-api/scripts/verify-email-delivery.js` with an explicit `--send-to` | Generic sender policy; subject `DGFY email delivery verification`; explicit DGFY HTML/text | The operator-supplied recipient; no link | Subject, HTML, and text changed to DGFY. The script still sends only when `--send-to` is present. |
| `src/scripts/test_invitation_email.js` with explicit `--email` and `src/scripts/test_invitation_api_endpoint.js` against a local API | Reuse normal invitation service/wrapper and its current recipient/tenant values | Existing invitation path; these scripts may send to their supplied or generated test recipient | No separate template change. The generic sender fallback now resolves to DGFY. |
| `src/scripts/test_registration_emails.js` with explicit `--email` | Reuses `sendCompanyApprovedEmail` and `sendCompanyRejectedEmail` | Existing company status/resubmission destinations | No separate template change; shared approval/rejection copy is covered above. |
| PayPal recurring setup route and disabled email template | The admin route and `setupPayPalRecurringUseCase` remain wired, but the use case calls `emailService.sendPayPalSetupEmail`, which is not exported by the current email service. The PayPal template definitions and expired-link template remain block-commented. | No deliverable PayPal setup email; the call targets a missing wrapper | Preserved without modification per this change's non-goals. Restoring or removing the legacy PayPal setup flow is separate work. |

## Environment follow-through

The repository examples and current sender guidance now use `EMAIL_FROM_NAME=DGFY`. Generic sends still honor an environment override, so deployed settings must be checked separately:

- A read-only PROD check recorded on 2026-10-26 found `EMAIL_FROM=noreply@dgfy.ph` and an `EMAIL_FROM_NAME` value with literal quotation marks around DGFY. The operator must set the effective name to exactly `DGFY` in the actual configuration source and preserve the sender address.
- STAGING `EMAIL_FROM_NAME` and `EMAIL_FROM` remain unverified because the filtered read timed out. The operator must inspect those two values and set the effective display name to exactly `DGFY` if needed.
- Apply any required environment change through the normal configuration and release controls so it persists. This inventory records no live change, deployment, or email send. `npm run verify:email` is a connection check; its `--send-to` mode sends a real message and was not run for this task.

## Change boundary

The change updates active authored platform labels, sender fallback, current configuration examples/guidance, this inventory, and regression coverage. It leaves tenant/store-supplied values, `support@skuinventorymanager.com`, configured sender addresses, URL hosts and destinations, legal/fiscal issuer information, templates' existing layout, SMTP configuration, delivery/retry/logging behavior, and sent historical messages intact. Superseded historical documentation and disabled PayPal code retain the names recorded when they were written.
