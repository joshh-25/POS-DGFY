---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-edit-item-image-drop
classification: major
surfaces: pos,terminal,inventory,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: focused POS edit-item image contract tests,POS production build,git diff --check
rollback_note: Revert the Edit Item drop handlers, drag-active styling, and saved-preview reconciliation; file-picker uploads and all persisted catalog data remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-POS-EDIT-ITEM-IMAGE-DROP-LOCAL-ONLY
---

# POS Edit Item image drag and drop

## Compliance Impact Classification

Major. The classification floor comes from the POS and terminal shared frontend
paths. This change adds a second input gesture to the existing Edit Item image
upload flow and does not alter catalog persistence, inventory, checkout, payment,
tax, discount, receipt, identity, or authorization behavior.

## Affected Surfaces

- POS Edit Item image selection accepts images dropped from File Explorer or a
  browser image URL.
- The Edit Item modal prevents the browser's default file-drop navigation.
- Pending previews disappear as their matching saved gallery entries arrive, so
  one upload is not rendered twice during catalog refresh.
- Edit Item routes one-file and multi-file selections through the gallery append
  endpoint. A one-file edit therefore preserves the existing image instead of
  replacing it and leaving an identical pending preview behind.
- The existing file-picker path, gallery preview, five-image limit, automatic
  upload, optimization, and saved-gallery behavior remain authoritative.

## Compliance Preconditions

- Dropped files pass through the existing Edit Item image selection and upload
  pipeline.
- Edit uploads retain the existing gallery and append each accepted image once.
- Non-image files are rejected and disabled upload states remain enforced.
- No API, database, migration, fiscal, payment, or inventory behavior changes.

## Verification Evidence

- Focused POS Edit Item image contract tests pass.
- The POS production build passes.
- `git diff --check` passes.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.
