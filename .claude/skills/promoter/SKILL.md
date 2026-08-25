---
name: promoter
description: Run a develop -> main promotion on dgfy-platform (an optional staging soak is still available per batch, not the default since ADR 0074) — the Promoter/Release role from issue #331/#512. Use when asked to promote develop to production, cut a release branch, or run the deploy leg of a "review, merge, and deploy" instruction. Dispatches DEV/STAGING deploys unattended; never merges main or dispatches a main/PROD deploy without an explicit go each time, except a narrow phrase-gated override (#1007).
---

# Promoter/Release

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/promoter/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/`
loads it directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/skills/`, not `.agents/skills/`.

**Read `.agents/skills/promoter/SKILL.md` in full and follow it.** Do not duplicate its content
here — that's the exact staleness failure #331 warns against, one level down.
