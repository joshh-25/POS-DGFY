---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-03
declaration_id: 2026-10-03-pos-bir-annex-b-items-4-14-section-05
classification: regulatory
surfaces: pos,terminal,compliance,settings
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHORIZATION_FAILED,INTERNAL_ERROR
policy_version: 2026.10.03
verification_evidence: apps/dgfy-api/tests/eJournalReadiness.unit.test.js -- 5 passing,apps/dgfy-api/tests/businessAdminEvidence.usecase.test.js -- 4 passing,apps/dgfy-api/tests/businessAdminEvidence.transport.test.js -- 1 passing,npm run check:architecture:dgfy-api -- passed,npm --prefix apps/dgfy-pos run build -- passed,npm run check:annex-b-section-05 -- passed,npm run test:annex-b-section-05 -- passed
rollback_note: Code-only rollback of Section 05 routes/use cases/serializer/reviewer tab and evidence artifacts; no migration or historical-data mutation.
preflight_result: no_breach
preflight_reason_code: NOT_EXECUTED_LOCAL_ONLY
preflight_run_at: 2026-10-03T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-POS-BIR-ANNEX-B-SECTION-05-LOCAL-ONLY
---

# POS BIR Annex B Items 4 to 14 — Section 05

## Compliance Impact Classification

Regulatory. This is a local readiness implementation for report applicability
evidence and an internal e-journal contract. It does not claim BIR, provider,
tax-practitioner, or external grammar approval.

## Affected Surfaces

- POS Business Admin report applicability and evidence reviewer surface.
- POS terminal fiscal transaction, adjustment, and reading source paths.
- Compliance evidence contract, serializer, manifest, and local validation.
- Settings and permission boundaries used to enforce Business Admin access,
  report viewing, export authorization, branch scope, date scope, and terminal
  scope.

## Compliance Preconditions

- Execution is local-only; no staging or production system is accessed.
- Fiscal source records remain server-owned immutable snapshots with hashes;
  provisional or non-fiscal records are excluded.
- Business Admin, report-view, and report-export permissions are enforced at
  the use-case boundary, with assigned branch scope and bounded source reads.
- External BIR/provider grammar, retention, printer-layout, and accreditation
  review remain open gates before any external submission or approval claim.

## Verification Evidence

- Focused backend suites passed: e-journal serializer (5), evidence use case
  (4), and transport (1).
- `npm run check:architecture:dgfy-api` passed.
- `npm --prefix apps/dgfy-pos run build` passed.
- `npm run check:annex-b-section-05` and
  `npm run test:annex-b-section-05` passed.
- DOCX output was structurally validated; visual rendering was not available
  because LibreOffice/`soffice.exe` is not installed in this local environment.

## Security and Data Handling

- Export output excludes credentials and payment secrets; only snapshot payment
  method/reference fields permitted by the internal grammar are serialized.
- Source reads are limited to one Asia/Manila business date and 5,000 rows per
  source category; oversized work is rejected and audited before output.
- Every catalog view, successful export, failed source read, serializer failure,
  and bounds rejection has an AuditLog event where the audit repository is
  available.
