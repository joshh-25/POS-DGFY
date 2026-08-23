---
status: reference
owner: engineering
last_reviewed: 2026-08-22
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-22-downpayment-settings-pos-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.22
verification_evidence: apps/dgfy-web/src/config/__tests__/permissionsFrontendParity.test.js (17 passed, was 15/17 red on develop before this PR),apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsForm.test.js (18 passed, new),apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsPanel.behavior.test.jsx (6 passed, new),full apps/dgfy-web src/features/pos/__tests__/ suite (533 passed, 3 pre-existing failures in receiptContractConformance.contract.test.js confirmed identical on clean origin/develop -- unrelated to this change, not a regression),npm run build:pos (real Vite build, succeeded),npm run lint on every new/changed file (0 problems)
rollback_note: Revert this PR's diff. No migration, no backend change, no new database column or table. The only cross-cutting edit is three small additions inside SettingsWorkspace in TerminalOperationsWorkspace.jsx (one import, one permission-derived tab-strip entry, one renderPane branch) -- reverting the diff removes the Payments tab entirely and every other Settings tab is untouched. The permissions_frontend.js DOWNPAYMENT group addition is also independently revertable with no functional effect beyond the admin permission-matrix UI's fallback losing that group again.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T12:00:00+08:00
preflight_request_ref: ISSUE-848-DOWNPAYMENT-SETTINGS-POS-UI
---

# Downpayment Settings UI in the POS App (Phase 143, #848)

## Compliance Impact Classification

Major. The classification floor comes from `apps/dgfy-web/src/features/pos/**`
(`check-compliance-impact.js`'s existing `pos, terminal`-surfaced, `major`-floor rule) -- this PR
adds a new tab and three panel/service/util files under that path. There is no backend change and
no payments-surface code touched; the `payments`-floor rules
(`apps/dgfy-api/src/modules/downpayment/**`, `apps/dgfy-api/src/routes/downpaymentSettings.js`) are
**not** tripped by this PR, since neither file is modified. This declaration only covers the
frontend `pos, terminal` surface.

## Affected Surfaces

1. `apps/dgfy-web/src/features/pos/components/DownpaymentSettingsPanel.jsx` (new) -- the settings
   form itself. Modelled on `AffiliatesWorkspacePanel.jsx`: own fetch/save, own two-tier permission
   gate (`downpayment:view` to see, `downpayment:settings` to save), client-side validation
   mirroring the backend's effective-row rules, a live split preview mirroring
   `downpaymentPolicy.js`'s exact rounding.
2. `apps/dgfy-web/src/features/pos/services/downpaymentSettingsService.js` (new) -- thin GET/PUT
   client for the already-shipped `apps/dgfy-api/src/routes/downpaymentSettings.js` endpoints
   (Phase 138, #820). No new endpoint, no changed contract.
3. `apps/dgfy-web/src/features/pos/utils/downpaymentSettingsForm.js` (new) -- pure functions only,
   no I/O: wire-unit <-> form-string mapping, client-side effective-row validation, and the split
   preview. Unit-tested standalone.
4. `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx` (modified) --
   **the only compliance-sensitive edit surface in this PR.** Three additions inside
   `SettingsWorkspace`: an import, a `canViewDownpayment` permission derivation feeding a
   conditional `SETTINGS_TABS` entry, and a `renderPane` branch. No existing tab, permission
   derivation, or save path is changed -- `hydrateSettingsWorkspace` and the shared `handleSave`
   used by Profile/POS Setup/Storefront/Employees are untouched, since the new panel self-fetches
   and self-saves independently.
5. `apps/dgfy-web/src/config/permissions_frontend.js` (modified) -- adds the `DOWNPAYMENT`
   permission group, mirroring `apps/dgfy-api/src/config/permissions.js` verbatim. This group was
   missing since Phase 138 (#820) added it backend-side; `permissionsFrontendParity.test.js` has
   been red on `develop` ever since (confirmed: "frontend is missing group DOWNPAYMENT", 2 failed /
   15 passed before this PR). This is a standalone pre-existing-defect fix, not new scope --
   correcting it here rather than filing a separate PR since the new tab is the first UI consumer
   of this exact permission group.

## Compliance Preconditions

1. **No backend change.** This PR reads and writes `GET`/`PUT /api/v1/downpayment/settings` exactly
   as shipped in Phase 138 (#820) and already declared compliance-sensitive there
   (`2026-08-21-downpayment-config-surface.md`). No route, validator, use case, repository, or
   model file under `apps/dgfy-api` is touched.
2. **`customer_choice` is never offered.** The mode selector in
   `DownpaymentSettingsPanel.jsx` only exposes `full_payment` / `downpayment_required` --
   `customer_choice` is schema-reserved and the backend 422s any write that resolves to it as the
   effective mode (`downpaymentSettingsUseCases.js`). The UI cannot cause a tenant to become
   bricked in that state.
3. **Client-side validation is additive, never a replacement.** `validateDownpaymentForm` in
   `downpaymentSettingsForm.js` mirrors the backend's effective-row rules (type required, matching
   amount field required, `min_downpayment_centavos > 0`) purely to give the merchant an inline
   error before a round-trip -- the server independently re-validates every write and is the sole
   source of truth. Verified in the panel's behavior test: a client-blocked save never calls
   `updateDownpaymentSettings`, and the PUT payload always carries the full six-field set (never a
   partial diff), matching the backend's own "deliberate fail-closed choice" on the effective
   (merged) row.
4. **Numeric inputs are clamped below the known INT-column ceiling.** The Joi validator on
   `downpaymentSettingsValidator.js` allows `downpayment_rate_bps`/`downpayment_fixed_centavos`/
   `min_downpayment_centavos` up to `999999999999`, but the migration's columns are
   `Sequelize.INTEGER` (MySQL `INT`, max `2147483647`). `MAX_SAFE_CENTAVOS` in
   `downpaymentSettingsForm.js` clamps both amount inputs client-side so this UI can never submit a
   value that would 500 at the database. Unit-tested.
5. **Permission gate matches the server's own two-tier split exactly.** `admin` /
   `is_master_admin` get both `downpayment:view` and `downpayment:settings`; `manager` gets
   view-only (Save disabled, amber explanatory note, matching the `Settings.jsx` convention of
   disabling rather than hiding); `staff`/`cashier` don't see the tab at all. Verified in the
   behavior test for all three tiers.
6. **No money moves through this surface.** This PR configures policy only -- no PayMongo call, no
   payment session, no order write originates from any file this PR touches.

## Verification Evidence

Two new unit-test files, 24 new passing tests total: `downpaymentSettingsForm.test.js` (18 tests --
unit mapping, all four effective-row validation rules, the INT clamp, and the split-preview math
checked directly against `downpaymentPolicy.unit.test.js`'s own backend cases for rounding, the min
floor, and clamp-to-total) and `downpaymentSettingsPanel.behavior.test.jsx` (6 tests -- view-gate
denial, load-and-hydrate, full_payment hides the amount fields, client-side save-block on an
incomplete row, a valid save's exact payload shape, and the manager view-only disabled state).
`permissionsFrontendParity.test.js` goes from 15/17 (red on `develop`) to 17/17. The full
`src/features/pos/__tests__/` suite: 533 passed, 3 pre-existing failures in
`receiptContractConformance.contract.test.js` confirmed identical on a clean `origin/develop`
checkout (stashed this PR's diff and re-ran) -- unrelated to receipts/fiscal printing, not a
regression from this change. `npm run build:pos` is a real Vite build and succeeded both before and
after the two `react/no-unescaped-entities` lint fixes. `npm run lint` (ESLint) on every new/changed
file: 0 problems.

Outstanding before merge:

- `POST /api/v1/compliance/preflight` has **not** been executed against a live environment -- same
  disclosure shape as prior downpayment-epic declarations. The front-matter preflight fields record
  this change's classification decision (a `pos`/`terminal`-surface UI addition reading/writing an
  already-shipped, already-declared API, `no_breach`/`ALLOWED`), and a reviewer with a live
  environment must run the endpoint and reconcile `preflight_run_at`/`preflight_request_ref` before
  merge.
- No live end-to-end verification against a deployed environment in this session -- unit/behavior
  coverage only. The local Docker stack (`do-not-commit/local-test/`) has tenant *Pat Marketing*
  already seeded `downpayment_required` from an earlier session and is the intended manual
  verification target before this PR is marked ready for review.
