---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-pos-voucher-nav-and-form-polish
classification: major
surfaces: pos,terminal
reason_codes_impacted: none (no reason code added or changed)
policy_version: 2026.08.20
verification_evidence: npm run build:pos,GITHUB_BASE_REF=develop npm run check:compliance,npm run check:architecture,npm run check:adr,npx vitest run src/features/pos/__tests__/terminalViewModeContracts.test.js
rollback_note: Revert all changed files. No migration, no schema change. Reverting restores the prior UI exactly -- Vouchers and Pricelists back inside the Settings tab strip, the stackable-with-statutory checkbox visible again (its stored value round-trips unchanged either way, since nothing reads it), no draft/active pricelist distinction in the empty-state copy.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: PR-762-POS-VOUCHER-NAV-AND-FORM-POLISH
---

# POS Voucher Nav and Form Polish

## Compliance Impact Classification

Major, per `apps/dgfy-web/src/features/pos/`'s floor (`scripts/check-compliance-impact.js:145-149`,
`surfaces: pos,terminal`). All six changed files are UI-only surface changes to the voucher/pricelist
authoring pages -- no reason code, no permission model, no data write behavior changes; the
classification is triggered by path alone, matching the established cadence on this exact surface
(#720, #698, #614 all declared for the same reason).

## Affected Surfaces

Four related changes to the POS voucher/pricelist authoring UI (#732, #733, #734, #736), plus five
review-driven fixes on the same surface:

- **Vouchers and Pricelists promoted to top-level nav**, out of the Settings tab strip, mirroring
  `settings_affiliates`'s own earlier promotion: new view modes (`settings_vouchers`/
  `settings_pricelists`), new sidebar `NavButton`s, new `MODE_META`/switch entries. Visibility gates
  on a new `canViewVouchers` permission check (`vouchers:view`/`manage` OR the legacy
  `settings:view`/`edit` pair), mirroring what `routes/pricelists.js` enforces server-side.
  Positioned between Settings and Affiliates in the sidebar, per #732's own decision record
  (corrected from an initial ship that placed them after Affiliates -- review finding RF-4).
- **PIN-wall exclusion (review finding RF-2).** The two new modes are members of
  `SETTINGS_VIEW_MODES` (for `SHIFT_EXEMPT`/PIN-protection parity with every other settings-adjacent
  mode) but are explicitly excluded from `PIN_PROTECTED_VIEW_MODES` -- without this, a
  `vouchers:view`-only user (no `settings:view`) would see the nav button, click it, and hit a PIN
  prompt with no way through if no POS access PIN is configured, directly undermining the
  promotion's own stated goal.
- **Cashier exclusion (review finding RF-8).** Both new nav buttons are also gated on
  `!isCashierRole`, matching the Affiliates button beside them -- `CASHIER_ALLOWED_VIEW_MODES`
  excludes both new modes, so without this a cashier holding a custom `settings:view` grant would
  see a button guaranteed to reject on click.
- **Required-field markers and honest help text on the voucher form**, sourced from
  `voucherValidator.js`'s actual required fields -- Code, Title, Benefit type, and (review finding
  RF-5) the three benefit-value fields (`Percent off`, `Amount off`, `Fixed price`) that block
  submission but originally carried no indicator, plus a legend line.
- **Empty-pricelist state now navigates to Pricelists** instead of naming a dead-end "tab", and
  (review finding RF-6) distinguishes "no pricelists at all" from "you have a draft pricelist,
  publish it" -- a second, minimal probe (`status: 'draft', limit: 1`) fires only when the active
  list comes back empty.
- **Removed the inert "Stackable with statutory discounts" checkbox** -- stored, never read by any
  policy code, and would contradict ADR 0066 Decision 8 if actually wired up. The real policy
  question is deferred to #605. Form state/mapper/submit payload are untouched, so an existing
  voucher's stored value round-trips unchanged.
- **Housekeeping (review findings RF-3, RF-7):** the two new modes' `sectionId` anchors were missing
  from `TERMINAL_SECTION_IDS` and the `renderWorkspace` dependency array; a whole-file negative
  test assertion was narrowed to the exact removed construct.

## Compliance Preconditions

- **No schema change, no migration, no API contract change.** `canViewVouchers` reads permissions
  the client already resolves (`hasPermission`); the draft-pricelist probe calls the pre-existing
  `listPricelists` endpoint with a different `status` filter.
- **No behavior change to the write path.** `canManageVouchers` (the gate that actually permits
  create/edit/lifecycle actions) is untouched; this PR only changes navigation, visibility, and
  informational copy.
- **The stackable-toggle removal is deliberately non-destructive** -- an existing voucher's stored
  `stackable_with_statutory` value is read on edit (`:227`) and re-sent on submit (`:265`)
  unchanged; only the UI control that implied it did something is gone.

## Verification Evidence

- `npm run build:pos` -- real Vite build, succeeds.
- `terminalViewModeContracts.test.js` -- 55/57 passing. The 2 failures
  (`requires an open shift before POS sale actions are available`,
  `renders receipt item lines with unit price, quantity, and total columns`) are pre-existing,
  confirmed identical on a clean `origin/develop` checkout before this PR's changes, and unrelated
  to vouchers/pricelists nav (shift-gating and receipt rendering, respectively).
- `npm run check:architecture` -- OK, 49 modules / 491 files.
- `npm run check:adr` -- OK, 74 ADRs.
- `GITHUB_BASE_REF=develop npm run check:compliance` -- to be re-run after this declaration is
  added and pasted into the PR.

## Rollback Considerations

Revert all changed files. No migration, no schema change, no data written by this PR itself. An
existing voucher's `stackable_with_statutory` value is unaffected either way, since it round-trips
through the form regardless of whether the checkbox is present.
