---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-03-04
last_reviewed: 2026-03-04
review_by: 2026-09-04
applies_to: architecture_decision
topic: error_contract_unification
---

# ADR 0002: Error Contract Unification

## Status
Accepted (2026-03-04)

## Context
Error handling is mostly standardized but still inconsistent across legacy and new paths.

## Decision
Introduce shared domain error contracts in `backend/src/modules/shared/contracts`:
1. `DomainErrorCode`
2. `DomainError`
3. domain error to HTTP mapper
4. `ApplicationResult<T>` envelope for use-case outputs

## Consequences
1. New use-cases return explicit success/failure envelopes.
2. Error middleware can map domain failures consistently.
3. Existing API response shape remains backward compatible with additive fields (`error_code`, `request_id`).
