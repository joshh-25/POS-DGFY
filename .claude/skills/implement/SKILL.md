---
name: implement
description: Plan, implement, commit, and open a PR for a scoped engineering task on dgfy-platform — the Worker/Implementer role from issue #331/#436. Use this whenever the user asks for a change to ship as a PR (a fix, a small feature, a workflow edit, a doc correction) and wants it carried from plan through an opened pull request without re-explaining this repo's git/PR/compliance conventions each time. This skill never merges and never touches a deployed environment — it stops and asks before either.
---

# Worker/Implementer

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/implement/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/skills/`, not `.agents/skills/`.

**Read `.agents/skills/implement/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
