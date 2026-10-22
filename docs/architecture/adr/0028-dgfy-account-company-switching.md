---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-08
last_reviewed: 2026-10-22
review_by: 2027-04-22
applies_to: architecture_decision
topic: dgfy_account_company_switching
---

# ADR 0028: DGFY-Only Company Access And Switching

## Context

A single landlord-scoped DGFY account can register, own, be invited into, leave, transfer ownership for, and operate POS for multiple tenant companies. Company navigation must be convenient without weakening tenant isolation, creating tenant-local login identities, or exposing tenant company tokens in public/account-picker payloads.

## Decision

DGFY company access is authorized only through explicit `DgfyAccountTenantMembership` rows. Email or mobile-number matches are not sufficient to switch companies, accept invitations, leave companies, transfer ownership, or unlock POS. Accepted active memberships are switchable; pending IMS invitations are visible to the invited DGFY account but must be accepted before switching.

Company creation requires an authenticated DGFY account. The resulting tenant row stores the active owner in landlord scope as `tenants.owner_dgfy_account_id`. `source='founder'` means the account currently owns the company only while it matches the tenant owner field; ownership can be transferred to another active DGFY account that already has an accepted membership in the tenant. Transfer requires current owner authorization plus `dgfy_business_step_up`, updates the tenant owner fields, keeps the previous owner as a member/admin unless removed separately, and is audited.

IMS user invitations are DGFY-account invitations. Settings > Company > Manage Users must search active registered DGFY accounts by email or phone and invite a selected account. New direct `/accept-invite?token=...` account-setup links, manual-link recovery, and tenant-local password setup for invited business users are retired by default. Tenant-local `users` rows remain authorization profiles for role, permissions, location scope, audit actor mapping, and POS/IMS authorization. In the current `sku_*` runtime, password-hash copying is limited to an explicitly linked tenant user and follows the credential-sync contract in the 2026-10-22 amendment below: never infer a link by email, copy to an unlinked tenant, or store plaintext.

Legacy founder/master-admin companies are bootstrapped into this same explicit-membership contract. When a DGFY account has a verified email, the backend may mirror an accepted `source='founder'` membership only if the landlord email-to-tenant mapping exists, the tenant is active, the tenant-local user has the same normalized email, the tenant-local user is active and not deleted, and `is_master_admin=true`. This mirror runs at account registration/login/handoff/profile/company-list refresh time and creates the durable membership row before any switch is authorized. Staff/admin invitations that are not founder/master-admin ownership remain pending invitations and still require acceptance.

Ownership transfer remains protected by email-OTP step-up with purpose `dgfy_business_step_up`. Routine company access actions from My Account > Business and the IMS switcher do not send or require a verification code: accepting a pending invitation is authorized by the authenticated DGFY account plus the pending explicit membership row, rejecting an invitation is authorized by the same pending membership, and switching/opening inventory is authorized by an accepted active membership. SMS/mobile 2FA and authenticator-app MFA are out of scope for this version.

The switcher list endpoint and invitation responses must not expose `company_token`. Legacy company-token input or URL context is a preferred initial company selector only after DGFY authentication: if the authenticated DGFY account can access that company, preselect it; otherwise show the accessible company list with a no-access message. The switch mutation may return the normal IMS tenant-session payload after accepted-membership authorization because the browser still needs the existing tenant session contract. Refresh authority remains HttpOnly cookie based under ADR 0026.

IMS may load the same company-switching contract from a normal tenant session only when the current tenant user resolves through an accepted `DgfyAccountTenantMembership` row for the current tenant and tenant-local user id. This tenant-session bridge is an authorization bridge, not an identity-inference rule: the backend must not resolve the DGFY account from email or mobile matches alone. Mixed DGFY/IMS routes must distinguish token scope before authentication so a normal IMS tenant bearer token reaches tenant auth instead of being rejected as an invalid DGFY account token. If no accepted membership link exists, the switcher must fail closed and direct the user to sign in with DGFY or accept an invitation first. When an accepted membership exists, the IMS switcher must still render the current company even if it is the only available company; a missing DGFY account cookie may require re-authentication for cross-company actions, but it must not erase the active tenant from the current-company list.

Existing accepted tenant-local IMS/POS users without accepted DGFY memberships are a grace cohort only. They may keep direct tenant login until `LEGACY_TENANT_LOGIN_GRACE_END=2027-06-17` while `LEGACY_TENANT_LOGIN_GRACE_ENABLED=true`, and all login/current-user/user-list responses must expose DGFY link status and the deadline so IMS/POS can show remediation CTAs. Linking an existing tenant-local user to DGFY requires an authenticated legacy tenant session, a `dgfy_legacy_link` email OTP for the tenant-local email, and a signed-in DGFY account whose email exactly matches. The grace path must not create new non-DGFY users: direct tenant-user registration is disabled by default through `DGFY_LEGACY_TENANT_REGISTRATION_ENABLED`, legacy invitations remain disabled by default, and new invited users must be selected registered DGFY accounts. After June 17, 2027, unlinked legacy users are blocked until they create or link a DGFY account.

DGFY tenant-session creation must use the explicit accepted membership's `tenant_user_id`. Email lookup fallback is not a normal authorization path. If operators need to repair historical membership rows, that path requires `DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED=true` and must update the membership link instead of silently treating email as identity.

Platform admin assisted provisioning is the only exception to the public company-creation rule. Platform admin may create an ownerless tenant with `provisioning_source='platform_admin'` and `ownership_status='unassigned'` for platform-led IMS/POS setup, or create a DGFY account and tenant together. Ownerless tenants may be provisioned immediately, but they must not issue DGFY tenant sessions, POS sessions, switcher access, or owner actions until platform admin explicitly assigns an active DGFY account and an accepted membership. Force assignment is allowed only through platform-admin-authenticated routes, must target an existing active DGFY account id, must not infer ownership from email or phone, and must write tenant admin audit evidence.

The hardening contract for this rollout requires explicit proof for replay, failed authorization, and user-facing UI states. Legacy link completion writes accepted membership state, founder ownership bootstrap, email-to-tenant mapping, and success audit in a landlord transaction after OTP verification. If any landlord write fails, the link fails closed and writes a `legacy_link_failed` audit event for repair. DGFY account search is rate-limited and returns only safe identity fields. POS DGFY unlock writes separate `pos_unlock_attempted`, `pos_unlock_success`, and `pos_unlock_failed` audit events so hardware, permission, terminal registry, and membership failures can be distinguished during rollout. Ownership checks must use `tenants.owner_dgfy_account_id` when that field is present; `source='founder'` is only a legacy owner fallback while the owner field is empty, so a previous owner can leave as a member after ownership transfer.

## Consequences

- IMS Settings > Manage Users remains the source for adding invited company users, but it must invite existing DGFY accounts, not emails that become tenant-local login identities.
- DGFY users can see pending invitations, companies they own, and companies they were invited to in the DGFY account Business area. The IMS switcher must group owned companies separately from invited/member companies.
- Invited/member companies can be left by the DGFY account. Founder-owned companies cannot be left until ownership is transferred.
- Successful switching clears tenant-scoped frontend caches and lands on the IMS Dashboard.
- POS uses the same DGFY company-access contract: DGFY sign-in, accessible company selection, terminal/counter selection, and POS session creation from accepted membership plus existing terminal registry/location/capability gates.
- POS onboarding invokes the same DGFY account search/invitation contract with a server-owned `cashier` role and selected active tenant-location grants. It must not create a new tenant-local password identity.
- Company founders/master admins are POS-operator ready without changing their `admin` role or creating a duplicate cashier profile.
- POS uses active logical terminals/counters with location binding. Operator authentication, accepted membership, tenant-local authorization, POS permission, and location grants authorize use from any logged-in device; physical-device pairing is not a normal shift-open blocker.
- Legacy POS unlock is available only as a dated grace fallback for eligible existing users and must be presented separately from the DGFY POS drawer path.
- POS and IMS account changes are authentication boundaries. Changing identity after company resolution must clear the previous company list, selected tenant, tenant session, password, and stale lookup state before another login attempt. The ordinary POS drawer must not expose a separate tenant-local `Login as Cashier` action; DGFY cashiers use the same DGFY sign-in and company-selection path, while eligible historical users retain only the separately labelled legacy grace path.
- Switch success/failure and invitation accept success/failure are landlord-audited without secrets.
- IMS users who entered SKUpervisor through ordinary tenant auth can still see switcher choices when their tenant-local user is explicitly linked to a DGFY account membership. Legacy master-admin/founder tenant users can receive an accepted founder membership through the verified-email bootstrap; non-founder users without a membership link will see a closed-state message until a DGFY account invitation is accepted.
- Platform-admin owner assignment creates or updates explicit accepted membership state with `source='admin_handover'` and updates `tenants.owner_dgfy_account_id`; it does not edit DGFY email/password from tenant settings.

## Validation

Release validation must include DGFY account search tests, DGFY-only invitation tests, accept/reject tests, leave-company tests, ownership-transfer tests, platform-admin assisted provisioning and force-owner-assignment tests, POS-session tests, direct invite-link retirement tests, legacy-login grace and post-deadline blocking tests, company-list grouping tests, switch authorization tests, the IMS tenant-session membership bridge test, browser storage guards, and frontend IMS/Storefront/POS rendering tests.

The control matrix for this surface is `docs/testing/dgfy-company-access-security-control-matrix.md`. The rendered UI gate is `npm run smoke:dgfy-access-ui` after local IMS, Storefront, and POS dev or preview servers are running. It captures desktop and mobile screenshots under `.tmp/rendered-qa/dgfy-access`, writes `.tmp/rendered-qa/dgfy-access/dgfy-access-ui-smoke.json`, verifies nonblank pages, checks accessible labels, checks for framework overlays, exercises one visible control per surface when available, and fails on relevant console errors. By default the smoke records backend/API response failures as diagnostics so a frontend-only local stack can prove render quality; set `DGFY_ACCESS_STRICT_NETWORK=true` in seeded staging or a full local stack to fail on 5xx network responses. If local backend HTTPS enforcement is enabled behind simulated TLS termination, set `DGFY_ACCESS_FORWARDED_PROTO=https` so only localhost API requests receive `x-forwarded-proto=https`. Seeded text assertions can be supplied with `DGFY_ACCESS_POS_EXPECT_TEXT`, `DGFY_ACCESS_AUTH_EXPECT_TEXT`, and `DGFY_ACCESS_ACCOUNT_EXPECT_TEXT`. Development tenant auto-login is opt-in through `VITE_DEV_AUTO_LOGIN_ENABLED=true` and must not run on DGFY auth or POS terminal-lock routes. Production readiness remains capped below 9/10 until seeded staging or production UAT proves founder ownership, transferred former-owner membership, invited membership, pending/rejected invitations, legacy unlinked and linked users, POS allowed terminal unlock, POS terminal-policy denial, telemetry, and rollback behavior end to end.

## Amendment (v2.1 Phase 13.5 Staff Authentication Model Correction, 2026-07)

The v2.1 Legacy Data Migration milestone corrects this ADR's staff-authentication
model for DGFY tenant businesses. Staff authentication is tenant-local-first:
a business may invite or create a staff user scoped to that business, and that
staff user may authenticate to that single business without first owning or
linking a global DGFY account. Tenant-local credentials live in the same tenant
database in `staff_credentials`, a 1:1 table for `staff_accounts`; password and
POS approval PIN hashes are never stored on `staff_accounts` itself. Linking a
tenant-local staff profile to a global DGFY account through
`account_staff_assignments` is optional. When present, that link enables unified
DGFY identity and company switching; when missing or pending, it does not
invalidate the tenant-local staff account or its tenant-local login.

The following original ADR 0028 rules are superseded or reframed for staff
access:

1. "IMS user invitations are DGFY-account invitations" and "tenant-local
   password setup for invited business users are retired by default" are
   superseded. Staff invitations create tenant-local staff records with
   tenant-local credential setup. DGFY account linking is a separate optional
   step.
2. "New invited users must be selected registered DGFY accounts" and the
   `LEGACY_TENANT_LOGIN_GRACE_END=2027-06-17` post-deadline blocking frame are
   superseded/reframed. Unlinked tenant-local staff are a permanent supported
   state, not a dated grace cohort. `LEGACY_TENANT_LOGIN_GRACE_ENABLED` and
   `LEGACY_TENANT_LOGIN_GRACE_END` keep their existing runtime names for
   legacy rollout behavior, but their presence must not be read as a future
   removal of tenant-local staff login.
3. POS DGFY unlock and IMS switcher language that treats tenant-local login as
   a dated fallback is reframed. DGFY unlock and switching remain features of
   linked staff; tenant-local login is the baseline staff-authentication path,
   not a fallback.
4. The validation expectations named in this ADR for DGFY-only invitations and
   direct invite-link retirement are superseded for staff access. They no
   longer describe required behavior where tenant-local staff invitations and
   credential setup are the intended path.
5. `DGFY_LEGACY_TENANT_REGISTRATION_ENABLED` and
   `DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED` are not renamed. Direct tenant-user
   registration and email-repair behavior remain controlled by their existing
   rollout gates, but these flags do not make DGFY accounts mandatory for staff
   authentication and do not authorize email/phone inference for DGFY linking.

The following rules do not change:

1. Explicit accepted-membership evidence remains the only basis for DGFY
   account linking, company switching, tenant-session bridging, leave-company,
   invitation acceptance, and ownership-transfer flows. Email or phone matches
   alone must never create or authorize a DGFY membership, assignment, switch,
   or tenant session.
2. Public account-picker, invitation, switcher, and discovery payloads must not
   expose `company_token`.
3. Ownership transfer still requires current-owner authorization and
   `dgfy_business_step_up`.
4. The IMS tenant-session bridge for linked accounts still requires an accepted
   membership row; it remains an authorization bridge, not an identity-inference
   rule.

Migration preserves tenant-local staff login intentionally. Legacy tenant
`users.password_hash` values that are real bcrypt hashes are copied
byte-for-byte into `staff_credentials`; they are never re-hashed and never
logged. Legacy placeholder or pending values are not copied as credentials.
Those users receive `credential_status='reset_required'` and a structured
`staff_credential_reset_required` finding whose remediation is the
tenant-local reinvite/reset path through `staff_invitations`. Legacy invitation
tokens are legacy-URL-bound secrets and are never carried over. The mirrored
field-level migration rules live in
`docs/database/dgfy-data-migration-map.md`.

At the time of this amendment, `status: accepted` was preserved; this was an
amendment, not a revision of the original decision history.

## Amendment (2026-09-17): Environment-only development auto-login (Phase 381)

Development auto-login remains a local-only convenience and stays opt-in behind
the existing development flags. Its email, password, and company token must now
be supplied explicitly through ignored local environment variables; no source,
committed environment example, login screen, or E2E helper may provide fallback
credentials. IMS and standalone POS production builds fail when development
auto-login is enabled or any of its credential variables are configured. This
preserves normal cookie/session authentication and the existing route exclusions
while preventing development credentials from reaching production artifacts.

## Amendment (2026-09-14): Optional Strict POS Device Access (Phase 345)

- The consequence that POS may authorize an operator from any logged-in device
  remains the default when a tenant's strict device policy is disabled.
- A tenant may opt into the separate POS device-access contract in
  `docs/features/POS_DEVICE_LOCATION_ACCESS_CONTRACT.md`. When enabled, an
  enrolled device proof is an additional POS-session and protected-operation
  gate. It does not change DGFY membership, staff credentials, company
  switching, IMS access, Storefront access, or tenant isolation.
- Branch scope remains the terminal's tenant `location_id` plus the operator's
  location grant. The policy does not infer company access from a GPS, IP,
  Wi-Fi, email, phone, or client fingerprint claim.
- This is a policy amendment only. Runtime enrollment and enforcement are
  deferred to Phases 346-350.

## Amendments

### 2026-10-22 — Linked credential synchronization and tenant-scoped POS login (#2645)

#### Scope, stacks, and credential model

This amendment specifies credential behavior for the current `sku_*` API runtime, which stores
tenant credentials in `users.password_hash` and still applies
`LEGACY_TENANT_LOGIN_GRACE_ENABLED` and `LEGACY_TENANT_LOGIN_GRACE_END=2027-06-17`. It does not
change that runtime gate. The v2.1 migration target for `dgfy_business_*` uses `staff_accounts` and
`staff_credentials`; its permanent tenant-local-first rule governs that target and remains in
force. Its explicit link model uses `account_staff_assignments`, not
`DgfyAccountTenantMembership`; a future implementation in that stack must use its own explicit
`status='active'` assignment derived from an accepted source membership and must not infer a link
from email. Until that target replaces the `sku_*`
runtime, the two stacks must not be described as though they use the same schema or grace policy.

A DGFY account is the global identity. A tenant `users` row remains the tenant authorization profile
and stores the tenant credential used by tenant-local surfaces. For a user with an accepted
`DgfyAccountTenantMembership`, the DGFY account is the credential of record for DGFY authentication
and the tenant hash is the credential of record for that active tenant's local authentication; when
synchronized, the hashes represent one user-managed credential. A user without an accepted
membership has only a tenant-local credential of record. Email or phone equality alone never
changes either classification. Hashes may be copied byte-for-byte only between a DGFY account and
the tenant user identified by an accepted membership; never by email match, never to an unlinked
tenant, and never as plaintext.

#### Synchronization and consistency

A DGFY self-service password change, after current-password verification or equivalent
current-account reauthentication, and a completed DGFY password reset enqueue propagation to every
accepted membership's exact `tenant_user_id`, with one tenant-database write and audit result per
membership. A tenant self-service password change may propagate only after the current tenant
password is verified and the user explicitly completes that change. Propagation is best-effort per
tenant: one unreachable tenant does not roll back or fail the DGFY password change or prevent
updates to other tenants.

A durable retry or recurring reconciliation process must retry pending destinations, compare
`dgfy_accounts.password_hash` with each linked `users.password_hash` byte-for-byte, and record
success or failure for each tenant without logging either hash. This runtime comparison is between
`dgfy_accounts.password_hash` and `users.password_hash`; if this contract is later adopted by the
`dgfy_business_*` target, its comparison must use `staff_credentials.password_hash` and that
stack's explicit active assignment. Convergence target is 15 minutes for a reachable tenant. If a
destination remains unreachable for 15 minutes, mark the pair stale, alert for repair, and keep
retrying; do not report global convergence while any accepted membership is pending. An outage can
extend actual staleness beyond 15 minutes, so the outstanding mismatch remains an explicit
operational risk until that tenant is reachable and reconciled.

#### Tenant-admin reset boundary

`resetLocalCashierPassword` must not change the DGFY password or fan a tenant-admin-selected
password out to other tenants for a linked user. For a linked user, the admin action starts the
existing DGFY password-reset email flow to the DGFY account's verified address; it does not set a
tenant temporary password. If that account has no eligible reset destination, fail closed and
direct the account owner to DGFY recovery. An unlinked tenant user may continue to use the
tenant-local reset flow.

A tenant-local password that already exists from an older admin reset remains usable only on its
own tenant surface under the dual-accept rule. Login reconciliation must never promote that hash to
DGFY or another tenant.

#### Tenant-surface authentication and drift repair

On `/api/v1/auth/login` and the POS legacy-unlock path, verify the active tenant user's local hash
first. If it fails, verify the linked DGFY hash only when an accepted membership matches both the
active `tenant_id` and that exact `tenant_user_id`. Do not search or authenticate against another
tenant. `/api/v1/dgfy/auth/login` accepts only the DGFY account password; it never accepts a
tenant-local password. An email-only match never enables DGFY-password acceptance.

Record `legacy_login_allowed` metadata identifying the active tenant and whether the tenant or
linked DGFY credential matched; do not include plaintext, hashes, reset tokens, or bearer tokens.
Both password checks within one tenant-surface request count as one failure against that request's
tenant-scoped limiter bucket. During divergence, both valid passwords may work on the linked tenant
surface, so an old tenant password can remain usable after a DGFY reset until sync converges (or
longer during a tenant outage).

If the linked DGFY password verifies on a tenant surface and the active tenant hash differs, enqueue
the verified DGFY hash for the normal accepted-membership fan-out and audit each destination. If
only the tenant-local hash verifies, preserve access to that active tenant and record the drift,
but do not promote the tenant hash to DGFY during login; require DGFY recovery before DGFY
authentication or an explicit authenticated self-service password change. If there is no accepted
membership, the DGFY credential is not considered and the tenant user must use the tenant-local
recovery path. This preserves access without allowing a historic tenant-admin reset to become a
cross-tenant credential change. The known 2026-10-21 drift case is therefore recoverable by the
verified DGFY credential where the membership exists, or by an account reset when it does not.

#### Multi-tenant POS routing

The active tenant context is authoritative for a tenant-surface login. `/api/v1/auth/lookup` must
not return `company_token`; it returns display-only company choices and, if needed to bind the next
request, a short-lived opaque selection handle that cannot authorize a tenant session by itself.
Apply these routing cases:

| Context and lookup result | Required behavior | User-facing copy |
| --- | --- | --- |
| Active tenant; email resolves within it | Stay in the active tenant even if lookup reports other companies. | Continue within the active company. |
| Active tenant; email does not resolve within it | Return an error naming the active company; never switch silently. | “We couldn't sign you in to {company}. Check the email and password, or go back to choose another company.” |
| No active tenant; one matching company | Select that company before password submission. | Continue to the one matching company. |
| No active tenant; multiple matching companies | Require an explicit company choice before asking for a password. | “Choose a company before entering your password.” |
| Lookup timeout or 5xx; active tenant exists | Use only the already-active token; do not resolve another tenant. | Retry lookup or continue with the active company. |
| Lookup timeout or 5xx; no active tenant | Stop; do not guess from a partial or stale result. | “We couldn't load company choices. Try again.” |

#### Rate-limit partitioning

Key DGFY login buckets by DGFY credential surface, IP, and a normalized or hashed email key (for
example, `auth:login:dgfy:<ip>:<emailKey>`). Key tenant login buckets by active tenant id, IP, and
the same normalized or hashed email key (for example,
`auth:login:tenant:<tenantId>:<ip>:<emailKey>`). A tenant request that checks both tenant and
linked DGFY hashes consumes one tenant-bucket attempt. Failures in one tenant therefore do not
exhaust another tenant's bucket or the separate DGFY login bucket.

#### Security review and lifecycle

Compromise of one linked tenant database can expose a copied hash usable against the DGFY account
and other linked tenants; this wider blast radius is accepted for the selected sync model. Limit
copies to accepted memberships and exact user ids, preserve configured bcrypt cost by copying the
hash byte-for-byte, and audit every per-tenant copy without recording secrets. Keep reset tokens
short-lived, single-use, and replay-safe. Password change and reset must follow the applicable
session-revocation policy; logout clears tenant and DGFY session context. Lookup and audit payloads
contain no password hashes, plaintext, reset secrets, or `company_token`. These are implementation
obligations; this amendment itself changes no runtime behavior.

#### Migration strategies evaluated

| Option | Migration cost | Risk and reversibility | Decision |
| --- | --- | --- | --- |
| Synchronize linked hashes | Lowest schema cost; requires per-tenant fan-out, retry, and drift monitoring. | Keeps both stores and tenant-local staff access; reversible by stopping propagation, with the accepted wider hash blast radius. | Chosen. |
| Hybrid: linked users DGFY-only; tenant hash uses `DGFY_ACCOUNT_AUTH_ONLY` | Moderate auth and recovery changes; unlinked users retain tenant-local credentials. | Reduces duplicate linked hashes but couples tenant auth to DGFY availability; reversal requires restoring hashes or resetting passwords. | Considered, not chosen. |
| DGFY-only for all human login; retire or neutralize tenant hashes | Highest account-linking, migration, and recovery cost. | Disrupts unlinked staff and is the least reversible because local credential retirement cannot be undone without resets. | Considered, not chosen. |

The selected strategy keeps `users.password_hash` `NOT NULL`; tenant `password_hash` retirement is
not scheduled. Pat selected synchronization to preserve tenant-local staff access and the
no-lockout rule. The standalone Storefront `StoreCustomer` authentication store remains outside
this contract.

#### Deferred implementation and verification

This is an architectural proposal, not runtime delivery. Follow-up work must implement
propagation/retry and per-tenant audit, dual acceptance and drift telemetry, active-tenant POS
routing and lookup payload changes, rate-limit partitioning, and linked-admin-reset behavior.
Release evidence must cover success and failure for each linked tenant, stale-hash reconciliation,
rejection of email-only links and cross-tenant attempts, reset-token replay, session cleanup, and
the user-facing routing states.
