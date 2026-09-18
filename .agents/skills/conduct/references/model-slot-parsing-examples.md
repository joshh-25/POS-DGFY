# Model-slot parsing — worked examples

Five required cases (#1306), mirroring `scripts/conduct-model-slot.test.js`'s cases exactly — if
this table and that file ever disagree, the test file is the source of truth; update this table to
match, not the reverse. Run the deterministic parser rather than parsing informally in-context:

```sh
node scripts/conduct-model-slot.js "$WORKER_PLANNER" \
  --known-clis claude,codex,opencode,gemini,droid,grok,cursor,antigravity --default-cli claude
```

`--known-clis` is always the CLI-id roster read fresh from `orca skills get orchestration`'s
group-address list this run (excluding non-agent addresses like `@all`/`@idle`/`@worktree:<id>`) —
never hardcoded. `--default-cli` is the conducting session's own runtime, mapped to a dispatch
agent id (section 1.3 of `SKILL.md`). Strategy context follows the same discipline:
`--coordinator-cli` reuses the section 1.3 runtime mapping, `--launch-pref-clis` is the
`worker-start --model`/`--effort` support list read fresh from the loaded orchestration guide
(`claude,codex,cursor` today), and `--interactive-clis` optionally narrows the repo-side
interactive-adapter registry (`opencode,antigravity` today) — omit the flag to use the built-in
registry as-is, or pass an explicit subset to narrow it after flag drift (e.g.
`--interactive-clis antigravity`).

Planning policy examples from Conduct's invocation contract:

- `use Opus for planning` overrides `WORKER_PLANNER` only for that run.
- `use claude sonnet for reviewing` overrides `REVIEWER` only for that run; the value must still
  resolve through the canonical or legacy slot parser.
- `use Opus for Heavy Planning, Sonnet for Light Planning` lets Conduct classify phase weight for
  the Planner slot only. Builder and Reviewer remain their configured slots unless separately
  overridden, and configured effort is preserved unless explicitly changed.

| Input | Known CLIs | Default CLI | Result |
|---|---|---|---|
| `claude:claude-sonnet-5:high` | claude, codex, ... | claude | **Canonical.** `cli=claude`, `model=claude-sonnet-5`, `effort=high`. Segment 1 matches a known agent id. |
| `agy:claude-sonnet-5:high` | claude, codex, antigravity, ... | claude | **Canonical, alias normalized.** `cli=antigravity` (not `agy`), `model=claude-sonnet-5`, `effort=high`. Segment 1 normalizes to a known agent id before the match. |
| `claude-sonnet-5:high` | claude, codex, ... | claude | **Legacy.** `cli=claude` (inferred from orchestrator default), `model=claude-sonnet-5`, `effort=high`. The worked example from the issue: `claude-sonnet-5` is *not* a recognized CLI id (the CLI id is `claude`), so rule 3 doesn't match and this falls to legacy — not a special case, just what the general rule produces. |
| `claude::high` | claude, codex, ... | claude | **Malformed.** Empty segment 2 (`model`) — rejected before dispatch, named exactly. |
| `copilot:claude-sonnet-5:high` | claude, codex, opencode (no `copilot`) | claude | **Unavailable CLI.** 3 segments, so it can't fall back to legacy parsing (legacy is capped at 2 segments) — rejected before dispatch: "more than 2 segments" for the legacy path, since `copilot` isn't a known CLI id for the canonical path either. Never silently substituted for an available CLI. |
| `codex:gpt-5.6-luna:medium` (as an invocation-time override of `REVIEWER=claude:claude-sonnet-5:high`) | claude, codex, ... | claude | **Per-slot override**, parsed through the identical function — no second, looser parsing path. Overrides only the `REVIEWER` slot for this run; `WORKER_PLANNER`/`WORKER_BUILDER` are untouched. |

## Additional malformed shapes covered by the test suite

- Empty CLI segment: `:claude-sonnet-5` → rejected.
- Empty model segment: `claude:` → rejected.
- Empty effort segment: `claude:claude-sonnet-5:` → rejected.
- More than 3 segments total: `claude:claude-sonnet-5:high:extra` → rejected.
- Empty string: `""` → rejected ("empty slot value").

## Pre-dispatch report row shape

`formatReportRow(slotName, parsed, origin)` in `scripts/conduct-model-slot.js` produces exactly
the row shape in `SKILL.md` section 1.4 — canonical rows carry no legacy callout; legacy rows
always carry the mandatory `(**legacy** — ... — verify)` suffix; a failed parse renders as an
`**ERROR**` row rather than being silently dropped from the table. Rows include a `Strategy` cell
(`orca-pty`, `orca-interactive`, `in-session`, or `direct-cli`) once `resolveDispatchStrategy` has
run; an uncomputed strategy uses `—` rather than the literal string `undefined`. An
`orca-interactive` row names the exact adapter command so the reader sees which TUI launches with
which model before anything is dispatched.

## Dispatch strategy

`resolveDispatchStrategy({ cli, model, effort }, { coordinatorCli, launchPreferenceClis,
interactiveClis })` classifies a resolved slot in strict priority order — corrected 2026-09-11
(#1826, launch-preference support checked before coordinator match) and extended 2026-09-17
(#1964, interactive custom-command launch checked before coordinator match):

1. `orca-pty` (Tier 2) when Orca supports `--model`/`--effort` launch preferences for the CLI —
   even if `cli` also happens to match the coordinator's own runtime. A coordinator already
   running the resolved `cli` is never on its own a reason to skip external dispatch for a CLI
   Orca can launch with the requested model (`claude`/`codex`/`cursor` today): in-session
   native-subagent dispatch does not reliably honor a per-slot `--model` override.
2. `orca-interactive` (Tier 2B) when Orca has no launch-preference support for the CLI but an
   enabled interactive adapter is registered for it (`opencode` →
   `opencode --model <provider/model>`, `antigravity`/`agy` → `agy --model <model>
   [--effort <effort>]`) — even if `cli` matches the coordinator's own runtime. An unsent
   composer draft is not execution, and a headless/internal run is not the visible external
   session the invocation asked for (#1964). The result carries the exact `command`; a CLI with no
   `--effort` flag (`opencode`) records the configured effort without forwarding it.
3. `in-session` (Tier 1) only when `cli` matches the coordinator's own runtime **and** Orca has
   neither launch-preference support nor an enabled interactive adapter for it at all — the one
   case where Tier 1's "avoid a redundant external terminal" argument still holds, since there is
   no external alternative.
4. `direct-cli` (Tier 3) when the CLI has no Orca launch-preference support and no enabled
   interactive adapter, and the coordinator isn't already running it either — the intentional
   headless fallback, never a silent substitute for a requested visible session.

`interactiveClis` defaults to the built-in adapter registry when omitted; pass an explicit list
(or `[]`) to narrow it — e.g. after a CLI's flags drift, or to prove Tier 1/3 preservation for an
adapter-backed CLI. A CLI enabled for interactive launch that has no registered adapter (or whose
command cannot be constructed, e.g. a missing model) fails closed with an undefined strategy and
an explicit reason rather than falling through to a different CLI/model. If the CLI or
launch-preference context is missing, the function likewise returns an undefined strategy and an
explicit reason rather than guessing.
