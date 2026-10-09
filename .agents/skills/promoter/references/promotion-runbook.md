# Promotion runbook — copy-pasteable commands

Mechanics only. Rule sources (why, and what gates apply) are in `../SKILL.md` and the docs it
points at — don't duplicate the reasoning here, just the commands.

## Compliance preflight — pinned target-ref scan, resolve, and refresh (shared by both flows, #1648; pinned-scan fix from PR #1672 review, RF-1/RF-2; parameterized RF-4, unique-path fix RF-6; fail-loud guard + pinned-SHA cut fix RF-8/RF-10; fail-closed strict-mode fix RF-12)

Every call site below needs the identical check before its next branch is cut, but against
different target refs: the `#1007`-gated exception's direct `release/<label>` cut and the default
flow's `to-staging/<candidate_id>` cut both scan `origin/develop`; the default flow's own
`release/<candidate_id>` cut scans `origin/staging` instead — that's what `release/<label>` is
actually cut from on that leg (see the substitution note where that call site sends you here). Set
`TARGET_REF` **before** this block, then run the rest of this section unmodified — never hard-code
the ref inline, that's exactly the gap RF-4 (PR #1672 review) found in this section's first version,
which offered no way to invoke it against anything but `origin/develop`. This block itself never
assigns a default value: RF-8 (PR #1672 review) found that the block's own `TARGET_REF=origin/develop`
fallback silently clobbered a call site's `origin/staging` choice whenever both were pasted in
sequence — exactly what "run unmodified" tells the reader to do — so a missing assignment now fails
loudly instead of silently defaulting. Every block in this section also runs under strict mode from
here on — set once, it persists for the rest of this shell session, no need to restate it in the
blocks below. RF-12 (PR #1672 review, round 4) found the real gap without it: an unchecked failure
in `git fetch`, `git rev-parse`, `git worktree add`, or the declaration-listing step could produce
empty output that gets misread as "both checks clear," letting the caller cut from `$TARGET_SHA`
without ever actually evaluating it:

```bash
set -euo pipefail
: "${TARGET_REF:?set TARGET_REF before running this procedure}"
REF_NAME="${TARGET_REF#origin/}"
git fetch origin "$REF_NAME"
TARGET_SHA=$(git rev-parse "$TARGET_REF")
```

`TARGET_SHA` is the immutable commit every check below actually evaluates, and — once both checks
come back clear — the exact commit every call site cuts its next branch from (RF-10, PR #1672
review): the branch-cut commands used to re-read `origin/develop`/`origin/staging` fresh, after a
*second*, later, unqualified `git fetch origin` at each call site — so a push landing in the gap
between "scan clear" and "cut" could carry an unscanned declaration straight onto the new promotion
branch. Reading `$TARGET_SHA` instead of the ref closes that gap outright: there is no later fetch
for the ref to move underneath it.

The scan must reflect `$TARGET_REF`'s exact committed state — not whatever the promoter's own
working directory happens to have checked out, and not a `develop..main`/`develop..staging` diff (a
diff misses a declaration already reconciled on both branches via a prior #1007-override promotion —
#1374's own finding: 26 outstanding on a full scan vs. 4 on a diff). Fixed with a disposable
worktree pinned to the freshly fetched target ref, at a **path unique to this run** — never a fixed
shared path (RF-6, PR #1672 review: a fixed path's unconditional `rm -rf` could delete a
concurrent/interrupted promoter session's own active worktree at that same path) — with a cleanup
trap as the crash/interrupt backstop. `git worktree add` failing here already aborts the whole
session under the strict mode set above (RF-12) — no separate check needed on this line, only the
trap's own `2>/dev/null` stays deliberately suppressed, since a best-effort cleanup failing on exit
is not itself a finding worth surfacing:

```bash
WORKTREE_DIR="$(git rev-parse --show-toplevel)/.tmp/compliance-scan-$REF_NAME-$$"
trap 'git worktree remove --force "$WORKTREE_DIR" 2>/dev/null' EXIT
git worktree add --detach "$WORKTREE_DIR" "$TARGET_SHA"
```

Scan that pinned checkout, never the current working directory. RF-12 (PR #1672 review, round 4)
found three fail-open traps in this block's previous version, all fixed below:

- Listing files as its own checked statement (`DECLARATION_FILES=$(...)`), not inline inside the
  `for` loop's own `$(...)` — strict mode's `set -e` does **not** catch a command substitution's
  failure when it sits inside a `for ... in $(...)` word list, only when it's a plain assignment.
  `for f in $(git ls-files ...); do ...` failing silently and iterating zero times is exactly how a
  broken worktree/scan produced "empty output" that got misread as "clear."
- Filtering by extension with a `case` match instead of piping through `grep '\.md$'` — under
  `pipefail`, that pipe would fail the whole assignment the moment zero `.md` files exist, which is
  a normal, expected outcome (no compliance-sensitive declarations at all), not an error. Don't
  reintroduce that pipe here even under strict mode; it trades one fail-open trap for a fail-closed
  false positive on a perfectly clean repo.
- Checking `is-preflight-outstanding.js`'s actual output, not just `&&`-gating on its exit code —
  the script exits 1 for two different reasons (a reconciled declaration, expected, or a read/parse
  failure, a real error — see its own header comment) and only its stdout ("reconciled" vs. nothing)
  tells them apart. Blindly treating every non-zero exit as "not outstanding" is the same fail-open
  shape as the other two, just at the per-file level instead of the per-scan level. No blanket
  `2>/dev/null` either — a real failure here has to be visible, not silently discarded:

```bash
DECLARATION_FILES=$(git -C "$WORKTREE_DIR" ls-files -- docs/compliance/impact-declarations)
for f in $DECLARATION_FILES; do
  case "$f" in
    *.md) ;;
    *) continue ;;
  esac
  status=0
  output=$(node scripts/is-preflight-outstanding.js "$WORKTREE_DIR/$f") || status=$?
  if [ "$status" -eq 0 ]; then
    echo "$f"   # outstanding
  elif [ "$status" -ne 1 ] || [ "$output" != "reconciled" ]; then
    echo "ERROR: is-preflight-outstanding.js failed on $f (exit $status): $output" >&2
    exit 1
  fi
done
gh issue list --label compliance:preflight-handoff --state open --json number,title,url
```

Empty output on both → clear; tear the worktree down now (`git worktree remove --force
"$WORKTREE_DIR"` — the trap above is only the crash/interrupt backstop, not a substitute for
cleaning up on the happy path) and proceed to whichever branch cut sent you here — **cut from
`$TARGET_SHA`, not a freshly re-read `$TARGET_REF`** (RF-10, PR #1672 review), so nothing landing
after this point rides along unscanned.

**If `$TARGET_REF` is `origin/develop`** and either check finds something, resolve — don't just
report and wait:

```bash
# a stuck handoff issue exists (second command returned one) -- open and merge it now, per
# docs/compliance/request-time-preflight-protocol.md's "Operator handoff procedure":
gh pr create --base develop --head compliance-sweep/<run_id> \
  --title "docs(compliance): reconcile preflight sweep results (<date>)" --body-file <pr_body>
gh pr checks <N> --watch   # Merge Safety poll -- AGENTS.md
gh pr merge <N> --merge --delete-branch

# OR: a declaration is outstanding with no handoff issue yet (first command listed a file, second
# returned nothing) -- the continuous trigger hasn't caught up, dispatch it manually and wait:
gh workflow run compliance-preflight-sweep.yml
gh run list --workflow=compliance-preflight-sweep.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
# then re-run the two check commands above -- a passing run almost always produces a fresh
# stuck-handoff issue (same org-policy block), so open and merge it the same way as above.
```

Either resolve path moves `origin/develop` — **refresh the pinned worktree and `$TARGET_SHA` before
re-checking**, don't re-scan the stale copy already on disk:

```bash
git fetch origin "$REF_NAME"
TARGET_SHA=$(git rev-parse "$TARGET_REF")
git -C "$WORKTREE_DIR" reset --hard "$TARGET_SHA"
```

Re-run both check commands against the refreshed worktree. Repeat resolve → refresh → re-check until
both come back clear, then tear it down and proceed:

```bash
git worktree remove --force "$WORKTREE_DIR"
```

**If `$TARGET_REF` is `origin/staging` and either check finds something: stop, don't dispatch the
sweep against it.** `compliance-preflight-sweep.yml`'s reconciliation PR is hardcoded to
`--base develop` (its own workflow file) — dispatching it with `--ref staging` would check out
`staging`'s tree but still open a `develop`-based PR from it, bundling every unrelated difference
between the two branches into that PR, not just the declaration fix. This should not happen in the
ordinary default flow — see `../SKILL.md`'s "Compliance preflight sweep" section for why a finding
here is a frozen-candidate anomaly, not a routine case, and where a genuine fix actually goes
instead (a `fix/staging/*` repair, not this section's `develop`-based flow).

**If the finding belongs to a fix a Worker is actively authoring right now for this leg** (as
opposed to a stray pre-existing `NOT-EXECUTED-*` this scan just happened to surface), the
recommended fix is `npm run compliance:reconcile-local -- <file>` as part of that fix's own commit
— see `docs/compliance/request-time-preflight-protocol.md`'s "Reconciling one declaration locally,
without a CI round trip" (#1694). It reconciles the declaration synchronously against a local
ephemeral fixture, with no branch/commit/PR of its own, so the reconciled front matter lands in the
same PR as the fix rather than needing a second sweep-handoff PR at all. This is the sanctioned
alternative to the `fix/staging/*` repair route above whenever a Worker is already touching the
declaration — the `fix/staging/*` path is still correct for a pre-existing finding with no in-flight
fix behind it.

## Optional promotion quality suite

The operator chooses whether and when to run `.github/workflows/promotion-quality-gate.yml`; the
workflow is manual-only and every check is advisory. For a normal promotion, run it against the
frozen `develop` candidate before cutting `to-staging/<candidate_id>`. For a rushed promotion, skip
that run and optionally dispatch against the final `release/<candidate_id>` branch before `main`.
The operator may also skip the suite entirely.

The dispatch inputs route `dgfy-api-quality`, `migration-runner-quality`,
`frontend-storefront-quality`, and `salvage-api-evidence` through `heavy_runner_labels_json`
(default `['sieitz-lg']`). The remaining quality jobs, including `pos-sales-e2e-quality`, use
`general_runner_labels_json` (default `['sieitz-runner']`). If the large runner is unavailable,
explicitly dispatch with `heavy_runner_labels_json='["sieitz-runner"]'`; `salvage-api-evidence`
shares the API job's selector to preserve workspace co-location. The shared general label makes
both hosts eligible but does not guarantee how GitHub distributes jobs.

```bash
gh workflow run promotion-quality-gate.yml --ref "$CANDIDATE_BRANCH"
gh run list --workflow=promotion-quality-gate.yml -L1 --json databaseId,status,headSha
# After the run completes, save its evidence locally if no PR was open at dispatch time.
RUN_ID=123 # replace with the completed run's databaseId
PR_NUMBER=456 # replace with the associated open PR number
GITHUB_TOKEN="$(gh auth token)" GITHUB_REPOSITORY=Sieitzz/dgfy-platform \
  node scripts/post-quality-suite-evidence.js --run-id "$RUN_ID" --pr "$PR_NUMBER" --candidate "$CANDIDATE_ID"
```

Omit `--pr "$PR_NUMBER"` to let the script find the open PR for the dispatched branch. The workflow
reporter posts automatically when that PR exists at dispatch time.

The reporter posts each job's real conclusion to the associated PR with the checked SHA and a
current/stale indication. The optional `quality_check` manifest entry also binds the result to that
SHA. Compare it with the active candidate SHA; any candidate change makes the record stale. A run
at the same SHA is reusable across the later promotion leg, so do not rerun it solely because the
promotion branch changed. Failure, cancellation, and no run do not affect merge eligibility.

`pr-checks.yml` build checks, merge safety, compliance preflight, the production tenant-schema
report, the release head-cut rule, and never-`--squash` remain mandatory.

## #1007-gated exception: direct `develop` → `main`

**Ran `gate:release:local` locally at any point earlier in this session? `git status` before
cutting any branch below.** The documented Docker invocation now copies the repo into a disposable
scratch directory before running (#1358), but that protection only covers a session that follows
the current doc exactly — a stale terminal, a command pasted from shell history before the fix
landed, or a gate run directly on a host with node/MySQL/Redis already configured (no Docker, no
scratch copy involved) can all still leave an unintended `node_modules`/lockfile diff sitting in
the working tree. `git switch -c` carries a dirty tree's uncommitted changes into the new branch —
an unnoticed diff here rides straight onto `release/$LABEL` (or `to-staging/$LABEL`). A clean
`git status` (or `git checkout -- <file>` on anything unexpected) before the branch cut is the
cheap backstop that catches it regardless of cause.

Pre-flight, then confirm the compliance sweep is clear against the target SHA — the one real
precondition here, since no `NOT-EXECUTED-*` declaration may reach `main` (full detail:
`../SKILL.md`'s "Pre-`main` gates" section, "Ordering" note, #1359). `release/<label>` is cut
directly from `origin/develop` in this flow:

```bash
TARGET_REF=origin/develop
```

— then run the "Compliance preflight — pinned target-ref scan" procedure above, same as the default
flow's staging-leg cut below, since both cut their next branch from the identical ref. **Do not use
a `develop..main` diff to find outstanding declarations** (the shape this section used before PR
#1672 review, RF-1) — it misses a declaration already reconciled on both branches, exactly the blind
spot the shared procedure's own explanation names.

Once that's clear, cut `release/<label>` and open its PR into `main` right away — **do not wait on
the production tenant-schema report first.** It has no dependency on the compliance sweep or on the
branch cut/PR-open step below: start it **concurrently** with it (a backgrounded command, a second
terminal — whatever fits), not serially before it. (Historical note: this section used to also name
`gate:release:local` here — it was caught live on the 2026-09-01/02 promotion, #1359, running to
completion before the branch was even cut. Since 2026-09-03, #1431 Phase C/D, `gate:release:local`
is no longer part of this procedure at all — see `../SKILL.md`'s own note.)

```bash
git ls-remote --exit-code --heads origin main || echo "MISSING — restore before proceeding"

CANDIDATE_ID=$(date +%Y-%m-%d)-01
# candidate_source_sha (ADR 0081 Decision 8, #1588): this path never cuts to-staging/<candidate_id>
# and so never produces a candidate manifest -- there is nothing for scripts/check-image-version-
# parity.js's --manifest mode to point at. Its own --source-sha mode (RF-2, PR #1590 review) exists
# for exactly this: the develop SHA release/<label> is about to be cut from IS this path's whole
# candidate source identity, no manifest object needed.
# $TARGET_SHA (RF-10, PR #1672 review) is that exact SHA -- the same commit the compliance scan
# above already confirmed clear. Deliberately not a fresh `git fetch origin` + `git rev-parse
# origin/develop` here: re-reading the ref after the scan would reopen the exact gap the pinned scan
# exists to close, if develop advanced in the interim.
CANDIDATE_SOURCE_SHA="$TARGET_SHA"
git switch -c release/$CANDIDATE_ID "$TARGET_SHA"
git push -u origin release/$CANDIDATE_ID

gh pr create \
  --base main \
  --head release/$CANDIDATE_ID \
  --title "chore: promote candidate $CANDIDATE_ID to main" \
  --body "## Summary

Promotes \`develop\` to \`main\` at $(git rev-parse --short "$TARGET_SHA").

## Testing Evidence

Optional promotion quality suite: <not run | result, run URL, and exact SHA>. This suite is
operator-selected evidence and does not gate promotion. Tenant-schema sync checked against
production: <result>.
Aggregate promotion — see \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the compliance exemption."

# Merging this PR is Pat's action, always — see ../SKILL.md's checkpoint table.
```

Run this alongside (or immediately after) the branch cut/PR open above — not before it:

```bash
gh workflow run tenant-schema-report.yml -f environment=PROD
# poll:
gh run list --workflow=tenant-schema-report.yml -L1 --json databaseId,status
gh run view <id> --json conclusion   # expect "success" and failed_tenant_count: 0 in the step summary
```

**Only the merge into `main` waits on the mandatory controls** — the compliance sweep (already
confirmed clear above), the tenant-schema report, and the ordinary PR checks. The optional quality
suite does not gate the merge, even when it reports advisory failures.

## Default: `develop` → `staging` → `main`

This is the default soak leg again since #1404 (2026-09-02) — see `../SKILL.md`'s "The flow"
section.

**Do NOT run `npm run gate:release:local` on this leg.** It is reserved for the `develop → main`
(and `staging → main`) leg only — see the "#1007-gated exception" section above, where it's the
first thing run.
The promotion quality suite has no automatic PR trigger. The operator may run it against the frozen
develop candidate before cutting the branch, then reuse that evidence on `staging → main` if the
candidate SHA is unchanged. Running it is optional; the ordinary `pr-checks.yml` build checks and
the compliance-preflight step below remain in force.

```bash
git fetch origin
git ls-remote --exit-code --heads origin staging || echo "MISSING — restore before proceeding"

CANDIDATE_ID=$(date +%Y-%m-%d)-01
```

**Pre-cut divergence check (#1696)** — run before anything else in this leg, including the floor
step below:

```bash
node scripts/check-promotion-divergence.js --base origin/staging --head origin/develop
```

`pass`/`warn` → proceed. `fail` (a real conflict) is a hard stop — resolve it (finish an
outstanding backport, or hand-resolve on the promotion branch itself) before cutting
`to-staging/$CANDIDATE_ID`. After the candidate merges into `staging` (whether Check A above was
clean or a conflict had to be hand-resolved first), run the pre-existing merge-hygiene checker as
the post-resolution safety net:

```bash
npm run check:merge-hygiene -- \
  --base <merge-base of origin/develop and origin/staging before the cut> \
  --head <the to-staging/$CANDIDATE_ID merge commit SHA, once merged> \
  --target origin/staging \
  --report .tmp/release-gates/$CANDIDATE_ID/merge_hygiene_report.json
```

**Pre-cut floor step (ADR 0081 Decision 6, #1588)** — run before cutting the branch, not after.
Shipping to staging is, by definition, at least a minor change per app that actually changed:

```bash
node scripts/check-app-version-bump.js --floor --base origin/staging --head origin/develop
```

**Scoped to changed apps only (#1740, fixed 2026-09-07)** — the report evaluates the floor exclusively
for apps whose files changed between the two refs (direct `apps/<app>/` changes, or a changed
`file:`-dependency package the app lists), the same `detectChangedApps()` scope `check:app-versions`
itself uses at PR time. An app with no changes prints in an informational "Apps skipped (unchanged —
no floor obligation)" line and is never treated as below floor. Cross-check the reported scope against
the raw diff if anything looks off:

```bash
git diff --name-only origin/staging...origin/develop | cut -d/ -f1-2 | sort -u
```

Exit 0 (`All changed apps are at or above the minor floor.`) → proceed straight to the branch cut
below — this includes the legitimate case where **zero** apps changed and there is nothing to bump;
the "Release note" step right below still runs (its own "note-only branch/PR if no app was below
floor" path already covers this). A non-zero exit lists every in-scope app below floor with its
current (head) version and the minimum acceptable one (`X.(Y+1).0`) — open and merge one ordinary
`develop`-base PR for the bump before cutting anything, per `implement`'s own workflow (this is not a
promotion-branch PR, no new merge authority needed, `pr-reviewer`'s existing unattended-merge policy
on `develop` already covers it). **Only bump the apps the floor check actually listed** — do not bump
every app "to be safe"; that recreates the exact spurious-version-bump waste #1740 fixed.
**Same clean-tree safeguard as the branch cuts elsewhere in this runbook (RF-4, PR #1590 review):**
`git switch -c` carries a dirty working tree's uncommitted changes onto the new branch just as
readily here as it does for `to-staging/<candidate_id>`/`release/<label>` — a clean `git status`
before this cut is the same cheap backstop the `#1007-gated exception` section above already asks
for on those:

```bash
git status   # confirm clean before cutting -- an unnoticed diff here rides straight onto the bump PR
git switch -c chore/release/bump-$CANDIDATE_ID origin/develop
# bump apps/<app>/package.json's "version" to X.(Y+1).0 for every app the floor check listed
git add apps/*/package.json
git commit -m "chore(release): bump <apps> to X.(Y+1).0 for candidate $CANDIDATE_ID"
git push -u origin chore/release/bump-$CANDIDATE_ID
gh pr create --base develop --head chore/release/bump-$CANDIDATE_ID \
  --title "chore(release): bump <apps> to X.(Y+1).0 for candidate $CANDIDATE_ID" \
  --body "## Summary

Raises the per-app version floor ahead of cutting to-staging/$CANDIDATE_ID (ADR 0081 Decision 6).

## Testing Evidence

\`node scripts/check-app-version-bump.js --floor --base origin/staging --head origin/develop\` re-run
against this branch's HEAD reports every listed app at or above floor."
# wait on pr-checks.yml, then:
gh pr merge <N> --merge   # never --squash
git fetch origin develop
# re-run the floor check against the now-bumped origin/develop before proceeding:
node scripts/check-app-version-bump.js --floor --base origin/staging --head origin/develop
```

**Release note (#1278, ADR 0082)** — authored in the same bump branch/PR above (or its own
note-only branch/PR if no app was below floor), before the candidate branch is cut. Reuse
`docs/releases/notes/TEMPLATE.md`'s shape; fill the version table from each app's bumped
`package.json`. `production_commit` gets the literal sentinel `pending` — an exact, checkable
string, not a bracketed placeholder — since the real `main` merge-commit SHA does not exist yet at
this point (ADR 0082 Decisions 4/8's two-stage lifecycle: `pending` is valid and expected all the
way through the `release/<candidate_id> → main` PR itself). "Publish the GitHub Release" below
finalizes it to the real 40-hex SHA post-deploy:

```bash
git status   # same clean-tree backstop as every other cut in this runbook
git switch -c chore/release/bump-$CANDIDATE_ID origin/develop   # or reuse the bump branch above
mkdir -p docs/releases/notes
cat > docs/releases/notes/$CANDIDATE_ID.md <<NOTE
---
schema: sku-release-note/v1
candidate_id: $CANDIDATE_ID
production_date: $(date +%Y-%m-%d)
production_commit: pending
---

# Release $CANDIDATE_ID — $(date +%Y-%m-%d)

| App | Version |
|---|---|
| dgfy-api | <version> |
| dgfy-migration-runner | <version> |
| dgfy-ims | <version> |
| dgfy-pos | <version> |
| dgfy-storefront | <version> |

## Included

- <one plain-language line per user- or operator-visible change, citing its source PR/issue>

## Operational notes

None.
NOTE
git add docs/releases/notes/$CANDIDATE_ID.md
git commit -m "docs(release): add release note for candidate $CANDIDATE_ID"
git push
# fold into the bump PR above if one exists, or open its own PR into develop if not --
# either way the note must be committed before to-staging/$CANDIDATE_ID is cut.
```

**Compliance preflight — execute and resolve, before the cut (#1648, 2026-09-06).** The real
precondition, same reasoning as the "#1007-gated exception" section's own compliance check above but
now run here too, earlier, since this leg previously ran nothing at all here — see `../SKILL.md`'s
"Frozen candidate and repair loop" section for the full rationale
(#1387/#1419/#1430/#1505/#1544/#1574/#1618):

```bash
TARGET_REF=origin/develop
```

— then run the "Compliance preflight — pinned target-ref scan" procedure at the top of this file.
`origin/develop` is the exact ref `to-staging/$CANDIDATE_ID` is about to be cut from — not a scan of
whatever the current working directory happens to have checked out (the gap PR #1672's review, RF-2,
found in this section's previous version: an unpinned `git ls-files` scan that never refreshed after
a reconciliation merge). Only cut `to-staging/$CANDIDATE_ID` once that procedure reports both checks
clear.

Only once that reports clean does the candidate branch get cut — from `$TARGET_SHA`, the exact
(possibly just-bumped) `origin/develop` commit the scan already confirmed clear, not a freshly
re-read `origin/develop` (RF-10, PR #1672 review — the same pinned-SHA fix applied at every call
site in this file, not only the one the finding cited directly):

```bash
git switch -c to-staging/$CANDIDATE_ID "$TARGET_SHA"
git push -u origin to-staging/$CANDIDATE_ID
CANDIDATE_SHA="$TARGET_SHA"
```

**Candidate manifest (ADR 0081 Decision 8, #1588; v3 versionless-DEV shape since #2071)** — promotion is based on the frozen `develop` SHA and builds directly on STAGING. DEV is a shared experimental target and is never read or required here. The manifest records the initial changed-app set, staging repairs, and (at release-cut time) each touched app's revisioned STAGING artifact. Written locally, never committed; pass its path to every candidate/parity/observation check below.

**Determine candidate apps and prepare floors at promotion start.** Run the existing minor-floor check against the pinned candidate source before cutting the `to-staging` branch; only affected apps advance their package floor. Build the candidate's initial `apps_touched` inventory from both (a) apps changed between `staging` and the frozen `develop` SHA and (b) apps still owed from an earlier partial PROD release. Carry-forward apps must remain listed even when their source files are unchanged between `staging` and `develop`; they receive no extra floor bump unless the floor check independently requires one. Deploy jobs must select the union and build from `$CANDIDATE_SHA` on STAGING. No DEV dispatch, DEV tag inspection, or DEV artifact selection is part of promotion. Allocate the immutable per-app `rN` only when building the release artifact; the allocator scans STAGING/PROD revision tags.

**Carry forward apps omitted by an earlier PROD dispatch.** Compare every prior candidate's full `apps_touched` inventory with its production dispatch inputs and completed per-app jobs. Any touched app omitted from the dispatch or not successfully published/deployed remains outstanding. Keep that inventory in the linked release issue and do not close it. At the next normal promotion, include those apps in the new candidate's initial `apps_touched`, build their STAGING artifacts from the new frozen candidate SHA, and record their per-app revision, source SHA, and digest alongside the apps changed for that release. The candidate completeness validator then requires all of them in `release_revision.apps`. A single later PROD dispatch can ship the carry-forward apps together with the new release's other apps; do not create an app-only production dispatch for this recovery. For the 2026-10-03 candidate `2026-10-03-01`, the pending apps are `dgfy-ims`, `dgfy-pos`, and `dgfy-opis` (issue #2227; PROD run #37100411642).

**Retrying a partial or failed PROD dispatch (same candidate, same day).** This is distinct from “Carry forward” above, which defers an outstanding app to the next promotion cycle. For an immediate retry of the same candidate after a transient failure, run `node scripts/plan-prod-retry-build-flags.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json --run-id <prior-run-id>` before dispatching again. Review the candidate scope and paste the script's recommended `-f build_*=...` flags verbatim; do not hand-pick checkboxes from memory. The script is informational and local-only: it cannot see live CI runner or registry state. Once the retry starts, also read `deploy-main.yml`'s pre-dispatch summary and warning annotations. For cache-layer diagnosis see `docs/ops/CI_IMAGE_AND_CACHE_STORAGE_LAYERS.md`; this procedure responds to incident #2297.

```bash
cat > .tmp/release-candidates/$CANDIDATE_ID.json <<JSON
{
  "schema": "sku-release-candidate/v3",
  "candidate_id": "$CANDIDATE_ID",
  "status": "staging_soak",
  "source_develop_sha": "$CANDIDATE_SHA",
  "current_staging_sha": "$CANDIDATE_SHA",
  "staging_head_sha": null,
  "revisions": [
    { "kind": "initial", "sha": "$CANDIDATE_SHA", "parent_sha": null, "branch": "to-staging/$CANDIDATE_ID", "pr": 1234,
      "apps_touched": ["dgfy-ims"] }
  ],
  "release_revision": null
}
JSON
node scripts/check-promotion-candidate.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json

# current_staging_sha above is exactly what the "Deploy dispatch" section's STAGING
# `gh workflow run deploy.yml` command reads back out via `-f candidate_source_sha=...`, once the
# PR below merges and that step actually runs (#1598) -- nothing to do with it here, just don't
# lose track of where it comes from.

gh pr create \
  --base staging \
  --head to-staging/$CANDIDATE_ID \
  --title "chore: promote develop to staging (candidate $CANDIDATE_ID)" \
  --body "## Summary

Promotes \`develop\` to \`staging\` at $(git rev-parse --short "$TARGET_SHA") — the default soak leg
before promoting to \`main\`.

## Testing Evidence

Aggregate promotion — every bundled change was validated on its own originating PR into \`develop\`.
See \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the promotion-PR compliance exemption this relies on."

# Wait on pr-checks.yml, then:
gh pr merge <N> --merge   # never --squash — see SKILL.md
```

Immediately after the staging PR merges, refresh `origin/staging` and record its actual head in
the local candidate manifest as `staging_head_sha`. This is deliberately separate from
`current_staging_sha`: the latter is the frozen candidate source identity used for image
provenance, while the former is the Git SHA from which the release branch is physically cut.
GitHub may fast-forward a `--merge` PR when the target is already an ancestor, so these values
are not guaranteed to match.

Then cut `release/<candidate_id>` from `origin/staging` instead of `origin/develop`: set
`TARGET_REF` accordingly and run the identical commands from the "#1007-gated exception" section
above. After the RF-10 (PR #1672 review) fix, those commands already read `$TARGET_SHA` rather than a
literal `origin/develop` — there is no text left in them to substitute; only the `TARGET_REF`
assignment below actually differs between the two call sites. This includes the compliance-preflight
pinned-target-ref scan:

```bash
TARGET_REF=origin/staging
```

— deliberately, not a copy-paste of the whole section with a different ref name: `origin/staging` is
what `release/<label>` is actually cut from on this leg, and the frozen-candidate rule means
`origin/develop` may have moved on to unrelated work this candidate never absorbed. If the scan
finds something outstanding here, **stop rather than dispatching the sweep** — see the "Compliance
preflight — pinned target-ref scan" section's own `origin/staging` case above for why, and
`../SKILL.md`'s "Compliance preflight sweep" section for what to do instead.

## Routine pre-cut refresh and post-cut successor candidates (#2266, Phase 474; #2381, Phase 486)

During an active staging soak, a later pinned `develop` SHA may advance `staging` through a routine
refresh under the same candidate ID. No explicit delayed-production request is required; record a
concise reason. This path ends at the release cut: cutting `release/<candidate_id>` from the
qualified current `origin/staging` SHA freezes the production selection. Never refresh or retarget
that candidate after the cut.

Before any refresh, reconcile every `fix/staging/*` repair into `develop` through a reviewed
backport PR, or verify equivalent content is already present. Otherwise the refresh can revert the
repair. A divergence or merge-hygiene signal is a hard stop until reconciled. Incoming develop work
and staging defect repair are distinct paths: refresh branches start from pinned `develop`; repair
branches start from current `origin/staging` and carry only the narrow repair. Release-only repairs
stay on the frozen release branch and are not folded into a refresh.

For a pre-cut refresh, preserve the original `promotion_base_sha` and one candidate note; extend its
cumulative included scope and candidate history. Pin the reconciled develop SHA after compliance
reconciliation. Run:

```sh
node scripts/check-promotion-divergence.js --base origin/staging --head <pinned-develop-sha>
node scripts/check-app-version-bump.js --floor --candidate-id <candidate_id> --base origin/staging --head <pinned-develop-sha>
```

The version gate reads the same candidate note at STAGING and develop, verifies the baseline SHA,
and checks both the original minor-floor obligation and non-regression from current staging. A
refresh branch suffix alone has no effect. Cut `to-staging/<candidate_id>-refresh-<seq>` from the
pinned SHA and merge under ordinary review controls. Record its incoming develop SHA, actual staging
result SHA, physical base SHA, parent candidate SHA, PR, reason, and `apps_touched` in the candidate
manifest. Record the same initial source/result/base SHA lineage for the initial promotion, adding
optional `base_staging_sha` to its initial revision for compatibility with existing v4 manifests.
The refresh sequence is independent of staging repair sequences and artifact `rN` values.

Set `refresh_in_progress` with no release selection before the refresh begins. Build changed
apps with fresh per-app immutable STAGING revisions and record artifacts only for apps selected by
the content-equivalence build plan; preserve untouched apps' prior artifacts and per-app source-SHA
lineage. If no app inputs changed, record `apps_touched: []` and `artifacts: []` together, and put
the skipped-build-plan evidence link in the manifest `reason`. The refreshed artifact origin is
`staging_refresh` and parity requires the ordinary STAGING predecessor for any app rebuilt. Once
merge and builds succeed, clear the active refresh marker, set status to `staging_soak`, and repeat
observation and required qualification at the actual staging SHA even when no app was rebuilt. Store
a passing `staging_observation` record with the exact SHA, run ID or URL, observation time, and result
before cutting a new release. The v4 validator keeps this field optional for older in-flight
manifests, but it must be present and match `release_revision.source_staging_sha` for every new cut.
Archived observation, parity, or optional quality-suite evidence cannot qualify the refreshed SHA. A
failed refresh remains unqualified and cannot silently restore the archived selection.

After a release cut, staging can advance under a successor candidate with a new `YYYY-MM-DD-NN` ID,
its own manifest and release note, and a `predecessor_candidate_id` link. Do not cut the successor's
release branch until the predecessor release PR is merged to `main` or explicitly withdrawn and
archived. A withdrawn release stays bound to its original candidate record; the successor gets a new
ID. The successor's floor is checked against then-current `origin/staging`, so an app already
bumped by predecessor content needs the next minor floor if changed again. Its note's `## Included`
section lists its own scope and explicitly identifies any predecessor scope carried into it.

Each refresh allocates fresh per-app immutable `rN` artifacts. Never overwrite published tags or
reuse archived artifacts for different contents. Successor candidates have their own artifact
lineage. If the release already merged to `main`, it cannot be withdrawn or refreshed; use the
post-release procedure.

Legacy v1-v3 candidates need a reviewed, evidence-backed `promotion_base_sha` note amendment and
backport before conversion to v4. Missing evidence is a hard stop. The production tenant-schema
report, compliance preflight, merge safety, no-squash, immutable-tag checks, and explicit production
authorization stay mandatory.

## Candidate repair after the staging merge

After the `to-staging/<candidate_id>` PR merges, the candidate may receive routine pre-cut refreshes
from pinned `develop` while no release branch exists. Do not use that path to pick up a staging
defect; for a code-level staging failure, create the repair branch from the current staging head:

```bash
git fetch origin staging
git switch -c fix/staging/$CANDIDATE_ID-1 origin/staging
# implement only the repair, or cherry-pick -x one reviewed isolated fix commit
git push -u origin fix/staging/$CANDIDATE_ID-1
gh pr create --base staging --head fix/staging/$CANDIDATE_ID-1 \
  --title "fix(release): repair candidate $CANDIDATE_ID (repair 1)" \
  --body "## Summary

Repairs frozen release candidate $CANDIDATE_ID at the current staging SHA.

## Testing Evidence

Conduct/staging observation evidence: <link>. Candidate manifest: <path or link>."
```

Record the repair issue and PR in the candidate manifest (`.tmp/release-candidates/$CANDIDATE_ID.json`
— append a `staging_repair` entry to `revisions`, with `parent_sha` pointing at the previous
candidate SHA, and advance `current_staging_sha` to match; `check-promotion-candidate.js` validates
the whole chain, including this parent-pointer requirement), merge into `staging` with `--merge`,
redeploy/observe (see "Deploy dispatch" below for the per-app revision inputs this repair's
STAGING redeploy needs), and increment the repair sequence. If the repair is live DB, secrets,
SSH, or infrastructure work, stop and hand it to Pat. If a developer already made the fix on
`develop`, cherry-pick only an isolated, reviewed commit with `-x`; mixed commits must be
recreated narrowly.

**Amend the release note in this same repair PR (#1278, ADR 0082)** — edit
`docs/releases/notes/$CANDIDATE_ID.md` directly (this branch carries its own commits, unlike
`to-staging/*`/`release/*`): add one `## Included` line for the repair and update the version-table
row for whichever app(s) it touched. Never create a second `docs/releases/notes/*.md` file for the
same `$CANDIDATE_ID`.

**`apps_touched` — required on every `staging_repair` entry (ADR 0081 Decision 8 amendment, #1610).**
List exactly the apps whose `build_*` flag was `true` on this repair's STAGING redeploy below —
`dgfy-api` and `dgfy-migration-runner` always appear together (`build_api` always rebuilds them as
one paired unit), each frontend independently. Get this wrong and an app this repair didn't actually
touch will silently claim the wrong candidate identity at PROD dispatch time — that's the exact bug
#1610 was filed for. Example, a repair that only rebuilt `dgfy-ims`:

```json
{ "kind": "staging_repair", "repair_seq": 1, "sha": "<sha>", "parent_sha": "<prev-sha>",
  "branch": "fix/staging/$CANDIDATE_ID-1", "pr": 1234, "issue": 1233,
  "apps_touched": ["dgfy-ims"] }
```

`repair_seq` is a cosmetic ordinal only — branch-naming and ordering, never an artifact
identity (the bare `-<seq>`, no `r` prefix, is deliberate: per-app artifact revisions are
`rN` everywhere, and reusing the prefix would conflate the two again). The manifest never
stores a repair's allocated artifact revision; GHCR is the source of truth for that (read
back at release-cut time, below).

`check-promotion-candidate.js` now rejects a `staging_repair` revision missing `apps_touched`
entirely, so this isn't optional — validate right after editing:

```bash
node scripts/check-promotion-candidate.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json
```

When observation passes, cut the release from the latest staging head:

```bash
git switch -c release/$CANDIDATE_ID origin/staging
git push -u origin release/$CANDIDATE_ID
```

Set `release_revision.source_staging_sha` to the recorded `staging_head_sha` (the exact SHA from
which the release branch was cut). Then populate the manifest's per-app `release_revision.apps`
map from GHCR — each app in the union of `apps_touched` across the initial promotion and all
STAGING repairs must have its latest allocated revision recorded, read off that app's STAGING
revision tag (the registry is the source of truth, not the manifest). An app that was never listed
as touched may remain absent; do not omit a touched app because its revision input was not selected
or its artifact was not found. Resolve/build that app on STAGING first, then record its artifact.
For each touched app:

```bash
APP=dgfy-pos; N=<allocated-rN-for-this-app>; FLOOR="$(node -p "require('./apps/${APP}/package.json').version")"
STAGING_TAG="$(node scripts/resolve-release-tags.js --app "$APP" --version "$FLOOR" --environment STAGING --revision "$N" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).stagingTag")"
node -e "
const { execFileSync } = require('node:child_process');
const { inspectImageLabel, inspectImageDigest, CANDIDATE_SOURCE_LABEL } = require('./scripts/check-image-version-parity');
const ref = process.argv[1];
const inspectFn = (r) => { try { return { status: 0, stdout: execFileSync('docker', ['buildx', 'imagetools', 'inspect', r, '--format', '{{json .}}'], { encoding: 'utf8' }), stderr: '' }; } catch (e) { return { status: 1, stdout: '', stderr: String((e && e.message) || e) }; } };
const [image, tag] = ref.split(/:(?=[^:]+$)/);
const sha = inspectImageLabel({ image, tag, labelKey: CANDIDATE_SOURCE_LABEL, inspectFn });
const dig = inspectImageDigest({ image, tag, inspectFn });
if (sha.state !== 'ok') throw new Error('candidate-source label unreadable on ' + ref + ': ' + sha.state);
if (dig.state !== 'ok') throw new Error('digest unreadable on ' + ref + ': ' + dig.state);
console.log(JSON.stringify({ revision: Number(process.argv[2]), source_sha: sha.value, digest: dig.digest }));
" "ghcr.io/sieitzz/${APP}:${STAGING_TAG}" "$N"
# Record as: "dgfy-pos": { "revision": N, "source_sha": "<printed>", "digest": "<printed>",
#   "origin": "promotion" | "staging_repair" } -- "promotion" when the artifact was built
#   from the frozen develop source at promotion start, "staging_repair" after repair.
```

Update the manifest's `release_revision` field (`source_staging_sha`, `branch` =
`release/$CANDIDATE_ID`, `pr`, `apps`) before validating and building release evidence:

```bash
node scripts/check-promotion-candidate.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json
```

For v3, this validation fails with `MISSING_TOUCHED_RELEASE_APP` and lists any candidate app
missing from `release_revision.apps`. Do not qualify the candidate or dispatch production until
every app in that inventory has a recorded STAGING artifact and validation passes.

Include `--candidate-manifest .tmp/release-candidates/$CANDIDATE_ID.json` when building release
evidence.

## Release-only repair after staging qualification

Once the candidate passed staging observation and `release/$CANDIDATE_ID` exists, a pre-main CI or
quality-gate failure is repaired on that existing release branch. Keep the promotion PR open so
its required checks rerun against the updated release head. Do not recut the release branch, merge
the repair into `staging`, dispatch a STAGING deployment, or repeat staging observation.

Open one reviewed repair PR per repair sequence, based on the current release head and targeting
that same release branch:

```bash
REPAIR_SEQ=1
REPAIR_BRANCH="fix/release/$CANDIDATE_ID-$REPAIR_SEQ"
REPAIR_ISSUE=2344 # replace with the PM-created repair issue number
git fetch origin "release/$CANDIDATE_ID"
git switch -c "$REPAIR_BRANCH" "origin/release/$CANDIDATE_ID"
# implement only the pre-main repair
git push -u origin "$REPAIR_BRANCH"
BODY_FILE="$(mktemp)"
cat > "$BODY_FILE" <<EOF
## Summary

Repairs frozen release candidate $CANDIDATE_ID after staging qualification.
Refs #$REPAIR_ISSUE

## Testing Evidence

Pre-main failure evidence: <link>. Candidate manifest: .tmp/release-candidates/$CANDIDATE_ID.json.
EOF
gh pr create --base "release/$CANDIDATE_ID" --head "$REPAIR_BRANCH" \
  --title "fix(release): repair candidate $CANDIDATE_ID (repair $REPAIR_SEQ)" \
  --body-file "$BODY_FILE"
```

The repair PR follows ordinary per-file compliance validation (there is no promotion-bundle
exemption for a `release/<candidate_id>` base). Merge it with a merge commit after review and green
checks, with `mergeStateStatus: CLEAN`; never use `--squash`. `AGENTS.md`'s Merge Safety hard stop
still applies.

After the repair PR merges, fetch the updated release ref and record its exact head in the candidate
manifest:

```bash
git fetch origin "release/$CANDIDATE_ID"
RELEASE_REPAIR_SHA="$(git rev-parse "origin/release/$CANDIDATE_ID")"
```

Append one
`release_revision.repairs` entry per merged repair; `sha` is the resulting `origin/release/$CANDIDATE_ID`
head and `parent_sha` is the release head immediately before that repair. `apps_touched` lists
exactly the deployable apps selected for the repair (API and migration-runner together):

```json
{
  "repair_seq": 1,
  "sha": "<new release branch head>",
  "parent_sha": "<previous release branch head>",
  "branch": "fix/release/$CANDIDATE_ID-1",
  "pr": 2345,
  "issue": 2344,
  "apps_touched": ["dgfy-ims"]
}
```

Advance `release_revision.apps[app].source_sha` to the latest release repair SHA for each touched
app and set its `origin` to `release_repair`. Allocate a fresh per-app artifact revision for every
app the repair rebuilds. The existing revision tag may already belong to the original STAGING
artifact, and Decision 7 forbids overwriting it. Authenticate Docker to GHCR first, then allocate
against the release-repair SHA (API and migration-runner are allocated independently):

```bash
APP=dgfy-ims # repeat for each app in apps_touched; allocate API and runner separately
FLOOR="$(git show "$RELEASE_REPAIR_SHA:apps/$APP/package.json" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).version")"
REVISION="$(node scripts/allocate-artifact-revision.js \
  --image "ghcr.io/sieitzz/$APP" --floor "$FLOOR" --revision "$RELEASE_REPAIR_SHA" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).revision")"
```

Store that new numeric revision in `release_revision.apps[app].revision`, along with the exact
repair SHA and `release_repair` origin. The new revision tag is absent, so `deploy-main.yml`'s
existing build-skip planner selects BUILD; no workflow change is needed. Preserve the original
STAGING `digest` as staging provenance; it is not a digest claim for the release-only repair. For
this origin, the parity gate
does not require a STAGING predecessor or compare that old digest with PROD. It verifies the PROD
source label against the resolved release repair SHA, reads the PROD digest, and requires the bare
PROD alias to resolve to that same digest. Floor and revision labels remain mandatory.

Amend `docs/releases/notes/$CANDIDATE_ID.md` in the same repair PR: add an `## Included` line and
update the touched app's version-table row. Do not create another note for this candidate. Validate
the edited manifest before continuing:

```bash
node scripts/check-promotion-candidate.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json
```

The existing `release/$CANDIDATE_ID` promotion PR then reruns its required checks. Proceed through
the existing production tenant-schema report, Merge Safety, and no-`--squash` controls. The final
release head is not reported as having passed staging; evidence keeps the staging-qualified SHA and
every release-only repair SHA as separate identities.

After the promotion is merged and production is stable, backport every release-only repair to
`develop` through an ordinary PR. Hand off to `pm` for a fresh issue, cherry-pick each repair with
`git cherry-pick -x` onto a branch cut from fresh `origin/develop`, and open the PR into `develop`.
Do not create a separate `staging` backport: these repairs never land on `staging`, so the #1696
backport rule for commits that land there does not apply. This obligation is timed after production
stability, like the main-hotfix backport.

After a main deploy failure, use the incident/hotfix procedure on `main`, then backport the resolved
main commit to `develop` after stabilization. No separate staging backport is needed because the
next ordinary candidate starts from `develop`.

## Expedited override (#1007) — only on Pat's explicit real-time phrase

Skips the compliance preflight sweep. Never skips the tenant-schema report, `AGENTS.md` Merge
Safety, never-`--squash`, or the `release/` head-cut rule. Full definition:
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment (see its 2026-09-03 #1431 Phase C/D
entry for why `gate:release:local` no longer appears in the skippable list — there is nothing local
left to skip); checkpoint-table row in `../SKILL.md`.

```bash
# Still mandatory even under the override:
gh workflow run tenant-schema-report.yml -f environment=PROD
gh run view <id> --json conclusion   # must be "success" and failed_tenant_count: 0 before merging

# Log the authorization BEFORE merging, not after:
gh pr comment <N> --body "## #1007 expedited promotion override

Authorized by Pat, $(date -u +%Y-%m-%dT%H:%M:%SZ). Phrase given: \"<verbatim phrase>\".
Skipped: compliance preflight sweep. Not skipped: production
tenant-schema report (run <id>, conclusion success), AGENTS.md Merge Safety, never-squash,
release/ head-cut rule."

gh pr merge <N> --merge   # never --squash
```

Retro-verification afterward, same run — not a separate follow-up:

```bash
# If staging is now stale relative to main, note it rather than silently leaving it:
git fetch origin
git rev-list --count origin/staging..origin/main
```

## Deploy dispatch, after either leg merges

**STAGING dispatch — default flow only.** The #1007-gated exception never reaches this block at all
(it has no staging leg) — skip straight to "PROD dispatch" below if that's the flow in progress.

```bash
# STAGING — unattended, per ../SKILL.md's checkpoint table. DEV dispatch is not a routine
# step of this flow (#982). Promotion builds the frozen develop source directly on STAGING;
# there is no DEV artifact or DEV-host prerequisite. A manual DEV dispatch from develop or an
# experimental branch updates the shared mutable `dev` tag plus that commit's SHA tag.
# (#1050, 2026-08-25: the old single-select `components` input is gone; the
# four build_* booleans below all default true, so omitting them builds/pushes
# everything, same as the old components=all)
#
# candidate_source_sha (ADR 0081 Decision 8, #1588; cross-referenced #1598): read
# current_staging_sha straight from the candidate manifest written above in this file's "Default:
# develop -> staging -> main" section, immediately after the branch cut -- rather than retyping the
# SHA. Sets the SAME variable name the #1007-gated exception section captures for its own flow
# (from origin/develop directly, no manifest) -- the PROD dispatch below reuses whichever one the
# promoter's actual flow set, without re-deriving it.
CANDIDATE_SOURCE_SHA=$(node -p "require('./.tmp/release-candidates/$CANDIDATE_ID.json').current_staging_sha")
# Per-app artifact revisions (#2071): allocate immutable STAGING/PROD rN identities from
# promotion-channel tags; the sequence excludes DEV. For initial STAGING, allocate each app
# built from the frozen develop SHA. For a staging repair, allocate only rebuilt apps:
#   node scripts/allocate-artifact-revision.js --image ghcr.io/sieitzz/<app> \
#     --floor "$(node -p "require('./apps/<app>/package.json').version")" --revision <repair-sha>
# (Same-source retry reuses its own N -- idempotent, not a new allocation. Docker login is required
# to inspect GHCR revision tags -- on an auth/403 error from `allocate-artifact-revision.js` or
# `promote-image-alias.js`, run `gh auth refresh -h github.com -s read:packages` once, then retry.)
REV_API=<rN-for-dgfy-api>
REV_MIGRATION_RUNNER=<independent-rN-for-dgfy-migration-runner>
REV_IMS=<rN-for-dgfy-ims>
REV_POS=<rN-for-dgfy-pos>
REV_STOREFRONT=<rN-for-dgfy-storefront>
REV_OPIS=<rN-for-dgfy-opis>
gh workflow run deploy.yml -f deploy=true -f candidate_source_sha="$CANDIDATE_SOURCE_SHA" \
  -f release_revision_api="$REV_API" -f release_revision_migration_runner="$REV_MIGRATION_RUNNER" \
  -f release_revision_frontend_ims="$REV_IMS" \
  -f release_revision_frontend_pos="$REV_POS" -f release_revision_frontend_storefront="$REV_STOREFRONT" \
  -f release_revision_frontend_opis="$REV_OPIS" \
  --ref staging
```

Frontends publish `X.Y.Z-rN-staging` on this dispatch (baked `VITE_*` differ per environment),
each under its OWN allocated `rN`; `dgfy-api` and `dgfy-migration-runner` publish independent
environment-neutral `X.Y.Z-rN` tags (each digest promotes to PROD later -- neither is rebuilt
environment-specific). Their revision inputs must be supplied together when the paired backend
unit is selected, but their values need not match. Builders fail closed when a selected app's
revision is missing; an ad-hoc STAGING rebuild outside a tracked candidate has no revision to
publish under and is refused.

**PROD dispatch — ask Pat first, every time, on either flow.** `deploy-main.yml` takes candidate
source identity **per app group** (ADR 0081 Decision 8 amendment, #1610) — `candidate_source_sha_api`
(covers both `dgfy-api` and `dgfy-migration-runner`, whose `apps_touched` lineage remains paired), `candidate_source_sha_frontend_ims`, `_pos`,
`_storefront`, `_opis` — not one shared value, since PROD rebuilds every app unconditionally and a single
shared value would mislabel any app a staging repair never touched.

**Neither dispatch command below needs any manual `build_*` unchecking any more (#1610, ADR 0081
Decision 7 residue).** Both canonical commands leave all five `build_*` inputs at their `default:
true` — they always have, since this runbook never documented a manual-uncheck step in the first
place. That used to mean every real PROD dispatch rebuilt all six apps regardless of what actually
changed, and a retry after one app's Decision 7 refusal re-tripped the same guard for every app that
had already succeeded. `deploy-main.yml` now resolves a per-app build-skip verdict automatically (a
new `resolve-build-plan` job, ahead of the six build jobs) — an app whose version tag is already
published and whose tracked build inputs are content-unchanged is skipped without any dispatch input
needing to change. Nothing below needs editing for this; it's automatic and safe. Full mechanism:
`scripts/resolve-build-skip-plan.js`'s own header comment, ADR 0081's 2026-09-05 Amendment.

**Default flow** (candidate manifest exists): resolve each app's own value via
`resolveCandidateSourceShaByApp()` rather than reusing `$CANDIDATE_SOURCE_SHA` uniformly.
Per-app revisions come from the manifest's `release_revision.apps` map (populated at
release-cut time, above) — one value per group, never a shared rN:

```bash
eval "$(node -e "
const { resolveCandidateSourceShaByApp } = require('./scripts/check-promotion-candidate');
const manifest = require('./.tmp/release-candidates/$CANDIDATE_ID.json');
const byApp = resolveCandidateSourceShaByApp(manifest);
console.log('CANDIDATE_SOURCE_SHA_API=' + byApp['dgfy-api']);
console.log('CANDIDATE_SOURCE_SHA_IMS=' + byApp['dgfy-ims']);
console.log('CANDIDATE_SOURCE_SHA_POS=' + byApp['dgfy-pos']);
console.log('CANDIDATE_SOURCE_SHA_STOREFRONT=' + byApp['dgfy-storefront']);
console.log('CANDIDATE_SOURCE_SHA_OPIS=' + byApp['dgfy-opis']);
const apps = manifest.release_revision.apps;
const rev = (a) => (apps[a] ? apps[a].revision : '');
console.log('REV_API=' + rev('dgfy-api'));
console.log('REV_MIGRATION_RUNNER=' + rev('dgfy-migration-runner'));
console.log('REV_IMS=' + rev('dgfy-ims'));
console.log('REV_POS=' + rev('dgfy-pos'));
console.log('REV_STOREFRONT=' + rev('dgfy-storefront'));
console.log('REV_OPIS=' + rev('dgfy-opis'));
")"

gh workflow run deploy-main.yml -f deploy=true \
  -f candidate_source_sha_api="$CANDIDATE_SOURCE_SHA_API" \
  -f candidate_source_sha_frontend_ims="$CANDIDATE_SOURCE_SHA_IMS" \
  -f candidate_source_sha_frontend_pos="$CANDIDATE_SOURCE_SHA_POS" \
  -f candidate_source_sha_frontend_storefront="$CANDIDATE_SOURCE_SHA_STOREFRONT" \
  -f candidate_source_sha_frontend_opis="$CANDIDATE_SOURCE_SHA_OPIS" \
  -f release_revision_api="${REV_API:+r$REV_API}" \
  -f release_revision_migration_runner="${REV_MIGRATION_RUNNER:+r$REV_MIGRATION_RUNNER}" \
  -f release_revision_frontend_ims="${REV_IMS:+r$REV_IMS}" \
  -f release_revision_frontend_pos="${REV_POS:+r$REV_POS}" \
  -f release_revision_frontend_storefront="${REV_STOREFRONT:+r$REV_STOREFRONT}" \
  -f release_revision_frontend_opis="${REV_OPIS:+r$REV_OPIS}" \
  --ref main
```
(An app the candidate never rebuilt is absent from the map — its input stays empty and its
build is skipped by the build-skip plan, keeping its last-published artifact. `dgfy-api` and
`dgfy-migration-runner` are both present or both absent because `build_api` remains the paired
selection; when present, each entry and revision is independently validated.)

`deploy-main.yml`'s `promote-aliases` job then creates each app's bare `X.Y.Z` floor alias from
its `X.Y.Z-rN` revision-tag digest (refusing a different digest or revision) and gates `publish`
-- backend PROD is alias-only (the revision tag already exists from the STAGING dispatch above
and the build-skip plan skips rebuilding it), frontends build first with production `VITE_*`
values and alias the fresh digest. Both `promote-aliases` and `publish` list
`frontend-opis-prod` in `needs:` and fail closed when it fails or is cancelled (#2186).

**#1007-gated exception** (no manifest, no repair concept, nothing has diverged per app): the single
`$CANDIDATE_SOURCE_SHA` captured in that section (set equal to `$TARGET_SHA`, the compliance-scanned
commit `release/<label>` was actually cut from) is the correct value for all source SHA inputs.
Allocate the backend artifact revisions separately from each image's repository and floor:

```bash
gh workflow run deploy-main.yml -f deploy=true \
  -f candidate_source_sha_api="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_ims="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_pos="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_storefront="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_opis="$CANDIDATE_SOURCE_SHA" \
  -f release_revision_api="$REV_API" \
  -f release_revision_migration_runner="$REV_MIGRATION_RUNNER" \
  -f release_revision_frontend_ims="$REV_IMS" \
  -f release_revision_frontend_pos="$REV_POS" \
  -f release_revision_frontend_storefront="$REV_STOREFRONT" \
  -f release_revision_frontend_opis="$REV_OPIS" \
  --ref main
```

On the #1007 path there is no manifest, so each app-group's revision is allocated here, at
release-cut time — one `allocate-artifact-revision.js` call per touched app-group (a direct
production hotfix increments the patch and uses the same paired revision/canonical tags
without a staging predecessor — it still threads a revision here). Other untouched groups stay
empty (their builds skip, their artifacts stand); `build_api` selects both backends as shown below:

```bash
# Per touched app (example: dgfy-pos at its bumped floor):
REV_POS="$(node scripts/allocate-artifact-revision.js --image ghcr.io/sieitzz/dgfy-pos \
  --floor "$(node -p "require('./apps/dgfy-pos/package.json').version")" \
  --revision "$TARGET_SHA" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).revision")"
REV_POS="r$REV_POS"
# Backend pair (dgfy-api/dgfy-migration-runner) -- build_api always rebuilds BOTH; on this
# exception path (no staging leg) BOTH must get their own allocated revision even if only
# one app's source actually changed -- see deploy-main.yml's release_revision_migration_runner
# input description and incident-responder/SKILL.md's "build_api pairing consequence" note.
REV_API="$(node scripts/allocate-artifact-revision.js --image ghcr.io/sieitzz/dgfy-api \
  --floor "$(node -p "require('./apps/dgfy-api/package.json').version")" \
  --revision "$TARGET_SHA" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).revision")"
REV_API="r$REV_API"
REV_MIGRATION_RUNNER="$(node scripts/allocate-artifact-revision.js --image ghcr.io/sieitzz/dgfy-migration-runner \
  --floor "$(node -p "require('./apps/dgfy-migration-runner/package.json').version")" \
  --revision "$TARGET_SHA" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).revision")"
REV_MIGRATION_RUNNER="r$REV_MIGRATION_RUNNER"
# ... allocate each other selected app-group the same way, leaving unselected groups empty.
```

```bash
# Verify health after either dispatch — read-only, unattended
gh workflow run verify-deployment.yml -f environment=<DEV|STAGING|PROD> -f poll_minutes=5
gh run list --workflow=verify-deployment.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
```

A `conclusion: failure` here has no rollback to fall back on (#495 open) — report and escalate,
don't retry blindly.

**Promotion parity gate (ADR 0081 Decision 8, #1588; revision-aware since #1977, Phase 342)** —
after `deploy-main.yml` has actually built
and pushed the PROD images (only then do the `X.Y.Z-rN` revision tags and bare `X.Y.Z` aliases
exist to compare against), confirm
every changed app's PROD image traces back to the candidate it should. Frontend STAGING
`X.Y.Z-rN-staging` is compared to PROD `X.Y.Z-rN`; backend the staging `X.Y.Z-rN` digest is
reused; each bare alias must reference its revision tag's digest. Read-only (`docker buildx
imagetools inspect` only), unattended, same tier as `verify-deployment.yml`. Two invocation forms,
matching whichever flow actually ran (RF-2, PR #1590 review — the CLI itself refuses to run without
exactly one of these two flags):

```bash
# Default flow — compares PROD against its STAGING predecessor via the candidate manifest:
node scripts/check-image-version-parity.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json

# #1007-gated exception instead — no manifest exists; compares PROD's own label directly against
# the develop SHA release/<label> was cut from (the same $CANDIDATE_SOURCE_SHA captured in that
# section), plus the paired bare alias when a revision was threaded (one --revision per
# touched app is NOT supported here -- thread the single touched app's revision; a multi-app
# #1007 release verifies each app in its own --source-sha run). Pass `--apps <that-app>` on each
# run so the other six apps' expected `no-candidate-identity` state does not print as a
# false-positive `mismatch`:
node scripts/check-image-version-parity.js --source-sha "$CANDIDATE_SOURCE_SHA" --revision "$REV_POS" --apps dgfy-pos
```

`PASS` includes both a real label match and a documented "no predecessor"/"no candidate identity"
case (the #1007/hotfix path, on either invocation form) — both are fine to proceed on. A `FAIL`
(`mismatch`, `prod-unreadable`, or — default-flow only — `staging-unreadable`) means the PROD image
published for this candidate does not actually trace back to where it should, or (staging-unreadable
specifically) that STAGING's own label-stamping regressed — report and escalate either way, do not
deploy past it or dismiss it as noise.

**Per app now, not one shared value (ADR 0081 Decision 8 amendment, #1610; per-app revisions
since #2055).** `--manifest` mode resolves and compares each app against its OWN candidate
source identity (the SHA of the last revision that actually rebuilt it — see the `apps_touched`
note in "Candidate repair after the staging merge" above) AND its OWN allocated revision from
the manifest's per-app `release_revision.apps` map — not the manifest's single
`current_staging_sha`, and never one shared `rN`. An app a repair never touched is expected to
keep matching its earlier identity, not the candidate's latest one; an app absent from the
`apps` map was never rebuilt by this candidate and reports `skip/app-not-in-candidate`
(nothing new to verify — its last-published artifact stands). Each printed `[PASS]`/`[FAIL]`
line now also shows the `candidate_source_sha` and `revision` it was actually compared
against, so a genuine mismatch is legible without cross-referencing the manifest by hand.

## Publish the GitHub Release (#1278, ADR 0082)

After the parity gate above reports `PASS` — not before, and not in place of it. Finalize the
candidate's release note's `production_commit` from the literal sentinel `pending` (ADR 0082
Decisions 4/8's two-stage lifecycle — written at authoring time since the real `main` merge commit
wasn't known yet) to the real, now-known 40-hex SHA, commit that update to `develop`, then tag and
publish from the now-complete file. Unattended (see `../SKILL.md`'s checkpoint table) — this is a
post-deploy record of a deploy Pat already authorized at the PROD dispatch ask, not a new deploy
mutation.

**Hotfix candidates skip this section's finalization half.** If `$CANDIDATE_ID` was authored via
`.agents/skills/incident-responder/SKILL.md`'s hotfix procedure, its release note doesn't reach
`origin/develop` until that role's own "Back-port to develop" step merges — that step folds
finalization into itself instead, for exactly this reason. Only this section's *tag-and-publish*
half below (fetch `origin/develop`, tag, `gh release create`) still applies to a hotfix, run once
that back-port PR has merged. A normal promotion or the #1007 exception has the note on `develop`
already from pre-cut authoring, so both halves below apply as documented.

```bash
# fetch immediately before capture, and cross-check against deploy-main.yml's own reported SHA --
# an earlier `git fetch origin main` (e.g. this runbook's own pre-flight step, run well before
# Pat's manual merge and deploy-main.yml's own dispatch) would leave this stale, and a bare
# git rev-parse with no fetch at all here would silently trust whatever that stale ref says:
git fetch origin main
MAIN_SHA=$(git rev-parse origin/main)
DEPLOY_RUN_SHA=$(gh run list --workflow=deploy-main.yml --branch main -L1 --json headSha --jq '.[0].headSha')
[ "$MAIN_SHA" = "$DEPLOY_RUN_SHA" ] \
  || { echo "ERROR: freshly-fetched origin/main ($MAIN_SHA) does not match deploy-main.yml's own deployed SHA ($DEPLOY_RUN_SHA) -- do not tag/publish, investigate first" >&2; exit 1; }
```

Normal promotion or #1007 exception: continue straight into the finalization block below. **Hotfix
candidate: skip this next block** (`docs/releases/notes/$CANDIDATE_ID.md` was already finalized in
`incident-responder`'s back-port PR) — jump to "tag the deployed main commit" further down, still
using the `$MAIN_SHA` just captured above.

```bash
# finalize production_commit on develop, from pending to the real deployed SHA:
git fetch origin develop
git switch -c docs/release/$CANDIDATE_ID-commit origin/develop
sed -i.bak "s/^production_commit: pending$/production_commit: $MAIN_SHA/" docs/releases/notes/$CANDIDATE_ID.md
rm docs/releases/notes/$CANDIDATE_ID.md.bak
# self-check: no CI gate re-validates this finalization yet (ADR 0082 Decision 8, Follow-up 3) --
# this grep is the only thing catching a missed/mistyped substitution before publish:
grep -qE '^production_commit: [0-9a-f]{40}$' docs/releases/notes/$CANDIDATE_ID.md \
  || { echo "ERROR: production_commit did not finalize to a real 40-hex SHA -- do not publish" >&2; exit 1; }
git add docs/releases/notes/$CANDIDATE_ID.md
git commit -m "docs(release): record production commit for candidate $CANDIDATE_ID"
git push -u origin docs/release/$CANDIDATE_ID-commit
gh pr create --base develop --head docs/release/$CANDIDATE_ID-commit \
  --title "docs(release): record production commit for candidate $CANDIDATE_ID" \
  --body "## Summary

Records the deployed production commit ($MAIN_SHA) on candidate $CANDIDATE_ID's release note.

## Testing Evidence

Docs-only change; no compliance-sensitive surface touched."
gh pr merge <N> --merge   # ordinary develop-base PR, no new merge authority needed

# Hotfix candidates resume here (the block above was skipped -- incident-responder's back-port PR
# already finalized and merged the note onto develop). tag the deployed main commit and publish
# the GitHub Release from the committed note -- fetch the note from develop (not main) since main
# never carries docs/releases/notes/ commits of its own until a `staging -> main`/
# `develop -> main` forward-merge:
git fetch origin develop
git show origin/develop:docs/releases/notes/$CANDIDATE_ID.md > /tmp/release-note-$CANDIDATE_ID.md
grep -qE '^production_commit: [0-9a-f]{40}$' /tmp/release-note-$CANDIDATE_ID.md \
  || { echo "ERROR: fetched note still carries pending -- do not publish" >&2; exit 1; }
git tag release-$CANDIDATE_ID $MAIN_SHA
git push origin release-$CANDIDATE_ID
gh release create release-$CANDIDATE_ID \
  --title "Release $CANDIDATE_ID" \
  --notes-file /tmp/release-note-$CANDIDATE_ID.md \
  --target $MAIN_SHA
```

The committed `docs/releases/notes/$CANDIDATE_ID.md` file stays authoritative regardless of what
this Release shows — if the two ever disagree, re-run `gh release edit` from the committed file
rather than editing the Release by hand.

## Sync develop's version baselines from main (#1807)

After the promotion parity gate and GitHub Release publication above, not before — this reads
`origin/main` as the source of truth, so it only makes sense once `main` has actually deployed.
Run on every ordinary promotion (both flows — nothing about this step is #1007-specific), whether
or not this candidate itself involved a repair or hotfix; it's a periodic reconciliation, not a
per-incident one:

```bash
git fetch origin develop main
node scripts/sync-app-version-baselines.js --develop-ref origin/develop --main-ref origin/main
```

`[sync-app-version-baselines] No apps below main's baseline -- nothing to sync.` → done, nothing
further to do. **Do not open an empty PR.** Otherwise, the report lists exactly the apps to raise
and each one's target version (`main`'s current value — never higher, never a downgrade of one
`develop` already leads on). Open one ordinary `develop`-base PR for those apps only — same clean-
tree backstop as every other cut in this runbook, and the same `node -e` pattern the "Publish the
GitHub Release" finalization step above already uses to drive a script's own exported function
instead of hand-transcribing its output:

```bash
git status   # confirm clean before cutting -- an unnoticed diff here rides onto the sync PR
# SYNC_ID is the candidate ID, not the calendar day (#1807 RF-2, PR #1813 review) -- a bare
# `date +%Y-%m-%d` collides across two same-day promotions, and gives no way to distinguish a
# genuine rerun for the SAME candidate from a second, unrelated one. $CANDIDATE_ID is already set
# earlier in this runbook's branch-cut section (either flow) and persists for the rest of this
# shell session -- same convention $TARGET_REF/$TARGET_SHA already rely on in the compliance
# preflight block above.
SYNC_ID="${CANDIDATE_ID:?candidate ID required -- set earlier in the branch-cut section above}"
TARGET_SYNC_BRANCH="chore/release/sync-version-baselines-$SYNC_ID"

# Rerun guard: check for an existing sync PR for this candidate before cutting a new branch --
# without this, a stale local branch surviving past a prior run's post-merge remote deletion would
# make `git switch -c` below fail outright and silently skip the reconciliation instead of either
# reusing or correctly re-proposing it.
#
# Classify explicitly on `state`/`mergedAt` -- do not treat "a PR exists" as "already synced"
# (#1813 RF-3): an OPEN PR means wait, don't duplicate; a MERGED one means done; a CLOSED-but-
# unmerged one means its version changes never reached `develop` and must never be silently read
# as synced -- retry instead, since recomputing computeBaselineSync() from live refs is always
# safe to redo. The lookup itself is wrapped in its own failure check (`if ! VAR=$(...)`) so a
# GitHub/API error (auth, rate limit, network) stops the run instead of `$SYNC_PR_JSON` coming back
# empty and being misread as "no existing PR, safe to create" -- the exact silent-fallthrough gap
# the prior version of this guard had.
if ! SYNC_PR_JSON=$(gh pr list --head "$TARGET_SYNC_BRANCH" --state all --json number,state,mergedAt --jq '.[0] // empty'); then
  echo "ERROR: gh pr list failed while checking for an existing sync PR for candidate $SYNC_ID -- stopping rather than risking a duplicate PR. Investigate (auth/rate-limit/network) and re-run this step." >&2
  exit 1
fi

if [ -z "$SYNC_PR_JSON" ]; then
  SYNC_PR_ACTION=create
else
  SYNC_PR_NUMBER=$(echo "$SYNC_PR_JSON" | jq -r '.number')
  SYNC_PR_STATE=$(echo "$SYNC_PR_JSON" | jq -r '.state')
  SYNC_PR_MERGED_AT=$(echo "$SYNC_PR_JSON" | jq -r '.mergedAt')
  if [ "$SYNC_PR_STATE" = "OPEN" ]; then
    SYNC_PR_ACTION=wait
  elif [ "$SYNC_PR_MERGED_AT" != "null" ]; then
    SYNC_PR_ACTION=skip
  else
    SYNC_PR_ACTION=retry   # CLOSED, mergedAt null -- closed without merging, never synced
  fi
fi

case "$SYNC_PR_ACTION" in
  wait)
    echo "An OPEN sync PR already exists for candidate $SYNC_ID (#$SYNC_PR_NUMBER) -- wait on it, do not open a second one." >&2
    ;;
  skip)
    echo "Candidate $SYNC_ID's sync PR (#$SYNC_PR_NUMBER) is already merged -- already synced, nothing further to do here." >&2
    ;;
  retry|create)
    if [ "$SYNC_PR_ACTION" = retry ]; then
      echo "Candidate $SYNC_ID's prior sync PR (#$SYNC_PR_NUMBER) was closed without merging -- its version changes never reached develop. Retrying." >&2
      git push origin --delete "$TARGET_SYNC_BRANCH" 2>/dev/null || true   # drop the dead remote branch, if it still exists
    fi
    # Drop a stale local branch from an earlier interrupted attempt, if any (#1813 RF-4). Never
    # swallow a real deletion failure: `git branch -D` refuses to delete the branch that's
    # currently checked out, and the old `|| true` here silently ate that refusal -- the
    # following `git switch -c` then failed too (a branch of that name already existed), silently
    # skipping the required reconciliation. Detach to `origin/develop` first when we're actually
    # on the stale branch -- safe, since `git status` at the top of this block already confirmed a
    # clean working tree -- then delete for real, failing loudly if it still can't be removed
    # (e.g. checked out in another worktree, which a local detach can't fix).
    if [ "$(git branch --show-current)" = "$TARGET_SYNC_BRANCH" ]; then
      git switch --detach origin/develop
    fi
    if git rev-parse --verify --quiet "$TARGET_SYNC_BRANCH" >/dev/null; then
      git branch -D "$TARGET_SYNC_BRANCH" || { echo "ERROR: could not delete stale local branch $TARGET_SYNC_BRANCH -- resolve manually (check for another worktree/checkout using it) before retrying this step." >&2; exit 1; }
    fi
    git switch -c "$TARGET_SYNC_BRANCH" origin/develop
    node -e "
const fs = require('fs');
const { computeBaselineSync } = require('./scripts/sync-app-version-baselines');
const result = computeBaselineSync({ developRef: 'origin/develop', mainRef: 'origin/main' });
if (result.invalid.length > 0) {
  console.error('Refusing to sync -- one or more app versions could not be read/parsed:', result.invalid);
  process.exit(1);
}
for (const entry of result.needsSync) {
  const pkgPath = \`apps/\${entry.app}/package.json\`;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = entry.mainVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(\`bumped \${entry.app}: \${entry.developVersion} -> \${entry.mainVersion}\`);
}
"
    git add apps/*/package.json
    git commit -m "chore(release): sync app version baselines from main"
    git push -u origin "$TARGET_SYNC_BRANCH"
    gh pr create --base develop --head "$TARGET_SYNC_BRANCH" \
      --title "chore(release): sync app version baselines from main" \
      --body "## Summary

Raises develop's package.json version for every app where main's published version has moved
past develop's current one (#1807). Additive only: no app is downgraded and no app develop
already matches or leads is touched.

<list the synced apps and their old -> new versions from the command output above>

## Testing Evidence

\`node scripts/sync-app-version-baselines.js --develop-ref origin/develop --main-ref origin/main\`
re-run against this branch's HEAD reports every synced app now at or above main's baseline
(\`upToDate\`, not \`needsSync\`)."
    # wait on pr-checks.yml, then:
    gh pr merge <N> --merge   # never --squash -- see ../SKILL.md
    ;;
esac
```

This step never builds, tags, or publishes anything — it only edits `apps/<app>/package.json`'s
`version` field on `develop`, and carries no interaction with #1610 (the tag-immutability/
candidate-identity conflict): see `scripts/sync-app-version-baselines.js`'s own header comment,
and the PR this step ships in, for the full statement.
