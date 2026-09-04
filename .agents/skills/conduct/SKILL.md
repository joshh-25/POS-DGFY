---
name: conduct
description: Run a task or epic through Orca's orchestration skill, pre-configured with which model — and which CLI/provider — plans, builds, and reviews, per-slot. Supports manual invocation and explicit promoter-originated frozen-candidate repair handoffs; not one of #331's four named roster roles, and carries no Claude Code shim.
---

# Conduct

Runs a task, issue, or multi-phase epic through Orca's `orchestration` skill, pre-configured with
which model — and which CLI/provider — plans, builds, and reviews. Functionally the same as
calling `/orchestration` yourself — same worktree, same repo, same Orca mechanics — just with the
model selection filled in so it doesn't need repeating every time.

## 1.1 Resolve the models

Three env vars (`env | grep -E '^(WORKER_PLANNER|WORKER_BUILDER|REVIEWER)='` — not injected
automatically, check for real):

- `WORKER_PLANNER` — plans before code is written.
- `WORKER_BUILDER` — writes, commits, opens the PR.
- `REVIEWER` — reviews the PR.

**Canonical syntax**: `cli:model[:effort]` — `cli` is required, `effort` is optional. Example:
`claude:claude-sonnet-5:high`.

**Legacy syntax (transition period, still accepted)**: `model[:effort]` — no CLI segment.
Example: `claude-sonnet-5:high`.

**Disambiguation algorithm** — apply this exactly, per slot, before anything else runs:

1. Split the slot value on `:`.
2. Reject if any segment is empty, or if there are more than 3 segments — this is a malformed
   value; fail before dispatch, naming the exact slot and value.
3. If there are 2+ segments **and segment 1 matches a currently known Orca dispatch agent id**
   (source: section 1.2 below) → **canonical**. `cli = segment 1`, `model = segment 2`,
   `effort = segment 3` if present.
4. Otherwise (1 segment, or segment 1 doesn't match a known agent id) → **legacy**.
   `model = segment 1`, `effort = segment 2` if present. The CLI is *inferred* (section 1.3
   below) — never guessed as segment 1.
5. State the resolved `{cli, model, effort, source}` for that slot before moving on — this feeds
   directly into section 1.4's report table, not a separate step.

**Worked example, mechanism named**: `claude-sonnet-5:high` is legacy because `claude-sonnet-5`
isn't a recognized CLI id (`claude` is) — rule 3 fails to match, rule 4 applies. This is not a
special-cased exception; it's what the general rule already produces given that input.

`scripts/conduct-model-slot.js` implements this algorithm deterministically — run it rather than
parsing informally in-context:

```sh
node scripts/conduct-model-slot.js "$WORKER_PLANNER" \
  --known-clis claude,codex,opencode,gemini,droid,grok,cursor --default-cli claude
```

See `references/model-slot-parsing-examples.md` for the full worked-example table (canonical,
legacy, malformed, unavailable CLI, per-slot override).

## 1.2 CLI validation

Before any dispatch, validate the resolved `cli` for every slot against the **currently available
Orca dispatch agents** — sourced from the same freshly-loaded orchestration guide section 1.8
already makes mandatory (`orca skills get orchestration`, never from memory), specifically its
documented group-address roster (excluding the non-agent addresses `@all`, `@idle`,
`@worktree:<id>`). **This file does not enumerate that list** — read it from the guide loaded this
run, every run, so it drifts with Orca's own available agents, not with this repo. Pass it to
`scripts/conduct-model-slot.js` as `--known-clis`.

If a resolved `cli` isn't on that list (e.g. `copilot`, if it isn't currently dispatchable in this
environment) → **fail before dispatch** with a clear per-slot configuration error. Never
substitute a different CLI silently.

This is a pre-dispatch gate, not a per-worker-start error handler — nothing in section 1.4's report
or the campaign template (section 1.7) should ever reference a slot that failed this check; the
whole run stops first.

## 1.3 Legacy CLI inference

"Current/orchestrator default" = the CLI the *conducting* session itself is running as. Reuse
`scripts/ai-attribution.js`'s runtime-identity extraction (`claude-code`, `codex`, `opencode`,
`cursor`, `antigravity`) rather than inventing a second detection mechanism — this session's own
runtime is already recorded at session start (see the `AI attribution recorded for this session`
signal, or read the record directly per that script's own `format`/`record` commands). Map the
runtime label to the matching dispatch-agent id: `claude-code` → `claude`, `codex` → `codex`,
`opencode` → `opencode`, `cursor` → `cursor`. `antigravity` has no corresponding Orca dispatch
agent id today — treat it the same as "detection unavailable" below.

If that detection is unavailable, fall back to Orca's own default agent signal if the freshly
loaded orchestration guide names one at invocation time. If neither resolves, this is a hard
stop — report the ambiguity per-slot rather than guessing.

## 1.4 Pre-dispatch report

Every slot, every run, before any `worker-start` call — produced by
`scripts/conduct-model-slot.js`'s `formatReportRow`:

| Slot | CLI | Model | Effort | Source |
|---|---|---|---|---|
| WORKER_PLANNER | claude | claude-sonnet-5 | high | env (canonical) |
| WORKER_BUILDER | claude | claude-sonnet-5 | medium | invocation override (canonical) |
| REVIEWER | claude | gpt-5.6-luna | medium | env (**legacy** — no CLI segment; CLI inferred from orchestrator default `claude`, not asserted by the user — verify) |

`Source` always names one of: `env` / `invocation override` / `fallback (slot unset)`, each
tagged `(canonical)` or `(legacy — CLI inferred from <basis>)`. A legacy row is never silently
indistinguishable from a canonical one — the "verify" callout is mandatory text, not optional
flourish, since an inferred CLI is a guess about intent even when the mechanism itself is
deterministic.

## 1.5 Invocation modes and target resolution

Conduct is an Orca-only invocation contract. It interprets the user's invocation, resolves the
target, and hands the resulting campaign to the freshly loaded Orca orchestration guide; it does
not add a second executable or fallback orchestration implementation.

When the first positional argument is an identifier and no explicit mode is supplied, inspect the
GitHub object before dispatching:

- An open issue selects a full Conduct campaign: plan, build, review, feedback loop, and the
  handoff governed by the existing `pr-reviewer` policy.
- An open pull request selects a PR-review campaign using the Reviewer slot only.
- An identifier that is neither a usable issue nor PR is a hard stop; do not guess from a branch,
  title, or nearby issue.

Explicit modes are:

```text
/conduct campaign 1511
/conduct pr-reviewer 1512
/conduct waves
/conduct waves [2,5,7]
/conduct wave 2
/conduct phase 15-B
```

`campaign` requires an issue or epic. `pr-reviewer` requires a PR. `waves`, `wave`, and `phase`
resolve their umbrella and phase definitions from the current bound Orca Run/worktree context;
they fail before dispatch when that context is absent, stale, or identifies more than one campaign.
Do not scan arbitrary worktrees or infer a campaign from unrelated repository files.

`waves` without a list runs all prepared waves. A list selects only those wave numbers. `wave`
runs one wave, and `phase` runs one prepared phase identifier. The phase plan/ledger remains the
source of dependency and ordering information; Conduct does not invent phase numbers.

### Promoter-originated promotion-repair handoff

The promoter may explicitly hand a frozen-candidate staging repair to Conduct after filing or
identifying the repair issue. The handoff must include the candidate ID, exact current staging SHA,
failure evidence, repair issue, and required branch `fix/staging/<candidate_id>-rN`. Conduct may
address code-level defects, tests, migrations, API/UI behavior, or CI. It must stop and return the
task for human coordination when the proposed repair requires live database work, secrets, SSH, or
infrastructure operations. It must not broaden the repair by merging newer `develop` work into the
candidate. The normal planner/builder/reviewer sequence, PR rules, and report-only first-live
calibration still apply.

### Review-only ownership

For `/conduct pr-reviewer <PR>` with an explicit Reviewer model/provider override, the conducting
session remains the Builder/feedback owner by default. Conduct dispatches only the Reviewer to its
own review worktree; it does not create a separate Builder worker or Builder worktree. This is the
expected shape when a Codex session asks Claude to review a PR authored by the current session.

The conducting session must be on the PR's branch/worktree, or must have an explicitly selected
PR worktree, before it edits feedback. On `BLOCK` or actionable feedback, the conducting session
addresses the findings, commits and pushes the PR according to the Worker rules, and requests a
re-review from the same retained Reviewer terminal/worktree. It must not dispatch a second Builder
just because the Reviewer uses a different model/provider. If the current session is not safely
positioned to edit the target PR, stop before dispatch and report the required worktree.

## 1.6 Invocation-time overrides

An explicit instruction in the invocation overrides its matching slot for that run only — e.g.
"use opus for planning" overrides `WORKER_PLANNER` without touching the other two slots or the
env var itself. The override value goes through the **exact same parser** as sections 1.1–1.3 —
same malformed/unavailable-CLI checks apply, same report row shape. There is no second, looser
parsing path for overrides.

If a slot is unset and not overridden: pick the cheapest/fastest available model for
planner/builder, and a different model or tier for reviewer than whatever built it — never the
same model reviewing its own work. State which model landed in each slot and why (env var,
override, or fallback) before dispatching, per section 1.4's table.

In review-only ownership mode, the Builder slot is not dispatched: the conducting session is the
Builder and its runtime identity is reported separately from the Reviewer worker's resolved slot.

## 1.7 Compose the campaign

Fill this template with the resolved `{cli, model, effort}` tuples from sections 1.1–1.6 and the
task/issue/epic the user described, then hand it to Orca's `orchestration` skill exactly as if the
user had typed it themselves after `/orchestration`. The `<WORKER_PLANNER model>`-shaped
placeholders below are the literal resolved values from the pre-dispatch report — not a
paraphrase, and this is exactly what feeds each slot's `worker-start` call in section 1.8:

```
Conduct the following for this worktree's task/epic into sub-worktrees:
- Worker Planner using <WORKER_PLANNER cli>:<WORKER_PLANNER model>[:<WORKER_PLANNER effort>]
- Worker Execution using <WORKER_BUILDER cli>:<WORKER_BUILDER model>[:<WORKER_BUILDER effort>]
- pr-reviewer using <REVIEWER cli>:<REVIEWER model>[:<REVIEWER effort>]
- Use the topology selected by the invocation: one shared child worktree for a single target, or
  one child worktree per phase for a wave campaign.
- For review-only ownership mode, omit Worker Execution; the conducting session addresses any
  feedback in the target PR worktree while the retained Reviewer re-reviews.
- If the reviewer's verdict is not APPROVE, Worker Execution addresses the feedback, then
  pr-reviewer re-reviews
- Keep looping until the final verdict is APPROVE

<what to build/fix/review, from the user's request>
```

## 1.8 Run it

Load Orca's own orchestration guide fresh every time (`orca skills get orchestration` — never
from memory) and follow its Preferred Supervised Worker Loop to run the campaign above exactly as
if `/orchestration` had been typed directly: `run-create` once, `task-create` per phase/step,
`worker-start --agent <cli> --model <model> [--effort <effort>]` per resolved slot, `check --wait`
until every dispatch settles. Run the commands the loaded guide actually returns — don't
paraphrase or reimplement them from a remembered grammar. The `--agent`/`--model`/`--effort` flags
passed to each `worker-start` call are exactly sections 1.1–1.6's resolved values for that slot,
sourced from the pre-dispatch report table (section 1.4) — not re-derived at this step.

### The terminal-reuse decision rule — check this before every `worker-start` in a feedback loop

Added 2026-09-04 (#1571), after a live run dispatched 12 separate terminals for what should have
been 2 retained roles across a two-PR feedback loop — every round went through
`--worktree "path:<same worktree>"`, which Orca's own guide states plainly always creates a fresh
terminal. The rule was already present below (see "Feedback handoff and retention"), but read as
background detail in a sentence about incompatible flags rather than as a per-round checkpoint —
this section is that same rule, promoted to load-bearing and placed next to the `worker-start`
calls it governs, not a restatement with new content:

> **Same role, same worktree, same model/effort as the prior round in this loop** → capture
> `agent_terminal_handle` from `worker-show` and pass `--terminal <handle>` (no `--model`/
> `--effort` — Orca rejects combining them). **Anything else** (first dispatch for that role, a
> different worktree, or an actual model/effort change) → a fresh terminal via `--worktree
> <selector>` is correct, not a mistake to avoid.

Apply this check at every `worker-start` call in a feedback loop, not just the first one after a
`BLOCK` — it's what "Retain the active Builder and Reviewer terminals... do not release and
respawn either role merely to review a new commit" (below) actually requires in practice.

### Topology and concurrency

- A single issue or PR uses one Conduct-owned child worktree. The first role uses
  `--worktree new-child`; Planner, Builder, Reviewer, and every feedback follow-up use the exact
  returned worktree selector. A later role must never create a sibling worktree for the same
  target.
- A wave campaign uses one child worktree per phase. The first role for each phase uses
  `--worktree new-child`; every later role for that phase uses that phase's exact selector.
- Independent ready phases may run in parallel, capped at three worktrees. An explicit `sequential`
  or equivalent “run in succession” instruction sets concurrency to one. Never parallelize phases
  whose declared dependencies are unresolved.
- Whether to reuse a terminal or start a fresh one for a follow-up dispatch in the existing phase
  worktree — see "The terminal-reuse decision rule" above; don't re-derive it here.

Pass the exact resolved `--agent`/`--model`/`--effort` values from the pre-dispatch report to each
fresh `worker-start`; do not re-derive them at dispatch time.

### Feedback handoff and retention

Retain the active Builder and Reviewer terminals throughout a review feedback loop whenever Orca
allows it. Their retained context is intentional: do not release and respawn either role merely to
review a new commit.

After a Reviewer `BLOCK` or actionable feedback, send the substantive handoff through structured
Orca inbox mail:

```sh
orca orchestration send --to dispatch:<builder-dispatch-id> \
  --subject "Address reviewer feedback" --body "<attempt-specific findings>" --json
```

Then transfer the retained Builder terminal to the follow-up task, or use the exact retained
dispatch/terminal path supported by the loaded orchestration guide. Start a new dispatch only when
the existing worker cannot be transferred; if that happens, keep the new dispatch in the same
phase worktree and preserve the handoff context in its prompt. Re-review with the retained
Reviewer terminal whenever possible. Raw `orca terminal send` is not a valid substitute for a
supervised feedback handoff. Continue until the Reviewer posts the canonical `APPROVE` verdict.

For approved PRs, Conduct delegates merge behavior to `pr-reviewer`'s current merge policy. It
does not merge independently, bypass pending checks, use `--squash`, or merge `main`.

Real dispatched output only: a `worker_done` message, a review comment a worker actually posted.
Narrating what a worker "would" produce is never a substitute for waiting on it.

This is a preset for Orca, not a second implementation of it — no fallback mode of its own. If
Orca isn't available in this environment, say so and stop.

## 1.9 Track and clean up completed work

The cleanup policy below remains the manual safety reference, but automatic worktree removal is
deferred for Conduct campaigns. This version of Conduct may release settled worker sessions when
the orchestration guide requires it, but it must not issue `orca worktree rm`; campaign and phase
worktrees remain available for the operator to close manually after the run.

**Tracking** (so cleanup targets are explicit, never inferred by scanning): for each dispatched
role, record `task_id`, `dispatch_id`, `worktree` selector, whether *this run* created that
worktree (only true for a `worker-start --worktree new-child` call this run issued — never true
for `current`/`active` or a pre-existing selector), and the role kind (planner / builder /
reviewer — needed because "handoff evidence" differs per role, below).

**When to close a session** — after both:

1. `worker_done` reports success for that dispatch, and
2. the conductor has recorded the role-appropriate handoff evidence:
   - Worker Planner → the plan itself (message body/artifact) captured.
   - Worker Execution/Builder → branch pushed **and** PR opened (not just committed locally).
   - Reviewer → the review verdict comment confirmed posted.

During a review feedback loop, Builder and Reviewer are intentionally retained between iterations;
do not release either settled dispatch while another feedback iteration is expected. Release them
only after the final `APPROVE` verdict and the role's handoff evidence are recorded, unless the
operator explicitly asks to keep them live for debugging.

Then: `orca orchestration worker-release --dispatch <dispatch_id>` — "Post-completion cleanup for
a settled (succeeded or failed) worker... closes only the exact coordinator-owned agent terminal,"
idempotent (`already_released` on repeat). This is Orca's current lifecycle command for this —
re-confirm the exact flags via `orca orchestration worker-release --help` at run time rather than
trusting this doc, same discipline section 1.8 already requires for `worker-start`.

Do **not** use `worker-stop` (fences an active dispatch — for stopping a running worker, not
closing a settled one) or `worker-abandon` (explicitly retains everything, for uncertain state) —
naming both here so a future reader doesn't reach for either by pattern-matching on "sounds like
cleanup."

**When to remove a worktree** — only when *all* of:

- It was created by this run (tracked, not inferred — see "Tracking" above), and it is not
  `current`/`active`.
- Clean state: `git -C <path> status --porcelain` is empty (`<path>` from `orca worktree show
  --worktree <selector> --json`).
- Handoff-safe, role-dependent: Builder needs commits pushed to the remote (`git -C <path> log
  @{u}.. --oneline` empty) and a PR open; Planner/Reviewer roles that made no commits skip the
  push check (their evidence is the message/comment, already required above).
- Its session is already closed (previous step done) and its terminal state is not `active` —
  cross-check `orca orchestration worker-list --terminal-state active` before removing.

For a future/manual cleanup outside Conduct's campaign execution, use
`orca worktree rm --worktree <selector>` — **no `--force`** by default. Per its own
`--help`, worktree removal already attempts to delete the checked-out local branch — that's the
mechanism the "handoff-safe" check above exists to make safe. `--force` is reserved for a case
where Orca's merge-detection is known stale, which must itself be logged, never routine.

`scripts/conduct-cleanup-policy.js` implements the decision logic above as a pure function —
`decideCleanup({...}) -> {actions, reason}` — given a structured snapshot mapped from real `orca`
command output. It does not itself call `orca` — see its header comment for why (section 4.2 of
the issue's implementation plan: the decision is pure and testable, the `orca` execution is not).

**Absolute prohibitions**:

| Never | Why |
|---|---|
| Close/remove the current or root worktree | Not this run's to manage, regardless of tracking state — redundant check even though tracking alone would already exclude it |
| Close/remove a worktree/session this run did not create | No fallback scan of "worktrees that look temporary" — tracked-only |
| Close a still-active session | Check `worker-list --terminal-state active` first; a heartbeat or visible activity means alive, not done — same rule the orchestration guide states for supervising |
| Force-delete a dirty, failed, blocked, or cancelled target | Retain and report instead |

**Retention and the end-of-run report** — anything failing a check above is retained, and named in
a closing report:

```markdown
## Cleanup report
Sessions closed: <dispatch_id> (<role>), ...
Worktrees removed: <selector> (<role>), ...
Retained: <selector or dispatch_id> — <reason: still active / dirty / not pushed / not created by this run>
```

**If a future version re-enables automatic cleanup, its first live run must be report-only**, matching the calibration every other roster role carries
(`implement`/`pr-reviewer`/`observer`/`verifier`/`promoter`/`incident-responder`/`notes`) before
being trusted to auto-delete anything: produce the full cleanup report — what *would* be closed,
what *would* be removed, what's retained and why — but withhold the actual
`worker-release`/`worktree rm` calls until a human confirms the report is one they'd have produced
themselves. `worktree rm`'s branch-deletion side effect (above) is exactly the class of risk this
calibration pattern exists for. Auto-cleanup only goes live after that calibration.

See `references/cleanup-dry-run-checklist.md` for the manual verification procedure covering the
four required lifecycle scenarios (success cleanup, active-worker refusal, dirty-worktree refusal,
unrelated-root protection) — there is no live-Orca automated coverage for the `orca` command
execution itself, only for the decision logic (`scripts/conduct-cleanup-policy.test.js`).

## Reference files

- `references/model-slot-parsing-examples.md` — worked examples: canonical, legacy, malformed,
  unavailable CLI, per-slot override, mirroring `scripts/conduct-model-slot.test.js`'s cases.
- `references/cleanup-dry-run-checklist.md` — manual verification steps for the four required
  lifecycle scenarios (success cleanup, active-worker refusal, dirty-worktree refusal, unrelated-
  root protection), for a run with no live-Orca automated coverage.
