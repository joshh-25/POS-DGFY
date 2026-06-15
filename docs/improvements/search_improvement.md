# Fuzzy Search Improvement — Fuse.js Integration Plan

**Feature:** Client-side fuzzy search using Fuse.js
**Scope:** `ItemsPage` main inventory search + POS checklist search
**Status:** Implemented (2026-06-10)
**Feature doc:** [docs/features/FUZZY_SEARCH.md](../features/FUZZY_SEARCH.md)
**Author:** System Developer

---

## 1. Executive Summary

The current inventory search in `ItemsPage.jsx` uses a plain JavaScript `.includes()` substring match on only two fields (`name`, `sku_code`). This approach has three distinct problems:

1. **No typo tolerance.** Searching `"choclate"` never finds `"Chocolate Syrup"`.
2. **Narrow field coverage.** The `description` field is never searched on the frontend, even though the backend searches it. A user looking for `"packaging tape"` will get no results if the item name is `"Tape A"` but the description says `"clear packaging tape"`.
3. **No relevance ranking.** Every match is treated equally, so a perfect SKU match appears at the same position as a vague description match.

This proposal replaces the `.includes()` calls with [Fuse.js](https://www.fusejs.io/), a lightweight fuzzy-search library with zero server dependencies and ~24 KB minified. The change is **purely additive** on the frontend: no backend, no database, no API contract changes are needed.

---

## 2. Current State Analysis

### 2.1 Primary Inventory Search

**File:** [frontend/src/features/inventory/pages/ItemsPage.jsx](frontend/src/features/inventory/pages/ItemsPage.jsx)

| Concern | Current code |
|---|---|
| Search state | `useState('')` → `useDeferredValue` → `.trim().toLowerCase()` (lines 147, 198–202) |
| Match logic | `.includes(normalizedSearchQuery)` on `item.name` and `item.sku_code` only (lines 1097–1099) |
| Ranking | None. All matching items receive equal treatment |
| Fields searched | 2 of ~50 available fields |

**Critical gap:** The `description` field exists on every item object (see `frontend/Entities/Item.js`) and the backend's `itemRepository.js` already searches it server-side, but the frontend entirely ignores it.

### 2.2 POS Checklist Search

**File:** [frontend/src/features/inventory/pages/ItemsPage.jsx](frontend/src/features/inventory/pages/ItemsPage.jsx) — lines 608–619

The POS checklist modal has a **second, independent** search path using the exact same `.includes()` pattern on `name` and `sku_code`. It has the same limitations.

### 2.3 Backend Search (for reference — not being changed)

The backend `itemRepository.js` already implements multi-field keyword + semantic (embedding) search across `name`, `sku_code`, and `description`. However, `ItemsPage` currently fetches **all items at once** (`limit: 1000`) and does 100% of its filtering client-side. Fuse.js slots cleanly into this client-side layer without touching the backend.

---

## 3. Proposed Solution

### 3.1 Architecture Overview

```
User types query
       │
       ▼
 useDeferredValue (existing — no change)
       │
       ▼
 useFuzzySearch hook  ◄──── NEW
       │
       ├─ query is empty? → return all items unchanged (preserves sort order)
       │
       └─ query exists?  → Fuse.js search across weighted fields
                               → returns items sorted by relevance score
```

No new API calls. No backend changes. The existing `useItems({ limit: 1000 })` fetch is unchanged.

### 3.2 Fuse.js Field Configuration

The following fields will be searched with the given weights (`weight` ranges 0–1; higher = stronger match priority):

| Field | Weight | Rationale |
|---|---|---|
| `sku_code` | **0.9** | Exact SKU searches are the most precise intent |
| `name` | **0.7** | Primary human-readable identifier |
| `description` | **0.3** | Supporting context; lower weight avoids noise |
| `category` | **0.2** | Allows searching by type (e.g., `"product"`, `"ingredient"`) |

Fuse.js options to use:

```js
{
  includeScore: true,
  threshold: 0.4,        // 0 = perfect match, 1 = match anything. 0.4 is the Fuse default sweet spot.
  minMatchCharLength: 2, // Ignore single-character noise
  ignoreLocation: true,  // Don't penalize matches at the end of a long string
  keys: [
    { name: 'sku_code',    weight: 0.9 },
    { name: 'name',        weight: 0.7 },
    { name: 'description', weight: 0.3 },
    { name: 'category',    weight: 0.2 },
  ],
}
```

**Why `threshold: 0.4`?** This matches the exact threshold already used by the backend's semantic search (`searchByMeaning(search, 50, 0.4)` in `itemRepository.js`), keeping the tolerance levels consistent across layers.

---

## 4. Implementation Plan

### Step 1 — Install Fuse.js

**Location:** `frontend/package.json`

```bash
cd frontend && npm install fuse.js
```

This is the only dependency addition. Fuse.js has no sub-dependencies.

---

### Step 2 — Create `useFuzzySearch` Hook

**New file:** [frontend/src/hooks/useFuzzySearch.js](frontend/src/hooks/useFuzzySearch.js)

This hook wraps Fuse.js and is reusable across any list in the app.

```js
import { useMemo } from 'react';
import Fuse from 'fuse.js';

/**
 * Client-side fuzzy search over an array of objects using Fuse.js.
 *
 * @param {Object[]} items       - The full item list to search within.
 * @param {string}   query       - The search query (already trimmed/normalized).
 * @param {Object[]} keys        - Fuse.js key definitions: [{ name, weight }]
 * @param {Object}   [options]   - Override default Fuse.js options.
 * @returns {Object[]}           - Filtered items. When query is empty, returns `items` unchanged.
 */
export const useFuzzySearch = (items, query, keys, options = {}) => {
  const fuse = useMemo(() => {
    return new Fuse(items, {
      includeScore: true,
      threshold: 0.4,
      minMatchCharLength: 2,
      ignoreLocation: true,
      keys,
      ...options,
    });
  }, [items, keys, options]);

  return useMemo(() => {
    if (!query || query.length < 2) return items;
    return fuse.search(query).map(result => result.item);
  }, [fuse, query, items]);
};
```

**Key design decisions:**
- Returns `items` unchanged when `query` is empty. This preserves the existing sort order (name/stock/updated) when no search is active.
- The `fuse` instance is memoized on `items` — it only rebuilds the search index when the item list itself changes (e.g., after a refetch), not on every keystroke.
- When a query is active, results come out sorted by Fuse.js relevance score (best match first). The existing `sortBy` state still applies afterward when the query is cleared.

---

### Step 3 — Update Primary Search in `ItemsPage.jsx`

**File:** [frontend/src/features/inventory/pages/ItemsPage.jsx](frontend/src/features/inventory/pages/ItemsPage.jsx)

#### 3a. Add import

At the top of the file, import the new hook:

```js
import { useFuzzySearch } from '../../../hooks/useFuzzySearch.js';
```

#### 3b. Define Fuse.js keys (stable reference)

Add this constant **outside the component** to avoid re-creating it on every render:

```js
const ITEM_SEARCH_KEYS = [
  { name: 'sku_code',    weight: 0.9 },
  { name: 'name',        weight: 0.7 },
  { name: 'description', weight: 0.3 },
  { name: 'category',    weight: 0.2 },
];
```

#### 3c. Add the fuzzy search hook call

After the existing `normalizedSearchQuery` memo (around line 202), add:

```js
const fuzzySearchResults = useFuzzySearch(items, normalizedSearchQuery, ITEM_SEARCH_KEYS);
```

#### 3d. Replace `.includes()` in `filteredItems`

**Current code** (lines 1097–1099):
```js
const matchesSearch = normalizedSearchQuery.length === 0
  || item.name.toLowerCase().includes(normalizedSearchQuery)
  || (item.sku_code || '').toLowerCase().includes(normalizedSearchQuery);
```

**Replace with** (using the pre-computed `fuzzySearchResults` Set):

```js
// Build a Set from fuzzy results once — O(n) lookup, not O(n²)
const fuzzyMatchIds = useMemo(
  () => new Set(fuzzySearchResults.map(i => i.item_id)),
  [fuzzySearchResults]
);
```

Then update `filteredItems`:
```js
// Inside filteredItems .filter():
const matchesSearch = normalizedSearchQuery.length === 0 || fuzzyMatchIds.has(item.item_id);
```

**Full updated `filteredItems` block:**

```js
const fuzzyMatchIds = useMemo(
  () => new Set(fuzzySearchResults.map(i => i.item_id)),
  [fuzzySearchResults]
);

const filteredItems = useMemo(() => {
  return items
    .filter(item => {
      const matchesSearch = normalizedSearchQuery.length === 0 || fuzzyMatchIds.has(item.item_id);

      const effectiveCategory = resolveCategoryFilterValue(item);
      const matchesCategory = categoryFilter === 'all'
        || effectiveCategory === categoryFilter
        || item.category === categoryFilter;

      let matchesFolder = true;
      if (currentFolder !== null) {
        matchesFolder = doesItemMatchFolder(item, currentFolder);
      } else if (folderFilter !== 'all') {
        matchesFolder = doesItemMatchFolder(item, folderFilter);
      }

      if (statusFilter === 'draft') {
        return matchesSearch && matchesCategory && matchesFolder && item.status === 'draft';
      }

      const status = getStockStatus(item);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'critical' && (status === 'critical' || status === 'warning'))
        || status === statusFilter;

      let matchesFifo = true;
      if (fifoFilter === 'enabled') {
        matchesFifo = item.fifo_enabled === true;
      } else if (fifoFilter === 'disabled') {
        matchesFifo = item.fifo_enabled === false;
      } else if (fifoFilter === 'expiring') {
        if (item.fifo_enabled && item.fifo_batches && item.fifo_batches.length > 0) {
          const nextExpiry = getNextExpiryDate(item);
          if (nextExpiry) {
            const daysUntilExpiry = getDaysUntilExpiry(nextExpiry);
            matchesFifo = daysUntilExpiry !== null && daysUntilExpiry <= 30;
          } else {
            matchesFifo = false;
          }
        } else {
          matchesFifo = false;
        }
      }

      return matchesSearch && matchesCategory && matchesStatus && matchesFolder && matchesFifo && item.status !== 'draft';
    })
    .sort((a, b) => {
      // When a search is active, preserve Fuse.js relevance order
      if (normalizedSearchQuery.length >= 2) {
        const aIdx = fuzzySearchResults.findIndex(i => i.item_id === a.item_id);
        const bIdx = fuzzySearchResults.findIndex(i => i.item_id === b.item_id);
        return aIdx - bIdx;
      }
      // Otherwise, apply the user's chosen sort
      switch (sortBy) {
        case 'name':         return a.name.localeCompare(b.name);
        case 'stock':        return a.current_stock - b.current_stock;
        case 'stock_desc':   return b.current_stock - a.current_stock;
        case 'updated':      return new Date(b.updated_at || b.last_updated) - new Date(a.updated_at || a.last_updated);
        default:             return 0;
      }
    });
}, [items, fuzzyMatchIds, fuzzySearchResults, normalizedSearchQuery, categoryFilter, statusFilter, sortBy, folderFilter, fifoFilter, currentFolder, doesItemMatchFolder, resolveCategoryFilterValue]);
```

---

### Step 4 — Update POS Checklist Search

**File:** [frontend/src/features/inventory/pages/ItemsPage.jsx](frontend/src/features/inventory/pages/ItemsPage.jsx) — lines 608–619

The POS checklist has a parallel search path. Apply the same fix.

#### 4a. Define POS checklist keys constant (outside component)

```js
const POS_CHECKLIST_SEARCH_KEYS = [
  { name: 'sku_code', weight: 0.9 },
  { name: 'name',     weight: 0.7 },
];
```

The POS checklist omits `description` and `category` because the checklist already has separate category and status dropdowns; adding description search to the short modal search bar would be noisy.

#### 4b. Add fuzzy hook

```js
const fuzzyPosResults = useFuzzySearch(items, normalizedPosChecklistSearch, POS_CHECKLIST_SEARCH_KEYS);
const fuzzyPosIds = useMemo(
  () => new Set(fuzzyPosResults.map(i => i.item_id)),
  [fuzzyPosResults]
);
```

#### 4c. Replace `.includes()` in `posChecklistItems`

**Current code** (lines 609–611):
```js
const matchesSearch = normalizedPosChecklistSearch.length === 0
  || (item.name || '').toLowerCase().includes(normalizedPosChecklistSearch)
  || (item.sku_code || '').toLowerCase().includes(normalizedPosChecklistSearch);
```

**Replace with:**
```js
const matchesSearch = normalizedPosChecklistSearch.length === 0 || fuzzyPosIds.has(item.item_id);
```

---

### Step 5 — Mapping Consolidation

The analysis above revealed a **field mapping inconsistency** between the backend and frontend:

| Field | Backend searches it? | Frontend searches it (current) | Frontend searches it (after fix) |
|---|---|---|---|
| `name` | Yes | Yes | Yes |
| `sku_code` | Yes | Yes | Yes |
| `description` | **Yes** | **No** | **Yes** |
| `category` | No | No | Yes (low weight) |

This consolidation closes the gap where a user could search for something using the SKUpervisor AI (which uses the backend) and find results that the main inventory list would not surface — making the experience consistent across all search surfaces in the app.

---

## 5. Files Changed Summary

| File | Change Type | What Changes |
|---|---|---|
| `frontend/package.json` | Dependency add | Add `fuse.js` |
| `frontend/src/hooks/useFuzzySearch.js` | **New file** | Reusable Fuse.js hook |
| `frontend/src/features/inventory/pages/ItemsPage.jsx` | Edit | Replace 2× `.includes()` search blocks with fuzzy search |

**No files changed:**
- Backend (zero changes)
- Database (zero changes)
- API contracts (zero changes)
- Any other frontend page or component

---

## 6. What Is Not Changed

This proposal is deliberately narrow. The following are **out of scope** to avoid destabilizing critical parts of the system:

- **Backend search logic** — `itemRepository.js` keyword/semantic search is not touched.
- **`useItems` hook** — The fetch strategy (`limit: 1000`, 30s cache) is unchanged.
- **API params** — No new query params are sent to the backend.
- **Sort state** — The existing `sortBy` dropdown continues to work when no search is active.
- **Filter states** — Category, status, FIFO, and folder filters are not modified.
- **Other pages** — Suppliers, PO, JO, and Movements pages use their own search logic and are out of scope for this change.

---

## 7. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fuse index rebuild on every render | Medium | `useMemo` on `items` ensures index only rebuilds when item list changes |
| False positives with very short queries | Low | `minMatchCharLength: 2` skips 0–1 char queries |
| Threshold too permissive (too many results) | Low–Medium | Start with `0.4` (matches backend semantic threshold); can tune down to `0.3` if needed |
| Breaking the `item_id` lookup | Low | The `id`/`item_id` dual-field normalization already exists in `itemService.js` (line ~20); both are available |
| POS checklist regression | Low | The change is additive: the checklist's category/status filters are untouched |

---

## 8. Testing Checklist

Before marking complete, verify each of the following manually:

### Primary Search

- [ ] Empty query: full item list renders with default sort order
- [ ] Exact name match: `"Chocolate Syrup"` → returns `Chocolate Syrup`
- [ ] Exact SKU match: type the full SKU code → correct item appears first
- [ ] Fuzzy name match: `"choclate"` (typo) → still returns `Chocolate Syrup`
- [ ] Description match: search for a word only in `description`, not in `name` or `sku_code` → item is found
- [ ] Relevance order: `"SKU-001"` with exact SKU → that item ranks above partial name matches
- [ ] Category filter still works alongside fuzzy search
- [ ] Status filter still works alongside fuzzy search
- [ ] FIFO filter still works alongside fuzzy search
- [ ] Folder filter still works alongside fuzzy search
- [ ] `sortBy` dropdown still affects order when search query is cleared

### POS Checklist Modal

- [ ] Empty query: all items appear
- [ ] Fuzzy match: typo in item name still surfaces the item
- [ ] Category dropdown and status dropdown still work alongside fuzzy search

---

## 9. Future Considerations (Out of Scope Now)

These are follow-on improvements that could build on this foundation but are **not part of this task**:

- **Highlight matched text**: Fuse.js can return `indices` of matching characters. A `<HighlightedText>` component could visually underline the matching portion in the item name.
- **Extend to Suppliers page**: The supplier search has its own `.includes()` pattern that could adopt `useFuzzySearch` identically.
- **Extend to PO/JO dropdowns**: Item picker dropdowns in PO and JO wizards also use substring search and would benefit from the same hook.
- **Tune threshold per context**: The POS checklist may want a stricter `threshold: 0.3` since the list is shorter and precision matters more there.
