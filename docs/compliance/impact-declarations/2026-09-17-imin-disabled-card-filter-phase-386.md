---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-17
related_adr: 0043-standalone-native-hardware-pos-runtime.md
declaration_id: 2026-09-17-imin-disabled-card-filter-phase-386
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: focused iMin performance contract, POS unit suite, POS/IMS/Storefront builds, POS lint, repository documentation/architecture/compliance/whitespace checks, authenticated local POS smoke
rollback_note: Revert the Phase 386 iMin disabled-card selector, focused contract, baseline/ADR/ledger entries, and this declaration together. No API, schema, payment, fiscal, authorization, persistence, tenant, inventory, catalog, or hardware command rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-17-IMIN-DISABLED-CARD-FILTER-PHASE-386
---

# iMin disabled-card filter closure

## Compliance Impact Classification

Major because the changed shared stylesheet is part of the POS/terminal
interaction path and the repository applies the POS performance compliance
floor there. The change is limited to an iMin-only paint override for an
existing disabled-card filter; it preserves business, permission, session,
catalog, and native hardware contracts.

## Affected Surfaces

- iMin POS rendering of disabled/out-of-stock catalog cards using the legacy
  `blur-[0.5px]` class.
- Browser POS and non-iMin surfaces retain their existing styling.

## Compliance Preconditions

- The selector is scoped below the existing `dgfy-imin-performance` marker and
  does not remove the source class or change card availability semantics.
- No API, schema, tenant, session, catalog, inventory, payment, fiscal,
  authorization, or native bridge command contract changes.
- Physical iMin frame, image, memory, and bridge traces remain independent
  release evidence under Phase 352 and are not replaced by local checks.

## Verification Evidence

- Focused iMin performance contract passed: 1 file, 13 tests.
- POS unit suite passed: 10 files, 41 tests.
- POS lint passed with the existing Business Admin max-lines warning only.
- POS, IMS, and Storefront production builds passed: 3,776, 1,883, and 2,458
  modules transformed.
- Repository documentation, architecture, compliance, whitespace, and
  authenticated local POS smoke checks passed as recorded in the Phase 386
  ledger entry.

## Preflight Reconciliation

Not executed on this local implementation session. The `NOT-EXECUTED-*`
reference remains until the normal promotion batch performs the live preflight;
no live compliance result is claimed by this declaration.
