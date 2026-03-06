---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-03-06
applies_to: all_agents_and_engineers
topic: documentation_discovery
---

# Documentation Start Here

This is the canonical entry point for implementation planning.

## Mandatory Lookup Order
1. This file (`docs/START_HERE.md`)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. Relevant ADRs under `docs/architecture/adr/`
5. Feature/domain docs needed by your change

## How To Decide Which Docs Are Authoritative
1. Use front matter:
- `status: authoritative` means source of truth
- `status: reference` means supporting context
- `status: historical` means legacy context only
- `status: deprecated` means do not use for new decisions
2. If two docs conflict, higher authority wins:
- authoritative > reference > historical > deprecated

## Folder Usage Guide
- `docs/architecture`: architecture rules, governance, ADRs
- `docs/api`: API behavior and contracts
- `docs/database`: schema and data contracts
- `docs/features`: feature-level behavior
- `docs/testing`: verification protocols and audits
- `docs/reference`: quick operational references
- `docs/proposals`: proposal and narrative materials
- `docs/archive`: historical/non-authoritative content
- `docs/templates`: planning templates
- `docs/generated`: generated artifacts (non-authoritative unless explicitly stated)
- `docs/_meta`: machine-readable registry and lint metadata

## Mandatory Checks Before Implementation Plan
1. Confirm boundaries and governance docs are cited.
2. Confirm ADR impact (`new`, `update`, or `not needed`).
3. Confirm planning does not rely on deprecated docs.
4. Run `npm run check:architecture` for architecture-sensitive changes.

## Deprecated or Historical Material
Use only for context. Do not use these as a source of architectural truth.
