---
status: reference
owner: engineering
last_reviewed: 2026-09-11
related_adr: 0053-pluggable-pos-hardware-device-drivers.md
declaration_id: 2026-09-11-imin-thermal-receipt-currency
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.11
verification_evidence: targeted iMin receipt Vitest suite (31 tests),dgfy-pos production build,npm run check:architecture,npm run lint:docs,npm run check:compliance
rollback_note: Revert the hardware currency-prefix formatter, its contract-test updates, the POS version bump, this release note, and this declaration together. No payment, tax, discount calculation, transaction persistence, audit, API, database, or browser/UI preview behavior changes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-11T11:30:00+08:00
preflight_request_ref: PREFLIGHT-1174-IMIN-THERMAL-CURRENCY
---

# iMin Thermal Receipt Currency Compatibility

## Compliance Impact Classification

Major. The changed files are under `packages/web-core/src/features/pos/`, whose
classification floor is `major` for the `pos,terminal` surfaces. The change only
replaces the Unicode peso glyph with an ASCII `PHP ` label in the physical iMin
receipt/order-ticket formatter because the built-in and ESC/POS fallback printer
paths do not reliably render the glyph. It does not change payment capture, fiscal
calculations, transaction persistence, authorization, audit payloads, API contracts,
database schema, or browser/UI receipt previews.

## Affected Surfaces

- `pos`, `terminal` — the native iMin physical receipt and order-ticket print text.
- The browser/UI receipt preview remains on its existing currency rendering path.

## Compliance Preconditions

- Printed monetary values must remain numerically identical; only the hardware-safe
  currency label changes.
- Negative discounts and payment-breakdown amounts must use the same ASCII-safe label
  as positive receipt amounts.
- Browser/UI previews, payment data, tax calculations, transaction storage, and audit
  payloads must remain unchanged.
- No database migration, compliance-policy transition, or fiscal-document lifecycle
  behavior is introduced by this hotfix.

## Verification Evidence

- Targeted iMin receipt/order-ticket Vitest suite passed: 3 files, 31 tests.
- `apps/dgfy-pos` production build passed.
- `npm run check:architecture` passed.
- `npm run lint:docs` and `npm run check:release-notes` passed.
- Physical-printer verification is deferred because no Android/iMin device was
  attached to the local environment; the formatter contract explicitly rejects the
  Unicode peso glyph in hardware output.

## Deployment And Rollback

No database migration or deployment sequencing is required. Roll back by reverting
the formatter, its tests, the POS patch version, the release note, and this declaration
together.
