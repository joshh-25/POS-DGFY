---
status: reference
owner: engineering
last_reviewed: 2026-08-14
declaration_id: 2026-08-14-pos-items-gallery-csv-import
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.14
verification_evidence: focused POS gallery/import and auto-upload contracts,CSV transport and gallery upload-limit tests,optimized-source cleanup test,POS production build,architecture guardrails,controller boundary check,unauthenticated browser smoke,git diff whitespace check
rollback_note: Revert the POS Items gallery controls, CSV import entry-point wiring, catalog invalidation publication, tests, documentation, and this declaration together; no database migration or persisted payment/fiscal contract is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-14T13:00:00+08:00
preflight_request_ref: PHASE-93
---

# POS Items Gallery and IMS CSV Import

## Compliance Impact Classification

Major because the changed files are within the governed POS and terminal
surfaces. The change adds item-image management and reuses the existing IMS
CSV import workflow; it does not alter compliance lifecycle state, tax
calculation, fiscal classification, payment authorization, or transaction
completion rules.

## Affected Surfaces

1. POS Items create/edit screens for the shared Storefront item image gallery.
2. POS Items bulk import entry point using the existing `items:import`
   permission and `/items/import/*` contracts.
3. Tenant-scoped POS catalog refresh events after successful item imports.

## Compliance Preconditions

1. Image upload and gallery mutation continue to use authenticated,
   tenant-scoped Storefront catalog endpoints and the `items:edit` permission.
   The POS accepts large source files, while the backend enforces a bounded
   100 MB source limit, validates the image, queues interactive uploads for
   background optimization, generates optimized delivery variants, and
   removes the newly uploaded source after variant generation. Existing
   retained originals are not modified. The POS and iMin WebView use the same
   API; the local preview is temporary and is not a catalog or payment record.
2. CSV import remains governed by the existing workflow-mode templates,
   normalized SKU upsert rules, row validation, and `items:import` permission.
3. CSV import does not accept image binaries or bypass item validation; images
   remain a separate gallery operation.
4. The `pos.catalog.changed` event carries only tenant scope, a reason, and
   created/updated item IDs. It triggers catalog refresh and does not authorize
   checkout, change prices, or alter payment/fiscal outcomes.
5. Failed-only imports do not publish a catalog invalidation.
6. This declaration covers local implementation and validation only; it does
   not authorize deployment or promotion to `main`.

## Verification Evidence

1. POS gallery/import frontend contracts passed: 6 tests.
2. CSV transport and gallery upload tests passed: 35 tests, including the
   tenant-scoped catalog invalidation publication and the 100 MB gallery
   transport policy.
3. POS production build passed with Vite.
4. Architecture guardrails checked 47 modules and 467 code files; controller
   boundary checks passed for 86 controller files.
5. Browser smoke reached the POS login screen with no page errors, failed
   requests, or 5xx responses; the only console error was the expected
   unauthenticated 401 from `/api/v1/pos/device/status`.
6. `git diff --check` passed.
7. The asynchronous image-upload status store and worker enqueue contracts
   passed focused backend tests; the POS editor and image-poll contracts passed
   focused frontend tests. The background queue does not alter payment, tax,
   fiscal, or transaction-completion state.
