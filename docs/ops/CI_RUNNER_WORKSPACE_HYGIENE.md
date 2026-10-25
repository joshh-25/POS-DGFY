---
status: authoritative
authority_level: authoritative
owner: infra
last_reviewed: 2026-10-25
applies_to: self_hosted_runner_workspace_state
topic: ci_runner_workspace_hygiene
---

# CI runner workspace hygiene

Filed against #1528. Answers a narrower question than `CI_RUNNER_POLICY.md` (which decides *where*
a job runs): given a job **does** land on a self-hosted box, what state can it inherit from an
earlier, unrelated job on that same box, and how is that neutralized. Not a runbook for one
incident — `QUALITY_GATE_RUNNER_DIAGNOSTIC_RUNBOOK.md` is that, for a different failure class
(#1168) — this is the standing operational contract.

## Why this exists: persistent `_work` makes a sparse checkout permanent

Self-hosted runners (`sieitz-runner`, `sieitz-lg`) reuse one on-disk git workspace,
`_work/dgfy-platform/dgfy-platform`, across **every** job that lands on the box, from every
workflow — unlike a GitHub-hosted runner, which is thrown away after each job. A `sparse-checkout:`
on any self-hosted-reachable job therefore doesn't just narrow that one job's tree; it leaves
state behind for whichever job lands on the box next.

`actions/checkout` cannot self-heal this. Its own teardown, when a later job's checkout runs
against an already-sparse workspace, does two things in sequence:

1. `git sparse-checkout disable` — this writes `sparseCheckout = false` into
   **`.git/config.worktree`** (a per-worktree config file, active only while
   `extensions.worktreeConfig` is set).
2. `git config --local --unset-all extensions.worktreeConfig` — this makes git **stop reading
   `.git/config.worktree` at all**. The disable from step 1 becomes invisible, and the stale
   `core.sparseCheckout=true` left in the ordinary `.git/config` becomes authoritative again.

Net effect: sparse silently re-activates against whatever patterns are still sitting in
`.git/info/sparse-checkout`. #1528's originating pattern (`scripts` in **non-cone** mode) matched
any directory literally named `scripts` at any depth — so `infrastructure/docker/scripts` stayed
on disk while every sibling app directory (`dgfy-api`, `dgfy-ims`, `dgfy-pos`, `dgfy-storefront`,
`dgfy-migration-runner`) did not.

## Disk-pressure cleanup can delete active runner state (#2619)

This is a separate failure mode from sparse-checkout poisoning. Sparse-checkout leaves an
incomplete Git worktree behind; disk-pressure cleanup can delete files out from under a running
job.

In Promotion Quality Gate run [39283210177](https://github.com/Sieitzz/dgfy-platform/actions/runs/39283210177),
the `frontend-budgets-quality` job on `vm-openproject` lost `actions/checkout`, `actions/setup-node`,
and Node while the host's `disk-check.timer` ran `/usr/local/sbin/disk-check.sh`. At the 80% disk
threshold, its tier-two cleanup removed `_work/*` and `_diag/*`. The script's `runner_idle()`
heuristic compared `Running job:` and `completed with result` lines in the last 50 runner journal
entries. Runner logs emit two lines per job; an in-flight job could therefore leave 25 lines of
each kind in that window and be misclassified as idle. The buildx-process guard did not protect a
job that was not building an image. The issue comment records this evidence and the runner-side
timestamps.

The policy is to disable automatic cleanup of runner-owned state. A timer or process-presence check
cannot make deletion race-safe: another job can start after the check and before removal. Automatic
disk cleanup must not remove `_work`, `_diag`, GitHub action or tool caches, npm caches, Gradle
caches, or Gradle JDKs. Keep the existing 80% threshold and timer, Docker cleanup, oversized-log
handling, IDE cache cleanup, apt/journal cleanup, and persistent-high-usage warning. When those
actions do not recover enough space, an operator must use stopped-runner maintenance.

For manual runner-file maintenance:

1. Preserve `_diag` and other incident evidence needed for investigation before removing anything.
2. Use a planned maintenance window, stop the runner service, and confirm no job is active. A
   momentary process check alone is insufficient because a new job could start after the check.
3. Pause `disk-check.timer` before touching runner files. Wait for any already-running
   `disk-check.service` to finish. When replacing the script, install the reviewed replacement
   atomically and preserve the previous script as a backup with its owner and mode.
4. Validate the replacement before restoring the timer's previous enabled state. If validation
   fails, keep the timer paused and escalate; do not restore the unsafe script.
5. After maintenance, verify the installed script matches the reviewed content and checksum, the
   timer state is correct, and the runner returns online and idle.

The host script and timer are outside this repository. Issue [#2619](https://github.com/Sieitzz/dgfy-platform/issues/2619)
tracks applying the policy to both runner VMs and the follow-up gate evidence. This repository
change records the policy; it does not claim host remediation is complete. Keep #2619 open until
both hosts are verified and a full follow-up gate run has been inspected by job, step, and evidence
artifact. A green workflow summary alone is insufficient; the run must show no missing actions,
missing Node, runner-cache deletion, or other runner-side job failure.

The second symptom in run 39283210177, `frontend-storefront-quality` remaining `in_progress` after
the workflow completed, was not reproduced. GitHub later reported the job as completed/success, and
the runner-side log showed normal completion. Accept this symptom unless it recurs; no repository
code-level fix is claimed.

## Diagnosis signature

A poisoned workspace does not look broken by the tools you'd normally reach for first:

- **`git status` reports the tree CLEAN.** Skip-worktree entries are, by design, excluded from
  status output — there is nothing to see there.
- **The checkout step's own log looks successful** — `Updating files: 100% (N/N), done.` — because
  N is the sparse index's file count, not the full repo's tracked-file count. Compare against
  `git ls-files | wc -l` on a genuine full clone to see the gap.
- **The actual symptom surfaces downstream and confusingly**, e.g.
  `docker/build-push-action` failing with
  `ERROR: failed to build: resolve : lstat infrastructure/docker/<app>: no such file or directory`
  — a directory that plainly exists in the repo.
- **Failures are runner-scoped, not PR-scoped.** The same PR passes on the other box, or on a
  freshly re-cloned workspace. If a build-check fails identically across unrelated PRs but not
  consistently across runs of the same PR, suspect this before suspecting the PR's own diff.

Confirm with, on the affected box:

```bash
git config --local --list | grep -icE 'sparse|worktreeconfig'   # >0 means poisoned
git ls-files -v | grep -c '^[Sa-z]'                              # >0 means poisoned (skip-worktree/assume-unchanged bits)
cat .git/config.worktree 2>/dev/null                             # present but ignored once extensions.worktreeConfig is unset
```

## The standing defenses

Two runtime steps, present at every self-hosted-reachable job that checks out (enforced by
`scripts/check-workspace-hygiene.js`, `npm run check:workspace-hygiene`):

1. **Clear stale sparse-checkout state**, immediately *before* `actions/checkout` — disables
   sparse, unsets `core.sparseCheckout`/`core.sparseCheckoutCone`/`index.sparse`/
   `extensions.worktreeConfig`, removes `.git/info/sparse-checkout` and `.git/config.worktree`,
   and clears any surviving skip-worktree/assume-unchanged index bits. Best-effort — never exits
   non-zero; a fresh/hosted workspace with no `.git` is a silent no-op.
2. **Assert complete working tree**, immediately *after* `actions/checkout` — fails the job with a
   named, actionable error (naming the poisoned runner) if any skip-worktree entries or
   `core.sparseCheckout=true` survive. This turns a multi-minute, opaque `lstat` failure into a
   one-second, self-explanatory one. The three `pr-*-build-checks.yml` workflows add a second,
   narrower assertion for the exact Dockerfile path the build step is about to use.

**Why these are inline `run:` steps, duplicated at every site, not a composite action or a repo
script:** the clear step must run *before* checkout populates the workspace — but a local
composite action (`uses: ./.github/actions/...`) and a checked-in script both resolve from
`$GITHUB_WORKSPACE`, which is exactly what isn't there yet. The duplication this forces is
deliberate; `check-workspace-hygiene.js` enforces byte-identical bodies across every site, so it
does not silently drift. **Do not "clean this up" into a shared action** — that would reintroduce
the bootstrap ordering problem this doc exists to explain.

`scripts/check-workspace-hygiene.js` also forbids any `sparse-checkout:` site outside an explicit,
currently-empty allowlist — the repo has no legitimate use for one today.

## Manual sparse-checkout clearing procedure

Use only during planned maintenance after applying the stopped-runner, paused-timer, and evidence-
preservation requirements in the section above. An idle observation or process-presence check
alone is insufficient to prevent a new job from starting during cleanup. Order matters:
`sparse-checkout disable` must run **first**, while git still reads `.git/config.worktree`, so it
actually clears the skip-worktree index bits; only then remove the residual config/files.

```bash
WS=/home/github-runner/actions-runner/_work/dgfy-platform/dgfy-platform
# Stop the runner service and confirm no job is active before touching its workspace.
cp -a "$WS/.git/config" "$WS/.git/config.bak.$(date +%Y%m%d%H%M%S)"
git -C "$WS" sparse-checkout disable || true
for k in core.sparseCheckout core.sparseCheckoutCone index.sparse extensions.worktreeConfig; do
  git -C "$WS" config --local --unset-all "$k" 2>/dev/null || true
done
rm -f "$WS/.git/info/sparse-checkout" "$WS/.git/config.worktree"
git -C "$WS" ls-files -z | xargs -0 -n 500 git -C "$WS" update-index --no-skip-worktree || true
git -C "$WS" ls-files -z | xargs -0 -n 500 git -C "$WS" update-index --no-assume-unchanged || true
git -C "$WS" checkout-index --all --force
```

Verify:

```bash
git -C "$WS" ls-files -v | grep -c '^[Sa-z]'                            # expect 0
git -C "$WS" config --local --list | grep -icE 'sparse|worktreeconfig'  # expect 0
git -C "$WS" status --porcelain | grep -c '^ D'                         # expect 0
ls "$WS/infrastructure/docker"                                          # expect all app dirs present
```

**Fallback**, if any of the above misbehaves: keep the runner stopped, preserve any needed
diagnostics, and have the operator remove `"$WS"` during the same maintenance window. The next
job's `actions/checkout` re-clones from scratch (one full clone, ~1-2 minutes). Nothing in that
directory is authoritative, but removal is safe only while the runner remains stopped.

## Known residual window

`.github/workflows/deploy-main.yml`'s `guard-branch` job executes from whichever ref
`deploy-main.yml` was dispatched against — `main` for a PROD deploy. Until the sparse-checkout
removal (#1528) itself reaches `main` at the next promotion, a PROD deploy dispatch will re-poison
whichever box `guard-branch` lands on. This is expected and is exactly what the runtime guard above
exists to make harmless: the next PR job on that box clears the state before its own checkout runs,
rather than inheriting it. No separate `main` hotfix was cut for this — see
`CI_RUNNER_MIGRATION_HANDOFF.md`'s 2026-09-03 entry.
