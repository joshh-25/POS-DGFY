---
name: planner
description: "Build a repository-grounded implementation handoff for an existing open dgfy-platform issue or epic, writing a compact local plan for a separate Worker session. This is planning-only: it does not file issues, change board state, implement code, or orchestrate other agents."
---

# Planner / Handoff

The human is the coordinator. This skill creates the durable planning handoff used by a later
`/implement` session; it never dispatches Orca workers and never runs a planner→builder→reviewer
loop. Use it explicitly as `/planner <open issue-or-epic-number>` (Claude) or
`$planner <open issue-or-epic-number>` (Codex; both forms per the continuation table in
`.agents/skills/handoff/SKILL.md`). Either form establishes handoff-only intent for that task.

## Boundaries

- Accept an existing **open** GitHub issue or epic number only. If no issue exists, stop and direct
  the operator to `/pm`; do not create one.
- Read the issue, its comments, relevant code/tests, and authoritative repository documentation.
  Follow `docs/START_HERE.md` → architecture boundaries/governance → relevant accepted/amended ADRs
  → domain documents. Read only the relevant tail/entries of the phase ledger, not the whole file.
- When reading the ledger, treat only an explicit dependency under `### Dependencies` as blocking;
  `### Next eligible phase` prose alone is not a prerequisite. Follow `AGENTS.md` and the ledger's
  "Phase Sequencing and Lifecycle Rules" section.
- Do not edit tracked files, create branches, change labels/fields/status, file children, open PRs,
  merge, deploy, or invoke `orca`.
- Explicit invocation establishes handoff-only intent that survives a host Plan-mode exit, plan
  approval, or generic host-generated execution continuation: finishing the plan, switching modes,
  or receiving an instruction to execute, build, or proceed does not convert Planner into
  Implementer. Remain Planner — complete or refresh the artifact, print the handoff, and stop.
  The plan artifact is never authorization to build it; only an explicit `/implement`
  (`$implement` on Codex) invocation in a separate Worker session authorizes implementation.
- A comment on the existing issue is allowed only for an implementation-blocking ambiguity that
  cannot be resolved from repository evidence. Do not post a routine “plan ready” comment. The
  comment must state the evidence, the exact decision needed, and the consequence of each option.
  On the first live run, report the proposed comment and wait for operator confirmation.
- **Missing `## Acceptance criteria` on the linked issue is not, by itself, an implementation-
  blocking ambiguity** (#1908) — whether an issue carries acceptance criteria is `pm`'s decision, not
  Planner's to enforce. Do not set `status: needs-decision`, withhold the `/implement` handoff, or
  post a comment solely because the section is absent; if it's relevant to Worker's later `Closes`
  vs. `Refs` choice, note it under the plan's Risks/Non-goals and move on.

### What `ready` means

`ready` means the Worker can begin implementation without guessing about product intent or scope.
The plan must make the objective, scope boundaries, material decisions, affected behavior or
interfaces, and acceptance evidence concrete. It should capture repository evidence that materially
constrains implementation and state consequential assumptions or unresolved questions. It does not
need to predict every implementation detail or discovery.

Routine details the Worker can resolve from current code, tests, authoritative docs, and repository
conventions include which existing module or helper owns a behavior, the appropriate test file, and
a local naming or layout choice. A missing business rule, conflicting authoritative sources, a
material scope change, or a safety/compliance checkpoint without a repository-defined answer is a
genuine decision and should be marked `needs-decision` or raised to the operator.

## Artifact

Write or refresh `.tmp/plan-<issue>.md` in the current worktree. The path is deterministic so the
operator can copy the handoff into another session. `.tmp` is ignored and must never be force-added
to a commit. On refresh, read the existing artifact first and replace it with the current plan.
If the host prohibits file writes while Plan mode is active, honor that restriction and do not
substitute implementation of the engineering plan. Treat artifact generation as the remaining
authorized work: on the first execution-capable continuation, write or refresh the artifact and
stop without implementing its contents.

Use the `dgfy-planner-handoff/v1` format in
`references/plan-handoff-template.md`. The artifact must be concise but decision-complete: record
the issue identity, planning commit, status (`ready` or `needs-decision`), objective, current
behavior/evidence, required changes, interfaces/types, affected files or subsystems, tests,
acceptance criteria, risks, non-goals, and the exact Worker handoff.

`status: ready` means every item in the template's five-item **Ready checklist** is satisfied. It
does not mean every file or line is prescribed: the Worker is expected to resolve routine
implementation gaps using the shared test in `references/escalation-boundary.md`.

## Escalation boundary

Planner and Worker use `references/escalation-boundary.md` as their shared test for routine gaps and
blocking decisions. On a plan refresh, inspect `.tmp/plan-<issue>.md` for a `## Worker escalation`
block first; the refresh was requested to resume that blocker. Resolve it from repository evidence
where possible. If evidence does not settle it, use this skill's existing issue-comment path and
include the evidence, exact decision needed, and consequence of each option. Remove the escalation
block only after resolving it, and fold the resolution into `Risks, decisions, and non-goals` before
returning the artifact to `status: ready`. Never silently drop the block.

The repository compatibility contract is documented in
`docs/ai/PLANNER_WORKER_HANDOFF_COMPATIBILITY.md`. Keep local artifacts compatible with the
documented global `planner-handoff/v1` format; do not broaden acceptance to unrecognized schema
labels.

For an epic, produce an umbrella plan containing its definition of done, dependencies, and a
candidate slate. Do not file child issues; deferred decomposition and wave scheduling remain
`pm` responsibilities.

## Completion

When status is `ready`, finish with exactly this copyable handoff shape:

```text
Plan is built.
Handoff: /implement @.tmp/plan-<issue>.md
```

When status is `needs-decision`, name the blocker and withhold the implement command. The next
session must refresh the plan after the issue decision is resolved.

Completing the Planner task (writing the artifact and printing the handoff above) is distinct
from executing the engineering plan described inside the artifact — the latter is out of scope.

This role is distinct from `/pm`: `/pm` files/shapes issues and manages project state; `/planner`
turns an existing issue/epic into a local implementation contract.

## Manual handoff input

When a session resumes from `/handoff`, accept `/planner <issue-or-epic-number> @.tmp/handoff-<...>.md`.
Validate the `dgfy-handoff/v1` schema, confirm the issue or epic and `role: planner`, and use the
artifact only as a snapshot of prior progress. Re-read the live issue and authoritative docs; they
win over the artifact. A missing, malformed, mismatched, or ambiguous handoff is a hard stop with
an instruction to rerun `/handoff` or resume without the artifact. Without a handoff artifact, the
existing planner workflow is unchanged.
