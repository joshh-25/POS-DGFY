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

## Ready checklist

- [ ] Objective and scope boundary are stated, not implied.
- [ ] Every material decision is resolved, or named as an explicit open question.
- [ ] Affected behavior and interfaces are identified, including when there are none.
- [ ] Acceptance evidence (tests, commands, or manual checks) is defined.
- [ ] Known assumptions the Worker may rely on are distinguished from decisions that need a
      pause.

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

## Worker escalation (Worker-appended only — Planner never pre-fills this)

Include this section only when a genuine blocking decision is found during implementation.

### Evidence

<Repository or issue evidence that exposes the blocker, including relevant dates or commit context.>

### Exact decision needed

<The specific decision required to continue.>

### Options and consequences

- Option A: <what changes if selected.>
- Option B: <what changes if selected.>

### Where implementation stopped

<The last completed step and the work that remains blocked.>
