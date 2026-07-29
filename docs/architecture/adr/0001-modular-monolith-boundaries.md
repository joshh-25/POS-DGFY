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
Adopt modular monolith boundaries:

`routes -> controllers -> usecases -> repositories -> models`

Introduce `backend/src/modules/<domain>/...` and keep legacy files as compatibility facades during migration.

## Consequences
1. New code lands in `src/modules`.
2. Controller-model direct imports are blocked by tooling.
3. Migration can proceed incrementally with parity tests.
