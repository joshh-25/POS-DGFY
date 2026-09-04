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
authority needed, `pr-reviewer`'s existing unattended-merge policy on `develop` already covers it):

```bash
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

```bash
# STAGING — unattended, per ../SKILL.md's checkpoint table. DEV dispatch is dropped from this
# default flow entirely (#982) — use `--ref develop` only when DEV is specifically wanted, never
# as a routine step here.
# (#1050, 2026-08-25: the old single-select `components` input is gone; the
# four build_* booleans below all default true, so omitting them builds/pushes
# everything, same as the old components=all)
#
# candidate_source_sha (ADR 0081 Decision 8, #1588): only set on a real to-staging/<candidate_id>
# promotion's STAGING dispatch -- read current_staging_sha straight from the candidate manifest
# rather than retyping the SHA. Omit entirely (leave the default empty string) for a plain DEV
# dispatch or an ad hoc STAGING rebuild that isn't part of a tracked candidate.
CANDIDATE_SOURCE_SHA=$(node -p "require('./.tmp/release-candidates/$CANDIDATE_ID.json').current_staging_sha")
gh workflow run deploy.yml -f deploy=true -f candidate_source_sha="$CANDIDATE_SOURCE_SHA" --ref staging

# PROD — ask Pat first, every time. Same candidate_source_sha value as the STAGING dispatch above on
# the normal three-stage flow (release/<candidate_id>-rN was cut from that exact staging SHA, so the
# identity is unchanged by the merge). On the #1007-gated exception (release/<label> cut straight
# from develop, no staging leg, no candidate manifest ever created) leave candidate_source_sha empty
# -- scripts/check-image-version-parity.js reads that as "no staging predecessor," which is exactly
# right for that path (ADR 0081 Decision 8's own "expected evidence of a #1007 expedited promotion
# or a main hotfix, not a defect").
gh workflow run deploy-main.yml -f deploy=true -f candidate_source_sha="$CANDIDATE_SOURCE_SHA" --ref main

# Verify health after either dispatch — read-only, unattended
gh workflow run verify-deployment.yml -f environment=<DEV|STAGING|PROD> -f poll_minutes=5
gh run list --workflow=verify-deployment.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
```

A `conclusion: failure` here has no rollback to fall back on (#495 open) — report and escalate,
don't retry blindly.

**Promotion parity gate (ADR 0081 Decision 8, #1588)** — after `deploy-main.yml` has actually built
and pushed the PROD images (only then does the bare `X.Y.Z` tag exist to compare against), confirm
every changed app's STAGING and PROD images share the same candidate source identity. Read-only
(`docker buildx imagetools inspect` only), unattended, same tier as `verify-deployment.yml`:

```bash
node scripts/check-image-version-parity.js --manifest .tmp/release-candidates/$CANDIDATE_ID.json
```

`PASS` includes both a real label match and a documented "no staging predecessor" case (the
#1007/hotfix path) — both are fine to proceed on. A `FAIL` (`mismatch` or `prod-unreadable`) means
the PROD image published for this candidate does not actually trace back to the frozen staging
candidate it should — report and escalate, do not deploy past it or dismiss it as noise.
