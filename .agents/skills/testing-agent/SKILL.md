---
name: testing-agent
description: Run this repository's existing release-quality checks in a disposable Linux Docker environment with real MySQL 8 and Redis 7, producing SHA-bound evidence without mutating the checkout, merging, or deploying.
---

# Testing Agent

Use this skill when a Worker, PR Reviewer, or Pat needs trustworthy local evidence for the
repository's existing release-quality checks. It is an evidence-producing wrapper, not a second
test runner and not a replacement for GitHub CI.

## Callers and authority

- A Worker may run a focused or full invocation opportunistically when resources allow. Its result
  is advisory evidence only.
- Pat or the PR Reviewer may request the full run before a merge or promotion decision. The result
  is still evidence for that decision; this skill never merges, dispatches a deployment, or changes
  CI enforcement.
- Focused runs (`--scope focused --only ...` or `--skip ...`) are always partial/advisory. They must
  not be described as a full release result.

## Invocation

From the repository root:

```bash
npm run testing-agent
```

The repository command is exposed by `node scripts/run-testing-agent.js`; invoke it directly when
passing options:

```bash
node scripts/run-testing-agent.js --scope full
node scripts/run-testing-agent.js --scope focused --only backend.test_matrix
node scripts/run-testing-agent.js --scope focused --skip frontend.budgets
```

The default full command runs `npm run install:all` and then
`npm run gate:release:local -- --include-ci-enforced`, so delegated gates are explicitly run.
The helper preserves the gate exit status and uses exit `3` for an unrunnable preflight. It writes
`.tmp/release-gates/<sha>/testing_agent_summary.{json,md}` alongside the existing gate artifacts.

For a heavyweight run on a Linux runner, start a shell on the operator-approved runner and run
the command there, for example `ssh ch-dgfy-runner` or `ssh ch-openproject-runner`. Keep the
checkout and Docker resources on that runner, use the same verified test containers, and remove
the temporary checkout after the command completes. The helper never SSHes, provisions production
resources, or mutates `/opt/dgfy-platform`.

## Safety and preflight

Before installing or testing, the helper:

1. Requires a target SHA and a database name containing `test`; it refuses unsafe database names.
2. Checks Docker availability and enforces minimum resource floors (2 CPUs and 5 GiB by default;
   override only when the operator has intentionally assessed the workload).
3. Verifies the MySQL and Redis test containers with `mysqladmin ping` and `redis-cli ping`.
4. Sets `NODE_ENV=test`, test-only DB credentials/endpoints, test-safe JWT secrets, and
   `RELEASE_TARGET_SHA` inside the test container.
5. Copies the checkout to a disposable sibling scratch directory, excluding every `node_modules`
   tree and `.tmp`. The live checkout is never bind-mounted for install/test execution.
6. Copies only `.tmp/release-gates` evidence back before deleting the scratch directory, including
   failure paths. No host dependency or lockfile changes from the Linux install are retained.

The current helper expects already-provisioned, verified test containers. If they are unavailable,
it exits non-green with an actionable reason; do not point it at a live or non-test database.

## Evidence contract

Every report includes the target SHA, Docker image/network, service names, scope, exact gate command,
gate counts, child exit status, artifact path, and an explicit `Not reproduced locally` section.
The existing `local_readiness.json` remains authoritative for gate status, durations, delegated or
skipped gates, and frontend budget output. The backend matrix remains authoritative for its suite
counts and chunk logs. A failed or unavailable run is valid evidence when reported accurately.

If a PR is supplied as context, evidence may be posted only through the existing
`scripts/pr-checks.js --post` contract and only when that script's own verified-GitHub-unavailability
classifier permits it. This skill does not duplicate that classifier, post a merge authorization,
call `gh pr merge`, or dispatch any deployment.

## Existing-command rule

Do not add path-based test selection or reimplement Jest, Vitest, Docker, schema setup, matrix
chunking, GitHub check classification, or merge logic here. Use the existing gate and matrix
scripts. For backend-focused diagnostics, use the existing matrix selectors (`--tier fast|db|all`,
`--group`, and `--chunk`) directly and label the result focused/advisory.
