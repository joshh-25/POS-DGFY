---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-10-14
last_reviewed: 2026-10-14
review_by: 2027-04-14
applies_to: platform_admin_contact_inquiries
topic: contact_inquiry_provider_configuration
---

# ADR 0096: Contact Inquiry Provider Configuration

## Status

Proposed. This records the bounded first integration slice for the Contact Us form. It does not
approve or define Pin4MS submission-reading behavior; that requires a separate provider-contract
review once its API documentation is available.

## Context

The public Storefront embeds a Pin4MS-hosted Contact Us form. Pin4MS can generate a per-form API key
that allows external systems to read submissions. DGFY needs a protected Admin interface to accept
that key and a future inbox for the resulting messages. The current provider guidance confirms key
generation and read access, but does not define the submission endpoint, response shape,
authorization header, pagination, rate limits, or deletion behavior. DGFY's product retention
decision for a future local copy is active for 60 days from the original submission time, then
archived until an Admin explicitly deletes it. The provider's canonical timestamp and upstream
deletion semantics still need confirmation.

## Decisions

1. Contact Inquiries is a page in the independent apps/dgfy-admin application. It uses a
   delegable admin.contact_inquiries page grant, and the API independently enforces that grant
   on every request. Platform Master Admin retains implicit access. [default]
2. The Pin4MS API key is write-only from the browser. The API stores it in the landlord database as
   AES-256-GCM authenticated ciphertext, using a dedicated 32-byte hexadecimal environment secret.
   The encryption secret is provisioned through the approved server secret store, never checked in,
   and never returned by status APIs or included in audit snapshots. Missing or malformed secret
   configuration fails closed. [default]
3. Key submission is accepted only over HTTPS or a trusted loopback development connection.
   Browser-side disabling is a usability safeguard; the API independently enforces transport
   security. [default]
4. Configuration status means only that a key is stored. It does not mean that the key is valid or
   that the provider is connected. The first Admin screen must say submission synchronization is
   unavailable until a separate provider contract is verified. [default]
5. This phase does not fetch, cache, or persist submissions. Before a later read/sync implementation,
   review provider authentication, pagination and rate-limit handling, idempotency, read permissions,
   PII minimization, and failure recovery. The selected DGFY-side retention is: keep each inquiry
   active for 60 days from its original submission time, then archive it; retain archived inquiries
   until an Admin explicitly deletes them. The provider guide must confirm the timestamp used for
   aging records. Admin deletion applies to DGFY's copy only unless the provider contract explicitly
   supports and authorizes upstream deletion. [default]

## Consequences

- The Admin UI can safely collect and replace the provider key without exposing it after save.
- Local environments need a separately provisioned encryption secret before the save action is
  enabled. HTTPS or loopback is required for entering a real key.
- The inbox initially shows a clear empty state, not mock data or a false connected status.
- A saved key does not prove that Pin4MS accepts it. Connection verification and submission sync
  remain out of scope until the provider API is documented.
- Key rotation requires re-encrypting existing credentials before replacing the server encryption
  secret. The old secret must remain available until that migration completes.

## ADR mapping

| ADR | Clauses touched | Treatment |
| --- | --- | --- |
| 0039 | Architecture decision and approval process | Followed; this proposal adds no new binding clause |
| 0047 | Platform Admin identity, page authorization, and audit | Adopted by reference; add a page-level permission and redact secrets |
| 0060 | Secret protection at rest | Adopted by reference; use a dedicated environment secret and encrypted storage |
| 0089 | Independent DGFY Admin app | Adopted by reference; keep the inbox out of POS, OPIS, and Storefront |

## Supersession and amendment targets

- **Supersedes:** none.
- **Amends:** none.
- **Adopts by reference:** ADRs 0039, 0047, 0060, and 0089.
- The retention choice is recorded, but a reviewed ADR amendment and the Pin4MS read-API contract are
  still required before expanding this bounded key-configuration slice into provider polling,
  webhooks, or persisted submissions. This proposal remains non-binding until its approval record
  is completed.

## Approval Record

- Tech-lead approval: **pending**
- Approver:
- Approval date:
- Recorded in:

## References

- [Implementation Phase 506](../../features/IMPLEMENTATION_PHASE_LEDGER.md#phase-506---platform-admin-contact-inquiries-and-pin4ms-credential-setup)
- [Implementation Phase 507](../../features/IMPLEMENTATION_PHASE_LEDGER.md#phase-507---pin4ms-submission-sync-and-admin-inbox)
- [Platform Admin Route Permission Matrix](../../testing/platform-admin-route-permission-matrix.md)

## Post-merge verification

- [ ] provision and verify the dedicated encryption secret in each intended API environment.
- [ ] verify that the database migration is applied through the governed migration runner.
- [ ] verify that the saved key is not exposed in API responses, audit records, browser storage, or
      request/error logs.
- [ ] complete a separate provider-contract review before any submission read or sync is enabled.
