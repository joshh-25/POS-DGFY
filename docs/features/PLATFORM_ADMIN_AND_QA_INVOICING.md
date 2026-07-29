---
status: authoritative
authority_level: authoritative
owner: platform-operations
last_reviewed: 2026-07-28
applies_to: platform_admin, company_registration, landlord_invoicing
topic: platform_admin_and_qa_invoicing
---

# Platform Admin and QA Invoicing Contract

## Manual company registration

Public registration requires an authenticated DGFY account and always creates a pending landlord application. It does not activate a tenant or disclose a company-token capability. Rejection reasons are applicant-visible. Only the submitting DGFY account can see status or resubmit a rejected application; each resubmission creates a new immutable attempt with the prior legal acknowledgement snapshot.

## Platform Admin

Platform Admin access uses an HttpOnly session cookie and live database authorization. Delegated users receive only the selected page grants. The navigation menu is not authorization; API route enforcement is mandatory. The Platform Master is the only actor that can administer delegated Platform Admin users. An active delegated user with no grants sees a no-access screen instead of a redirect loop. A blank delegated password deliberately receives the documented temporary default; explicit and changed passwords require at least eight characters. A password change is optional and master-initiated resets remain the recovery path.

## QA landlord invoices

`/api/v1/admin/invoices` is QA-only and requires `admin.invoices`. It supports one-time cash drafts for an approved/provisioned registration, issuing a single original `TEST-` invoice, and appending later cash payments to the original. The phone UI accepts Philippine-peso amounts and converts them to centavos at the boundary; VAT is inclusive, and over-tender requires explicit change-return confirmation. Company name and registration email are selected from the approved application, while seller data is server-owned. The PDF section heading is `Payment details`, the charged total is labeled `DGFY platform fee`, and the service snapshot uses the same fee name. Issuance also creates one private, hash-verified PDF. Authorized admins may download it or submit that exact stored attachment to the configured provider; each email attempt is durable and rate-limited for 30 seconds. Missing fiscal authority values are visibly red placeholders and do not open live issuance.

Do not use this UI as a live VAT invoice, input-tax document, POS receipt, merchant settlement record, subscription payment, or inventory event. Live mode is intentionally fail-closed under ADR 0048.
