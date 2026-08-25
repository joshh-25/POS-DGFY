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

`scripts/ai-attribution.js` atomically writes a mode-0600, versioned record below the active
worktree's Git metadata. It binds the runtime, session ID, resolved worktree, non-empty model ID,
and eight-hour expiry. Records never enter Git. Formatting revalidates each binding and emits
nothing for missing, expired, stale, or ambiguous evidence.

Known IDs use the utility's friendly map. A newly verified model remains its raw trusted ID, never
`unknown-AI`.

| Runtime | Adapter | Verified input |
| --- | --- | --- |
| Claude Code | `.claude/hooks/record-ai-attribution.js` SessionStart | `model` |
| Codex | `.codex/hooks/session-start.js` SessionStart | `model` |
| Antigravity | `.antigravity/hooks/record-ai-attribution.js` invocation | `modelName` |
| OpenCode | `.opencode/plugins/dgfy-ai-attribution.js` `chat.params` | live `providerID` / `model.id` |
| Cursor | `.cursor/hooks/record-ai-attribution.js` and CLI wrapper | `model_id`, then `model`, from complete `stream-json` `init` |

Configure native session/invocation hooks to pipe their JSON to the named adapter. Use the Cursor
wrapper with `cursor agent --output-format stream-json`; it ignores incomplete or ambiguous state.

Run `node scripts/ai-attribution.js format <runtime> <session-id> Opened worker` and place non-empty
output first under `## Summary`. Replace `Opened` with `Review` or `Addressed` for the appropriate
comment. Empty output means omit the line.
