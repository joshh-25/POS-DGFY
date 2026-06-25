---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-06-18
applies_to: repository, ci, pull_requests, pos, skupervisor, storefront
topic: safe_cross_branch_merging
---

# Safe Cross-Branch Merging

## Purpose

This guide defines how to merge a small, isolated change into `master` without losing it or accidentally importing unrelated work. It also explains how to handle repository-wide CI failures that appear even when a pull request does not modify the failing area.

The goal is not to bypass CI. The goal is to distinguish:

- failures introduced by the pull request;
- required governance evidence missing from the pull request; and
- failures already present on the same `master` baseline.

## Why Unrelated Checks Run

The repository CI workflow runs broad jobs for every pull request targeting `master`. A frontend change can trigger:

- full frontend lint;
- the complete frontend test suite;
- Storefront, POS, and SKUpervisor builds;
- frontend bundle budgets;
- backend architecture and compliance checks; and
- dependency audits.

This means a POS-only pull request can report Storefront or unrelated SKUpervisor failures. The presence of an error in the PR check does not, by itself, prove the PR introduced that error. A comparison against the exact target `master` commit is required.

## Core Safety Rule

Do not approve a general instruction such as "merge regardless of failed checks." Use a narrow, evidence-based exception only when all of the following are true:

1. The pull request diff contains only the approved files.
2. The feature-specific tests and builds pass.
3. Every waived failure is reproduced on the exact target `master` commit.
4. The pull request includes all required compliance documentation.
5. An authorized maintainer records which checks are waived and why.
6. No failure related to a changed file, route, contract, security boundary, or runtime behavior is waived.

## Recommended Workflow

### 1. Isolate The Change

Create the feature branch from the current upstream `master`:

```powershell
git fetch bblabs
git switch -c codex/<feature-name> bblabs/master
```

Add only the files owned by the change. Never use `git add -A` in a mixed working tree.

```powershell
git add -- path/to/file-one path/to/file-two
git diff --cached --name-status
```

The staged file list must match the approved scope before committing.

### 2. Use One Intentional Commit

Prefer one focused commit when the change is small and self-contained:

```powershell
git commit -m "Add <specific behavior>"
```

An isolated commit can be reviewed, reverted, rebased, or cherry-picked without carrying unrelated branch history.

### 3. Add Required Compliance Evidence

Changes to compliance-sensitive files require an impact declaration under:

```text
docs/compliance/impact-declarations/
```

The declaration must describe:

- changed behavior;
- affected surfaces;
- security, fiscal, privacy, or operational impact;
- rollback procedure; and
- verification evidence.

Having compliance tooling or older declarations on `master` does not satisfy this requirement. The declaration must cover the current PR's sensitive changes.

### 4. Rebase Onto Latest Master

Before final validation:

```powershell
git fetch bblabs
git rebase bblabs/master
```

After rebasing, verify the diff again:

```powershell
git diff --name-status bblabs/master...HEAD
git diff --check bblabs/master...HEAD
```

Do not resolve conflicts by replacing an entire file with a version from another branch. Resolve the smallest conflicting block and preserve both the latest `master` behavior and the approved feature behavior.

### 5. Run Focused Validation

Run tests and builds that directly exercise the changed behavior. For POS receipt changes, this includes:

```powershell
npm --prefix frontend test -- --run src/features/pos/__tests__/receiptContractConformance.contract.test.js
npm --prefix frontend run build:pos
npm --prefix frontend run build:skupervisor
```

Focused validation demonstrates that the feature itself works. It does not replace required repository-wide CI.

### 6. Run Repository-Wide CI Checks

Run the commands defined by `.github/workflows/ci.yml`, including:

```powershell
npm run lint:docs
node scripts/verify-release-verdict.js --file .tmp/release-gates/release_verdict.json --sha "<HEAD_SHA>" --allow-missing true
npm run audit:dependencies:prod
npm run audit:dependencies
npm --prefix backend run check:architecture-guardrails
npm --prefix backend run check:controller-boundaries
npm --prefix backend run check:compliance
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build:all
npm run check:frontend-budgets
```

Database-backed backend checks must use an isolated test database. Never point test migrations at production data.

### 7. Compare Failures Against Master

For each failing command:

1. Record the target `master` SHA.
2. Run the same command from a clean worktree at that SHA.
3. Run it again from the PR branch using the same Node version, dependencies, environment, and services.
4. Compare failing test names, error messages, and generated reports.

A failure is a baseline failure only when it reproduces on the exact `master` baseline. A failure that appears only on the PR branch belongs to the PR until proven otherwise.

### 8. Handle Baseline Failures

The preferred response is to fix baseline failures in a separate PR, merge that PR first, and then rebase the feature branch.

If an authorized maintainer must use an exception, the PR record must include:

- target `master` SHA;
- feature branch SHA;
- failing job and command;
- matching baseline error evidence;
- why the failure is unrelated to the changed files;
- focused validation results;
- issue or follow-up PR for remediation; and
- maintainer approval.

Do not waive security, compliance, migration, fiscal, authorization, or changed-surface failures merely because they are inconvenient.

### 9. Merge And Update Other Branches

After the smallest safe PR merges, every active branch should incorporate the new `master` before continuing:

```powershell
git fetch bblabs
git rebase bblabs/master
```

Merge small foundational changes first. Rebase dependent branches after every merge. This reduces repeated conflicts and prevents older branches from overwriting recently merged behavior.

## Recovery With Cherry-Pick

If the PR branch cannot be merged normally, an authorized maintainer can apply its isolated commit to a clean branch:

```powershell
git fetch --all
git switch -c codex/<recovery-branch> bblabs/master
git cherry-pick <approved-commit-sha>
```

Then rerun compliance and validation checks. Cherry-pick is a recovery mechanism, not a way to bypass review or CI.

To recover the scoped POS receipt and popup work from PR #21, the isolated commit is:

```text
00d1ffa9 Add POS receipt paper sizes and DGFY popup dismiss
```

## PR #21 Scope

PR #21 intentionally contains only:

- `docs/features/POS_RECENT_CHANGES_2026-06-17.md`
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- `frontend/src/features/pos/components/ReceiptPrintView.jsx`
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
- `frontend/src/features/pos/pages/TerminalPage.jsx`

The behavior added is limited to:

- an `X` dismiss button on the POS DGFY account reminder;
- `80mm (3 1/8 inches)` receipt width support;
- `57mm (2 1/4 inches)` receipt width support; and
- matching receipt width selection in POS and SKUpervisor.

It does not change Storefront routes, backend routes, authentication routes, or database migrations. Storefront failures can still appear because the CI workflow runs the complete frontend suite for frontend pull requests.

## PR #21 Validation Status

The focused validation completed for PR #21:

- POS receipt contract test passed.
- POS production build passed.
- SKUpervisor production build passed.
- The PR diff remained limited to five intended files.

The repository-wide checks also identified blockers:

- the POS changes require a new compliance impact declaration;
- dependency audits report existing vulnerable dependency trees;
- the backend matrix reports an auth registration `403` in `token_refresh_race.test.js`;
- full frontend lint and tests report failures outside the five-file PR scope; and
- frontend bundle budgets report missing or oversized chunks.

These failures must be compared against the exact `master` baseline before they can be classified as pre-existing. The missing compliance declaration belongs directly to PR #21 and must be resolved in the PR.

## Author Checklist

- [ ] Branch was created or rebased from latest upstream `master`.
- [ ] Diff contains only approved files.
- [ ] Commit message describes one feature.
- [ ] Compliance declaration exists when required.
- [ ] Focused tests pass.
- [ ] Affected application builds pass.
- [ ] Repository-wide CI was run.
- [ ] Baseline failures were reproduced on the exact target SHA.
- [ ] No changed-surface failure is being waived.
- [ ] PR description contains verification and rollback information.

## Maintainer Checklist

- [ ] Confirm the PR target and head SHAs.
- [ ] Review the complete file list and diff.
- [ ] Confirm required compliance evidence is present.
- [ ] Confirm focused tests cover the changed behavior.
- [ ] Confirm any claimed baseline failures reproduce on `master`.
- [ ] Require a remediation issue for every approved baseline exception.
- [ ] Merge the smallest independent PR first.
- [ ] Require dependent branches to rebase after merge.

## Recommended Handoff Message

Use this wording when requesting review of an isolated change:

> Please review and merge this PR only after its compliance declaration is present. Preserve the isolated feature commit while rebasing onto current `master`. Treat a failed check as a baseline failure only when the same command and error reproduce on the exact target `master` SHA. Do not waive failures related to changed POS files, security, compliance, migrations, or runtime contracts. Verify the focused POS receipt test and POS/SKUpervisor builds before merge.

## Decision Summary

The safest cross-branch strategy is:

1. isolate one feature per branch;
2. add its required governance evidence;
3. rebase onto latest `master`;
4. validate the changed surface;
5. compare broad CI failures against the exact baseline;
6. fix baseline failures separately or approve only documented, narrow exceptions; and
7. rebase all remaining branches after each merge.

This preserves approved changes while preventing unrelated branch content or unverified failures from entering `master`.
