// #682: what the stock numbers on the Items page currently mean, given the selected branch and
// what the backend reported about whether its per-location overlay actually resolved. Pulled out
// of ItemsPage.jsx as a pure function so this decision logic is unit-testable without rendering
// the whole page. "All Locations" keeps the exact tenant-wide aggregate label; a branch selection
// either honestly reflects that branch's item_location_stocks (possibly a true zero) or, on a
// tenant whose schema doesn't support per-location stock yet, falls back to the aggregate with a
// distinct warning label -- these two must never look the same, or a legitimate zero could be
// misread as "we couldn't check".
export const resolveStockScope = ({
    selectedLocationId,
    selectedLocationName = '',
    locationScopeResolved = true
} = {}) => {
    if (selectedLocationId === 'all' || selectedLocationId == null) {
        return { label: 'All Locations (tenant-wide total)', isFallbackWarning: false, isBranchScoped: false };
    }
    if (locationScopeResolved === false) {
        return {
            label: 'Branch-level stock isn’t available for this tenant yet — showing tenant-wide totals',
            isFallbackWarning: true,
            isBranchScoped: false
        };
    }
    return {
        label: `Branch: ${selectedLocationName || '—'}`,
        isFallbackWarning: false,
        isBranchScoped: true
    };
};

// Only render the honest "no stock at this branch" hint when the numbers are actually
// branch-scoped (not during the schema-fallback case, where a bare 0 wouldn't be trustworthy).
export const getBranchZeroStockHint = (stockScope) => (
    stockScope?.isBranchScoped
        ? 'No stock at this branch — receive or transfer inventory to make it available here.'
        : null
);

// #682: the actual param-shape decision behind "selecting a branch adds location_id to the
// items query" -- pulled out so it's independently testable rather than trusted by inspection.
// 'all' (the default) omits location_id entirely, which is what keeps the request byte-identical
// to what this page sent before this change.
// #1495 Part A: includeInactive follows the same "omit unless meaningfully set" shape -- false
// (the default) keeps the request byte-identical to every pre-#1495 caller.
export const buildItemsListParams = ({ limit = 1000, selectedLocationId = 'all', includeInactive = false } = {}) => ({
    limit,
    ...(selectedLocationId !== 'all' ? { location_id: Number(selectedLocationId) } : {}),
    ...(includeInactive ? { include_inactive: true } : {})
});
