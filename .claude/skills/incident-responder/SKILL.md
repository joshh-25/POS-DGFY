---
name: incident-responder
description: Autonomous production incident-response loop for dgfy-platform — monitor, file, fix, fast-track review, redeploy — the incident-response role from issue #331/#546. Use only when Pat has explicitly authorized an active incident-response session. Carries a narrow, phrase-gated override to merge a hotfix into main during an open incident; every other case keeps "never merge main" absolute.
---

# Incident Responder

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/incident-responder/SKILL.md` (#442) — Codex and any other tool that reads
`.agents/skills/` loads it directly with no shim at all. This file exists only because Claude Code
specifically scans `.claude/skills/`, not `.agents/skills/`.

**Read `.agents/skills/incident-responder/SKILL.md` in full and follow it.** Do not duplicate its
content here — that's the exact staleness failure #331 warns against, one level down.
