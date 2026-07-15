# Phase 12: Scope Unblock + Schema Extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 12-Scope Unblock + Schema Extension
**Areas discussed:** Satellite-table folding & BOM scope, products typed columns & attributes shape, product_embeddings cardinality, inventory_movements natural key & ADR 0029 amendment scope

---

## Satellite-Table Folding & BOM Scope

### Q1: How should product_composition/BOM entries reference their ingredient?

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve to migrated product_id | attributes.composition entries point at the ingredient's new products.id via legacy_id_map; unresolved ingredients get a finding logged | ✓ |
| Self-contained snapshot | Bake in ingredient name/legacy item_id/quantity at migration time | |
| You decide | Defer to Phase 13 research/planning | |

**User's choice:** Resolve to migrated product_id (recommended)

### Q2: How should the 8 satellite tables be organized inside products.attributes JSON?

| Option | Description | Selected |
|--------|-------------|----------|
| Namespaced by domain | One key per legacy satellite table (attributes.nutrition, attributes.allergens, etc.) | ✓ |
| Flat merged object | All satellite fields merged into one flat object | |
| You decide | Defer to Phase 13 planning | |

**User's choice:** Namespaced by domain (recommended)

### Q3: How should absent satellite data be represented?

| Option | Description | Selected |
|--------|-------------|----------|
| Omit the key entirely | No 'nutrition' key at all if no legacy row existed | ✓ |
| Always include with null/empty | attributes.nutrition: null even when absent | |

**User's choice:** Omit the key entirely (recommended)

---

## Products Typed Columns & Attributes Shape

### Q1: Should products.sku_code enforce uniqueness?

| Option | Description | Selected |
|--------|-------------|----------|
| Unique per business | Composite unique index on (business_id, sku_code), NULLs allowed | |
| No uniqueness constraint | Match legacy exactly — plain index only | ✓ |
| You decide | Defer to Phase 13 planning | |

**User's choice:** No uniqueness constraint (matches legacy behavior exactly)

### Q2: What precision should cost_per_unit use?

| Option | Description | Selected |
|--------|-------------|----------|
| DECIMAL(14,4) — match base_price | Consistent with existing products money columns | ✓ |
| DECIMAL(10,4) — match legacy exactly | Byte-for-byte port of legacy column | |

**User's choice:** DECIMAL(14,4) — match base_price (recommended)

### Q3: Should vat_type reuse the legacy enum as-is?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same 3 values + default | ENUM('vatable','vat_exempt','zero_rated'), default 'vatable' | ✓ |
| You decide | Let Phase 13 research check fiscal-compliance terminology elsewhere first | |

**User's choice:** Yes, same 3 values + default (recommended)

---

## product_embeddings Cardinality

### Q1: What cardinality should product_embeddings use?

| Option | Description | Selected |
|--------|-------------|----------|
| One row per product, unique product_id | Matches legacy's existing strict 1:1 shape | ✓ |
| Per product per embedding-model-version | Adds a model_version dimension now for future re-embedding headroom | |

**User's choice:** One row per product, unique product_id (recommended)

---

## inventory_movements Natural Key & ADR 0029 Amendment Scope

### Q1: Should this phase retrofit organic movements' reference_type/reference_id?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave organic movements as NULL | Add the unique index only; Phase 8/9 usecases untouched | ✓ |
| Also retrofit organic movements | Backfill reference_type/id on every existing movement type | |

**User's choice:** Leave organic movements as NULL (recommended)

**Notes:** Confirmed via direct grep that `inventoryMovementUseCases.js` never sets `reference_type`/`reference_id` today — always NULL. MySQL unique index treats NULL tuples as distinct, so no collision with the new (business_id, reference_type, reference_id) index.

### Q2: What's the ADR 0029 amendment scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Amend both ADR 0029 and migration map Section 10 | Keeps both exclusion-list docs in sync | ✓ |
| Amend ADR 0029 only | Minimal LDM-01-literal scope; fix map doc drift later | |

**User's choice:** Amend both ADR 0029 and the migration map's Section 10 (recommended)

---

## Todo Cross-Reference

**Matched:** "Wrap compliance verification and state writes in one transaction" (`.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — score 0.7, generic keyword match on "verification"/"one", area: database.

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it separate | Not actually related to Phase 12's schema/ADR scope — recommended by Claude | |
| Fold into Phase 12 | Bundle the compliance transaction-wrapping fix into this phase | ✓ |

**User's choice:** Fold into Phase 12 (against Claude's recommendation — user explicitly wanted this closed now rather than left pending indefinitely, since it's marked "required before the milestone ships" in STATE.md with no other phase claiming it).

---

## Claude's Discretion

- Exact migration file naming/wave sequencing for the additive schema changes.
- `product_embeddings` vector storage column type/format (default: port legacy's TEXT-JSON-string shape).
- Whether/how to add a traceability pointer back to the legacy `embedding_id` on `product_embeddings` rows.

## Deferred Ideas

None — discussion stayed within phase scope (the one folded todo was pulled in, not deferred out).
