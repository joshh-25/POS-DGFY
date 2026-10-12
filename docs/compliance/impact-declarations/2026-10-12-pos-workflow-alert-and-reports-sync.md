---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-12
declaration_id: 2026-10-12-pos-workflow-alert-and-reports-sync
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.07
verification_evidence: focused POS Vitest suites (43 tests), POS production build, POS API repository/use-case tests (55 tests), Android bridge unit test and dev release APK build, local migration status,git diff --check,repository compliance gate
rollback_note: Revert the POS report-source and order-method presentation changes, incoming-order alert/audio controls, Android playback controller, and this declaration together; existing authorization, payment, transaction, and tenant-data boundaries remain authoritative.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-12T18:05:00+08:00
preflight_request_ref: NOT-EXECUTED-2026-10-12-POS-WORKFLOW-ALERT-REPORTS-SYNC
---

# POS workflow alerts, report breakdowns, and develop synchronization

## Compliance Impact Classification

Major because the changed API report module and shared POS frontend paths are classified at the
major floor for the `pos` and `terminal` surfaces. The changes make existing sales-source,
order-method, payment, and transaction-status information clearer in reports and exports, and
add configurable local incoming-order alert playback. They do not add a public route, change
authorization, or move financial authority from the existing server-side transaction/report
contracts.

## Affected Surfaces

- `pos` — daily/shift/Z-reading report breakdowns, sales-source and order-method labels, incoming
  order popup/audio settings, imported local alert sounds, and POS terminal presentation.
- `terminal` — local incoming-order alert lifecycle, browser/iMin playback, and report summary
  views used by the active terminal.

## Compliance Preconditions

1. Existing tenant, location, cashier capability, active-shift, and POS permission checks remain
   the source of truth for order queues, report queries, and report exports.
2. Report changes are read/aggregation/presentation changes; they do not create, settle, void,
   refund, or otherwise mutate transactions, payments, shifts, or Z-readings.
3. Incoming-order sounds and imported audio are terminal-local assets/settings. Audio playback and
   popup dismissal do not authorize, accept, hide, or mutate an order; existing order actions
   remain the authoritative workflow.
4. Audio files are constrained by the existing import/encoding path and are not uploaded as
   tenant or customer data. The Android controller fails closed on playback errors and stops on
   the existing alert lifecycle events.
5. The local database migration run applied only the six pending develop migrations to the local
   landlord database; no production or tenant database migration is claimed by this declaration.
6. The preflight values are PR-stage placeholders for the continuous compliance sweep; no live
   production qualification is claimed.

## Verification Evidence

- Focused POS Vitest coverage passed: 5 files, 43 tests, including report printing, report
  breakdowns, terminal controls, receipt flow, and order-alert sound behavior.
- POS API repository and use-case tests passed: 2 suites, 55 tests.
- `npm run build` in `apps/dgfy-pos` passed; only existing Vite chunk-placement warnings were
  emitted.
- Android `:app:testDevDebugUnitTest` and `:app:assembleDevRelease` passed.
- The local migration runner applied the six pending develop migrations and a follow-up status
  check reported no pending migrations.
- `git diff --check` passed after conflict resolution and before commit.
