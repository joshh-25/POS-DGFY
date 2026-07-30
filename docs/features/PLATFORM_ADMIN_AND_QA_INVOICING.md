---
status: authoritative
authority_level: authoritative
owner: platform-operations
last_reviewed: 2026-07-29
applies_to: platform_admin, company_registration, landlord_invoicing
topic: platform_admin_and_qa_invoicing
---

# Platform Admin and QA Invoicing Contract

## Manual company registration

Public registration requires an authenticated DGFY account and always creates a pending landlord application. It does not activate a tenant or disclose a company-token capability. The submission email links to the owner-authorized SKUpervisor status page; approval and rejection emails use that same route. The authenticated DGFY company-list response also includes the account's application IDs and status paths so an applicant can recover the page without relying only on email. Rejection reasons are required and applicant-visible. Only the submitting DGFY account can see status or resubmit a rejected application; each resubmission creates a new immutable attempt with the prior legal acknowledgement snapshot. Pending public-registration tenants created before the review tables are backfilled with an explicitly marked legacy-evidence application so Platform Admin review does not strand them.

## Platform Admin

Platform Admin access uses an HttpOnly session cookie and live database authorization. Delegated users receive only the selected page grants. The navigation menu is not authorization; API route enforcement is mandatory, including trailing-slash variants of compound-permission routes. The Platform Master is the only actor that can administer delegated Platform Admin users, and its password remains environment-managed rather than UI-editable. An active delegated user with no grants sees a no-access screen instead of a redirect loop. A blank delegated password deliberately receives the documented temporary default; explicit and changed passwords require at least eight characters. A delegated password change revokes every active session and requires a fresh sign-in; master-initiated resets remain the recovery path.

## QA landlord invoices

`/api/v1/admin/invoices` is QA-only and requires `admin.invoices`. It supports one-time cash drafts for an approved/provisioned registration, issuing a single original `TEST-` invoice, and appending later cash payments to the original. A nullable original-only application guard supplies the database uniqueness invariant while still allowing replacement invoices. Discarded drafts remain as an auditable terminal state instead of deleting their event history. The phone UI accepts Philippine-peso amounts and converts them to centavos at the boundary; VAT is inclusive, and over-tender requires explicit change-return confirmation. Company name and registration email are selected from the approved application, while seller data is server-owned. The PDF section heading is `Payment details`, the charged total is labeled `DGFY platform fee`, and the service snapshot uses the same fee name. Issuance also creates one private, hash-verified PDF. Authorized admins may download it or submit that exact stored attachment to the configured provider; each email attempt is durable and rate-limited for 30 seconds. Missing fiscal authority values are visibly red placeholders and do not open live issuance.

## Runtime variables

- `SKUPERVISOR_PUBLIC_ORIGIN` is the canonical origin for owner-authorized company-registration status links; `APP_URL` is the fallback.
- `PLATFORM_INVOICING_MODE` defaults to `qa`; `PLATFORM_INVOICING_LIVE_CONFIRMED` remains `false`.
- `PLATFORM_INVOICE_ARTIFACT_ROOT` controls private PDF storage.
- `PLATFORM_INVOICE_QA_MAIL_SINK` or `PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST` is required before QA delivery.

Do not use this UI as a live VAT invoice, input-tax document, POS receipt, merchant settlement record, subscription payment, or inventory event. Live mode is intentionally fail-closed under ADR 0048.
