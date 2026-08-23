---
name: pr-reviewer
description: Audit an open dgfy-platform PR and post the fixed-format review verdict — dispatches to the pr-reviewer subagent so the isolated, read-mostly review context stays intact.
argument-hint: "[PR number]"
context: fork
agent: pr-reviewer
background: false
disable-model-invocation: true
---

Review PR $ARGUMENTS on `Sieitzz/dgfy-platform`. If no PR number was given, find the PR for the
current branch (`gh pr view`). Follow `.agents/skills/pr-reviewer/SKILL.md` in full — its audit
scope, output format, merge policy, and first-live-use gate all still apply. Do not restate its
rules here.
