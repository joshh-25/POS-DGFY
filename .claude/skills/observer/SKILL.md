---
name: observer
description: Run a Sentry triage sweep for dgfy-platform and file at most 3 defensible issues — dispatches to the observer subagent so it stays isolated and unattended-safe.
argument-hint: "[optional focus, e.g. an environment or project]"
context: fork
agent: observer
background: false
disable-model-invocation: true
---

Run a Sentry triage pass for `dgfy-platform` now. Focus: $ARGUMENTS (if empty, cover the standard
scope). Follow `.agents/skills/observer/SKILL.md` in full — its procedure, noise policy, output
location, and first-live-use gate all still apply. Do not restate its rules here.
