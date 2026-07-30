---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-03-30
last_reviewed: 2026-03-30
review_by: 2026-09-28
applies_to: architecture_decision
topic: skupervisor_expansion_program_boundaries
---

﻿# ADR 0006: SKUpervisor Expansion Program Boundaries And Rollout Strategy

## Status
Accepted (2026-03-30)

## Context
SKUpervisor is expanding into a multi-surface product with three app surfaces:
1. SKUpervisor IMS (`skupervisor`)
2. POS terminal (`pos`)
3. Public marketplace/storefront (`store`)

The repository currently has strong architecture guardrails and a hardened POS baseline. The expansion must add new capabilities while preserving existing operational stability.

## Decision
Adopt the following execution architecture:

1. Rollout model is vertical-slice first, then full hardening.
2. Frontend migration is staged split, not big-bang rewrite.
3. New business logic follows modular boundaries:
   `routes -> controllers -> usecases -> repositories -> models`
4. Store customer auth is a dedicated Store JWT domain and remains separate from tenant staff auth.
5. Store customers are tenant-isolated.
6. Order contracts split source and method:
   - `order_source`: `in_store | online_store`
   - `order_method`: fulfillment method (`dine_in | takeout | pickup | delivery`)
7. Tracking responses for valid pins return `200` with explicit status payloads.
8. Existing POS permission model is reused for v1 online-order acceptance and status workflows.
9. Payment work in this program is provider-neutral structure only until concrete provider credentials are available.

## Consequences
1. Expansion can proceed without destabilizing current IMS/POS production behavior.
2. New modules can be delivered incrementally with architecture compliance evidence.
3. Multi-tenant data leakage risk is reduced by keeping strict tenant context boundaries and isolated store auth.
4. Additional phase ADR amendments may be added if cross-boundary decisions evolve.
