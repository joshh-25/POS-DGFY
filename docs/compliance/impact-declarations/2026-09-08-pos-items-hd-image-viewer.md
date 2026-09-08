---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-items-hd-image-viewer
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: focused POS image viewer behavior tests,focused POS catalog image resolver tests,POS production build,architecture check,compliance check,git diff --check
rollback_note: Revert the POS Items thumbnail button and image viewer component; catalog images and persistence remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-309-LOCAL-ONLY
---

# POS Items on-demand HD image viewer

## Compliance Impact Classification

Major. The classification floor comes from the POS terminal Items interface.
The viewer reads existing image URLs and does not change catalog persistence,
inventory, checkout, payment, tax, receipt, identity, or authorization behavior.

## Affected Surfaces

- A POS Items thumbnail with an available image is an accessible preview button.
- Activating it requests only the selected full-size image.
- The viewer supports close, keyboard close, gallery navigation, zoom, and
  ordered fallback when an image source fails.
- The viewer locks background scrolling and fits desktop and APK-sized screens.

## Compliance Preconditions

- Catalog and Storefront remain the owners of stored image records and files.
- Inactive full-size gallery images are not preloaded.
- No image is uploaded, copied, cached by application code, or persisted by POS.
- Missing images keep the thumbnail control disabled and do not open the viewer.

## Verification Evidence

- Focused viewer behavior and image-source resolver tests pass.
- The POS production build passes.
- Architecture, compliance, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.
