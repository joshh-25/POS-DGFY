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
agent id (section 1.3 of `SKILL.md`).

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
(`in-session`, `orca-pty`, or `direct-cli`) once `resolveDispatchStrategy` has run; an uncomputed
strategy uses `—` rather than the literal string `undefined`.

## Dispatch strategy

`resolveDispatchStrategy({ cli }, { coordinatorCli, launchPreferenceClis })` classifies a resolved
slot in strict priority order:

1. `in-session` when `cli` matches the coordinator's own runtime, even if it is not in
   `launchPreferenceClis`.
2. `orca-pty` when Orca supports `--model`/`--effort` launch preferences for the CLI.
3. `direct-cli` when the CLI is valid but has no Orca launch-preference support, such as
   `antigravity` today.

If the CLI or launch-preference context is missing, the function returns an undefined strategy and
an explicit reason rather than guessing.
