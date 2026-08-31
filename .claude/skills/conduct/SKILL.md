---
name: conduct
description: Sequence implement/pr-reviewer/promoter across a multi-phase epic or initiative, in parallel or serial worktrees, with per-slot model selection. Manual invocation only.
disable-model-invocation: true
---

# Conduct

Manual-only dispatcher. This skill never fires from prompt phrasing alone — Claude does not see
its name/description unless you type `/conduct` yourself
(`disable-model-invocation: true`, confirmed against Claude Code's own skills docs as the actual
enforcement mechanism, not a soft "don't infer this" instruction). That's deliberate: this skill
can spin up worktrees and dispatch real work, and it should only ever run because you asked for
it, not because a prompt happened to phrase-match.

**This skill sequences existing roles. It does not redefine them.** Every rule in `AGENTS.md` and
in `implement`/`pr-reviewer`/`promoter`'s own `SKILL.md` files — Merge Safety, checkpoint
policies, never-`--squash`, the `main`-branch protections, first-live-run report-only calibration
— applies unchanged here. `conduct`'s only job is: which worktree does which phase run in, and
which model executes each role's own procedure.

## What this skill does not do

- Does not implement code itself — that's `implement`'s job, invoked per phase/issue.
- Does not review or merge PRs itself — that's `pr-reviewer`'s job, invoked per PR.
- Does not decide promotion/deploy policy — that's `promoter`'s job.
- Does not carry any personal, machine-specific, or vendor-specific configuration. Nothing in this
  file names a specific model version as anything other than an illustrative example — real
  values live in the invoking user's own shell environment (see "Model selection" below), never
  in this repo.

## Step 1 — Read the model-selection env vars

Three environment variables, read at invocation time via Bash (`env | grep -E
'^(WORKER_PLANNER|WORKER_BUILDER|REVIEWER)='` — they are not injected automatically, this skill
must actually check):

- `WORKER_PLANNER` — the model (+ optional effort) that plans each phase before `implement`
  writes code. Shape: `model:effort` (e.g. `claude-opus:high`) — pick this delimiter consistently
  so the value parses cleanly as a shell env var; avoid unquoted spaces or parentheses in the
  value.
- `WORKER_BUILDER` — the model that executes `implement`'s workflow (branch, code, commit, PR).
- `REVIEWER` — the model that executes `pr-reviewer`'s procedure against the resulting PR.

**If any are unset, do not fall back to a hardcoded model-name table.** Specific model codenames
go stale fast — this repo already flags that exact trap elsewhere (`docs/ai/CLAUDE.md`'s own
staleness disclaimer). Apply a rule instead:

1. Identify what's actually available in this environment (installed CLIs / configured models).
2. For `WORKER_PLANNER` and `WORKER_BUILDER`: prefer the cheapest/fastest capable tier available.
3. For `REVIEWER`: deliberately pick a **different tier or family from the builder**, never the
   same model used for building. Rationale to state when this fires: a reviewer sharing the
   builder's exact model and context is more likely to share its blind spots and rationalizations
   — the same reasoning `pr-reviewer`'s own `SKILL.md` gives for running in an isolated context
   rather than reviewing in-place.
4. Say out loud which models were selected and why (env var vs. fallback rule) before proceeding
   — never silently pick without stating it, since this determines both cost and review quality.

## Step 2 — Detect an orchestration substrate

No dedicated env var for this (deliberately — it's discoverable, so it doesn't need one). Check,
in order:

1. The current session's own available-skills/agents listing for a known orchestration substrate
   (e.g. Orca's `orchestration`/`orca-cli` skills). This list is already visible each session —
   read it, don't assume.
2. `command -v orca` (or the equivalent for another known substrate) via Bash, if the listing is
   inconclusive.

**If found:** dispatch phases through that substrate's own primitives (worktree/session
management, task handoff) rather than reimplementing them here.

**If not found:** run the same role sequence **serially, in this session**, using plain
`git worktree add ../<repo>-<label>` per phase (sibling layout — matching `implement`'s own
convention, never nested inside another worktree's directory tree). State explicitly that no
orchestration substrate was found and serial mode is in use — never degrade silently, never error
opaquely.

## Step 3 — Run the sequence, per phase or per issue

For a single scoped issue:

1. `pm` — confirm an issue exists (search first, per `pm`'s own discipline); file one if not.
2. `implement`, using `WORKER_PLANNER` to plan and `WORKER_BUILDER` to execute — branch off fresh
   `origin/develop` in its own sibling worktree, implement, commit, push, open the PR. `implement`
   stops there; it never merges its own PR.
3. `pr-reviewer`, using `REVIEWER` — audits the PR per its own fixed comment format and merge
   policy table. Loop: `implement` addresses blockers, `pr-reviewer` re-reviews, until `APPROVE`
   or a genuine escalation.
4. Only once `APPROVE` and this repo's Merge Safety conditions hold does the merge happen, per
   `pr-reviewer`'s own merge-policy table — `conduct` does not add a second merge path or a looser
   condition than that table already states.
5. Hand off to `promoter` only when the user has actually asked for promotion as part of this
   conduct run — never assume a phase landing on `develop` should auto-promote.

For an epic with multiple phases: run phases in parallel sibling worktrees where genuinely
independent (no shared file/schema overlap between phases); run them in series where a later
phase depends on an earlier one's merged result. State which mode was chosen for which phase and
why — this is a judgment call each time, not a fixed rule.

## First live use

Report-only, regardless of outcome — same calibration every other role in this roster used before
running unattended (`implement`, `pr-reviewer`, `observer`, `verifier`, `promoter`, `notes`). Plan
and narrate the full sequence — model selection, substrate detection, phase ordering — but stop
before any branch is cut or any role is actually invoked, and let the user confirm before it runs
for real.
