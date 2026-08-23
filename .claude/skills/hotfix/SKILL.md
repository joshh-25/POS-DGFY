---
name: hotfix
description: Manual, on-demand entry point into incident-responder's fix loop for dgfy-platform — branch off main or staging, implement, hand off to pr-reviewer/promoter, without waiting for an automated monitor signal. The manual-trigger extension from issue #331/#861 on top of #546. Use when Pat explicitly types /hotfix, or when a message plausibly describes wanting an urgent fix ("prepare a hotfix", "we need an emergency fix", "ship a fix for prod now") — in the latter case this proposes invoking the flow and waits for confirmation rather than launching it.
---

# Hotfix — manual entry point

This is a **trigger into an existing role, not a separate role.** `/hotfix` starts the exact same
loop, guardrails, and `main`-merge authority already defined for `incident-responder`
(`.agents/skills/incident-responder/SKILL.md`, #331/#546) — it adds no new capability and no second
path to `main`. See #861 for why this is scoped as an extension rather than a new agent.

**Read `.agents/skills/incident-responder/SKILL.md` in full, including its "Manual entry point —
`/hotfix`" section, and follow it.** Do not duplicate its content here — that's the exact staleness
failure #331 warns against, one level down.

If this skill was reached via a detected free-text phrase rather than an explicit `/hotfix`
command, stop at the propose-and-confirm step that section describes — state what invoking it would
do and wait for Pat's confirmation before creating a branch or writing any code. An explicit
`/hotfix` invocation needs no such check-in; the command itself is the confirmation.
