# Frontend split: staying in sync with `origin/develop`

Tracks how `refactor/322-frontend-app-split` (issue [#322](https://github.com/Sieitzz/dgfy-platform/issues/322))
absorbs ongoing `develop` work while it splits `apps/dgfy-web` into `apps/dgfy-ims`,
`apps/dgfy-pos`, `apps/dgfy-storefront`, and `packages/web-core`. The design decision this
branch implements is recorded in ADR 0064 (`docs/architecture/adr/0064-frontend-split-into-three-apps.md`,
added once the split is far enough along to document the final shape — see the phase checklist
on issue #322 in the meantime). See [backend-absorption.md](backend-absorption.md) for the
general pattern this follows (the prior `frontend/` -> `apps/dgfy-web` move used the same
git-mv-first approach).

## Why this is needed

The branch is long-lived and lands as a single PR at the end. Meanwhile devs keep merging
feature work into `develop` under the old `apps/dgfy-web/**` paths. Regular
`git merge origin/develop` is the sync mechanism — git's rename detection carries most incoming
changes to their new locations automatically, because every split phase is done as a pure
`git mv` (see [the phase plan referenced from issue #322]) followed by a separate,
import-lines-only rewrite commit. That keeps content similarity high enough for git to match
old and new paths as renames instead of an unrelated delete+add.

The one thing rename detection cannot catch on its own: a file that used to not exist getting
*added* under an old path on `develop` (nothing to detect a rename from), or a genuinely new
consumer-file edit (CI, Docker, deploy scripts) that needs manual porting to the fanned-out
equivalents. `scripts/report-frontend-split-sync.js` exists to catch exactly those two cases.

## The path-map manifest

`scripts/frontend-split-path-map.json` is the source of truth the script classifies against:

- `prefixMap` — `{ old, new }` directory-prefix pairs (e.g. `apps/dgfy-web/src/` ->
  `packages/web-core/src/`). Longest-prefix-wins.
- `specialCases` — exact-path overrides for files whose prefix doesn't move with the rest of
  their directory (e.g. `apps/dgfy-web/src/main.jsx` stays app-side while the rest of `src/`
  becomes `packages/web-core/src/`).
- `retired` — files that are deleted outright, not moved (e.g. the legacy root
  `apps/dgfy-web/vite.config.js`).
- `consumerPathPatterns` — regexes for files outside `apps/dgfy-web/` whose *content* encodes
  knowledge of the old layout (CI workflows, `infrastructure/docker/`, `scripts/deploy.sh` and
  siblings, `ecosystem.config.cjs`, root `package.json`, `security/audit-allowlist.json`,
  `apps/dgfy-api/tests/*contract*`).

**Every phase that does a `git mv` updates this manifest in the same commit.** The manifest is
always accurate for the branch's current `HEAD` — it grows as phases land, it never describes a
future or past state.

## Running the sync

**Before merging**, preview what's coming in:

```
npm run report:frontend-split-sync
```

Groups the incoming `merge-base(HEAD, origin/develop)..origin/develop` diff into:

- **mapped** — lands at a known new path, no action needed beyond the merge itself
- **unmapped-new** (ACTION) — a file was *added* under an old/retired path with no manifest
  entry; after merging, `git mv` it to the right new location per the manifest's prefix rules
  and re-run the import-rewrite one-liners below
- **unmapped** (ACTION) — a file *changed* under `apps/dgfy-web/` with no manifest mapping;
  same remediation as above
- **consumer** (REVIEW) — a CI/Docker/deploy/script file changed; port the intent to the
  fanned-out equivalents by hand
- **retired** (REVIEW) — a change targets a file this branch has deleted; port the intent
  manually to wherever that responsibility now lives
- **unrelated** — everything else, counted only

**Merge:**

```
git merge origin/develop
```

Standing conflict-resolution rule for the Phase 1/2 import-rewrite commits: when a hunk
conflicts, take develop's side, then re-run the codemod on that file (don't hand-merge rewritten
import lines).

**After merging**, confirm nothing old-shaped survived the merge:

```
npm run report:frontend-split-sync:post-merge
```

Runs `git ls-files` against every retired/legacy prefix. Any hit means either rename detection
missed a file (fell below git's similarity threshold — small barrel/index files are the known
risk) or develop added a new file at an old path mid-merge. Each hit is printed with its mapped
destination (or a note that no mapping exists, in which case place it by hand, referencing the
current phase's target layout).

**Meaningful from Phase 5 onward.** The whole-tree prefix this checks (`apps/dgfy-web/`) is a
stand-in for "should be empty," which only became true once Phase 5 retired the legacy root
(confirmed clean immediately after that phase's commits landed). Before Phase 5, `apps/dgfy-web/`
was still the live home for everything not yet migrated, so this check would have reported
hundreds of expected files as "resurrected" -- the plain `report:frontend-split-sync` (no
`--post-merge`) against `origin/develop` was the correct and sufficient check during Phases 0-4,
scoped to the manifest's actual `prefixMap`/`retired` entries rather than the whole legacy root.
Now that `apps/dgfy-web/` no longer exists, any hit here means a develop merge resurrected a file
at that dead path -- treat it the same as any other unmapped/resurrected file: `git mv` it to its
mapped destination per the manifest (or place it by hand if unmapped) and re-run the check.

Commit any absorbed fixes as `chore: absorb develop into frontend split`.

**Cadence:** after every merge from develop, and at least weekly regardless. Merge cadence
should tighten immediately after a phase that does a bulk `git mv` (aim for within a day) — that
is when the branch and develop diverge the most on the moved paths.

## Import-rewrite one-liners

Recorded here as they're introduced, so they can be re-run on any file absorbed from develop
whose merge landed as a conflict or as an `unmapped`/`unmapped-new` sync-report hit rather than
a clean rename.

### Phase 1 — casing and alias-form normalization

The on-disk root `Components/` directory is capitalized, but the vite alias key that maps to
it is (and always was, in all four vite configs) the lowercase `@/components`. Usage was
already 520:11 lowercase-favoring, so Phase 1 canonicalized to the existing dominant/aliased
spelling rather than the directory's capitalization — no vite config changes needed:

```
sed -i '' "s|@/Components/|@/components/|g" <file> [<file> ...]
```

Applied to: `Components/suppliers/SupplierDetailsModal.jsx`, `Pages/AiChat.jsx`,
`src/features/pos/components/TerminalOperationsWorkspace.jsx`,
`src/features/pos/components/PosTenantSetupModal.jsx`, and the one contract test asserting on
a literal import string, `src/features/pos/__tests__/menuImportBatchEntry.contract.test.js`.

Separately, `@/src/<dir>/...` and `@/<dir>/...` are equivalent whenever an explicit alias for
`<dir>` exists (both resolve to the same absolute path — one via the explicit alias, one via
the bare-`@`-to-root fallback). Collapsed to the shorter alias form wherever a matching alias
existed:

```
sed -i '' \
  -e "s|@/src/services/|@/services/|g" \
  -e "s|@/src/hooks/|@/hooks/|g" \
  -e "s|@/src/lib/|@/lib/|g" \
  <file> [<file> ...]
```

**Left alone, deliberately:** `@/src/features/...`, `@/src/utils/...`, `@/src/components/...`
(note: `src/components/`, NOT the same directory as the `@/components` alias target,
root `Components/`) — no shorter alias exists for any of these today. They still resolve
correctly via the bare-`@`-to-root fallback; a shorter alias for them doesn't exist until
Phase 2 introduces `@sieitzz/web-core/*`, at which point they get rewritten directly to the
package-scoped form rather than to an intermediate app-local alias.
