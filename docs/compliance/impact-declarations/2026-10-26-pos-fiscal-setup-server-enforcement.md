---
status: draft_pr
owner: DGFY POS/compliance
last_reviewed: 2026-10-27
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md,docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md,docs/architecture/adr/0045-shared-pos-receipt-renderer.md
declaration_id: 2026-10-26-pos-fiscal-setup-server-enforcement
classification: regulatory
surfaces: pos,terminal,settings,compliance,payments
reason_codes_impacted: FISCAL_SETUP_INCOMPLETE,POS_TAXPAYER_TYPE_UNRECOGNIZED,COMPLIANCE_SETTINGS_INCOMPLETE
policy_version: 2026.10.26
verification_evidence: apps/dgfy-api/tests/settingsValidator.posTaxpayerType.test.js,apps/dgfy-api/tests/posTaxpayerTypePolicy.test.js,apps/dgfy-api/tests/posTaxpayerType.migration.test.js,apps/dgfy-api/tests/compliancePolicyEngine.test.js,POS/OPIS production builds,shared POS settings and receipt contract tests,git diff --check
rollback_note: Revert the server taxpayer-type policy, compliance checklist requirement, fiscal issuance guard, migration, shared resolver, tests, and this declaration together; the migration rollback is intentionally data-preserving and does not delete tenant settings.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-27T05:14:44.844Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-10-26-POS-FISCAL-SETUP-SERVER-ENFORCEMENT
---

# POS fiscal setup server enforcement

## Compliance Impact Classification

Major. This slice adds server-owned validation and issuance enforcement for the
taxpayer classification used when the POS produces a fiscal invoice. It also
adds a tenant-setting seed migration. It does not select a statutory tax rate,
rewrite historical transactions, or silently convert existing aliases.

## Affected Surfaces

- POS settings API bulk and single-setting writes.
- POS settings API read projections consumed by POS and OPIS.
- Compliance activation readiness and fiscal POS checkout.
- Landlord and active tenant `system_settings` EAV rows through the migration runner.

## Compliance Preconditions

1. The server-owned receipt contract remains authoritative for fiscal versus
   non-fiscal document classification.
2. Existing recognized aliases remain readable and are preserved as stored;
   unknown nonblank values are rejected on new writes and reported as needing
   review on reads.
3. Blank or unknown taxpayer classification blocks fiscal issuance but does not
   block non-fiscal checkout.
4. The migration is idempotent and never deletes or rewrites an existing tenant
   value, including on rollback.
5. A live authenticated compliance preflight must reconcile this declaration
   before promotion. The local worktree preflight ran against the local API on
   2026-10-27 and returned `no_breach`/`ALLOWED`; this is local engineering
   evidence and is not a deployed or regulatory certification.

## Verification Evidence

- API focused suite: 8 suites / 172 tests passed, including settings validation,
  use-case bypass protection, compliance readiness, checkout regression, and the
  migration harness.
- POS production build passed.
- OPIS production build passed.
- Shared POS settings and receipt contract tests passed: 2 files / 65 tests.
- Local authenticated compliance preflight passed: HTTP 200,
  `result=no_breach`, `can_proceed=true`, `reason_code=ALLOWED`.
- `git diff --check` passed.

## Deferred outside the local-only implementation scope

- Local migration and landlord/tenant verification are complete in the Phase 560
  evidence; no staging or deployed database is part of this change.
- Tax/accounting and product approval of the fiscal specification and examples
  remain external review work, not a local code blocker.
- Deployed G2 fiscal issuance and non-fiscal regression evidence remain a later
  release gate and are intentionally outside this local-only change.
