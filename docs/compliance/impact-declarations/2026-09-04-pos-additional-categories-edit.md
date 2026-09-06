---
status: reference
owner: engineering
last_reviewed: 2026-09-04
related_adr: docs/architecture/adr/0080-item-multi-category-membership.md (read for context, no
  amendment made -- this phase adds a second UI consumer of the same write API Phase 257/268
  already built and declared; it does not change what data is written, how the disjointness guard
  is enforced, or any Decision 1 [binding] money-adjacent resolver -- see "Why no ADR amendment"
  below. Fix round 1, PR #1581 review RF-1, closes a client-side gap that could otherwise have let
  an operator produce a state violating Decision 2's disjointness invariant -- see "Fix round 1"
  below; the invariant itself, and its server-side enforcement, are unchanged)
declaration_id: 2026-09-04-pos-additional-categories-edit
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: packages/web-core/src/features/pos/__tests__/additionalCategoriesEdit.behavior.test.jsx -- actually executed (Vitest, run from apps/dgfy-ims per docs/architecture/frontend-split-sync.md -- packages/web-core tests do not run from apps/dgfy-pos despite that app owning the build), 11 passing (2 original runtime cases + 2 new RF-1 pending-primary cases + 2 new RF-2 max-10-boundary/pre-existing-membership cases + 3 new RF-3 permission-failure-vs-empty-state cases + 2 source-contract cases),full packages/web-core/src/features/pos/__tests__/ suite -- actually executed (Vitest, same runner), 147 files / 917 tests passing, zero regressions,npm run build:pos -- actually executed (Vite), succeeded, no new TypeScript/JSX errors (dgfy-api and dgfy-migration-runner untouched by this phase, so their node --check Tier 0 equivalent does not apply here),npm run check:architecture -- OK, zero new allowlist entries,npm run check:compliance -- PASS with this declaration present
rollback_note: No schema change, no migration, and no backend route/controller/use-case touched by this phase -- the GET/PUT /items/:item_id/folders endpoints, their requireTenantAdmin gate, the max-10 cap, and the primary/secondary disjointness guard all already existed from Phase 257 (PR #1503) and Phase 268 (PR #1515), completely unchanged here. This phase only adds a second frontend consumer of that existing write API inside packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx (new state, a fetch/save effect pair, and a JSX section), plus one new frontend test file. Fix round 1 (RF-1/RF-2/RF-3) adds more client-side state and a new frontend-only render branch (secondaryFoldersUnavailable); it introduces no new endpoint, no schema change, and no new write path. Rollback is a plain revert of this PR's diff -- no data was written or migrated by this phase itself, no existing response field's meaning changed, and reverting removes only client-side UI/state with no server-side cleanup required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T16:07:17.508Z
preflight_request_ref: PREFLIGHT-33893050690-2026-09-04-POS-ADDITIONAL-CATEGORIES-EDIT
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

## Fix round 1 (PR #1581 review, Codex)

Three findings, all addressed in this round -- see the PR's own review comment
(`#1581#issuecomment-5541348217`) for the reviewer's original wording.

**RF-1 (blocker) -- a staged-but-unsaved primary category change could produce a disjointness
violation.** The primary category field in this same modal (`EditableFoodCategoryCombobox` /
the read-only `<select>`) lets an operator stage a *different* primary category in `editForm`
before "Save Item" is ever clicked. "Save Additional Categories" is a separate, independent write
that could land while that staged change was still unsaved -- the server's disjointness guard only
ever sees the DB's *current* primary at write time, so it could not catch a pending primary change
that would collide with an already-saved secondary membership. Reproduction: item's persisted
primary is folder 10; operator stages primary = folder 20 (not yet saved); folder 20 was still
offered and selectable as a secondary category, because only the *persisted* `folder_id` (10) was
excluded; saving Additional Categories first (accepted -- DB primary is still 10), then Save Item
(primary becomes 20) left the item with folder 20 as both primary and secondary at once, violating
ADR 0080 Decision 2.

Fixed by adding `pendingPrimaryFolderId` (resolved the same way `handleSave`'s own `foodCategory`
lookup resolves it, so the two can never disagree) and `excludedPrimaryFolderIds` (the union of the
persisted and pending primary ids). `availableSecondaryFolders` now excludes both. A new effect
strips any already-checked id out of `secondaryFolderIds` the moment it becomes excluded (covers
the reverse order: check a secondary first, then stage a primary change to that same folder).
`saveSecondaryFolders` also re-filters its outgoing payload against `excludedPrimaryFolderIds`
immediately before the API call, as a third, independent layer -- so the pending primary can never
reach the API as a secondary selection regardless of which state-update ordering produced it.
Pinned by two new behavior tests asserting the exact reproduction sequence (stage primary -> the
prior checked selection is dropped -> save -> the resulting payload never contains the new primary
id) and the never-offered-in-the-first-place case.

**RF-2 (should-fix) -- the original "3-case behavior test" claim was inaccurate, and lacked
boundary/pre-existing-membership coverage.** The original test file had 2 runtime UI cases and 1
source-string contract case, not 3 runtime cases as characterized in the initial PR body; the
source-contract case is now named as such in its own `describe` block rather than counted as a
third behavior case. Two new runtime tests were added: one with an 11-folder fixture asserting the
11th unchecked option renders `disabled` once 10 are already selected and cannot be sent even if
clicked; one asserting pre-existing memberships (a non-empty `listItemFolders` response) render
checked on load and are correctly preserved, removed, and added to on save.

**RF-3 (should-fix) -- a 403 from the memberships read was indistinguishable from a genuinely
empty membership list.** `GET /items/:item_id/folders` is gated by `requireTenantAdmin`
(`categories:manage`) at the route level (`apps/dgfy-api/src/routes/items.js:217`, unchanged by
this fix). For an operator whose client-side `canManageCategories` flag is stale or has drifted
from the server's actual permission state, the GET would 403, the existing `catch` silently set
`secondaryFolderIds` to `[]`, and the UI showed the same "0/10 selected" (and, when
`canManageCategories` was locally `true`, the same editable-but-actually-empty grid) a real empty
result would show -- misleading, not merely a missing feature.

Fixed with a new `secondaryFoldersUnavailable` state, set `true` only when the fetch's caught error
carries `response.status === 403` (distinguishing a permission failure from any other fetch
failure, which still degrades to the pre-existing empty-list behavior -- a named, not silently
expanded, scope boundary). When `true`, the section renders a single honest status line
("Additional categories are unavailable right now -- you don't have permission to view them.")
instead of the checkbox grid, the Save button/read-only line, and the `X/10 selected` counter. This
is a **frontend-only** fix -- no backend route, permission, or response shape changed; the option of
loosening `requireTenantAdmin` to a broader "review" permission (the reviewer's alternative) was not
taken, since it would need its own compliance/ADR consideration for a real permission-model change,
out of proportion for a fix round scoped to the frontend gap. Pinned by three new tests: an
authorized-read case (asserts the real memberships and an honest count, and that no "unavailable"
text appears), an unauthorized-read case (403, with `canManageCategories` deliberately still `true`
on the client -- proving the UI trusts the actual response over its own permission flag), and a
non-403-failure case (confirms a plain network error still degrades to the prior empty-list
behavior, not a false "unavailable" claim it can't actually back up).

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
  `docs/architecture/frontend-split-sync.md`), **11 passing**: the original 2 runtime cases
  (renders/excludes-primary/saves for an authorized manager; visible-but-read-only when
  `canManageCategories` is `false`); 2 new RF-1 cases (the exact staged-primary reproduction
  sequence; the staged primary is never offered in the first place); 2 new RF-2 cases (the 11th
  option disabled once 10 are selected and cannot be sent; pre-existing memberships render checked
  and are preserved/removed/added correctly on save); 3 new RF-3 cases (authorized read shows the
  real memberships/count; a 403 shows the honest "unavailable" status even when the client's own
  `canManageCategories` is `true`; a non-403 failure still degrades to the prior empty-list
  behavior); and 2 source-contract cases (the persisted-item-id gate; the pending-primary
  resolution mirrors `handleSave`'s own).
- Full `packages/web-core/src/features/pos/__tests__/` suite -- actually executed (Vitest), 147
  files / **917** tests passing, zero regressions from this change (909 before this fix round + 8
  new cases).
- `npm run build:pos` -- actually executed (Vite), succeeded with no new errors (pre-existing
  large-chunk-size warning only, unrelated to this diff).
- `npm run check:architecture` -- OK, zero new allowlist entries.
- `npm run check:compliance` -- PASS with this declaration (updated for the fix round) present.

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
3. **RF-3's `secondaryFoldersUnavailable` state is scoped to exactly one failure signature (HTTP
   403 on the memberships GET).** A different failure (500, timeout, network error, a malformed
   response) still degrades to the pre-existing "empty list" render, not a distinct error state --
   named explicitly in RF-3's own description above and pinned by a dedicated test, not silently
   left uncovered. Widening this to a general request-failure state was judged out of proportion
   for this fix round, whose scope was specifically the permission-failure/empty-state conflation
   the review raised.
4. **RF-1's fix does not address `ItemFormModal.jsx` (IMS).** That modal has an analogous
   primary-category field and a similarly independent Additional Categories save action; whether it
   has the same staged-primary gap was not investigated as part of this round -- out of scope (this
   PR touches POS only, per Wave C/C5's own boundary against C2). Flagged here as a candidate for a
   follow-up issue, not fixed silently by omission.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1318-POS-ADDITIONAL-CATEGORIES-EDIT`. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
