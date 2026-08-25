# Promotion runbook — copy-pasteable commands

Mechanics only. Rule sources (why, and what gates apply) are in `../SKILL.md` and the docs it
points at — don't duplicate the reasoning here, just the commands.

## Default: `develop` → `main`

Pre-flight, then the gates in `../SKILL.md`'s "Pre-`main` gates" section (compliance preflight
sweep, `gate:release:local`, production tenant-schema report) — run all three against the target
SHA before cutting the branch below. Do not proceed past a failing gate.

```bash
gh workflow run tenant-schema-report.yml -f environment=PROD
# poll:
gh run list --workflow=tenant-schema-report.yml -L1 --json databaseId,status
gh run view <id> --json conclusion   # expect "success" and failed_tenant_count: 0 in the step summary
```

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

## Optional: a `staging` soak first

Choose this per batch when the change is risky enough to want it — not the default, see
`../SKILL.md`'s "The flow" section.

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

# BETA/PROD — ask Pat first, every time
gh workflow run deploy-main.yml -f deploy=true --ref main

# Verify health after either dispatch — read-only, unattended
gh workflow run verify-deployment.yml -f environment=<DEV|STAGING|BETA|PROD> -f poll_minutes=5
gh run list --workflow=verify-deployment.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
```

A `conclusion: failure` here has no rollback to fall back on (#495 open) — report and escalate,
don't retry blindly.
