---
status: reference
owner: engineering
last_reviewed: 2026-08-18
declaration_id: 2026-08-18-vouchers-permission-group
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.08.18
verification_evidence: node --check (config/permissions.js, config/modeRolePresets.js, routes/vouchers.js), npm run check:compliance, npm run check:architecture
rollback_note: Revert the VOUCHERS permission group, the mode-visibility entries, the ROLE_CATALOG_VERSION bump, and the dual-gate on routes/vouchers.js together. No data migration was written -- the legacy SYSTEM.VIEW_SETTINGS/EDIT_SETTINGS arm stays live in the same commit, so a revert only removes the new VOUCHERS grant path, it does not remove any admin's access.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-18T00:00:00+08:00
preflight_request_ref: PR-655-VOUCHERS-PERMISSION-GROUP
---

# Vouchers Dedicated Permission Group

## Compliance Impact Classification

Major. Adds a new `PERMISSIONS.VOUCHERS` group (`vouchers:view` / `vouchers:manage`) and changes the
access-control gate on all 7 voucher admin routes (`apps/dgfy-api/src/routes/vouchers.js`) and the
POS Vouchers settings tab (`apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`) — matching the
`pos,terminal` minimum classification this repo already applies to any POS/Terminal settings-adjacent
permission change. It is a permission-scoping change, not a checkout or payment-capture change: it
does not process a transaction, move money, or touch the POS drawer.

## Affected Surfaces

- Voucher admin API permission gate (`apps/dgfy-api/src/routes/vouchers.js`), backend permission
  config (`apps/dgfy-api/src/config/permissions.js`, `config/modeRolePresets.js`).
- POS/Terminal Vouchers settings tab gate (`apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`).
- Frontend permission-catalog fallback (`apps/dgfy-web/src/config/permissions_frontend.js`) — the
  degraded-path mirror only; the live source is the server-driven role catalog.

## Compliance Preconditions

- **No data migration.** `scripts/backfill-role-permissions.js` already performs an idempotent,
  additive, cross-tenant permission merge and is already wired into `scripts/deploy.sh` ahead of the
  pm2 reload. `DEFAULT_ROLE_PERMISSIONS.admin` is `getAllPermissions()`, so admin picks up the new
  group automatically; `manager`'s explicit list is updated in this PR. New tenants get it seeded at
  provisioning via the same default map.
- **Dual-gated for one release, not a hard cutover.** Every route in `routes/vouchers.js` accepts
  `VOUCHERS.*` OR the legacy `SYSTEM.VIEW_SETTINGS`/`EDIT_SETTINGS` pair via `checkAnyPermission`.
  This is load-bearing: `resolveEffectivePermissions` (`utils/userPermissions.js`) only re-derives
  role defaults when a user's *stored* permissions array is empty, so a hard swap to `VOUCHERS`-only
  could lock out an existing admin/manager whose stored array predates the backfill running on a
  deploy path that skips `scripts/deploy.sh` (the containerized GHCR path). No existing merchant
  admin loses access on cutover.
- **`TARGETED_ROLES` scope.** The backfill only targets `admin`/`manager`/`staff` roles (unless
  `BACKFILL_ROLE_PERMISSIONS_ALL=1`); `cashier`/`po`/`do`/`jo` are unaffected, consistent with those
  roles never having held `SYSTEM.EDIT_SETTINGS` either.
- **Visibility wiring is not automatic** — `PERMISSION_GROUP_VISIBILITY` in `modeRolePresets.js`
  needed an explicit `VOUCHERS` entry per workflow mode for the group to reach the user-management UI
  (`GET /users/role-catalog`); `ROLE_CATALOG_VERSION` bumped accordingly (no client asserts the exact
  version string).

## Verification Evidence

- `node --check` on all three touched backend files (`config/permissions.js`,
  `config/modeRolePresets.js`, `routes/vouchers.js`) — OK.
- `npm run check:compliance` — re-run after adding this declaration, expected PASS.
- `npm run check:architecture` — architecture boundary check against the merge-result tree.
- No new tests added (permission-config and route-gate wiring, not new business logic); relies on
  this repo's existing `checkAnyPermission` implementation, already covered by
  `apps/dgfy-api/tests/*` auth-middleware coverage. Local Jest could not be run in this worktree (no
  `node_modules` installed) — stated here rather than silently omitted; the PR body carries the same
  note.
