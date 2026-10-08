# Planner → Worker escalation boundary

Planner and Worker use this same test to decide whether an implementation gap can be resolved
without another handoff.

## The test

A gap is **routine** and the Worker resolves it and continues only when all of these are true:

1. Resolving it does not change the plan's stated objective, scope, or acceptance criteria.
2. The resolution is supported by current code, tests, authoritative documentation or ADRs, or an
   established repository convention. It is not invented from scratch.
3. Getting it wrong is inexpensive to correct later, such as in a follow-up commit, without
   re-architecture or changing behavior that has already shipped.

A gap is a **blocking decision** and the Worker pauses when any of these are true:

1. Two authoritative sources conflict, or the live issue or relevant code has materially diverged
   from the plan since `planning_head`.
2. The resolution would change scope, acceptance criteria, user-facing behavior, or an interface
   that has not already been committed to.
3. No existing evidence resolves the question; choosing would be a guess rather than an inference.
4. The situation triggers an `implement` Checkpoint policy row. That policy remains in force; this
   boundary never downgrades a checkpoint to a routine choice.

When blocked, capture the evidence, exact decision needed, and consequences of each option in the
handoff artifact as described by the Planner and Worker instructions. Do not silently choose a
product or scope decision.

## Illustrative examples

These examples are illustrative, not reports of real repository behavior.

**Routine — proceed without a round trip.** A plan under-specifies the query parameter name for a
new filter on an existing list endpoint. The Worker finds the established naming convention in a
sibling endpoint, applies it, and records an `Assumptions:` line in the PR's `## Plan Handoff`
section describing what was unspecified, the evidence used, and the cost of being wrong.

**Blocking — pause for a Planner refresh.** A plan's pricing rule is contradicted by a comment
added to the live issue after `planning_head`. The Worker stops, appends a `## Worker escalation`
block to `.tmp/plan-<issue>.md` with the comment and timestamp, the exact decision needed, and what
changes under each option, then reports that a Planner refresh is needed.

## Recording assumptions

Record one concise line for each consequential routine assumption in the PR's existing
`## Plan Handoff` section under `Assumptions:`. State what was unresolved, what evidence settled it,
and what the cost would be if the assumption is wrong. Do not list every minor judgment call.
