---
status: reference
owner: engineering
last_reviewed: 2026-07-24
related_adr: 0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-07-24-pos-shift-offline-cache-hardening
classification: major
surfaces: pos,terminal,pwa,settings
reason_codes_impacted: POS_SHIFT_CLOSED,SHIFT_LOCATION_MISMATCH,LOCATION_SCOPE_UNRESOLVED
policy_version: 2026.07.24
verification_evidence: pos-usecase-tests,upload-cache-policy-tests,pos-contract-tests,pos-production-build,architecture-guardrails,controller-boundaries,diff-check
rollback_note: Revert the active-shift queue scope, scoped offline persistence, POS shell cache revision, and terminal workspace changes together; no transaction, payment, receipt, or inventory records are migrated or rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-24T12:45:00+08:00
preflight_request_ref: POS-SHIFT-OFFLINE-CACHE-2026-07-24
---

# POS Shift, Offline, And Cache Hardening

## Compliance Impact Classification

Major. This work binds incoming online-order access and fulfillment mutations to an authenticated active shift, scopes offline POS data to the current company, terminal, location, and user, and makes the POS application shell cache revision deterministic. It does not change payment authorization, fiscal calculations, receipt numbering, or Storefront API contracts.

## Affected Surfaces

- POS incoming-order queue visibility and online-order fulfillment updates.
- POS terminal offline snapshots, operation queue, manual synchronization, and service-worker shell caching.
- POS reports, receipts, hardware routing, responsive navigation, and Storefront settings workspace refresh behavior.

## Compliance Preconditions

- Protected online-order operations remain server-authoritative and require an active shift at the order location.
- Offline financial records remain provisional until the existing idempotent server replay accepts them.
- Browser-local records fail closed when company, terminal, location, or user scope is incomplete.
- Storefront settings refreshes preserve the active form without changing saved business rules or public API contracts.
- Payment, receipt, transaction, and inventory writes retain their existing backend authorization and transaction boundaries.

## Verification Evidence

- Backend focused tests: 42 passed across POS use cases and upload cache policy.
- Frontend focused tests: 85 passed across offline persistence, service-worker caching, reports, receipts, responsive terminal behavior, and Storefront business hours.
- POS production build completed successfully.
- Architecture guardrails and controller-boundary checks passed during pre-commit validation.
- Changed-file `DO NOT COMMIT` scan and `git diff --check` passed.
