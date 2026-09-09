---
status: reference
owner: engineering
last_reviewed: 2026-09-09
declaration_id: 2026-09-09-pos-edit-item-gallery-draft
classification: major
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.09
verification_evidence: focused POS edit-gallery helper and save-contract tests,focused API gallery and worker tests,POS production build,changed-file lint,architecture check,compliance check,documentation check,git diff --check
rollback_note: Revert the Phase 317 gallery-intent transport, worker, and staged Edit Item changes; existing catalog image records remain valid and no migration is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-09T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-317-LOCAL-ONLY
---

# POS Edit Item gallery draft consistency

## Compliance Impact Classification

Major. The change crosses the POS item editor and the Catalog image worker,
but it preserves the existing Catalog/Storefront ownership boundary. It does
not change inventory, checkout, payments, taxes, receipts, identity, or
authorization.

## Affected Surfaces

- Edit Item keeps image additions, removals, reordering, and Primary selection
  local until Save Item.
- A saved edit sends one validated gallery intent with the asynchronous upload,
  so a single new image cannot replace or duplicate the existing gallery.
- Repeated file selections are ignored, and stale concurrent gallery edits are
  rejected with a reopen message.
- Legacy append-only gallery uploads keep their previous behavior.

## Compliance Preconditions

- Uploaded files remain in the existing server-side image worker flow; POS does
  not store a second image copy or add a database migration.
- The worker validates saved references and pending file keys, applies the final
  order atomically, and removes only images omitted by the saved intent.
- Existing permissions, image type/size validation, and storefront readiness
  checks remain enforced.

## Verification Evidence

- Focused POS helper, Edit Item save-contract, and carousel tests pass.
- Focused API gallery use-case and worker suites pass, including atomic
  reorder/remove/Primary behavior and stale-edit rejection.
- The POS production build passes and changed API/frontend files lint cleanly.
- Architecture, compliance, documentation, and diff checks pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or
production operation.
