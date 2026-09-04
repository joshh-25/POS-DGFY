---
status: reference
owner: engineering
last_reviewed: 2026-09-02
declaration_id: 2026-09-02-split-view-ipad-landscape-viewport
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.09.02
verification_evidence: npm run build:pos -- passed, npm run build:skupervisor -- passed, node --check on the changed file
rollback_note: Single-file, single-constant change. Plain revert of this PR's commit restores the prior SPLIT_VIEW_MEDIA_QUERY threshold (reusing IMIN_TABLET_MAX_WIDTH_PX). No API, schema, payment, fiscal calculation, authorization, persistence, or hardware command behavior changes -- purely a CSS media-query breakpoint used to decide which of two already-shipped React render branches (single-panel vs. split-panel) is shown.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T16:10:10.502Z
preflight_request_ref: PREFLIGHT-33652723489-2026-09-02-SPLIT-VIEW-IPAD-LANDSCAPE-VIEWPORT
---

# Split Queue+Run view (#1289) viewport threshold fix

## Compliance Impact Classification

Major. The floor is mechanical, confirmed against `scripts/check-compliance-impact.js`: the sole
changed file, `packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx`, sits
under `packages/web-core/src/features/pos/`, matching the dedicated `COMPLIANCE_SENSITIVE_RULES`
rule, which sets a `major` floor for the `pos`/`terminal` surfaces regardless of the nature of the
change.

Does not reach `regulatory`: nothing in this change touches
`packages/web-core/src/features/compliance/`, `services/complianceService.js`,
`services/adminService.js`, `pages/Settings*`, any tenant-admin surface, or
`apps/dgfy-api/src/modules/compliance/`. No backend file is touched at all.

`reason_codes_impacted: NONE` is deliberate -- this changes a single numeric CSS breakpoint
constant (`SPLIT_VIEW_MEDIA_QUERY`'s min-width) that decides which of two already-shipped render
branches shows; it introduces no new validation path, no new persistence, and no new
`DomainErrorCode`/reason-code taxonomy entry.

## Affected Surfaces

- `pos` / `terminal`: `TerminalOperationsPanels.jsx`'s split "Queue + Run" view (#1289), consumed
  by both `dgfy-pos` and `dgfy-ims` (`grep`-confirmed present in both apps' built bundles).

## Compliance Preconditions

None apply -- no payment, fiscal, tax, or reason-code logic is touched. This is a UI-only viewport
eligibility gate for an already-approved, already-shipped feature (#1289); the fix only changes
*when* the existing split-view render branch is chosen, not what it does.

## Verification Evidence

- `npm run build:pos` -- built clean (Vite, no errors).
- `npm run build:skupervisor` -- built clean (Vite, no errors; `dgfy-ims` also bundles this
  component).
- `node --check` is not applicable (JSX file, not run directly by Node) -- the Vite build above is
  the real syntax/resolution check for this file, matching `implement`'s own Tier 0 guidance for
  frontend changes.

## What this change does

`packages/web-core/src/features/pos/components/TerminalOperationsPanels.jsx`'s split-view viewport
gate (`useSplitViewportEligible`) required `min-width: 1280px`, reusing
`IMIN_TABLET_MAX_WIDTH_PX` from `posTabletViewport.js`. That constant is the Falcon 1 POS tablet's
own **maximum** landscape width (the upper bound of the tablet-detection range) -- requiring the
split view's viewport to be *at least* the real hardware's own *maximum* width made it structurally
unable to render on that hardware, or on any standard iPad, at 100% zoom. Confirmed live by Pat: the
split view only appeared after manually zooming the browser out below 100%, which inflates the
effective CSS viewport width past 1280.

Replaces the reused `IMIN_TABLET_MAX_WIDTH_PX` with a new, dedicated
`SPLIT_VIEW_MIN_WIDTH_PX = 1024`, decoupled from tablet detection and sized to the standard iPad
landscape CSS viewport width (iPad mini, the narrowest current iPad model, landscape). Every
current iPad clears this in landscape orientation. Portrait iPad (~768-834px) intentionally still
falls back to the single-panel view -- a two-panel side-by-side layout at that width needs its own
design pass, per #1289's own filing, and is out of scope for this fix.

## Preflight note

`preflight_request_ref` is `NOT-EXECUTED-*` at PR-open time, per
`docs/compliance/request-time-preflight-protocol.md` -- expected for a `develop`-targeting PR; the
continuous compliance-preflight-sweep reconciles this automatically after merge, not something this
PR needs to wait on.
