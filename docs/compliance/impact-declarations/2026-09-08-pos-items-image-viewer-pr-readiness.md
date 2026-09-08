---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-items-image-viewer-pr-readiness
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: focused POS image resolver tests,focused POS image viewer behavior tests,POS production build,architecture check,compliance check,app-version check,git diff --check
rollback_note: Revert Phase 312 image resolution, dialog, zoom, and app-version changes; stored catalog images and data remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-312-LOCAL-ONLY
---

# POS Items image-viewer PR-readiness hardening

## Compliance Impact Classification

Major. The classification floor comes from the shared POS terminal image
resolver and modal. The change selects existing image URLs, constrains local
rendering, and updates application versions. It does not mutate catalog images,
inventory, checkout, payments, taxes, receipts, identity, or authorization.

## Affected Surfaces

- Duplicate primary gallery entries preserve their richer variant metadata.
- Legacy POS image paths remain viewable.
- Zoom is available only when the source contains enough pixels.
- The shared dialog traps focus, handles Escape, and restores focus on close.
- Gallery controls use true thumbnails or lightweight numbered placeholders.
- POS, IMS, and Storefront versions increase for the shared web-core feature.

## Compliance Preconditions

- Only the active HD image is requested after the viewer opens.
- Inactive gallery HD images remain unloaded.
- The Items list continues loading its existing thumbnail source.
- No new upload, image copy, application cache, or database write is introduced.

## Verification Evidence

- Focused resolver and viewer behavior tests pass.
- The POS production build passes.
- Architecture, compliance, documentation, version, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.
