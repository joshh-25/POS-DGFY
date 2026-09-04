---
name: verifier
description: Verify a merged dgfy-platform change against a deployed environment and flip the issue's board Status to Done or Failed — dispatches to the verifier subagent so it stays isolated.
argument-hint: "[optional issue number]"
context: fork
agent: verifier
background: false
disable-model-invocation: true
---

Run a QA verification pass for `dgfy-platform`. Target: $ARGUMENTS (if empty, process every item
in the `For QA` board lane). Follow `.agents/skills/verifier/SKILL.md` in full — its environment
resolution, verification procedure, board transitions, and first-live-use gate all still apply. Do
not restate its rules here.
