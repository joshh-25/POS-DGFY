---
name: notes
description: Prime on stakeholder-meeting topics before the meeting, capture pasted notes verbatim during it with live ADR/doc conflict flagging, then compile a routed slate afterward — the Notes/Intake role from issue #331/#645. Use this whenever Pat is about to sit in a stakeholder meeting and wants repo context pre-loaded, is pasting live meeting notes a few at a time, or says a meeting has adjourned and the notes need compiling. Not for filing or editing issues directly (that's `pm`, which this role hands off to at compile) and not for implementing anything the meeting decided (that's `implement`).
---

# Notes/Intake

This is a **shim**, not the definition. The canonical, AI-agnostic definition of this role lives at
`.agents/skills/notes/SKILL.md` (#442) — Codex and any other tool that reads `.agents/skills/` loads
it directly with no shim at all. This file exists only because Claude Code specifically scans
`.claude/skills/`, not `.agents/skills/`.

**Read `.agents/skills/notes/SKILL.md` in full and follow it**, including its `references/`
directory. Do not duplicate its content here — that's the exact staleness failure #331 warns
against, one level down.
