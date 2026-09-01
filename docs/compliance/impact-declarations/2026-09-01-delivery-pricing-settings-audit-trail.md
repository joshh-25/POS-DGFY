---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-delivery-pricing-settings-audit-trail
classification: major
surfaces: settings
reason_codes_impacted: none
policy_version: 2026.09.01
verification_evidence: node --check on every changed apps/dgfy-api .js file and the new migration,apps/dgfy-api/tests/workflowModeAuditLog.usecase.test.js (11 total: 5 pre-existing + 6 new covering the store_delivery_fee_mode/store_delivery_fee_calc gate, the no-op re-save guarantee, and the shared before-snapshot helper) -- all green,npm run check:architecture,npm run check:compliance PASS,pre-commit hook (check:architecture-guardrails/check:controller-boundaries/check:tenant-schema-registry-coverage) passed
rollback_note: Revert this commit. Additive-only -- the four new workflow_mode_change_log columns are nullable with no backfill, and the new migration's down() drops them cleanly if reverted. No existing settings-write behavior changes: the audit log write happens after the underlying setting write already succeeded, and a logging failure is caught and warned, never surfaced to the caller (unchanged from the existing ops_workflow_mode/capabilities behavior this extends).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T15:00:53.193Z
preflight_request_ref: PREFLIGHT-33522670635-2026-09-01-DELIVERY-PRICING-SETTINGS-AUDIT-TRAIL
---

# Delivery-pricing settings audit trail (#1327, Phase 234)

## Compliance Impact Classification

Major: every changed `apps/dgfy-api` file
(`workflowModeAuditLog.js`, `updateSettingByKeyUseCase.js`, `updateSettingsUseCase.js`) lives under
`apps/dgfy-api/src/modules/settings/**`, which the classification matrix floors at `major`/`settings`
mechanically. No payments, capture, refund, settlement, or fiscal-document logic is touched.

## Affected Surfaces

`settings` only. This extends the existing `workflow_mode_change_log` audit trail (issue #178 phase
5/16) — previously gated to `ops_workflow_mode`, `ops_enabled_capabilities`, and
`ops_disabled_capabilities` — to also cover `store_delivery_fee_mode` and `store_delivery_fee_calc`
(issue #233's keys; referenced here as literals since #233 doesn't centralize them in a shared
constants module, matching this file's existing `WORKFLOW_MODE_SETTING_KEY` duplication pattern). Both
the single-key (`PATCH /settings/:key`) and bulk (`PATCH /settings`) settings-write use cases are
updated so either write path produces an audit row.

## Compliance Preconditions

No new write path and no new endpoint: this only adds an audit *record* of writes that were already
possible and already permission-gated exactly as before (settings write authorization is unchanged).
The audit write itself is best-effort and diagnostic, not authoritative — a logging failure is caught
and logged via `logger.warn`, never rolls back or masks the underlying settings write, unchanged from
the existing `ops_workflow_mode`/capabilities behavior this change extends. The new
`workflow_mode_change_log` columns are nullable with no backfill, so existing rows correctly read as
"no delivery-fee change recorded" rather than an inferred value.

## Verification Evidence

`node --check` passes on every changed/added `apps/dgfy-api` `.js` file and the new `.cjs` migration.
Six new cases were added to the existing `apps/dgfy-api/tests/workflowModeAuditLog.usecase.test.js`
suite, covering: a `store_delivery_fee_mode` change logging actor + from/to; a
`store_delivery_fee_calc` blob change logging even when the mode is untouched; a no-op re-save of
either key logging nothing (the ticket's own acceptance evidence); and the shared
`resolveWorkflowModeAuditBeforeValues`/`touchesWorkflowModeAuditedSetting` helper fetching all five
audited keys when one is touched, and skipping the DB round-trip entirely when none are. All 11
cases in the suite (5 pre-existing + 6 new) pass. `npm run check:architecture` and
`npm run check:compliance` both pass; the repo's own pre-commit hook (architecture guardrails,
controller boundaries, tenant-schema-registry coverage) passed on this change unmodified.

## Residual Risks

None beyond what issue #178's original `workflow_mode_change_log` declaration already accepted for
this table. `store_delivery_fee_mode`/`store_delivery_fee_calc` themselves don't exist yet in this
branch (issue #233 is a sibling PR, not yet merged) — this change references them as literal setting
keys per #1327's own instruction, so it is inert (the gate never fires) until #233 lands and those
keys actually get written.

## Preflight Reconciliation

`NOT-EXECUTED-*` is expected for a develop-targeting PR; the live preflight sweep runs continuously
against `develop` per the request-time preflight protocol, not at promotion time.
