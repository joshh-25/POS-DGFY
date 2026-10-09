---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-09
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-10-08-pos-shift-frontend-responsive-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.08
verification_evidence: "Cashier History UI 4 files/23 tests; cashier-history API 3 suites/8 tests; shift-summary printing 4 files/23 tests; POS production build; targeted web-core and API ESLint; git diff --check"
rollback_note: Revert the POS Shift commits and this declaration together; the cashier-history search query is read-only and adds no schema or Phase 2 work.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-08T17:01:31+08:00
preflight_request_ref: NOT-EXECUTED-LOCAL-POS-SHIFT-FRONTEND-2026-10-08
---

# POS Shift responsive frontend and Cashier History search

## Compliance Impact Classification

Major. Shared POS frontend paths have a `major` minimum for the `pos` and `terminal` surfaces.
This change updates Shift navigation and workspace presentation, adds a bounded search parameter
to the authenticated cashier-history read endpoint, and improves Cashier History filters,
responsive tables, shift-summary printing controls, and mobile double-tap behavior. It does not
change authorization, fiscal calculations, payment settlement, or persisted transaction/shift data.

## Affected Surfaces

- `pos` — Shift Session, Cash Drawer, Cashier History, branch monitoring, responsive navigation,
  summary printing, and shared POS controls.
- `terminal` — shift and branch-monitor presentation and mobile terminal gestures.

## Atomic Commit Scope

1. Shared POS dropdown, pagination, text-size, and tab controls plus their responsive contracts.
2. Shift workspace layout, branch-monitor loading, shift-state feedback, cash-drawer UI, and refresh
   behavior plus their tests.
3. Cashier History search, API query validation and scoped repository filtering, the Reports-style
   search/date toolbar, responsive history table, and API/frontend tests and documentation.
4. Shift summary print controls, paper-width selection, and the frontend iMin adapter.
5. Mobile page double-tap guard with map gestures preserved, plus responsive tests.

## Compliance Preconditions

1. Existing tenant, location, cashier, role, and permission checks remain authoritative; this work
   changes presentation and loading behavior without granting an operational capability.
2. Cashier History search is bounded to 120 characters and matches a shift number or terminal ID.
   It remains AND-scoped to the authenticated cashier, authorized location, date range, and status
   before pagination; it does not accept a caller-supplied cashier identity.
3. Browser summary paper width controls browser-print layout. The optional iMin frontend adapter
   uses the existing printer bridge with the configured paper width; no server-side device-bridge
   behavior is changed.
4. Page double-tap zoom is suppressed only in the requested POS views; pinch-to-zoom and MapLibre's
   map double-click/touch-zoom gestures remain enabled.
5. Phase 2, database/schema work, and unrelated server-side device-bridge changes are excluded.
   The only backend addition is the read-only cashier-history search query described above.
6. A live request-time preflight was not executed because Docker is unavailable in this local
   environment. The `NOT-EXECUTED-*` reference is an explicit local/develop-PR placeholder, not a
   recorded `no_breach` response; the continuous compliance sweep must reconcile it after the
   declaration reaches `develop`.

## Verification Evidence

- The broader POS Shift/admin-monitor/history suite passed before the added history search (27 files,
  157 tests). The final Cashier History UI/tab regression suite passed (4 files, 23 tests).
- Cashier-history API tests passed (3 Jest suites, 8 tests), covering query validation, cashier and
  location scoping, shift-number/terminal search, and pagination. Changed API source lint passed.
- Shift-summary UI and native iMin paper-width tests passed (4 files, 23 tests), including 57mm
  layout selection and the 32-character native output width.
- POS production build passed. Vite reported existing mixed static/dynamic import warnings; the
  build also reports the existing large vendor chunk.
- Targeted shared web-core lint passed with no findings; ESLint emitted a React-version detection
  warning because the package is not installed directly under `packages/web-core`.
- `git diff --check` and staged diff whitespace checks passed.
- The existing `terminalViewModeContracts.test.js` has five inherited checkout-source contract
  failures on the current base; those expectations target code already extracted before this
  branch and are outside the Shift frontend scope.
- The isolated MapLibre picker test could not collect because Vite could not resolve its worker URL
  import (`maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`); this is outside the Shift UI batch.
- No Phase 2, database/schema, or server-side device-bridge changes are included. The cashier-history
  search query is a read-only API contract extension, not a persisted-data or authorization change.
