---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-settings-lead-time-preview-undef-fix
classification: major
surfaces: settings
reason_codes_impacted: NONE
policy_version: 2026.09.01
verification_evidence: npm --prefix apps/dgfy-ims run lint -- confirmed the 8 no-undef errors on apps/dgfy-ims/Pages/Settings.jsx are gone (0 errors, pre-existing warnings only),npm run gate:release:local -- frontend.ims.lint gate flipped FAIL -> PASS with this fix and no other Settings.jsx change,node --check not applicable (JSX file; covered by the eslint run above which parses and type-checks references)
rollback_note: Pure bugfix, zero behavior change to any working code path. `leadTimeMinRaw`/`leadTimeMaxRaw` were undefined identifiers (no such variable, const, or prop existed anywhere in this file) in the buyer-preview paragraph under the fulfillment lead-time fields; every reference is replaced with the existing `locationForm.fulfillment_lead_time_min_days`/`locationForm.fulfillment_lead_time_max_days` values already read two JSX blocks above for the same fields' `<Input>` elements. Rollback is a plain revert; the prior code did not run at all (a ReferenceError would throw the moment this JSX branch rendered), so reverting restores the same broken state, not a working one.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T06:21:53.400Z
preflight_request_ref: PREFLIGHT-33476890356-2026-09-01-SETTINGS-LEAD-TIME-PREVIEW-UNDEF-FIX
---

# Fix undefined `leadTimeMinRaw`/`leadTimeMaxRaw` references in Settings.jsx buyer-preview text

## Compliance Impact Classification

Major. The floor is mechanical: `apps/dgfy-ims/Pages/Settings.jsx` matches
`COMPLIANCE_SENSITIVE_RULES`'s dedicated rule
(`/^apps\/dgfy-ims\/Pages\/Settings\.jsx$/`, `minimumClassification: 'major'`) regardless of how
small the actual change is.

Does not reach `regulatory`: no file under `packages/web-core/src/features/compliance/`,
`services/complianceService.js`, `services/adminService.js`, or
`apps/dgfy-api/src/modules/compliance/` is touched. No backend file is touched at all.

`reason_codes_impacted: NONE` is deliberate -- this is a frontend-only display bugfix, no new
backend validation path or `DomainErrorCode` entry.

## What this change does

Found while running `npm run gate:release:local` during the 2026-09-01 `develop -> staging ->
main` promotion: `frontend.ims.lint` failed with 8 real `no-undef` ESLint errors, all in the same
JSX block (Settings.jsx ~L3131-3135) -- a "buyer preview" paragraph under a location's fulfillment
lead-time min/max day inputs, referencing `leadTimeMinRaw`/`leadTimeMaxRaw`. Neither identifier is
declared anywhere in the file (confirmed by search); the two sibling `<Input>` elements immediately
above the broken block already read the same values from
`locationForm.fulfillment_lead_time_min_days`/`locationForm.fulfillment_lead_time_max_days`. This
is a copy/rename mistake from whichever commit introduced the buyer-preview paragraph (per its own
comment, tied to #1218) -- the preview line was never reachable without throwing a
`ReferenceError`, so this fix makes previously-broken code correct rather than changing any
observed behavior.

Fix: every `leadTimeMinRaw`/`leadTimeMaxRaw` reference in the buyer-preview block is replaced with
`locationForm.fulfillment_lead_time_min_days`/`locationForm.fulfillment_lead_time_max_days`. No
other line in the file changed.

## Affected Surfaces

1. `apps/dgfy-ims/Pages/Settings.jsx` (**modified**, 5 lines) -- the buyer-preview paragraph's
   4 undefined-identifier references, replaced with the existing form-state values already used by
   the two `<Input>` elements immediately above it.

## Compliance Preconditions

1. **No new data surface, no write-path change.** The buyer-preview text is a derived, read-only
   display of values already present in `locationForm` state and already round-tripped through the
   existing save/load path for a location's fulfillment settings -- untouched by this fix.
2. **No schema/migration change** -- confirmed, no file under `apps/dgfy-api/` or
   `apps/dgfy-migration-runner/migrations/` is touched.

## Verification Evidence

See the `verification_evidence` frontmatter key. Summary: `npm --prefix apps/dgfy-ims run lint`
before this fix reproduced the exact 8 `no-undef` errors reported by the promotion's
`gate:release:local` run; after this fix the same command reports 0 errors (pre-existing warnings
unrelated to this file's fulfillment-lead-time block remain, unchanged). Not independently
unit-tested -- this file has no existing test coverage for this specific JSX branch and adding one
is out of scope for a promotion-blocking lint fix; flagged as a residual risk below.

## Residual Risks

1. **No dedicated test exists for the buyer-preview paragraph**, before or after this fix -- the
   `no-undef` lint error is what caught the bug, not a test. A future pass could add a render test
   asserting the preview string for a representative min/max pair.
2. **No live acceptance walk was run in this environment** -- same standing limitation as every
   other declaration filed during this promotion; no deployed tenant database reachable here.

## Preflight Reconciliation

`POST /api/v1/compliance/preflight` has not been executed against a live environment. Per
`docs/compliance/request-time-preflight-protocol.md`'s "Where live preflight actually runs" and the
pr-reviewer/AGENTS.md rule confirmed at #884: this is expected, not a review finding, on a PR
targeting `develop`. The continuous `compliance-preflight-sweep.yml` (#1163/#1248) reconciles this
after merge.
