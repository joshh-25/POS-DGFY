---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-06-01
applies_to: ph_pos_software_provider
topic: rmo_24_2023_control_matrix
related_adr: 0025-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
---

# RMO 24-2023 Control Matrix

## Scope

This matrix maps the current RMO 24-2023 closure work into product controls. It is an implementation and evidence tracker, not a legal certification.

## Control Map

| ID | Control | Current Implementation | Required Completion Evidence | Status |
|---|---|---|---|---|
| RMO-01 | Fiscal activation must require RMO filing evidence. | Policy engine requires `rmo_filing_readiness.ready=true` and verified fiscal terminal readiness before `ready_for_compliant_activation=true`. | Backend checklist tests and final-review evidence. | Implemented internal control |
| RMO-02 | RMO filing responsibility must be explicitly decided. | Final review now requires `rmo.filing_authority_decision`. | Signed decision naming provider, tenant, terminal, PTU/ATG, and filing responsibilities. | Evidence required |
| RMO-03 | RMO control matrix must exist and be reviewed. | Final review now requires `rmo.control_matrix`. | Reviewed matrix mapping every RMO item to code, evidence, or not-applicable rationale. | Evidence required |
| RMO-04 | Fiscal receipt/invoice sample pack must be reviewed. | Final review now requires `rmo.receipt_sample_pack`. | Fiscal and non-fiscal samples with seller, buyer, terminal, VAT, discount, PTU/ATG, MIN, and software identity fields. | Evidence required |
| RMO-05 | Fiscal event integrity must be proven. | Final review now requires `rmo.fiscal_integrity_evidence`. | Fresh integrity audit evidence for append-only fiscal records, X/Z readings, and reprint/void events. | Evidence required |
| RMO-06 | eSales/reporting readiness must be rehearsed. | Final review now requires `rmo.esales_reporting_plan`. | Fresh eSales or equivalent reporting rehearsal evidence with checksum manifest. | Evidence required |
| RMO-07 | Operator profile must confirm RMO controls. | BIR profile has explicit RMO confirmation booleans and Settings surfaces RMO filing readiness, terminal registration readiness, and fiscal ledger integrity checks. | Profile update, checklist evidence, and Settings UI evidence. | Implemented internal control |
| RMO-08a | Fiscal buyer and document content must be retained as server evidence. | Fiscal checkout persists buyer TIN/business style/address and a server-owned fiscal document snapshot/hash when fiscal issuance is allowed. | `pos_transactions` fiscal snapshot fields and POS checkout usecase evidence. | Implemented internal control |
| RMO-08b | Fiscal terminal identity must be represented before fiscal issuance. | Fiscal checkout and compliant activation require verified fiscal terminal registration; Settings exposes registration management to authorized operators. | `pos_fiscal_terminal_registrations` with MIN, machine serial, software serial, PTU, binding, evidence, verified status, activation blocker, and UI coverage. | Implemented internal control |
| RMO-09 | Fiscal events must be auditable and tamper-evident. | Fiscal issuance, operator-confirmed print/reprint, void with POS stock-return movements, Z-reading, reset, terminal registration, and eSales lifecycle changes write sequenced fiscal event hashes; Settings exposes a fiscal ledger integrity verification panel. | `pos_fiscal_events` append-only ledger, `event_sequence`, hash-chain fields, `/pos/fiscal-ledger/integrity`, and focused usecase tests. | Implemented internal control |
| RMO-10 | eSales reporting must be prepared as a repeatable package. | Monthly Asia/Manila eSales package generation stores payload/hash, separates gross/voided/net totals, and tracks submitted/accepted/rejected status with evidence references. | `pos_esales_reports`, `/pos/esales-reports`, `/pos/esales-reports/generate`, `/pos/esales-reports/:id/status`, and Settings UI coverage. | Implemented internal control |
| RMO-08 | Activation blocker must be deterministic. | Missing RMO filing evidence emits `RMO_FILING_EVIDENCE_REQUIRED`; missing verified fiscal terminal evidence emits `FISCAL_TERMINAL_REGISTRATION_REQUIRED`. | Backend policy test coverage. | Implemented internal control |

## Remaining Non-Code Evidence

The following items remain outside code-only completion and must be handled through the governed compliance process:

1. External BIR accreditation, PTU/ATG, registration, or filing acceptance.
2. Legal/tax practitioner interpretation and sign-off.
3. Official submission acknowledgement evidence for eSales or equivalent reporting.
4. Fiscal inspection package export with a signed checksum manifest, if required by the filing authority for a specific submission package.
