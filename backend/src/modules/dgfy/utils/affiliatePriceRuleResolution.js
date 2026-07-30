// Pure rule-resolution logic for the affiliate pricing rule engine (Phase 1) - see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md section 5. Kept separate from
// dgfyAffiliateRepository.js so the ordering itself is testable with plain fixture rows and no
// database (per the Phase 1 plan's Stage D verification requirement).
//
// Resolution order, most specific first:
//   1. Per-product rule for this enrollment           (Phase 2 - item_id != 0, enrollment_id != 0)
//   2. Per-product tenant template                     (Phase 2 - item_id != 0, enrollment_id == 0)
//   3. Per-enrollment rule, all products                (Phase 1 - item_id == 0, enrollment_id != 0)
//   4. Tenant template rule, all affiliates/products    (Phase 1 - item_id == 0, enrollment_id == 0)
//   5. No rule -> caller falls back to the catalog price / today's flat-rate commission
//
// Note the ordering is by ITEM specificity first, then enrollment specificity: a per-product
// template (level 2) outranks a per-enrollment, all-products rule (level 3), even though the
// per-enrollment rule matches "this affiliate" specifically. This matches the scope doc's stated
// priority list exactly, so a Phase 2 per-product override always wins over a Phase 1 per-affiliate
// blanket rule for the same item, regardless of which affiliate is selling it.
//
// Sentinel 0 means "applies to all" for both enrollment_id and item_id (see
// backend/migrations/20260729000003-add-affiliate-price-rules.cjs for why 0 rather than NULL).
// Phase 1 only ever writes/queries item_id = 0, so only levels 3-5 are exercised in practice; levels
// 1-2 are schema-ready and already correctly ordered for when Phase 2 starts writing item-specific
// rows.

const SENTINEL_ALL = 0;

// Item specificity outranks enrollment specificity (2 points vs 1), matching the priority list
// above. A tie is impossible in practice because of the table's UNIQUE (tenant_id, enrollment_id,
// item_id) constraint - two rows can never share both scope keys - but ties fall back to the first
// candidate encountered rather than throwing, since resolution must never fail closed on data it
// didn't cause.
const scoreCandidate = (row, { enrollmentId, itemId }) => {
    const rowEnrollmentId = Number(row?.enrollment_id ?? SENTINEL_ALL);
    const rowItemId = Number(row?.item_id ?? SENTINEL_ALL);

    const enrollmentMatches = rowEnrollmentId === Number(enrollmentId) || rowEnrollmentId === SENTINEL_ALL;
    const itemMatches = rowItemId === Number(itemId ?? SENTINEL_ALL) || rowItemId === SENTINEL_ALL;
    if (!enrollmentMatches || !itemMatches) return null;

    const itemSpecificityPoints = rowItemId !== SENTINEL_ALL ? 2 : 0;
    const enrollmentSpecificityPoints = rowEnrollmentId !== SENTINEL_ALL ? 1 : 0;
    return itemSpecificityPoints + enrollmentSpecificityPoints;
};

// resolvePriceRuleFromCandidates({ candidateRows, enrollmentId, itemId }) -> row | null
//
// candidateRows should already be filtered to `tenant_id` and `active = true` by the caller (the
// repository layer) - this function only handles the scope-matching and specificity ordering, not
// the tenant/active filtering, so it stays a pure function of its inputs.
export const resolvePriceRuleFromCandidates = ({ candidateRows = [], enrollmentId, itemId = SENTINEL_ALL } = {}) => {
    let best = null;
    let bestScore = -1;

    for (const row of candidateRows) {
        const score = scoreCandidate(row, { enrollmentId, itemId });
        if (score === null) continue;
        if (score > bestScore) {
            best = row;
            bestScore = score;
        }
    }

    return best;
};

// hasDuplicatePriceRuleScope(existingRows, { enrollmentId, itemId }) -> boolean
//
// Friendly pre-flight check before a write, so a conflicting rule surfaces as a clean validation
// error rather than a raw unique-constraint violation from MySQL. The unique index itself remains
// the actual guarantee - this is advisory only, and a caller should still handle the DB-level
// conflict (e.g. via findOrCreate) for correctness under concurrent writes.
export const hasDuplicatePriceRuleScope = (existingRows = [], { enrollmentId = SENTINEL_ALL, itemId = SENTINEL_ALL, excludePriceRuleId = null } = {}) => (
    existingRows.some((row) => (
        Number(row?.enrollment_id ?? SENTINEL_ALL) === Number(enrollmentId)
        && Number(row?.item_id ?? SENTINEL_ALL) === Number(itemId)
        && (excludePriceRuleId == null || String(row?.price_rule_id) !== String(excludePriceRuleId))
    ))
);

export default {
    resolvePriceRuleFromCandidates,
    hasDuplicatePriceRuleScope
};
