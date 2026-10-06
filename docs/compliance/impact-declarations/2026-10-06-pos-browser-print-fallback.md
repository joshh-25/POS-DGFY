---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-06
declaration_id: 2026-10-06-pos-browser-print-fallback
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.06
verification_evidence: focused POS printer/report tests,POS lint and build,git diff --check
rollback_note: Revert the browser printer fallback, report paper-width controls, and this declaration; no database schema, migration, or tenant-data change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-06T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-2260-POS-BROWSER-PRINT-FALLBACK
---

# POS browser printer fallback and report paper sizing

## Compliance Impact Classification

Major because the shared POS terminal receipt and shift-report paths are classified under the
`pos` and `terminal` surfaces. The change preserves the native printer path when available and
opens the browser print dialog when no native POS printer is detected; it also applies the selected
57mm or 80mm paper width consistently to Z-reading and shift-summary print output. It does not
change payment, fiscal, inventory, authorization, or persisted transaction behavior.

## Affected Surfaces

- `pos` — receipt preview, Z-reading, shift-summary printing, and browser printer fallback.
- `terminal` — cashier print controls, paper-width selection, and print-layout CSS.

## Compliance Preconditions

- Native POS printer output remains preferred whenever the hardware bridge reports availability.
- Browser printing only delegates to the operating system's installed printer workflow; it does not
  bypass POS authorization, payment, fiscal, or audit controls.
- The selected paper width affects print presentation only and is not persisted as transactional
  data.
- No database schema, migration, payment, fiscal, inventory, or tenant-data change is included.
- The `NOT-EXECUTED-*` preflight reference is a validator-required PR-open placeholder; no live
  request-time preflight is claimed here, and the continuous compliance sweep must reconcile it.

## Verification Evidence

- Focused POS printer/report tests, POS lint, and the affected app build are required before PR
  submission.
- The repository compliance gate validates this declaration against the changed POS/terminal files.
