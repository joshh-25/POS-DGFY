---
name: chain
description: Run one issue or repository-local Markdown campaign through Planner, Worker, and Reviewer tabs inside a single exact Orca-managed worktree with sequential ownership. Manual invocation only as /chain — Plan mode writes a ready dgfy-planner-handoff/v1 artifact and stops; Build mode continues through Worker PR, Reviewer feedback loops, and the existing pr-reviewer merge policy. Never merges independently, never deploys, never creates sibling role worktrees.
---

# Chain

A manually invoked `/chain` campaign for a single issue or repository-local
Markdown task. The coordinator owns the campaign while Planner, Worker, and
Reviewer tabs pass ownership through one exact Orca-managed worktree. This is
a preset over existing contracts — Planner (`planner`), Worker (`implement`),
Reviewer (`pr-reviewer`), and Orca's own `orchestration` skill — not a second
implementation of any of them.

`/conduct` (`.agents/skills/conduct/SKILL.md`) is unchanged by this skill:
Conduct keeps hierarchical and multi-worktree campaigns; Chain covers the
common single-target workflow where role-specific sibling worktrees are
clutter. Do not move Conduct content here and do not change Conduct to match.

## 1. Invocation and target resolution

```text
/chain 208 [--mode plan|build] [--planner cli:model[:effort]] [--worker cli:model[:effort]] [--reviewer cli:model[:effort]] [--no-auto-merge]
/chain @.tmp/plan-208.md [--mode plan|build] [...]
/chain 208 --plan | --build   (shorthand for --mode)
```

Parse with `scripts/chain-target.js` (`parseChainInvocation`) — never by hand:

- The target is an existing open GitHub issue/epic number (or `#number`) or a
  `@`-prefixed repository-local Markdown reference. Anything else is rejected
  before side effects; never infer a target from a title, branch, or nearby
  issue.
- Validate with `validateIssueTarget` (caller-supplied live issue state:
  `OPEN` proceeds, `CLOSED`/unknown fails closed) or `validateLocalRef`
  (repository-relative, stays inside the repo, names a `.md` file). A local
  reference the coordinator cannot read fails the target closed.
- Grammar after the single target positional is flags only (`--mode`,
  `--plan`/`--build`, `--planner`/`--worker`/`--reviewer`, `--no-auto-merge`).
  Unknown flags, duplicate specifications, conflicting modes, and extra
  positionals are errors, reported before any tab or worktree exists.

## 2. Modes

| Mode | Does | Stops before |
|---|---|---|
| `plan` (default) | Resolve target, read the same authoritative docs and code/tests `planner` requires, decide from evidence, write a decision-complete `dgfy-planner-handoff/v1` artifact (normally `.tmp/plan-<issue>.md`) | Code edits, Worker/Reviewer tabs, PR creation, merge, deploy |
| `build` | Same planning phase plus the full worker/reviewer campaign below | Merge past `pr-reviewer` policy, `main` merges, deploy |

Plan mode preserves `execution_route`, `target_branch`, and `hotfix` unchanged in the ready
artifact. A `hotfix`/`main` Build stops at `approve()`; `merge()` already refuses `main`.

The default is `plan`, and `parseChainInvocation` reports `modeSource:
default|explicit` — defaulting is documented here and observable in every
pre-dispatch report, so no mode ever silently creates a Worker/Reviewer tab.
Plan mode ends with the planner handoff shape (`/implement @.tmp/plan-<n>.md`
read-back included); a `needs-decision` plan withholds Build the same way
`planner` withholds implement.

## 3. Slot configuration and pre-dispatch report

Slot tuples reuse the Conduct convention (`cli:model[:effort]`) and the
existing parser — `resolveChainSlots` in `scripts/chain-target.js`, which
calls `scripts/conduct-model-slot.js` (`parseModelSlot`,
`resolveDispatchStrategy`, `formatReportRow`). The same canonical/legacy,
malformed-value, unavailable-CLI, and strategy-priority rules apply; a failing
slot fails the whole resolution closed. Never silently substitute the
coordinator runtime, CLI, model, or headless strategy. Unset slots are
reported as coordinator fallback (cheapest/fastest; reviewer differs from
builder), never guessed.

Before each next tab starts, report: resolved target, mode (+ source),
worktree selector, branch, the per-slot `{cli, model, effort, source,
strategy}` table, auto-merge setting, and current handoff state.

## 4. Topology: exactly one worktree

The first dispatch creates (or claims, for a coordinator-owned checkout) the
single Chain target worktree. Planner, Worker, Reviewer, and every feedback
round use its exact selector. Never create `issue-<n>-planner`,
`issue-<n>-worker`, or `issue-<n>-reviewer` sibling worktrees for one target.
Assert with `assertSingleWorktree` after every dispatch; more than one
distinct selector for one target is a hard stop, not a reconciliation.

For same-role, same-worktree, same-model follow-ups, reuse the retained
terminal (`--terminal <handle>`, dropping `--model`/`--effort`): the
terminal-reuse decision rule in `.agents/skills/conduct/SKILL.md` section 1.8
governs here unchanged — follow it by reference, it is not restated.

## 5. Sequential ownership gates

Only one editing agent acts in the shared worktree at a time. Enforce with
`scripts/chain-state.js` (`dgfy-chain-state/v1`); each gate names its
transition and required evidence:

| Handoff | Gate |
|---|---|
| Planner -> Worker | `plan-ready`: plan artifact recorded with status `ready` |
| Worker start | exact single-worktree selector recorded |
| Worker -> Reviewer | `review-active`: pushed PR number + branch recorded |
| Reviewer -> Worker follow-up | `feedback-pending`: durable structured findings + reviewer dispatch handle (`recordFeedbackRound`; raw terminal text is not a handoff) |
| Worker follow-up -> re-review | `review-active`: pushed addressing commit recorded (`recordAddressingCommit` requires `pushed: true`) |
| Reviewer -> done | `approve()`: canonical `APPROVE` verdict reference recorded |

`transition()` rejects anything out of order; wrapper-only targets
(`feedback-pending`, `approved`, `merged`, `stopped`, `blocked`) reject raw
transitions so evidence can never be skipped. History is append-only.

## 6. Review feedback loop

On `BLOCK` or actionable findings, send the substantive handoff through
structured Orca inbox mail to the retained Worker dispatch (the
`orchestration send --to dispatch:<id>` form from the freshly loaded
orchestration guide — the same durable channel Conduct uses), keep the same
PR and worktree, and loop section 5 until the canonical Reviewer verdict is
`APPROVE`. Raw terminal sends are never the feedback channel.

## 7. Merge, no-auto-merge, and never-deploy

Approved PRs merge only under `pr-reviewer`'s current merge policy — Chain
holds no merge implementation of its own: no bypassing pending checks, no
`--squash`, never `main` (`merge()` in `chain-state.js` enforces all three,
including the `main` refusal). `--no-auto-merge` stops after approval via
`stopAfterApproval()` with an explicit reason. Direct deployment is out of
scope in every mode; a deploy-shaped request stops and hands to a human.

## 8. Lifecycle evidence

Persist `dgfy-chain-state/v1` JSON to an ignored local state file (normally
`.tmp/chain-<issue>.json`; `.tmp/` is ignored — never force-add it) after
every transition, and `summarize()` it in the closing report: target, mode,
worktree selector, slot tuples/strategies, plan path/status, tab/terminal
handles, dispatch IDs, branch/PR, every feedback round with its addressing
commit, verdicts, merge result or explicit stop, and any unresolved blocker.
A paused campaign recovers from this file (`deserialize` fails closed on
foreign versions) — never from terminal titles or tab order. Do not commit
secrets, transcripts, or transient handles to tracked files.

## 9. Failure and recovery

`block()` records the unresolved blocker with its resumable state and stops
before the next owner; missing evidence is treated as unresolved, never
inferred from tabs. `resume()` returns to the recorded prior state with a
reason. Orca capability/flag drift, unreadiness, trust, or injection failures
fail closed per the freshly loaded orchestration guide — compare
requested/effective launch fields and never encode current handles or stale
commands in tracked files.

## 10. First live run

The first live Build-mode `/chain` run is report-only regardless of outcome:
produce the target/mode/worktree/slot report, the ready plan, and the exact
dispatch preview, withhold Worker/Reviewer dispatch, and let a human confirm
before it runs dispatched. Auto-dispatch goes live after that calibration,
mirroring every other roster role.

## Reference files

- `scripts/chain-target.js` — target/mode/slot/topology decisions (pure).
- `scripts/chain-state.js` — `dgfy-chain-state/v1` lifecycle machine (pure).
- `scripts/chain-target.test.js`, `scripts/chain-state.test.js` — contract
  coverage; run via `npm run test:chain-target`, `npm run test:chain-state`.
- `.agents/skills/planner/SKILL.md`, `.agents/skills/implement/SKILL.md`,
  `.agents/skills/pr-reviewer/SKILL.md` — the reused role contracts.
- `.agents/skills/conduct/SKILL.md` sections 1.1–1.5, 1.8 — slot parsing,
  dispatch tiers, and the terminal-reuse rule, followed by reference.
