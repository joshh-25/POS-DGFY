---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-03-04
last_reviewed: 2026-03-04
review_by: 2026-09-04
applies_to: architecture_decision
topic: migration_facade_strategy
---

# ADR 0003: Migration Facade Strategy

## Status
Accepted (2026-03-04)

## Context
A big-bang rewrite would create high regression risk for subscription, auth, and inventory flows.

## Decision
Use compatibility facades:
1. Keep legacy controllers/routes intact.
2. Move logic into module use-cases/repositories.
3. Legacy controllers call module use-cases until parity is proven.
4. Remove legacy facade code only after stable green runs.

## Consequences
1. Safer phased migration.
2. Slight temporary duplication is acceptable.
3. Clear cleanup checkpoints are required per phase.
