# Cleanup lifecycle — manual dry-run checklist

There is no live-Orca automated coverage for the actual `orca orchestration worker-release` /
`orca worktree rm` calls (see `scripts/conduct-cleanup-policy.js`'s header comment for why — it
needs a real runtime, real dispatches, real worktrees; only the pure decision logic is unit-tested,
in `scripts/conduct-cleanup-policy.test.js`). This checklist is the manual substitute: a fixed,
repeatable procedure for the same four scenarios that file covers, run once per behavior change to
this section — and, if the report-only calibration below is in force, this literally *is* the
content of that first live run's report.

**Report-only calibration** (SKILL.md section 1.9): the first live run of the cleanup lifecycle
reports what it *would* close/remove, but does not actually call `worker-release` or `worktree rm`
— mirroring the calibration every other roster role carries
(`implement`/`pr-reviewer`/`observer`/`verifier`/`promoter`/`incident-responder`/`notes`) before
being trusted to auto-delete anything, given `worktree rm`'s branch-deletion side effect.

## 1. Success cleanup

Setup: a dispatch this run created (`worker-start --worktree new-child`), its `worker_done`
already reported success, and the role-appropriate handoff evidence is recorded (PR opened for a
Builder, plan captured for a Planner, review verdict comment confirmed for a Reviewer).

1. `orca orchestration worker-list --terminal-state active` — confirm the dispatch is **not** in
   this list.
2. `git -C <worktree path> status --porcelain` — confirm empty.
3. For a Builder role: `git -C <worktree path> log @{u}.. --oneline` — confirm empty (nothing
   unpushed), and confirm a PR is actually open (`gh pr view <branch>` or the recorded PR URL).
4. `orca orchestration worker-release --dispatch <dispatch_id>` — expect success (or
   `already_released` if this is a repeat run).
5. `orca worktree rm --worktree <selector>` — no `--force`. Expect success.
6. Expected report line: `Sessions closed: <dispatch_id> (<role>)` and
   `Worktrees removed: <selector> (<role>)`.

## 2. Active-worker refusal

Setup: a dispatch whose terminal is still active (a real in-flight worker, or simulate by picking
one from `orca orchestration worker-list --terminal-state active`).

1. Confirm `worker-list --terminal-state active` actually lists it.
2. Do **not** call `worker-release` or `worktree rm` for this target.
3. Expected report line: `Retained: <dispatch_id> — still active`.

## 3. Dirty-worktree refusal

Setup: a worktree this run created, with an uncommitted local edit (`echo x >> some-file` inside
it, uncommitted).

1. `git -C <worktree path> status --porcelain` — confirm **not** empty.
2. Do **not** call `orca worktree rm` for this target (the session may still close, per section
   1.8's rule that session-close and worktree-removal are independent decisions).
3. Expected report line: `Retained: <selector> — dirty`.

## 4. Unrelated-root protection

Setup: the current/root worktree, or any worktree/session this run did not itself create.

1. Confirm it is absent from this run's own tracking list (never inferred by scanning
   `orca worktree list` for "things that look temporary").
2. Do **not** call `worker-release` or `worktree rm` for it, even if `git status --porcelain` on
   it happens to be clean — the "not created by this run" check is unconditional and comes before
   any cleanliness check.
3. Expected report line: `Retained: <selector or dispatch_id> — not created by this run`.
