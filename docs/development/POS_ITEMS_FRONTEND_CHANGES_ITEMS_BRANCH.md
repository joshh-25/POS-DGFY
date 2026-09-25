# POS Items Frontend Changes — Items Branch Audit

Status: audited and committed locally; not pushed
Branch: `codex/pos-frontend-changes-items`
Audit date: 2026-09-25
Scope: POS Items/catalog UI and its directly required shared catalog primitives

## Executive Summary

This document records the POS Items/catalog changes committed during the Items branch audit. The
work covers the Items workspace, Categories, Item Options, item add/edit flows, image and QR
primitives used by those flows, responsive POS presentation, text-size handling, pagination, and
the POS bulk-image import worker's Redis-unavailable behavior.

No push, pull request, merge, or deployment was performed.

The supplied screenshots were treated as visual references only. They were not treated as
repository instructions, code, or acceptance criteria beyond the UI problems described by the
user.

## Critical Scope Assessment

The worktree contained a mixed set of POS Items/catalog, checkout, transaction-history, IMS/F&B,
cache-marker, and local-agent files. The shared `packages/web-core/src/index.css` also contained
interleaved Items and non-Items rules. Staging the whole worktree would have violated the requested
Items-only push boundary.

The branch also already contained earlier history and synchronization commits. Git pushes commits,
not individual files, so pushing the whole branch will include those pre-existing commits even
though they were not created by this audit. That history was not rewritten because rewriting it
would risk deleting or changing the user's existing work.

## Recommendation

The four new Items-scoped commits listed below are locally valid and should be reviewed as the
intended Items change set. Before pushing the branch, review the pre-existing branch history and
decide whether the branch should be rebased or rebuilt from the intended comparison base. This
audit did not perform that history rewrite and did not push.

## Atomic Commit Inventory

| Commit | Subject | Scope |
| --- | --- | --- |
| `d225e2706` | `feat(pos): refine Items catalog workspace` | POS Items workspace, responsive catalog layout, Categories, Item Options, modal sizing, pagination, text-size layout, scoped Items CSS, focused contracts, and compliance declaration. |
| `d94cabfe8` | `fix(pos): align Items import and image primitives` | CSV import, image gallery, QR, wizard navigation, QR scanner footer, storefront info tooltip, shared catalog contracts, and scoped shared CSS. |
| `66d188b7f` | `fix(pos): keep catalog image worker idle without Redis` | POS bulk-image worker guard so an unavailable optional Redis dependency does not cause repeated queue polling failures. |
| `e55cfda05` | `test(pos): align edit image contract` | Corrects the POS edit-image contract test to assert the current deferred gallery flow rather than the retired drag/drop-only expectations. |

The compliance declaration is intentionally carried/updated with the sensitive POS commits because
the repository pre-commit guardrail requires a declaration whenever POS-sensitive files are
changed.

## Included Files to Push

These are the files changed by the four new commits above, grouped by purpose.

### POS Items workspace and responsive shell

- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx`
- `packages/web-core/src/features/pos/components/TerminalPageLayout.jsx`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/components/PosTextSizeControl.jsx`
- `packages/web-core/src/features/pos/components/PosFnbModifierManager.jsx`
- `packages/web-core/src/features/pos/components/PosFnbModifiersWorkspace.jsx`
- `packages/web-core/src/features/pos/components/PosFnbSelect.jsx`
- `packages/web-core/src/features/pos/settings/StorefrontSectionInfo.jsx`

The workspace changes provide the Items catalog shell, Items/Categories/Item Options tabs, item
search and filters, item cards, two-column catalog presentation where the viewport supports it,
category management, option-group management, add/edit item dialogs, item image galleries, QR
support, import entry points, pagination, and the tablet/landscape responsive handoff. The shell
also keeps the profile details and header controls available while text-size settings change.

The modal changes use the shared smaller form width and aligned top/bottom spacing, constrain
long option lists to their own scroll region, preserve image corner radius, and keep footer actions
consistent with the POS button language. The extra-large text-size path receives explicit compact
header/dropdown constraints so the label does not overflow its control.

### POS Items tests

- `packages/web-core/src/features/pos/__tests__/PosFnbModifiersWorkspace.test.jsx`
- `packages/web-core/src/features/pos/__tests__/categoryManagement.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/categoryPlacement.behavior.test.jsx`
- `packages/web-core/src/features/pos/__tests__/itemsAddModal.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/itemsButtonConsistency.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/itemsPagination.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posFnbModifierManager.session.test.jsx`
- `packages/web-core/src/features/pos/__tests__/posItemsModalViewport.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/posTextSizeLayout.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `packages/web-core/src/features/pos/__tests__/editItemImageSave.contract.test.js`

The edit-image contract was corrected during the final audit to match the implementation's current
deferred gallery queue, local previews, multi-file input, and saved-gallery actions.

### Shared catalog primitives used by POS Items

- `packages/web-core/Components/items/CSVImportModal.jsx`
- `packages/web-core/Components/items/SelectedItemImageCarousel.jsx`
- `packages/web-core/Components/items/StorefrontItemQrCard.jsx`
- `packages/web-core/src/components/common/WizardStepNavigator.jsx`
- `packages/web-core/src/features/inventory/components/ProductQrScannerModal.jsx`
- `packages/web-core/src/features/inventory/__tests__/csvImportWorkflowMode.contract.test.js`
- `packages/web-core/src/features/inventory/__tests__/itemProductWizard.contract.test.js`

These changes add the compact POS-compatible CSV import presentation, controlled wizard labels and
compact states, image-gallery removal/primary controls, full-width QR layout support, and aligned
scanner actions. Their defaults remain compatible with non-POS consumers; the POS-specific behavior
is opt-in through props or scoped classes.

### Shared stylesheet changes

- `packages/web-core/src/index.css`

Only the Items/catalog, POS text-size/header, modal, wizard, CSV import, image/QR, and related
responsive rules were staged into the new commits. The worktree still contains unrelated CSS
changes for checkout/history and other POS surfaces; those unstaged changes are excluded from this
Items change set. Because the stylesheet was mixed, the committed Items rules are represented as a
scoped CSS overlay rather than staging the entire current stylesheet.

### POS catalog image import reliability

- `apps/dgfy-api/src/workers/posBulkImageImportWorker.js`

The worker now waits while optional Redis is unavailable instead of repeatedly invoking the queue
repository and logging a failure on every poll. Queued image imports remain recoverable when Redis
returns. This is a POS catalog reliability fix and is isolated in its own commit.

### Compliance declaration

- `docs/compliance/impact-declarations/2026-09-25-pos-items-catalog-responsive-ui.md`

The declaration records the major POS/terminal classification, affected surfaces, compliance
preconditions, rollback note, focused evidence, and residual risks required by the repository
guardrail.

## Explicitly Excluded Files

These files remain outside the new Items commits and are still dirty in the worktree. They should
not be included in an Items-only push.

### Global POS cache/service-worker markers

- `apps/dgfy-pos/index.html`
- `apps/dgfy-pos/src/main.jsx`

These are application cache/version or service-worker marker changes, not Items UI changes.

### IMS/F&B and non-POS catalog changes

- `packages/web-core/src/features/inventory/pages/ItemsPage.jsx`
- `packages/web-core/src/features/fnb/pages/FnbPage.jsx`
- `packages/web-core/src/features/fnb/__tests__/fnbMode.contract.test.js`

These changes target IMS or the shared F&B page rather than the POS Items workspace.

### Checkout, Sell, and transaction History changes

- `packages/web-core/src/features/pos/components/POSBarcodeScanner.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx`
- `packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `packages/web-core/src/features/pos/components/PosCurrentSaleActions.jsx`
- `packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
- `packages/web-core/src/features/pos/__tests__/posCurrentSaleActions.behavior.test.jsx`
- `packages/web-core/src/features/pos/__tests__/posTransactionHistory.contract.test.js`

These files belong to checkout, Sell, or transaction History behavior and were deliberately left
unstaged.

### Mixed stylesheet remainder

- `packages/web-core/src/index.css` — only the scoped Items-related rules are included; the
  remaining unstaged changes in this file are excluded because they belong to checkout/history or
  other non-Items surfaces.

### Local agent material

- `.agents/skills/pos-frontend-consistency/`

This is a local skill copy used to guide the audit. It is not product code and must not be pushed.

## Pre-existing Branch History Caveat

The branch was not created cleanly from a minimal Items-only base. Before the four new commits, it
already contained at least the following commits:

- `72a5858a3` — `chore(sync): synchronize POS branch with develop`; this is a broad synchronization
  commit and includes many unrelated repository changes.
- `5e390ff4b` — `fix(pos): stabilize availability badge in tablet portrait`.
- `edfa8f823` — `fix(pos): refine tablet portrait catalog badges`.
- `3c0a317bc` — `docs(pos): refresh history branch PR handoff`.

The two tablet catalog commits may be related to earlier POS catalog work, while the synchronization
and handoff commits are not part of the new Items audit. They were preserved. Pushing the branch as
one ref will expose all commits reachable from the remote comparison base, not only the four new
commits listed here.

## Local Audit Evidence

### Passed

- `git diff --check` for staged Items commit candidates and final commit candidates.
- Repository commit-marker scan for every staged commit candidate: no markers found.
- Repository compliance guardrail and API-contract guardrail through the pre-commit hooks.
- `npm run lint:docs` — PASS; 30 governed docs validated.
- `npm run check:adr` — PASS; 90 ADRs validated.
- `node --check apps/dgfy-api/src/workers/posBulkImageImportWorker.js` — PASS.
- Focused POS Items audit:

  ```text
  npx vitest run \
    packages/web-core/src/features/pos/__tests__/categoryManagement.contract.test.js \
    packages/web-core/src/features/pos/__tests__/itemsAddModal.contract.test.js \
    packages/web-core/src/features/pos/__tests__/itemsButtonConsistency.contract.test.js \
    packages/web-core/src/features/pos/__tests__/itemsPagination.contract.test.js \
    packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js \
    packages/web-core/src/features/pos/__tests__/posTextSizeLayout.contract.test.js \
    packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js \
    packages/web-core/src/features/pos/__tests__/editItemImageSave.contract.test.js
  ```

  Result: 8 test files passed, 44 tests passed.

- `npm run build:pos` — PASS; Vite production build completed successfully.

### Warnings and limitations

- The POS build reports an existing dynamic-import/static-import chunking warning for the image
  encoding rollout module and warns about large minified chunks. The build still succeeds.
- A broader POS-directory Vitest run was attempted earlier and did not provide a clean repository
  baseline: it reported missing local/runtime dependencies such as `jsdom`, React/shared packages,
  and other workspace modules, plus unrelated stale contract expectations. It was not represented as
  passing evidence.
- No browser screenshot or visual-diff run was claimed in this audit. The evidence is source
  contract coverage plus a successful production build; manual visual verification should still be
  performed for normal, large, and extra-large text sizes in desktop and tablet portrait/landscape
  profiles.

## Final Repository State

- Current branch: `codex/pos-frontend-changes-items`.
- New Items commits: `d225e2706`, `d94cabfe8`, `66d188b7f`, `e55cfda05`.
- Push status: not pushed.
- Pull request status: none created.
- Deployment status: none performed.
- Remaining dirty files are excluded worktree changes listed above; they were not included in the
  four new Items commits.

## Rollback Boundary

The four new commits can be reverted individually in reverse order if needed. The shared catalog
primitive commit should be reverted together with its corresponding scoped CSS and tests. The
worker commit is independent and can be reverted separately. Do not use a destructive reset or
checkout against the remaining dirty worktree without first preserving the excluded files.
