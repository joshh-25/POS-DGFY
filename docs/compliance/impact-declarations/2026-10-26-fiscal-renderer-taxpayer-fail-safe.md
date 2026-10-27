---
status: draft_pr
owner: DGFY POS/compliance
last_reviewed: 2026-10-27
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md,docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md,docs/architecture/adr/0045-shared-pos-receipt-renderer.md
declaration_id: 2026-10-26-fiscal-renderer-taxpayer-fail-safe
classification: regulatory
surfaces: pos,terminal,receipt,compliance,settings,payments
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED
policy_version: 2026.10.26
verification_evidence: npm --prefix apps/dgfy-ims test -- --run packages/web-core/src/features/pos/__tests__/receiptContractConformance.contract.test.js packages/web-core/src/features/pos/__tests__/posReceiptItemIdentitySnapshot.test.js,npm run lint:docs,npm run check:architecture,git diff --check
rollback_note: Revert the shared taxpayer-type resolver, fiscal renderer guards, iMin print guard, focused receipt fixtures, package version bump, and this declaration together. Do not restore silent VAT inference for blank or unknown taxpayer settings.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-27T05:14:44.849Z
preflight_request_ref: PREFLIGHT-LOCAL-2026-10-26-FISCAL-RENDERER-TAXPAYER-FAIL-SAFE
---

# Fiscal renderer taxpayer-type fail-safe

## Compliance Impact Classification

Major. This slice changes the POS browser and iMin physical receipt surfaces that
render a fiscal document. It removes the prior behavior that treated an empty or
unknown taxpayer setting as VAT.

## Affected Surfaces

- POS browser receipt preview and retained legacy receipt view.
- iMin physical receipt text generation and print-command boundary.
- The declaration is evaluated alongside the pre-existing settings/payment changes
  in this dirty worktree; those changes remain covered by their separate declaration
  and are not part of this renderer slice.

## Compliance Preconditions

1. The server-owned receipt contract remains the source of fiscal/non-fiscal
   document classification.
2. Only recognized existing VAT/non-VAT setting spellings may select a fiscal label;
   blank or unknown values must fail closed.
3. The approved Fiscal Document Specification must define the authoritative stored
   enum and save-time validation before the settings API is tightened.
4. A real authenticated preflight must reconcile this declaration before
   promotion. The local worktree preflight passed; that result is not a
   deployed or regulatory certification.

## Scope implemented

- Shared `@sieitzz/pos-receipt` accepts the existing VAT/non-VAT spellings and
  returns no taxpayer classification for blank or unknown values.
- Fiscal browser preview, the retained legacy React renderer, and iMin output fail
  closed with an actionable `FISCAL SETUP INCOMPLETE` message when classification
  is unavailable.
- A fiscal iMin print command is not sent when the taxpayer type is unavailable;
  the result is `FISCAL_SETUP_INCOMPLETE`.
- No tax rate, VAT calculation, fiscal identifier, document number, database
  migration, or historical transaction is changed by this slice.

## Preflight Status

The local authenticated compliance preflight ran against the worktree API on
2026-10-27 and returned HTTP 200 with `result=no_breach`, `can_proceed=true`,
and `reason_code=ALLOWED`. The reconciled reference is recorded in the front
matter. This is local engineering evidence only; it does not certify a deployed
tenant or formal BIR approval.

## Remaining work

1. The server-owned receipt contract remains the source of fiscal/non-fiscal
   document classification.
2. Tax/accounting approval of the Fiscal Document Specification and examples
   remains external review work.
3. Deployed G2 acceptance and formal BIR evidence remain later release/regulatory
   gates outside this local-only implementation.
## Verification Evidence

- Focused receipt contract suite: 2 files / 25 tests passed.
- Coverage includes recognized VAT aliases, explicit non-VAT rendering, unknown
  taxpayer fail-closed preview, iMin text, and the no-print hardware guard.
- `git diff --check` passed for the working tree at implementation time.
