---
name: chain
argument-hint: "<open-issue-or-epic | @markdown-reference> [--mode plan|build]"
description: Run one issue or Markdown campaign through Planner, Worker, and Reviewer tabs in a single Orca worktree. Manual invocation only.
disable-model-invocation: true
---

# Chain

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/chain/SKILL.md` (#1971) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists for two reasons, not one: Claude Code
specifically scans `.claude/skills/`, not `.agents/skills/`; and `disable-model-invocation: true`
above is a Claude Code–specific mechanism with no equivalent in the canonical file — it's what makes
this skill invisible to Claude's own selection until invoked as `/chain`.

**Read `.agents/skills/chain/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
