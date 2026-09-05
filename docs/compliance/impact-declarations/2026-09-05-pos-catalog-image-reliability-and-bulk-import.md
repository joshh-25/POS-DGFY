---
status: reference
owner: engineering
last_reviewed: 2026-09-05
related_adr: docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md (2026-09-05 Amendments)
declaration_id: 2026-09-05-pos-catalog-image-reliability-and-bulk-import
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.05
verification_evidence: focused API image/import suites 35 passing,focused shared POS suites 40 passing,POS IMS and Storefront production builds,npm run check:architecture,npm run lint:docs,git diff --check
rollback_note: No database migration or backfill is introduced; rollback is a code/config revert after allowing or explicitly cancelling accepted Redis-backed jobs and removing only their job-scoped private staging directories after the retention boundary.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-05T05:30:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-289-290-POS-IMAGE-UPLOAD
---

# POS catalog image reliability and recoverable bulk import (Phases 289-290)

## Compliance Impact Classification

Major. The change touches authenticated POS catalog routes, controllers, repositories, and
terminal UI. It does not change tax computation, receipts, payments, discounts, compliance-mode
activation, customer identity, or financial reporting. The declared surface and classification
meet the mechanically computed floor from `scripts/check-compliance-impact.js`.

## Affected Surfaces

- Authenticated POS item-image create, replace, delete, catalog projection, and rendering paths.
- An `items:edit`-protected ZIP plus CSV import workflow with tenant-scoped job status and retry.
- Redis-backed processing metadata and private job-scoped source staging used to produce 144px POS
  derivatives. Storefront image fields, ordering, selection, and rendering remain unchanged.

## Compliance Preconditions

- Existing authentication, tenant identity, and `items:edit` authorization remain mandatory for
  every mutation and result read; CSV data never supplies authority or tenant identity.
- Import job and item-lock keys are tenant-scoped. Unknown or cross-tenant job identifiers return
  no result and cannot be used to attach an asset.
- New submissions fail closed when the feature flag or Redis dependency is unavailable. Disabling
  submissions does not hide or discard already accepted work; the worker continues draining it.
- Raw packages and original images stay outside the public uploads tree and are deleted only by
  job-scoped lifecycle cleanup. No database migration, broad deletion, or catalog backfill runs.
- Archive paths, entry types, duplicate names, sizes, expansion ratios, transport hashes, image
  signatures, attempts, leases, and latest-item versions are validated before authoritative writes.

## Verification Evidence

- API-focused image/import suites: 6 suites, 35 tests passed. Coverage includes manifest bounds,
  private storage, traversal/duplicate/expansion rejection, 144px asset generation, catalog
  projection, worker acknowledgement, cleanup, and stale-version supersession.
- Shared POS-focused suites (run from `apps/dgfy-ims`): 9 files, 40 tests passed. Coverage includes
  previews, bounded retries, read coalescing, Items/Sell rendering contracts, package chunking,
  deterministic resume identity, pagination, and failed-only retry.
- POS, IMS, and Storefront production builds passed. Existing large-bundle warnings remain and are
  not represented as APK interaction evidence.
- `npm run check:architecture` passed (54 modules, 566 code files, 95 controllers),
  `npm run lint:docs` passed (29 governed docs, 88 ADRs), and `git diff --check` passed with only
  the existing Git line-ending warning.
- Real local Redis transport, reliable dequeue/recovery/fencing, global concurrency, item locking,
  acknowledgement, failure retention/cleanup, and concurrent retry probes passed without merchant
  catalog mutation. Actual APK latency/memory evidence remains user-owned and pending.

The live request-time compliance preflight was not executed because this is local implementation
work with no PR or deployment request. The placeholder is intentionally explicit and must be
reconciled by the repository's normal preflight workflow before any governed production promotion.
