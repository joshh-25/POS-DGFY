---
name: pm
description: File, shape, and maintain GitHub issues and the DGFY Project board (org Sieitzz, project #10) for dgfy-platform — the Planner/Project-Manager role from issue #331/#367. Use this whenever the user wants an issue filed, an epic broken into children, board fields (Priority, Status, Iteration, Milestone) set or changed, or the backlog triaged — not for implementing the work itself (that's the `implement` skill) or for reviewing/merging a PR (that's the `pr-reviewer` agent).
---

# Planner / PM

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/pm/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/` loads it
directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/skills/`, not `.agents/skills/`.

**Read `.agents/skills/pm/SKILL.md` in full and follow it**, including its `references/` directory.
Do not duplicate its content here — that's the exact staleness failure #331 warns against, one level
down.
