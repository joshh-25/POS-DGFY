---
status: reference
owner: engineering
last_reviewed: 2026-09-04
related_adr: docs/architecture/adr/0080-item-multi-category-membership.md (read for context, no
  amendment made -- this phase adds a second UI consumer of the same write API Phase 257/268
  already built and declared; it does not change what data is written, how the disjointness guard
  is enforced, or any Decision 1 [binding] money-adjacent resolver -- see "Why no ADR amendment"
  below)
declaration_id: 2026-09-04-pos-additional-categories-edit
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: packages/web-core/src/features/pos/__tests__/additionalCategoriesEdit.behavior.test.jsx -- actually executed (Vitest, run from apps/dgfy-ims per docs/architecture/frontend-split-sync.md -- packages/web-core tests do not run from apps/dgfy-pos despite that app owning the build), 3 passing (new file: renders/excludes-primary/saves for an authorized manager; read-only-not-hidden when canManageCategories is false; source-contract pin on the persisted-item-id gate),full packages/web-core/src/features/pos/__tests__/ suite -- actually executed (Vitest, same runner), 147 files / 909 tests passing, zero regressions,npm run build:pos -- actually executed (Vite), succeeded, no new TypeScript/JSX errors (dgfy-api and dgfy-migration-runner untouched by this phase, so their node --check Tier 0 equivalent does not apply here),npm run check:architecture -- OK, zero new allowlist entries,npm run check:compliance -- PASS with this declaration present
rollback_note: No schema change, no migration, and no backend route/controller/use-case touched by this phase -- the GET/PUT /items/:item_id/folders endpoints, their requireTenantAdmin gate, the max-10 cap, and the primary/secondary disjointness guard all already existed from Phase 257 (PR #1503) and Phase 268 (PR #1515), completely unchanged here. This phase only adds a second frontend consumer of that existing write API inside packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx (new state, a fetch/save effect pair, and a JSX section), plus one new frontend test file. Rollback is a plain revert of this PR's diff -- no data was written or migrated by this phase itself, no existing response field's meaning changed, and reverting removes only client-side UI/state with no server-side cleanup required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1318-POS-ADDITIONAL-CATEGORIES-EDIT
---

# POS's own "Additional Categories" item-edit section (Wave C/C5, #1318)

## Compliance Impact Classification

Major. Confirmed live against `scripts/check-compliance-impact.js` before this declaration existed
-- it failed and listed the one file this phase actually changed:

- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` -- matches the
  frontend `features/pos/` rule -> `surfaces: pos,terminal`, floor `major`.

The new test file (`packages/web-core/src/features/pos/__tests__/additionalCategoriesEdit.behavior.test.jsx`)
also matched the same `features/pos/` rule; declared here too for completeness, though a test-only
addition carries no independent runtime risk.

Not `regulatory`: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, or a tenant-admin configuration surface -- this is a merchant catalog
*authoring* UI addition, reusing an already-existing, already-permission-gated write endpoint, not
a change to who may authenticate, authorize, or configure anything.

## Why no ADR 0080 amendment

Per this phase's own dispatch brief, and confirmed by reading the ADR: this is an authoring/write
surface, not a money-adjacent *reader* of `folder_id`/`item_folder_memberships`. ADR 0080's
Decision 1 `[binding]` clause governs resolvers that read category membership to compute money
(affiliate commission, voucher scope, F&B modifier inheritance) -- this phase touches none of them.
The write path itself (`listItemFolders`/`replaceItemFolders`, the max-10 cap, the disjointness
guard, the `requireTenantAdmin`-equivalent permission gate) was already built, tested, and declared
by Phase 257 (PR #1503) and Phase 268 (PR #1515); this phase adds a second frontend caller of that
same, unchanged API. Phase 286's 2026-09-04 Amendment (the precedent for what actually warrants an
ADR 0080 amendment) was needed because it changed a *read-time query's matching behavior* against
existing data; this phase changes no query and no matching behavior anywhere -- it is a pure
authoring-UI addition. No amendment is made.

## Affected Surfaces

1. `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` -- the item edit
   modal (`activeEditItem`-backed, `createPortal`) gains a new "Additional Categories" section in
   its existing Column 3 (Category & QR), immediately after the primary-category field:
   - New state: `secondaryFolderIds`, `secondaryFoldersLoading`, `secondaryFoldersSaving`.
   - New derived value `editItemIdForFolders` -- the open edit modal's real, persisted `item_id`, or
     `0`. This modal only ever opens for an item already present in `sortedItems` (found via
     `activeEditItem`), so in practice this is always `> 0` while the section could render at all --
     unlike `ItemFormModal.jsx`'s `itemIdForFolders`, which genuinely needs to distinguish
     create-vs-edit because that modal is shared between both. Kept as an explicit, defensive gate
     anyway, matching that file's own `Boolean(itemIdForFolders)` idiom, so the section can never
     render (or call `listItemFolders`/`replaceItemFolders`) against an unsaved/invalid item id.
   - New derived value `availableSecondaryFolders` -- every entry in the already-loaded `posFolders`
     list except the item's own primary `folder_id` (selecting it would be redundant, and the API
     silently drops it anyway per ADR 0080 clause 2's disjointness guard). Sourced from `posFolders`
     (already fetched via `getFolders()` on mount for the existing category filter/selector), not a
     new fetch.
   - New effect: fetches `listItemFolders(editItemIdForFolders)` whenever the open edit item
     changes, populating `secondaryFolderIds` from the response's `memberships`.
   - New `toggleSecondaryFolder`/`saveSecondaryFolders` handlers -- client-side max-10 cap on
     selection (mirrors, does not replace, the server's own cap), and a self-contained
     `replaceItemFolders(editItemIdForFolders, ...)` call on an explicit "Save Additional
     Categories" button, independent of the main "Save Item" action -- same self-contained
     load/save-cycle pattern as `ItemFormModal.jsx`'s Phase 268 section.
   - Gated on the existing `canManageCategories` prop (`hasPermission('categories:manage')`,
     confirmed identical to `ItemFormModal.jsx`'s `canManageFolders` gate) -- no new permission
     check invented. When `false`, the section stays **visible but read-only** (checkboxes disabled
     via a `<fieldset disabled>`, no Save button, a status line explaining why), matching this same
     file's own convention for the primary-category field one block above it (a disabled `<select>`
     stays visible rather than the whole field disappearing).
   - `apps/dgfy-api`'s `GET`/`PUT /items/:item_id/folders` routes, their `requireTenantAdmin`-class
     permission gate, the max-10 cap, and the primary/secondary disjointness guard are all
     **unchanged** -- this phase adds a caller, not a capability.

## What this phase deliberately does NOT do

1. **No new route, no new permission check, no backend change of any kind.** `GET`/`PUT
   /items/:item_id/folders` already existed (Phase 257) and already sit behind their existing
   permission gate; this phase only adds a second, POS-side frontend consumer.
2. **No change to `ItemFormModal.jsx` or IMS's own Additional Categories section.** That file is
   untouched by this phase; the two editors now exist side by side with independent state, matching
   Wave C/C5's own scope (explicitly "independent of C2, running in a separate parallel worktree").
3. **No read-surface widening.** POS's catalog listing, folder-chip filtering, and reporting are
   untouched -- that was Phase 286's (already-shipped, already-declared) scope, not this phase's.
   This phase is purely a write-side authoring addition.
4. **No ADR 0080 Decision 1 `[binding]` resolver is touched.** Confirmed by grep: none of
   `affiliateCommissionAccrual.js`, `voucherFolderScope.js`, `voucherRepository.js`,
   `fnbRepository.js`, or `effectiveFnbModifierGroups.js` appear in this PR's diff.
5. **No new client-side validation logic duplicating server enforcement in a way that could drift.**
   The client-side 10-item cap (`toggleSecondaryFolder`) is a UX convenience only -- the server's
   own cap in `replaceItemFolderMemberships` (Phase 257/268, unchanged) remains the actual
   enforcement point; a client bypass would still be rejected server-side.

## Compliance Preconditions

1. **No unauthenticated or newly-authorized access path is introduced.** Zero new routes, zero
   permission-check changes, on the existing `/items/:item_id/folders` endpoints.
2. **The section is gated on the same permission (`categories:manage`) already enforced server-side
   on the endpoints it calls** -- `canManageCategories`, confirmed identical to
   `ItemFormModal.jsx`'s `canManageFolders`. A client-side bypass of the UI gate (e.g. via dev
   tools) would still be rejected by the server's own permission check on
   `PUT /items/:item_id/folders`, unchanged by this phase.
3. **The section can never render against an unsaved/invalid item.** Pinned by the
   `editItemIdForFolders > 0` gate and by this phase's own source-contract test case.
4. **The item's own primary category is never offered as a secondary option**, matching
   `ItemFormModal.jsx`'s existing behavior and ADR 0080 clause 2's disjointness guard (the server
   would silently drop it anyway; the client-side exclusion is a UX improvement, not the actual
   enforcement boundary). Pinned by this phase's own test (`queryByText('Main Course')` is null
   inside the section).

## Verification Evidence

See the `verification_evidence` front matter key for the full list. Summary:

- `packages/web-core/src/features/pos/__tests__/additionalCategoriesEdit.behavior.test.jsx` --
  actually executed (Vitest, run from `apps/dgfy-ims` per
  `docs/architecture/frontend-split-sync.md`), 3 passing: (1) the section renders, excludes the
  item's own primary category, and lets an authorized manager toggle and save a selection; (2) the
  section stays visible but read-only (disabled fieldset, no Save button, explanatory status text)
  when `canManageCategories` is `false`; (3) a source-contract pin confirming the section's render
  gate, fetch guard, and save guard all key off a real persisted item id.
- Full `packages/web-core/src/features/pos/__tests__/` suite -- actually executed (Vitest), 147
  files / 909 tests passing, zero regressions from this change.
- `npm run build:pos` -- actually executed (Vite), succeeded with no new errors (pre-existing
  large-chunk-size warning only, unrelated to this diff).
- `npm run check:architecture` -- OK, zero new allowlist entries.
- `npm run check:compliance` -- PASS with this declaration present.

## Residual Risks

1. **No dedicated test exercises the "hidden for a genuinely new/unsaved item" path end to end**,
   because this edit modal is architecturally never reachable for an unsaved item today (it only
   ever opens for an item already present in the loaded catalog list; item creation is a fully
   separate `createForm`/`showCreateModal` flow in this same file). The gate is instead pinned by a
   source-contract test asserting the persisted-item-id check exists in the render/fetch/save
   guards, rather than a full render-time reproduction of an unreachable state. Flagged as a known,
   deliberate test-design tradeoff, not hidden.
2. **The client-side 10-item cap is UX-only**, as noted above -- unverified here whether the server
   cap in `replaceItemFolderMemberships` still rejects an over-cap request correctly, since that
   logic is untouched and was already covered by Phase 257/268's own backend test suite (not
   re-run by this frontend-only phase).

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1318-POS-ADDITIONAL-CATEGORIES-EDIT`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
