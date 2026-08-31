# Conduct

Runs a task, issue, or multi-phase epic through Orca's `orchestration` skill, pre-configured with
which model plans, builds, and reviews. Functionally the same as calling `/orchestration`
yourself — same worktree, same repo, same Orca mechanics — just with the model selection filled
in so it doesn't need repeating every time.

## Resolve the models

Three env vars (`env | grep -E '^(WORKER_PLANNER|WORKER_BUILDER|REVIEWER)='` — not injected
automatically, check for real):

- `WORKER_PLANNER` — plans before code is written.
- `WORKER_BUILDER` — writes, commits, opens the PR.
- `REVIEWER` — reviews the PR.

Shape: `model:effort` (effort optional), e.g. `claude-opus:high`.

An explicit instruction in the invocation overrides its matching slot for that run only — e.g.
"use opus for planning" overrides `WORKER_PLANNER` without touching the other two slots or the
env var itself.

If a slot is unset and not overridden: pick the cheapest/fastest available model for
planner/builder, and a different model or tier for reviewer than whatever built it — never the
same model reviewing its own work. State which model landed in each slot and why (env var,
override, or fallback) before dispatching.

## Compose the campaign

Fill this template with the resolved models and the task/issue/epic the user described, then hand
it to Orca's `orchestration` skill exactly as if the user had typed it themselves after
`/orchestration`:

```
Conduct the following for this worktree's task/epic into sub-worktrees:
- Worker Planner using <WORKER_PLANNER model>
- Worker Execution using <WORKER_BUILDER model>
- pr-reviewer using <REVIEWER model>
- If the reviewer's verdict is not APPROVE, the same worker addresses the feedback
- Keep addressing feedback until the final verdict is APPROVE

<what to build/fix/review, from the user's request>
```

## Run it

Load Orca's own orchestration guide fresh every time (`orca skills get orchestration` — never
from memory) and follow its Preferred Supervised Worker Loop to run the campaign above exactly as
if `/orchestration` had been typed directly: `run-create` once, `task-create` per phase/step,
`worker-start --agent <cli> --model <model> [--effort <effort>]` per resolved slot, `check --wait`
until every dispatch settles. Run the commands the loaded guide actually returns — don't
paraphrase or reimplement them from a remembered grammar.

Real dispatched output only: a `worker_done` message, a review comment a worker actually posted.
Narrating what a worker "would" produce is never a substitute for waiting on it.

This is a preset for Orca, not a second implementation of it — no fallback mode of its own. If
Orca isn't available in this environment, say so and stop.
