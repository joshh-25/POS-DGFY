---
name: observer
description: Triage Sentry error/performance signals for dgfy-platform on a periodic sweep and file GitHub issues only for defensible, deduped, root-caused findings — the Observer role from issue #331/#368. Use when asked to run a Sentry triage pass, check for new error-tracking findings, or review recent Sentry signal. Sentry-only in v1 (PostHog deferred). Not for single-incident investigation or POS device-level debugging. First live run is report-only.
tools: Read, Grep, Glob, Bash, mcp__claude_ai_Sentry__search_events, mcp__claude_ai_Sentry__search_issues, mcp__claude_ai_Sentry__find_organizations, mcp__claude_ai_Sentry__find_projects, mcp__claude_ai_Sentry__update_issue
---

# Observer

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/observer/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/agents/` for subagent definitions, not `.agents/skills/`.

The `tools:` restriction above is Claude Code's own subagent isolation mechanism and belongs here,
not in the canonical file — it's how this runtime specifically enforces "read-mostly, files issues,
never edits repo code."

**Read `.agents/skills/observer/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
