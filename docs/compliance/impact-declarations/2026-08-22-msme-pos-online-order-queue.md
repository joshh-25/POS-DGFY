---
status: reference
owner: engineering
last_reviewed: 2026-08-22
declaration_id: 2026-08-22-msme-pos-online-order-queue
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: MSME_POS_ONLINE_QUEUE_VISIBILITY
policy_version: 2026.08.22
verification_evidence: store-profile-equivalence-16-of-16,pos-profile-contracts-8-of-8,pos-production-build,architecture-and-docs-lint
rollback_note: Revert the MSME queue default and stale-profile rebuild changes; no migration or data rewrite is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T11:55:58+08:00
preflight_request_ref: #843
---

# MSME POS Online Order Queue Visibility

## Compliance Impact Classification

Major because this change affects which authenticated POS navigation and online-order queue
affordances are visible to an MSME cashier. It does not change permissions, active-shift gates,
tenant or location scoping, order persistence, payments, inventory, fiscal records, or production
configuration.

## Affected Surfaces

- MSME POS navigation and Incoming Online Queue visibility.
- Frontend Store Profile resolution when a persisted derived profile is stale.
- Shared MSME POS presentation defaults.

## Compliance Preconditions

- The queue remains gated by the tenant's effective `pos` and `storefront` capabilities.
- Existing authenticated POS permission, active-shift, location-scope, and connectivity checks
  remain authoritative.
- Services continues to exclude the shared online-order queue.
- The derived Store Profile remains server-owned; this change does not permit client writes.
- No tenant data, order, payment, inventory, shift, or database row is migrated or rewritten.

## Verification Evidence

- Store Profile equivalence: 1 backend suite, 16/16 assertions and 11/11 snapshots passed.
- Frontend Store Profile and POS operational visibility: 2 files, 8/8 assertions passed.
- POS production build passed.
- Architecture guardrails, controller boundaries, documentation lint, and ADR lint passed.
