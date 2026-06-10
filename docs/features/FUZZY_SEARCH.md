---
status: authoritative
authority_level: reference
owner: frontend
last_reviewed: 2026-06-10
applies_to: frontend_search_surfaces
topic: fuzzy_search
---

# Fuzzy Search — Fuse.js Integration

## Summary

All client-side inventory and storefront catalog searches use [Fuse.js](https://www.fusejs.io/) fuzzy matching instead of the previous plain-string `.includes()` approach.

**Surfaces covered:**
| Surface | File | Search trigger |
|---|---|---|
| IMS inventory list | `frontend/src/features/inventory/pages/ItemsPage.jsx` | Main search bar |
| IMS POS checklist modal | `frontend/src/features/inventory/pages/ItemsPage.jsx` | Checklist modal search |
| Storefront catalog | `frontend/apps/store/src/catalogSearch.js` | Catalog search bar |

**No backend changes.** No API contract changes. No database changes.

---

## Problem Solved

The previous `.includes()` search had three deficiencies:

1. **No typo tolerance** — `"choclate"` never found `"Chocolate Syrup"`.
2. **Narrow field coverage** — The frontend searched only `name` and `sku_code`. The `description` field was searched by the backend (`itemRepository.js`) but entirely ignored on the frontend, creating inconsistent results between the main inventory list and the SKUpervisor AI assistant.
3. **No relevance ranking** — Every match was treated equally; a perfect SKU match appeared at the same position as a vague description match.

---

## Implementation

### Shared hook — `useFuzzySearch`

**File:** `frontend/src/hooks/useFuzzySearch.js`

Reusable React hook that wraps a memoized Fuse.js instance. The index is rebuilt only when the `items` array reference changes — not on every keystroke — keeping render cost low for large catalogs.

```js
const results = useFuzzySearch(items, normalizedQuery, keys, options);
```

Returns `items` unchanged when `query` is empty or shorter than 2 characters, preserving the caller's sort order.

### IMS inventory list (`ItemsPage.jsx`)

Two module-level key-set constants defined outside the component:

```js
const ITEM_SEARCH_KEYS = [
  { name: 'sku_code',    weight: 0.9 },
  { name: 'name',        weight: 0.7 },
  { name: 'description', weight: 0.3 },  // ← previously not searched on frontend
  { name: 'category',    weight: 0.2 },
];

const POS_CHECKLIST_SEARCH_KEYS = [
  { name: 'sku_code', weight: 0.9 },
  { name: 'name',     weight: 0.7 },
];
```

The POS checklist omits `description`/`category` because the modal already has separate dropdown filters for those dimensions.

`filteredItems` and `posChecklistItems` now use `Set`-based ID lookups (`fuzzyMatchIds`, `fuzzyPosIds`) for O(1) membership testing instead of per-item string comparisons.

**Sort behaviour:**
- When a search query is active (≥ 2 chars), results are ordered by Fuse.js relevance score (best match first).
- When the search is cleared, the user's selected `sortBy` option (name / stock / updated) takes over as before.

### Storefront catalog (`catalogSearch.js`)

`filterCatalogItems(catalog, rawQuery)` public API is unchanged. Internally it creates a Fuse instance per call, which is acceptable because storefront catalogs are small (< 200 items) and the function is always invoked inside `useMemo` in `StorefrontApp.jsx`.

Additional SKU field variants (`sku`, `item_code`, `code`) are included because storefront catalog payloads from different tenant modes use different field names for the same concept.

---

## Fuse.js Configuration

| Option | Value | Reason |
|---|---|---|
| `threshold` | `0.4` | Matches the backend's semantic search tolerance (`searchByMeaning(search, 50, 0.4)` in `itemRepository.js`) |
| `minMatchCharLength` | `2` | Ignores single-character noise; meaningful searches start at 2 chars |
| `ignoreLocation` | `true` | Does not penalise matches that appear late in a long string (e.g. end of a description) |
| `includeScore` | `true` | Required to sort results by relevance |

---

## Field Mapping Consolidation

This change closes the gap between what the backend searches and what the frontend searches:

| Field | Backend (`itemRepository.js`) | IMS frontend (before) | IMS frontend (after) | Storefront (before) | Storefront (after) |
|---|---|---|---|---|---|
| `name` | Yes | Yes | Yes | Yes | Yes |
| `sku_code` | Yes | Yes | Yes | Yes | Yes |
| `description` | Yes | **No** | **Yes** | Yes | Yes |
| `category` | No | No | Yes (low weight) | No | No |

---

## Files Changed

| File | Type | Change |
|---|---|---|
| `frontend/package.json` | Modified | Added `fuse.js ^7.0.0` dependency |
| `frontend/src/hooks/useFuzzySearch.js` | **New** | Reusable Fuse.js hook |
| `frontend/src/features/inventory/pages/ItemsPage.jsx` | Modified | Two search blocks replaced; relevance sort added |
| `frontend/apps/store/src/catalogSearch.js` | Modified | `.includes()` replaced with Fuse.js |

## Files Not Changed

- Backend (`backend/`) — zero changes
- Any other frontend page, component, or API service

---

## Proposal Reference

Original analysis and implementation plan: `docs/improvements/search_improvement.md`
