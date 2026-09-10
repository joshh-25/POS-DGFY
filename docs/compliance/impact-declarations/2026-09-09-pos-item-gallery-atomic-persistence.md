---
status: reference
owner: engineering
last_reviewed: 2026-09-09
declaration_id: 2026-09-09-pos-item-gallery-atomic-persistence
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.09
verification_evidence: focused API gallery/use-case/repository/worker tests,storefront image persistence integration test,focused POS editor contract tests,changed-file ESLint,architecture checks,documentation checks,git diff --check
rollback_note: Revert the Phase 318 gallery commit, stale-base transport, and post-commit cleanup changes together; existing catalog records and image assets remain available and no migration is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-09T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-318-LOCAL-ONLY
---

# POS item gallery atomic persistence

## Compliance Impact Classification

Major, meeting the inventory and POS/terminal surface floors. The change makes
POS item image gallery writes stale-safe and transactional while preserving the
existing Catalog/Storefront ownership boundary. It does not change checkout,
payments, taxes, discounts, receipts, identity, or authorization rules.

## Affected Surfaces

- POS and inventory gallery upload, reorder, replacement, and delete writers.
- Tenant-scoped item repository persistence and stale-gallery conflict handling.
- POS/IMS editor requests that send the current gallery base for safe updates.

## Compliance Preconditions

- Existing authentication, tenant scoping, permission, image MIME/size, and
  five-image limits remain enforced.
- The repository locks the tenant item row, rereads the gallery, compares the
  expected base, and commits before any omitted file is removed.
- Stored gallery variants, original paths, classification, and source
  attribution are preserved by canonical identity matching.
- No tax, payment, fiscal document, shift, inventory quantity, or schema
  behavior is changed. No database migration or backfill is required.

## Verification Evidence

- Focused API gallery use-case, repository, worker, handler, and persistence
  integration tests pass, including stale-base, empty-base, metadata,
  remove-all failure, and cleanup-failure cases.
- Focused POS editor and inventory contract tests pass; changed API files lint
  cleanly.
- Architecture guardrails, controller-boundary checks, documentation/ADR
  checks, and `git diff --check` pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no push, PR, deployment, or
production operation.
