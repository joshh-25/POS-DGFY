---
status: reference
authority_level: reference
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: partner_integration_administration
topic: partner_integration_administration_matrix
---

# Partner Integration Administration and Tenant Attachment Matrix

This is the permission and surface definition for issue [#2379](https://github.com/Sieitzz/dgfy-platform/issues/2379).
It records first-release decisions alongside the generic wire contract in
[`PARTNER_INTEGRATION_CONTRACT.md`](PARTNER_INTEGRATION_CONTRACT.md). The contract in #803 owns
wire-level behavior, including the 24-hour offline authorization window and quarantine rules;
this document assigns administrative authority and does not restate those protocol details.

The linked ADR 0092 is `proposed`. This matrix is supporting reference material until that ADR is
accepted. The permission names below are proposed contract names, not claims that the routes or
checks already exist. Every protected API must enforce the stated checks server-side before its
surface is enabled.

## Actors

| Actor | Identity and boundary |
| --- | --- |
| Platform Master | The immutable landlord Platform Admin identity defined by ADR 0047. Sole authority for delegated Platform Admin account and page-grant administration. |
| Delegated Platform Admin | Landlord Platform Admin with the `admin.partner_integrations` page grant. Its server-resolved live grant controls access; a menu or client claim grants nothing. |
| Merchant owner/admin | Authenticated tenant user with the existing owner/admin-like authority recognized by `businessAdminAccessPolicy.js` and the applicable tenant permission checks. |
| Tenant staff (non-owner) | Authenticated tenant user without owner/admin authority. May receive only explicitly granted, non-owner OPIS visibility or operational permissions; cannot consent, change scopes, or administer credentials by role assumption. |
| Partner developer | Human working for a partner organization. No first-release DGFY Admin, OPIS, or portal access. DGFY operators onboard approved pilots. |
| Application identity | A registered deployment client (browser, machine, or service) authenticating as its client identity. Its credential proves client identity only; API authorization also requires an active App, active client, active tenant/location attachment, scope, and server-resolved tenant/location context. |
| DGFY support | Support operator acting under a separately authorized, tenant- and purpose-scoped support path. No standing cross-tenant connection, health, or audit access. |

The **App ID**, a deployment **client**, an **attachment** for a tenant/location, and a **tenant staff
permission** are separate identities and grants. A caller-supplied App ID, tenant header, client
identifier, or browser surface selector is never authorization. The API resolves identity and
scope from authenticated server-side records and the caller's accepted session or client
credential.

## Objects in scope

| Object | Administrative meaning |
| --- | --- |
| Partner organization | DGFY-approved pilot organization; registration is operator-managed in first release. |
| App | Stable, named integration identity owned by a partner organization; approval is a platform decision. |
| Deployment client | Browser, machine, or service registration belonging to one App, with its own origin/credential lifecycle. |
| Credential | Secret or key material for one client; does not itself grant tenant or API scope. |
| Tenant/location attachment | A merchant-consented grant connecting one approved App to an explicit tenant and selected locations. |
| Scope | The least-privilege operation set granted on an attachment and enforced by the API. |
| Engine authority | The selected operational engine for one location, governed by #803 and tenant/location checks. |
| Sync entitlement | Platform plan/entitlement authority and its allowed sync-round choices; runtime semantics remain owned by #1484/#803. |
| Allocation ceiling | Merchant configuration bounded by platform plan and #997/#998 allocation policy. |
| Offline terminal allocation | A server-governed allocation held by a terminal; recovery/quarantine follows #803 and #997/#998. |

## Permission matrix

`A` means allowed, `D` denied, and `C` allowed only under the stated condition. The final column
names the mandatory server-side decision; UI visibility is never the enforcement point. Tenant
staff access is limited to explicit existing tenant permissions and does not imply owner authority.

| Action | Platform Master | Delegated Platform Admin | Merchant owner/admin | Tenant staff | Partner developer | Application identity | DGFY support | Mandatory server-side check |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Register partner organization or App | A | C | D | D | D | D | D | Landlord Platform Admin session; Master or live `admin.partner_integrations` grant; unique App identity and audit. |
| Approve or retire App | A | C | D | D | D | D | D | Same page grant; allowed lifecycle transition; approval/retirement audit. |
| Register deployment client | A | C | D | D | D | D | D | Active approved App; live Platform Admin grant; client type/origin validation; landlord audit. |
| Issue, rotate, or revoke client credential | A | C | D | D | D | D | D | Active registered client and live page grant; secret/key service; state transition; landlord audit; secret redaction. |
| Suspend or unsuspend client platform-wide | A | C | D | D | D | D | D | Live page grant; explicit client state transition; invalidate new authentication; do not silently change other clients; landlord audit. |
| Consent to attach an approved App to tenant/locations/scopes | D | D | A | D | D | D | C | Authenticated tenant owner/admin; explicit tenant, location, and scope selection; server tenant membership and scope ceiling; tenant audit. Support cannot consent for a merchant. |
| Change attachment scopes | D | D | A | D | D | D | C | Same tenant owner/admin check; active attachment; scope subset allowed by approved App and contract; tenant audit. |
| Change engine authority for a location | D | D | C | D | D | D | C | Tenant owner/admin, location ownership, #803 engine rules, and safety/state preconditions; audit. Support may assist only through a scoped, approved, audited support path. |
| Disconnect/revoke one tenant attachment | D | D | A | D | D | D | C | Tenant owner/admin and tenant-scoped attachment lookup; revoke only that attachment; apply #803 queued-work/quarantine behavior; tenant audit. |
| Set plan/entitlement and sync-round eligibility (2/5/10 or premium real-time) | A | C | D | D | D | D | D | Platform plan authority; allowed plan transition; entitlement recorded in landlord store; premium real-time remains platform-controlled. |
| Select eligible sync-round setting within tenant plan | D | D | C | D | D | D | D | Tenant owner/admin; server checks plan-allowed 2/5/10 choice; runtime counting remains #1484/#803; tenant audit. |
| Set allocation ceiling within plan and #997/#998 policy | D | D | C | D | D | D | D | Tenant owner/admin; tenant/location ownership; plan and allocation-policy bounds; tenant audit. |
| Recover or quarantine an offline terminal allocation | D | D | C | D | D | D | C | Server-side terminal/location binding and #803/#997 reconciliation state. Owner/admin may request recovery; release requires safe reconciliation. Support action requires scoped authorization, reason, and audit. |
| View connection, credential, sync, and allocation health | A | C | A | C | D | C | C | Platform view is grant-scoped and redacted; OPIS view is current-tenant/location scoped; staff needs an explicit existing tenant permission; client sees only its own authorized operational status; support is scoped and audited. |
| View platform audit | A | C | D | D | D | D | C | Landlord audit permission and live page grant; support access is separately authorized and audited. |
| View tenant attachment audit | D | D | A | C | D | D | C | Tenant audit reader permission within active tenant context; no landlord-wide query; support requires scoped authorization and reason. |
| Use partner administration portal | D | D | D | D | D | D | D | No first-release portal or self-registration route exists. Revisit only when #796 schedules a portal slice and its identity, support, and security model is approved. |

### Platform Admin grant boundary

Platform Master alone creates/suspends/reactivates delegated Platform Admins and grants or removes
page permissions, including `admin.partner_integrations`, consistent with ADR 0047. A delegated
admin with that live page grant may perform the explicitly listed App/client administration actions,
including App approval and credential issue/rotation/revocation, but may never self-grant, alter
another admin's page grants, consent for a merchant, or manage tenant attachment scopes. Platform
plan and entitlement changes are platform-only; they are listed separately from the general page
administration grant and must use the server's plan authority.

## Lifecycle and effects

The states below define administrative intent. #801 owns backend credential/attachment state
transitions; #803 owns contract and queued offline-work behavior. A failed transition must leave
the prior authorization state intact and produce an auditable result.

| Object and transition | Who triggers | Effect on new grants and calls | Effect on queued/offline work | Effect on other clients or attachments |
| --- | --- | --- | --- | --- |
| App: `draft → approved` | Platform Master or delegated admin with live page grant | Enables client registration and future merchant consent after approval; does not create tenant access by itself. | No effect on existing queues because no attachment is implied. | Other Apps are unaffected. |
| App: `approved → suspended → approved` | Platform Master or delegated admin with live page grant | Suspension blocks new client authentication and new attachments for this App. Unsuspension restores eligibility only; it does not recreate revoked grants. | Existing queued work is handled by #803's bounded authorization/reconciliation rules; no silent stock release. | Applies platform-wide to all clients under the App; other Apps remain unaffected. |
| App: `approved/suspended → retired` | Platform Master or delegated admin with live page grant | Permanently blocks new clients and attachments; retirement requires an explicit plan for existing clients/attachments. | Existing work remains subject to #803 reconciliation and quarantine; retirement does not erase evidence. | All clients under the App are affected; unrelated Apps remain unaffected. |
| Client: `issued → active` | Platform Admin with live page grant | Activates only this registered client; it receives no tenant scope until an attachment is separately consented. | None before attachment. | Other clients are unaffected. |
| Client: `active → rotating → active` | Platform Admin with live page grant | New credential is issued once; any overlap is bounded and configured by #801. Old credential is rejected after the overlap ends. | Already accepted operations follow #803 idempotency and authorization rules. | Only this client changes. |
| Client: `active → suspended → active` | Platform Admin with live page grant | Suspension blocks this client platform-wide; reactivation does not restore expired or revoked attachment grants. | Preserve and reconcile/quarantine queued work per #803; never assume a terminal did not sell. | Only this client is suspended, across all its attachments. |
| Client: `active/suspended → revoked` | Platform Admin with live page grant | Credential becomes unusable and cannot be reactivated; replacement requires a new authorized issuance. | Queued work remains subject to #803's window and quarantine rules. | Only this client is affected; other clients remain usable unless the App itself is suspended/retired. |
| Attachment: `proposed → consented → active` | Merchant owner/admin | Creates tenant/location/scope grant only after explicit consent and server validation. | Queued work is permitted only under the #803 contract and applicable authorization window. | Only the named tenant, locations, scopes, and client/App association are granted. |
| Attachment: `active → suspended → active` | Merchant owner/admin; scoped support may request/operator-assist | Stops new grants/calls on this attachment while preserving other tenant attachments and other clients. | Preserve queued work; apply #803 expiry/quarantine and reconciliation rules. Reactivation requires current consent and valid platform/client state. | Tenant/location attachment only. |
| Attachment: `active/suspended → disconnected/revoked` | Merchant owner/admin; support only through approved scoped action | Revokes this tenant's attachment and rejects new calls for its tenant/location scope. Reconnection requires fresh consent. | Existing queued work is retained and reconciled/quarantined under #803; never auto-release uncertain allocation. | Other tenants' attachments and other clients are unaffected. |
| Credential revocation (independent of attachment state) | Platform Admin with live page grant | Rejects authentication by that credential everywhere it was registered. | Does not delete accepted operation records or waive reconciliation. | Affects only that credential/client; merchant disconnection is a separate tenant action. |

**Three different controls:** suspending a client is platform-wide for that deployment client;
disconnecting an attachment is tenant-scoped to selected locations/scopes; revoking a credential
invalidates that credential. None substitutes for the others, and each has its own audit event.

## Surface ownership

| Surface | First-release responsibility | Explicit exclusions and enforcement boundary |
| --- | --- | --- |
| DGFY Admin (`apps/dgfy-admin`) | Approved-pilot partner/App/client registration and approval; platform credential lifecycle and client suspension; platform audit; plan/entitlement authority. | Landlord identity/page RBAC per ADRs 0047/0089. No merchant connection browsing or cross-tenant CRM workspace. |
| OPIS (`apps/dgfy-opis`) | Merchant owner consent for an approved App at explicit tenant/locations/scopes; inspect redacted connection, credential, sync, and allocation health; disconnect/revoke tenant access; set bounded allocation ceilings and eligible 2/5/10 sync-round inputs. | Tenant-session and server-side tenant/location permissions per ADR 0087. OPIS cannot approve Apps, issue platform credentials, or grant premium real-time entitlement. |
| API | Enforce every identity, page grant, tenant membership, location, scope, lifecycle, entitlement, and audit rule on direct requests. | API behavior and wire contract belong to #803; client registry to #2311; credentials/attachments to #801; browser origins to #802. A UI route or header is never authorization. |
| Partner portal | Deferred in first release. DGFY operators onboard approved pilots and handle partner credential administration. | No marketplace, self-registration, partner credential UI, webhooks console, or partner support workspace. Revisit only as a scheduled #796 candidate with an approved identity and authorization design. |

## Audit requirements

Audit stores are separate: platform administration events go to landlord/platform audit; merchant
attachment and configuration events go to that tenant's `audit_logs`. The event names are proposed
stable names for #801/#2311 implementation; actual columns follow each store's established schema.
Audit writes must be durable before a mutation is reported successful.

| Event name | Store | Actor | Record |
| --- | --- | --- | --- |
| `partner.organization.registered` | Landlord | Platform Master/delegated admin | organization ID, actor ID, time, reason/reference |
| `partner.app.registered`, `partner.app.approved`, `partner.app.suspended`, `partner.app.unsuspended`, `partner.app.retired` | Landlord | Platform Master/delegated admin | App ID, prior/new state, actor ID, time, reason |
| `partner.client.registered`, `partner.client.suspended`, `partner.client.unsuspended` | Landlord | Platform Master/delegated admin | client ID/type, App ID, prior/new state, origin metadata where applicable, actor ID, time, reason |
| `partner.credential.issued`, `partner.credential.rotated`, `partner.credential.revoked` | Landlord | Platform Master/delegated admin | client ID, credential key/version ID (not value), operation, actor ID, time, outcome |
| `partner.attachment.consented`, `partner.attachment.scopes_changed`, `partner.attachment.suspended`, `partner.attachment.reactivated`, `partner.attachment.disconnected`, `partner.attachment.revoked` | Tenant | Merchant owner/admin | tenant and location IDs, App/client IDs, scope names, prior/new state, actor ID, time, reason |
| `partner.engine_authority.changed` | Tenant | Merchant owner/admin or scoped support actor | tenant/location IDs, prior/new authority, actor ID, time, reason, applicable request/reference ID |
| `partner.sync_round_setting.changed`, `partner.allocation_ceiling.changed` | Tenant | Merchant owner/admin | tenant/location IDs, prior/new allowed setting, actor ID, time, plan/policy version reference |
| `partner.offline_allocation.quarantined`, `partner.offline_allocation.recovered` | Tenant | Authorized recovery actor | tenant/location/terminal/allocation IDs, reconciliation outcome, actor ID, time, reason, operation reference |
| `partner.health.viewed`, `partner.audit.viewed`, `partner.support_access.granted`, `partner.support_access.used` | Corresponding landlord or tenant store | Admin, tenant reader, or scoped support actor | resource scope, actor ID, purpose/reason where required, time, outcome; no secret or payload contents |

Never store or emit passwords, raw credentials, bearer/refresh tokens, cookies, CSRF values, private
keys, secret material, raw IP addresses, or raw user-agent strings in audit records. Do not copy
partner payload bodies into audit. Use identifiers, event metadata, and safe request correlation
references instead, consistent with ADR 0047 and `modules/audit/README.md`.

## Secret handling

- Show a newly issued client secret once. The response must not expose it again; rotation creates a
  new secret and a separate auditable credential version.
- Store opaque shared-secret verifiers as one-way hashes. Store private signing keys only in an
  approved secret store/HSM and retain references/metadata in the registry; never return private
  keys through an API or UI. Client-held signing keys remain client-held.
- Never include secrets, private keys, access/refresh tokens, cookies, or raw credentials in API
  responses after issuance, application logs, traces, error details, or audit.
- Rotation may permit only the bounded overlap configured by #801. Record the overlap policy and
  credential version IDs; reject the old credential after expiry. This matrix does not choose a
  rotation duration.
- Credential revocation and client suspension are separate lifecycle controls. Revoke compromised
  material immediately; use suspension when the deployment client itself must stop authenticating.

These rules align with ADR 0079's separation of credential purposes and #801's credential
lifecycle. They do not authorize sharing DGLaundry keys or runtime credentials with a generic
partner registry.

## Tenant isolation and least privilege

- Every attachment, health lookup, audit query, allocation action, and mutation is resolved from
  the authenticated server-side tenant/location context. A tenant header can select context only
  when independently validated; it cannot grant access.
- OPIS list, detail, and health queries must be tenant/location scoped in the repository/use case;
  no cross-tenant attachment, audit, credential-health, or sync-state reads are exposed to merchants
  or tenant staff.
- Platform Admin may see only the platform records permitted by its landlord page grant. It is not
  a cross-tenant CRM workspace. Customer fields, identity joins, and customer permissions belong to
  #2378 under #1354.
- Partner developers have no first-release interactive surface. Application identities receive
  only active, consented attachment scopes and cannot enumerate tenants, infer another attachment,
  or elevate from an App ID/client identifier.
- Support access is deny-by-default, purpose-scoped to a named tenant/location, time-limited by the
  supporting authorization mechanism, and audited in the store corresponding to the accessed
  resource. A support role alone does not confer tenant data access.
- Tenant staff may receive read-only health/audit visibility only through an existing explicit
  tenant permission. No new staff role or permission vocabulary is introduced by this matrix.

## Dependencies and candidate follow-up slices

These are candidates for the #796 slate, not newly filed issues. #796 schedules the implementation
slices; this table names the backend prerequisite and owning surface for that planning.

| Candidate slice | Backend dependency | Owning surface |
| --- | --- | --- |
| Partner/App registry and platform approval controls | #2311 registry substrate; #801 lifecycle records | DGFY Admin |
| Client origin registration and browser-client controls | #2311 client registry; #802 origin registration | DGFY Admin |
| Platform credential issue/rotation/revocation and client suspension | #801 credential lifecycle; #2311 client identity | DGFY Admin |
| Merchant App discovery, consent, scopes, and attachment lifecycle | #801 attachment lifecycle; #803 contract and consent vocabulary | OPIS |
| Per-location engine authority controls | #803 engine/attachment contract; #801 attachment state | OPIS |
| Plan entitlement and sync-round eligibility administration | #1484 sync accounting; #803 sync contract | DGFY Admin |
| Merchant sync-round selection and allocation ceilings | #1484 sync accounting; #997/#998 allocation policy; #803 bounds | OPIS |
| Offline terminal allocation quarantine/recovery controls | #997/#998 allocation state; #803 offline authorization and reconciliation | OPIS, with scoped support actions through DGFY Admin/API |
| Tenant customer linkage and field permissions for partner flows | #2378 CRM/customer permission contract; #803 customer section | OPIS |
| Partner self-service portal discovery/design, if rescheduled | #2311, #801, #802, and #803 accepted contracts | Future partner portal; not first release |

## References

- [ADR 0092](../architecture/adr/0092-partner-integration-administration-and-tenant-attachment.md) — proposed surface and identity boundary.
- [ADR 0047](../architecture/adr/0047-platform-admin-identity-and-page-rbac.md) and [ADR 0089](../architecture/adr/0089-platform-admin-fifth-frontend-app-cross-host-admin-routing.md) — landlord identity, page RBAC, and Admin surface.
- [ADR 0087](../architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md) — OPIS ownership and tenant surface.
- [ADR 0079](../architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md) — existing DGLaundry-specific provider boundary.
- [ADR 0035](../architecture/adr/0035-compatibility-seam-governance.md) — compatibility seam governance.
- [Partner integration contract](PARTNER_INTEGRATION_CONTRACT.md) — authoritative wire contract, owned by #803.
- Related issues: [#2311](https://github.com/Sieitzz/dgfy-platform/issues/2311), [#801](https://github.com/Sieitzz/dgfy-platform/issues/801), [#802](https://github.com/Sieitzz/dgfy-platform/issues/802), [#803](https://github.com/Sieitzz/dgfy-platform/issues/803), [#997](https://github.com/Sieitzz/dgfy-platform/issues/997), [#998](https://github.com/Sieitzz/dgfy-platform/issues/998), [#1484](https://github.com/Sieitzz/dgfy-platform/issues/1484), [#2378](https://github.com/Sieitzz/dgfy-platform/issues/2378), and [#796](https://github.com/Sieitzz/dgfy-platform/issues/796).
