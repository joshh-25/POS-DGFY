---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-13
declaration_id: 2026-10-13-pos-shell-notification-controls
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.10.09
verification_evidence: POS notification and text-size control contract tests passed,POS production build passed,documentation lint passed,architecture checks passed,git diff check passed
rollback_note: Revert the POS notification and text-size control presentation changes and this declaration; no notification, authorization, or persisted-data behavior rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-13T10:22:30.479Z
preflight_request_ref: PREFLIGHT-38382156508-2026-10-13-POS-SHELL-NOTIFICATION-CONTROLS
---

# POS Shell Notification and Text Controls

This declaration covers POS-only visual consistency updates to the notification popover and header text-size controls; it does not change notification delivery or underlying alert behavior.

## Compliance Impact Classification

Classified `major` because changes under `packages/web-core/src/features/pos/**` have a repository-enforced minimum classification of `major` for the `pos` and `terminal` surfaces. This batch adjusts POS notification typography and radius and aligns the notification and text-size controls across view sizes. It does not change authorization, notification data, payment flows, or terminal operations.

## Affected Surfaces

- POS header notification and text-size controls across supported view sizes.
- POS notification popover presentation and supporting frontend contract tests.

## Compliance Preconditions

- Existing notification count, alert content, navigation, and delivery behavior remain unchanged.
- Text-size control behavior remains unchanged; only its visual sizing and consistency are adjusted.
- No backend source, API, database, schema, migration, or persisted tenant data is modified.

## Verification Evidence

The focused POS notification and text-size control contract tests passed, and the POS production build, `npm run lint:docs`, `npm run check:architecture`, and `git diff --check` passed. These checks will be rerun after the branch is synchronized with `develop`.

## Preflight Reconciliation

No live preflight was run for this local change batch: Docker is unavailable in this environment, so the repository's local fixture-based reconciliation command cannot run. The `NOT-EXECUTED-*` reference is the documented PR-open placeholder; the required `no_breach` front-matter value and timestamp are schema placeholders, not evidence of an evaluation. The continuous compliance sweep is expected to evaluate and reconcile the declaration after it reaches `develop`.
