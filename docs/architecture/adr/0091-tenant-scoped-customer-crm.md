---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: tenant_customer_crm_and_partner_customer_references
topic: tenant_scoped_customer_crm
---

# ADR 0091: Tenant-Scoped Customer CRM and Partner References

## Status

Proposed — requires Pat/tech-lead review and acceptance. While proposed, this ADR constrains no
implementation. The accompanying [foundation contract](../../features/TENANT_CRM_FOUNDATION.md)
records the current state, proposal, privacy dependencies, and candidate implementation slices.

## Context

Issue #2378 asks for a reusable tenant-scoped customer contract across OPIS, POS, Storefront, and
authorized partner-originated orders. Existing tenant `store_customers`, transaction contact
snapshots, global DGFY accounts, landlord customer activity, and DGLaundry partner identities have
different owners and trust boundaries. ADR 0006 requires tenant isolation; ADR 0023 requires explicit
DGFY account linkage and account-scoped global activity; ADR 0079 defines a DGLaundry-specific
external runtime. No accepted ADR defines tenant CRM identity, lifecycle, or generic partner
customer references. Privacy behavior remains an open dependency under #243.

## Decision (proposed)

1. `[binding]` Tenant customer records and their authorization context remain tenant-local. A
   matching name, email, phone, address, order, or partner reference never joins customer records
   across tenants.
2. `[binding]` A tenant customer's relationship to a DGFY account exists only through an explicit,
   authorized `dgfy_account_id` link. Contact matching never creates, transfers, or repairs that
   link. Global DGFY account activity and loyalty remain governed by ADR 0023 and are not copied
   into a tenant CRM workspace by inference.
3. `[default]` POS, guest Storefront, booking, reservation, and partner contact values remain
   transaction snapshots until an authorized explicit promotion creates or selects a tenant
   customer. Profile changes, link/unlink, merge, and deactivation do not rewrite historical order
   snapshots.
4. `[default]` Reusable tenant profiles use an immutable opaque tenant-scoped customer reference.
   Partner references remain separate and are scoped to `(tenant, registered app_id,
   external_customer_ref)`; a partner reference is not a person identity or tenant customer key.
5. `[binding]` OPIS is the tenant CRM owner. DGFY Admin does not provide unrestricted cross-tenant
   customer search or customer-record management. POS remains the terminal transaction owner,
   Storefront remains the customer-commerce entry owner, and partners receive only their
   authorized order/reference surface.
6. `[default]` The generic #803 contract may accept an opaque customer reference for idempotent
   order linkage after #796 establishes shared authentication, tenant binding, and idempotency. It
   does not grant customer directory access, internal customer IDs, addresses outside an order,
   account IDs, loyalty, notes/tags, verification, consent, or unrelated order history.
7. `[default]` Future mutable customer fields record source/channel, operation, actor, timestamp,
   and verification state/event reference at the owning write boundary. Verification, consent,
   retention, export, and erasure semantics remain governed by #243 and are not inferred from
   profile creation or successful contact delivery.

## Consequences (proposed)

- Customer identity, partner references, and historical transaction snapshots have distinct
  contracts; converting a snapshot into a profile requires an explicit operation.
- Existing `profile_ref` behavior must be replaced compatibly with an immutable opaque reference;
  callers must not treat contact-derived references as stable identity.
- Merge, DGFY linking, partner mapping, and profile lifecycle need durable audit and permission
  controls before the corresponding APIs ship.
- Privacy work in #243 is a prerequisite for selecting retention, consent, export, and erasure
  behavior. This proposal does not settle those questions.
- #796 owns the shared partner security envelope; #803 owns generic partner API customer/order
  linkage; #2379 owns its DGLaundry-specific adaptation. ADR 0079 remains in force for DGLaundry's
  external-engine boundary.

## Validation expected before implementation

- `npm run check:architecture`, `npm run lint:docs`, and `npm run check:adr`.
- Tenant-isolation and explicit-link tests proving no contact-based join, no cross-tenant lookup,
  partner-reference isolation, and preserved historical order snapshots.
- Permission/audit tests for all profile mutations and link/merge operations.
- Partner contract tests for idempotent order linkage, conflicting key reuse, and prohibited
  customer-directory/PII access.
- Privacy review against #243 before implementing consent, retention, export, or erasure behavior.
