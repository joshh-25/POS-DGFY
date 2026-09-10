---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-items-sharp-hd-source-selection
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: focused POS image resolver tests,focused POS image viewer behavior tests,POS production build,architecture check,compliance check,git diff --check
rollback_note: Revert image-source marker handling and default-zoom rendering; catalog images and persistence remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T09:13:34.309Z
preflight_request_ref: PREFLIGHT-34459098510-2026-09-08-POS-ITEMS-SHARP-HD-SOURCE-SELECTION
---

# POS Items sharp HD source selection

## Compliance Impact Classification

Major. The classification floor comes from the shared POS terminal image
resolver. The change chooses among existing URLs and does not alter stored image
assets, catalog data, inventory, checkout, payments, taxes, receipts, identity,
or authorization.

## Affected Surfaces

- Storefront-backed POS catalog rows use the Storefront large preview variant.
- True POS overrides retain their existing precedence.
- Legacy responses without `pos_image_source` retain URL-based compatibility.
- Normal zoom no longer applies a transform compositor layer.
- The viewer backdrop remains a translucent CSS color without a blur filter.

## Compliance Preconditions

- The viewer requests an HD source only after the user opens it.
- Inactive gallery HD images remain unloaded.
- The Items list continues using thumbnail sources.
- No new upload, copy, application cache, or database write is introduced.

## Verification Evidence

- Focused resolver and viewer behavior tests pass.
- The POS production build passes.
- Architecture, compliance, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.
