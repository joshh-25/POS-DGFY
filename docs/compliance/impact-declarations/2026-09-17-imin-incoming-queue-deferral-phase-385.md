---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-17
related_adr: 0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-09-17-imin-incoming-queue-deferral-phase-385
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: focused shared iMin and queue contracts, POS unit suite, POS/IMS/Storefront builds, POS lint, documentation/architecture/compliance/whitespace checks, authenticated local POS smoke
rollback_note: Revert the Phase 385 queue lazy-loader, workspace-shell extraction, prefetch routing, focused contract, baseline note, ledger entry, and this declaration together. No API, schema, payment, fiscal, authorization, persistence, tenant, inventory, or hardware command rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-17T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-385-LOCAL-ONLY
---

# iMin incoming queue chunk deferral

## Compliance Impact Classification

Major because the changed files are shared POS/terminal interaction paths and
the repository applies the POS performance compliance floor there. The change
only moves the incoming-order queue and its delivery UI behind the existing
retryable lazy-loader; queue behavior, permissions, API calls, state ownership,
and native hardware contracts remain unchanged.

## Affected Surfaces

- POS operations-workspace loading for the incoming online order queue.
- POS Orders pointer, focus, and press intent prefetch.
- Browser POS retains the same queue module and behavior; only its load boundary
  changes.

## Compliance Preconditions

- `IncomingQueueWorkspace` is rendered with the same props and existing
  `TerminalOperationsPanels.jsx` named export remains available to current
  tests and direct callers.
- The shared `WorkspaceShell` markup and styling are unchanged after extraction.
- The queue chunk uses `lazyWithChunkRetry`, and explicit Orders intent warms it
  alongside the operations workspace so the first intentional navigation does
  not create an avoidable sequential fetch.
- No API, schema, tenant, session, catalog, inventory, payment, fiscal,
  authorization, or native bridge command contract changes.
- Physical iMin frame, WebView, memory, image, and bridge traces remain
  independent evidence under Phase 352.

## Verification Evidence

- Focused shared iMin performance contract passed: 1 file, 12 tests.
- Existing incoming-queue and delivery behavior contracts passed: 10 files,
  106 tests.
- POS unit suite passed: 10 files, 41 tests.
- POS production build passed: 3,776 modules transformed; the eager operations
  workspace output is approximately 365.81 KB minified / 80.25 KB gzip and
  `TerminalOperationsPanels` is emitted separately at approximately 124.11 KB
  minified / 27.29 KB gzip.
- IMS and Storefront production builds passed: 1,883 and 2,458 modules
  transformed.
- POS lint passed with the existing Business Admin max-lines warning only.
- Repository-wide documentation, architecture, compliance, whitespace, and
  authenticated POS smoke checks are recorded in the Phase 385 ledger entry.

## Preflight Reconciliation

Not executed on this local implementation session. The `NOT-EXECUTED-*`
reference remains until the normal promotion batch performs the live preflight;
no live compliance result is claimed by this declaration.
