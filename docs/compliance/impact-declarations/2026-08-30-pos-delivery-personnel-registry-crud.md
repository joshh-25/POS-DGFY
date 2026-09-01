---
status: reference
owner: engineering
last_reviewed: 2026-08-30
declaration_id: 2026-08-30-pos-delivery-personnel-registry-crud
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.08.30
verification_evidence: apps/dgfy-api/tests/deliveryPersonnelRegistry.usecase.test.js (6 new cases, +3 in the PR #1208 review-fix amendment below),apps/dgfy-api/tests/posValidator.deliveryPersonnelRegistry.test.js (7 new cases),existing posDeliveryAssignment.usecase.test.js/posDeliveryJobStatus.usecase.test.js/posDeliveryCompletionGuard.usecase.test.js/posDeliveryPersonnel.repository.test.js/posValidator.deliveryAssignment.test.js re-run unmodified (27 cases, all green),node --check on every changed apps/dgfy-api .js file,npm run check:architecture,npm run build:pos,npm run build:skupervisor
rollback_note: Revert this commit. No migration and no schema change were made -- delivery_personnel already carried every column this phase uses. The three new routes are additive-only; the existing GET /pos/delivery-personnel route, its use case, and posUseCases.js/posRepository.js are untouched. Reverting removes the registry CRUD routes, the admin panel, and the picker's datalist/id-submission path; every existing free-text delivery assignment keeps working unchanged both before and after a revert.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-30T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1080-POS-DELIVERY-PERSONNEL-REGISTRY-CRUD
---

# Delivery Personnel Registry CRUD

## Compliance Impact Classification

Major. `apps/dgfy-api/src/routes/pos.js` is an exact-prefix match in
`check-compliance-impact.js` at floor `major`/`pos,terminal`, and
`packages/web-core/src/features/pos/` is a prefix match at the same floor. This PR adds three new
admin-gated registry routes and a merchant-facing management panel plus an assignment picker — no
schema change, no new payment/transaction logic, no change to an existing permission string.

## What changed and why

Filed as #1080 (Phase 205, Wave 2 of the #1183 Surebiz go-live readiness track): the
`delivery_personnel` table has existed since `20260808000002-create-delivery-personnel-and-
assignment.cjs`, but nothing could create, edit, or deactivate a row, and the POS delivery
assignment control was a hard-coded free-text `<input>` even though a read endpoint
(`GET /pos/delivery-personnel`) and its service wrapper already existed unused.

1. **New self-contained backend module**, `apps/dgfy-api/src/modules/deliveryPersonnel/`,
   mirroring `modules/employees/` file-for-file (index/README/controllers/usecases/repositories).
   Deliberately **not** added to the 10,175-line `posUseCases.js` — keeps this phase out of the
   collision surface the concurrent Phase 204 (#965) also needs to edit.
2. **Three new routes** on the existing `/pos` router, all gated on
   `PERMISSIONS.POS.actions.MANAGE_EMPLOYEES` (`pos:employees:manage`) -- reused rather than a new
   permission string, since a brand-new permission would be invisible to any tenant user with a
   stored permission array until a backfill migration ran (no such migration precedent exists in
   this repo):
   - `GET /pos/delivery-personnel/registry` (admin list, incl. inactive by default)
   - `POST /pos/delivery-personnel` (create)
   - `PATCH /pos/delivery-personnel/:deliveryPersonnelId` (update; `is_active: false` is the
     deactivate operation -- there is no hard-delete route, matching
     `delivery_jobs.delivery_personnel_id`'s `ON DELETE RESTRICT`)
   The existing cashier-facing `GET /pos/delivery-personnel` (active-only, location-scoped,
   `pos:view`) is untouched -- two different auth tiers and filters over one model, both already
   the norm (`modules/tenantLocations` also reads `DeliveryPersonnel`).
3. **Soft duplicate guard** (not a schema constraint): create does a case-insensitive same-location
   active-name check and returns `409 CONFLICT` -- `display_name` intentionally has no unique
   index, since two riders may share a name company-wide.
4. **Admin panel**: `DeliveryPersonnelManagementPanel.jsx`, modelled on
   `EmployeeManagementPanel.jsx`, mounted in `TerminalOperationsWorkspace.jsx`'s employees pane,
   gated on `canManageDeliveryPersonnel` (reuses `pos:employees:manage`, declared under its own
   name for a future permission split).
5. **Picker**: `TerminalPage.jsx`'s `deliveryPersonnelState` changes from a hard-coded literal to
   real state, lazily fetched (via the previously-unused `fetchActiveDeliveryPersonnel`) only once
   the incoming-orders queue actually renders a manual delivery job -- not on every terminal mount.
   `DeliveryAssignmentControl.jsx` keeps its existing free-text `<input>` and adds a `<datalist>` of
   active registry names; an exact match submits `delivery_personnel_id`, anything else submits
   `delivery_personnel_name` -- never both, matching the server's existing
   `.or(...).oxor(...)` contract. ADR 0034's 2026-08-12 amendment requires the free-text fallback
   to keep working unchanged; it does.

Two authoritative docs asserted the opposite of what is now true and are corrected in this same
PR: `docs/api/specification.md` (the `GET /pos/delivery-personnel` section said registry
create/edit/activate/deactivate were "not part of this POS endpoint") and
`docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md` (said no dropdown/registry lookup existed). No ADR
change was needed -- ADR 0034 already mandates this registry and already permits the id-or-name
choice; this phase implements what it already requires.

## Affected Surfaces

- `pos`, `terminal` -- three new routes on the `/pos` router; a new admin management panel and a
  picker change in the POS/IMS terminal workspace (`TerminalOperationsWorkspace.jsx`,
  `TerminalPage.jsx`, `DeliveryAssignmentControl.jsx`). No in-person POS checkout/sale/payment
  logic changes -- this is registry management and an assignment-time convenience, not a
  transaction-path change.

## Compliance Preconditions

- No migration, no schema change -- `delivery_personnel` already carries every column this phase
  uses; `apps/dgfy-migration-runner/migrations/` is untouched.
- No new permission string -- reuses `pos:employees:manage`, already granted to `admin`/`manager`
  and deliberately withheld from `cashier`/`staff`. No lockout risk, no backfill migration needed.
- No new `DomainErrorCode` -- `VALIDATION_FAILED` (422), `CONFLICT` (409), `RESOURCE_NOT_FOUND`
  (404) all already exist.
- No `idempotency_key` added to any new route -- a registry row is not a money or state-machine
  operation, so `check-compliance-api-contracts.js`'s `DOC-02-*` checks gain no new obligation.
- Every existing free-text delivery assignment keeps working unchanged; the id path is purely
  additive. Regression coverage: the existing delivery-assignment test suites (listed in
  `verification_evidence`) re-ran unmodified and stayed green.

## Verification Evidence

- `apps/dgfy-api/tests/deliveryPersonnelRegistry.usecase.test.js` -- 6 new cases: create + audit
  row, duplicate active name -> 409, inactive/foreign `location_id` -> 422, update of a missing id
  -> 404, `is_active: false` soft-deactivates and the row survives, list includes inactive rows.
- `apps/dgfy-api/tests/posValidator.deliveryPersonnelRegistry.test.js` -- 7 new cases covering the
  four new schemas, including the `.min(1)` no-op-PATCH rejection and length boundaries.
- Existing suites re-run unmodified, all green (27 cases):
  `posDeliveryAssignment.usecase.test.js`, `posDeliveryJobStatus.usecase.test.js`,
  `posDeliveryCompletionGuard.usecase.test.js`, `posDeliveryPersonnel.repository.test.js`,
  `posValidator.deliveryAssignment.test.js`.
- `node --check` on every changed/new `apps/dgfy-api` `.js` file -- Tier 0 per
  `.agents/skills/implement/SKILL.md` (`apps/dgfy-api` has no real build step). Syntax-only.
- `npm run check:architecture` -- confirms the new module satisfies `REQUIRED_MODULE_FILES`,
  `REQUIRED_LAYER_DIRS`, the `Handlers.js` naming rule, and the no-model-import-in-controllers
  rule.
- `npm run build:pos`, `npm run build:skupervisor` -- real Vite builds; `packages/web-core` is
  touched and is the shared trunk for `apps/dgfy-pos`/`apps/dgfy-ims`. `npm run build:store` is not
  required -- no `apps/dgfy-storefront` file is touched.
- No `package.json` was touched -- the lockfile-sync check does not apply.

## Changed Files

- `apps/dgfy-api/src/modules/deliveryPersonnel/index.js`
- `apps/dgfy-api/src/modules/deliveryPersonnel/README.md`
- `apps/dgfy-api/src/modules/deliveryPersonnel/controllers/deliveryPersonnelHandlers.js`
- `apps/dgfy-api/src/modules/deliveryPersonnel/usecases/deliveryPersonnelUseCases.js`
- `apps/dgfy-api/src/modules/deliveryPersonnel/repositories/deliveryPersonnelRepository.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/tests/deliveryPersonnelRegistry.usecase.test.js`
- `apps/dgfy-api/tests/posValidator.deliveryPersonnelRegistry.test.js`
- `packages/web-core/src/features/pos/services/deliveryPersonnelService.js`
- `packages/web-core/src/features/pos/components/DeliveryPersonnelManagementPanel.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/components/DeliveryAssignmentControl.jsx`
- `docs/api/specification.md`
- `docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

## Amendments

### 2026-08-30: PR #1208 review-fix (RF-2, RF-3)

`pr-reviewer`'s review of PR #1208 raised two should-fix findings against this same feature, both
addressed in the same PR rather than as a separate declaration -- neither changes the classification
or affected-surfaces list above:

- **RF-2** -- the duplicate-active-name guard described above only ran on create. `PATCH` could
  rename, relocate, or reactivate a row into a collision with another active row, undermining the
  registry's case-insensitive name uniqueness invariant. `buildUpdateDeliveryPersonnelUseCase` now
  re-runs `findActiveByDisplayName` (extended with an `excludeId` option) inside the same
  transaction whenever the update leaves the row active under a name/location that isn't its
  current one, returning the same `409 CONFLICT`. Regression coverage:
  `deliveryPersonnelRegistry.usecase.test.js` gains 3 cases -- rename collision, reactivation
  collision, and a same-row no-op PATCH proving no self-collision false positive.
- **RF-3** -- `DeliveryPersonnelManagementPanel` already reported its freshly-loaded registry via
  an `onDeliveryPersonnelChanged` prop after every create/update/toggle, but nothing consumed it:
  the panel was mounted without the prop in `TerminalOperationsWorkspace.jsx`, and
  `TerminalPage.jsx`'s picker fetch was one-shot. Wired `onDeliveryPersonnelChanged` through
  `TerminalPage.jsx` -> `TerminalPageLayout.jsx` -> `TerminalOperationsWorkspace.jsx` into the panel,
  so an admin create/edit/reactivate now updates the terminal's `deliveryPersonnelState` in place
  and the picker's `<datalist>` reflects it without a reload.
- The RF-1 blocker (the contract test not updated for this phase's actual picker/callback
  contract) was a test-only fix -- `deliveryAssignmentControl.contract.test.js` now asserts the
  datalist copy and the `{ id }`/`{ name }` object callback the component already implements. No
  production behavior changed for RF-1.

Verification: `deliveryPersonnelRegistry.usecase.test.js` (9 cases, all green),
`deliveryAssignmentControl.contract.test.js` (2 cases, all green), `node --check` on both changed
`apps/dgfy-api` files, `npm run build:pos`, `npm run build:skupervisor`.

Landed as two batched commits per `docs/ai/PR.md` (backend + RF-1 test fix, then the RF-3
frontend prop wiring listed above) -- both amend this same declaration, not two separate
declarations, since they're one reviewed change set on one PR.

### 2026-08-30: PR #1208 second review round (RF-3, follow-up)

Corrects the prior amendment's RF-3 entry: the wiring described there
(`TerminalPage.jsx` -> `TerminalPageLayout.jsx` -> `TerminalOperationsWorkspace.jsx`) reaches the
*outer* `TerminalOperationsWorkspace` component only. That file also defines a second, unrelated
function -- `SettingsWorkspace`, the component that actually backs every `settings_*`/
`terminal_setup`/`location_scope` view mode -- which renders `DeliveryPersonnelManagementPanel` via
its own `renderEmployeesPane` helper and references `onDeliveryPersonnelChanged` there too (line
~7933), but never had that identifier in its own destructured parameter list. That's a plain
`ReferenceError` at render time -- not a build-time failure -- for any admin with delivery-personnel
management permission who actually opens the Employees settings tab; the previous round's `npm run
build:pos`/`build:skupervisor` evidence could not have caught it, since neither runs the component.

Fixed by adding `onDeliveryPersonnelChanged = () => {}` to `SettingsWorkspace`'s own destructured
params and threading the real callback through the single remaining hop -- the outer
`TerminalOperationsWorkspace`'s `<SettingsWorkspace .../>` invocation -- so the prop that was
already correctly plumbed everywhere else now also reaches this component's own instance instead of
throwing.

New regression coverage: `deliveryPersonnelSettingsPane.behavior.test.jsx` renders the real
`TerminalOperationsWorkspace` tree end to end (not a mocked stand-in), switches to the Employees
tab, and asserts `DeliveryPersonnelManagementPanel` mounts and calls
`onDeliveryPersonnelChanged` with the loaded registry rather than throwing. Confirmed this test
fails with the pre-fix code (`ReferenceError: onDeliveryPersonnelChanged is not defined`, reproduced
via a temporary local revert) and passes with the fix restored.

Verification: `deliveryPersonnelSettingsPane.behavior.test.jsx` (2 cases, all green),
`deliveryAssignmentControl.contract.test.js` (2 cases, all green, unaffected), `npm run build:pos`,
`npm run build:skupervisor`.

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-1080-POS-DELIVERY-PERSONNEL-REGISTRY-CRUD` is
expected on a PR targeting `develop`, not a finding -- per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> main` (or
`develop -> staging`) promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22/25
amendments), not per PR.
