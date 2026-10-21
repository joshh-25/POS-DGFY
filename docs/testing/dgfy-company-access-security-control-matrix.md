---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-10-22
applies_to: dgfy_company_access,ims,pos,legacy_migration
topic: dgfy_company_access_security_matrix
---

# DGFY Company Access Security Control Matrix

This matrix turns ADR 0028 into release evidence. It must be refreshed whenever DGFY company access, invitations, legacy linking, ownership transfer, or POS unlock changes.

Authoritative basis:
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0028-dgfy-account-company-switching.md`
- `docs/features/DGFY_CUSTOMER_ACCOUNT.md`
- `docs/features/TENANT_MANAGEMENT.md`

External security basis:
- OWASP Authentication, Session Management, MFA, Authorization, Logging, and Transaction Authorization cheat sheets.
- NIST SP 800-63B authenticator and replay guidance.
- WCAG 2.2 form label, focus, target size, and error-identification guidance.
- CISA Secure by Design and SLSA provenance guidance for production rollout proof.

## Control Matrix

| Surface | Actor | Required Auth | Authorization Rule | Step-Up / Replay Control | Audit Event | Denial Proof | UI / UAT Proof |
|---|---|---|---|---|---|---|---|
| DGFY account search for IMS invite | Tenant admin or master admin | Accepted IMS tenant session with `users:manage` or equivalent | Query returns only active registered DGFY accounts and safe identity fields; `company_token` is never exposed | Rate-limited; minimum query length; no account creation from free-form values | Covered through invite creation and route telemetry | Inactive/unregistered targets rejected; already pending/accepted target blocked | IMS invite modal search, no-result, already-connected, rate-limit state |
| Create DGFY company invite | Tenant admin or owner | Accepted IMS tenant session | Selected active DGFY account only; tenant-local user is authorization profile only | No invite-link token credential; landlord membership and tenant auth profile must stay recoverably consistent | `invitation_created` | Duplicate pending/accepted blocked; landlord write failure compensated | Manage Users pending invitation lifecycle |
| Accept DGFY invite | Invited DGFY account | DGFY session | Membership id must belong to account and be `source=invite`, `status=pending` | `dgfy_business_step_up` email OTP or recent step-up; OTP is single-use in email OTP service | `invitation_accept_success`, `invitation_accept_failed` | Wrong account, non-pending status, invalid/replayed OTP blocked | My Account -> Business accept state and error state |
| Reject DGFY invite | Invited DGFY account | DGFY session | Membership id must belong to account and be pending invite | Non-mutating after closed state; repeat reject blocked | `invitation_reject_success`, `invitation_reject_failed` | Wrong account or non-pending status blocked | My Account -> Business reject state |
| Company switch | Accepted DGFY account | DGFY session, then IMS tenant session issuance | Accepted membership for target tenant; active tenant; no email or phone inference | Business step-up unless recent valid timestamp exists | `company_switch_success`, `company_switch_failed` | Pending/rejected/removed/inactive/non-member blocked | IMS switcher owned/member grouping and no-access state; DGFY account service errors must use scoped UI handling, not generic tenant global toasts |
| Leave company | Accepted invited/member DGFY account | DGFY session | Accepted membership; current owner cannot leave | Idempotent closed states are denied; owner must transfer first | `company_leave_success`, `company_leave_failed` | Founder owner blocked; transferred former owner may leave after owner field changes | Leave action visible only for invited/member group |
| Ownership transfer | Current DGFY owner | DGFY session | `tenants.owner_dgfy_account_id` must match current account; target must be accepted member | Business step-up required; transfer target is explicit DGFY account id | `ownership_transfer_success`, `ownership_transfer_failed` | Non-owner, pending target, rejected target, removed target blocked | IMS owner-only transfer dialog with accepted-member picker |
| Platform admin assisted provisioning | Platform admin | Admin JWT/cookie via `authenticateAdmin` | Admin may create ownerless tenant, DGFY account, or DGFY+tenant; owner assignment must target an active DGFY account id and create accepted membership | Temporary password is response-only; public OTP route unchanged; force assignment requires reason | `admin_create_dgfy_account`, `admin_create_tenant`, `admin_create_account_and_tenant`, `admin_force_assign_owner` | Public registration still requires OTP; ownerless tenant cannot issue DGFY/POS sessions; duplicate account/company rejected | Tenant Manager assisted provisioning panel; DGFY Accounts create panel; audit log evidence |
| Legacy link request | Accepted legacy tenant user | Legacy IMS/POS tenant session | Only current tenant-local user email is eligible | Tenant-scoped `dgfy_legacy_link` OTP requested to tenant-local email | `legacy_link_started` when telemetry is added; request evidence via OTP logs until then | Missing tenant/user/email blocked | Legacy CTA and deadline banner |
| Legacy link complete | Accepted legacy tenant user plus matching DGFY session | Legacy IMS/POS tenant session and DGFY account session | DGFY email must exactly match tenant-local email; active account only | Tenant-scoped OTP consumed before landlord transaction; blacklisted DGFY token blocked | `legacy_link_completed`, `legacy_link_failed` | Email mismatch, blacklisted token, inactive account, transaction failure blocked | Link/create DGFY CTA and completion state |
| Legacy tenant login | Existing accepted tenant-local user; linked or unlinked | Active tenant-local credential; on `/api/v1/auth/login` only, a linked user may also authenticate with the DGFY hash when an accepted membership identifies this exact tenant user | Active tenant only; linked DGFY fallback requires accepted membership for the active tenant and user; unlinked users never gain DGFY-password acceptance from an email match | Current `LEGACY_TENANT_LOGIN_GRACE_*` gates remain in force in the `sku_*` runtime; linked admin reset uses DGFY email recovery and never changes a tenant hash | `legacy_login_allowed` includes active tenant and matched credential source (`tenant` or `dgfy`); failure and drift telemetry contain no password/hash | No cross-tenant attempt; no email-only link; `/api/v1/dgfy/auth/login` never accepts a tenant password; failed dual checks consume one active-tenant limiter attempt | Stay in the active company; generic active-company error on mismatch; require explicit company selection before password entry when lookup finds multiple companies |
| DGFY POS unlock and logical terminal use | Accepted DGFY account or eligible tenant-local user | DGFY session then POS tenant session, or tenant credentials on the active tenant legacy path; a linked DGFY hash is accepted there only through the matching accepted membership | Accepted membership, active tenant, POS permission, active registered terminal, and authorized terminal location; invited cashiers are scoped to the selected company and granted terminal locations; tenant login never resolves another company | Active company context is preserved; lookup choices do not expose `company_token`; a no-context multi-company user chooses a company before password entry; lookup failure falls back only to the existing active token | `pos_unlock_attempted`, `pos_unlock_success`, `pos_unlock_failed`; `legacy_login_allowed` identifies matched credential source; every credential copy has one tenant-scoped audit result without hash material | No membership, no POS permission, inactive terminal, missing terminal location, unauthorized location, invalid credentials, email-only link, or attempt to switch from an active context is blocked | POS drawer DGFY sign-in, explicit company choice, active-company error copy, logical terminal selection, admin no-shift navigation, cashier restrictions |

## Release Evidence Checklist

Before staging or production rollout, attach evidence for:

1. Backend tests for each denial proof above.
2. Frontend tests for each user-facing control state above.
3. `npm run smoke:dgfy-access-ui` JSON output and screenshots for desktop and mobile. The default frontend-only mode records API response failures as diagnostics. Seeded/full-stack QA must also run with `DGFY_ACCESS_STRICT_NETWORK=true`; local HTTPS-enforced backend runs may set `DGFY_ACCESS_FORWARDED_PROTO=https`.
4. Seeded UAT covering founder-owned company, transferred former owner, invited accepted member, pending invite, rejected invite, unlinked legacy user, linked legacy user, POS allowed terminal, and POS terminal-policy denial.
5. Telemetry export showing separate counts for DGFY auth failure, no company access, POS permission denied, terminal registry denied, legacy grace allowed, and legacy grace blocked.

## Current Residual Risks

1. Credential synchronization, per-tenant copy audit, drift telemetry, and `legacy_login_allowed` credential-source metadata are contract requirements only; route/service implementation and verification remain outstanding. `legacy_link_started` and `legacy_login_blocked` wiring also require route-level verification before this matrix can be marked complete.
2. The rendered QA script passes in frontend-only mode, but production readiness remains capped until strict-network seeded local/staging data and its JSON/screenshots are attached.
3. POS hardware bridge behavior after DGFY unlock still needs seeded or device-backed UAT for receipt printing, cash drawer, iMin warnings, shift state, and offline queue replay.
