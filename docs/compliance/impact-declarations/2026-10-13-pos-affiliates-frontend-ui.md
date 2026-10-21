---
status: reference
owner: engineering
last_reviewed: 2026-10-16
declaration_id: 2026-10-13-pos-affiliates-frontend-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.12
verification_evidence: affiliate_behavior_tests,affiliate_service_contract_test,affiliate_targeted_lint,pos_lint,pos_build,docs_lint,adr_lint,git_diff_check
rollback_note: Revert the scoped POS Affiliates presentation modules and documentation; no backend, database, migration, or API contract changes are included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-13T16:10:00+08:00
preflight_request_ref: POS-AFFILIATES-UI-2026-10-13
---

# POS Affiliates Frontend UI Compliance Impact

## Compliance Impact Classification

Major by the repository's path-based POS/terminal classification floor. The substantive change is
frontend-only: it reorganizes the POS Affiliates page into list, cashout, and settings views,
adds local presentation controls, and aligns the page with POS Items spacing, typography, colors,
table surfaces, and pagination. It does not add or change API calls, database fields, migrations,
compliance decisions, or authorization behavior.

## Affected Surfaces

1. `packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx` — the existing
   affiliate page orchestrator and service-backed handlers.
2. `packages/web-core/src/features/pos/affiliates/` — affiliate-only list, cashout, settings,
   invite, stat, filter, pagination, action, and price-preview presentation modules.
3. Shared POS primitives used by the page: `Components/ui/pagination.jsx`,
   `PosFilterDialogShell.jsx`, `PosMobileDataCard.jsx`, `PosReportsKpiCards.jsx`,
   `TerminalOperationsWorkspace.jsx`, and `TerminalPageLayout.jsx`. Their new behavior is
   opt-in; existing callers retain their defaults.
4. `apps/dgfy-pos/tests/e2e/affiliates.authenticated.spec.js` — read-only authenticated browser
   smoke coverage for the rendered Affiliate surfaces.
5. `docs/features/pos-affiliates-ui.md` — the frontend feature inventory and data-semantic record.

## Compliance Preconditions

1. Existing affiliate service payloads, permission gates, monetary units, commission units, status
   actions, cashout actions, and revocation audit fields remain unchanged.
2. Search, status filters, pagination, reset controls, and CSV export are local presentation state.
   CSV export only serializes records already loaded in memory and does not create a backend write.
3. Affiliate sales display `—` when the existing response does not contain a sales total; the UI
   does not fabricate sales or change the API to obtain one.
4. The implementation remains confined to POS frontend code and documentation. No API, database,
   migration, Android, or unrelated page file is included.

## Verification Evidence

The Affiliate behavior suite, service reactivation contract test, targeted ESLint, POS lint, POS
production build, and `git diff --check` are the required executable evidence for this scoped
frontend change. Documentation and ADR lint should be recorded here only after they are run on the
final working tree. The authenticated browser smoke test is intentionally read-only and must not
submit invitations, rates, price rules, or cashouts.

### Atomic batch audit trail

- The page entry point keeps its existing import path and service handler boundary.
- New list, cashout, settings, invite, filter, stats, price-preview, and presentation helpers are
  isolated under the affiliate-only feature folder.
- Shared POS primitives are modified only through backward-compatible opt-in props/classes used by
  Affiliates; unrelated callers keep their existing defaults.
- The first shared-primitive batch is presentation-only: it adds opt-in sizing, spacing, pagination,
  filter-shell, mobile-card, and KPI layout hooks without changing service payloads or behavior.
- The Affiliate workspace batch keeps service-backed handlers at the existing page boundary while
  splitting list, cashout, settings, invite, filter, status, and presentation concerns into
  frontend-only modules.
- The route-registration batch wires the existing Affiliate workspace into the terminal shell while
  preserving the shared layout defaults and all non-Affiliate workspace routes.
- The test batch adds Affiliate behavior, spacing/search contracts, and reactivation service
  coverage only; it does not alter runtime services, API contracts, or backend test suites.
- The follow-up tab-transition batch keeps the existing tab IDs, permission gating, and rendered
  list/cashout/settings workflows unchanged while adding presentation-only directional animation.
- The reactivation service uses the existing dedicated endpoint from `origin/develop`; no fallback
  PATCH path or new API contract is introduced.
- No backend, migration, database, or Android change is included.
