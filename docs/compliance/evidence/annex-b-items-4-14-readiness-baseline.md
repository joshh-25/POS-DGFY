---
status: draft_pr
authority_level: reference
owner: compliance engineering
last_reviewed: 2026-10-03
applies_to: pos_bir_annex_b_items_4_14
topic: annex_b_readiness_baseline
related_adr: docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
declaration: docs/compliance/impact-declarations/2026-10-03-pos-bir-annex-b-items-4-14-phase-353.md
---

# POS BIR Annex B Items 4 to 14 Readiness Baseline

## Purpose

This baseline records the confirmed repository support, current gap, owner,
planned evidence, and readiness status for Annex B Items 4 through 14. It is
the human-readable companion to
`annex-b-items-4-14-readiness-baseline.json`, which is the machine-validated
source for the Section 01 gate.

This is an internal local readiness record. It does not claim BIR, TWG,
provider, tax-practitioner, eAccReg, PTU, ATG, or eSales acceptance.

## Execution boundary

- Execution mode: local only.
- Baseline commit: `786cd4e8329db1a65398ce6aa7eb020ffc8f3b28`.
- Worktree state: dirty with unrelated changes; those changes are not part of
  this baseline implementation.
- Phase: 353, completed for the source-lock and control-matrix scope.
- Source register: the user-supplied Annex B PDF and the approved plan index and
  Section 01 document, official RMO 24-2023 source, internal e-Journal grammar,
  and Return contract are registered in the JSON baseline.

## Readiness status model

`INTERNAL_PASS` requires runtime behavior, generated evidence, checksum
verification, and reviewer metadata. `BLOCKED` means a required contract,
source rule, artifact, or proof is missing. `EXTERNAL_REVIEW_REQUIRED` keeps
internal readiness separate from external acceptance. `NOT_APPLICABLE` requires
reviewer-authored rationale and is never a silent omission.

The validator rejects a baseline that reports 100 percent while any required
item is blocked or incomplete. Item 5 and Item 8 may use an
`INTERNAL_READINESS_LOCKED` contract for planning, but they remain blocked until
their later runtime evidence is generated and reviewed.

## Item baseline

| Annex item | Confirmed support | Current gap | Planned evidence | Internal status | External status |
|---:|---|---|---|---|---|
| 4 | Explicit fiscal/non-fiscal receipt context, server snapshot/hash, shared renderer, buyer/VAT/discount/charge fields | Scenario-complete receipt samples and legal field review are missing | Receipt scenario pack and fixture manifest | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 5 | Void/refund use cases, adjustment ledger, fiscal events, audit context | Internal Return contract is locked; runtime Return behavior and linked adjustment samples are missing | Adjustment sample pack and original-document linkage report | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 6 | X/Z routes, immutable Z snapshots, day-close controls, print support | Reconciled controlled samples and freshness proof are missing | X/Z printouts and reconciliation report | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 7 | Report registry, terminal reports, Business Admin fiscal/read-only surfaces | Complete applicable inventory and sample printouts are not frozen | Report catalog, samples, and manifest | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 8 | Fiscal events, hashes, eSales lifecycle, final-review storage | Internal readiness grammar is locked; receipt-complete `.txt`, hard-copy projection, and completeness proof are missing | Raw journal, hard-copy projection, reconciliation, and checksum manifest | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 9 | Software specification packet, system flow diagram, current module boundaries | Narrative is not refreshed to current paths and final contracts | Reviewed system narrative and flow diagram | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 10 | Build-stamped VersionBadge and POS software identity settings | Login/home/splash evidence and cross-surface version consistency are missing | Redacted screenshots and version register | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 11 | Browser network state, API reachability, provisional offline restrictions | Online/offline evidence and exact indicator semantics are missing | Online/offline screenshots and behavior log | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 12 | Software specification and device-adapter documentation | Versioned operator manual and hardware applicability decision are missing | Operator manual and device applicability matrix | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 13 | AuditLog fields, filtering, and secret scrubbing | Print-ready export and complete field-coverage proof are missing | Filtered audit print/export and coverage report | BLOCKED | EXTERNAL_REVIEW_REQUIRED |
| 14 | RPO/RTO, encryption, retention, restore guidance, drill artifact format | Fresh fiscal-record restore proof, freshness, and sign-off are missing | DRP, restore drill, encryption proof, and remediation record | BLOCKED | EXTERNAL_REVIEW_REQUIRED |

## Section 01 acceptance record

- `AC-410` PASS: the baseline contains exactly Items 4 through 14, each with
  confirmed support or an explicit gap.
- `AC-411` PASS: no item is described as BIR-approved from code or document
  existence alone.
- `AC-412` PASS: the baseline and validator are local-only and contain no
  staging dependency.
- `AC-413` PASS: Item 5 carries a P0 Return contract and remains blocked until
  runtime behavior and evidence are generated and reviewed.

The Section 01 record is implemented and verified. Phase 353 source-lock work
is complete for local readiness: the official RMO minimum contract, internal
e-Journal grammar, and internal Return contract are versioned and registered.
External acceptance remains pending, and later phases still must implement and
prove runtime behavior.

## Section 02 requirements registry

The approved Section 02 control matrix is implemented as the machine-readable
`annex-b-items-4-14-requirements-registry.json` and validated by
`validate-annex-b-items-4-14-requirements.cjs`. It preserves exactly Items 4
through 14, the Section 02 requirement/test/acceptance IDs, the 49 approved
fixture IDs, evidence obligations, owners, applicability decisions, and the
downstream phase map. This is a requirements and evidence-control artifact; it
does not claim that the later runtime evidence has been generated.

Section 02 is locally verified as part of Phase 353. The registry intentionally
reports zero internal passes and a zero percent internal score until each
obligation is generated, reviewed, and checksum-verified. External review
remains `PENDING`.

## Source-of-truth policy

The baseline references existing POS fiscal transactions, immutable snapshots,
adjustments, fiscal events, readings, reports, audit records, and compliance
review records. It does not create a second fiscal ledger, mutate historical
transactions, or treat a planned evidence path as a generated artifact.

The next implementation phase may extend those contracts only through the
versioned readiness contracts recorded for Phase 353. It must not silently
change the grammar or Return semantics without a new decision record.
