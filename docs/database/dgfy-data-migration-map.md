---
status: authoritative
authority_level: authoritative
owner: database
last_reviewed: 2026-07-11
applies_to: dgfy_data_migration
topic: dgfy_data_migration_map
---

# DGFY Data Migration Map

This document is the authoritative MIG-01 evidence for Phase 03
(`old-to-new-migration-proof`): it defines, for every legacy/current record
type in scope, the exact source fields, target fields, transform rule,
`legacy_id_map` key shape, skip/conflict/orphan reason codes, and the
verification check that later plans (03-03 dry-run, 03-04 apply, 03-05
verify) must implement against. It is the single source of truth the pure
mapper functions in `apps/dgfy-migration-runner/src/data/mappings.js`
implement — dry-run and apply share these exact functions so their behavior
cannot drift (Pitfall 2 in `03-RESEARCH.md`).

## Governing Docs and ADRs

- `docs/database/dgfy-foundation.md` — authoritative `dgfy_core`/
  `dgfy_business_*` target schema contract (Phase 02).
- `docs/architecture/adr/0028-dgfy-account-company-switching.md` — explicit
  accepted-membership authorization contract. Email/phone matches are never
  authorization; migration must not create membership or assignment rows by
  inferring a link from matching contact fields.
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md`
  — `storefront_discovery_index` is a projection/read-model, not canonical
  branch/location truth.
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
  — product, inventory, POS, fiscal, promo, and Storefront-operational
  domains are out of scope for this phase (see "Explicit Exclusions" below).

**ADR impact:** Not needed. This document implements Phase 02's accepted
schema contracts and ADR 0028/0029 boundaries; it introduces no new
architectural decision.

## Conventions

### `legacy_id_map` key shape

Every insert/update mapper emits a deterministic `legacy_id_map` key so a
retried apply looks up the existing durable mapping instead of risking a
second row (D-02, D-04, `03-RESEARCH.md` Pitfall 3):

```
{ legacy_source, legacy_table, legacy_id } -> { dgfy_database, dgfy_table, dgfy_id }
```

`legacy_source` is `'landlord'` for legacy landlord-scoped tables
(`dgfy_accounts`, `tenants`, `dgfy_account_tenant_memberships`) and the
migration target manifest's `legacy_tenant_db_name` for tenant-local tables
(`users`, `tenant_locations`, `system_settings.pos_terminal_registry`).
`dgfy_id` is populated by the apply-time helpers in
`apps/dgfy-migration-runner/src/metadata/dataState.js`
(`recordLegacyIdMap`/`findLegacyIdMap`) once the target row exists — pure
mapper functions in this plan only emit the lookup *key*, never the
`dgfy_id` value, because they never touch a database.

### Operation and severity taxonomy

Every mapper function returns a structured object with an `operation`
(`insert`, `update`, `skip`, or `conflict`), `entity_type`, `target_table`,
`target_database`, `target_payload`, `legacy_id_map_key`, `related_targets`
(for entities that produce more than one target write), and `findings`
(zero or more structured records — D-04, never silently dropped).

Each finding has a `severity` matching the
`dgfy_migration_meta.data_quality_findings` schema (`skip`, `conflict`, or
`orphan` — see `apps/dgfy-migration-runner/tests/dataState.test.js`) plus a
stable `reason_code`, a human-readable `message`, and `remediation` guidance.

| `reason_code` | Severity | Meaning |
|---|---|---|
| `missing_required_field` | `skip` | A required source field (email, phone, name, address, ...) is blank; the record is skipped, not guessed at. |
| `missing_accepted_membership` | `skip` | The legacy `dgfy_account_tenant_memberships` row is not `status: accepted`; ADR 0028 forbids creating membership/assignment rows from anything else, including matching email/phone. |
| `missing_owner_evidence` | `conflict` | `tenants.owner_dgfy_account_id` is blank; `tenant_ownership_metadata` cannot be written without explicit owner evidence. |
| `owner_mismatch` | `conflict` | `tenants.owner_dgfy_account_id` does not match the migration target manifest's `expected_owner_account_id`; the manifest and legacy data disagree and must be reconciled by an operator. |
| `duplicate_email` | `conflict` | A staff account email collides with an email already mapped to a `staff_accounts` row in the same run. |
| `invalid_terminal_id` | `skip` | A `pos_terminal_registry` entry's `terminal_id` does not match the required terminal code pattern. |
| `orphan_tenant_user_link` | `orphan` | An accepted membership has no resolvable tenant-local staff account link (missing `tenant_user_id`, or the staff account has not been migrated/ID-mapped yet). |
| `location_not_mapped` | `orphan` | A terminal registry entry references a legacy `location_id` that has no resolved target `locations.id` yet; the terminal is still migrated with `location_id: null`. |
| `out_of_scope_entity` | `skip` | The legacy table is explicitly excluded from Phase 03 migration (see "Explicit Exclusions"). |

## 1. Account Identity

**Source:** `backend/src/models/Landlord/DgfyAccount.js` (`dgfy_accounts`, legacy landlord DB).
**Target:** `dgfy_core.accounts`.
**Mapper:** `mapLegacyAccountToDgfyAccount()`.

| Source field | Target field | Transform rule |
|---|---|---|
| `id` | `id` | Copied as-is (same UUID; account identity is preserved 1:1, no new ID space). |
| `first_name` | `first_name` | Trimmed passthrough. |
| `last_name` | `last_name` | Trimmed passthrough. |
| `email` | `email` | Trimmed + lowercased (defensive re-normalization; legacy setter already lowercases on write). |
| `phone` | `phone` | Trimmed passthrough. |
| `password_hash` | `password_hash` | Copied unchanged. Never re-hashed, never logged (ASVS V2/V6). |
| `is_active`, `deleted_at` | `status` | `deleted_at` present -> `deleted`; else `is_active === false` -> `inactive`; else `active`. |
| `email_verified_at` | `email_verified_at` | Passthrough. |
| `phone_verified_at` | `phone_verified_at` | Passthrough. |
| `last_login_at` | `last_login_at` | Passthrough. |

**Deferred fields (no Phase 02 target column — documented, not silently dropped):** `middle_name`, `username`, `provisioning_status`, `temporary_password_active`, `email_verification_source`, `merchant_terms_acknowledged_at`, `business_step_up_verified_at`, `deleted_by`, `deletion_reason`. The mapper returns these under `deferred_fields` for evidence; they are never written to `dgfy_core.accounts`.

**Skip/conflict rule:** missing `email`, `phone`, or `password_hash` -> `skip` (`missing_required_field`). Legacy `dgfy_accounts` already enforces `email`/`phone` uniqueness, so no duplicate-account conflict path exists at this stage.

**`legacy_id_map` key:** `{ legacy_source: 'landlord', legacy_table: 'dgfy_accounts', legacy_id: <account.id> }`.

**Verification check (MIG-05):** every migrated `dgfy_core.accounts` row has exactly one `legacy_id_map` row with `legacy_table = 'dgfy_accounts'`; `email`/`phone` uniqueness holds in the target; `password_hash` byte-for-byte matches the source (never re-hashed).

## 2. Tenant / Business

**Source:** `backend/src/models/Landlord/Tenant.js` (`tenants`, legacy landlord DB) plus the migration target manifest entry (`03-01`, `apps/dgfy-migration-runner/src/data/targetManifest.js`).
**Target:** `dgfy_core.businesses`, `dgfy_core.business_database_registry` (related write), `dgfy_business_*.tenant_ownership_metadata` (related write, conditional on owner evidence).
**Mapper:** `mapLegacyTenantToBusiness()`.

| Source field | Target field | Transform rule |
|---|---|---|
| manifest `expected_business_id` | `businesses.id` | The target business ID always comes from the operator-supplied manifest, never derived from `tenants.id` — this decouples the new DGFY ID space from legacy tenant IDs while still recording the legacy link via `legacy_id_map`. |
| manifest `target_business_db_name` | `businesses.business_handle`, `business_database_registry.stable_opaque_suffix` | The `dgfy_business_<suffix>` name's suffix portion is the opaque handle. **Never derived from `tenants.name`** (D-03 — a business rebrand must never rename a database or create a handle mismatch). |
| `name` | `businesses.legal_name`, `businesses.display_name` | Trimmed passthrough into both fields (Phase 02 has no separate legal/display distinction in legacy data). |
| `status` | `businesses.status` | `pending`->`pending`, `active`->`active`, `inactive`->`inactive`, `archived`->`archived`, `rejected`->`archived` (rejected tenants map to the closest terminal target status; no finding is emitted for this direct enum narrowing). |
| manifest `target_business_db_name` | `business_database_registry.database_name` | Copied from the manifest (never inferred/discovered). |
| — | `business_database_registry.status` | `'active'` once the registry row is written for a migrated target. |
| `owner_dgfy_account_id` + manifest `expected_owner_account_id` | `tenant_ownership_metadata.owner_dgfy_account_id` | Written **only** when `tenants.owner_dgfy_account_id` is present and matches the manifest's `expected_owner_account_id` exactly — see skip/conflict rule below. |

**Deferred fields:** `domain`, `subdomain`, `plan`, `compliance_profile` (and the rest of the subscription/billing/compliance columns) have no Phase 02 target column and are returned under `deferred_fields`, not silently dropped.

**Skip/conflict rule:**
- Missing `tenants.name` or any required manifest field (`target_business_db_name`, `expected_business_id`, `expected_owner_account_id`) -> the whole record is `skip` (`missing_required_field`); no business row is written.
- `tenants.owner_dgfy_account_id` is blank -> the `businesses` row and `business_database_registry` row are still written, but the `tenant_ownership_metadata` related write is omitted and a `conflict` finding (`missing_owner_evidence`) is attached (ADR 0028: no ownerless-tenant inference).
- `tenants.owner_dgfy_account_id` is present but does not equal the manifest's `expected_owner_account_id` -> same as above with reason `owner_mismatch`; the manifest and legacy data must be reconciled by an operator before ownership metadata is written.

**`legacy_id_map` key:** `{ legacy_source: 'landlord', legacy_table: 'tenants', legacy_id: <tenant.id> }`.

**Verification check (MIG-05):** every migrated `dgfy_core.businesses` row has a `legacy_id_map` row with `legacy_table = 'tenants'`; every migrated business has exactly one `business_database_registry` row whose `database_name` matches the manifest; every business with confirmed owner evidence has exactly one `tenant_ownership_metadata` row in its own `dgfy_business_*` database.

## 3. Business Membership

**Source:** `backend/src/models/Landlord/DgfyAccountTenantMembership.js` (`dgfy_account_tenant_memberships`, legacy landlord DB).
**Target:** `dgfy_core.business_memberships`.
**Mapper:** `mapLegacyMembershipToBusinessMembership()`.

| Source field | Target field | Transform rule |
|---|---|---|
| `dgfy_account_id` | `account_id` | Copied as-is. |
| manifest `expected_business_id` | `business_id` | From the manifest (same target business ID `mapLegacyTenantToBusiness()` used), not `tenant_id`. |
| `role` | `role` | `owner`/`founder` -> `owner`; `admin`/`manager` -> `manager`; anything else -> `member` (`dgfy_core.business_memberships.role` enum is `owner`/`manager`/`member`). |
| `status` | `status` | Only `status: 'accepted'` produces an `insert` with target `status: 'active'`. |

**Skip/conflict rule (ADR 0028, D-04 must-have):** `status !== 'accepted'` -> `skip` (`missing_accepted_membership`) — **this is the only gate.** The mapper never inspects `DgfyAccount.email`/`phone` or `User.email`/`phone_number` to decide whether to create a membership; a matching email between a DGFY account and a tenant-local user is never sufficient evidence on its own.

**`legacy_id_map` key:** `{ legacy_source: 'landlord', legacy_table: 'dgfy_account_tenant_memberships', legacy_id: <membership.id> }`.

**Verification check (MIG-05):** every `dgfy_core.business_memberships` row traces to exactly one `accepted` legacy membership row via `legacy_id_map`; zero membership rows exist whose only evidence is a legacy email/phone match without an accepted membership row.

## 4. Staff Account

**Source:** tenant-local `users` (`backend/src/models/User.js`), read per migration target's `legacy_tenant_db_name`.
**Target:** `dgfy_business_*.staff_accounts`.
**Mapper:** `mapLegacyUserToStaffAccount()`.

| Source field | Target field | Transform rule |
|---|---|---|
| `username` (fallback: `email` local-part) | `display_name` | Trimmed `username`, or the part of `email` before `@` when `username` is blank. |
| `email` | `email` | Trimmed + lowercased. |
| `phone_number` | `phone` | Trimmed passthrough, `null` when blank. |
| `is_active`, `deleted_at` | `status` | `deleted_at` present -> `removed`; `is_active === false` -> `inactive`; else `active`. |
| `is_master_admin` | `is_master_admin` | Boolean passthrough. |

**Never migrated:** `password_hash`, `pos_approval_pin_hash` — tenant-local login/identity is retired under ADR 0028; DGFY account authentication owns identity, and `staff_accounts` has no password column to receive a copied hash.

**Deferred fields:** `role`, `role_preset_key`, `permissions` (Phase 02 role/permission seeding for `dgfy_business_*.roles`/`role_permissions` is a separate, later concern — not lost, just not part of this table's payload).

**Skip/conflict rule:** blank `email` -> `skip` (`missing_required_field`). An email that has already been mapped to a `staff_accounts` row earlier in the same run (tracked by the caller via a `seenEmails` set passed into the mapper) -> `conflict` (`duplicate_email`); `staff_accounts.email` has a unique constraint (`unique_staff_accounts_email`), so a real collision must be surfaced, not silently overwritten.

**`legacy_id_map` key:** `{ legacy_source: <legacy_tenant_db_name>, legacy_table: 'users', legacy_id: <user.user_id> }`.

**Verification check (MIG-05):** every migrated `staff_accounts` row has a `legacy_id_map` row scoped to its tenant's `legacy_tenant_db_name`; no two `staff_accounts` rows in the same `dgfy_business_*` database share an email; no `staff_accounts` row contains a password hash or PIN hash field.

## 5. Account-Staff Assignment

**Source:** `dgfy_account_tenant_memberships` (accepted rows only) joined to tenant-local `users` via `tenant_user_id`.
**Target:** `dgfy_business_*.account_staff_assignments`.
**Mapper:** `mapLegacyAccountStaffAssignment()`.

| Source field | Target field | Transform rule |
|---|---|---|
| `dgfy_account_id` | `dgfy_account_id` | Copied as-is (opaque UUID pointing at `dgfy_core.accounts.id`; never a real FK — cross-database). |
| resolved `staff_account_id` (from `legacy_id_map`, entity 4 above) | `staff_account_id` | Must be supplied by the caller after resolving the tenant user's migrated `staff_accounts.id`; the mapper never queries a database itself. |
| `role` | `role` | `owner`/`founder` -> `owner`; `admin`/`manager` -> `manager`; anything else -> `staff` (`account_staff_assignments.role` enum is `owner`/`manager`/`staff` — **note this is a different enum from `business_memberships.role`**, which uses `member` as its default, not `staff`). |
| `status` | `status` | Only `status: 'accepted'` produces `insert` with target `status: 'active'`. |

**Skip/conflict rule (ADR 0028, D-04 must-have — same non-inference guarantee as entity 3):**
- `status !== 'accepted'` -> `skip` (`missing_accepted_membership`).
- `status === 'accepted'` but `tenant_user_id` is blank -> `skip` (`orphan_tenant_user_link`) — there is no legacy tenant-local user link to resolve a staff account from, and the mapper does not fall back to matching by email (that fallback exists in `backend/src/services/dgfyTenantSessionService.js` only as a gated runtime repair escape hatch behind `DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED`, and migration planning treats it as exactly that — not a general linking rule).
- `status === 'accepted'`, `tenant_user_id` present, but no resolved `staff_account_id` was supplied -> `skip` (`orphan_tenant_user_link`) — the tenant user has not been migrated (or ID-mapped) yet; this models the required apply-time ordering `accounts -> businesses/registry -> locations -> staff -> assignments -> terminals`.

**`legacy_id_map` key:** `{ legacy_source: 'landlord', legacy_table: 'dgfy_account_tenant_memberships', legacy_id: <membership.id> }` (same legacy row as entity 3, different target table).

**Verification check (MIG-05):** every `account_staff_assignments` row traces to exactly one accepted legacy membership row with a resolved `tenant_user_id` -> `staff_accounts.id` chain; zero assignment rows exist without that full chain.

## 6. Location / Branch

**Source:** tenant-local `tenant_locations` (`backend/src/models/TenantLocation.js`).
**Target:** `dgfy_business_*.locations`.
**Mapper:** `mapLegacyLocationToLocation()`.

| Source field | Target field | Transform rule |
|---|---|---|
| `name` | `name` | Trimmed passthrough; required. |
| `address_line` | `address_line` | Trimmed passthrough; required. |
| `latitude` | `latitude` | Passthrough, `null` when absent. |
| `longitude` | `longitude` | Passthrough, `null` when absent. |
| `is_active` | `is_active` | Boolean passthrough (default `true`). |
| `is_primary_storefront` | `is_primary` | Boolean passthrough (default `false`). |

**Skip/conflict rule:** blank `name` -> `skip` (`missing_required_field`); blank `address_line` -> `skip` (`missing_required_field`). This is the canonical branch/location migration target — `dgfy_core.storefront_discovery_index` is a separate, optional, evidence-only projection (see entity 9) and never blocks this migration.

**`legacy_id_map` key:** `{ legacy_source: <legacy_tenant_db_name>, legacy_table: 'tenant_locations', legacy_id: <location_id> }`.

**Verification check (MIG-05):** every migrated `locations` row has a `legacy_id_map` row scoped to its tenant; every `tenant_locations` row with a non-blank name/address either has a matching `locations` row or an open `missing_required_field` finding.

## 7. Terminal Identity

**Source:** tenant-local `system_settings` row with `setting_key = 'pos_terminal_registry'`, sanitized the same way as `backend/src/modules/settings/usecases/posTerminalRegistrySecrets.js` reads it for the settings API (`sanitizeTerminalRegistryForRead`).
**Target:** `dgfy_business_*.terminal_identities`.
**Mapper:** `mapTerminalRegistryEntryToTerminalIdentity()`.

| Source field | Target field | Transform rule |
|---|---|---|
| `terminal_id` | `terminal_code` | Trimmed + uppercased, then validated against `/^[A-Z0-9][A-Z0-9_-]{1,39}$/` (same pattern family as `posTerminalRegistrySecrets.js`'s `sanitizeTerminalId`). |
| `label` | `label` | Trimmed passthrough. |
| `location_id` (legacy numeric ID) + caller-resolved target `locations.id` | `location_id` | The mapper never resolves this itself (no DB access); the caller supplies the already-resolved target location ID from entity 6's `legacy_id_map`. |
| `is_active` | `status` | `is_active === false` -> `inactive`; else `active`. |

**Never migrated (D-04/ASVS V6, threat model row "Secret leakage in reports"):** `terminal_password_hash`, `pairing_version`, `cashier_email`, `is_default`, and any shift/drawer/transaction/payment/fiscal-registration data. The mapper's `target_payload` only ever contains `terminal_code`, `label`, `location_id`, and `status` — regardless of which extra fields are present on the source entry, they are structurally excluded by the payload builder, not filtered by convention.

**Skip/conflict rule:** `terminal_id` fails the terminal code pattern (blank, or contains characters outside `[A-Z0-9_-]`) -> `skip` (`invalid_terminal_id`). A legacy `location_id` that has no caller-resolved target location -> the terminal identity is still inserted with `location_id: null`, plus an `orphan` finding (`location_not_mapped`) so the gap is visible without blocking the terminal's own migration.

**`legacy_id_map` key:** `{ legacy_source: <legacy_tenant_db_name>, legacy_table: 'system_settings.pos_terminal_registry', legacy_id: <terminal_id> }`.

**Verification check (MIG-05):** every migrated `terminal_identities` row has a `legacy_id_map` row; zero `terminal_identities` rows contain a password hash, pairing secret, or cashier email field; every row with a non-null `location_id` points at a `locations` row that itself has a `legacy_id_map` row.

## 8. Tenant Ownership Metadata

**Source:** `tenants.owner_dgfy_account_id` plus the migration target manifest's `expected_business_id`/`expected_owner_account_id` (same inputs as entity 2).
**Target:** `dgfy_business_*.tenant_ownership_metadata`.
**Mapper:** produced as a `related_targets` entry of `mapLegacyTenantToBusiness()` — there is no separate pure mapper function for this table because it is a direct 1:1 derived write from the business mapper's own inputs, not an independent transformation of a distinct source entity.

Exactly one `tenant_ownership_metadata` row is written per migrated business, only when owner evidence is confirmed (see entity 2's skip/conflict rule). Its `business_id`, `business_handle`, and `stable_opaque_suffix` are identical to the corresponding `businesses`/`business_database_registry` values; `owner_dgfy_account_id` is the manifest's `expected_owner_account_id` (already proven to equal `tenants.owner_dgfy_account_id`).

**`legacy_id_map` key:** shares entity 2's key (`legacy_table: 'tenants'`) — `tenant_ownership_metadata` is a related write of the same legacy tenant record, not a separately ID-mapped entity.

**Verification check (MIG-05):** every migrated business with confirmed owner evidence has exactly one `tenant_ownership_metadata` row in its own database; zero businesses have more than one.

## 9. Optional Storefront Discovery Projection Evidence

**Source:** none required for Phase 03. A future phase may sync `dgfy_core.storefront_discovery_index` from migrated `dgfy_business_*.locations` rows.
**Target:** `dgfy_core.storefront_discovery_index` (`projectionOnly: true` per `dgfyCoreContract.js`).

Per ADR 0010 and `docs/database/dgfy-foundation.md`, `storefront_discovery_index` is a denormalized public discovery projection, never canonical branch/location truth. **This projection is explicitly out of the critical path for MIG-01 through MIG-05.** Phase 03 dry-run/apply/verify may optionally read or report on this table as supplementary evidence, but its absence or staleness can never fail migration completion — canonical location truth is `dgfy_business_*.locations` (entity 6).

## 10. Explicit Exclusions (ADR 0029)

The following legacy domains are **never** read as migration sources and **never** produce a target write in Phase 03. `apps/dgfy-migration-runner/src/data/mappings.js` exports `OUT_OF_SCOPE_LEGACY_TABLES` (mirroring `dgfyCoreContract.js`/`dgfyBusinessContract.js`'s `rejectedTables` lists) and `classifyOutOfScopeRecord()`, which dry-run/apply call to record a structured `skip` finding (`out_of_scope_entity`) instead of silently ignoring an encountered record:

- Products/items, SKUs, product variants, categories.
- Purchase orders, job orders, stock movements, item/location stock, FIFO batches, suppliers/supplier-items (Inventory/Catalog ownership, ADR 0029).
- POS transactions/lines, shifts, cashier sessions, terminal sessions (POS ownership, ADR 0029 — **note:** terminal *identity* from `pos_terminal_registry` is in scope per entity 7; terminal *operational* history is not).
- Discounts, promos, promotions.
- Fiscal receipts and fiscal compliance logs.
- Checkout sessions, Storefront pages, Storefront orders/carts (Storefront operational ownership, ADR 0029).
- Any frontend/compatibility seam migration (deferred to Phase 05 per `.planning/PROJECT.md`).

These domains are deferred to later milestones once Accounts, Businesses, and Tenancy are stable (see `.planning/PROJECT.md` Out of Scope, and `docs/database/dgfy-foundation.md`'s "Explicit Out-of-Scope Domains").

## Verification Checks Summary

| Entity | `legacy_table` | Target table(s) | MIG-05 verification check |
|---|---|---|---|
| Account identity | `dgfy_accounts` | `accounts` | `legacy_id_map` completeness; email/phone uniqueness; `password_hash` unchanged. |
| Tenant/business | `tenants` | `businesses`, `business_database_registry` | `legacy_id_map` completeness; one registry row per business matching the manifest. |
| Business membership | `dgfy_account_tenant_memberships` | `business_memberships` | Every row traces to an accepted legacy membership; no email/phone-inferred rows. |
| Staff account | `users` | `staff_accounts` | `legacy_id_map` completeness (per-tenant scoped); no duplicate emails; no password/PIN fields present. |
| Account-staff assignment | `dgfy_account_tenant_memberships` | `account_staff_assignments` | Full accepted-membership -> `tenant_user_id` -> `staff_accounts.id` chain present for every row. |
| Location/branch | `tenant_locations` | `locations` | `legacy_id_map` completeness (per-tenant scoped); every source row with required fields has a target row or an open finding. |
| Terminal identity | `system_settings.pos_terminal_registry` | `terminal_identities` | `legacy_id_map` completeness; zero secret fields present; `location_id` chain valid when non-null. |
| Tenant ownership metadata | `tenants` (related write) | `tenant_ownership_metadata` | Exactly one row per business with confirmed owner evidence. |
| Storefront discovery projection | (none — optional) | `storefront_discovery_index` | Evidence-only; never blocks MIG-01 through MIG-05 completion. |
