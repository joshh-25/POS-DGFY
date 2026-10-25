---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-25
related_adr: docs/architecture/adr/0098-storefront-support-contact-publication.md
declaration_id: 2026-10-25-storefront-support-email-configuration
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.25
verification_evidence: Admin production build; Storefront production build; architecture guardrails and controller-boundary checks; docs and ADR validation; changed-app version check; API changed JavaScript/CommonJS syntax checks; git diff check; compliance declaration structural and API-contract checks; focused tests and rendered checks not run
rollback_note: Revert the Admin support-email controls and API client methods, API support-contact routes/use cases/repository/model, Storefront API client and Contact Us email display, migration, tests, related docs, ADR, and this declaration. The migration down removes the support-contact landlord table and its configured address; retain or restore the approved support address before rolling back if the public contact path must remain available.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-25T03:24:28Z
preflight_request_ref: NOT-EXECUTED-2772-2026-10-25
---

# Storefront support email configuration (#2772, Phase 547)

## Compliance Impact Classification

Regulatory. The Platform Admin service path is mapped to the `settings,compliance` regulatory
floor. This change adds a permission-protected Admin setting for the global Storefront support
address and an unauthenticated public endpoint that returns that configured address by design.
The configured address is public immediately, including the provisional `support@dgfy.ph` value;
email and monitoring verification are optional and do not control publication.

## Affected Surfaces

- Platform Admin: support-address read/write and optional email verification under the existing
  `admin.contact_inquiries` grant.
- Landlord persistence: one global support-contact row, Admin audit events, and an optional
  verification state.
- Storefront public contact page: displays the configured address as a `mailto:` link while
  retaining the existing inquiry form and its direct-link fallback.
- Public API: returns only the configured support email, uses no tenant context, and sets
  `Cache-Control: no-store`.

## Compliance Preconditions

- The configured support email is intentionally public. The seeded `support@dgfy.ph` value remains
  unverified until an operator confirms actual delivery; no production inbox or monitoring proof
  was obtained in this implementation session.
- Optional OTP verification counts only after actual email delivery and successful code entry.
  Development fallback codes and disabled OTP enforcement do not record verification and do not
  hide or unpublish the configured address.
- The live request-time compliance preflight was not executed locally. The
  `NOT-EXECUTED-2772-2026-10-25` reference is the expected develop-PR placeholder; the governed
  compliance sweep reconciles it after the declaration lands on `develop`. The placeholder is not
  evidence of a live preflight result.

## Verification Evidence

The Admin and Storefront production builds, architecture guardrails and controller-boundary
checks, docs lint and ADR validation, changed-app version check, API changed JavaScript/CommonJS
syntax checks, `npm run check:compliance` structural/API-contract checks, and `git diff --check`
passed. Storefront emitted its existing large-chunk advisory.
Focused tests and updated rendered desktop/mobile checks were not run. No production migration,
mail delivery, inbox monitoring, or deployment was exercised.
