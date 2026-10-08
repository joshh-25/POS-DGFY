---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-03
related_adr: docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
declaration_id: 2026-10-03-pos-bir-annex-b-items-4-14-phase-353
classification: regulatory
surfaces: compliance,pos,terminal,settings
reason_codes_impacted: RMO_FILING_EVIDENCE_REQUIRED,VERIFICATION_REQUIRED,ALLOWED
policy_version: 2026.10.03
verification_evidence: npm run check:annex-b-readiness,npm run test:annex-b-readiness,npm run check:annex-b-requirements,npm run test:annex-b-requirements,npm run check:annex-b-architecture,npm run test:annex-b-architecture,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the Annex B baseline JSON, validator, validator tests, compliance declaration, human-readable baseline, package scripts, and Phase 353 ledger entry together. No fiscal transactions, historical snapshots, evidence artifacts, database rows, staging resources, or production resources are changed by this slice.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-08T09:13:46.750Z
preflight_request_ref: PREFLIGHT-37754614808-2026-10-03-POS-BIR-ANNEX-B-ITEMS-4-14-PHASE-353
---

# POS BIR Annex B Items 4 to 14 Phase 353 Source Lock and Requirements Registry

## Compliance Impact Classification

Regulatory. This slice establishes the controlled baseline, Section 02
requirements registry, and validation gates for RMO 24-2023 Annex B Items 4
through 14. It does not change fiscal issuance, tax calculation, adjustment
behavior, e-journal serialization, permissions, database schema, or activation
state.

## Affected Surfaces

- Annex B readiness evidence and compliance documentation.
- Versioned Section 02 control, fixture, evidence, and downstream-phase registry.
- POS fiscal, terminal, settings, and report source references used only for
  current-state traceability.
- Root validation scripts and package-level readiness commands.

## Compliance Preconditions

1. The supplied Annex B checklist and approved plan documents remain the source
   register for this baseline.
2. No current capability is treated as BIR-approved from code or document
   existence alone.
3. Item 5 Return semantics and the Item 8 e-Journal minimum contract are
   recorded as internal readiness contracts. External BIR, provider,
   tax-practitioner, and TWG review remains pending and is not required for
   this local source-lock phase.
4. Local verification does not require staging, production data, or deployment.

## Scope

The slice adds:

- a machine-readable Items 4-14 baseline with source, owner, fixture, evidence,
  phase, test, and acceptance traceability;
- a validator and tests that reject missing rows, stale status accounting,
  false 100 percent readiness, obsolete repository paths, and an Item 5 pass
  while Return semantics are open;
- a human-readable baseline and local-only execution declaration; and
- a machine-readable Section 02 requirements registry with the exact control,
  fixture, evidence, owner, applicability, test, acceptance, and phase mapping;
- a registry validator and tests for source checksums, evidence gates, N/A
  rationale, stale paths, and false 100 percent readiness; and
- versioned internal e-Journal and Return readiness contracts linked from the
  Phase 353 ledger entry.
- a versioned Section 03 current/target architecture contract, source-of-truth
  map, module placement map, guardrails, and independent validator/test suite;
  and
- an execution record for the approved Section 03 architecture slice.

The slice deliberately does not implement later-phase receipt, adjustment,
reading, report, or e-journal runtime behavior.

## Preconditions and safety rules

1. The supplied Annex B checklist and approved plan documents are checksum-bound
   in the baseline source register.
2. The worktree is dirty; unrelated changes remain untouched and uncommitted.
3. The baseline does not claim BIR, TWG, provider, tax-practitioner, eAccReg,
   PTU, ATG, or eSales acceptance.
4. Item 5 Return semantics and the Item 8 e-Journal minimum contract are
   internally source-locked for readiness implementation. External acceptance
   remains `PENDING`.
5. No staging credentials, staging URLs, production data, or deployment actions
   are required.

## Verification Evidence

The final command results are recorded in the execution reports for Sections
01 through 03. Section 03 architecture and negative-path validator checks pass
locally. Runtime behavior remains assigned to later phases by the approved
plan.
The existing checkout baseline already had passing docs/ADR and architecture
checks. The repository-wide compliance check also reports unrelated failures in
pre-existing uncommitted 2026-09-26 registration declarations; those failures
are not caused by this slice and remain open for the owning change.

## Rollback constraints

Rollback removes only the new baseline/validator/documentation slice. It must
not reset the dirty worktree, rewrite Phase 352, delete fiscal or audit data, or
remove any existing final-review evidence.
