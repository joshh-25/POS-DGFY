---
name: planner
description: "Build a repository-grounded implementation handoff for an existing open dgfy-platform issue or epic, writing a compact local plan for a separate Worker session. This is planning-only: it does not file issues, change board state, implement code, or orchestrate other agents."
---

# Planner / Handoff

The human is the coordinator. This skill creates the durable planning handoff used by a later
`/implement` session; it never dispatches Orca workers and never runs a planner→builder→reviewer
loop. Use it explicitly as `/planner <open issue-or-epic-number>`.

## Boundaries

- Accept an existing **open** GitHub issue or epic number only. If no issue exists, stop and direct
  the operator to `/pm`; do not create one.
- Read the issue, its comments, relevant code/tests, and authoritative repository documentation.
  Follow `docs/START_HERE.md` → architecture boundaries/governance → relevant accepted/amended ADRs
  → domain documents. Read only the relevant tail/entries of the phase ledger, not the whole file.
- Do not edit tracked files, create branches, change labels/fields/status, file children, open PRs,
  merge, deploy, or invoke `orca`.
- A comment on the existing issue is allowed only for an implementation-blocking ambiguity that
  cannot be resolved from repository evidence. Do not post a routine “plan ready” comment. The
  comment must state the evidence, the exact decision needed, and the consequence of each option.
  On the first live run, report the proposed comment and wait for operator confirmation.

## Artifact

Write or refresh `.tmp/plan-<issue>.md` in the current worktree. The path is deterministic so the
operator can copy the handoff into another session. `.tmp` is ignored and must never be force-added
to a commit. On refresh, read the existing artifact first and replace it with the current plan.

Use the `dgfy-planner-handoff/v1` format in
`references/plan-handoff-template.md`. The artifact must be concise but decision-complete: record
the issue identity, planning commit, status (`ready` or `needs-decision`), objective, current
behavior/evidence, required changes, interfaces/types, affected files or subsystems, tests,
acceptance criteria, risks, non-goals, and the exact Worker handoff.

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

This role is distinct from `/pm`: `/pm` files/shapes issues and manages project state; `/planner`
turns an existing issue/epic into a local implementation contract.

## Manual handoff input

When a session resumes from `/handoff`, accept `/planner <issue-or-epic-number> @.tmp/handoff-<...>.md`.
Validate the `dgfy-handoff/v1` schema, confirm the issue or epic and `role: planner`, and use the
artifact only as a snapshot of prior progress. Re-read the live issue and authoritative docs; they
win over the artifact. A missing, malformed, mismatched, or ambiguous handoff is a hard stop with
an instruction to rerun `/handoff` or resume without the artifact. Without a handoff artifact, the
existing planner workflow is unchanged.
