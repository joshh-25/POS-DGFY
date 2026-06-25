---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-06-18
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
| Legacy tenant login | Existing accepted tenant-local user | Tenant-local credentials | Grace cohort only until June 17, 2027; new users not eligible | Deadline and flag controlled; no new invite-link setup | `legacy_login_allowed`, `legacy_login_blocked` when telemetry is fully wired | Expired grace blocks with DGFY link route | IMS/POS legacy fallback copy and reminders |
| DGFY POS unlock | Accepted DGFY account or grace-eligible legacy tenant user | DGFY session then POS tenant session, or tenant-local credentials during legacy grace | Accepted membership, active tenant, POS permission, terminal registry/location policy; legacy fallback must resolve tenant through `/auth/lookup` and validate tenant credentials | Company selected after access confirmation; terminal id explicit in same drawer; dedicated POS stays locked until explicit unlock; development tenant auto-login is opt-in and excluded from terminal lock routes; DGFY auth `401` may fall back to legacy grace only before unlock | `pos_unlock_attempted`, `pos_unlock_success`, `pos_unlock_failed`; legacy audit wiring remains tracked separately | No membership, no POS permission, inactive tenant, terminal denial, failed lookup, or invalid tenant credentials blocked | POS drawer DGFY sign-in, company select, terminal select, legacy fallback, open-shift prompt only after unlock |

## Release Evidence Checklist

Before staging or production rollout, attach evidence for:

1. Backend tests for each denial proof above.
2. Frontend tests for each user-facing control state above.
3. `npm run smoke:dgfy-access-ui` JSON output and screenshots for desktop and mobile. The default frontend-only mode records API response failures as diagnostics. Seeded/full-stack QA must also run with `DGFY_ACCESS_STRICT_NETWORK=true`; local HTTPS-enforced backend runs may set `DGFY_ACCESS_FORWARDED_PROTO=https`.
4. Seeded UAT covering founder-owned company, transferred former owner, invited accepted member, pending invite, rejected invite, unlinked legacy user, linked legacy user, POS allowed terminal, and POS terminal-policy denial.
5. Telemetry export showing separate counts for DGFY auth failure, no company access, POS permission denied, terminal registry denied, legacy grace allowed, and legacy grace blocked.

## Current Residual Risks

1. `legacy_link_started`, `legacy_login_allowed`, and `legacy_login_blocked` audit event wiring must be verified at route/service level before this matrix can be marked complete.
2. The rendered QA script passes in frontend-only mode, but production readiness remains capped until strict-network seeded local/staging data and its JSON/screenshots are attached.
3. POS hardware bridge behavior after DGFY unlock still needs seeded or device-backed UAT for receipt printing, cash drawer, iMin warnings, shift state, and offline queue replay.
