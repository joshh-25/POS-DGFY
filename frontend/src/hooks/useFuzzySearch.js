import { useMemo } from 'react';
import Fuse from 'fuse.js';

const DEFAULT_OPTIONS = {
  includeScore: true,
  // 0 = exact match required, 1 = match anything.
  // 0.4 matches the semantic search threshold used by itemRepository.js searchByMeaning().
  threshold: 0.4,
  // Skip single-character noise; meaningful searches start at 2 chars.
  minMatchCharLength: 2,
  // Don't penalise matches that appear late in a long string (e.g. description field).
  ignoreLocation: true,
};

/**
 * Client-side fuzzy search over an array of objects using Fuse.js.
 *
 * The Fuse index is rebuilt only when `items` changes, not on every keystroke.
 * When `query` is empty or shorter than 2 characters, the original `items`
 * array is returned unchanged so caller sort order is preserved.
 *
 * @param {Object[]} items     - Full item list to search within.
 * @param {string}   query     - Normalised (trimmed, lowercase) search query.
 * @param {Object[]} keys      - Fuse.js key definitions: [{ name, weight }]
 * @param {Object}   [options] - Optional overrides for Fuse.js config.
 * @returns {Object[]}         - Filtered items sorted by relevance when query is active.
 */
export const useFuzzySearch = (items, query, keys, options = {}) => {
  const fuse = useMemo(
    () => new Fuse(items, { ...DEFAULT_OPTIONS, keys, ...options }),
    // Re-index only when the item list itself changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  );

  return useMemo(() => {
    if (!query || query.length < 2) return items;
    return fuse.search(query).map((result) => result.item);
  }, [fuse, query, items]);
};
