---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-03-27
last_reviewed: 2026-03-27
review_by: 2026-09-27
applies_to: architecture_decision
topic: unified_sales_read_model
---

# ADR 0005: Unified Sales Read Model Across POS and Dispatch

## Status
Accepted (2026-03-27)

## Context
POS and Dispatch represent different operational domains with different write workflows, but users need one consolidated sales timeline and summary view.

## Decision
Introduce a read-only Sales module that normalizes POS and Dispatch records into a single response contract.

Key rules:
1. Do not merge POS and Dispatch write paths.
2. Unified Sales is read-only.
3. Keep source tagging (`POS`, `DISPATCH`) in output rows.
4. Preserve source-domain financial snapshots and derive summary metrics at read time.

## Consequences
1. Users get a single consolidated sales page without breaking domain boundaries.
2. Existing POS and Dispatch APIs remain stable.
3. Sales aggregation logic is centralized for reporting UX while avoiding cross-domain write side effects.

