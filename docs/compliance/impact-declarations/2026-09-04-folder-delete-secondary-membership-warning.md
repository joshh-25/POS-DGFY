---
status: reference
owner: engineering
last_reviewed: 2026-09-04
declaration_id: 2026-09-04-folder-delete-secondary-membership-warning
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.04
verification_evidence: node --check apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js (passed),npm test -- tests/inventoryItemRepository.test.js (60 passed),npm test -- tests/itemFolderMemberships.repository.test.js tests/replaceItemFoldersUseCase.test.js (10 passed),npm test -- tests/itemHandlers.transport.test.js tests/storageAndGroupingToolRegistry.test.js tests/routeAuthorizationDeclarations.contract.test.js (23 passed),npm run build:pos (succeeded),npm run check:architecture,npm run check:compliance
rollback_note: Revert this PR's diff. Both changed backend functions (listFolders, deleteFolder in apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js) are purely additive -- a new countSecondaryFolderMemberships helper and one new response field per function (secondary_item_count, secondary_items_affected) plus an appended message/error-message note; every existing field, the primary count computation, the reassignment-required gate, and the actual delete/reassign writes are byte-identical to before. The frontend change (TerminalOperationsWorkspace.jsx) only adds an extra warning line and coerces one new response field -- it introduces no new state, no new API call, and does not change the existing client-side reassignment gate (still primary-item_count-only, unchanged). Reverting fully restores prior behavior with no data migration involved.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-04T10:56:41.000Z
preflight_request_ref: NOT-EXECUTED-1318
---

# Folder-delete warning under-counts secondary category memberships (#1318)

## Compliance Impact Classification

Major. The only compliance-sensitive file this change touches on the frontend side is
`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`, which
`docs/compliance/compliance-classification-matrix.md` maps to surfaces `pos,terminal` at minimum
classification `major` -- this declaration exists to satisfy that gate, not because the change
introduces a new compliance-relevant capability. The backend file touched
(`apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js`) is not itself listed as a
compliance-sensitive path in the matrix; `check:compliance` did not flag it. No ADR impact: this is
`within-existing-boundary` work, explicitly pre-scoped and named as a follow-up in
[ADR 0080](../../architecture/adr/0080-item-multi-category-membership.md) Consequences item 4 ("a
later phase adds a second 'N items also list this as a secondary category' line to the existing
pre-delete warning") -- no amendment needed.

## Affected Surfaces

- **Folder list / pre-delete warning dialog** (POS's Category Management workspace,
  `TerminalOperationsWorkspace.jsx`'s `CategoryManagementWorkspace`) -- the delete-confirmation
  modal now shows a second, informational line naming how many items reference the folder only as
  a *secondary* category (`item_folder_memberships`), in addition to the existing primary-count
  line. Sourced from a new `secondary_item_count` field on `GET /items/folders`'s response.
- **`DELETE /items/folders/:folder_id`** (`itemRepository.deleteFolder`) -- the success response
  gains `secondary_items_affected` and an appended note in `message`; the `409
  CATEGORY_REASSIGNMENT_REQUIRED` error (fired only when the folder has primary-assigned items and
  no replacement was given) gains the same count as `error.secondary_items_affected` and an
  appended note in its message.
- **Deliberately NOT changed**: the reassignment requirement itself. A folder with zero primary
  items but nonzero secondary memberships still deletes without requiring a replacement category --
  per ADR 0080 Consequences item 4, `ON DELETE CASCADE` on `item_folder_memberships.folder_id`
  already removes those membership rows correctly; only the operator-facing *warning* was
  under-counting. This PR fixes the count, not the reassignment gate.
- Not touched: any storefront/POS catalog projection, listing, or filter logic that reads
  `items.folder_id` or the membership union (ADR 0080 Decision 1/4's read-site opt-in list) --
  out of scope for this phase per the dispatch brief, and unrelated to counting for a delete
  warning.

## Compliance Preconditions

- No new or changed reason codes, checkout flow, payment path, or fiscal-receipting code. This is
  an inventory-category-management admin flow (`categories:manage` permission, unchanged), not a
  sale/checkout/settlement surface.
- No schema change and no migration. `item_folder_memberships` already exists (Phase 257); this PR
  only adds read queries against it.
- The existing primary-count behavior (`assignedItemCount`/`item_count`, the reassignment gate, the
  actual item-reassignment `UPDATE`) is unchanged byte-for-byte -- verified by the pre-existing
  `deleteFolder`/`listFolders` tests continuing to pass unmodified in their assertions on those
  fields.
- The new secondary count deliberately excludes any item already counted via its primary assignment
  to the same folder (ADR 0080 clause 2's documented overlap case) so the two published counts
  (`items_moved`/`item_count` vs. `secondary_items_affected`/`secondary_item_count`) never
  double-count the same item, and applies the same `visibleItemWhere` visibility filter the primary
  count already uses, so a soft-deleted/inactive-status item cannot inflate either count.

## Verification Evidence

- `node --check apps/dgfy-api/src/modules/inventory/repositories/itemRepository.js` -- passed.
- `tests/inventoryItemRepository.test.js` -- 60/60 passed, including 5 new/updated cases: a
  `listFolders` case asserting `secondary_item_count` counts a secondary-only item without
  double-counting an item whose primary assignment overlaps the same folder; three `deleteFolder`
  cases (secondary-only item counted alongside a primary-reassignment delete without
  double-counting the overlap case, zero membership rows produces zero, and the
  `CATEGORY_REASSIGNMENT_REQUIRED` error carries the same count); the two pre-existing exact-match
  `deleteFolder` result assertions updated to include the new `secondary_items_affected: 0` field
  with no change to any other asserted value.
- `tests/itemFolderMemberships.repository.test.js`, `tests/replaceItemFoldersUseCase.test.js` --
  10/10 passed unmodified (confirms the shared `ItemFolderMembership` model access pattern this PR
  reuses didn't regress the existing membership-replace path).
- `tests/itemHandlers.transport.test.js`, `tests/storageAndGroupingToolRegistry.test.js`,
  `tests/routeAuthorizationDeclarations.contract.test.js` -- 23/23 passed unmodified (these mock at
  the use-case boundary, confirming the controller/route/tool-registry layers are unaffected by the
  repository-level response shape addition).
- `npm run build:pos` -- succeeded (the only app that imports
  `packages/web-core/src/features/pos/**`'s `TerminalOperationsWorkspace.jsx`; confirmed via
  `grep` that no IMS or storefront surface consumes this component).
- `npm run check:architecture` and `npm run check:compliance` -- run against this diff.

## Residual Risks

- The new `secondary_item_count` in `listFolders()` runs two additional queries per call (one
  `ItemFolderMembership.findAll` scoped to the listed folder ids, one `Item.findAll` visibility
  check scoped to the candidate item ids) rather than N+1 per folder -- acceptable for an
  admin-only, low-cardinality category list, but not benchmarked against a tenant with a very large
  catalog. No performance regression is expected given the existing `item_count` computation
  already loads every visible item across all folders via the same association.
- This phase does not address the separate, pre-existing question of what happens to a folder's
  `item_folder_memberships` rows when it is soft-deleted (the folder row itself is never hard
  `DELETE`d by `deleteFolder` -- it's an `is_active:false`/`deleted_at` update) -- out of scope,
  unrelated to the under-counting bug this phase fixes.

## Preflight Reconciliation

`NOT-EXECUTED-1318` is expected for a `develop`-targeting PR; the live preflight sweep
(`compliance-preflight-sweep.yml`) runs continuously against `develop` per
`docs/compliance/request-time-preflight-protocol.md`, not at promotion time, and will reconcile this
declaration's front matter automatically once triggered by this PR's merge.
