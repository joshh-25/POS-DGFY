---
status: reference
owner: engineering
last_reviewed: 2026-09-03
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md (2026-09-03 Amendment --
  Accounting preset family and the Admin + Accounting voucher-management restriction; the Decision
  clause "keep authorization based on granular permissions ... not role labels" is extended, not
  weakened)
declaration_id: 2026-09-03-accounting-role-voucher-management-gating
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.03
verification_evidence: node --check on every changed/added apps/dgfy-api file (0 errors),runtime assertion of the rebuilt role catalog across all 7 workflow modes (each family resolves exactly one *_accounting preset; role=manager rank=5 scope=tenant; permissions vouchers:view+vouchers:manage+reports:view+reports:export),runtime assertion that DEFAULT_ROLE_PERMISSIONS.manager no longer contains vouchers:manage and still contains vouchers:view and settings:edit,runtime assertion that DEFAULT_ROLE_PERMISSIONS.admin still contains vouchers:manage,runtime assertion that food_manufacturing_manager (which inherits managerPermissions) no longer contains vouchers:manage,apps/dgfy-api/tests/modeRolePresets.test.js (extended -- accounting-preset presence/shape per family and the manager voucher-permission narrowing),apps/dgfy-api/tests/voucherManagementGating.test.js (new -- Express route probes through the real checkAnyPermission middleware plus a source-text assertion binding them to routes/vouchers.js),broad regression run across every voucher/pricelist/permission/userService test file (26 suites, 498 tests, all passing, zero edits beyond the two files this phase extends),npm run check:architecture (OK -- 54 modules, 560 code files, 94 controllers),npm run lint:docs and check:adr (OK -- 29 governed docs, 87 ADRs),npm run build:pos (clean),npm run build:skupervisor (clean)
rollback_note: Revert this PR's diff. No migration, no schema change, no ENUM change, and no data
  write -- every change is config, route-guard, client-gate, or docs. The one script added
  (revoke-manager-voucher-manage.js) is dry-run by default and is NOT executed by this PR, so no
  users.permissions row is modified by merging or reverting it.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1493-ACCOUNTING-ROLE-VOUCHER-MANAGEMENT-GATING
---

# Accounting role + voucher management restricted to Admin + Accounting (Phase 263, #1493)

## Compliance Impact Classification

**Major.** Three changed files match `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
pattern `^packages/web-core/src/features/pos/` at a `major` floor on the `pos`/`terminal` surfaces:
`pages/TerminalPage.jsx`, `components/TerminalPageLayout.jsx`, and
`components/TerminalOperationsWorkspace.jsx`.

The backend files in this phase (`config/permissions.js`, `config/modeRolePresets.js`,
`routes/vouchers.js`, `scripts/revoke-manager-voucher-manage.js`) match no sensitive path rule of
their own -- `routes/vouchers.js` is not covered, only `modules/vouchers/` is, and nothing under
`modules/vouchers/` is touched here. The declaration exists because of the POS client gates, and
independently because narrowing who may issue voucher campaigns is an authorization-surface change
worth a written record regardless of the automated floor.

Per `docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs"
(#884/#1163/#1248): `preflight_request_ref` carries a `NOT-EXECUTED-*` placeholder, the accepted and
expected state for a PR targeting `develop` -- the continuous compliance-preflight sweep reconciles
it after merge, not at PR time.

## Scope

Full design rationale and the file-by-file list: `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`'s
Phase 263 entry and this PR's body.

- `apps/dgfy-api/src/config/modeRolePresets.js` -- new `accountingPreset()` factory; one
  `*_accounting` preset added to each of the six mode families; `ROLE_CATALOG_VERSION` bumped to
  `2026-09-03.mode-aware-rbac-v4`.
- `apps/dgfy-api/src/config/permissions.js` -- `DEFAULT_ROLE_PERMISSIONS.manager` loses
  `vouchers:manage`, keeps `vouchers:view`.
- `apps/dgfy-api/src/routes/vouchers.js` -- `canManageVouchers` drops its legacy
  `SYSTEM.EDIT_SETTINGS` arm. `canViewVouchers` unchanged.
- `apps/dgfy-api/scripts/revoke-manager-voucher-manage.js` -- new, dry-run by default, not executed
  by this PR.
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx` -- `canManageVouchers` narrowed to
  `vouchers:manage`; new `canManagePricelists` retains the old `vouchers:manage || settings:edit`
  pair; `canViewVouchers` re-based on `canManagePricelists` so read access is bit-for-bit unchanged.
- `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx`,
  `.../TerminalOperationsWorkspace.jsx` -- thread the new `canManagePricelists` prop through and
  bind `PricelistManagementPanel` to it instead of to `canManageVouchers`.
- `docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md` -- dated `## Amendments` block
  (ADR 0039 `[default]`-tier route: amend in the same PR, do not supersede).
- `apps/dgfy-api/tests/modeRolePresets.test.js` -- extended coverage.
- `apps/dgfy-api/tests/voucherManagementGating.test.js` -- new; route-gate regression coverage.
- `apps/dgfy-api/tests/pricelistRoutePermissionParity.test.js` -- header comment only, recording that
  parity with `routes/vouchers.js` now holds on the view gates and deliberately not on the manage
  gates. No assertion changed; every case still passes unmodified.

## Affected Surfaces

1. **Voucher campaign management (`pos`/`terminal`) narrows from "Admin + anyone holding
   `settings:edit` or `vouchers:manage`" to "Admin + Accounting."** In practice the group that
   loses the capability is compatibility-role `manager`, which holds `settings:edit` by default.
   `is_master_admin` still bypasses every permission check, in `checkAnyPermission` itself.
2. **Voucher read access is deliberately unchanged.** `canViewVouchers` keeps both legacy `SYSTEM.*`
   arms on the backend and the equivalent on the client. A manager can still see campaigns, their
   status, and their redemption reporting; only create/edit/lifecycle is withdrawn.
3. **Pricelist management is deliberately unchanged, and this is the subtle part.** Pricelists
   (#732) share the `VOUCHERS.*` permission group with vouchers, and the POS client previously used
   one `canManageVouchers` flag for both panels. Narrowing that one flag would have silently taken
   pricelist management away from every manager -- a regression #1493 never asked for. The flag is
   therefore split into `canManageVouchers` (`vouchers:manage`, mirrors `routes/vouchers.js`) and
   `canManagePricelists` (`vouchers:manage || settings:edit`, mirrors `routes/pricelists.js`, which
   this phase leaves untouched).
4. **The POS client gate and the backend gate are changed together, on purpose.** Changing only the
   backend would leave every manager seeing voucher create/edit controls and discovering the
   restriction as a 403 on submit.
5. **No checkout, pricing, redemption, or money path is touched.** No voucher eligibility rule, no
   discount computation, no redemption ledger write, and no reason code changes -- hence
   `reason_codes_impacted: NONE`. This phase changes only who is authorized to administer campaigns.
6. **`ROLE_CATALOG_VERSION` bump forces a client catalog refetch.** A client holding
   `2026-05-19.mode-aware-rbac-v3` would offer neither the new preset nor the corrected manager
   permission set.

## Compliance Preconditions

1. **ADR 0020's Decision clause is extended, not weakened.** Authorization stays on granular
   permissions: the new role is a preset carrying `vouchers:manage`, and the route guard checks that
   permission string. No route anywhere gained a role-label comparison, and `USER_ROLES` /
   `ROLE_HIERARCHY` / the `users.role` ENUM are untouched -- so no migration and none of the two
   duplicate enum syncs (`models/User.js`, `dgfyAccountRepository.js`).
2. **Retiring #655's legacy dual-gate arm is condition-met, not convenience.** `routes/vouchers.js`
   set its own retirement condition: a full deploy cycle for
   `scripts/backfill-role-permissions.js`. Commits 33bd92646 (the `PERMISSIONS.VOUCHERS` group the
   backfill reads) and 34224d4c3 (the dual-gate) landed 2026-08-18 and have been on `origin/main`
   across several releases since. The arm is retired on the management routes only.
3. **Fail-closed, with the master-admin escape hatch intact.** Post-change, the only ways to reach
   voucher management are `is_master_admin`, an admin-role/`*_admin`-preset permission set, an
   `*_accounting` preset, or an explicit per-user grant of `vouchers:manage` by a tenant admin. A
   tenant that somehow ends up with no qualifying user is recoverable by `is_master_admin`.
4. **A config change cannot revoke a permission already written to a row, and this PR does not
   pretend otherwise.** `resolveEffectivePermissions` re-derives role defaults only when a user's
   stored `users.permissions` array is empty, and `scripts/backfill-role-permissions.js` is
   additive, so managers on long-running tenants may already carry `vouchers:manage` in that array
   and will keep it until an operator acts. `apps/dgfy-api/scripts/revoke-manager-voucher-manage.js`
   is that action: dry-run by default, printing every row it would touch, writing nothing without
   `--apply`, and never touching admin rows, `is_master_admin` rows, or `*_accounting`-preset rows.
   **It is not executed by this PR.**
5. **No data is written by merging this PR.** No migration, no schema change, no backfill, no
   seeder. Rollback is a plain revert.

## Verification Evidence

See the `verification_evidence` front-matter field for the itemized list. Summary: `node --check`
clean on every changed/added `apps/dgfy-api` file, including the new script; the rebuilt role
catalog was asserted at runtime across all seven workflow-mode inputs (`msme`, `retail`,
`healthcare`, `food_manufacturing`, `services`, `fnb`, `hospitality`), confirming each family
resolves exactly one `*_accounting` preset with the intended role/rank/scope/permission set, that
`DEFAULT_ROLE_PERMISSIONS.manager` no longer contains `vouchers:manage` while retaining
`vouchers:view` and `settings:edit`, that `DEFAULT_ROLE_PERMISSIONS.admin` still contains
`vouchers:manage`, and that `food_manufacturing_manager` (which inherits `managerPermissions`) lost
it too; `apps/dgfy-api/tests/modeRolePresets.test.js` extended with matching assertions;
`npm run build:pos` and `npm run build:skupervisor` both build clean (both apps mount
`TerminalPage.jsx`).

Outstanding before merge:

- **`POST /api/v1/compliance/preflight` has not been executed** -- front matter carries
  `NOT-EXECUTED-1493-ACCOUNTING-ROLE-VOUCHER-MANAGEMENT-GATING`, expected on a `develop`-targeting
  PR per `docs/compliance/request-time-preflight-protocol.md`; the continuous sweep reconciles it
  post-merge.
- **The full backend jest suite was not run locally.** Tier 0 self-verification here is syntax
  check + runtime catalog assertions + the extended preset test + both frontend builds. The full
  gate is delegated to `promotion-quality-gate.yml` at promotion time (#1431 Phase C/D).
- **`revoke-manager-voucher-manage.js` has not been run against any environment**, by design. Until
  an operator runs it with `--apply`, managers whose stored `users.permissions` already contains
  `vouchers:manage` retain voucher management. This is a known, deliberate residual, not an
  oversight -- see Compliance Precondition 4.
