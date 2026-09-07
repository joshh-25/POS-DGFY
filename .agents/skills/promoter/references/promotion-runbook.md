# Promotion runbook — copy-pasteable commands

Mechanics only. Rule sources (why, and what gates apply) are in `../SKILL.md` and the docs it
points at — don't duplicate the reasoning here, just the commands.

## Compliance preflight — pinned target-ref scan, resolve, and refresh (shared by both flows, #1648; pinned-scan fix from PR #1672 review, RF-1/RF-2; parameterized RF-4, unique-path fix RF-6; fail-loud guard + pinned-SHA cut fix RF-8/RF-10; fail-closed strict-mode fix RF-12)

Every call site below needs the identical check before its next branch is cut, but against
different target refs: the `#1007`-gated exception's direct `release/<label>` cut and the default
flow's `to-staging/<candidate_id>` cut both scan `origin/develop`; the default flow's own
`release/<candidate_id>-rN` cut scans `origin/staging` instead — that's what `release/<label>` is
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
git switch -c release/$CANDIDATE_ID-r1 "$TARGET_SHA"
git push -u origin release/$CANDIDATE_ID-r1

gh pr create \
  --base main \
  --head release/$CANDIDATE_ID-r1 \
  --title "chore: promote candidate $CANDIDATE_ID to main (r1)" \
  --body "## Summary

Promotes \`develop\` to \`main\` at $(git rev-parse --short "$TARGET_SHA").

## Testing Evidence

\`promotion-quality-gate\` check-run: <link> (14 blocking gates + 3 deliberately advisory as of
#1278 PR 2 / Phase 298 -- gate:release:local no longer runs as part of this procedure, see
docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md). Tenant-schema sync checked against production: <result>.
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

**Only the merge into `main` waits on both** — the compliance sweep (already confirmed clear above)
and the tenant-schema report — **plus** the promotion PR's own `promotion-quality-gate` check-run
(`gh pr checks <N>` or per-job conclusions, NEVER the workflow run's rollup conclusion — see
`GATE_RELEASE_LOCAL_CI_MAPPING.md`'s "Current state" section). Do not merge past a failing gate.

## Default: `develop` → `staging` → `main`

This is the default soak leg again since #1404 (2026-09-02) — see `../SKILL.md`'s "The flow"
section.

**Do NOT run `npm run gate:release:local` on this leg.** It is reserved for the `develop → main`
(and `staging → main`) leg only — see the "#1007-gated exception" section above, where it's the
first thing run.
This isn't an omission to infer from silence: this leg's own CI-side check
(`promotion-quality-gate.yml`) is also skipped entirely here (#1063), so the `to-staging/<label>`
PR's own CI is deliberately gated on nothing beyond `pr-checks.yml`'s Docker build checks — that's
unchanged by #1648's compliance-preflight addition below, which is a promoter-run precondition on
cutting the branch in the first place, not a CI check on the PR once opened. Filed as #1097 after
a live promotion attempt ran the local gate here anyway and stopped a `develop → staging` promotion
on failures (a real dependency advisory plus false negatives from an uninstalled isolated checkout)
that were never this leg's gate to fail on. (Briefly untrue 2026-08-29→2026-08-31 — #1124/#1165
made this leg's quality jobs advisory-only instead of skipped, then #1253 reverted that; expect the
plain skip described above, not a ~15-20min advisory run.)

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

Exit 0 (`All apps at or above the minor floor.`) → proceed straight to the branch cut below. A
non-zero exit lists every app below floor with its current (head) version and the minimum
acceptable one (`X.(Y+1).0`) — open and merge one ordinary `develop`-base PR for the bump before
cutting anything, per `implement`'s own workflow (this is not a promotion-branch PR, no new merge
authority needed, `pr-reviewer`'s existing unattended-merge policy on `develop` already covers it).
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
way through the `release/<candidate_id>-rN → main` PR itself). "Publish the GitHub Release" below
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

**Candidate manifest (ADR 0081 Decision 8, #1588)** — the parity gate downstream needs a durable
record of this candidate's own frozen source SHA, distinct from whatever `github.sha` each
environment's merge commit happens to carry. Written locally, never committed (mirrors
`.tmp/release-gates/<sha>/local_readiness.json`'s own local-artifact convention) — pass its path to
every `check-promotion-candidate.js`/`check-image-version-parity.js`/`check-staging-candidate-
observation.js` call below instead of re-deriving the SHA by hand each time:

```bash
mkdir -p .tmp/release-candidates
cat > .tmp/release-candidates/$CANDIDATE_ID.json <<JSON
{
  "schema": "sku-release-candidate/v1",
  "candidate_id": "$CANDIDATE_ID",
  "status": "staging_soak",
  "source_develop_sha": "$CANDIDATE_SHA",
  "current_staging_sha": "$CANDIDATE_SHA",
  "revisions": [
    { "kind": "initial", "sha": "$CANDIDATE_SHA", "parent_sha": null, "branch": "to-staging/$CANDIDATE_ID" }
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

Then cut `release/<candidate_id>-rN` from `origin/staging` instead of `origin/develop`: set
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

## Candidate repair after the staging merge

After the `to-staging/<candidate_id>` PR merges, treat the candidate as frozen. Do not cut a new
promotion branch from `develop` and do not merge `develop` into `staging` to pick up a fix. For a
code-level staging failure, create the repair branch from the current staging head:

```bash
git fetch origin staging
git switch -c fix/staging/$CANDIDATE_ID-r1 origin/staging
# implement only the repair, or cherry-pick -x one reviewed isolated fix commit
git push -u origin fix/staging/$CANDIDATE_ID-r1
gh pr create --base staging --head fix/staging/$CANDIDATE_ID-r1 \
  --title "fix(release): repair candidate $CANDIDATE_ID (r1)" \
  --body "## Summary

Repairs frozen release candidate $CANDIDATE_ID at the current staging SHA.

## Testing Evidence

Conduct/staging observation evidence: <link>. Candidate manifest: <path or link>."
```

Record the repair issue and PR in the candidate manifest (`.tmp/release-candidates/$CANDIDATE_ID.json`
— append a `staging_repair` entry to `revisions`, with `parent_sha` pointing at the previous
candidate SHA, and advance `current_staging_sha` to match; `check-promotion-candidate.js` validates
the whole chain, including this parent-pointer requirement), merge into `staging` with `--merge`,
redeploy/observe, and increment the repair revision. If the repair is live DB, secrets, SSH, or
infrastructure work, stop and hand it to Pat. If a developer already made the fix on `develop`,
cherry-pick only an isolated, reviewed commit with `-x`; mixed commits must be recreated narrowly.

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
{ "kind": "staging_repair", "revision": 1, "sha": "<sha>", "parent_sha": "<prev-sha>",
  "branch": "fix/staging/$CANDIDATE_ID-r1", "pr": 1234, "issue": 1233,
  "apps_touched": ["dgfy-ims"] }
```

`check-promotion-candidate.js` now rejects a `staging_repair` revision missing `apps_touched`
entirely, so this isn't optional — validate right after editing:

```bash
node scripts/check-promotion-candidate.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json
```

When observation passes, cut the next release revision from the latest staging head:

```bash
RELEASE_REVISION=2
git switch -c release/$CANDIDATE_ID-r$RELEASE_REVISION origin/staging
git push -u origin release/$CANDIDATE_ID-r$RELEASE_REVISION
```

Update the manifest's `release_revision` field (`revision`, `source_staging_sha` — must equal
`current_staging_sha`, `branch`, `pr`) before validating and building release evidence:

```bash
node scripts/check-promotion-candidate.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json
```

Include `--candidate-manifest .tmp/release-candidates/$CANDIDATE_ID.json` when building release
evidence. A pre-main failure returns to this staging loop and invalidates the old release head; it
does not restart from `develop`.

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
# STAGING — unattended, per ../SKILL.md's checkpoint table. DEV dispatch is dropped from this
# default flow entirely (#982) — use `--ref develop` only when DEV is specifically wanted, never
# as a routine step here.
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
gh workflow run deploy.yml -f deploy=true -f candidate_source_sha="$CANDIDATE_SOURCE_SHA" --ref staging
```

**PROD dispatch — ask Pat first, every time, on either flow.** `deploy-main.yml` takes candidate
source identity **per app group** (ADR 0081 Decision 8 amendment, #1610) — `candidate_source_sha_api`
(covers both `dgfy-api` and `dgfy-migration-runner`), `candidate_source_sha_frontend_ims`, `_pos`,
`_storefront` — not one shared value, since PROD rebuilds every app unconditionally and a single
shared value would mislabel any app a staging repair never touched.

**Neither dispatch command below needs any manual `build_*` unchecking any more (#1610, ADR 0081
Decision 7 residue).** Both canonical commands leave all four `build_*` inputs at their `default:
true` — they always have, since this runbook never documented a manual-uncheck step in the first
place. That used to mean every real PROD dispatch rebuilt all five apps regardless of what actually
changed, and a retry after one app's Decision 7 refusal re-tripped the same guard for every app that
had already succeeded. `deploy-main.yml` now resolves a per-app build-skip verdict automatically (a
new `resolve-build-plan` job, ahead of the five build jobs) — an app whose version tag is already
published and whose tracked build inputs are content-unchanged is skipped without any dispatch input
needing to change. Nothing below needs editing for this; it's automatic and safe. Full mechanism:
`scripts/resolve-build-skip-plan.js`'s own header comment, ADR 0081's 2026-09-05 Amendment.

**Default flow** (candidate manifest exists): resolve each app's own value via
`resolveCandidateSourceShaByApp()` rather than reusing `$CANDIDATE_SOURCE_SHA` uniformly:

```bash
eval "$(node -e "
const { resolveCandidateSourceShaByApp } = require('./scripts/check-promotion-candidate');
const manifest = require('./.tmp/release-candidates/$CANDIDATE_ID.json');
const byApp = resolveCandidateSourceShaByApp(manifest);
console.log('CANDIDATE_SOURCE_SHA_API=' + byApp['dgfy-api']);
console.log('CANDIDATE_SOURCE_SHA_IMS=' + byApp['dgfy-ims']);
console.log('CANDIDATE_SOURCE_SHA_POS=' + byApp['dgfy-pos']);
console.log('CANDIDATE_SOURCE_SHA_STOREFRONT=' + byApp['dgfy-storefront']);
")"

gh workflow run deploy-main.yml -f deploy=true \
  -f candidate_source_sha_api="$CANDIDATE_SOURCE_SHA_API" \
  -f candidate_source_sha_frontend_ims="$CANDIDATE_SOURCE_SHA_IMS" \
  -f candidate_source_sha_frontend_pos="$CANDIDATE_SOURCE_SHA_POS" \
  -f candidate_source_sha_frontend_storefront="$CANDIDATE_SOURCE_SHA_STOREFRONT" \
  --ref main
```

**#1007-gated exception** (no manifest, no repair concept, nothing has diverged per app): the single
`$CANDIDATE_SOURCE_SHA` captured in that section (set equal to `$TARGET_SHA`, the compliance-scanned
commit `release/<label>` was actually cut from) is the correct value for all four inputs:

```bash
gh workflow run deploy-main.yml -f deploy=true \
  -f candidate_source_sha_api="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_ims="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_pos="$CANDIDATE_SOURCE_SHA" \
  -f candidate_source_sha_frontend_storefront="$CANDIDATE_SOURCE_SHA" \
  --ref main
```

```bash
# Verify health after either dispatch — read-only, unattended
gh workflow run verify-deployment.yml -f environment=<DEV|STAGING|PROD> -f poll_minutes=5
gh run list --workflow=verify-deployment.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
```

A `conclusion: failure` here has no rollback to fall back on (#495 open) — report and escalate,
don't retry blindly.

**Promotion parity gate (ADR 0081 Decision 8, #1588)** — after `deploy-main.yml` has actually built
and pushed the PROD images (only then does the bare `X.Y.Z` tag exist to compare against), confirm
every changed app's PROD image traces back to the candidate it should. Read-only (`docker buildx
imagetools inspect` only), unattended, same tier as `verify-deployment.yml`. Two invocation forms,
matching whichever flow actually ran (RF-2, PR #1590 review — the CLI itself refuses to run without
exactly one of these two flags):

```bash
# Default flow — compares PROD against its STAGING predecessor via the candidate manifest:
node scripts/check-image-version-parity.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json

# #1007-gated exception instead — no manifest exists; compares PROD's own label directly against
# the develop SHA release/<label> was cut from (the same $CANDIDATE_SOURCE_SHA captured in that
# section):
node scripts/check-image-version-parity.js --source-sha "$CANDIDATE_SOURCE_SHA"
```

`PASS` includes both a real label match and a documented "no predecessor"/"no candidate identity"
case (the #1007/hotfix path, on either invocation form) — both are fine to proceed on. A `FAIL`
(`mismatch`, `prod-unreadable`, or — default-flow only — `staging-unreadable`) means the PROD image
published for this candidate does not actually trace back to where it should, or (staging-unreadable
specifically) that STAGING's own label-stamping regressed — report and escalate either way, do not
deploy past it or dismiss it as noise.

**Per app now, not one shared value (ADR 0081 Decision 8 amendment, #1610).** `--manifest` mode
resolves and compares each app against its OWN candidate source identity (the SHA of the last
revision that actually rebuilt it — see the `apps_touched` note in "Candidate repair after the
staging merge" above), not the manifest's single `current_staging_sha` — an app a repair never
touched is expected to keep matching its earlier identity, not the candidate's latest one. Each
printed `[PASS]`/`[FAIL]` line now also shows the `candidate_source_sha` it was actually compared
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
