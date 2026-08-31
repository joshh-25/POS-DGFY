---
status: reference
owner: engineering
last_reviewed: 2026-08-31
declaration_id: 2026-08-31-pos-delivery-timing-settings
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.08.31
verification_evidence: npm run build:pos; npm run build:skupervisor; npm run build:store; npm run check:compliance observed failing before this declaration
rollback_note: No schema or API change -- the four tenant_locations timing columns and their validation already shipped under #1218. Reverting this PR only removes the POS-side editing UI and the IMS/POS shared validation-helper refactor; existing tenant data and IMS's own editing path are unaffected.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-31T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1246-POS-DELIVERY-TIMING-SETTINGS
---

# POS delivery-timing settings editing (#1246)

## Compliance Impact Classification

Major: `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` mechanically
maps to `pos`/`terminal` (compliance-sensitive POS surface), and `apps/dgfy-ims/Pages/Settings.jsx`
mechanically maps to `settings`. No payments, capture, refund, settlement, or fiscal-document logic
is touched by either file's change here.

## Affected Surfaces

POS's own Storefront settings tab (already a POS-owned duplicate of IMS's tenant-location form) gains
the four #1218 fulfillment-timing fields (`scheduling_enabled`, `immediate_fulfillment_enabled`,
`fulfillment_lead_time_min_days`, `fulfillment_lead_time_max_days`) as editable controls, gated by the
existing `canEditSettings` check (`settings:edit` permission / `is_master_admin`) already used
elsewhere in this same component (`PosCashierAttendanceSettingsCard`) and already the exact permission
the backend's `PUT /tenant-locations/:id` route enforces
(`checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)`). IMS's Settings.jsx is refactored to call
the same new shared, pure validation helper POS now also uses, in place of its own inline copy of the
identical rule -- no behavior change to IMS's own client-side validation.

## Compliance Preconditions

The API remains the sole enforcement point (`tenantLocationUseCases.js`'s
`assertFulfillmentLeadTimeValid`, already shipped under #1218) -- this change adds client-side UI and
client-side pre-submit validation only, on an already-validated, already-permission-gated write path.
No new API endpoint, no new database column, no change to `tenantLocationService.js`'s request shape.

## Verification Evidence

`npm run build:pos`, `npm run build:skupervisor`, and `npm run build:store` all pass (the four changed
files sit in `packages/web-core`, the shared trunk all three frontend apps consume, so all three were
rebuilt). `check:compliance` was observed failing for the two sensitive changed files
(`apps/dgfy-ims/Pages/Settings.jsx`, `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`)
before this declaration was added, confirming the guardrail is exercised as intended.

## Residual Risks

None beyond what #1218's own declaration already accepted for this data -- this PR adds no new write
path, only a second UI surface (POS) onto the same already-validated write path IMS already used.

## Preflight Reconciliation

`NOT-EXECUTED-*` is expected for a develop-targeting PR; the live preflight sweep runs continuously
against `develop` per the request-time preflight protocol, not at promotion time.
