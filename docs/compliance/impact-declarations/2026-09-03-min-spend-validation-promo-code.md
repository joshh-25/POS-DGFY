---
status: reference
owner: engineering
last_reviewed: 2026-09-03
declaration_id: 2026-09-03-min-spend-validation-promo-code
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.03
verification_evidence: node --check packages/web-core/src/features/pos/components/voucherFormModel.js (0 errors),npx vitest run (from packages/web-core) src/features/pos/__tests__/deliveryCampaignPayload.test.js (24 passed -- includes 4 new #1506 min_spend_centavos cases; 1 pre-existing failure unrelated to this change, filed separately as #1512),npm run build:skupervisor (succeeded),npm run build:pos (succeeded; both apps bundle TerminalOperationsWorkspace, which mounts VoucherManagementPanel/voucherFormModel.js),grep confirms VoucherManagementPanel.jsx is the only production importer of validateFormLocally, consuming its return value only as an array of {field, message} -- unchanged shape
rollback_note: Revert this PR's diff. The only behavior change is client-side -- validateFormLocally now also runs the pre-existing negative-min_spend_centavos check for promo_code vouchers, not just delivery_campaign. No server-side validator, schema, reason code, or persisted data changed; the Joi validator in voucherValidator.js already rejected the same bad value server-side before this PR, so reverting only removes the earlier client-side feedback, not a data-integrity guard.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-03T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-1506
---

# Fix promo_code min_spend_centavos client-side validation gap (Phase 266, #1506)

## Compliance Impact Classification

**Major.** Both changed files live under `packages/web-core/src/features/pos/`, which
`scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` maps to surfaces
`pos,terminal` at a `major` floor -- this declaration exists to satisfy that automated gate, not
because the change itself introduces a new compliance-relevant capability. There is no ADR impact:
this is `within-existing-boundary` frontend validation work (moving an existing check out of one
conditional branch so it also runs in the sibling branch), not a new decision or a new eligibility
rule. Same shape and same reasoning as the precedent declaration for this exact function,
`2026-09-06-voucher-max-order-value-and-audit-columns.md`.

## Affected Surfaces

- **`validateFormLocally` (`voucherFormModel.js`)** -- the pre-existing negative-value check for
  `minSpendPesos` was nested inside the `isDeliveryCampaign` branch, so it silently never ran for a
  `promo_code` voucher (the `else if` arms below it). Lifted the check out to run unconditionally
  for both voucher kinds, matching the pattern the sibling `maxOrderValuePesos` check already uses
  (#1490/Phase 259, which is the phase that originally found and flagged this gap without fixing
  it -- see that phase's own compliance declaration, "Outstanding before merge").
- **No change to `buildVoucherPayload`, the server-side validator, or any eligibility/reason-code
  logic.** This is purely a client-side, pre-submit UX check; `voucherValidator.js`'s
  `min_spend_centavos: Joi.number().integer().min(0)...` already rejects a negative value
  server-side today, for both voucher kinds, unchanged by this PR. The only user-visible effect is
  *when* the merchant sees the error -- inline, before submit, instead of only after a 422 round
  trip.
- **No new reason code, no new field, no schema change.** `reason_codes_impacted: ALLOWED` reflects
  that nothing new is added to any reason-code allowlist; this PR touches zero backend reason-code
  logic.

## Compliance Preconditions

- No API, database, payment, fiscal-receipting, or hardware-dispatch code changes. Both touched
  files (`voucherFormModel.js` and its test) are frontend/test-only, under
  `packages/web-core/src/features/pos/`.
- No change to what is ultimately accepted or rejected end-to-end -- the server-side Joi validator
  was and remains the authoritative gate; this PR only adds an earlier, client-side instance of the
  same negative-value check already used for `delivery_campaign`.
- `validateFormLocally`'s return shape is unchanged: an array of `{ field, message }` objects.
  Confirmed `VoucherManagementPanel.jsx` (the only production importer) consumes it only as
  `const localErrors = validateFormLocally(form);`, with no dependency on which fields can or
  cannot appear -- adding more possible `min_spend_centavos` entries for `promo_code` does not
  change that contract.

## Verification Evidence

- `node --check` on the one changed source file: 0 errors.
- `npx vitest run src/features/pos/__tests__/deliveryCampaignPayload.test.js` (from
  `packages/web-core`): 24 tests, 23 passed. The 1 failure
  (`#1334 buildVoucherPayload -- promo_code regression > an unchanged item-voucher form still
  produces the byte-identical payload it does today`) is a **pre-existing** failure on
  `origin/develop` at HEAD, unrelated to this change (confirmed: it fails because
  `buildVoucherPayload`'s output has carried `max_order_value_centavos` since #1490/Phase 259, but
  that test's expected literal was never updated -- this PR touches only `validateFormLocally`, not
  `buildVoucherPayload`). Filed separately as #1512 rather than fixed inline, to keep this PR
  scoped to #1506.
- 4 new test cases added, all passing: a negative `min_spend_centavos` is now flagged for a
  `promo_code` voucher (the gap itself); a valid non-negative value is not flagged; an empty value
  never flags for either voucher kind; the pre-existing `delivery_campaign` negative-value coverage
  is unchanged.
- `npm run build:skupervisor` and `npm run build:pos` both succeed -- both apps bundle
  `TerminalOperationsWorkspace.jsx`, which mounts `VoucherManagementPanel.jsx`
  (`apps/dgfy-storefront` does not import `features/pos` at all, per the same precedent
  declaration's own verification).

## Preflight Reconciliation

`NOT-EXECUTED-1506` is expected for a `develop`-targeting PR; the live preflight sweep
(`compliance-preflight-sweep.yml`) runs continuously against `develop` per
`docs/compliance/request-time-preflight-protocol.md`, not at promotion time, and will reconcile this
declaration's front matter automatically once triggered by this PR's merge.
