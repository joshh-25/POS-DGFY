# Implementation Segregation Rule Proposal

## Metadata

- title: Implementation segregation rule proposal
- status: draft
- owner: Collaborators
- created: 2026-07-16
- last updated: 2026-07-22
- related code areas: `backend/`, `apps/`, `frontend/`, `packages/`, `scripts/`
- related docs or dependencies: `docs/START_HERE.md`,
  `docs/architecture/ARCHITECTURE_BOUNDARIES.md`,
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, `docs/README.md`,
  `docs/architecture/adr/0001-modular-monolith-boundaries.md`

## Status and Authority

This rule governs only this proposal workspace while it remains under
`docs/Radney Suggestions/`. It is not an authoritative DGFY architecture rule.
Adopting it as repository-wide governance is a cross-boundary documentation
change and requires architecture approval, an ADR impact decision, governed
documentation updates, and automated validation.

## Purpose

Keep collaborator planning, investigation, and review artifacts separate from
runtime code and from authoritative engineering documentation. Existing DGFY
documentation folders retain their current ownership and authority.

## Intent-First Routing

Choose a proposal document's location by its primary intent, even when work
spans the backend, frontend applications, standalone services, packages,
database behavior, integrations, or operations.

| Intent | Proposal folder |
| --- | --- |
| Source-backed current-state map | `00-baselines/` |
| Workspace planning or review rule | `01-rules/` |
| New capability or expanded workflow | `10-feature-plans/` |
| Fix to intended existing behavior | `20-bugfix-plans/` |
| Usability, accessibility, or layout | `30-uiux-plans/` |
| Unresolved cause, feasibility, or direction | `40-investigations/` |
| Proposed architecture, product, or process direction | `50-decisions/` |
| Superseded or collaborator-closed record | `60-archive/` |
| Temporary collaborator-owned review output | `90-temp-qa/` |

If cause, feasibility, or implementation direction is uncertain, investigate
first. Once evidence supports a direction, create a separate plan or governed
ADR as appropriate. A decision stored here does not replace an accepted ADR.

## Placement and Naming

- One document has one primary concern.
- Use lowercase kebab-case Markdown filenames.
- Prefer intent-led names such as `feature-...`, `bugfix-...`, `uiux-...`,
  `investigation-...`, and `decision-...`.
- Keep lifecycle status in metadata, never in the filename.
- Do not store runtime source, migrations, deployment configuration, generated
  application assets, secrets, or authoritative product contracts here.
- Temporary review artifacts belong in `90-temp-qa/`; remove them after review
  unless a documented retention purpose exists.
- Release evidence must remain in the governed location required by the
  applicable testing, compliance, or operations documentation.

## Proposal Metadata

Baselines, rules, investigations, decisions, and implementation-oriented plans
should include:

- `title`
- `status`
- `owner`
- `created`
- `last updated`
- `related code areas`
- `related docs or dependencies`

Implementation-oriented plans should also include:

- `source reviewed at`
- `source revision` when a Git commit or other stable revision is available
- `last validated`
- `approved by` and `approved date` when status is `approved`
- `implemented by` and `implementation reference` when status is `implemented`
- `supersedes` or `superseded by` when another document replaces it

Workspace lifecycle values are:

- `draft` — incomplete or exploratory
- `ready` — sufficiently concrete for review
- `approved` — approved within the collaborator workflow only
- `implemented` — completed and supported by recorded evidence
- `archived` — inactive and stored under `60-archive/`

These lifecycle values do not replace the governed front-matter authority
statuses `authoritative`, `reference`, `historical`, and `deprecated` defined by
`docs/START_HERE.md`.

## Lifecycle and Freshness

Apply lifecycle values consistently:

- `draft` means evidence, requirements, decisions, or open questions remain
  incomplete.
- `ready` means the plan is sufficiently source-backed and concrete for
  developer review, with scope, risks, acceptance criteria, and validation
  defined.
- `approved` requires a named collaborator reviewer and approval date. It means
  approved within this proposal workspace only; it does not replace technical,
  product, security, compliance, or architecture approval required elsewhere.
- `implemented` requires actual completion and validation evidence plus an
  implementation reference such as a PR, commit, or tracked task.
- `archived` means the document is inactive, retains its evidence, and resides
  under `60-archive/`.

Revalidate a plan before implementation when any of the following occurs:

- a referenced source area materially changes or moves
- a related authoritative document or ADR changes
- an API, database, security, compliance, or product contract changes
- the plan's assumptions no longer match observable behavior
- the plan has not been reviewed within the period established by its owner

If revalidation finds a material gap, return the document to `draft`, record the
reason, and resolve the gap before implementation. A date-only refresh without
rechecking sources is not revalidation.

## Current-State Evidence

Planning documents must use DGFY's actual repository boundaries:

- Express and Sequelize backend: `backend/`
- modular-monolith domains: `backend/src/modules/<domain>/`
- standalone DGFY API: `apps/dgfy-api/`
- other standalone applications and runners: `apps/`
- React/Vite product surfaces: `frontend/` and `frontend/apps/`
- shared packages: `packages/`
- repository automation and governance: `scripts/`
- schema behavior and migrations: the applicable backend or app-owned paths,
  verified from source and `docs/database/`
- automated validation: colocated tests and package-level test suites under the
  affected backend, frontend, app, or package surface

For backend changes, preserve the authoritative flow:

`routes -> controllers -> usecases -> repositories -> models`

Before stating current behavior, inspect the relevant source and compare it
with the governed domain documents listed in `docs/START_HERE.md`. Record a
discrepancy as a documentation gap and resolve it through governance; do not
invent behavior or create a competing source of truth here.

## Planning and Decision Boundary

Every proposed implementation must follow the mandatory lookup order and
classify architecture impact as `no-architecture-impact`,
`within-existing-boundary`, or `cross-boundary`. Cross-boundary work requires a
new or updated ADR. A workspace decision alone never authorizes runtime work.

An implementation plan must identify scope, risks, acceptance criteria,
validation, documentation impact, ADR impact, and any temporary exception with
an owner and removal plan.

## Required Implementation Plan Contract

Every feature, bug-fix, and UI/UX implementation plan must contain the following
sections or clearly equivalent content:

1. **Problem and desired outcome** — the user, business, or technical problem
   and the observable result sought.
2. **Current behavior and evidence** — verified source paths, tests, governed
   documents, and known documentation discrepancies.
3. **Scope and exclusions** — what the plan includes and explicitly does not
   include.
4. **Proposed user flow** — relevant user states, actions, errors, permissions,
   and recovery paths.
5. **Proposed technical flow** — component and data flow across affected
   backend, frontend, application, package, integration, and operational
   boundaries.
6. **Affected code and contract areas** — expected source areas plus API,
   database, event, queue, cache, configuration, and documentation impact.
7. **Architecture and ADR impact** — impact classification, applicable
   boundaries, and whether an ADR is new, updated, or not needed.
8. **Security and tenant-isolation impact** — authentication, authorization,
   ownership, tenant scope, sensitive data, abuse, replay, and audit concerns as
   applicable.
9. **Risks, edge cases, and dependencies** — failure modes, compatibility,
   scalability, rollout dependencies, and temporary exceptions.
10. **Acceptance criteria** — externally verifiable conditions for completion.
11. **Validation plan** — targeted tests, negative cases, architecture and docs
    gates, affected builds, rendered UI checks, and manual verification.
12. **Rollout and rollback** — release sequencing, migration safety, feature
    controls, monitoring, and recovery where applicable.
13. **Open questions** — unresolved decisions with an owner or decision path.
14. **Developer handoff** — authoritative files to reread, expected sequence,
    forbidden shortcuts, and required final report evidence.

Plans may contain pseudocode, proposed interfaces, sample request and response
shapes, schema sketches, sequence diagrams, file-level change maps, and small
illustrative snippets. They must not become a parallel runtime source tree or
store deployable secrets, production credentials, executable migrations, or
generated application assets.

## Duplicate Prevention and Traceability

Before creating a plan, search active plans, investigations, decisions,
governed feature documentation, relevant ADRs, and archived records that may
still provide context. A new document must link related work and state whether
it extends, replaces, narrows, or conflicts with it.

Maintain traceability where applicable:

`investigation -> decision or ADR -> implementation plan -> PR or commit -> governed docs`

Not every idea requires every stage, but skipped stages must not conceal an
unresolved architecture or product decision.

Add every active document to its folder README with its title, status, owner,
last-updated date, short purpose, and link. A plan is not discoverable merely
because its file exists.

## Developer Handoff and Deviations

Before implementation, the developer or AI must:

1. Re-read the mandatory authoritative documents and relevant domain docs.
2. Confirm referenced source paths and described current behavior remain valid.
3. Report conflicts, missing evidence, and stale assumptions.
4. Confirm architecture and ADR impact.
5. Resolve blocking questions or return the plan to `draft`.
6. Treat the plan as guidance, not permission to bypass repository governance.

After implementation, record an **Implementation Deviations** section even when
the result is `None`. For each deviation, state what changed from the plan, why,
whether scope or architecture changed, who approved it when approval was
required, and which governed documentation was updated.

## Completion Evidence

Set a plan to `implemented` only after the intended work is complete and the
document records:

- a concise completion note
- actual repository files or code areas changed
- validation commands or review activities actually performed
- observed results, including failures, omissions, deferred checks, and
  residual risks
- applicable architecture, documentation, security, and build-surface proof

Do not count planned tests, copied assertions, or nonexistent file references
as evidence. Implemented is not archived; retain active completion evidence
until the document no longer has reference value.

## Ownership and Closure

Each active document must name an owner responsible for freshness, review
coordination, index maintenance, and closure. The implementation owner records
completion evidence and deviations; the approving reviewer confirms that the
evidence supports the lifecycle transition.

Workspace owners should periodically review active documents for stale links,
superseded assumptions, unresolved questions, and archive eligibility. If an
owner is unavailable, the document must not silently progress to `approved` or
`implemented`.

## Archive Handling

- Preserve a cohesive closed topic pack together.
- Do not archive a topic while it contains active artifacts.
- Retain completion evidence when archiving.
- Archive an investigation only when it is no longer an active reference.
