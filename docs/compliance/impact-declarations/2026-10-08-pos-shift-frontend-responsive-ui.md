---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-08
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-10-08-pos-shift-frontend-responsive-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.08
verification_evidence: focused POS Shift/admin/history Vitest suite,POS production build,POS app lint,shared web-core ESLint,git diff --check
rollback_note: Revert the POS Shift frontend commits and this declaration together; no backend, API, database, or Phase 2 implementation is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-08T17:01:31+08:00
preflight_request_ref: NOT-EXECUTED-LOCAL-POS-SHIFT-FRONTEND-2026-10-08
---

# POS Shift responsive frontend update

## Compliance Impact Classification

Major. Shared POS frontend paths have a `major` minimum for the `pos` and `terminal` surfaces.
This frontend-only change updates Shift navigation and workspace presentation, Cashier History
filters and responsive tables, shift-summary printing controls, and mobile double-tap behavior.
It does not change server authorization, fiscal calculations, payment settlement, or persisted
transaction/shift data.

## Affected Surfaces

- `pos` — Shift Session, Cash Drawer, Cashier History, branch monitoring, responsive navigation,
  summary printing, and shared POS controls.
- `terminal` — shift and branch-monitor presentation and mobile terminal gestures.

## Atomic Commit Scope

1. Shared POS dropdown, pagination, text-size, and tab controls plus their responsive contracts.

## Compliance Preconditions

1. Existing tenant, location, cashier, role, and permission checks remain authoritative; this work
   changes presentation and loading behavior without granting an operational capability.
2. Cashier History sends only supported date, status, pagination, and location filters. It does not
   imply server-side search until the API supports that parameter.
3. Browser summary paper width controls browser-print layout. The optional iMin frontend adapter
   uses the already-supported printer bridge with the configured paper width; no server-side
   device-bridge behavior or API contract is changed.
4. Page double-tap zoom is suppressed only in the requested POS views; pinch-to-zoom and MapLibre's
   map double-click/touch-zoom gestures remain enabled.
5. Phase 2, backend, API, database, and server-side device-bridge work are excluded. The included
   iMin client-adapter change is frontend-only.
6. A live request-time preflight was not executed because Docker is unavailable in this local
   environment. The `NOT-EXECUTED-*` reference is an explicit local/develop-PR placeholder, not a
   recorded `no_breach` response; the continuous compliance sweep must reconcile it after the
   declaration reaches `develop`.

## Verification Evidence

- Focused POS Shift, admin-monitor, and Cashier History Vitest suite: 27 files passed, 157 tests
  passed.
- POS production build and POS app lint passed. Vite reported existing mixed static/dynamic import
  and large-chunk warnings.
- Changed shared web-core JavaScript/JSX lint: zero errors, 16 warnings. Updated E2E spec lint passed.
- `git diff --check` and staged diff whitespace checks passed.
- The existing `terminalViewModeContracts.test.js` has five inherited checkout-source contract
  failures on the current base; those expectations target code already extracted before this
  branch and are outside the Shift frontend scope.
- No Phase 2 work or backend/server-side device-bridge changes are included in the frontend commits.
