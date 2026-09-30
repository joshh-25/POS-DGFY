---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-09-30
declaration_id: 2026-09-29-pos-items-frontend-change-batch
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.09.25
verification_evidence: focused POS Items suite (25 files, 144 tests passed), POS/IMS/Storefront production builds passed, app-version check passed against develop, git diff --check passed
rollback_note: Revert the POS Items frontend commits and this declaration together. No backend, API, database, or migration rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T19:27:51+08:00
preflight_request_ref: NOT-EXECUTED-POS-ITEMS-FRONTEND-2026-09-29
---

# POS Items Frontend Change Batch

## Compliance Impact Classification

Major, following the repository's minimum classification for the `pos` and `terminal` surfaces. This declaration covers frontend-only changes in the POS Items/catalog workspace: responsive layout, item/category/option presentation and actions, image handling, import dialogs, pagination, filter behavior, and location-aware catalog loading. It does not alter fiscal calculations, payment authorization, tax, or backend compliance decisions.

## Affected Surfaces

- POS Items catalog and item/category/option workflows across desktop, tablet, and mobile layouts.
- Shared frontend components used by POS Items. Their new presentation options are opt-in so other consumers retain their existing defaults.
- POS catalog read states when the active location context is unavailable; the frontend does not fall back to an unscoped inventory request.

## Compliance Preconditions

- Existing authorization and server-side location scoping remain the authority; the frontend does not broaden access or bypass a denied response.
- Existing item persistence, stock, price, tax, checkout, payment, and audit behavior remain unchanged.
- No backend source, API contract, database schema, migration, seed, or persistent-data change is included.
- No live request-time compliance preflight was run for this local change batch. The `NOT-EXECUTED-*` reference is a placeholder, not evidence of an evaluation; the declaration body records this explicitly for later reconciliation.

## Verification Evidence

- Focused POS Items suite passed after syncing with develop: 25 test files, 144 tests.
- POS, IMS, and Storefront production builds passed. The builds emitted existing chunk-size and mixed static/dynamic import warnings, but no build errors.
- App-version check passed against the ordinary `develop` branch mode; `dgfy-ims` and `dgfy-pos` version floors remain unchanged, and Storefront does not reach the changed modules.
- `git diff --check` passed for the staged Items-only changes.
- Browser layout verification could not be completed: the local preview requires terminal login credentials that were not available in this session.

## Residual Risk

- Desktop, tablet, and mobile visual behavior still needs a browser check after an authorized terminal login. The production builds and focused tests pass, but they do not replace that visual check.
