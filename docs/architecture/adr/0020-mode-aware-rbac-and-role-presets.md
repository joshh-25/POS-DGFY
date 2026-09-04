---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-05-06
last_reviewed: 2026-09-01
review_by: 2026-11-06
applies_to: architecture_decision
topic: mode_aware_rbac_and_role_presets
---

# ADR 0020: Mode-Aware RBAC And Role Presets

## Context

Tenant-local RBAC previously used one shared role enum (`users.role`) plus granular `users.permissions` across all workflow modes. That preserved compatibility, but it left MSME, Food Manufacturing, Services, and Food & Beverage with role labels that did not always match their native operating teams.

This decision follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0008, ADR 0016, ADR 0019, and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`.

## Decision

- Add `users.role_preset_key` as a nullable tenant-user field.
- Keep `users.role`, `users.permissions`, and `users.is_master_admin` intact for compatibility.
- Add a backend mode-aware role preset catalog. Each preset declares `key`, label, workflow mode, compatibility `role`, hierarchy rank, location scope, and default granular permissions.
- Add mode-native permission groups for Services and Food & Beverage. Services uses `services:*` permissions for dashboard, catalog, resources, bookings, waitlist, clients, and reminders. F&B uses `fnb:*` permissions for dashboard, menu, dining, kitchen, checks, reservations, and service charge.
- Keep authorization based on granular permissions and workflow capability guards, not role labels.
- Update Services and F&B route guards to prefer mode-native permissions while temporarily accepting existing generic permissions as fallback so current users do not lose access. The fallback is controlled by `MODE_RBAC_GENERIC_FALLBACK_ENABLED` and defaults to enabled for compatibility.
- Expose `GET /api/v1/users/role-catalog` for User Management. The endpoint resolves the tenant's active workflow mode and returns the allowed role presets plus visible permission groups.
- Allow `POST /api/v1/users/invite` and `PUT /api/v1/users/:id/role` to accept either legacy `role` or mode-native `role_preset_key`. Role updates may include `location_ids`; when an assigned-scope preset is selected, the role preset and location grants are saved together.
- Return `role_preset_key`, `role_preset_label`, and `role_preset_status` in current-user, user-list, invite, invitation validation, and role-update payloads.
- Do not auto-rewrite users on tenant mode switch. A preset from another mode is flagged as `mode_mismatch` for admin review.

## Preset Families

- MSME: `msme_admin`, `msme_manager`, `msme_cashier`, `msme_inventory_clerk`, `msme_viewer`.
- Food Manufacturing: `food_manufacturing_admin`, `food_manufacturing_manager`, `food_manufacturing_purchase_officer`, `food_manufacturing_production_lead`, `food_manufacturing_dispatch_officer`, `food_manufacturing_cashier`, `food_manufacturing_inventory_controller`, `food_manufacturing_viewer`.
- Services: `services_admin`, `services_manager`, `services_provider`, `services_scheduler`, `services_front_desk_cashier`, `services_inventory_clerk`, `services_viewer`.
- F&B: `fnb_admin`, `fnb_restaurant_manager`, `fnb_server`, `fnb_cashier`, `fnb_kitchen_staff`, `fnb_host_reservations`, `fnb_inventory_controller`, `fnb_viewer`.

## Consequences

- This is an additive RBAC layer, not a role migration.
- Existing users without `role_preset_key` remain operational and display as `Legacy <role>`.
- User Management must consume the backend catalog instead of hardcoded global role lists when the catalog is available.
- User Management must surface catalog load failure instead of silently presenting legacy-only roles.
- Bulk role templates may assign tenant-scoped presets directly. Assigned-scope presets require explicit location confirmation; User Management may apply one shared location scope to all selected users only after the admin confirms the selected locations.
- Hidden or legacy permissions must be preserved when admins edit only the active mode's visible permission groups.
- Temporary generic permission fallback must have a removal plan. Operators should disable `MODE_RBAC_GENERIC_FALLBACK_ENABLED` only after users are remapped and Services/F&B access tests pass with mode-native permissions.
- Future workflow modes cannot be called production-ready until their role presets, permission groups, sensitive actions, route guards, location-scope rules, tenant provisioning graph, and schema-clone validation are added to the catalog/docs and tested.
- No architecture allowlist exception is introduced.

## Amendments

### 2026-08-21 — Production fallback is fail-closed

Production now defaults `MODE_RBAC_GENERIC_FALLBACK_ENABLED` to `false`, and the production environment validator rejects an explicit truthy value. Non-production runtimes retain the compatibility default while tenant users are remapped. This amendment narrows the original compatibility default for hosted production without changing the mode-native permission contract.

### 2026-09-01 — Cashier item-maintenance permission floor and ceiling

The compatibility `cashier` role has a fixed POS catalog-maintenance contract: its effective
permissions always include `items:edit` and always exclude `items:delete`. This floor and ceiling
apply even when `users.permissions` contains an explicit per-user list. Tenant administrators may
configure other cashier permissions, but they cannot turn the compatibility cashier role into a
catalog-view-only role or grant item deletion through the explicit permission list. Assign a
different role when a user must not edit items. Backend authorization remains authoritative; the
POS client mirrors the same rule only to present consistent controls and is not the security
boundary.

### 2026-09-03 — Accounting preset family, and voucher management restricted to Admin + Accounting

Phase 263 (#1493). Adds an `Accounting` role preset to every mode family -- `msme_accounting`,
`generic_accounting`, `food_manufacturing_accounting`, `services_accounting`, `fnb_accounting`,
`hospitality_accounting` -- extending the `Preset Families` list above. Each carries compatibility
role `manager` at rank 5 with tenant location scope, and exactly four permissions: `vouchers:view`,
`vouchers:manage`, `reports:view`, `reports:export`.

This is a preset addition, not a `users.role` ENUM addition, and that is the point of recording it
here: this ADR's Decision to "keep authorization based on granular permissions and workflow
capability guards, not role labels" is what makes a new fixed role expressible with no schema
migration and no change to `USER_ROLES`. The existing `hospitality_finance_billing` preset is the
precedent -- an accounting-shaped preset on compatibility role `manager` at rank 5.

Voucher-campaign management is correspondingly narrowed to Admin + Accounting:

- `DEFAULT_ROLE_PERMISSIONS.manager` loses `vouchers:manage` and keeps `vouchers:view`. #1493
  restricts management, not read access. `food_manufacturing_manager` inherits this through
  `managerPermissions`.
- `routes/vouchers.js`'s `canManageVouchers` drops its legacy `settings:edit` arm, retiring the
  #655 dual-gate on the management routes. Retiring it is what makes the restriction real:
  `settings:edit` is a permission every manager holds by default, so the narrowed
  `DEFAULT_ROLE_PERMISSIONS` alone would have changed nothing. #655's own stated retirement
  condition -- a full deploy cycle for `scripts/backfill-role-permissions.js` -- is met; commits
  33bd92646 and 34224d4c3 landed 2026-08-18 and have been on `origin/main` across several releases
  since.
- `canViewVouchers` keeps both legacy `SYSTEM.*` arms, and `routes/pricelists.js` is untouched.
  Pricelists (#732) share the `VOUCHERS.*` permission group but are a separate capability that
  #1493 does not restrict; the `settings:edit` arm that route still accepts is what keeps managers
  managing pricelists. The POS client mirrors this split as two distinct gates
  (`canManageVouchers` vs `canManagePricelists`) rather than one shared flag.

Two consequences worth stating rather than discovering later:

1. **A config change cannot revoke a permission already written to a row.**
   `resolveEffectivePermissions` re-derives role defaults only when a user's stored
   `users.permissions` array is empty, and `scripts/backfill-role-permissions.js` is additive, so
   managers on long-running tenants may already carry `vouchers:manage` in that array.
   `apps/dgfy-api/scripts/revoke-manager-voucher-manage.js` is the data half, dry-run by default and
   written to be run deliberately by an operator; it never touches admin rows, `is_master_admin`
   rows, or rows holding an `*_accounting` preset.
2. **`ROLE_CATALOG_VERSION` is bumped to `2026-09-03.mode-aware-rbac-v4`**, since a client holding
   v3 would offer neither the new preset nor the corrected manager permission set.

This amendment narrows one capability's authorization surface and extends the preset catalog. It
does not change the mode-native permission contract, the fallback mechanism, or the additive-layer
property this ADR's Consequences assert.

## Validation

- Run `npm run check:architecture`.
- Run `npm run lint:docs`.
- Run backend catalog and permission middleware tests.
- Run backend fallback-switch tests.
- Run backend user-service tests for atomic role-plus-location updates and CSV-import role preset location propagation.
- Run frontend User Management RBAC contract tests for catalog failure warnings, assigned-scope role updates, and bulk assigned-scope assignment.
- Run targeted User Management frontend tests when role UI behavior changes.
- Confirm Services and F&B routes still deny unavailable workflow capabilities before RBAC permission fallback is considered.
- Confirm a freshly approved tenant in the mode receives the mode's role-preset-compatible user schema and that provisioning failure cleanup leaves the registration retryable.
