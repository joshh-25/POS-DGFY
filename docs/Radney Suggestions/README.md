# DGFY Planning Workspace Proposal

## Proposal Status

This directory is a collaborator proposal for organizing planning and review
artifacts. It is not an authoritative documentation root and does not replace
the governance model defined by:

- [`../START_HERE.md`](../START_HERE.md)
- [`../architecture/ARCHITECTURE_BOUNDARIES.md`](../architecture/ARCHITECTURE_BOUNDARIES.md)
- [`../architecture/ARCHITECTURE_GOVERNANCE.md`](../architecture/ARCHITECTURE_GOVERNANCE.md)
- relevant accepted ADRs under [`../architecture/adr/`](../architecture/adr/)

Until this proposal is adopted through architecture governance, documents here
must be treated as proposal material. They cannot authorize implementation,
override an authoritative document, or establish current system behavior by
themselves.

## Purpose

The proposed workspace separates source-backed baselines, investigations,
plans, decisions, and temporary review artifacts by primary intent. It contains
documentation only—never runtime source, migrations, deployment configuration,
generated application assets, or secrets.

## Proposed Structure

| Folder | Proposed purpose |
| --- | --- |
| `00-baselines/` | Source-backed current-state maps |
| `01-rules/` | Proposed planning, placement, and review rules |
| `10-feature-plans/` | New capabilities and workflow expansions |
| `20-bugfix-plans/` | Repairs to intended existing behavior |
| `30-uiux-plans/` | Usability, interaction, accessibility, and layout work |
| `40-investigations/` | Unresolved discovery and root-cause analysis |
| `50-decisions/` | Proposed or approved-at-workspace-level directions |
| `60-archive/` | Superseded or collaborator-closed planning records |
| `90-temp-qa/` | Temporary review artifacts; not release evidence |

## Authority Boundary

- Authoritative current behavior remains documented in the existing governed
  domain folders, including `docs/architecture`, `docs/api`, `docs/database`,
  `docs/features`, `docs/compliance`, `docs/ops`, and `docs/testing`.
- Runtime source and executable tests provide implementation evidence, but
  discrepancies must be resolved through the governed documentation process.
- Cross-boundary decisions require a new or updated ADR under
  `docs/architecture/adr/`.
- Lifecycle labels inside this workspace describe proposal workflow only. They
  are not substitutes for governed front-matter authority statuses.

## Evidence Rule

A document may claim `implemented` only when its completion record names the
actual files changed, validation performed, observed results, omissions, and
residual risks. Planned tests and expected results are not completion evidence.

Start with:

- [DGFY system mapping baseline](00-baselines/system-mapping-baseline.md)
- [Implementation segregation rule](01-rules/implementation-segregation-rule.md)
- [Access-control planning rule](01-rules/access-control-planning-rule.md)
