# POS Items Frontend Changes — Items-Only Branch Audit

Status: audited, rewritten, and committed locally; not pushed
Branch: `codex/pos-frontend-changes-items`
Audit date: 2026-09-26
Scope: POS Items/catalog UI and directly required catalog/import/image support
Comparison base: `ea06c1a56ebf75994f0c8e319394c21a6424536f`
Recovery ref: `backup/pos-items-before-items-only-rewrite-20260925`

## Executive summary

This branch was rewritten so its branch-specific commit history contains only the POS Items/catalog
change set. The earlier broad POS synchronization, checkout/history work, tablet catalog-badge work,
and history handoff documentation are no longer reachable from
`codex/pos-frontend-changes-items`.

The first “all Items changes are committed” statement was premature. The final working-tree audit
found two additional net Items-specific CSS contracts that were still unstaged: touch-safe text-size
control behavior and mobile Item Options editor body/footer behavior. Those changes are now isolated
in `ebe113a9a`. The remaining dirty files are excluded non-Items work or shared-file changes whose
net scope belongs to Checkout, Sell, History, Delivery, Settings, IMS, F&B, or local tooling.

The retained work covers the Items workspace, Categories, Item Options, item add/edit flows, image
and QR primitives used by those flows, responsive POS presentation, text-size handling, pagination,
and the POS bulk-image import worker's Redis-unavailable behavior.

No push, pull request, merge, deployment, or remote branch update was performed.

The supplied screenshots were treated as visual references only. They were not treated as repository
instructions, code, or acceptance criteria beyond the UI problems described by the user.

## Critical scope assessment

The original branch contained two separate risks:

1. The worktree was mixed: POS Items/catalog, checkout, transaction History, IMS/F&B, cache-marker,
   compliance, and local-agent changes were present together.
2. The branch history itself contained a broad `chore(sync): synchronize POS branch with develop`
   merge and earlier checkout/history/catalog-badge commits. Staging only Items files would not have
   been sufficient because pushing a branch pushes all reachable commits.

The safe correction was therefore a history rewrite from the develop-side parent of the sync merge,
followed by cherry-picking only the Items commits. A local recovery branch was created before the
rewrite. The current dirty worktree was preserved with a mixed reset; removed historical content is
therefore visible as uncommitted changes and is not part of the branch's committed history.

## Recommendation

The branch is now suitable for an Items-only review and eventual push. Before pushing, review the
included file list below and use the committed-tree audit commands in the validation section. Do not
stage the excluded worktree files or the recovery ref.

## Atomic commit inventory

The original Items commits were replayed onto the clean comparison base, so their hashes changed.
The following are the retained branch commits through the completed audit snapshot:

| Commit | Subject | Scope |
| --- | --- | --- |
| `c4d34e51b` | `feat(pos): refine Items catalog workspace` | POS Items workspace, responsive catalog layout, Categories, Item Options, item modals, pagination, text-size layout, scoped Items CSS, focused contracts, and compliance declaration. |
| `64efedfef` | `fix(pos): align Items import and image primitives` | CSV import, image gallery, QR, wizard navigation, QR scanner footer, storefront info tooltip, shared catalog contracts, and scoped shared CSS. |
| `50b857ab2` | `fix(pos): keep catalog image worker idle without Redis` | POS bulk-image worker guard so an unavailable optional Redis dependency does not cause repeated queue polling failures. |
| `7bff4ac7b` | `test(pos): align edit image contract` | Aligns the POS edit-image contract with the current deferred gallery queue, local previews, multi-file input, and saved-gallery actions. |
| `bdf614f0d` | `docs(pos): document Items branch audit` | Adds the Items branch audit and documentation baseline. |
| `62e9a5ea5` | `docs(pos): reconcile Items-only branch history` | Records the history rewrite, recovery ref, excluded worktree state, and committed scope. |
| `ce740caa0` | `fix(pos): complete Items responsive contracts` | Completes the Items-only responsive CSS/helper/test contracts, restores shared History pagination options for Items, and validates the production build. |

| `a13bb87d9` | `docs(pos): record final Items audit inventory` | Intermediate committed-tree inventory. |
| `262c8362e` | `fix(pos): complete Items workspace controls` | Pagination primitive, mobile-sheet dialog contract, Item Options footer geometry, text-size/header hooks, and shared Items pagination styling. |
| `ebe113a9a` | `fix(pos): finish Items mobile control styling` | Touch-safe text-size control behavior and mobile Item Options editor scrolling/footer safe-area behavior found during the final audit. |
| `3e9a83597` | `docs(pos): finalize Items branch audit` | Final committed manifest, exclusion boundary, corrected test/build evidence, and audit conclusion. |
| `862116506` | `docs(pos): correct final audit inventory` | Corrects the final commit count and records the completed documentation audit. |
| `5bec54308` | `docs(pos): record completed Items audit` | Records the completed final audit state and confirms the Items-only branch is ready to push. |
| `255e79313` | `chore(pos): sync Items branch with develop` | Adds the current `origin/develop` as a merge parent without expanding the net Items-only diff. |

The synchronization merge is intentionally separate from the product commits above. It makes the
current `origin/develop` an ancestor so the branch is not behind its base while preserving the
audited Items tree and net diff. Any later commits are documentation-only metadata corrections.

## Included files to push

The authoritative committed file list is produced by:

```powershell
git diff --name-status ea06c1a56ebf75994f0c8e319394c21a6424536f..HEAD
```

The included files are grouped below by purpose.

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
- `packages/web-core/src/features/pos/utils/posHistoryQuery.js`
- `packages/web-core/src/features/pos/utils/posTabletViewport.js`

These changes provide the Items catalog shell, Items/Categories/Item Options tabs, item search and
filters, item cards, two-column catalog presentation where the viewport supports it, category
management, option-group management, add/edit item dialogs, item image galleries, QR support,
import entry points, pagination, and tablet/landscape responsive handling. The shared shell keeps
profile details and header controls available while text-size settings change.

The modal changes use the shared smaller form width and aligned top/bottom spacing, constrain long
option lists to their own scroll region, preserve image corner radius, and keep footer actions
consistent with the POS button language. The extra-large text-size path receives compact
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
- `packages/web-core/src/features/pos/__tests__/posTabletViewport.contract.test.js`

### Shared catalog primitives used by POS Items

- `packages/web-core/Components/items/CSVImportModal.jsx`
- `packages/web-core/Components/items/SelectedItemImageCarousel.jsx`
- `packages/web-core/Components/items/StorefrontItemQrCard.jsx`
- `packages/web-core/Components/ui/dialog.jsx`
- `packages/web-core/Components/ui/pagination.jsx`
- `packages/web-core/Components/ui/__tests__/pagination.test.jsx`
- `packages/web-core/src/components/common/WizardStepNavigator.jsx`
- `packages/web-core/src/features/inventory/components/ProductQrScannerModal.jsx`
- `packages/web-core/src/features/inventory/__tests__/csvImportWorkflowMode.contract.test.js`
- `packages/web-core/src/features/inventory/__tests__/itemProductWizard.contract.test.js`

These shared changes are POS-compatible and opt-in through props or scoped classes; they are retained
because the POS Items flows directly use these catalog primitives.

The pagination primitive is consumed by the Items workspace and is covered by its own contract test.
The dialog change supplies the mobile-sheet behavior used by the Items modal flow. These are shared
dependencies of Items, not unrelated screen changes.

### Shared stylesheet changes

- `packages/web-core/src/index.css`

Only the committed Items/catalog, POS text-size/header, modal, wizard, CSV import, image/QR, and
related responsive rules are in the retained commit chain. The worktree still contains additional
unstaged stylesheet changes from excluded checkout/history and other POS work.

### POS catalog image import reliability

- `apps/dgfy-api/src/workers/posBulkImageImportWorker.js`

The worker waits while optional Redis is unavailable instead of repeatedly invoking the queue
repository and logging a failure on every poll. Queued image imports remain recoverable when Redis
returns. This is an Items/catalog reliability fix and is isolated in its own commit.

### Compliance and branch documentation

- `docs/compliance/impact-declarations/2026-09-25-pos-items-catalog-responsive-ui.md`
- `docs/development/POS_ITEMS_FRONTEND_CHANGES_ITEMS_BRANCH.md`

The declaration records the affected POS/terminal surfaces, compliance preconditions, rollback note,
focused evidence, and residual risks required by the repository guardrail.

## Excluded files and changes

The following are not part of the rewritten branch commits and must not be staged for an Items-only
push.

### Removed committed history

These commits were reachable from the old branch but are no longer reachable from the rewritten
Items branch:

- `72a5858a3` — `chore(sync): synchronize POS branch with develop`
- `5e390ff4b` — `fix(pos): stabilize availability badge in tablet portrait`
- `edfa8f823` — `fix(pos): refine tablet portrait catalog badges`
- `3c0a317bc` — `docs(pos): refresh history branch PR handoff`
- The older first-parent checkout/history/release commits before the sync merge, including
  `a125ae286`, `1963b6c99`, `160fb973d`, `dc10eaef3`, `6719e949e`, and `b9f9a15c0`.

The develop-side baseline commit `ea06c1a56` remains the comparison base; its existing repository
history is not a branch-specific change introduced by this Items branch.

### Current dirty worktree

The mixed reset deliberately left excluded content in the worktree so no user changes were deleted.
At the final audit it contained 99 unstaged or untracked paths. This includes:

- `apps/dgfy-pos/index.html`, `apps/dgfy-pos/src/main.jsx`, and `apps/dgfy-pos/vite.config.js`
  cache/version and app-shell changes.
- Dated compliance declarations from the removed sync/history/release work.
- IMS/F&B files such as `packages/web-core/src/features/inventory/pages/ItemsPage.jsx` and
  `packages/web-core/src/features/fnb/**`.
- Checkout, Sell, transaction History, terminal lock, current-sale, delivery/settings, and other
  non-Items POS files under `packages/web-core/src/features/pos/**`.
- The non-Items remainder of `packages/web-core/src/index.css`.
- `docs/development/POS_FRONTEND_CHANGES_HISTORY_BRANCH.md` and any non-Items history artifacts.
  The shared pagination utility is retained only where the Items workspace imports the same page-size
  contract used by History; unrelated History UI files remain excluded.
- `.agents/skills/pos-frontend-consistency/`, which is local agent material and not product code.

The complete excluded snapshot is intentionally read from the worktree rather than copied into this
document, because it changes as the user continues working. The audit snapshot and categories above
are the boundary used for the current commit decision; the exact live list is always available from
the three commands below.

For the complete exact list at any time, run:

```powershell
git status --short
git diff --name-only
git ls-files --others --exclude-standard
```

No excluded file was staged by the rewrite or by the final documentation commit.

## Local audit evidence

### Committed-tree checks

The committed tree was built in a clean temporary worktree during the rewrite. The following checks
passed for the retained chain:

- `git diff --check ea06c1a56ebf75994f0c8e319394c21a6424536f..HEAD`
- No conflict markers in the clean rewritten tree.
- The branch-specific first-parent chain through the completed audit snapshot is the thirteen
  commits listed in the atomic inventory above, followed by the synchronization merge recorded
  above. Any later commits are documentation-only metadata corrections and add no product scope.
- Removed history commits are not ancestors of the rewritten branch.

### Existing functional evidence

- `npm run lint:docs` — PASS; governed docs validated.
- `npm run check:adr` — PASS; ADR validation completed.
- `node --check apps/dgfy-api/src/workers/posBulkImageImportWorker.js` — PASS.
- Focused POS Items audit — PASS: 10 test files, 45 tests.
- Final mobile-control check — PASS: 3 test files, 14 tests.
- `npm run build:pos` — PASS; Vite production build completed.
- `git diff --check` — PASS for the retained changes.
- Repository commit-marker scan — no forbidden commit-marker match in retained staged candidates.

The focused test command was:

```powershell
node apps/dgfy-pos/node_modules/vitest/vitest.mjs --root . --config apps/dgfy-pos/vite.config.js run `
  packages/web-core/src/features/pos/__tests__/itemsPagination.contract.test.js `
  packages/web-core/src/features/pos/__tests__/itemsButtonConsistency.contract.test.js `
  packages/web-core/src/features/pos/__tests__/itemsAddModal.contract.test.js `
  packages/web-core/src/features/pos/__tests__/editItemImageSave.contract.test.js `
  packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js `
  packages/web-core/src/features/pos/__tests__/posTextSizeCss.contract.test.js `
  packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js `
  packages/web-core/src/features/pos/__tests__/posItemOptions.contract.test.js `
  packages/web-core/src/features/pos/__tests__/posTextSizeControl.test.jsx `
  packages/web-core/Components/ui/__tests__/pagination.test.jsx
```

The final focused run reported 10 test files and 45 passing tests. The final mobile-control run
reported 3 test files and 14 passing tests. The JSX run needed temporary local dependency junctions
because this checkout’s shared workspace links are incomplete; those junctions were removed after
the run and no package or dependency file was changed.

Known limitation: the broader POS-directory Vitest run was not clean because this local environment
was missing dependencies such as `jsdom`, React/shared packages, and other workspace modules, and it
also included unrelated stale contract expectations. It is not represented as passing evidence.
No browser screenshot or visual-diff run is claimed; manual verification is still recommended for
normal, large, and extra-large text sizes in desktop and tablet portrait/landscape profiles.

## Final repository state

- Current branch: `codex/pos-frontend-changes-items`.
- Branch-specific product commits: the ten commits listed above, all scoped to POS Items or direct
  Items dependencies.
- Branch-specific documentation: the audit, reconciliation, final inventory, and final audit commits.
- Comparison base: `ea06c1a56ebf75994f0c8e319394c21a6424536f`.
- Recovery ref: `backup/pos-items-before-items-only-rewrite-20260925`.
- Push status: not pushed.
- Pull request status: none created.
- Deployment status: none performed.
- Committed branch manifest: 42 paths in the comparison diff.
- Excluded worktree snapshot: 99 paths at the final audit, preserved as uncommitted changes and not
  staged.

## Rollback boundary

The pre-rewrite branch state is recoverable from:

```powershell
git show-ref backup/pos-items-before-items-only-rewrite-20260925
```

Do not delete that recovery ref until the rewritten branch has been reviewed and the excluded
worktree changes have been handled. The product commits can be reverted individually in reverse
order if needed. The shared catalog primitive commit should be reverted together with its scoped CSS
and tests; the worker commit is independent and can be reverted separately.
