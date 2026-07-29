---
status: accepted
date: 2026-07-28
last_reviewed: 2026-07-28
classification: authoritative
---

# ADR 0040: QA Landlord Invoicing Boundary

## Context

DGFY platform access billing is landlord revenue and must never be represented as tenant POS revenue, inventory movement, or a tenant fiscal receipt. Current scope is QA-only validation of one-time cash billing.

## Decision

- Keep platform invoices, payments, and sequences in landlord tables, keyed to the approved/provisioned company-registration application.
- Persist centavo integers and immutable seller, buyer, service, and recipient snapshots. One original invoice exists per registration application.
- Support only one-time cash in QA. A draft is issued once; each cash payment appends a payment row, and later payments update only the balance of that original invoice.
- Use a database-locked, mode-specific sequence. QA numbers use `TEST-` and every artifact/UI must state that it is not a VAT invoice or input-tax document.
- Default to QA. Live issuance remains fail-closed until a non-dummy registered seller profile, authority/series, environment confirmation, legal sign-off, and separately approved live rollout exist.
- QA PDFs may use the supplied Sieitz branding and seller identity snapshot, but missing ATP/OCN, permit, approved-series, or CAS/EIS evidence must be explicit red `MISSING` placeholders alongside the TEST-only watermark. Placeholder values never satisfy the live gate.
- Do not connect this module to tenant POS, stock, payment webhooks, subscription billing, PayMongo marketplace settlement, or merchant fiscal documents.

## Consequences

- This ADR creates no claim of BIR accreditation, live fiscal compliance, or production invoice issuance.
- Issuance creates one immutable server-rendered PDF artifact in private local QA storage. The stored SHA-256 is verified before a privileged download or email attachment is served; email attempts are recorded with provider outcome and a resend cooldown.
- QA supports an append-only full-credit record and, only after that credit, a linked replacement draft that receives its own QA sequence when issued. The original document remains unchanged. Partial credits, payment reversals/refunds, void semantics, live-grade storage, and all live fiscal flows remain out of scope and fail closed.

## Validation

- Prove centavo/VAT math, change-return confirmation, draft/issue transition, additional cash-payment balance calculation, and concurrent sequence allocation.
- Prove unapproved/unprovisioned applications, duplicate originals, non-cash/recurring payloads, and live mode fail safely.
- Render a QA PDF, inspect its visual output, verify its digest before download, and prove the provider receives the exact stored attachment. Live/provider delivery remains separately gated.
