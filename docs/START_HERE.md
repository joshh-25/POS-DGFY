---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-08-25
applies_to: all_agents_and_engineers
topic: documentation_discovery
---

# Documentation Start Here

This is the canonical entry point for implementation planning.

## Mandatory Lookup Order
1. This file (`docs/START_HERE.md`)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. Relevant ADRs under `docs/architecture/adr/` — start from `docs/architecture/adr/INDEX.md`
5. Feature/domain docs needed by your change

## How To Decide Which Docs Are Authoritative
1. Use front matter:
- `status: authoritative` means source of truth
- `status: reference` means supporting context
- `status: historical` means legacy context only
- `status: deprecated` means do not use for new decisions
2. If two docs conflict, higher authority wins:
- authoritative > reference > historical > deprecated
3. ADRs carry two separate fields. `authority_level` is document authority, as
above. `status` is the ADR's lifecycle state: `proposed`, `accepted`, `amended`,
`superseded`, `retired` (ADR 0039). Do not cite `superseded` or `retired` ADRs
in new plans; `proposed` ADRs constrain nothing.
4. Inside an accepted ADR, only `[binding]` clauses are hard constraints.
`[default]` clauses can be changed with an amendment block in your PR, and
untagged clauses are `default`.

## Folder Usage Guide
- `docs/architecture`: architecture rules, governance, ADRs
- `docs/api`: API behavior and contracts
- `docs/compliance`: compliance controls, preflight protocol, and declarations
- `docs/database`: schema and data contracts
- `docs/features`: feature-level behavior
- `docs/testing`: verification protocols and audits
- `docs/reference`: quick operational references
- `docs/proposals`: proposal and narrative materials
- `docs/archive`: historical/non-authoritative content
- `docs/templates`: planning templates
- `docs/generated`: generated artifacts (non-authoritative unless explicitly stated)
- `docs/_meta`: machine-readable registry and lint metadata
- `docs/meetings`: raw stakeholder meeting capture (`authority_level: historical` — never a rule
  source; decisions worth keeping are routed into an ADR, a governed doc, or an issue)

## Mandatory Checks Before Implementation Plan
1. Confirm boundaries and governance docs are cited.
2. Confirm ADR impact (`new`, `update`, or `not needed`).
3. Confirm planning does not rely on deprecated docs.
4. Run `npm run check:architecture` for architecture-sensitive changes.
5. For release, CI/CD, branch, or production-promotion work, read `docs/ops/RELEASE_CANDIDATE_POLICY.md`
   (`docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`, previously pointed to here, is superseded by it).
6. For questions about the repository layout under `apps/`, path relocations from the
   pre-refactor `backend/`/`frontend/`/`android/` trees or the pre-split `apps/dgfy-web/` tree
   (now `apps/dgfy-ims`/`apps/dgfy-pos`/`apps/dgfy-storefront`/`packages/web-core`), or local
   run/deploy commands, read `docs/architecture/apps-layout-migration.md`.

## Deprecated or Historical Material
Use only for context. Do not use these as a source of architectural truth.
