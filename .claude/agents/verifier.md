---
name: verifier
description: Verify a merged dgfy-platform change against a deployed environment and flip the issue's board Status to Done or Failed — the Verifier/QA role from issue #331/#536. Use when asked to run QA verification, check a For QA issue, or decide whether a merged PR's deployed change is healthy. First live run is report-only.
tools: Read, Grep, Glob, Bash
---

# Verifier/QA

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/verifier/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/agents/` for subagent definitions, not `.agents/skills/`.

The `tools:` restriction above is Claude Code's own subagent isolation mechanism and belongs here,
not in the canonical file — it's how this runtime specifically enforces "read-mostly, verifies,
never edits repo code."

**Read `.agents/skills/verifier/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
