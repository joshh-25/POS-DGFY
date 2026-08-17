---
status: reference
owner: engineering
last_reviewed: 2026-08-17
declaration_id: 2026-08-17-pos-receipt-parked-ui-hardening
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.16
verification_evidence: focused backend POS tests,focused frontend POS tests,receipt contract tests,POS production build,Storefront production build,targeted lint,git diff check
rollback_note: Revert the receipt renderer and iMin bridge batch, POS parked-sale and discount batches, Storefront header batch, tests, and this declaration together; preserve issued transaction and audit records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-17T00:00:00+08:00
preflight_request_ref: PHASE-98
---

# POS Receipt, Parked Sale, and Terminal UI Hardening

## Compliance Impact Classification

Major because the local release inventory changes receipt totals and discount
disclosure, iMin printing behavior, parked-sale ownership and handoff, POS
discount calculation, audit presentation, and terminal controls. The changes
preserve tenant, location, cashier, shift, payment, and append-only audit
boundaries.

## Affected Surfaces

1. POS receipts and thermal output, including signed discount rows and net
   totals.
2. iMin receipt formatting and hardware bridge behavior.
3. POS discount calculation, audit details, parked-sale ownership, and
   cashier-facing terminal controls.
4. Storefront header and hero navigation consumed by the POS handoff flow.

## Compliance Preconditions

1. Receipt totals remain derived from persisted transaction and discount
   allocation data; the renderer must not change the recorded transaction
   amount.
2. Discount amounts are displayed with an explicit negative sign and net
   total without exposing passwords, PINs, or payment secrets.
3. Parked-sale sharing remains location-scoped; payment, stock, and fiscal
   completion remain bound to the cashier and shift that complete the sale.
4. Audit details remain tenant-scoped and redact sensitive values.
5. No database migration is included in this local change set; any migration
   introduced by the develop merge must pass the repository migration checks
   before the draft PR is opened.
6. This declaration authorizes local validation and a draft PR to `develop`
   only. It does not authorize staging, `main`, or production deployment.

## Verification Evidence

1. Focused backend POS and audit tests passed before the develop merge.
2. Focused frontend POS, receipt, iMin, and Storefront contract tests passed
   before the develop merge.
3. Backend and frontend lint completed with zero errors; POS and Storefront
   production builds completed successfully before the develop merge.
4. `git diff --check` passed and the changed-file safety scan found no
   `DO NOT COMMIT` marker in the release inventory.
5. After the develop merge, the affected tests, migration checks if applicable,
   lint, builds, and PR compliance gates must be rerun and reported in the
   draft PR.
