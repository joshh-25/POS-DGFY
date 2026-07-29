---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-03-04
last_reviewed: 2026-03-04
review_by: 2026-09-04
applies_to: architecture_decision
topic: modular_monolith_boundaries
---

# ADR 0001: Modular Monolith Boundaries

## Status
Accepted (2026-03-04)

## Context
The codebase has high-risk hotspots and mixed layering. We need stronger boundaries without breaking public APIs.

## Decision

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

Adopt modular monolith boundaries:

`routes -> controllers -> usecases -> repositories -> models` `[binding]`

Introduce `backend/src/modules/<domain>/...` and keep legacy files as compatibility facades during migration. `[default]`

## Consequences
1. New code lands in `src/modules`.
2. Controller-model direct imports are blocked by tooling.
3. Migration can proceed incrementally with parity tests.
