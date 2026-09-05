# Promotion runbook — copy-pasteable commands

Mechanics only. Rule sources (why, and what gates apply) are in `../SKILL.md` and the docs it
points at — don't duplicate the reasoning here, just the commands.

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
`../SKILL.md`'s "Pre-`main` gates" section, "Ordering" note, #1359):

```bash
git fetch origin main develop
git diff --name-only origin/main origin/develop -- docs/compliance/impact-declarations/ \
  | xargs -I{} sh -c 'node scripts/is-preflight-outstanding.js "{}" && echo "{}"' 2>/dev/null
# empty output → clear, proceed. Any line printed → the continuous sweep hasn't caught up yet —
# dispatch it manually (`gh workflow run compliance-preflight-sweep.yml`) and wait, per ../SKILL.md.
```

Once that's clear, cut `release/<label>` and open its PR into `main` right away — **do not wait on
the production tenant-schema report first.** It has no dependency on the compliance sweep or on the
branch cut/PR-open step below: start it **concurrently** with it (a backgrounded command, a second
terminal — whatever fits), not serially before it. (Historical note: this section used to also name
`gate:release:local` here — it was caught live on the 2026-09-01/02 promotion, #1359, running to
completion before the branch was even cut. Since 2026-09-03, #1431 Phase C/D, `gate:release:local`
is no longer part of this procedure at all — see `../SKILL.md`'s own note.)

```bash
git fetch origin
git ls-remote --exit-code --heads origin main || echo "MISSING — restore before proceeding"

CANDIDATE_ID=$(date +%Y-%m-%d)-01
# candidate_source_sha (ADR 0081 Decision 8, #1588): this path never cuts to-staging/<candidate_id>
# and so never produces a candidate manifest -- there is nothing for scripts/check-image-version-
# parity.js's --manifest mode to point at. Its own --source-sha mode (RF-2, PR #1590 review) exists
# for exactly this: the develop SHA release/<label> is about to be cut from IS this path's whole
# candidate source identity, no manifest object needed. Captured before the cut, from the exact ref
# the branch is cut from, so there is no ambiguity about which SHA it names.
CANDIDATE_SOURCE_SHA=$(git rev-parse origin/develop)
git switch -c release/$CANDIDATE_ID-r1 origin/develop
git push -u origin release/$CANDIDATE_ID-r1

gh pr create \
  --base main \
  --head release/$CANDIDATE_ID-r1 \
  --title "chore: promote candidate $CANDIDATE_ID to main (r1)" \
  --body "## Summary

Promotes \`develop\` to \`main\` at $(git rev-parse --short origin/develop).

## Testing Evidence

\`promotion-quality-gate\` check-run: <link> (14 blocking gates + 2 deliberately advisory since
2026-09-03, #1431 Phase C/D -- gate:release:local no longer runs as part of this procedure, see
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
(`promotion-quality-gate.yml`) is also skipped entirely here (#1063), so a `to-staging/<label>` PR
is deliberately gated on nothing beyond `pr-checks.yml`'s Docker build checks. Filed as #1097 after
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

Only once that reports clean does the candidate branch get cut, from the (possibly just-bumped)
`origin/develop`:

```bash
git switch -c to-staging/$CANDIDATE_ID origin/develop
git push -u origin to-staging/$CANDIDATE_ID
CANDIDATE_SHA=$(git rev-parse origin/to-staging/$CANDIDATE_ID)
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

Promotes \`develop\` to \`staging\` at $(git rev-parse --short origin/develop) — the default soak leg
before promoting to \`main\`.

## Testing Evidence

Aggregate promotion — every bundled change was validated on its own originating PR into \`develop\`.
See \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the promotion-PR compliance exemption this relies on."

# Wait on pr-checks.yml, then:
gh pr merge <N> --merge   # never --squash — see SKILL.md
```

Then cut `release/<candidate_id>-rN` from `origin/staging` instead of `origin/develop` in the
"#1007-gated exception" section above — same commands, `origin/staging` in place of
`origin/develop`.

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
`$CANDIDATE_SOURCE_SHA` captured in that section (`git rev-parse origin/develop` at cut time) is the
correct value for all four inputs:

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
