# Conduct

**Portability**: this is the canonical definition of this role (#442), same pattern as every other
role in the roster — Codex and any other tool that reads `.agents/skills/` loads it directly.
`.claude/skills/conduct/SKILL.md` is a thin pointer back here **plus** one thing that genuinely
can't live here: Claude Code's `disable-model-invocation: true` frontmatter, which is a Claude
Code–specific mechanism for making a skill invisible to the model's own selection until invoked by
name. That flag is the only Claude-specific content that belongs in the vendor file — everything
else, including this entire procedure, is AI-agnostic and lives here per `AGENTS.md`'s Surface
precedence (vendor directories are pointers and harness config only, never a rule source).

Sequences `implement` → `pr-reviewer` → `promoter` across a multi-phase epic or initiative, in
parallel or serial worktrees, with per-role-slot model selection. This is a dispatcher, not a
fourth role with its own authority: it decides *which worktree, which model*, never *what the
rules are* — those stay owned by the roles it calls.

**This skill sequences existing roles. It does not redefine them.** Every rule in `AGENTS.md` and
in `implement`/`pr-reviewer`/`promoter`'s own `SKILL.md` files — Merge Safety, checkpoint
policies, never-`--squash`, the `main`-branch protections, first-live-run report-only calibration
— applies unchanged here.

## Invocation

However a given tool exposes "manual only" (Claude Code: `disable-model-invocation: true`;
another tool: whatever its own equivalent is), this skill must never fire from prompt phrasing
alone. It can spin up worktrees and dispatch real work — it should only ever run because a human
asked for it by name.

## What this skill does not do

- Does not implement code itself — that's `implement`'s job, invoked per phase/issue.
- Does not review or merge PRs itself — that's `pr-reviewer`'s job, invoked per PR.
- Does not decide promotion/deploy policy — that's `promoter`'s job.
- Does not carry any personal, machine-specific, or vendor-specific configuration. No specific
  model name in this file is anything but an illustrative example — real values live in the
  invoking user's own shell environment (see "Model selection" below), never in this repo.

## Step 1 — Read the model-selection env vars

Three environment variables, read at invocation time (`env | grep -E
'^(WORKER_PLANNER|WORKER_BUILDER|REVIEWER)='` — not injected automatically, this skill must
actually check):

- `WORKER_PLANNER` — the model (+ optional effort) that plans each phase before `implement`
  writes code.
- `WORKER_BUILDER` — the model that executes `implement`'s workflow (branch, code, commit, PR).
- `REVIEWER` — the model that executes `pr-reviewer`'s procedure against the resulting PR.

**Value shape**: `model:effort` (e.g. `claude-opus:high`), colon-delimited specifically so the
value parses cleanly as a shell env var — no unquoted spaces or parentheses. Parse each set
variable into `{model, effort}` (effort optional) before Step 3; treat a value that doesn't split
cleanly on `:` as malformed and stop with a named error naming the offending variable, rather than
guessing at intent.

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
2. `command -v orca` (or the equivalent for another known substrate), if the listing is
   inconclusive.

**If found: dispatching is mandatory, not optional, and it means actually running Orca commands —
never reasoning about what a dispatched worker would produce and writing that yourself.** This is
the exact bug #1258 reports: without a hard requirement to invoke real commands, an executing
model with no other constraint will silently do the role's work itself, in its own conversation,
under its own model — defeating the entire point of per-slot model selection (a `REVIEWER=codex...`
run must produce an actual Codex-authored review, not a Claude-authored one that merely claims the
role). **If you (the executing model) catch yourself about to plan, write code for, or review a PR
directly in this conversation after Step 2 found a substrate, stop — that is the failure this rule
exists to prevent, not a shortcut.**

The mandatory sequence, every time a substrate is found, in this order:

1. `orca status --json` — confirm a running, reachable runtime. If it isn't, this is not "no
   substrate found" (Step 2 already found `orca` present) — it's a real error; report it and stop
   rather than silently falling through to serial mode.
2. `orca skills get orchestration` — load the full, version-matched command guide **fresh, every
   invocation.** Never rely on a cached or remembered command grammar from an earlier run or from
   this file's own prose — Orca's own skill stub says outright not to guess subcommands/flags from
   memory, and that applies here with the same force.
3. Follow the loaded guide's Preferred Supervised Worker Loop verbatim for each role slot:
   `run-create` (once), `task-create` per phase/step, `worker-start --agent <cli-for-the-slot>`
   (see "Applying model selection" below for the model/effort/lineage arguments), then
   `check --wait --types worker_done,escalation,question` until every dispatched slot settles.
   Do not paraphrase or reimplement these commands from memory — run the ones the guide just
   returned.
4. Only text that actually came back from a dispatched worker (a `worker_done` message, a posted
   PR comment from that worker's own tool) counts as that slot's output. Narrating what a worker
   "would say" is never a substitute for waiting on `check --wait` and reading the real message.

**If not found:** run the same role sequence **serially, in this session**, using plain
`git worktree add ../<repo>-<label>` per phase (sibling layout — matching `implement`'s own
convention, never nested inside another worktree's directory tree). This sibling-git-worktree
convention is specific to this no-substrate fallback — it does not apply to the Orca path above,
which uses Orca's own worktree/lineage system instead (see "Applying model selection"). State
explicitly that no orchestration substrate was found and serial mode is in use — never degrade
silently, never error opaquely. See "Applying model selection" for the serial-mode limitation this
implies.

## Applying model selection — how the parsed values actually get used

This is the part a description of *intent* isn't enough for; state the concrete mechanism used at
runtime.

**With an orchestration substrate found (e.g. Orca):** pass the parsed `model` and `effort` as
that substrate's own per-worker launch arguments on the `worker-start` call that launches the
planner/builder/reviewer for that phase (for Orca specifically: `--model <model>` and, only when
`effort` is set and the launched agent/model supports it, `--effort <effort>` — never combine
`--model`/`--effort` with reusing an existing terminal via `--terminal`, per Orca's own rule that
those options apply only to a fresh agent launch). Also pass `--agent <cli>` matching the model's
own CLI (e.g. `--agent codex` for a Codex model, `--agent claude` for a Claude model) — the model
flag alone does not select the CLI. If the substrate reports the requested model/effort as
unsupported (a launch receipt error, or the worker-server not advertising launch-preference
support), **stop and name that phase's dispatch as blocked** — do not silently launch under a
different model and claim the requested one was used.

**Worktree lineage for the Orca path** (distinct from the no-substrate sibling-git-worktree
convention above): default to **child** lineage (`--worktree new-child`) for a phase stacked under
or dependent on the initiative `conduct` is currently running — matching how a human invokes
Orca's own `orchestration` skill directly. Use **top-level** (`--worktree new-top-level`,
`--no-parent`) only for a phase that's genuinely independent of the active worktree, mirroring
Orca's own `orchestration` skill's lineage rule. State which lineage was chosen and why, same as
model selection.

**In serial, no-substrate mode:** a single interactive session generally runs under one fixed
model for its lifetime. If the current session's model differs from a slot's resolved value,
`conduct` cannot silently switch models mid-procedure. State the mismatch plainly and do one of:
ask the user to start that phase's step in a session already running the requested model, or
(only if the user accepts this explicitly for this run) proceed under the session's actual model
and record that as a deviation from the requested slot — never claim the requested model executed
a step it didn't.

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
