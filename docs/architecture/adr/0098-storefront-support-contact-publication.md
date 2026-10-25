---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-10-25
last_reviewed: 2026-10-25
review_by: 2027-04-25
applies_to: storefront_support_contact_publication
topic: storefront_support_contact_publication
---

# ADR 0098: Storefront Support Contact Publication

## Status

Accepted (2026-10-25). This records the support-email ownership and publication contract for
Storefront's public Contact Us page. It does not independently prove that a configured inbox works.

## Context

Issue #2772 needs the existing Storefront Contact Us route to provide app users with a way to report
problems, send feedback, and request features. `support@dgfy.ph` is a provisional candidate. The
operator chose to make verification optional and publish the configured value without waiting for
delivery proof.

## Decision

1. Platform Admin Contact Inquiries owns the global Storefront support-email configuration under the
   existing `admin.contact_inquiries` permission. The value belongs in landlord persistence, not a
   tenant record or frontend constant. `[default]`
2. Saving the configured address publishes it immediately. A new row starts with the provisional
   `support@dgfy.ph` value. Changing the address clears prior verification and monitoring records.
   `[default]`
3. Email OTP verification and Admin confirmation that the inbox is monitored are optional status
   signals. If verification is attempted, OTP enforcement must be enabled and an actual email
   delivery is required; a development fallback code does not qualify. `[default]`
4. Audit support-email saves, optional OTP requests, and verification through the Platform Admin
   audit log. The public API returns the configured email whether or not optional checks are
   complete. `[default]`
5. The public endpoint uses `Cache-Control: no-store`; the Storefront page preserves the inquiry form
   and its direct-link fallback. `[default]`

## Consequences

- Admin can update the configured support address without editing or rebuilding Storefront.
- A code entered from the recipient inbox demonstrates that someone can access the inbox. Optional
  monitoring confirmation records an owner assertion; neither check proves future monitoring.
- The address remains public if SMTP is unavailable, OTP enforcement is disabled, a code is invalid
  or expired, or monitoring is not confirmed.
- The default address is provisional. Production delivery, continuing mailbox monitoring, and the
  final iOS Support URL review remain operational checks after deployment.

## ADR mapping

| ADR | Clauses touched | Treatment |
| --- | --- | --- |
| 0029 | Storefront owns customer commerce surfaces | Adopted by reference |
| 0039 | Default decision lifecycle and ADR process | Followed; no binding clause added |
| 0047 | Platform Admin identity, page grants, and audit | Adopted by reference |
| 0089 | Platform Admin is an independent app boundary | Adopted by reference |

## Supersession and amendment targets

- **Supersedes:** none.
- **Amends:** none.
- **Adopts by reference:** ADRs 0029, 0039, 0047, and 0089.

## References

- [Issue #2772](https://github.com/Sieitzz/dgfy-platform/issues/2772)
- [Implementation Phase 550](../../features/IMPLEMENTATION_PHASE_LEDGER.md#phase-550---storefront-ios-support-url-readiness-2772)
- [Contact inquiries API module](../../../apps/dgfy-api/src/modules/contactInquiries/README.md)
- [Platform Admin route permission matrix](../../testing/platform-admin-route-permission-matrix.md)

## Post-merge verification

- [ ] Verify the production migration is applied to the landlord database.
- [ ] In Platform Admin, verify the configured inbox if delivery proof is available, optionally
      confirm monitoring, then verify the public API and Storefront display the saved value.
- [ ] Verify the Storefront support page and direct inquiry fallback on mobile.
- [ ] Record the proposed iOS Support URL and mobile review evidence for the submission owner.
