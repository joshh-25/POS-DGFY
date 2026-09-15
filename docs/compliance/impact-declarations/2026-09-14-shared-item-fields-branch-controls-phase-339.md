---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-shared-item-fields-branch-controls-phase-339
classification: major
surfaces: inventory, pos, terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.14
verification_evidence: focused POS, Storefront catalog, job-order, tenant-reference, and runtime-schema tests; backend lint; architecture, tenant-schema, documentation, ADR, and diff checks
rollback_note: Revert the POS branch applicability model and migration, job-order location-scope fields and migration, grant enforcement, catalog filtering/UI, tests, documentation, and declaration together; no item identity, stock balance, pricing, tax, FIFO, or historical record is copied or rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-14T00:00:00+08:00
preflight_request_ref: PHASE-339-SHARED-ITEM-FIELDS-BRANCH-CONTROLS-LOCAL
---

# Shared item fields with explicit branch controls

## Compliance Impact Classification

Major because the change affects inventory availability and POS/catalog channel controls across
tenant locations, while adding location-scoped job-order preflight. It is additive and preserves
the existing item identity, valuation, tax, FIFO, reservation, and compatibility-aggregate
contracts.

## Affected Surfaces

- POS and Storefront branch-specific item applicability and inherited-versus-override display.
- Inventory item editing, branch grant authorization, and location-scoped job-order preflight.
- Tenant-location reference/deletion guards and runtime schema readiness checks.

## Compliance Preconditions

- One tenant-owned item ID remains shared across branches; global identity, price, tax, image,
  archive, recipe, cost, and FIFO fields are not duplicated or silently made branch-owned.
- POS and Storefront branch availability is an explicit override layer. A missing override means
  inherited company policy; disabling a channel is separate from stock quantity and out-of-stock
  state.
- Branch stock continues to use `item_location_stocks` and reservations under ADR 0009. Job-order
  source and destination locations are validated as active and grant-authorized before preflight,
  and no Main balance is borrowed or copied.
- Global archive remains separate from branch disable, and inactive locations cannot receive new
  catalog overrides or job-order output.

## Verification Evidence

- API tests cover branch POS updates, Storefront grant denial, job-order location forwarding, and
  runtime migration/column readiness; tenant-location reference coverage passes.
- POS catalog filtering and Items UI expose per-branch inherited/override state while preserving
  the existing global catalog contract.
- Backend lint, architecture/controller-boundary, tenant-schema, documentation/ADR, and diff
  checks are run before delivery.

This declaration covers the authorized local Phase 339 implementation. No rollout flag change,
production data mutation, stock transfer, opening-balance copy, deployment, or merge was performed.
