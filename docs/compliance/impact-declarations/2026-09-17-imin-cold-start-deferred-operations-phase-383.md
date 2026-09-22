---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-17
related_adr: 0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-09-17-imin-cold-start-deferred-operations-phase-383
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: focused and complete shared POS/iMin contracts, POS unit tests, POS lint/build, documentation/architecture/compliance checks, git diff check
rollback_note: Revert the Phase 383 prefetch routing, optional lazy imports, modal mount guards, focused contracts, ADR amendment, baseline note, ledger entry, and this declaration together. No API, schema, payment, fiscal, authorization, persistence, tenant, inventory, or hardware command rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-383-LOCAL-ONLY
---

# iMin cold-start and deferred operations loading

## Compliance Impact Classification

Major because the changed files are shared POS/terminal interaction paths and
the repository applies the POS performance compliance floor there. The change
is limited to bundle scheduling and lazy component mounting; it preserves
existing business, permission, session, terminal, and hardware command
contracts.

## Affected Surfaces

- iMin WebView unlocked-session idle prefetch and view-intent prefetch.
- POS operations, Audit, settings, reports, service, import, QR, invitation,
  image, and staff-management panel loading.
- Browser POS retains its existing operations warm-up behavior and all
  surfaces retain the same view routing and component props.

## Compliance Preconditions

- Checkout remains the only iMin idle warm-up; operations work is requested by
  the selected view or explicit user intent and uses `lazyWithChunkRetry`.
- Lazy loading does not alter component props, permission gates, data owners,
  request parameters, mutation handlers, payment/receipt behavior, or native
  bridge calls.
- Modal-only components are not mounted while closed; opening them retains the
  existing dismissal, focus, and scroll behavior through the same component.
- The physical iMin device trace is not replaced by browser build evidence and
  remains an independent release gate under Phase 352.

## Verification Evidence

- Focused shared iMin/catalog contracts passed: 4 files, 29 tests; the complete
  shared IMS suite passed: 369 files, 2,405 tests.
- POS targeted unit contracts passed: 2 files, 13 tests.
- The complete POS unit suite passed: 9 files, 39 tests.
- POS lint passed with repository-existing warnings only; the changed source
  produced no lint errors.
- POS production build passed: 3,774 modules transformed. The operations
  workspace output is approximately 560.28 KB / 127.72 KB gzip, with optional
  reports, services, settings, import, QR, image, and staff panels emitted as
  separate chunks.
- Authenticated POS smoke passed with no runtime crashes; the terminal shell
  smoke passed at desktop, tablet, and mobile sizes with no console or HTTP
  errors. Its separate legacy sales-handoff assertion still ends at the local
  POS session-expired URL instead of the expected SKUpervisor handoff; that
  route is outside Phase 383 and was not changed.
- Documentation, architecture, compliance, and whitespace checks passed; no
  production deployment, merge, push, or live data mutation was performed.

## Preflight Reconciliation

Not executed on this local implementation session. The `NOT-EXECUTED-*`
reference remains until the normal promotion batch performs the live preflight;
no live compliance result is claimed by this declaration.
