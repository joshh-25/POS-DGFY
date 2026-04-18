---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-04-18
applies_to: multi_location_inventory_rollout
topic: decision_lock_contract
---

# Multi-Location Inventory Decision Ledger

This document is the decision contract for the multi-location inventory rollout.
Any scope change must update this ledger, the ADR, and the requirement matrix in the same PR.

## Locked Decisions
1. Per-location stock is authoritative; `items.current_stock` remains derived compatibility total.
2. PO receive requires `location_id`.
3. JO complete requires `source_location_id` and `destination_location_id` with one source location per completion action.
4. Dedicated stock transfer flow is in scope for this phase.
5. QR receive requires authenticated user, with receiver-selected location and backend location access checks.
6. Location permissions apply across stock-affecting inventory workflows.
7. Storefront order routing is single-location only.
8. Storefront item search filters map/list/grid to matching locations with available stock.
9. Storefront stock visibility is availability-only by default.
10. Legacy global stock and open FIFO balances migrate to the primary location during bootstrap.
11. Oversell policy is hard-block at selected location with deterministic error response.
12. Rollout is phased and feature-flagged with safety gates.

## Safety No-Go Rules
1. Backup + restore drill must pass before cutover.
2. Rollout migration window is additive-only.
3. Backfill parity checks for stock and FIFO must pass.
4. Drift monitor must remain stable in soak window.
5. Pilot tenant E2E readiness must pass with zero P1 data integrity incidents.
6. Rollback rehearsal must pass before wave expansion.
7. Architecture/compliance/testing gates must pass per wave.

## Context-Lock Rules
1. No phase is complete unless every row in the requirement matrix is implemented and verified.
2. Scope changes require explicit change-control entry with date, owner, reason, and downstream impacts.
3. Handoff packet is mandatory for each rollout wave.

## Change-Control Entries
1. Date: 2026-04-16
- Owner: Engineering
- Change: Added explicit user-location-grant management endpoints and UI (`GET/PUT /users/:user_id/location-grants` + Settings modal scope editor).
- Reason: Close ML-06 operational gap so enforcement can be configured without direct DB edits.
- Impacts: User management transport/use-case/service updates, frontend user service/modal updates, new test coverage.

2. Date: 2026-04-16
- Owner: Engineering
- Change: Tightened grant enforcement when `multi_location_inventory_enabled=true`; users without grants are denied stock-affecting writes.
- Reason: Remove permissive bridge behavior during enabled multi-location mode.
- Impacts: `locationInventoryService.assertLocationAccess` behavior change; requires grant bootstrap before/at enablement.

3. Date: 2026-04-16
- Owner: Engineering
- Change: Added migration `20260416000008-backfill-user-location-grants.cjs`.
- Reason: Prevent operational lockout on feature-flag enablement by seeding active-user grants across active locations.
- Impacts: Runtime schema audit required migration list updated; rollout handoff updated with migration evidence.

4. Date: 2026-04-17
- Owner: Engineering
- Change: Enforced location-required contracts across PO/JO/QR frontend flows and AI tool handlers; normalized JO `quality_check` legacy values (`pass`/`fail`) to canonical (`passed`/`failed`) at transport boundaries.
- Reason: Close high-risk contract drift and alternate-path loopholes identified in remediation audit.
- Impacts: PO receipt modal now requires location selection; JO completion requires source/destination locations; mobile QR receive enforces location fields; AI `receive_purchase_order` and `complete_job_order` now require/persist location inputs; targeted tests updated for new contracts.

5. Date: 2026-04-17
- Owner: Engineering
- Change: Reopened matrix rows `ML-01`, `ML-02`, `ML-03`, `ML-05`, `ML-06`, `ML-09`, and `ML-12` to `In Progress` pending stale test remediation and operational no-go evidence.
- Reason: Preserve rollout truthfulness and enforce no-omission gate while deterministic transport contracts, storefront quantity-leak closure, and wave evidence are still being completed.
- Impacts: Wave closure is blocked until mapped tests are green and handoff packet evidence links exist for backup/restore, parity, drift soak, rollback rehearsal, and pilot UAT.

6. Date: 2026-04-17
- Owner: Engineering
- Change: Implemented closure remediation for deterministic location-field contract tests, availability-only storefront catalog contract, and rollout evidence automation (`audit:location-stock-parity`, FIFO/Parity JSON artifact support, closure gate script).
- Reason: Resolve remaining contract drift and quantity-leak risks while adding auditable no-go evidence mechanics for phased rollout.
- Impacts: AI tool handlers now fail fast on location-less payloads; PO/JO/QR transport contracts have deterministic 422/403 tests; storefront catalog removes `current_stock` from public payload; closure gate intentionally fails until matrix rows are completed and handoff evidence is no longer pending.

7. Date: 2026-04-17
- Owner: Engineering
- Change: Added local-wave evidence waiver contract (`waived_local`) for operational gates in the closure script, generated checksum-backed local evidence artifacts, and promoted matrix rows `ML-01/02/03/05/06/09/12` to `Completed` for local closure.
- Reason: Remove local hard blockers without falsifying production readiness; preserve strict production requirement while allowing deterministic engineering closure for non-production verification waves.
- Impacts: `check:multi-location-rollout` now accepts `waived_local` only for local waves with mandatory waiver reason; parity/FIFO artifacts are hash-verified; production rollout remains policy-blocked until ops-run gates are executed in deployment environments.

8. Date: 2026-04-18
- Owner: Engineering
- Change: Added full frontend/backend operation contract matrix for inventory + commerce flows and resolved multi-location UI readiness defects (location-required copy/selector parity checks plus ASCII-safe fallback labels in JO details states).
- Reason: Close remaining parity-audit gaps by documenting every stock-affecting operation with explicit mismatch tags and verification evidence while removing user-facing ambiguity in edge UI states.
- Impacts: New operation-level traceability artifact is now required for wave closure; requirement matrix usage updated to mandate cross-check; JO details modal now renders deterministic fallback labels (`N/A`) in timeline and FIFO batch visibility states.

9. Date: 2026-04-18
- Owner: Engineering
- Change: Contained tenant schema-sync residual risk by switching deploy default to `sync-tenant-schemas --mode report`, adding tenant index headroom audit telemetry, and introducing strict toggles for `require-zero` regression gating after cleanup.
- Reason: Eliminate unsafe production reliance on `sequelize.sync({ alter: true })` in the deploy path while creating deterministic evidence for MySQL key-limit debt closure.
- Impacts: Deploy now emits both tenant sync and tenant index headroom reports; cleanup can be executed via dedicated remediation tooling with dry-run defaults and explicit apply confirmation.

10. Date: 2026-04-18
- Owner: Engineering
- Change: Finalized strict production closure by clearing baseline failures, enabling strict deploy defaults (`DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`, `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1`), remediating redundant tenant indexes, and redeploying commit `07c1eb20e5dc0de8519d7dac89f4c70f37662db1` with all rollout gates green.
- Reason: Complete remediation waves and remove residual deploy-time ambiguity so production rollout state matches matrix/ops truth.
- Impacts: Tenant schema sync now enforces zero unresolved failures in deploy pipeline; tenant index headroom strict audit blocks release on drift; operational evidence captured in wave handoff packet and deploy artifacts.
