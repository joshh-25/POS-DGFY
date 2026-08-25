# Promotion runbook — copy-pasteable commands

Mechanics only. Rule sources (why, and what gates apply) are in `../SKILL.md` and the docs it
points at — don't duplicate the reasoning here, just the commands.

## Leg 1 — `develop` → `staging`

```bash
# Pre-flight: confirm staging exists on the remote
git fetch origin
git ls-remote --exit-code --heads origin staging || echo "MISSING — restore before proceeding"

LABEL=$(date +%Y-%m-%d)   # or a more specific label if promoting more than once/day
git switch -c to-staging/$LABEL origin/develop

git push -u origin to-staging/$LABEL

gh pr create \
  --base staging \
  --head to-staging/$LABEL \
  --title "chore: promote develop to staging ($LABEL)" \
  --body "## Summary

Promotes \`develop\` to \`staging\` at $(git rev-parse --short origin/develop).

## Testing Evidence

Aggregate promotion — every bundled change was validated on its own originating PR into \`develop\`.
See \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the promotion-PR compliance exemption this relies on."

# Wait on pr-checks.yml, then:
gh pr merge <N> --merge   # never --squash — see SKILL.md
```

## Leg 2 — `staging` → `main`

Before cutting the branch: run `npm run gate:release:local` against the target SHA, and dispatch the
tenant-schema report against **production** (not staging's) — see `../SKILL.md`'s "Pre-`main` gates"
section. Do not proceed past a failing gate.

```bash
gh workflow run tenant-schema-report.yml -f environment=PROD
# poll:
gh run list --workflow=tenant-schema-report.yml -L1 --json databaseId,status
gh run view <id> --json conclusion   # expect "success" and failed_tenant_count: 0 in the step summary
```

```bash
git fetch origin
git ls-remote --exit-code --heads origin main || echo "MISSING — restore before proceeding"

LABEL=$(date +%Y-%m-%d)
git switch -c release/$LABEL origin/staging
git push -u origin release/$LABEL

gh pr create \
  --base main \
  --head release/$LABEL \
  --title "chore: promote staging to main ($LABEL)" \
  --body "## Summary

Promotes \`staging\` to \`main\` at $(git rev-parse --short origin/staging).

## Testing Evidence

\`npm run gate:release:local\`: <paste result>. Tenant-schema sync checked against production: <result>.
Aggregate promotion — see \`docs/ops/RELEASE_CANDIDATE_POLICY.md\` for the compliance exemption."

# Merging this PR is Pat's action, always — see ../SKILL.md's checkpoint table.
```

## Deploy dispatch, after either leg merges

```bash
# DEV/STAGING — unattended, per ../SKILL.md's checkpoint table
gh workflow run deploy.yml -f components=all -f deploy=true --ref develop   # or staging

# BETA/PROD — ask Pat first, every time
gh workflow run deploy-main.yml -f components=all -f deploy=true --ref main

# Verify health after either dispatch — read-only, unattended
gh workflow run verify-deployment.yml -f environment=<DEV|STAGING|BETA|PROD> -f poll_minutes=5
gh run list --workflow=verify-deployment.yml -L1 --json databaseId,status
gh run view <id> --json conclusion
```

A `conclusion: failure` here has no rollback to fall back on (#495 open) — report and escalate,
don't retry blindly.
