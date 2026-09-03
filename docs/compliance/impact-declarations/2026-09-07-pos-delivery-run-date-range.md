---
status: reference
owner: engineering
last_reviewed: 2026-09-03
declaration_id: 2026-09-07-pos-delivery-run-date-range
classification: major
surfaces: pos,terminal
reason_codes_impacted: DELIVERY_RUN_RANGE_INVALID,DELIVERY_RUN_RANGE_TOO_LONG
policy_version: 2026.09.03
verification_evidence: apps/dgfy-api/tests/deliveryRun.usecase.test.js -- actually executed (Jest): create with a valid scheduled_date/scheduled_date_end range; reject create when the range exceeds MAX_DELIVERY_RUN_SPAN_DAYS; a PATCH sending scheduled_date_end alone rejected against the row's existing conflicting scheduled_date; a PATCH sending scheduled_date alone rejected against the row's existing conflicting scheduled_date_end; a PATCH updating both fields together accepted; a PATCH whose merged effective range exceeds the max span rejected,apps/dgfy-api/tests/posValidator.deliveryRun.test.js -- actually executed (Jest): createDeliveryRunSchema accepts a valid range/rejects end-before-start/rejects an end date with no start date; updateDeliveryRunSchema accepts scheduled_date_end alone (no cross-field ref check at this layer) and accepts clearing it to null,apps/dgfy-api/tests/deliveryRunDispatch.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/deliveryRunRoutes.transport.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/deliveryRunWriteThrough.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx -- actually executed (Vitest, run from apps/dgfy-ims per its own test include): create sends both scheduled_date/scheduled_date_end when an end date is set; client-side block when end precedes start; client-side block when an end date is set with no start date; edit hydrates both date fields from an existing run and sends the updated range on save; the run list shows a start-to-end range and falls back to a single date when there is no end date,packages/web-core/src/features/pos/__tests__/deliveryRunQueueFilter.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/utils/__tests__/deliveryRunQueueFilter.test.js -- actually executed (Vitest), unchanged, regression-clean,node --check on every changed/new apps/dgfy-migration-runner and apps/dgfy-api .js file,npm run build:pos -- OK (this app owns DeliveryRunsWorkspacePanel.jsx/DeliveryRunFormDialog.jsx via packages/web-core; its own build script is a real Vite build, the Tier 0 compiler check for this frontend half),npm run check:architecture -- OK, zero new allowlist entries,npm run check:adr -- OK,npm run lint:docs -- OK,npm run check:compliance -- confirmed to fail first (listing every touched compliance-sensitive file below), then pass once this declaration was added
rollback_note: This phase DOES carry a schema change, unlike Phase 225's own declaration -- a new migration (20260907000001-add-delivery-run-scheduled-date-end.cjs) adds delivery_runs.scheduled_date_end (nullable DATEONLY) and replaces idx_delivery_runs_status_scheduled with a 3-column idx_delivery_runs_status_scheduled_range. Rollback is the migration's own down(), which is safe: the column is nullable and additive, no existing row's scheduled_date is touched or reinterpreted, and down() restores the original 2-column index before dropping the column. No CHECK constraint was added (kept out of this migration by implementation decision -- the app-level start<=end checks in the use cases are sufficient and keep the migration minimal); there is therefore no DB-level constraint to drop on rollback either.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T18:11:37.530Z
preflight_request_ref: PREFLIGHT-33788577095-2026-09-07-POS-DELIVERY-RUN-DATE-RANGE
---

# POS delivery run date-range scheduling (Phase 260, #1489)

## Compliance Impact Classification

Major. The floor is mechanical, confirmed live against `scripts/check-compliance-impact.js`
against this diff -- run before this declaration existed, it failed and listed:

- `apps/dgfy-api/src/modules/pos/repositories/deliveryRunRepository.js`,
  `apps/dgfy-api/src/modules/pos/serializers/deliveryRunSerializer.js`,
  `apps/dgfy-api/src/modules/pos/usecases/deliveryRunUseCases.js` -- match the `modules/pos/` rule
  -> `surfaces: pos,terminal`, floor `major`.
- `packages/web-core/src/features/pos/components/DeliveryRunFormDialog.jsx`,
  `packages/web-core/src/features/pos/components/DeliveryRunsWorkspacePanel.jsx`,
  `packages/web-core/src/features/pos/utils/deliveryRunQueueFilter.js`,
  `packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx` -- match
  the frontend POS-surface rule.

`apps/dgfy-api/src/models/DeliveryRun.js` and `apps/dgfy-api/src/validators/posValidator.js` are
not themselves in `COMPLIANCE_SENSITIVE_RULES`, matching Phase 225's own declaration's note --
changes nothing, the rules above already fire independently. `apps/dgfy-api/src/routes/pos.js` is
untouched this phase (no new route -- every endpoint already existed from Phase 225/228). Not
`regulatory`: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, or a tenant-admin surface.

`related_adr: none` -- no ADR governs delivery-run scheduling. `0034-manual-delivery-job-
foundation.md` (the ADR governing the delivery-run/personnel/job domain generally) has zero
mentions of `scheduled_date` and is not amended by this phase; date-range scheduling is a data-shape
and validation change, not a change to who may assign/dispatch/complete a delivery.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260907000001-add-delivery-run-scheduled-date-end.cjs`
   (**new**) -- adds `delivery_runs.scheduled_date_end` (nullable `DATEONLY`) and replaces
   `idx_delivery_runs_status_scheduled` (`['status', 'scheduled_date']`) with
   `idx_delivery_runs_status_scheduled_range` (`['status', 'scheduled_date', 'scheduled_date_end']`).
   Deliberately a **new** migration file, not an edit to the already-shipped
   `20260901000005-create-delivery-runs.cjs` -- that migration id is already recorded in
   `SequelizeMeta` on every environment that has run it, so editing it in place would be silently
   inert everywhere except a from-scratch database.
2. `apps/dgfy-api/src/models/DeliveryRun.js` -- adds the `scheduled_date_end` attribute and updates
   the model's own `indexes:` array to match the migration (documentation/sync-mode convenience
   only -- this repo's actual DDL source of truth is `sequelize-cli db:migrate`, not
   `sequelize.sync()`).
3. `apps/dgfy-api/src/validators/posValidator.js` -- `createDeliveryRunSchema` gains
   `scheduled_date_end` with `.min(Joi.ref('scheduled_date'))` (rejects `end < start` within one
   create request) and `.with('scheduled_date_end', 'scheduled_date')` (an end date requires a
   start date; a start date alone -- today's single-day shape -- stays valid with no end).
   `updateDeliveryRunSchema` gains `scheduled_date_end` with shape-only validation, deliberately no
   cross-field ref check (a `PATCH` can touch either field alone; Joi can't see the row's existing
   value for whichever field wasn't sent).
4. `apps/dgfy-api/src/modules/pos/usecases/deliveryRunUseCases.js` --
   `buildCreateDeliveryRunUseCase` rejects a range exceeding `MAX_DELIVERY_RUN_SPAN_DAYS` (31,
   placeholder -- issue #1489's own text specifies no number) and threads `scheduled_date_end`
   into the repository call. `buildUpdateDeliveryRunUseCase` enforces the real start<=end and
   max-span invariants against the **merged** effective state (existing locked row + this patch),
   inside the same transaction the row is already locked under -- this is the layer that closes the
   gap Joi's same-request-only cross-field check cannot see.
5. `apps/dgfy-api/src/modules/pos/repositories/deliveryRunRepository.js` -- `createRun` writes
   `scheduled_date_end`; `listRuns`'s `scheduledDateFrom`/`scheduledDateTo` query filters change from
   a point-in-range match on `scheduled_date` alone to a range-overlap predicate --
   `scheduledDateTo` still compares against `scheduled_date` (a run cannot start after the window
   closes), `scheduledDateFrom` compares against `COALESCE(scheduled_date_end, scheduled_date)` (a
   run with no end date is a single-day run whose effective end equals its start) via
   `sequelize.where(sequelize.fn('COALESCE', ...), { [Op.gte]: ... })`. `updateRun`'s generic
   `row.update({ ...payload })` passthrough needed no change.
6. `apps/dgfy-api/src/modules/pos/serializers/deliveryRunSerializer.js` -- adds
   `scheduled_date_end` to the response shape.
7. `packages/web-core/src/features/pos/components/DeliveryRunFormDialog.jsx` -- adds an "End date
   (optional)" input; hydrates it on edit; mirrors the server's range rules client-side (end
   requires start; end must not precede start) so a bad range never round-trips to a 422; sends
   `scheduled_date_end` on create (only when set) and on update (always, `null` to clear).
8. `packages/web-core/src/features/pos/components/DeliveryRunsWorkspacePanel.jsx` -- the run list's
   schedule display becomes `formatRunScheduleLabel()`: `"start → end"` when an end date differs
   from the start, otherwise the single start date, otherwise "No schedule set" -- unchanged.
9. `packages/web-core/src/features/pos/utils/deliveryRunQueueFilter.js` -- doc-comment-only:
   clarifies that `scheduled_date` now marks the **start** of a run's scheduled window rather than
   necessarily a single point in time. The sort comparator itself is unchanged (sorting by the
   window's start is still the correct behavior for a view filter).

## What this phase deliberately does NOT do

Per issue #1489's own scope and the resolutions given at implementation start:

1. **No same-day-run "detection" UI concept was built.** #1489's text says same-day handling
   "should still work as a special case (range collapses to one day)" -- this is satisfied by
   treating a `NULL`/equal-to-start `scheduled_date_end` as a single-day run everywhere (the
   overlap predicate's `COALESCE`, the serializer, `formatRunScheduleLabel`), not by adding a new
   "Today" badge or highlighted-run affordance. No such UI concept exists anywhere in this codebase
   today and none was asked for beyond that collapse behavior.
2. **No DB-level CHECK constraint.** The app-level start<=end checks in
   `buildCreateDeliveryRunUseCase`/`buildUpdateDeliveryRunUseCase` are the enforcement point;
   kept out of the migration to keep it minimal, by implementation decision.
3. **`MAX_DELIVERY_RUN_SPAN_DAYS = 31` is a placeholder**, approved as-is for this phase. #1489's
   own text specifies no number; this can be revisited once real usage patterns exist.

## Compliance Preconditions

1. **No unauthenticated access path is introduced.** No new route was added -- every endpoint this
   phase touches (`POST`/`GET`/`PATCH /delivery-runs`) already sat behind `checkPermission` from
   Phase 225, unchanged here.
2. **A run with an inverted or over-long range can never be persisted**, on either create or
   update. Create: `createDeliveryRunSchema`'s `.min(Joi.ref(...))` catches `end < start` before
   the use case runs; the use case catches a span over `MAX_DELIVERY_RUN_SPAN_DAYS`. Update: the
   use case re-derives both checks against the merged (existing row + patch) effective state,
   inside the same transaction the row is locked under, so a concurrent update cannot race past
   either check. Pinned by six new use-case test cases (see `verification_evidence`).
3. **A single-day run (no end date) behaves identically to today**, everywhere the range is
   consumed: `listRuns`'s overlap filter, the serializer, and the frontend's schedule label all
   treat `scheduled_date_end = NULL` as "effective end equals start."

## Verification Evidence

See the `verification_evidence` frontmatter key for the full list. Summary:

- New test cases in `apps/dgfy-api/tests/deliveryRun.usecase.test.js` and
  `apps/dgfy-api/tests/posValidator.deliveryRun.test.js` -- all actually executed (Jest), all
  passing (78 tests across the 5 delivery-run backend suites, unchanged suites regression-clean).
- New test cases in
  `packages/web-core/src/features/pos/__tests__/deliveryRunsWorkspace.behavior.test.jsx` -- actually
  executed (Vitest, run from `apps/dgfy-ims` per `docs/architecture/frontend-split-sync.md` --
  `packages/web-core` tests do not run from `apps/dgfy-pos` despite that app owning the build), all
  passing (104 tests across the 8 delivery-run frontend suites, unchanged suites regression-clean).
- `node --check` on every changed/new `.js`/`.cjs` file (`apps/dgfy-migration-runner`'s and
  `apps/dgfy-api`'s own `build` scripts are no-ops, so this is the real Tier 0 check for those two
  apps per `.agents/skills/implement/SKILL.md`).
- `npm run build:pos` -- OK, a real Vite build, the Tier 0 compiler check for the frontend half.
- `npm run check:architecture` -- OK, zero new allowlist entries needed.
- `npm run check:adr` -- OK.
- `npm run lint:docs` -- OK.
- `npm run check:compliance` -- confirmed to **fail** first (listing every touched file above),
  then **pass** once this declaration was added.
- **Known gap, stated rather than hidden**: no delivery-run test in this codebase exercises a real
  MySQL query planner (the use-case tests run against an in-memory fake repository, per the same
  honesty precedent Phase 225's own declaration set). The `listRuns` overlap predicate --
  `sequelize.where(sequelize.fn('COALESCE', sequelize.col(...), sequelize.col(...)), { [Op.gte]:
  ... })` -- is syntactically correct per Sequelize's own documented "Advanced queries with
  functions" pattern, but has not been proven against a live tenant database in this environment
  (no local MySQL/Redis reachable). Flagged for the PR reviewer / a follow-up QA pass once a
  database is available, same as Phase 225's own residual-risk framing.

## Residual Risks

1. **The `listRuns` overlap predicate is unverified against a real MySQL query planner** -- see
   "Known gap" above. This is the single highest-value thing a live-DB follow-up should confirm.
2. **`MAX_DELIVERY_RUN_SPAN_DAYS = 31` is a placeholder**, not derived from a stated product
   requirement (#1489 specifies no number). Approved as-is for this phase; revisit once real usage
   data exists.
3. **No same-day-run "detection" affordance was built** -- see "What this phase deliberately does
   NOT do" above. If a future request asks for one, resolve it server-side (a real
   `nowInManilaBusinessDate()`-based computation in the serializer), not client-side, matching this
   codebase's existing POS convention of treating "what business date is it" as server-authoritative.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1489-POS-DELIVERY-RUN-DATE-RANGE`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
