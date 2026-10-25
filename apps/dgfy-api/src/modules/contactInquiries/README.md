# Contact inquiries

Owns DGFY's Pin4MS form-provider configuration and the public Storefront support-email configuration.

The provider API key is accepted only by the authenticated Platform Admin API, rejected over
non-secure network connections (except loopback development), encrypted with AES-256-GCM before
landlord-database persistence, and never returned or written to audit snapshots. The encryption
key is a 32-byte hexadecimal environment secret named
CONTACT_INQUIRIES_CREDENTIAL_ENCRYPTION_KEY; production provisioning belongs in the approved
server secret store. A key rotation must preserve/re-encrypt existing credentials before replacing
this environment secret.

This module does not yet read submissions from Pin4MS. Submission syncing remains gated on the
provider's read-API contract. The product retention decision for any future DGFY-side copy is to keep
inquiries active for 60 days from submission time, then archive them; archived inquiries remain
until an Admin explicitly deletes them. The provider contract must confirm its canonical submission
timestamp and whether deletion can be propagated upstream. Until then, archiving and deletion apply
only to DGFY's copy and do not imply deletion from Pin4MS.

Controllers handle transport and TLS checks; use cases validate and coordinate; repositories own
persistence and redacted audit events.

## Storefront support email

Platform Admin manages the public support email under the existing `admin.contact_inquiries`
permission. The email is stored in the landlord database and is public as soon as an Admin saves it;
email verification and the monitoring confirmation are optional. The landlord row is seeded with
the provisional `support@dgfy.ph` value. An email OTP check must use actual delivery and enabled OTP
enforcement; development fallback codes and recorded-but-unsent codes never count as verified.
Changing the configured email makes the new value public immediately and clears the previous
verification and monitoring timestamps.

The unauthenticated `GET /api/v1/public/support-contact` response includes the configured active
email regardless of its optional verification state; it returns `email: null` only when no email is
configured. The route sends `Cache-Control: no-store`. OTP request and verification endpoints are
authenticated, rate limited, CSRF protected by the API middleware, and their state changes are
written to the Platform Admin audit log. The OTP code is never returned by the API. Optional
verification failures do not remove or hide the configured address.
