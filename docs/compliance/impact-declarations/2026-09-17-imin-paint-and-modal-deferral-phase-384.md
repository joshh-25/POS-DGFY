---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-17
related_adr: 0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-09-17-imin-paint-and-modal-deferral-phase-384
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: focused shared contracts, POS unit suite, POS/IMS/Storefront builds, POS lint, local POS smoke, documentation/architecture/compliance/whitespace checks
rollback_note: Revert the Phase 384 lazy modal imports, iMin paint selectors, focused contracts, baseline note, ledger entry, and this declaration together. No API, schema, payment, fiscal, authorization, persistence, tenant, inventory, or hardware command rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-17-IMIN-PAINT-AND-MODAL-DEFERRAL-PHASE-384
---

# iMin paint-cost and remaining modal deferral

## Compliance Impact Classification

Major because the changed files are shared POS/terminal interaction paths and
the repository applies the POS performance compliance floor there. The change
is limited to eager dependency elimination and iMin-only paint-cost overrides;
it preserves existing business, permission, session, terminal, and hardware
command contracts.

## Affected Surfaces

- iMin POS operations-chunk loading for item image preview and service catalog
  create/edit dialogs.
- iMin POS and POS Back Office surfaces containing residual backdrop or CSS
  blur effects.
- Browser POS keeps its existing dependency loading and visual treatment.

## Compliance Preconditions

- The three deferred components load through `lazyWithChunkRetry` only when
  their existing open state is true; their props, callbacks, dismissal,
  focus, and scroll behavior remain unchanged.
- The additional CSS selectors are scoped to the existing
  `dgfy-imin-performance` runtime marker; browser, IMS, and Storefront
  behavior is unchanged.
- No API, schema, tenant, session, catalog, inventory, payment, fiscal,
  authorization, or native bridge command contract changes.
- The physical iMin trace remains independent release evidence under Phase 352
  and is not replaced by local source/build evidence.

## Verification Evidence

- Focused shared contracts passed: 7 files, 93 tests, including the iMin
  performance, modal, dialog, import, image, and terminal-view contracts.
- POS unit suite passed: 9 files, 39 tests.
- POS lint passed with the existing Business Admin max-lines warning only.
- POS production build passed: 3,774 modules transformed; the operations
  workspace output is approximately 535.84 KB minified / 121.78 KB gzip, with
  the three deferred modal/image dependencies emitted as separate chunks.
- IMS and Storefront production builds passed: 1,883 and 2,458 modules
  transformed.
- Authenticated local POS smoke passed: 1 test, 1 worker, no runtime crash.
- The standard unauthenticated terminal shell smoke found no page errors or
  failed requests at desktop, tablet, or mobile sizes; its separate existing
  sales-handoff assertion still ends at the local POS session-expired URL
  instead of the legacy SKUpervisor handoff and remains outside this phase.
- Documentation, architecture, compliance, and whitespace checks passed. No
  API, schema, tenant, session, catalog, inventory, payment, fiscal,
  authorization, or native bridge command contract changed.

## Preflight Reconciliation

Not executed on this local implementation session. The `NOT-EXECUTED-*`
reference remains until the normal promotion batch performs the live preflight;
no live compliance result is claimed by this declaration.
