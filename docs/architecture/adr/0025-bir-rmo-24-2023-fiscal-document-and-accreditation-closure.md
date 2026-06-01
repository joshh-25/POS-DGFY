# ADR 0025: BIR RMO 24-2023 Fiscal Document and Accreditation Closure

## Status
Accepted (2026-06-01)

## Context
ADR 0007 established the dual-mode POS compliance lifecycle:

1. `non_compliant_active`
2. `compliant_pending`
3. `compliant_active`

The current implementation correctly blocks fiscal output outside `compliant_active`, but BIR RMO 24-2023 introduces a broader accreditation and registration surface than the original lifecycle guard. The system must not allow fiscal activation based only on generic profile fields, generic artifacts, or tenant self-attestation. Fiscal activation must also depend on filing evidence, terminal/software identity, document-content review, fiscal integrity proof, eSales/reporting readiness, and final compliance sign-off.

## Decision
Extend the dual-mode compliance program with an RMO 24-2023 closure gate before `compliant_active`.

The new gate is enforced through:

1. Required BIR profile confirmations:
   - `bir.rmo_24_2023_filing_verified`
   - `bir.fiscal_document_content_reviewed`
   - `bir.terminal_registration_controls_confirmed`
   - `bir.ejournal_integrity_controls_confirmed`
   - `bir.esales_reporting_controls_confirmed`
2. Dedicated RMO final-review documents:
   - RMO 24-2023 control matrix
   - Filing authority and responsibility decision
   - Fiscal receipt/invoice sample pack
   - Fiscal event integrity evidence
   - eSales reporting plan and rehearsal evidence
3. A policy-engine blocker:
   - `RMO_FILING_EVIDENCE_REQUIRED`
   - `FISCAL_TERMINAL_REGISTRATION_REQUIRED`
4. Checklist evidence:
   - `evidence.rmo_filing_readiness`
   - `evidence.fiscal_terminal_registration`
   - `control.rmo_filing_readiness`
   - `control.fiscal_terminal_registration`

`compliant_active` remains impossible unless the ordinary compliance checklist, RMO filing readiness, and at least one verified fiscal terminal registration are complete.

## Scope
This ADR covers the compliance-activation gate, filing evidence model, and internal fiscal runtime controls implemented before external BIR approval:

1. Fiscal buyer capture and persisted transaction snapshots.
2. Server-owned fiscal document payloads and SHA-256 hashes.
3. Verified fiscal terminal registration records.
4. Append-only fiscal event ledger records with monotonic `event_sequence` and hash-chain fields for issuance, print/reprint, void, Z-reading, governed reset, terminal registration, and eSales export/status changes, plus a read-only integrity verifier that recomputes hashes and previous-hash linkage.
5. Fiscal print/reprint event records created after the browser print dialog is opened and the operator confirms print evidence; reprints require reasons.
6. Fiscal void lifecycle state, void-event hash linkage, and POS stock-return movements for original POS stock issues.
7. Asia/Manila eSales report package generation, checksum storage, gross/voided/net summary separation, and submitted/accepted/rejected status tracking with evidence references.

External BIR accreditation, final legal/tax interpretation, official eSales submission acknowledgement, and practitioner sign-off remain outside code-only completion.

## Consequences
1. Existing non-fiscal POS behavior remains operational.
2. Tenants can remain or move to `compliant_pending`, but cannot activate fiscal issuance until RMO filing evidence is complete.
3. Generic submission documents no longer satisfy fiscal activation by themselves.
4. Compliance UI must surface RMO filing evidence as part of final review.
5. Tests must prove missing RMO filing evidence blocks activation.
6. Tests must prove missing verified fiscal terminal registration blocks activation.
7. Fiscal invoices require a verified fiscal terminal registration before checkout.
8. Fiscal print, void, and eSales package generation/status updates must create append-only fiscal events.
9. POS settings must expose operator-visible readiness and integrity verification states for fiscal terminals and the fiscal event ledger.
10. Payment-provider refund settlement remains outside POS void unless an integrated provider workflow is attached; POS void handles internal fiscal evidence and stock reversal.

## Rollback Notes
1. Runtime rollback may remove the RMO readiness requirement only by reverting this ADR's code changes and compliance declaration together.
2. Rollback must not automatically activate any tenant.
3. Rollback must preserve uploaded filing evidence, audit logs, compliance profile fields, and final-review documents.
4. If a tenant has reached `compliant_active` under this policy, downgrade must use ADR 0011 governed paths.
