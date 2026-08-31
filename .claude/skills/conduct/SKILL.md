---
name: conduct
description: Run a task or epic through Orca's orchestration skill, pre-configured with which model plans/builds/reviews. Manual invocation only.
disable-model-invocation: true
---

# Conduct

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/conduct/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists for two reasons, not one: Claude Code
specifically scans `.claude/skills/`, not `.agents/skills/` (same as every other shim in this
repo); and `disable-model-invocation: true` above is a Claude Code–specific mechanism with no
equivalent in the canonical file — it's what makes this skill invisible to Claude's own selection
until invoked as `/conduct`.

**Read `.agents/skills/conduct/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
