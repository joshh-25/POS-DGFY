# Contact inquiries

Owns the DGFY-side configuration for the Pin4MS contact-form submissions provider.

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
