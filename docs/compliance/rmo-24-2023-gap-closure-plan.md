---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-06-01
applies_to: ph_pos_software_provider
topic: rmo_24_2023_gap_closure_plan
related_adr: 0007-dual-mode-pos-compliance-program.md,0011-compliance-downgrade-escape-hatches.md,0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md
---

# RMO 24-2023 Gap Closure Plan

## Purpose

Define the governed implementation plan for closing the current gaps between SKU Inventory Manager's POS compliance architecture and the BIR RMO 24-2023 accreditation and registration expectations for POS/CRM and similar sales software that generates invoices or receipts.

This plan does not certify legal compliance. It defines the product, engineering, security, evidence, and release work required before the system may be presented for formal compliance review, accreditation filing, or production fiscal activation.

## Authoritative Planning Inputs

Repository inputs:
1. `docs/START_HERE.md` - mandatory planning order and authority rules.
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` - modular monolith boundary rules.
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` - cross-boundary, hardening, and release evidence requirements.
4. `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md` - fiscal/non-fiscal lifecycle architecture.
5. `docs/architecture/adr/0011-compliance-downgrade-escape-hatches.md` - governed compliant-state downgrade exceptions.
6. `docs/compliance/ph-pos-software-developer-compliance-guide.md` - current authoritative PH POS compliance baseline.
7. `docs/compliance/request-time-preflight-protocol.md` - required preflight workflow for sensitive changes.
8. `docs/compliance/compliance-classification-matrix.md` - minimum classification floors.
9. `docs/features/IMS_POS_SALES_UX_JOURNEY.md` - POS operational journey and terminal safety contract.

External regulator inputs to verify before implementation and again before filing:
1. BIR RMO 24-2023 digest - CRM/POS accreditation and registration procedures.
2. BIR RR 7-2024 - invoicing requirements under the EOPT Act.
3. BIR RMC 72-2025 and any newer BIR issuances affecting CRM/POS accreditation validity.
4. BIR eAccReg, eSales, and ORUS/TRRA operational instructions applicable to the final filing path.

## Current-State Summary

The current system has a strong compliance foundation:
1. It separates `non_compliant_active`, `compliant_pending`, and `compliant_active`.
2. It blocks fiscal output outside `compliant_active`.
3. It requires verified artifacts, profile fields, required settings, peripherals, RMO filing readiness, and at least one verified fiscal terminal registration before compliant activation.
4. It persists POS transaction headers, transaction lines, VAT buckets, document type/context, discount snapshots, terminal identity, shift state, X/Z reading counters, fiscal document snapshots, fiscal event hash chains, and compliance package exports.
5. It exposes Settings > POS controls for fiscal terminal registration readiness, fiscal ledger integrity verification, and eSales package/status evidence.

The current system is internally prepared for the implemented RMO 24-2023 fiscal runtime controls, but it is not yet ready to claim full RMO 24-2023 compliance or BIR accreditation approval. Remaining blockers are formal filing evidence, legal/tax wording review, external BIR/PTU/ATG acceptance, special discount evidence policy, retention/inspection packaging, official eSales acknowledgement evidence, and reviewer sign-off.

## Architecture Classification

Change classification: `cross-boundary`.

Expected impacted surfaces:
1. `compliance` - policy packs, checklist, preflight, evidence, activation.
2. `pos` - checkout, invoice sequencing, receipt rendering, reprint, void/reversal, fiscal event stream.
3. `terminal` - terminal identity, MIN/machine identity, peripheral binding, X/Z readings.
4. `settings` - taxpayer, branch, BIR permit, supplier, software identity, retention, reporting configuration.
5. `reports` - e-journal, audit journal, sales readings, eSales/compliance exports.
6. `frontend` - Settings > Compliance, Settings > POS, POS checkout, receipt preview, terminal admin screens.
7. `database` - additive fiscal identity, buyer invoice, special discount, fiscal audit, sequence, and filing evidence schema.

ADR impact: `ADR 0025: BIR RMO 24-2023 Fiscal Document and Accreditation Closure` governs the first implementation slice. Update ADR 0007 if future slices change the fiscal/non-fiscal lifecycle contract.

Compliance declaration impact: every implementation slice touching POS, terminal, settings, payments, or compliance must include an impact declaration. Any compliance module change is `regulatory`; POS/settings/terminal work is at least `major`.

## Gap Register

### Main Gaps

| ID | Gap | Risk | Current State | Closure Direction |
|---|---|---:|---|---|
| RMO-G01 | Formal BIR accreditation/registration evidence is not represented as a complete filing lifecycle. | Critical | The app stores some accreditation fields and artifacts, but does not model filing batches, eAccReg status, PTU/ATG lifecycle, reviewer sign-off, or final approval evidence end-to-end. | Add filing lifecycle records, verified artifact requirements, status transitions, approver metadata, and activation blockers tied to actual accreditation evidence. |
| RMO-G02 | Fiscal receipt/invoice content still needs final legal wording review. | Critical | Fiscal checkout now persists server-owned document snapshots with buyer, seller, software, terminal, VAT/discount, template version, and hash evidence. | Complete external/legal review of exact fiscal wording and sample-pack acceptance; keep server snapshot contract as the internal source of truth. |
| RMO-G03 | Buyer/customer fiscal profile capture is implemented internally but needs policy confirmation for mandatory scenarios. | High | Fiscal checkout can persist buyer name, TIN, business style, and address, and settings can require buyer fiscal details. | Confirm when buyer details are mandatory per tenant tax type and filing authority guidance. |
| RMO-G04 | Machine/software identity is implemented internally but still depends on external filing evidence. | Critical | Verified fiscal terminal registrations store MIN, machine serial, software version/serial, PTU, bindings, evidence reference, and verification metadata. | Attach approved BIR/PTU/ATG evidence and practitioner sign-off before treating a terminal as externally accredited. |
| RMO-G05 | Tamper resistance is implemented as an internal hash-chain verifier; external/WORM proof remains open. | Critical | Fiscal events are sequenced and hash-chained; `/pos/fiscal-ledger/integrity` recomputes hashes and reports sequence/linkage issues. | Add external notarization, WORM storage, or signed inspection export if the filing authority requires stronger non-volatile proof. |
| RMO-G06 | X/Z readings and accumulated grand total need stricter fiscal semantics. | High | X/Z counters and lifetime grand total exist; current naming and increment behavior need legal and accounting review. | Split or rename counters as needed: fiscal lifetime total, all-sales total, void/reversal totals, reset counter, Z counter, terminal-level totals, and per-business-date snapshots. |
| RMO-G07 | Reprint, void, cancellation, refund, and correction rules are implemented internally except external payment settlement. | High | Original/reprint evidence, reprint reasons, fiscal void lifecycle, void event hash linkage, and POS stock-return movements are implemented. | Confirm final reversal/correction document wording and integrate payment-provider refund settlement where provider workflows exist. |
| RMO-G08 | Special discount evidence is incomplete. | High | Special discount category, name, and ID number are captured for senior/PWD/national athlete style discounts. | Add required beneficiary fields, VAT-exempt treatment where applicable, signature/evidence capture strategy, discount law basis, and compliance package rows. |
| RMO-G09 | eSales package/status tracking is implemented internally; official submission remains external. | High | Monthly Asia/Manila eSales packages store payloads, hashes, gross/voided/net totals, and submitted/accepted/rejected evidence references. | Connect to the approved filing channel or retain official acknowledgement evidence from the external submission process. |
| RMO-G10 | Retention, backup, and inspection evidence is incomplete for fiscal records. | High | Backup/DR docs and compliance evidence exist. | Add fiscal retention policy, restore drill acceptance for fiscal records, export encryption checks, inspection package generation, and access logs. |
| RMO-G11 | Receipt rendering is still client-rendered for critical fiscal content. | High | React receipt view renders printable content from transaction/settings payloads. | Introduce server-controlled fiscal receipt rendering contract or server-generated immutable receipt payloads with versioned templates and checksums. |
| RMO-G12 | Submission packet is incomplete for accreditation readiness. | Critical | Submission docs exist, but sign-off remains pending and does not include complete RMO conformance evidence. | Build a formal filing packet: conformance matrix, screenshots, flow diagrams, specs, test results, checksum manifest, reviewer sign-off, and legal/compliance approval. |

### Minor Gaps And Cleanup Items

| ID | Gap | Risk | Closure Direction |
|---|---|---:|---|
| RMO-M01 | Terminology mixes "receipt", "invoice", "official receipt", "fiscal invoice", and "non-fiscal slip". | Medium | Normalize copy and data labels using current BIR/EOPT terminology after legal review. |
| RMO-M02 | Free-text receipt footer could be used to carry required legal fields. | Medium | Move all required fields into structured, validated settings and keep footer non-authoritative. |
| RMO-M03 | Frontend fallback infers fiscal document type from `INV-` prefix. | Medium | Require explicit server-provided `document_type` and treat prefix inference as legacy display only. |
| RMO-M04 | POS settings group does not distinguish tenant-level taxpayer identity from terminal/facility identity. | Medium | Split settings UI into taxpayer, branch/facility, terminal, permit, and software sections. |
| RMO-M05 | Monetary precision uses internal four-decimal snapshots but printed values are two-decimal PHP. | Low | Define reconciliation rounding policy and prove printed totals reconcile to persisted snapshots. |
| RMO-M06 | Compliance source verification cadence exists, but RMO-specific evidence ownership is not explicit. | Medium | Add named owner, monthly source verification task, and stale-source release blocker. |
| RMO-M07 | Non-fiscal mode could be misunderstood by tenants as legally compliant fiscal output. | Medium | Strengthen non-fiscal UX copy, onboarding warnings, and receipt labels without blocking operational POS use. |
| RMO-M08 | Accreditation fields are too generic. | Medium | Replace/augment generic fields with exact BIR filing identifiers, validity dates, and artifact links. |
| RMO-M09 | Report exports need reviewer-friendly manifests. | Medium | Add signed checksum manifests and export previews for all filing/report packages. |

## Delivery Strategy

Use additive, gated, reversible slices. Do not convert tenants to `compliant_active` automatically. Do not change existing non-fiscal POS behavior except to make non-fiscal status clearer and safer.

### Phase 0 - Legal Source Lock And ADR

Objective: Freeze the implementation target before code changes.

Tasks:
1. Verify the latest BIR source chain: RMO 24-2023, RR 7-2024, RMC 72-2025, eAccReg instructions, eSales instructions, and any newer issuer guidance.
2. Determine whether DGFY is filing as a software provider, whether each tenant separately registers POS terminals, and whether subscription-based e-invoicing/e-receipting requires ATG rather than ordinary PTU registration.
3. Create ADR 0025 with:
   - fiscal document terminology;
   - accreditation lifecycle;
   - tenant vs provider responsibility split;
   - terminal registration model;
   - receipt rendering ownership;
   - fiscal event immutability model;
   - eSales/export posture;
   - rollback and downgrade rules.
4. Update `docs/compliance/ph-pos-software-developer-compliance-guide.md`, `docs/compliance/control-matrix.md`, and `docs/api/specification.md` with the chosen target.
5. Add compliance impact declaration for the planning and ADR change.

Exit criteria:
1. ADR accepted.
2. Compliance lead and PH tax practitioner sign-off recorded.
3. `npm run lint:docs`, `npm run check:architecture`, and `npm run check:compliance` pass.

### Phase 1 - RMO Requirement Matrix And Filing Evidence Model

Objective: Turn RMO requirements into testable product controls.

Tasks:
1. Add `docs/compliance/rmo-24-2023-control-matrix.md` with requirement IDs, source references, current support, target support, code owner, evidence owner, and acceptance tests.
2. Add filing lifecycle schema:
   - filing batch;
   - eAccReg account/enrollment metadata;
   - software accreditation status;
   - PTU/ATG records;
   - reviewer sign-off;
   - evidence artifact checksums;
   - status history.
3. Extend compliance checklist and final review to block `compliant_active` until required filing records are verified.
4. Add admin review APIs for filing status and verification.

Exit criteria:
1. Every RMO requirement has a mapped control, deliberate deferral, or explicit not-applicable decision.
2. No tenant can activate fiscal mode without a verified filing batch and required permit evidence.
3. Compliance checklist explains exactly what remains missing.

### Phase 2 - Fiscal Identity And Terminal Registration

Objective: Persist all fiscal identity needed by invoices, terminals, and registration.

Tasks:
1. Add structured taxpayer/facility settings:
   - registered taxpayer name;
   - business name/style;
   - VAT or non-VAT status;
   - TIN and branch code;
   - registered address;
   - facility/branch identity;
   - BIR registration date if required by final source review.
2. Add terminal fiscal registry:
   - terminal ID;
   - MIN;
   - machine serial number;
   - software version/license/serial;
   - PTU or ATG reference;
   - permit issue/effectivity dates;
   - receipt printer binding;
   - cash drawer binding;
   - accreditation status and evidence link.
3. Add software provider/accredited supplier records:
   - registered supplier/provider name;
   - address;
   - TIN;
   - accreditation number;
   - date issued;
   - valid until;
   - artifact reference.
4. Update Settings UI with separate taxpayer, branch/facility, terminal, software provider, and permit sections.
5. Keep all fields additive and nullable until activation; fail closed only for `compliant_active`.

Exit criteria:
1. Settings validation prevents incomplete fiscal identity in `compliant_active`.
2. Terminal selection resolves to exactly one verified fiscal terminal profile.
3. Strict terminal-location binding and terminal fiscal registration do not conflict.

Implementation status as of 2026-06-01:
1. Foundation implemented for structured taxpayer/software settings: registered name, business name/style, taxpayer type, TIN/branch, address, PTU, MIN, accreditation, software name/version/serial.
2. Settings UI can capture these fields under POS metadata.
3. Fiscal terminal registration persistence and verified-terminal enforcement are implemented for fiscal invoices.
4. Final terminal-to-BIR filing interpretation remains external.

### Phase 3 - Fiscal Buyer, Discount, And Invoice Data Capture

Objective: Capture the data needed before fiscal invoice issuance.

Tasks:
1. Add buyer fiscal profile fields to POS checkout:
   - buyer/customer name;
   - buyer TIN;
   - buyer business style;
   - buyer address;
   - optional email/phone/account link.
2. Add rule engine for when buyer details are required, configurable only by policy pack after legal review.
3. Extend special discount capture:
   - category;
   - beneficiary name;
   - ID number;
   - TIN where applicable;
   - signature/evidence strategy;
   - law basis;
   - VAT-exempt allocation and discount computation snapshots.
4. Reject fiscal checkout when required buyer or discount evidence is missing.
5. Preserve non-fiscal checkout behavior except for clearer warnings and optional buyer profile capture.

Exit criteria:
1. Fiscal checkout cannot complete with missing required buyer or special discount evidence.
2. Persisted transaction snapshots are enough to re-render the fiscal document without reading mutable customer/item records.
3. Tests cover no-buyer, invalid TIN, missing discount ID, missing signature/evidence, and valid fiscal issuance paths.

Implementation status as of 2026-06-01:
1. Foundation implemented for optional POS buyer fiscal capture: buyer name, TIN, business style, and address.
2. Buyer fiscal fields are included in checkout payloads, persisted on `pos_transactions`, and included in fiscal document snapshots.
3. Mandatory buyer capture can be enabled with `pos_fiscal_buyer_details_required`.
4. Exact legal trigger rules and stricter TIN validation remain gated pending legal/tax practitioner review.

### Phase 4 - Server-Owned Fiscal Document Contract

Objective: Make fiscal document output deterministic, versioned, and auditable.

Tasks:
1. Add a server-generated fiscal document payload at checkout time:
   - fiscal document template version;
   - all seller, terminal, buyer, line, VAT, discount, and permit fields;
   - checksum/hash;
   - print eligibility state.
2. Store immutable fiscal document payloads separate from mutable React view state.
3. Update receipt rendering to consume the server payload for fiscal documents.
4. Add explicit reprint behavior:
   - first print vs reprint;
   - reprint marker;
   - actor, reason, timestamp;
   - immutable event record.
5. Add void/reversal document behavior instead of destructive mutation.
6. Lock fiscal invoice sequence policy:
   - no gaps caused by failed transactions;
   - no reuse;
   - clear handling for voids/reversals;
   - terminal/facility scoping if required by legal review.

Implementation status as of 2026-06-01:
1. Foundation implemented for fiscal invoice checkout: server-owned fiscal document snapshot, template version, and SHA-256 hash are stored on `pos_transactions`.
2. Receipt rendering now prefers the server snapshot for fiscal seller/buyer/software fields and displays the fiscal document hash prefix.
3. Fiscal print/reprint events, reprint reasons, fiscal void lifecycle state, void fiscal events, and POS stock-return movements are implemented.
4. Reversal/correction document wording and payment-provider refund settlement remain pending external/legal or provider confirmation.

### Phase 5 - Fiscal Event Ledger And eSales Internal Package

Implementation status as of 2026-06-01:
1. Append-only fiscal event ledger implemented for issuance, print/reprint, void, Z-reading, governed reset, terminal registration, eSales package generation, and eSales status changes.
2. Monthly eSales package generation implemented with payload hash, gross/voided/net totals, stored report record, and status evidence references.
3. Fiscal ledger integrity verification is available through `/pos/fiscal-ledger/integrity` and Settings > POS.
4. Official eSales submission acknowledgement remains external evidence unless a filing-channel integration is added later.

Exit criteria:
1. Fiscal receipt content has a stable snapshot and checksum.
2. Reprints and reversals are auditable and cannot mutate the original fiscal document.
3. Receipt UI displays only server-authoritative fiscal fields.

### Phase 5 - Fiscal Event Ledger, E-Journal, And Tamper Resistance

Objective: Prove non-volatile, tamper-resistant fiscal records.

Tasks:
1. Add append-only fiscal event ledger:
   - checkout issued;
   - print;
   - reprint;
   - void/reversal;
   - X reading;
   - Z reading;
   - governed reset;
   - export/submission.
2. Add hash-chain or checksum sequence per tenant and terminal.
3. Add DB triggers or repository constraints to block update/delete of fiscal documents, fiscal event rows, and Z-reading snapshots.
4. Integrity verification endpoint and Settings panel are implemented; scheduled health checks remain a future operational automation.
5. Add security audit events for privileged fiscal actions.
6. Review database user permissions so application runtime cannot bypass append-only policy casually.

Exit criteria:
1. Attempts to update/delete fiscal rows fail in tests.
2. Integrity audit detects tampering or missing event sequence.
3. Compliance checklist blocks activation if append-only enforcement or integrity audit is degraded.

### Phase 6 - X/Z Readings, Accumulators, And Sales Reporting

Objective: Make fiscal readings and sales reporting complete and reviewer-ready.

Tasks:
1. Reconcile accumulator semantics:
   - fiscal lifetime grand total;
   - all-sales lifetime total if needed;
   - void/reversal totals;
   - VAT totals;
   - non-VAT totals;
   - discount totals;
   - terminal-specific counters;
   - tenant/facility counters.
2. Update X-reading and Z-reading payloads with all required totals.
3. Prevent duplicate Z-reading closure for the same terminal/business date unless governed reset policy applies.
4. eSales-ready monthly package is implemented with:
   - TIN;
   - branch;
   - month;
   - year;
   - MIN;
   - last invoice/receipt number;
   - sales details;
   - checksum;
   - generated-by and generated-at.
5. Submission status tracking and evidence references are implemented; direct evidence-file upload and filing-channel integration remain future work.

Exit criteria:
1. X/Z readings reconcile to transaction ledger totals.
2. Monthly eSales export reconciles to Z readings and fiscal event ledger.
3. Export files include manifests and are reproducible from immutable fiscal records.

### Phase 7 - Retention, Backup, Restore, And Inspection Package

Objective: Make fiscal evidence durable and inspectable.

Tasks:
1. Define retention policy for fiscal records and generated documents.
2. Add fiscal inspection package export:
   - fiscal documents;
   - event ledger;
   - X/Z readings;
   - eSales exports;
   - settings snapshots;
   - filing evidence;
   - checksum manifest.
3. Add encrypted export and backup evidence checks.
4. Add restore drill focused on fiscal document and event ledger integrity.
5. Update operations runbooks with inspection/export procedure.

Exit criteria:
1. Restore drill proves fiscal records, hashes, settings snapshots, and reports survive recovery.
2. Inspection package can be generated by authorized users only.
3. Access to inspection exports is audited.

### Phase 8 - Frontend Hardening And Operator Workflows

Objective: Make compliance-safe workflows usable without hiding risk.

Tasks:
1. Update Settings > Compliance with RMO-specific checklist sections.
2. Update Settings > POS with structured taxpayer, terminal, permit, software, and provider sections.
3. Update POS checkout with fiscal buyer and special discount evidence flows.
4. Update terminal admin surfaces to show terminal registration and activation blockers.
5. Update receipt preview and history with explicit original/reprint/void/reversal markers.
6. Add warnings that non-fiscal output is not BIR fiscal issuance.
7. Use separate submit boundaries for settings, compliance artifact review, terminal registration, and fiscal activation.

Exit criteria:
1. UI tests prove adjacent forms do not submit each other accidentally.
2. Rendered browser checks cover Settings, POS checkout, fiscal receipt preview, history reprint, desktop, and mobile.
3. Operators can identify the next blocking compliance step without reading logs.

### Phase 9 - Validation, Security Review, And Filing Rehearsal

Objective: Prove the implementation before production fiscal activation.

Required automated gates:
1. `npm run lint:docs`
2. `npm run check:architecture`
3. `npm run check:compliance`
4. Backend compliance, POS, reports, settings, and migration tests.
5. Frontend POS/settings/compliance tests.
6. Build all affected surfaces.
7. Fiscal integrity audit.
8. eSales export reconciliation test.
9. Restore drill for fiscal evidence.

Required manual/review gates:
1. PH tax practitioner review of final requirement matrix and receipt samples.
2. Security review of append-only controls, admin permissions, and export access.
3. Filing rehearsal using a non-production tenant and non-production data.
4. Compliance lead sign-off.
5. Product owner sign-off that non-fiscal tenants are not disrupted.

Exit criteria:
1. All automated gates pass.
2. Filing packet has checksum manifest and signed review metadata.
3. Residual risks are documented in `docs/compliance/evidence/residual-risk-closure-matrix.md`.

### Phase 10 - Production Rollout

Objective: Release safely without accidentally issuing fiscal documents.

Rollout order:
1. Deploy additive schema and non-fiscal-safe UI first.
2. Enable filing evidence collection for internal/test tenants only.
3. Enable `compliant_pending` workflow for pilot tenants.
4. Run shadow fiscal document generation without allowing fiscal issuance.
5. Complete filing/accreditation evidence for pilot.
6. Enable `compliant_active` only for reviewed and approved tenants.
7. Monitor fiscal event ledger, X/Z readings, eSales export, integrity audit, and receipt rendering.

Rollback posture:
1. Non-fiscal POS must remain operational.
2. Fiscal issuance can be disabled tenant-by-tenant through governed downgrade paths.
3. No rollback may delete fiscal documents, event ledger rows, filing artifacts, or Z-reading snapshots.
4. If fiscal output is disabled, continue to preserve and inspect existing fiscal records.

Exit criteria:
1. Production deploy proves code/version parity.
2. Pilot tenant fiscal activation has live smoke evidence.
3. Health checks include fiscal integrity status.
4. Support runbook has incident steps for fiscal issuance block, terminal mismatch, export failure, and integrity audit failure.

## Security Requirements

1. Fiscal records are append-only after issuance.
2. Any correction is a new reversal/correction event, never an edit to the original fiscal document.
3. Fiscal document payloads and filing exports have checksums.
4. Privileged fiscal actions require explicit permissions and reason capture.
5. Compliance artifact review is verification-based, not tenant self-attestation.
6. Export downloads are audited and access-controlled.
7. Fiscal record backup and restore are tested before activation.
8. Secrets used for external filing or transmission are not stored in fiscal documents or logs.
9. Integrity audit degradation blocks `compliant_active`.
10. Non-fiscal tenants cannot request or render fiscal document context.

## Testing Matrix

| Area | Required Coverage |
|---|---|
| Policy engine | Non-compliant fiscal block, compliant-pending fiscal block, compliant-active allow, missing filing evidence block, missing terminal evidence block. |
| Checkout | Fiscal buyer required, special discount required fields, invalid terminal, invalid permit, idempotency replay, sequence behavior, void/reversal behavior. |
| Receipt rendering | All required fields, non-fiscal warnings, fiscal labels, reprint markers, server payload checksum, print from history. |
| Ledger integrity | Append-only DB guards, hash-chain validation, tamper detection, missing event detection. |
| X/Z readings | Reconciliation to fiscal transactions, duplicate close block, reset trail, terminal/day scoping. |
| eSales/export | Monthly export schema, last invoice number, totals reconciliation, checksum manifest, submission evidence. |
| Settings UI | Structured sections, separate submit boundaries, validation and blocker copy. |
| Reports | Compliance package includes fiscal documents, sales journals, special discount journal, eSales package, manifests. |
| Backup/restore | Restored records preserve documents, ledger hashes, Z readings, artifacts, and manifests. |
| Security | RBAC denial, audit events, export access logging, no secret leakage. |

## Documentation Updates Required

1. New ADR 0025.
2. Update ADR 0007 if lifecycle or receipt contract changes.
3. Update `docs/compliance/ph-pos-software-developer-compliance-guide.md`.
4. Update `docs/compliance/control-matrix.md`.
5. Add `docs/compliance/rmo-24-2023-control-matrix.md`.
6. Update `docs/compliance/evidence/open-controls-matrix.md`.
7. Update `docs/compliance/evidence/residual-risk-closure-matrix.md`.
8. Update `docs/api/specification.md`.
9. Update `docs/database/schema.md`.
10. Update `docs/features/IMS_POS_SALES_UX_JOURNEY.md`.
11. Update submission packet docs under `docs/compliance/submission/`.
12. Add impact declarations per implementation slice.

## Open Decisions

These must be resolved before implementation:
1. Is the filing target ordinary POS/CRM software accreditation, subscription-based e-invoicing/e-receipting ATG, tenant POS terminal PTU, or a combination?
2. Which entity is the accredited software provider for filing: DGFY/SKUpervisor, each tenant, or both in different roles?
3. What exact fiscal document terminology must be used after RR 7-2024 for each tenant tax type?
4. When are buyer TIN, address, and business style mandatory in POS checkout?
5. What is the required signature/evidence model for special discounts in the deployed operating context?
6. Does the final filing require online transmission, eSales export only, or both?
7. What hardware/peripheral certification evidence is required for each supported terminal deployment model?
8. What retention period and inspection format will the compliance lead approve for production fiscal records?

## Non-Negotiable Acceptance Criteria

1. The app must not advertise or imply BIR-accredited fiscal issuance until filing evidence is complete and reviewed.
2. No tenant reaches `compliant_active` without verified filing evidence, required settings, terminal registration, artifact review, readiness tests, and append-only fiscal controls.
3. Non-compliant and compliant-pending tenants issue only non-fiscal documents.
4. Fiscal documents must be server-authoritative, immutable, complete, reproducible, and checksum-verifiable.
5. Fiscal reprints, voids, reversals, resets, readings, and exports must be auditable events.
6. X/Z readings and eSales/compliance exports must reconcile to immutable fiscal records.
7. Compliance-sensitive implementation must pass docs, architecture, compliance, test, build, rendered UI, security, and restore gates before production activation.
8. Production rollout must be tenant-gated and reversible only through governed downgrade controls, never by deleting fiscal records.
