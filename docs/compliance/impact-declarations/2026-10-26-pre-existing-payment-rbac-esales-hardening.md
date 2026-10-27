---
status: reference
owner: engineering
last_reviewed: 2026-10-27
declaration_id: 2026-10-26-pre-existing-payment-rbac-esales-hardening
classification: regulatory
surfaces: pos,terminal,payments,settings,compliance
reason_codes_impacted: DIRECT_CARD_CONFIGURATION_INCOMPLETE,STAFF_ROLE_PERMISSION_FAIL_CLOSED,ESALES_STATUS_ROUTE_ALIGNMENT
policy_version: 2026.10.26
verification_evidence: focused backend tests,shared POS contract tests,frontend production builds,git diff check
rollback_note: Revert the declared application and matching test changes; no database migration or posted financial-record rewrite is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-27T05:16:32.225Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-10-26-PRE-EXISTING-PAYMENT-RBAC-ESALES-HARDENING
---

# Pre-existing Payment, RBAC, and eSales Hardening

## Compliance Impact Classification

Major. This declaration covers sensitive working-tree changes that were already
present before the BIR Step 01 baseline: the direct-card configuration gate,
fail-closed staff permission handling, and the eSales report-status route
alignment. These changes affect payment, terminal/POS authorization, and
settings-facing behavior but do not add a fiscal rate, change invoice
numbering, or rewrite posted financial records.

## Affected Surfaces

- Payments: direct card checkout remains blocked with an explicit configuration
  result until the required direct-card capability is complete; a hosted payment
  portal is not silently created by this change.
- POS/terminal: inactive or mismatched staff-role state does not receive
  permissions.
- Settings/eSales: the client and contract test use the canonical eSales report
  status endpoint and validate the unsupported fallback path.

## Compliance Preconditions

1. Server-side authorization remains authoritative; frontend visibility is not
   treated as permission enforcement.
2. The direct-card gate remains fail-closed and returns its existing reason code
   until the required configuration is present.
3. eSales status updates remain tenant-scoped and use the encoded report ID.
4. This declaration does not authorize new statutory tax behavior or a change to
   the fiscal document specification.
5. No migration, posted transaction, password, token, or provider secret is
   included in the declared change.

## Verification Evidence

- `apps/dgfy-api/tests/storeDirectGcash.usecase.test.js`
- `apps/dgfy-api/tests/storeUsecases.applicationResult.test.js`
- `apps/dgfy-api/tests/staffCapabilityContract.test.js`
- `packages/web-core/src/features/pos/__tests__/posService.apiPaths.contract.test.js`
- `packages/web-core/src/features/pos/services/__tests__/posService.esalesStatus.test.js`
- POS/OPIS/Storefront/IMS production builds passed during the Step 01 baseline.
- Focused backend BIR/compliance/fiscal/offline run passed: 29 suites / 234 tests.
- Shared POS service contract tests passed: 2 files / 4 tests.

## Rollback and data impact

Rollback is application-only: revert the declared files and rerun the listed
tests. No database migration, schema change, or deletion of posted financial
records is part of this declaration.

## Local preflight status

The authenticated local compliance preflight returned HTTP 200 with
`result=no_breach`, `can_proceed=true`, and `reason_code=ALLOWED` on 2026-10-27.
The reconciled request reference is recorded in the front matter. No staging or
deployed environment is part of this local-only validation.
