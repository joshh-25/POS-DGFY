---
status: reference
owner: engineering
last_reviewed: 2026-09-06
related_adr: docs/architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md
  (cited for context, no amendment made -- this PR adds a client-side poll that runs *before* the
  POS item-create flow's first catalog refetch, as a bounded-timeout complement to the existing
  `pos.catalog.changed` SSE self-heal this ADR already governs; it does not change what a POS
  client does on receipt of that event, so no `## Amendments` block is needed per ADR 0039's tiers)
declaration_id: 2026-09-06-pos-create-item-image-upload-race
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.06
verification_evidence: see "## Verification Evidence" section below (Tier 0 build + contract tests
  + governance scripts -- no schema change, no new endpoint, no new permission path, no new
  dependency)
rollback_note: Plain revert removes the new poll-before-refetch step and the second
  useItemImageGenerationPoll instantiation; the create-item flow returns to today's behavior
  (queue-and-continue, image appears only after a manual refresh or a pos.catalog.changed SSE event
  happening to land). No schema change, no migration, no new endpoint, no new permission path --
  the async-status endpoint this PR newly calls from the client already existed and was already
  reachable under the same permission gate.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-06T13:58:44.688Z
preflight_request_ref: PREFLIGHT-34037535202-2026-09-06-POS-CREATE-ITEM-IMAGE-UPLOAD-RACE
---

# POS create-item image upload race (frozen-candidate 2026-09-06-01, repair r5)

## Compliance Impact Classification

Major. Confirmed against `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` before
finalizing this declaration -- the only rule this PR's changed files trip is:

- `^packages/web-core/src/features/pos/` (`TerminalOperationsWorkspace.jsx`, and the new contract
  test `__tests__/posCreateItemImageUploadPoll.contract.test.js`, since it lives under the same
  path prefix) -> surfaces `pos,terminal`, floor `major`.

No `apps/dgfy-api/` file is touched -- the backend async-status endpoint
(`GET /items/:item_id/storefront-image/async-status`) this PR newly calls from the client already
existed (added alongside the async upload queue endpoints it now pairs with) and was already
reachable under the existing `EDIT_ITEMS` permission gate; nothing server-side changed.

Not `regulatory`: nothing here touches `modules/compliance/`, `routes/compliance.js`,
`compliancePolicy.js`, authentication, authorization, or a tenant-admin configuration surface. This
is a client-side timing fix -- waiting for an already-queued background job's already-existing
status endpoint to reach a terminal state before the next catalog refetch -- not a new capability,
write path, or data-visibility change.

## Affected Surfaces

1. **`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`**:
   - Imports `getStorefrontCatalogImageUploadStatus` (already defined in
     `services/storefrontCatalogService.js`, previously dead code -- never called from any
     frontend call site).
   - Adds a second instantiation of the existing, already-parameterized
     `useItemImageGenerationPoll(readStatus)` hook, pointed at that reader instead of the
     AI-generation-status one the hook was originally built for (`generatingEditImage`'s
     `handleGenerateEditImage` flow) -- reused directly, no second bespoke poller written.
   - `runPostCreateStages`'s image-upload stage now awaits that poll (2s interval) immediately
     after `queueStorefrontCatalogImage`/`queueStorefrontCatalogImages` accepts the upload, before
     this function returns control to `handleCreateItem` -> `finalizeCreatedItem`'s
     `await Promise.all([loadItems(), loadPosFolders()])` refetch. A `failed` or `timeout` poll
     outcome surfaces a `toast.warning` and otherwise proceeds -- it does not throw, does not add
     to `failedStages`, and does not block the rest of item creation; the existing
     `pos.catalog.changed` SSE self-heal remains an unconditional backstop regardless of how this
     poll resolves. **Updated (backport #1659, RF-2 on PR #1656's review):** this poll now passes
     `useItemImageGenerationPoll` a `timeoutMs` of `CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS` = 15s,
     not the hook's own 90s `ITEM_IMAGE_POLL_TIMEOUT_MS` default -- the create-item modal disables
     its own close button for the poll's full duration (see Residual Risk 1), so reusing the
     AI-generation path's full 90s ceiling here meant a genuinely stuck background job could lock
     the operator out of the modal for that long. `handleGenerateEditImage`'s own
     `useItemImageGenerationPoll()` instantiation (edit-modal path) is unchanged and keeps the 90s
     default -- only the create-item call site was tightened.
2. **`packages/web-core/src/features/pos/__tests__/posCreateItemImageUploadPoll.contract.test.js`**
   (new) -- source-text contract test asserting the import, the hook reuse, the queue-then-poll
   ordering, the queue-failure gate (no poll when the queue POST itself failed), and the
   soft-warning-not-hard-failure behavior on `failed`/`timeout`.

## Compliance Preconditions

1. **No new auth/permission path.** The async-status endpoint this PR wires up client-side already
   existed and is already gated by the same `checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS)`
   middleware as the queue endpoints the create-item flow already calls
   (`apps/dgfy-api/src/routes/items.js`). No backend file changed in this PR.
2. **No schema change, no migration, no new endpoint.** `getCatalogImageUploadStatus`
   (`apps/dgfy-api/src/workers/catalogImageUploadStatusStore.js`) and the worker that writes to it
   (`apps/dgfy-api/src/workers/catalogImageUploadWorker.js`) are both pre-existing and unmodified;
   this PR only adds a client-side caller for an endpoint that already returned this data.
3. **The `pos.catalog.changed` SSE contract (ADR 0055) is unchanged.** This PR does not touch
   `posCatalogRefresh.js` or the event's own emit/subscribe wiring -- it only adds a bounded,
   best-effort wait *before* the create-item flow's own first refetch, so the common/fast case (the
   background image job finishes within the poll window) no longer depends on that event landing
   at all for a newly created item's own creator to see the image immediately. The event remains
   the fallback for every case this poll doesn't cover (timeout, or another user/tab seeing the
   change).
4. **Scope is deliberately narrow.** Per the task's own strict-scope instruction, this PR does not
   touch the checkout-grid SSE invalidation code (PR #1649, a distinct root cause already fixed),
   does not touch IMS's `ItemsPage.jsx` (different app, different upload path), and does not modify
   `handleGenerateEditImage` (read only, as the reference pattern this fix mirrors).

## Verification Evidence

- `npm run build:pos` -- passes. **Correction (backport #1659, RF-1 on PR #1656's review):** the
  original version of this declaration claimed neither `apps/dgfy-ims` nor `apps/dgfy-storefront`
  render `TerminalOperationsWorkspace.jsx` -- that's factually wrong, and the PR body itself said
  the opposite. `apps/dgfy-ims` does render it: `main.jsx:128,283` lazy-loads
  `packages/web-core/src/features/pos/pages/TerminalPage.jsx` for the `/terminal` route, which
  lazy-loads `TerminalPageLayout.jsx` (`:157,6602`), which lazy-loads and renders
  `TerminalOperationsWorkspace.jsx` (`:22,25,945`) for every POS operations view mode except
  `audit`. `npm run build:skupervisor` confirms this in practice -- it produces its own
  `TerminalOperationsWorkspace-*.js` chunk. `apps/dgfy-storefront` genuinely does not render it
  (it has no POS terminal surface at all), so that half of the original claim stood. Building POS
  alone remains sufficient verification for *this* change only because `dgfy-ims`'s copy of the
  same file is byte-identical (both import the one file under `packages/web-core`) -- not because
  `dgfy-ims` doesn't render it.
- `npx vitest run` (via `apps/dgfy-ims`, which is how `packages/web-core`'s own test suite executes)
  against every contract test referencing `TerminalOperationsWorkspace.jsx` (24 files, 153 tests) --
  all pass, including the 6 tests in `posCreateItemImageUploadPoll.contract.test.js` (original PR
  #1656 count). **Updated (backport #1659):** re-run against the 3 directly affected files after
  the RF-1/RF-2 fixes above -- `posCreateItemImageUploadPoll.contract.test.js` (7 tests, +1 for
  RF-2's timeout-constant coverage), `useItemImageGenerationPoll.test.js` (9 tests, +2 for RF-2's
  `timeoutMs` behavior), `posGenerateItemImage.contract.test.js` (8 tests, unchanged) -- **24/24
  pass**. `npm run build:pos` and `npm run build:skupervisor` both pass with the RF-2 change.
- `npm run check:compliance` -- this declaration is what satisfies it; re-run after adding this file
  to confirm it clears.
- `node scripts/check-app-version-bump.js` -- confirms whether `dgfy-pos`'s version needs bumping
  for this repair; see the PR's own `## Testing Evidence` for the actual result.

See the PR's own `## Testing Evidence` section for the actual pass/fail results of each of the
above, captured at PR-open time.

## Residual Risks

1. **This PR does not add client-side cancellation of the new poll.** Unlike
   `handleGenerateEditImage`'s edit-modal path (which calls `cancelImageGenerationPoll()` on
   `closeEdit`), the create-item modal already disables its own close button while
   `postCreateSaving` is true (existing behavior, unchanged), so the operator cannot dismiss the
   modal mid-poll in the first place -- the hook's own unmount-cleanup still resolves the promise
   with `{status: 'cancelled'}` if the whole workspace unmounts regardless (e.g. navigation away),
   so nothing hangs forever either way.
2. **Worst case, item creation now takes up to ~15s longer** when the backend worker is unusually
   slow or stuck -- acceptable per the task's own framing ("the common/fast case... should now make
   loadItems() reliably return the item WITH its image on the very first render"); the timeout path
   degrades to today's exact behavior (soft warning, SSE backstop), it does not regress past it.
   **Updated (backport #1659, RF-2):** originally this bullet said "~90s" (the hook's shared
   default, reused unmodified by the original PR). RF-2's fix bounds the create-item call site to
   its own shorter `CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS` = 15s instead, since unlike
   `handleGenerateEditImage`'s dismissible edit-modal path, this poll runs while the create-item
   modal's close button is disabled (Residual Risk 1) -- a genuinely stuck job no longer locks the
   operator out for up to a minute and a half.
3. **This repair was originally shipped as `fix/staging/2026-09-06-01-r5` (PR #1656), based on
   `staging`, not `develop`** -- so the continuous `compliance-preflight-sweep.yml` trigger
   (path-filtered to pushes on `develop`) did not auto-fire when that PR merged; it was manually
   dispatched against `staging` and reconciled via PR #1664 instead. **This backport PR (#1659)**
   re-introduces this declaration onto `develop` for the first time, so the continuous sweep *will*
   auto-fire here on merge and reconcile `preflight_request_ref` on its own -- no manual dispatch
   expected for this leg.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment --
`preflight_request_ref` is declared `NOT-EXECUTED-1410-R5-POS-CREATE-ITEM-IMAGE-UPLOAD-RACE`. This
is expected at PR-open time for a `major` declaration, per
`docs/compliance/request-time-preflight-protocol.md`.

**Updated (backport #1659):** on `staging` (the original PR #1656), this ref was reconciled
manually via PR #1664, since the continuous sweep only triggers on `develop` pushes (see Residual
Risk 3 above). This backport PR pushes the declaration to `develop` for the first time, so the
continuous `compliance-preflight-sweep.yml` trigger is expected to fire automatically on merge and
reconcile this ref on its own -- no manual dispatch anticipated for this leg, though it should still
be confirmed rather than assumed.
