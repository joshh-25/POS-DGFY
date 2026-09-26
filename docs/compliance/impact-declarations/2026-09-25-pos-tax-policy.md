---
status: draft_pr
owner: DGFY POS/settings
last_reviewed: 2026-09-25
declaration_id: 2026-09-25-pos-tax-policy
classification: major
surfaces: pos,terminal,settings,payments,inventory
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,AUTHORIZATION_FAILED
policy_version: 2026.09.25
verification_evidence: focused POS tax-policy backend suites 41/41; POS Settings web-core behavior suite 38/38; API/POS lint; POS/Storefront/IMS builds; architecture guardrails; controller-boundary check; docs and ADR lint; git diff check; upgraded local migration applied and verified across 16 schemas
rollback_note: Revert the POS Taxes settings UI, canonical policy normalization and validation, discount/voucher calculation wiring, immutable snapshot columns, mobile policy propagation, focused tests, and this declaration together. Do not rewrite historical transaction discount rows; any deployed migration rollback requires an explicit retention review.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.557Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-25-POS-TAX-POLICY
---

# POS Taxes policy configuration

## Compliance Impact Classification

Major. The change adds an authorized POS settings control that can alter VAT
treatment in future governed discount and voucher calculations. Existing
statutory discount-rate ownership, approval requirements, promo/voucher
eligibility, and historical transaction snapshots remain server-controlled.

## Affected Surfaces

- POS Settings and the tenant settings API for the versioned tax-policy matrix.
- POS discount and voucher calculations for Senior Citizen, PWD, Others,
  Employee, Promo, and Voucher categories.
- Transaction discount snapshots, audit evidence, and signed mobile statutory
  policy evidence.
- Additive tenant-schema migration for immutable treatment/version fields.

## Compliance Preconditions

1. The setting accepts only the six canonical categories and `standard` or
   `vat_exempt` treatment values; unknown categories and client-supplied rates
   do not affect server calculation.
2. Senior/PWD statutory rates remain server-governed at 20%, while the existing
   defaults preserve their VAT-exempt behavior. Other categories remain standard
   unless an authorized tenant explicitly selects VAT-exempt treatment.
3. The selected treatment and policy version are written to the discount
   snapshot at calculation time. Existing transactions are not backfilled.
4. Settings changes are tenant-scoped, audited with before/after values, and
   affect future POS calculations only. Existing settings authorization remains
   required for direct API writes.
5. Mobile statutory-policy evidence includes the tax policy in its signed
   checkpoint so a changed policy makes stale offline evidence fail closed.

## Preflight Status

The live authenticated compliance preflight was not run in this local
implementation session. `NOT-EXECUTED-POS-TAX-POLICY-LOCAL-ONLY` is a PR-time
placeholder, not evidence that the policy engine returned `no_breach`; the
continuous preflight sweep must reconcile it after merge.

## Verification Evidence

- Focused backend tax-policy, discount, voucher, validator, mobile-policy,
  migration, and settings-repository suites: 41/41 passed.
- POS Settings web-core behavior suite: 38/38 passed, including Taxes visibility,
  editing, and save behavior.
- API/POS lint, changed-file syntax checks, architecture guardrails,
  controller-boundary checks, docs/ADR lint, and `git diff --check`: passed.
- POS, Storefront, and IMS production builds: passed.
- The upgraded local landlord and 15 active tenant schemas were migrated and
  verified; fresh-tenant migration rehearsal and authenticated desktop/mobile
  tenant acceptance remain required before release completion.
