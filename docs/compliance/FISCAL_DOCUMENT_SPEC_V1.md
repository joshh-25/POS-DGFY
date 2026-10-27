---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-10-26
applies_to: opis_pos_fiscal_document_contract
topic: fiscal_document_specification_v1
related_adr: 0007-dual-mode-pos-compliance-program.md,0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md,0033-commercial-promo-and-statutory-pos-discount-boundaries.md,0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md,0045-shared-pos-receipt-renderer.md
---

# Fiscal Document Specification v1 — DRAFT / NOT APPROVED

Date: 2026-10-26

This document is a Step 02 working draft for review by the product owner and a qualified
Philippine tax/accounting reviewer. It is not legal advice, a BIR approval, or permission to
invent or silently infer fiscal fields. `OPEN` decisions must be resolved before fiscal
behavior is implemented or release evidence is marked complete.

## 1. Existing contracts that remain binding

The implementation must preserve these repository decisions:

1. POS compliance mode is explicit: `non_compliant_active`, `compliant_pending`, or
   `compliant_active`. Non-compliant output is a `non_fiscal_slip`; fiscal output requires
   the server-owned `fiscal_invoice`/`fiscal` contract and compliant activation.
2. Fiscal status is never inferred from invoice-number prefixes. Print surfaces consume
   server-provided `document_type` and `document_context`.
3. Fiscal activation requires the RMO closure controls and a verified fiscal terminal
   registration. External accreditation and approval remain outside code-only validation.
4. Browser and native/thermal output consume the shared `@sieitzz/pos-receipt` contract;
   adapters may change layout but not monetary or identity facts.
5. Offline checkout remains constrained by the existing offline contract: a provisional
   pending-sync result is not a final fiscal invoice, replay is operator-controlled, and
   server idempotency remains authoritative.
6. New back-office configuration and evidence work belongs in OPIS; POS remains the
   terminal-operation surface.

## 2. Decisions required before implementation

| Area | Required decision | Status / owner |
|---|---|---|
| Accreditation category | Standalone POS, bundled POS, or other; exact registered product name | OPEN — tax/compliance reviewer |
| Release identity | Software name, version format, exact release/SHA, terminal identity format | OPEN — product/compliance |
| Supported hardware | Supported terminal models, printer models, paper widths, firmware/OS/browser matrix | OPEN — device/QA |
| Taxpayer classification | Approved VAT/non-VAT enum and configuration-change authority | OPEN — tax reviewer |
| Business identity | Required legal name, TIN/branch fields, address, and display/format rules | OPEN — tax reviewer |
| Fiscal identifiers | Which MIN/PTU/ATP or other identifiers apply to this deployment | OPEN — tax reviewer; never fabricate |
| Numbering | Issuing authority, tenant/branch/terminal scope, sequence allocation, gaps, retries, reprints | OPEN — tax/compliance reviewer |
| Invoice labels | Exact labels for invoice, non-fiscal slip, order slip, void, return, and refund | OPEN — tax reviewer |
| CWT | Whether creditable withholding tax applies, affected taxpayers, calculation, effective date, and display | OPEN — tax reviewer |
| Discounts | Supported statutory/commercial categories, eligibility evidence, rates, VAT effect, stacking, and roles | OPEN — tax reviewer/product |
| Charges | Supported fees/service charges and tax treatment | OPEN — product/tax reviewer |
| Adjustments | Void/return/full refund/partial refund semantics, numbering, cross-reference, reasons, and print labels | OPEN — tax/accounting reviewer |
| X/Z | Scope, timezone/day boundary, inclusion/exclusion rules, and approved totals | OPEN — finance/product |
| eJournal/eSales | Exact `.txt`/package format, ordering, hash/manifest fields, statuses, and submission workflow | OPEN — finance/compliance |
| Offline | Whether any offline document is acceptable for the intended accreditation and how it is labelled | OPEN — tax/compliance reviewer |
| Reprint | Approved reprint wording, reason capture, and whether a print event is required | OPEN — tax/compliance reviewer |

## 3. Target canonical document model

The backend must be the only authority for financial and tax facts. The eventual versioned
model must include, at minimum, the approved values for:

- immutable original transaction and line snapshots;
- calculated tax, discount, charge, tender, and adjustment values;
- business, branch, terminal, software/version, and taxpayer identity snapshots;
- `document_type`, `document_context`, document number, status, and sequence scope;
- original-document references for adjustments;
- idempotency/replay identity and print/reprint event references;
- journal/report inclusion status and evidence hash/manifest fields where approved.

No field above becomes a required database column solely because it appears in this draft.
Schema changes require the approved specification, additive migration design, tenant-schema
coverage, rollback notes, and database tests.

## 4. Required approved examples

The reviewer must approve redacted examples for:

1. regular VAT sale;
2. regular non-VAT sale;
3. each enabled statutory discount;
4. each enabled commercial discount or voucher;
5. approved fees/charges;
6. cancel-before-issuance, void, return, full refund, and partial refund;
7. X-reading and Z-reading for one controlled branch/terminal/day;
8. eJournal/eSales export and rejected/accepted status evidence;
9. online sale, offline provisional sale, replay success, and replay conflict;
10. browser, 80mm, 57mm, and supported native printer output where applicable.

## 5. Gate G1

G1 is **NOT COMPLETE** until the open decisions are resolved, examples are approved, the
tax/accounting reviewer is identified, and the final document is versioned with the exact
release and policy assumptions. Until then, engineering may perform source inspection and
contract tests, but must not add statutory rates, identifiers, or legal eligibility behavior.
