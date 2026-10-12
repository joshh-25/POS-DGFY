---
status: reference
authority_level: reference
owner: product-and-architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: tenant_customer_crm
topic: tenant_customer_crm_foundation
---

# Tenant CRM foundation and partner-customer contract

This document defines a proposed tenant-scoped customer contract for future implementation. It is
not an API or privacy policy, and the proposals below do not change existing behavior until the
proposed [ADR 0091](../architecture/adr/0091-tenant-scoped-customer-crm.md) is accepted and its
implementation is scheduled. Privacy decisions remain with #243; partner API delivery remains with
#796 and #803.

## 1. Current-state map

### OPIS and tenant API

- OPIS renders the customer list and detail in
  [`BusinessAdminPage.jsx`](../../apps/dgfy-opis/src/features/businessAdmin/BusinessAdminPage.jsx).
  The current workspace supports profile creation, purchase-frequency/spend analytics, favorites,
  and recent orders. The loyalty banner is explanatory text; this workspace does not fetch customer
  loyalty data.
- [`businessAdminService.js`](../../apps/dgfy-opis/src/features/businessAdmin/businessAdminService.js)
  and the customer API client expose list, create, and detail calls. The tenant-authenticated routes
  in [`businessAdmin.js`](../../apps/dgfy-api/src/routes/businessAdmin.js) are `GET /customers`,
  `POST /customers`, and `GET /customers/:profileRef`. No customer update, archive/deactivate,
  merge, explicit link/unlink, notes, tags, consent, or customer export operation exists.
- The API's `businessAdminCustomer*UseCase.js` files own validation/orchestration and
  [`businessAdminCustomerRepository.js`](../../apps/dgfy-api/src/modules/businessAdmin/repositories/businessAdminCustomerRepository.js)
  owns the SQL projection and writes. `profile_ref` currently resolves to either a linked
  `store_customer_id` reference or a hash of contact/name snapshot values; the snapshot form can
  change when those values change. `global_identity_linked` is currently returned as `null`.
- Customer creation currently requires a unique email, creates a tenant `store_customers` row with
  `password_hash = 'PENDING_INVITATION'` and an invite-required account status, and does not write a
  customer-specific audit event or permission record.

### Tenant and landlord data

- DGFY uses database-per-tenant storage; tenant customer rows do not use a shared `tenant_id` row
  discriminator. [`StoreCustomer.js`](../../apps/dgfy-api/src/models/StoreCustomer.js) maps
  `store_customers` with tenant-local email, name, phone, password state, optional
  `dgfy_account_id`, activity state, and login metadata. `customer_addresses` is separately
  tenant-local.
- POS transactions store optional `store_customer_id` alongside customer name, phone, and email
  snapshots. Service bookings and F&B reservation requests also carry customer contact snapshots.
  Hospitality uses its mode-owned guest profile/reservation records. These historical order and
  booking snapshots are not a customer master record and must remain interpretable if a profile is
  later edited, deactivated, linked, or merged.
- Landlord `DgfyAccount` and `DgfyCustomerActivity` support explicit global-account activity
  history across tenants; `DgfyLoyaltyTransaction` is DGFY-account-scoped. ADR 0023 keeps account
  activity and loyalty separate from tenant CRM. No tenant loyalty read/write API is introduced by
  this definition.
- POS cashier sales currently persist customer snapshots and do not create or attach a
  `store_customers` record as a general customer-management flow. A future conversion must be an
  explicit, authorized action, never an automatic match on contact details.

### Partner contract

[`PARTNER_INTEGRATION_CONTRACT.md`](../api/PARTNER_INTEGRATION_CONTRACT.md) documents the
DGLaundry-specific integration surface. The `dglaundry` partner routes and credentials are
provider-specific; they are not a generic third-party client/customer registry. The contract does
not currently define a tenant CRM customer object. Issue #2308 documents that DGLaundry customer
ordering has no customer-callable path and remains architecturally blocked; submitted contact
details are unverified order contact, not proof of identity.

## 2. Proposed identity and lifecycle

The tenant is the hard identity boundary. A customer in one tenant is never implicitly the same
record as a customer in another tenant, even when name, email, phone, address, or DGFY account match.
`dgfy_account_id` is an explicit relationship to a global account, not a tenant CRM primary key.

### Proposed states and transitions

| State | Meaning | Allowed transition and actor |
|---|---|---|
| Guest/order snapshot | Contact values captured for one order, booking, or reservation; no reusable tenant profile is implied. | An authorized merchant operator or an explicitly consented customer flow may promote it to a tenant customer after a separate create/confirm action. A partner reference alone does not promote it. |
| Tenant customer | A reusable profile in this tenant's `store_customers` domain, whether created by OPIS or a future authorized channel. | OPIS operator with customer-management permission may update profile fields, deactivate/archive, or request merge. An eligible authenticated customer flow may update only its self-service fields if a later contract grants that operation. |
| DGFY-linked tenant customer | A tenant customer with an explicit `dgfy_account_id` relationship. | Link/unlink only through a separately authorized flow that proves both sides and records the actor and audit event. DGFY identity does not grant tenant access by itself. |
| Partner-referenced customer | A partner's opaque external reference scoped to a registered `(app_id, external_customer_ref)` relationship for this tenant. It is a reference, not a verified person or DGFY identity. | The authorized partner may reuse its own reference for idempotent order linkage. Mapping it to a tenant customer requires an explicit tenant-authorized operation. |
| Deactivated/archived tenant customer | Profile is unavailable for new selection/association; historical records remain. | An authorized OPIS operator may reactivate if the future policy permits. Historical transaction snapshots and audit events are retained under the unresolved #243 rules. |

Proposed transition rules:

1. Checkout, POS cashier, reservation, and booking capture creates an order/booking snapshot. It
   does not create a reusable profile merely because an email or phone was supplied.
2. Profile promotion is an explicit create action. If the source transaction is known, it may be
   attached only in the same authorized operation that creates the profile, with source and actor
   recorded. This does not rewrite the transaction's original customer snapshots.
3. A customer may be DGFY-linked only through explicit account authentication/authorization and a
   tenant-scoped operation. No email or phone match may create, repair, or transfer a link.
4. A partner reference is namespaced by the DGFY-registered `app_id` and tenant context. It cannot
   be reused to resolve a customer in another tenant or by another partner app.
5. Merge is a reviewed tenant operation. It must preserve immutable order snapshots, record the
   source and survivor identifiers in audit history, handle conflicting explicit DGFY links by
   refusing the merge for review, and leave a resolvable alias for old references. Automatic
   similarity/dedupe is discovery-only and must not merge or link records.
6. Deactivation blocks new ordinary associations but does not erase transaction history or imply
   consent withdrawal, retention expiry, or a legal erasure result.

### Stable reference proposal

Replace the mutable contact-derived snapshot hash with an opaque, immutable tenant-customer ID
issued when a reusable customer record is created. Use the same opaque `profile_ref` contract for
list/detail/update operations, scoped by the authenticated tenant; reject a reference from another
tenant. Keep partner references separate as `(app_id, external_customer_ref)`. Do not expose raw
database row IDs as a cross-channel contract. Until this is implemented, callers must treat current
snapshot `profile_ref` values as unstable compatibility references.

## 3. Proposed field access and provenance matrix

This is a target permission proposal, not a statement of current capability. “Self” means the
authenticated customer may access only the profile explicitly linked to that authenticated
identity. Contact verification is a separate state; collection or successful delivery is not proof
of ownership.

| Field / relationship | OPIS | POS cashier | Storefront guest | Storefront signed-in | DGFY engine partner | External-engine partner |
|---|---|---|---|---|---|---|
| Tenant customer ID / status | Create/read/update/deactivate with customer permission; link actions separately authorized. | Read/select eligible profile; no profile mutation in checkout. | No read; may request explicit promotion after order. | Read self-linked tenant profile only; self-service updates require an explicit future permission. | May use only its own registered partner reference; no direct tenant ID lookup. | May submit/use only its scoped opaque reference and permitted order link; no directory access. |
| Display name | Create/read/update with permission. | Capture order snapshot; no master-profile write. | Capture order snapshot. | Read self; update only if future self-service contract permits. | Submit order contact as unverified snapshot; cannot edit tenant master. | Submit order contact as unverified snapshot; cannot edit tenant master. |
| Email | Create/read/update with permission; verification state shown separately. | Capture only if supplied; no search or automatic link. | Capture only if supplied; unverified. | Read self; change only through a separately verified account flow. | Submit only when needed for order; unverified absent separate proof. | Submit only when needed for order; unverified absent separate proof. |
| Phone | Create/read/update with permission; never imply verified status without a verification event. | Capture only if supplied; no search or automatic link. | Capture only if supplied; unverified. | Read self; change only through a separately verified account flow. | Submit only when needed for order; unverified absent separate proof. | Submit only when needed for order; unverified absent separate proof. |
| Addresses | Create/read/update/remove tenant profile addresses with permission; purpose and policy remain #243 decisions. | Use transaction fulfillment input; no profile-address book access. | Use one-order fulfillment input. | Read/update self-owned saved address only through its existing DGFY account contract; do not infer tenant-profile ownership. | No tenant address-book access; order-scoped address only when required. | No tenant address-book access; order-scoped address only when required. |
| DGFY account link | Explicit link/unlink operation with permission, proof, and audit. | No link operation in cashier checkout. | No link operation. | Only explicit authenticated linking; no contact-based adoption. | No direct link/unlink; may carry only a DGFY-issued opaque customer reference if a later contract allows it. | No direct link/unlink; opaque partner references only. |
| Partner reference | Read/manage registry under integration permission. | Not applicable. | Not applicable. | Not exposed unless a future customer-facing use case is approved. | Create/read its own `(app_id, external_customer_ref)` mapping only. | Create/read its own scoped mapping only. |
| Notes, tags, consent, verification | Notes/tags and access are permission-gated proposals; consent and verification are governed separately by #243. | No access through sale flow. | No access. | No access to merchant notes/tags/consent records. | No access. | No access. |
| Order/customer association | Read tenant history; no history rewriting except audited merge/link workflow. | Create order snapshot; associate an existing profile only through an explicit selection. | Create guest snapshot. | Create account-linked activity only through existing explicit DGFY linkage. | Create order with partner reference; may read only its own order result. | Create order with partner reference; may read only its own order result. |

For any future mutable profile field, persist provenance at the write boundary: field value,
`source` (OPIS/POS/Storefront/DGFY/partner), `created_via` or mutation operation, authenticated
actor type and ID, tenant ID, timestamp, and whether the value is verified plus the verifying event
reference. Do not write raw credentials, tokens, or unnecessary PII into audit metadata. Order
snapshots remain source-attributed historical facts, not synchronized profile fields.

## 4. Minimum operations to schedule

### OPIS customer operations

- List, search, paginate, view detail and tenant-scoped order/booking history.
- Create a tenant profile from an explicit source; update allowed profile fields with field-level
  permission checks and provenance.
- Deactivate/archive and reactivate under a documented lifecycle policy; never hard-delete as a
  shortcut for retention or erasure.
- Explicit DGFY link/unlink with proof, audit, uniqueness/conflict handling, and no contact-match
  fallback.
- Reviewed merge with conflict handling, stable aliases, and immutable historical snapshots.
- Notes/tags only if product keeps them, with visibility, permission, retention, and audit rules.
- Customer-specific permission definitions and append-only audit coverage for reads of sensitive
  fields and every mutation, aligned with the existing tenant audit owner.
- Export only after #243 defines scope, authorization, delivery, audit, and retention behavior.

### Channel operations

- POS and Storefront write order-scoped contact snapshots; profile lookup/selection is a separate
  capability and must be permission-gated. Guest order completion remains possible under the
  existing per-store access policy.
- Signed-in Storefront continues using the DGFY account contract. A tenant customer link is explicit
  and does not cause cross-store history exposure.
- DGFY-engine and external-engine partners create idempotent orders using their own opaque customer
  reference; no customer directory, tenant profile search, or PII export is granted.

## 5. Proposed partner-customer contract for #803

Add a customer section to the generic third-party API contract, after #796 defines authentication,
authorization, tenant/company/location binding, and idempotency envelopes. The minimum proposed
object is a reference envelope rather than a full customer record:

```json
{
  "customer_ref": {
    "app_id": "registered-partner-app",
    "external_customer_ref": "partner-opaque-id"
  }
}
```

Proposed semantics:

- Scope every reference by authenticated app and resolved tenant. Enforce uniqueness for
  `(tenant, app_id, external_customer_ref)`; a reference has no global person semantics.
- Accept it on partner order create/upsert and persist the order-to-partner-reference relationship
  atomically with the idempotent order result. Retrying the same idempotency key and payload returns
  the same order result; conflicting reuse fails with a stable conflict response.
- Permit the partner to read its own order result and its own supplied reference. Do not expose
  tenant customer search/list, internal profile refs, other partners' references, addresses beyond
  the order response, DGFY account identifiers, loyalty, notes/tags, verification, consent, or
  unrelated order history.
- A customer reference does not grant `store_customer_id` resolution or create a tenant profile.
  Explicit OPIS mapping is a separate audited capability. Customer profile CRUD/upsert is not part
  of this definition.
- #796 owns the third-party integration tier, including app registration and partner credentials.
  #803 owns the external API contract, including shared authorization/tenant/idempotency envelopes
  and order/customer-reference semantics. #2379 owns partner integration administration and tenant
  connection management. Any future DGLaundry customer-order path must separately resolve #2308's
  architectural block, retain DGLaundry's external-engine boundary, and treat submitted contact as
  unverified unless separate proof exists.

## 6. Privacy and policy dependencies routed to #243

No retention duration, consent wording, lawful basis, marketing permission, data subject workflow,
or export/erasure promise is established here. #243 must decide and document, at minimum:

- Customer data inventory and purpose/authority for tenant profile fields, guest order snapshots,
  partner references, notes/tags, contact verification, and analytics.
- Consent/notice ownership by channel, proof record, withdrawal behavior, and distinction between
  transactional contact and marketing consent.
- Retention and disposition rules for inactive profiles, duplicate/merged records, partner refs,
  audit records, and unlinked historical snapshots.
- Access, export, correction, restriction, and erasure request intake, identity proof, tenant owner,
  response evidence, and exception/hold rules.
- Copy/derivative data inventory, including `pos_transactions` customer snapshots, Service booking
  and F&B reservation snapshots, Hospitality guest/reservation data, and landlord
  `dgfy_customer_activities`; define propagation/deletion semantics without weakening immutable
  financial or operational evidence obligations.
- Processor/partner responsibilities, breach handling, permitted onward use, and contact-data
  verification language for #803/#2379.

Until those decisions land, future CRM work must not claim a profile delete implements erasure or
introduce consent/retention behavior by convention.

## 7. Ownership boundary

The tenant CRM belongs to the merchant back office in OPIS under ADR 0087. Tenant customer data
remains inside that tenant's database and authorization context. DGFY Admin is the platform/landlord
console under ADR 0089; it receives no cross-tenant customer workspace or unrestricted customer
search. Global DGFY identity, company membership, account activity, and loyalty continue under ADR
0023. POS owns terminal transaction capture; Storefront owns public commerce entry; partners own
their external customer identifiers. These owners exchange only the explicit, narrow references
and order contracts described above.

## 8. Prioritized implementation gap candidates

These are candidate slices, not filed issues or approved implementation scope. Schedule them only
after the ADR and privacy/partner dependencies are resolved.

| Priority | Candidate | Size | Dependency / exit evidence |
|---|---|---|---|
| P0 | Stabilize tenant customer identity and `profile_ref`; define additive persistence and compatibility behavior. | M | Accept ADR 0091; prove existing OPIS list/detail and old references remain safe during transition. |
| P0 | Define tenant customer permissions, audit events, and field-level source/verification provenance. | M | #243 privacy inventory and RBAC owner; deny unauthorized access and prove durable actor/source audit. |
| P1 | Add OPIS profile update and deactivate/reactivate operations. | M | P0 contracts; validation, permission, conflict, and historical-snapshot preservation evidence. |
| P1 | Add explicit DGFY link/unlink workflow and conflict handling. | L | ADR 0023 compatibility and #243 identity-proof decision; reject email/phone-only linking. |
| P1 | Add guest snapshot promotion and reviewed merge/dedupe workflow. | L | Stable IDs, audit, privacy rules; preserve immutable transaction snapshots and reject conflicting links. |
| P1 | Add #803 partner reference and idempotent order linkage contracts. | L | #796 shared auth/tenant/idempotency boundary; ensure partner isolation and no customer-directory access. |
| P2 | Evaluate optional notes/tags and customer-scoped export. | M | Product decision plus #243 visibility, retention, and export policy. |
| P2 | Reconcile copies and lifecycle for POS, booking, Hospitality, and landlord activity data. | L | #243 copy map and operational/financial retention rules; evidence per data owner. |

## Governing sources

- [ADR 0006](../architecture/adr/0006-skupervisor-expansion-program-boundaries.md) — tenant isolation.
- [ADR 0023](../architecture/adr/0023-front-facing-dgfy-customer-account.md) — explicit account link and account-scoped activity/loyalty.
- [ADR 0079](../architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md) — DGLaundry-specific external runtime.
- [ADR 0087](../architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md) — OPIS ownership.
- [ADR 0089](../architecture/adr/0089-platform-admin-fifth-frontend-app-cross-host-admin-routing.md) — DGFY Admin boundary.
- [Partner integration contract](../api/PARTNER_INTEGRATION_CONTRACT.md), [DGFY customer account](DGFY_CUSTOMER_ACCOUNT.md), and [assurance roadmap](../security/ASSURANCE_ROADMAP.md).
- Related issues: #243, #796, #803, #1354, #1355, #2308, #2379.
