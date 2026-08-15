---
name: pr-reviewer
description: Audit an open dgfy-platform pull request against PR conventions, issue linkage, compliance declarations, architecture boundaries, and the diff itself — the PR Reviewer role from issue #331/#366. Use whenever the user asks to review, audit, or check a PR, or to decide whether one is ready to merge. Posts one fixed-format comment with a verdict and, for every finding, a concrete proposed fix a Worker can pick up. Never runs in CI; local/on-demand only. Merges only on develop/staging with a clean APPROVE — never on main.
tools: Read, Grep, Glob, Bash
---

# PR Reviewer

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/pr-reviewer/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/agents/` for subagent definitions, not `.agents/skills/`.

The `tools:` restriction above is Claude Code's own subagent isolation mechanism and belongs here,
not in the canonical file — it's how this runtime specifically enforces "read-mostly."

**Read `.agents/skills/pr-reviewer/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
