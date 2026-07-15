# Phase 9: POS Checkout & Payment - Discussion Log

**Session Date:** 2026-07-13
**Facilitator:** Claude Code
**Participant:** User (Project Lead)

---

## Discussion Summary

Four core implementation areas were discussed interactively to lock down decisions for Phase 9 planning:

### 1. Availment Workflow & Line Editing

**Gray Area:** How flexible should line-item editing be before finalizing an Availment?

| Area | Decision | Rationale |
|------|----------|-----------|
| **Editing flexibility** | Flexible add/remove/modify before finalize | Staff workflow at most POS systems allows unrestricted changes up to the point of ringing up. Matches user's mental model of "add items → adjust → ring up → finalize." |
| **Removal semantics** | Soft-delete with re-add option | Provides audit trail (visible what was removed/when) and safety net for staff (can restore without re-entering). Aligns with append-only principle from Phase 8. |
| **Stock effect per-line** | Changeable anytime before finalize | Staff need flexibility for staff meals, promos, manual overrides without separate transaction workflows. |

**Locked Decisions:** D-01, D-02, D-03

---

### 2. Discount Composition (Code + Manual + SC/PWD)

**Gray Area:** Can discounts stack, and how should they be calculated?

| Area | Decision | Rationale |
|------|----------|-----------|
| **Stacking** | All three discount types stack together | Real-world use case: a customer with a promo code who is also SC/PWD should get both benefits, not one-or-the-other. |
| **Calculation order** | Independent calculation, sum them | Simpler to compute and explain than cascading. Each discount calculates 20% off the base subtotal independently, then all are subtracted. Slightly more generous to customer (immaterial at current scale). |
| **SC/PWD verification** | Verify via ID (optimistic scan + manual fallback) | Real-world Philippine retail standard: SC/PWD discounts require ID verification. Implementation allows POS camera scan (if available) with fallback to manual ID-number entry. Customer name optional (to be confirmed later). Stores verified ID for audit trail. |

**Locked Decisions:** D-04, D-05, D-06 (clarified with scan-first, fallback-second approach)

---

### 3. Payment Methods & Change Handling

**Gray Area:** Should Phase 9 support split-tender, and how to handle cash change?

| Area | Decision | Rationale |
|------|----------|-----------|
| **Payment methods** | Single method per Availment; split-tender deferred | MVP scope: one payment per transaction (Cash, GCash, or Credit Card). Split-tender adds complexity; deferred to Phase 11+. Design for extensibility by keeping Payment as separate entity. |
| **Change computation** | Server-side automatic (`change_due = cash_received - total`) | Client cannot submit arbitrary change amount. Ensures correctness and prevents staff/customer disputes. Only applies to Cash; GCash/Credit Card settle exact amount. |

**Locked Decisions:** D-08, D-09, D-10

---

### 4. Receipt Generation & Tax Computation

**Gray Area:** How should receipts be generated, stored, and taxed?

| Area | Decision | Rationale |
|------|----------|-----------|
| **Generation timing** | Synchronous at finalization | Staff need immediate feedback (receipt printed) before handing change to customer. Async would leave a gap where transaction is recorded but staff doesn't know if printer succeeded. |
| **Storage** | Store Receipt records + generate on-demand for audit | Fast lookup for reprints/customer inquiries; regenerate on-demand to audit against underlying Availment data. Immutable records (append-only ledger). |
| **Tax computation** | Per-item hierarchical structure, currently uniform 12% VAT | Schema/model built to support category-based rates (Food/Service/Retail different rates later). Phase 9 implements all products at 12% VAT for simplicity. Anticipated future enhancement without schema changes. |
| **Receipt content** | All mandatory fields per D-14 (line items, discounts, tax, payment, change, compliance mode) | Includes everything staff and auditors need for transaction audit and customer inquiries. |

**Locked Decisions:** D-11, D-12, D-13, D-14

---

## Open Questions Resolved During Discussion

1. **SC/PWD Verification Approach (D-06, User Clarification)**
   - Initial answer: "Trust staff, no verification"
   - User clarified: Real-world retail validates SC/PWD with ID; should use ID verification
   - Resolution: Optimistic ID scan (if camera available) with fallback to manual entry; store ID number and optional customer name for audit

---

## Deferred Ideas (Explicitly Out of Scope, Not Rejected)

- Split-tender (multiple payment methods per Availment) — Phase 11+
- Live payment gateway capture/settlement — out of MVP scope
- MEMC group-meal 5% loyalty discount — future discount type
- Automatic compliance-state transition — Phase 8 deferred; Phase 9 doesn't revisit
- Availment cancellation/refunds — separate workflow, not Phase 9
- Per-category tax rates beyond uniform VAT — Phase 11+ enhancement

---

## Integration Touchpoints Confirmed

- **Phase 8's Compliance Gate Port (D-15):** Availment finalization calls `assertComplianceGate` with `requestedDocumentContext` (Fiscal/Non-Fiscal).
- **Phase 8's Shift Precondition (D-16):** Availment finalization requires an open shift for cashier+terminal (enforced via Phase 8's DB-level constraint).
- **Phase 8's Inventory Ledger (D-17):** Finalization creates `INVENTORY_MOVEMENT` rows for lines with `stock_effect_type = 'inventory_issue'` through `modules/inventory` (single-writer contract, ADR 0029).

---

## What's Ready for Planning

✓ Phase boundary and scope locked  
✓ All four gray areas discussed and decided  
✓ Integration points with Phase 8 confirmed  
✓ Deferred ideas captured (not lost, not acted on)  
✓ Canonical references identified for researcher/planner  

**Next Steps:**
1. `/gsd-plan-phase 9` to begin detailed planning
2. Planner will make granular implementation calls (exact endpoint names, schema details, error handling) using the locked decisions as guardrails
3. Researcher will validate any assumptions about legacy precedent or domain rules before planning

---

*Discussion log created: 2026-07-13*
