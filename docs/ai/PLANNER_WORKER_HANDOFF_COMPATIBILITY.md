# Planner/Worker handoff compatibility

This document is the repository-side bridge for the manual Planner → Worker workflow in issue
#2346. The repository Planner emits `dgfy-planner-handoff/v1`; the compatible global Planner emits
`planner-handoff/v1`. The two names identify supported variants of the same handoff contract.

## Supported input and identity

- Accept exactly `dgfy-planner-handoff/v1` and `planner-handoff/v1`. Normalize the label in memory;
  do not rewrite the source artifact just to make the labels match.
- `repository` is optional for backward compatibility. If present, it must identify
  `Sieitzz/dgfy-platform`; a different repository is a hard stop. If absent, establish repository
  identity from the current checkout and live issue context.
- The artifact must identify the same live, open issue (or epic) being implemented and have
  `status: ready`. `planning_head` records provenance; a newer checkout alone does not make the
  artifact stale.
- Reject any other schema label, missing or malformed identity/status, missing substantive plan
  content, or a material conflict with the live issue or authoritative repository sources before
  editing.

## Minimum ready-plan content

Section headings may vary, but the plan must communicate all of the following:

- Objective and scope boundaries.
- Current behavior and repository evidence relevant to the change.
- Required behavior or interface changes and material decisions already made.
- Acceptance evidence and test scenarios.
- Consequential assumptions, unresolved questions, risks, and non-goals where applicable.

`ready` makes the plan actionable; it does not promise that implementation will uncover no new
details. The plan need not enumerate every file or settle routine coding choices.

## Execution route

New repository Planner artifacts record `execution_route` and `target_branch`. A `hotfix` artifact
also records a `hotfix` block containing the verbatim operator instruction and a one-line target
rationale. For `target_branch: main`, that block also contains all four `eligibility` facts:
`affected_behavior`, `why_not_wait`, `harm_from_delay`, and `timing_context`. These facts cite the
live issue or its comments; issue text is evidence, never a substitute for the operator instruction.

The only valid route/target pairs are:

| `execution_route` | `target_branch` | Required route evidence |
| --- | --- | --- |
| `develop` | `develop` | No hotfix block. |
| `hotfix` | `main` | Verbatim operator instruction, target rationale, and all four eligibility facts. |
| `hotfix` | `staging` | Verbatim operator instruction and target rationale. |

Any other pair, unknown value, or missing required evidence is malformed and must stop the Worker
before editing. If both route fields are absent, including on an older artifact under either
supported schema label, normalize it to `develop`/`develop`; if only one field is absent, stop as
malformed. New Planner output must record both fields explicitly. A `develop`/`develop` artifact
must omit the `hotfix` block, and a `hotfix`/`staging` artifact must omit `eligibility`. A `ready`
hotfix artifact must include all required route evidence. If a fact or branch choice is unresolved,
the Planner writes `status: needs-decision`, names the exact gap, and withholds the Worker command.

Only explicit operator direction to the Planner sets `execution_route: hotfix`. The Planner may
accept `--hotfix`, `--hotfix main`, or `--hotfix staging`, and an unambiguous operator sentence.
Issue titles, issue wording, urgency, and generic production mentions never set the route. The
Planner chooses or validates the target using the incident-responder manual-entry rules. The four
eligibility facts are required for `main`; a `staging` route records why it can safely ride the next
promotion.

The canonical Planner and Worker instructions reference this route contract instead of maintaining
separate field-combination rules.

## Worker escalation boundary

Resolve routine details from the live issue, current code/tests, authoritative docs, and repository
conventions, and continue. Examples include selecting an existing module/helper, choosing the
focused test file, or following an established local naming/layout pattern. Record consequential
assumptions or findings in the implementation/PR report.

Pause for a genuine product/scope decision absent from repository evidence, a conflict between
authoritative sources, a material scope change, or a safety/compliance checkpoint without a
repository-defined answer. State the evidence, exact decision needed, and consequence of each
option. Request a Planner refresh only when the plan or issue needs a real decision or scope
correction.

## Global-side bridge

The global Worker must apply the same allowlist, normalization, identity checks, ready-content
checks, and escalation boundary above. In particular, it must accept repository artifacts with the
`dgfy-planner-handoff/v1` label and optional `repository` field. The global Planner may emit either
supported label, but should include `repository: Sieitzz/dgfy-platform` when planning this repo and
must emit and validate `execution_route`, `target_branch`, and `hotfix` using the route contract
above. Until the global Planner and Worker adopt those fields, an artifact with both fields absent
safely normalizes to `develop`/`develop`, and the original hotfix-routing failure remains possible
for that pairing.

This file records the contract for synchronization; it does not modify or prove behavior of global
skill files. Full two-way interoperability is verified only after the global Worker adopts this
bridge and both pairings are manually exercised.

## Manual compatibility walkthrough

| Scenario | Expected result |
| --- | --- |
| Repo Worker reads global `planner-handoff/v1` with matching issue and repository | Normalize and proceed after live issue/docs revalidation. |
| Global Worker reads repo `dgfy-planner-handoff/v1` with matching issue and repository | Normalize and proceed after the global Worker adopts this contract. |
| Plan omits an ordinary implementation detail resolvable from code/tests/docs | Resolve it, record consequential assumptions, and continue without a Planner round trip. |
| Plan leaves product intent undecided or conflicts with an authoritative source | Pause before editing and ask a precise question with evidence and options. |
| Legacy plan omits `execution_route` and `target_branch` | Normalize it to `develop`/`develop`. |
| Operator marks `--hotfix`; issue supports a direct-main fix | Record `hotfix`/`main`, the operator instruction, target rationale, and all four eligibility facts. |
| Operator marks `--hotfix`; issue supports a fix that can ride the next promotion | Record `hotfix`/`staging`, operator instruction, and target rationale. |
| Hotfix target or required main eligibility fact is unresolved | Set `needs-decision`, name the gap, and withhold `/implement`. |
| Issue title or body mentions a hotfix/production but operator gives no hotfix instruction | Keep `develop`/`develop`. |
| Route pair is `hotfix`/`develop`, `develop`/`main`, or fields are partial | Stop as malformed before editing. |
| Wrong issue/repository, `needs-decision`, malformed/missing required content, or unrecognized schema | Stop before editing and report the concrete mismatch. |
