# Promotion runbook — copy-pasteable commands

Mechanics only. Rule sources (why, and what gates apply) are in `../SKILL.md` and the docs it
points at — don't duplicate the reasoning here, just the commands.

## Default: `develop` → `main`

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
`gate:release:local` or the production tenant-schema report first.** Those two have no dependency on
the compliance sweep, on each other, or on the branch cut/PR-open step below: start them
**concurrently** with it (a backgrounded command, a second terminal — whatever fits), not serially
before it. This was caught live on the 2026-09-01/02 promotion (#1359), where the ~25min local gate
was run to completion before the branch was even cut.

```bash
git fetch origin
git ls-remote --exit-code --heads origin main || echo "MISSING — restore before proceeding"

LABEL=$(date +%Y-%m-%d)   # or a more specific label if promoting more than once/day
git switch -c release/$LABEL origin/develop
git push -u origin release/$LABEL

gh pr create \
  --base main \
  --head release/$LABEL \
  --title "chore: promote develop to main ($LABEL)" \
  --body "## Summary

Promotes \`develop\` to \`main\` at $(git rev-parse --short origin/develop).

## Testing Evidence

\`npm run gate:release:local\`: <paste result>. Tenant-schema sync checked against production: <result>.
Aggregate promotion — see \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the compliance exemption."

# Merging this PR is Pat's action, always — see ../SKILL.md's checkpoint table.
```

Run these two alongside (or immediately after) the branch cut/PR open above — not before it:

```bash
npm run gate:release:local   # ~25min; background it or use a separate terminal, then post the
                              # result as a comment on the release/<label> PR once it finishes

gh workflow run tenant-schema-report.yml -f environment=PROD
# poll:
gh run list --workflow=tenant-schema-report.yml -L1 --json databaseId,status
gh run view <id> --json conclusion   # expect "success" and failed_tenant_count: 0 in the step summary
```

**Only the merge into `main` waits on all three** — the compliance sweep (already confirmed clear
above), `gate:release:local` (`run_mode: "full"`), and the tenant-schema report. Do not merge past a
failing gate.

## Optional: a `staging` soak first

Choose this per batch when the change is risky enough to want it — not the default, see
`../SKILL.md`'s "The flow" section.

**Do NOT run `npm run gate:release:local` on this leg.** It is reserved for the `develop → main`
(and `staging → main`) leg only — see the "Default" section above, where it's the first thing run.
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

LABEL=$(date +%Y-%m-%d)
git switch -c to-staging/$LABEL origin/develop
git push -u origin to-staging/$LABEL

gh pr create \
  --base staging \
  --head to-staging/$LABEL \
  --title "chore: promote develop to staging ($LABEL)" \
  --body "## Summary

Promotes \`develop\` to \`staging\` at $(git rev-parse --short origin/develop) — optional soak before
promoting to \`main\`.

## Testing Evidence

Aggregate promotion — every bundled change was validated on its own originating PR into \`develop\`.
See \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the promotion-PR compliance exemption this relies on."

# Wait on pr-checks.yml, then:
gh pr merge <N> --merge   # never --squash — see SKILL.md
```

Then cut `release/<label>` from `origin/staging` instead of `origin/develop` in the "Default"
section above — same commands, `origin/staging` in place of `origin/develop`.

## Expedited override (#1007) — only on Pat's explicit real-time phrase

Skips `gate:release:local` and/or the compliance preflight sweep. Never skips the tenant-schema
report, `AGENTS.md` Merge Safety, never-`--squash`, or the `release/` head-cut rule. Full definition:
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment; checkpoint-table row in `../SKILL.md`.

```bash
# Still mandatory even under the override:
gh workflow run tenant-schema-report.yml -f environment=PROD
gh run view <id> --json conclusion   # must be "success" and failed_tenant_count: 0 before merging

# Log the authorization BEFORE merging, not after:
gh pr comment <N> --body "## #1007 expedited promotion override

Authorized by Pat, $(date -u +%Y-%m-%dT%H:%M:%SZ). Phrase given: \"<verbatim phrase>\".
Skipped: <gate:release:local | compliance preflight sweep | both>. Not skipped: production
tenant-schema report (run <id>, conclusion success), AGENTS.md Merge Safety, never-squash,
release/ head-cut rule."

gh pr merge <N> --merge   # never --squash
```

Retro-verification afterward, same run — not a separate follow-up:

```bash
# If gate:release:local was skipped, run it against the merged SHA and file/annotate real failures:
npm run gate:release:local
# If staging is now stale relative to main, note it rather than silently leaving it:
git fetch origin
git rev-list --count origin/staging..origin/main
```

## Deploy dispatch, after either leg merges

```bash
# DEV/STAGING — unattended, per ../SKILL.md's checkpoint table
# (#1050, 2026-08-25: the old single-select `components` input is gone; the
# four build_* booleans below all default true, so omitting them builds/pushes
# everything, same as the old components=all)
gh workflow run deploy.yml -f deploy=true --ref develop   # or staging

# PROD — ask Pat first, every time
gh workflow run deploy-main.yml -f deploy=true --ref main

# Verify health after either dispatch — read-only, unattended
gh workflow run verify-deployment.yml -f environment=<DEV|STAGING|PROD> -f poll_minutes=5
gh run list --workflow=verify-deployment.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
```

A `conclusion: failure` here has no rollback to fall back on (#495 open) — report and escalate,
don't retry blindly.
