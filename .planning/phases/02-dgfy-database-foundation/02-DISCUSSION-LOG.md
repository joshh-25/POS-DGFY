# Phase 2: DGFY Database Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 2-DGFY Database Foundation
**Areas discussed:** Landlord schema boundaries, Tenant foundation scope, Migration runner hardening, Verification evidence, Naming and layout

---

## Landlord Schema Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Core registry | Accounts, businesses, memberships/ownership, tenant/business DB registry, pointers, audit, and discovery/routing projections only. | yes |
| Broader platform | Include future platform/shared concerns now. | |
| Minimal only | Create only accounts plus tenant registry and defer branches, ownership detail, and audit. | |

**User's choice:** Core registry, refined through discussion.
**Notes:** User challenged whether branches belong in landlord/core. Code review confirmed current architecture uses tenant-local `tenant_locations` as canonical branch/location truth and landlord `storefront_discovery_index` as projection metadata. Decision: `dgfy_core` does not own canonical branches/locations; it may own public discovery/routing projections.

---

## Business Ownership and Membership

| Option | Description | Selected |
|--------|-------------|----------|
| Account-business membership table | Include a relationship table now; enforce simple owner behavior initially and allow future roles. | yes |
| Single owner only | Store only `owner_dgfy_account_id` and defer membership table. | |
| Flexible roles now | Model richer business roles and permissions immediately. | |

**User's choice:** Minimal membership table now, single-owner behavior initially.
**Notes:** User asked about the risk of starting with single owner and expanding later. The safer hybrid is to create the membership table now so later manager/member roles do not require reinterpretation of existing ownership.

---

## Landlord/Core Audit Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal audit now | Audit business creation, ownership/membership changes, DB pointer changes, and migration-sensitive admin actions. | yes |
| Only migration metadata | Rely only on migration runner metadata until APIs exist. | |
| Full audit model now | Add broad account/business/admin lifecycle audit before APIs exist. | |

**User's choice:** Minimal audit now.
**Notes:** Audit tables were explained as "who did what, when, and what changed" evidence. User selected minimal audit after clarification.

---

## Tenant / Business DB Foundation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Staff + assignments + terminals | Include staff/user authorization profiles, account assignment/link metadata, role/permission basics, terminal identity, and tenant-local audit/ownership metadata. | yes |
| Staff only | Include only staff/user profiles and account links. | |
| Operational foundation now | Include early Storefront/POS operational tables too. | |

**User's choice:** Staff + assignments + terminals.
**Notes:** Products/items, promos, POS checkout, inventory, fiscal/compliance operations, and Storefront operational tables remain deferred.

---

## Migration Runner Hardening

| Option | Description | Selected |
|--------|-------------|----------|
| Fix critical runner warnings first | Harden runner safety/reporting paths before adding real schema migrations. | yes |
| Only fix blockers encountered | Proceed with schema work and fix runner issues only if they block implementation. | |
| Defer runner hardening | Keep Phase 2 focused only on schema. | |

**User's choice:** Fix runner warnings first.
**Notes:** Relevant warnings include pending-only destructive migration detection, failure audit rows stuck as `running`, summary status accuracy, and container report directory default.

---

## Verification Evidence Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Full schema + safety proof | Verify tables, columns, indexes, constraints, migration metadata, tenant/business DB coverage, idempotency, and legacy non-mutation proof. | yes |
| Schema shape only | Verify tables/columns/indexes/constraints only. | |
| Operator report only | Produce a summary without strict machine-checkable assertions. | |

**User's choice:** Full schema + safety proof.
**Notes:** Verification must prove legacy `sku_*` schemas were not mutated despite source/target naming guards.

---

## Naming and Layout

| Option | Description | Selected |
|--------|-------------|----------|
| `dgfy_core` + `dgfy_business_*` | Product-aligned core DB plus per-business operational DBs with stable opaque suffixes. | yes |
| `dgfy_landlord` + `dgfy_tenant_*` | More technical multi-tenant vocabulary. | |
| Single DGFY database first | Start with one DB and split later. | |

**User's choice:** `dgfy_core` and `dgfy_business_<stable_opaque_suffix>`.
**Notes:** User considered `dgfy_base`, `dgfy_tenant_*`, and `dgfy_company_*`. Final choice was `dgfy_core` + `dgfy_business_*`. Display/sanitized business names must not be used in DB names.

---

## Table Naming and Registry

| Option | Description | Selected |
|--------|-------------|----------|
| Plain table names | Use plain table names inside DGFY-only DBs because DGFY context is implied by the database name. | yes |
| Prefix every table | Use `dgfy_` prefixes inside DGFY DBs too. | |

**User's choice:** Plain table names.
**Notes:** User initially selected the opposite label while describing the plain-table rationale, then corrected it. Use `accounts`, `businesses`, `business_memberships`, `business_database_registry`, `staff_profiles`, `terminal_registry`, etc.

---

## Discovery Projection

| Option | Description | Selected |
|--------|-------------|----------|
| `storefront_discovery_index` | Explicit public Storefront discovery/search projection. | yes |
| `discovery_index` | Generic discovery name. | |
| Defer entirely | Do not create/index discovery projection in Phase 2. | |

**User's choice:** Use recommendation: explicit `storefront_discovery_index`, lightweight if included in Phase 2.
**Notes:** User asked how current search works for cases like "Masala food." Current implementation indexes item/location snapshots in landlord `storefront_discovery_index` to avoid tenant fan-out at query time.

---

## the agent's Discretion

- Use one active operational DB per business now; leave room for future purpose/status fields if archive/reporting/read-replica DB roles are needed later.
- Create a lightweight `storefront_discovery_index` foundation in Phase 2 only as projection metadata, not operational Storefront truth.

## Deferred Ideas

- Full account/admin lifecycle audit coverage.
- Product/item, promo, POS checkout, inventory, fiscal/compliance, and Storefront operational schemas.
- Old-to-new data migration proof and production cutover planning.
