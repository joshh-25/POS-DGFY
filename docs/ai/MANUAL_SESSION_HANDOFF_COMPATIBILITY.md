# Manual session handoff compatibility

This document is the single repository contract for local `/handoff` snapshots consumed by the
Planner, Implementer, and Reviewer roles. It covers session-progress snapshots only. It does not
change the separate [Planner/Worker implementation-plan contract](PLANNER_WORKER_HANDOFF_COMPATIBILITY.md).

## Supported snapshot formats

- Accept exactly `agent-handoff/v1` and `dgfy-handoff/v1` as compatible variants of the same
  session snapshot. Normalize the schema label in memory; do not rewrite the ignored source file.
- The canonical repository Handoff producer continues to emit `dgfy-handoff/v1`.
- Interpret snapshot content by meaning, not by exact field-for-field equality. Additional metadata,
  descriptive runtime/model values, and harmless formatting differences do not block resumption.
- Reject an unrecognized schema label or content that cannot identify the requested continuation
  after checking reliable current context.

## Identity and current state

- The explicit continuation command determines the requested role and issue/PR. A present snapshot
  identity that contradicts that request or the live GitHub object is a hard stop. If role or
  identity metadata is absent, infer it only when the invocation and live repository state resolve
  it unambiguously; otherwise ask for clarification.
- Establish repository identity from the verified checkout. If a snapshot names a different
  repository, stop; if it omits the repository, infer it from the checkout and live issue/PR.
- Treat branch, worktree, and HEAD as provenance about where the prior session stopped. The current
  checkout is authoritative; these values may be stale and their difference alone is not a blocker.
- Re-read the live issue/PR, checkout state, and governing docs before dependent action. Current
  state overrides the snapshot. Use captured notes to recover progress, not to bypass live checks.
- Ask only when a consequential identity, target, role, or scope ambiguity remains after those
  checks. State the concrete conflict and the decision needed.

## Metadata and action boundaries

- Missing non-consequential metadata may be recovered from the explicit invocation, verified
  checkout, or live GitHub state. Do not invent unresolved facts.
- Unknown extra fields and descriptive source/target runtime or model strings are metadata, not
  schema versions or identity. They do not authorize switching roles or taking actions.
- A snapshot records progress; it does not authorize implementation, issue/PR comments, reviews,
  merges, deployments, messaging, or launching another agent. Each role retains its existing
  explicit invocation and action gates.

## Walkthrough matrix

| Scenario | Expected result |
| --- | --- |
| Planner resumes the #2696 reproduction from `agent-handoff/v1` with matching issue/role | Confirm the request, reread the live issue and `docs/features/PLATFORM_ADMIN_TENANT_CONSOLE.md` from `epic/2696-admin-tenant-management-ux`, then continue without regeneration or a schema override. |
| Planner resumes equivalent `dgfy-handoff/v1` content | Continue under the same live-source and identity checks. |
| Implementer and Reviewer each resume matching snapshots under either supported label | Recover role-specific progress after validating the live issue or PR and current docs. |
| Snapshot adds metadata, uses a descriptive runtime/model value, or omits branch/HEAD that the current checkout supplies | Continue; use reliable current context and do not rewrite the snapshot. |
| Live issue/PR, checkout, or governing docs changed since the snapshot | Follow current live state and record the material change before continuing. |
| Repository, issue, PR, or role genuinely conflicts, or target/role remains consequentially ambiguous | Stop and ask a precise question with the mismatch and consequences. |
| Snapshot is resumed while a ready Planner-to-Worker plan is also relevant | Keep the contracts separate; validate plan content and route under `PLANNER_WORKER_HANDOFF_COMPATIBILITY.md`. The snapshot adds no execution authorization. |

This matrix is validation evidence, not a new automated test framework. Record the walkthrough
results in the PR's `## Testing Evidence` section.
