---
status: authoritative
authority_level: authoritative
owner: developer_experience
last_reviewed: 2026-08-25
applies_to: ai_pr_and_review_attribution
topic: verified_ai_model_attribution
---

# Verified AI/Model PR Attribution

Attribution is optional local proof of the active AI runtime and model. It never blocks work.

`scripts/ai-attribution.js` atomically writes a mode-0600, versioned record under the active
**repo clone's shared** Git metadata (`git rev-parse --git-common-dir`, not the per-worktree
`--absolute-git-dir`). It binds the runtime, session ID, non-empty model ID, and eight-hour expiry.
Records never enter Git. Formatting revalidates each binding and emits nothing for missing,
expired, or ambiguous evidence.

Known IDs use the utility's friendly map. A newly verified model remains its raw trusted ID, never
`unknown-AI`.

## Why storage is repo-clone-wide, not per-worktree (#1047)

The mechanism originally bound a record to the exact worktree it was written in
(`--absolute-git-dir`, which is a distinct directory per `git worktree add`). In practice,
`implement`, `pr-reviewer`, `promoter`, and `incident-responder` all branch by creating a *new*
worktree per task — so the session that wrote the record and the process that later needs to read
it are almost always in *different* worktrees of the *same* clone. That mismatch is why a
worktree-isolated run, or a subagent whose Bash commands execute in that worktree, could never see
its own attribution record. Storage now keys on `git rev-parse --git-common-dir` (shared by every
worktree of one clone) and `(runtime, sessionId)` only — no per-worktree binding. Cross-*repo*
isolation is unaffected: two independent clones resolve to two different common-dirs, so they never
share a storage location or a key space (`scripts/ai-attribution.test.js`, "records are isolated
per repo clone" vs. "records are visible across worktrees of the same repo clone").

## The discoverability gap this also fixes (#1047)

Confirmed live on PR #1042: a Claude worker's `Addressed (...)` comment carried the tag, but the
same worker's own PR body did not, despite both coming from one session with a valid record. Root
cause: the SessionStart adapter previously piped the raw JSON record straight to its own stdout via
`stdio: 'inherit'`. Claude Code parses SessionStart stdout as *structured hook output* whenever it
starts with `{` — a bare JSON record fails that schema and is silently dropped instead of being
shown to the model. The agent was never actually told its own session ID; producing a correct tag
required separately discovering it (e.g. reading the record file off disk directly).

Both `.claude/hooks/record-ai-attribution.js` and `.codex/hooks/session-start.js` now emit
deliberately **plain text** (never JSON) naming the session and the exact ready-to-run `format`
command, e.g.:

```
AI attribution recorded for this session (runtime=claude-code, model=claude-sonnet-4-5). To tag a
PR body or comment, run: node scripts/ai-attribution.js format claude-code <session-id> <Opened|Review|Addressed> <role>
```

This is what SessionStart's plain-text-to-context behavior is documented to support. The manual
`format` + paste step is an intentional, unchanged decision (see below) — this only fixes the agent
never being told what to type.

## Coverage — per runtime, per event

| Runtime | SessionStart adapter | SubagentStart adapter | Verified input |
| --- | --- | --- | --- |
| Claude Code | `.claude/hooks/record-ai-attribution.js`, activated in `.claude/settings.json` | `.claude/hooks/inject-ai-attribution-context.js`, activated in `.claude/settings.json` | `model` |
| Codex | `.codex/hooks/session-start.js`, activated in `.codex/hooks.json` | none (descoped, see below) | `model` |
| Antigravity | `.antigravity/hooks/record-ai-attribution.js` invocation | none | `modelName` (best-effort; verify against a captured payload before enabling) |
| OpenCode | `.opencode/plugins/dgfy-ai-attribution.js` `chat.params` | none | live `providerID` / `model.id` |
| Cursor | `.cursor/hooks/record-ai-attribution.js` and CLI wrapper | none | `model_id`, then `model`, from complete `stream-json` `init` (best-effort; verify before enabling) |

Claude Code and Codex are activated. Antigravity, OpenCode, and Cursor remain research-first:
capture and validate their payload shape before enabling them — unchanged from before #1047, and
still out of this ticket's scope.

### Why there's no SubagentStart write path for any runtime

Claude Code's own docs state it outright: *only `SessionStart` hooks can receive a `model` field*,
and it's not guaranteed even there. `SubagentStart` never carries one. A hook can't write a record
it has no model for, so `inject-ai-attribution-context.js` doesn't try — it only *reads* the record
the top-level session's `SessionStart` already wrote (now visible from any worktree of the clone,
per above) and, if valid, delivers the ready `format` command into the subagent's own context via
`SubagentStart`'s `additionalContext` output field — the one piece of a `SubagentStart` hook's JSON
output that actually reaches the subagent. Silent (no output) when no valid record exists.

### Codex: activated, with two confirmed caveats — verify before relying on it

1. **Trust gate.** Codex only loads project-local `.codex/` hook configuration when that layer is
   trusted by the operator — this is not automatic just because `.codex/hooks.json` exists in the
   repo.
2. **Open upstream bug.** As of this writing, `.codex/config.toml`-declared `SessionStart`/`Stop`
   hooks are reported not to fire in interactive sessions despite parsing correctly
   (`openai/codex#17532`, open, no maintainer response). This repo uses `.codex/hooks.json` rather
   than `config.toml` for the hook declaration itself (a dedicated file, less exposed to
   `config.toml`'s separate list of project-local-ignored keys), but whether that same firing bug
   also affects `hooks.json` is unconfirmed. Treat Codex activation as best-effort until it's been
   observed firing in a real interactive session, the same standing as Antigravity/Cursor above.

## The manual `format` step — kept, by design, not auto-injected (#1047)

Considered and rejected: having `implement`/`pr-reviewer`/`promoter` auto-run `format` and prepend
its output to every `gh pr create`/`gh pr comment` call. That would mean rewriting how all three
roles issue those commands — a materially larger, riskier behavior change than the actual observed
failure (the agent not knowing what to type) warranted. The plain-text context fix above addresses
the real cause directly; keeping the step manual and explicit keeps the "never block a session"
property simple to reason about.

## Not built: a check that flags a missing tag (#1047)

Considered and descoped, not silently dropped: a lightweight, non-blocking CI/compliance check that
flags a merged agent PR missing its attribution line. Records expire after 8 hours and are never
committed to Git, so by the time any post-merge check could run, the evidence a check would need is
already gone in the overwhelming majority of cases. Revisit only if a design surfaces that doesn't
depend on the ephemeral record still existing.

Run `node scripts/ai-attribution.js format <runtime> <session-id> Opened worker` and place non-empty
output first under `## Summary`. Replace `Opened` with `Review` or `Addressed` for the appropriate
comment. Empty output means omit the line.
