---
status: reference
owner: engineering
last_reviewed: 2026-09-09
declaration_id: 2026-09-09-pos-item-editor-retry-consistency
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.09
verification_evidence: focused Phase 319 rendered/contract tests, POS/IMS/Storefront production builds, architecture/compliance/docs/version/diff gates
rollback_note: Revert the Phase 319 editor identity, retry reconciliation, AI refresh, and Add recovery changes together; existing persisted item galleries and image jobs remain unchanged and no migration is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-09T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-319-LOCAL-ONLY
---

# POS item editor state and retry consistency (Phase 319)

## Compliance Impact Classification

Major. The change hardens the POS item editor and its asynchronous Catalog image
job boundary while preserving the existing Catalog/Storefront ownership and
authorization rules. It does not change checkout, payments, pricing, taxes,
inventory movement, or tenant access.

## Affected Surfaces

- POS Add/Edit Item keeps a stable parent-owned gallery draft and controlled
  Primary selection while files are pending.
- Rejected and ambiguous uploads keep the editor state and require a catalog
  status reconciliation before a retry can send the same intent again.
- AI completion refreshes only the authoritative gallery and ignores stale
  modal/item sessions; Add recovery retries only the currently selected failed
  image stage against the existing item ID.

## Compliance Preconditions

- Image bytes continue through the existing server-side Catalog image worker;
  POS stores only temporary preview leases and job metadata.
- Existing permission, MIME/size, readiness, tenant, and five-image limits stay
  enforced by the current endpoints and Phase 318 repository transaction.
- No database migration, new dependency, persistent POS image copy, eager HD
  request, or physical iMin validation is introduced.

## Verification Evidence

- Phase 319 focused suite passes 8 files and 40 tests, including controlled
  Primary identity, cancel/retry contracts, stale AI completion, Add recovery,
  and uncertain-upload reconciliation.
- POS, IMS, and Storefront production builds pass.
- Architecture, compliance API-contract, documentation/ADR, workspace-hygiene,
  app-version, and diff checks are run for the complete local change set.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or
production operation.
