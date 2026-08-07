# Email Delivery Module

Owns the canonical outbound-email delivery record (issue #279):
`email_delivery_logs`, written by `emailService.sendEmail()` for every
outbound message -- OTPs, invoices, invitations, cashier credentials,
billing reminders -- classifying each attempt (`sent`/`partial`/`failed`)
and later carrying an async bounce status flipped by the IMAP DSN poller.

Landlord-scoped: `EmailDeliveryLog` is registered in
`NON_TENANT_MODEL_EXPORTS` (`apps/dgfy-api/src/utils/tenantModelFactory.js`),
alongside `EmailOtp`. `tenant_id` on the table has no foreign key --
deliverability history must survive tenant deletion.

Current shape:

`emailService.sendEmail() -> emailDeliveryLogRepository -> email_delivery_logs`

with the async bounce poller and admin read API as later additions:

`IMAP DSN poller -> emailDeliveryLogRepository (bounce update)`
`routes/adminEmailDeliveries.js -> controllers -> usecases -> emailDeliveryLogRepository`

Ownership:

- the delivery-log table and its repository
- Message-ID generation/correlation conventions used by `emailService.js`
- DSN parsing and bounce ingestion (async bounce capture phase)
- the retention prune job (PII redaction + hard delete on a schedule)
- the admin-facing read API and delivery-status summary

This module does not own SMTP transport itself (`emailService.js`,
`apps/dgfy-api/src/services/`) or the OTP registry (`EmailOtp`,
`apps/dgfy-api/src/services/emailOtpService.js`) -- it only records what happened
to a send and, later, what happened to it downstream.
