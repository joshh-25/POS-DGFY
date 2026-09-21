---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-items-hd-preview-source-contract
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: focused POS catalog image resolver tests,POS production build,architecture check,compliance check,git diff --check
rollback_note: Revert the preview-source resolver, its focused tests, and Phase 308 ledger entry; catalog images and persistence remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-08-POS-ITEMS-HD-PREVIEW-SOURCE-CONTRACT
---

# POS Items HD preview source contract

## Compliance Impact Classification

Major. The classification floor comes from the shared POS and terminal frontend
utility. The change resolves existing image URLs and does not alter catalog
persistence, checkout, inventory, payment, tax, receipt, identity, or access
control behavior.

## Affected Surfaces

- POS Items can resolve a lightweight thumbnail independently from an optimized
  large preview URL.
- POS-specific image overrides take precedence over the Storefront gallery.
- Storefront gallery entries retain their order and duplicate URLs are removed.
- Preview fallback order is optimized large, configured image, medium, then
  thumbnail.

## Compliance Preconditions

- Catalog and Storefront remain the owners of stored image records and files.
- The resolver performs no network request, upload, copy, cache write, or
  database mutation.
- The existing POS service worker continues bypassing `/uploads/` responses.
- Phase 309 must load the large image only after explicit thumbnail activation.

## Verification Evidence

- Focused POS catalog image resolver tests pass.
- The POS production build passes.
- Architecture, compliance, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.
