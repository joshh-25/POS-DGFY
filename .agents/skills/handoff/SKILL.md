---
name: handoff
description: Create a timestamped, snapshot-only handoff for an explicitly requested transfer to another AI session. Use only for manual token-budget or session-boundary handoffs; never invoke automatically or as an orchestration loop.
---

# Manual Handoff

Use this skill only when the operator explicitly invokes `/handoff`, optionally as
`/handoff to codex`, `/handoff to claude`, or `/handoff to gemini`. It is a stop-and-snapshot
operation for a planning, implementation, review, or other session that needs to continue in a
separate AI session.

## Stop boundary

Treat the explicit invocation as a high-priority stop request. Let the current non-interruptible
tool call finish, then stop new feature work immediately. Do not start tests, refactors, cleanup,
or follow-up investigation. The only allowed work after that point is read-only state collection
and writing the one ignored handoff artifact.

This skill never:

- monitors token usage or triggers itself;
- commits, pushes, stashes, resets, cleans, force-pushes, or deletes anything;
- changes a pull request, issue, project board, merge state, or deployment;
- starts another CLI, agent, Orca worker, `/conduct` run, or orchestration loop.

## Snapshot procedure

1. Identify the current role from the active workflow: `planner`, `implementer`, `reviewer`, or
   `other`. Record `other` when the role cannot be established; do not invent one.
2. Record the current objective and context from the conversation and read-only repository state.
   Capture the issue and PR when known, otherwise record `none`.
3. Collect branch, worktree, HEAD, staged/unstaged/untracked status, changed paths, and known test
   results with read-only commands. Summarize file changes and status; do not copy file contents,
   credentials, tokens, cookies, or other secrets into the artifact.
4. Write exactly one new file at `.tmp/handoff-<issue-or-unknown>-<UTC timestamp>.md`. Include the
   format below. Use milliseconds or a numeric suffix if needed so repeated handoffs never replace
   an earlier artifact.
5. Print the artifact path and one copyable continuation command. Record the requested target
   runtime only; never launch it. If no target was requested, print a portable read-and-resume
   command. If the role is `other`, use the portable command even when a runtime was supplied.

## Artifact format

The artifact is local, ignored, and versioned as `dgfy-handoff/v1`:

```yaml
schema: dgfy-handoff/v1
generated_at: <UTC ISO-8601 timestamp>
source_runtime: codex | claude | gemini | unknown
target_runtime: codex | claude | gemini | unspecified
role: planner | implementer | reviewer | other
issue: <number or none>
pr: <number or none>
branch: <branch name>
worktree: <absolute path>
head: <commit sha>
working_tree: clean | dirty | unknown
```

The Markdown body must contain these sections, in this order:

```markdown
# Handoff: <objective>

## Completed work
## Interrupted or in-progress work
## Changed files and dirty-state summary
## Tests and results
## Blockers and unresolved decisions
## Exact next steps
## Requested target runtime
## Continuation command
```

Use `none` or `not recorded` explicitly for empty sections. The snapshot is evidence of where the
previous session stopped, not a replacement for the issue or authoritative repository docs.

## Continuation commands

Use the captured role and identifiers to print exactly one command for the requested runtime:

| Role | Codex | Claude |
|---|---|---|
| planner | `$planner <issue> @.tmp/handoff-<file>.md` | `/planner <issue> @.tmp/handoff-<file>.md` |
| implementer | `$implement @.tmp/handoff-<file>.md` | `/implement @.tmp/handoff-<file>.md` |
| reviewer | `$pr-reviewer <pr> @.tmp/handoff-<file>.md` | `/pr-reviewer <pr> @.tmp/handoff-<file>.md` |

For Gemini, or when no target runtime was supplied, print:

```text
Read `.tmp/handoff-<file>.md` and resume the captured <role> workflow for issue/PR <identifier>.
```

The receiving workflow must validate `dgfy-handoff/v1`, confirm its issue/PR and role match the
requested continuation, and treat the live issue and authoritative docs as the source of truth.
Missing or mismatched handoffs stop that workflow with a recovery instruction.

## Manual verification checklist

Before considering this skill complete, verify its instructions against dirty and clean/committed
worktrees, an active PR, an interrupted tool call, each explicit target runtime, and two repeated
handoffs. Confirm every artifact is distinct, state is captured without secrets, and no verification
case commits, pushes, cleans up, mutates GitHub state, launches another agent, or enters an
orchestration loop.

The canonical role contracts that consume this artifact are:

- `.agents/skills/planner/SKILL.md`
- `.agents/skills/implement/SKILL.md`
- `.agents/skills/pr-reviewer/SKILL.md`
