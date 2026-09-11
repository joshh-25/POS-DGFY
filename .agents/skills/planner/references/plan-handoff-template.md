# Planner handoff template

The generated file is a local, ignored handoff artifact. Keep it compact; do not copy repository
policy into it when a source document can be cited.

```yaml
schema: dgfy-planner-handoff/v1
issue: <number>
issue_type: issue | epic
planning_head: <commit sha>
generated_at: <ISO-8601 timestamp>
status: ready | needs-decision
```

# Plan: #<number> — <title>

## Objective

<What outcome is required, in one or two paragraphs.>

## Current behavior and evidence

<Relevant code paths, tests, docs, and observed behavior. Cite paths and symbols, not guesses.>

## Required change

<The implementation contract, including scope boundaries and behavior.>

## Interfaces and types

<Public APIs, schemas, CLI/skill interfaces, or “none”.>

## Implementation changes

<Grouped by subsystem. Include affected files only where they disambiguate the work.>

## Tests and acceptance

<Exact test scenarios, commands, and acceptance evidence required before the Worker opens a PR.>

## Risks, decisions, and non-goals

<Residual risks, resolved decisions, unresolved decisions, and explicit exclusions.>

## Definition of done

<For an epic, include the bounded done state and candidate slate here.>

## Worker handoff

<Implementation-specific instructions. Do not merge or deploy.>

Run:

```text
/implement @.tmp/plan-<number>.md
```
