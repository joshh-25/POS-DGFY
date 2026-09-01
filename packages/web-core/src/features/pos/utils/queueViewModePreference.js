import { safeLocalStorageGet, safeLocalStorageSet } from './posTerminalStorage.js';

// Phase 230 (#1288). Per-terminal/per-browser Active Queue view-mode preference (card vs table),
// same posture as every other POS UI preference in this file's sibling
// (posTextSizePreference.js's shape, but routed through safeLocalStorageGet/safeLocalStorageSet
// -- posTerminalStorage.js's quota-exceeded recovery helpers -- rather than raw
// window.localStorage, matching the other keys already listed in
// RECOVERABLE_PREFERENCE_PREFIXES). Deliberately not a backend-persisted user setting: no new
// column, no new API route.

export const QUEUE_VIEW_MODE_STORAGE_KEY = 'pos_queue_view_mode_v1';

export const QUEUE_VIEW_MODES = Object.freeze({
  CARD: 'card',
  TABLE: 'table'
});

// Card view stays the default -- confirmed requirement even after a reset (a missing or
// unrecognized stored value falls back here, never to 'table').
export const DEFAULT_QUEUE_VIEW_MODE = QUEUE_VIEW_MODES.CARD;

const QUEUE_VIEW_MODE_VALUES = new Set(Object.values(QUEUE_VIEW_MODES));

export const normalizeQueueViewMode = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return QUEUE_VIEW_MODE_VALUES.has(normalized) ? normalized : DEFAULT_QUEUE_VIEW_MODE;
};

export const readQueueViewModePreference = () => (
  normalizeQueueViewMode(safeLocalStorageGet(QUEUE_VIEW_MODE_STORAGE_KEY))
);

export const writeQueueViewModePreference = (value) => {
  const normalized = normalizeQueueViewMode(value);
  safeLocalStorageSet(QUEUE_VIEW_MODE_STORAGE_KEY, normalized);
  return normalized;
};
