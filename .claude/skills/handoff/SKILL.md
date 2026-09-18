---
name: handoff
description: Snapshot the current session for an explicitly requested manual AI handoff; never invoke automatically.
argument-hint: "[optional: to codex | to claude | to gemini]"
disable-model-invocation: true
---

# Manual Handoff

This is a thin Claude Code shim. The canonical, portable definition lives at
`.agents/skills/handoff/SKILL.md`.

Run `/handoff`, optionally with `to codex`, `to claude`, or `to gemini`, and follow the canonical
definition in full. Do not duplicate its procedure here.
