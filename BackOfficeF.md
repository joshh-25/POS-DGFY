# Back Office / POS Settings Handoff

**Prepared:** 2026-09-15  
**Repository:** `C:\xampp\htdocs\POS-DGFY`  
**Branch:** `POS-Development` (currently ahead of `origin/POS-Development` by 16 commits)

## Handoff snapshot

The POS-native Business Admin surface is the interim merchant back office until
the dedicated Back Office product in issue #1354 ships. Business Admin routes
and settings migration Phases 351 and 360-364 are implemented and documented.
Phase 365 (hardening and acceptance) is approved by the user but is still
`planned`; this document does not implement it or mark it complete.

The worktree already contains many unrelated tracked and untracked changes.
Preserve them. Do not run `git reset --hard`, `git checkout --`, `git clean`,
or bulk-stage/commit the entire worktree without an explicit scope review.

## Current architecture

- `apps/dgfy-api` — Express/Sequelize backend and canonical API (port 5000).
- `apps/dgfy-pos` — standalone POS and interim Business Admin surface (port
  5174). It uses `HashRouter`, so local settings URLs include `/#/`.
- `apps/dgfy-storefront` — customer-facing public catalog and online ordering
  surface (port 5175).
- `apps/dgfy-ims` — SKUpervisor/IMS (port 5173); new back-office-level work
  is not routed here under the repository policy.
- `packages/web-core` — shared POS/settings components and services consumed by
  the frontend apps.
- `apps/dgfy-migration-runner` — database migrations and seeders.
- `apps/dgfy-android-bridge` — device bridge (port 5101); MySQL is normally
  on port 3306.

### Ownership boundaries

Business Admin is a tenant-scoped read/control-plane projection. It must call
canonical owners rather than create duplicate truth:

- POS owns checkout, payments, receipts, shifts, drawer activity, refunds,
  voids, delivery operations, terminal/device mutations, and F&B tables/checks.
- Catalog/inventory owns item identity, categories, pricing, stock, FIFO, and
  recipe consumption.
- Storefront owns public catalog/order presentation. Accepted online orders are
  visible in the POS order center.
- DGFY auth owns identity, membership, and company switching.
- Fiscal evidence is read-only until the BIR/CAS/legal gates are satisfied.

Business Admin is available at `/business-admin/*` and `/backoffice/*` in POS.
For a local browser, use:

```text
http://localhost:5174/#/backoffice/settings/storefront
```

The legacy POS settings path remains usable for cashiers, onboarding users, and
direct links. Authorized administrators are routed to Business Admin. Terminal
registry, branch binding, queue/sound, active-shift, drawer, checkout, and
device controls remain in POS.

## Changes already made

- **Phase 351 — Business Admin / Back Office functional parity:** completed.
  Added the tenant-scoped Business Admin API/read models and POS workspaces for
  the fifteen BO slices in `docs/features/backoffice.md`. Some policy gates
  remain intentionally partial or deferred (expenses, biometric attendance,
  approvals, BIR/CAS, payout settlement, terminal heartbeat).
- **Phase 360 — Settings inventory and ownership:** completed. Recorded every
  migrated field, API, permission, storage owner, and tenant/branch/terminal/
  personal scope.
- **Phase 361 — Reusable settings forms:** completed. Extracted shared
  settings loading/saving and preserved the existing POS form/API owner.
- **Phase 362 — Back Office access/navigation:** completed. Added nested routes,
  server-projected capabilities, tenant/branch context, and dirty-navigation
  protection. Business Admin visibility does not grant edit rights.
- **Phase 363 — Configuration editor migration:** completed. Business profile,
  POS configuration, Storefront, delivery pricing, branches, attendance,
  payments, registers, and Team & Access editors are embedded in Business
  Admin with validation, uploads, save feedback, readback, and permission-
  aware read-only states.
- **Phase 364 — POS entry-point switch:** completed. Administrator settings now
  open Business Admin; terminal-only setup remains in POS. Tenant/branch
  metadata refreshes across open POS contexts without clearing carts, closing
  shifts, navigating, or changing the active terminal.
- Phases 360-364 required **no database/data migration**. Existing setting
  keys, storage owners, PIN secrecy, device enforcement, and shift protections
  were retained.

## Approved remaining work: Phase 365

Use the authoritative scope in:

- `docs/features/backoffice.md` — “Phase 365 — Hardening and acceptance”.
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — ledger entry for Phase 365.

Complete and record evidence for:

1. Field-by-field migration coverage, successful save/readback after refresh,
   and a documented rollback path.
2. `settings:view`, `settings:edit`, branding, user-management,
   payment-policy, and master-admin permission matrices, including direct API
   rejection for unauthorized mutations.
3. Company switching and branch isolation; prove no tenant or branch data leaks
   through reads, writes, caches, events, or refresh signals.
4. Concurrent edits and stale location/settings versions. Do not invent a new
   persistence owner; use the existing ownership/contract boundaries.
5. Offline behavior: preserve carts, shifts, terminal identity, and safe
   failure semantics; do not silently claim an offline settings write succeeded.
6. Desktop/mobile responsive behavior and all affected POS, API, and Storefront
   builds/tests.
7. Documentation, architecture, compliance, whitespace, and rollback evidence.

Only mark Phase 365 `completed` in the ledger after every acceptance gate has
evidence. Do not add a migration unless the field/contract inventory proves a
specific schema requirement; Phases 360-364 found none.

## Important decisions and non-goals

- `docs/features/backoffice.md` is the detailed Back Office plan; the continuous
  phase ledger is `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`.
- Leave the older root `Implementation.md` untouched for this initiative unless
  a separate user request explicitly changes that scope.
- Preserve existing setting keys and backend ownership. Do not expose generic
  EAV keys merely because `PUT /settings` accepts them.
- Business Admin access must not automatically grant editing rights. Storefront
  branding uploads additionally require `settings:storefront_branding_edit`.
- Storefront calculated/free delivery modes remain visibly non-active at
  checkout until the checkout pricing contract exists; do not claim runtime
  support during Phase 365.
- Do not revive the stale `apps/dgfy-web` architecture.
- Do not add duplicate POS checkout, shift, drawer, terminal, catalog, payment,
  or F&B command paths to Business Admin.
- No production deployment, merge, migration, or broad cleanup is authorized
  by this handoff alone.

## Primary files

Plan and governance:

- `docs/features/backoffice.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0071-frontend-split-into-three-apps.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`

Runtime:

- `apps/dgfy-pos/src/main.jsx`
- `apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx`
- `apps/dgfy-pos/src/features/businessAdmin/businessAdminSettingsModel.js`
- `apps/dgfy-api/src/modules/businessAdmin/`
- `apps/dgfy-api/src/modules/businessAdmin/domain/businessAdminAccessPolicy.js`
- `apps/dgfy-api/src/routes/businessAdmin.js`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `packages/web-core/src/features/pos/utils/settingsWorkspaceModel.js`
- `packages/web-core/src/features/pos/utils/businessAdminSettingsSync.js`
- `packages/web-core/src/services/settingsService.js`

Focused tests:

- `apps/dgfy-pos/tests/unit/businessAdminSettingsModel.contract.test.js`
- `apps/dgfy-pos/tests/unit/businessAdminSettingsSync.contract.test.js`
- `apps/dgfy-pos/tests/unit/settingsWorkspaceModel.contract.test.js`
- `apps/dgfy-api/tests/businessAdmin.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/backofficeNavigation.behavior.test.jsx`
- `packages/web-core/src/features/pos/utils/__tests__/setupFlow.test.js`

## Validation commands

Run from the repository root after reviewing the dirty-worktree scope:

```powershell
npm --prefix apps/dgfy-pos test
npm --prefix apps/dgfy-pos run lint
npm --prefix apps/dgfy-pos run build
npm --prefix apps/dgfy-api test
npm --prefix apps/dgfy-api run lint
npm run check:docs
npm run check:architecture
git diff --check
```

For local functional verification, start the project stack with the repository
stack procedure (`npm run dev:local-pos-stack` or the `start-pos-dgfy-stack`
skill), then verify POS 5174, Storefront 5175, API 5000, device bridge 5101,
and MySQL 3306. Exercise both the Business Admin route and the legacy cashier/
onboarding route without opening or closing a real shift.

## Next-agent operating rules

1. Read `AGENTS.md`, `docs/START_HERE.md`, the architecture boundary/governance
   docs, the relevant ADRs, then the two Back Office plan documents.
2. Re-check `git status` and isolate only Phase 365 files before editing.
3. Implement only the approved Phase 365 scope; do not rewrite completed phases.
4. Run focused tests first, then the affected app builds/lints and repository
   documentation/architecture checks.
5. Update the phase ledger only with evidence-backed status and links. Do not
   claim 100% completion from a build alone.
6. Report changed files, tests, migration decision, rollback evidence, and any
   unresolved policy gate before proposing a commit or PR.
