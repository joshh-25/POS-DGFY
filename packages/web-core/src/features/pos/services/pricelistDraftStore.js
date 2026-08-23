// localStorage autosave buffer for the pricelist bulk item-price editor (#698). Modeled on
// `posCartDraftStore.js`'s versioned-key + TTL + sanitize-on-read pattern -- edits persist
// continuously as you type, so closing the tab, navigating away, or a crash never loses work; no
// Save press required.
//
// This is deliberately a SEPARATE concern from the server-side draft-revision -> publish cycle
// (#696's `pricelists.status`/`draft_of_pricelist_id`). This buffer is per-browser only: switching
// device, clearing site data, or an incognito window loses it. Cross-device draft resume would need
// a server-side autosave endpoint -- named here as the upgrade path, not built.

const STORAGE_KEY_PREFIX = 'dgfy.pos.pricelist-draft.v1';
const PRICELIST_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const buildPricelistDraftKey = (pricelistId) => {
  const normalized = String(pricelistId ?? '').trim();
  return normalized ? `${STORAGE_KEY_PREFIX}:${encodeURIComponent(normalized)}` : '';
};

// Rows keyed by item_id so a save is a cheap object assignment, not an array scan -- the editor
// can have ~300 rows and autosaves on every keystroke.
const sanitizeRows = (rows) => {
  if (!rows || typeof rows !== 'object') return {};
  return Object.entries(rows).reduce((safeRows, [itemIdKey, row]) => {
    const itemId = Number(itemIdKey);
    const unitPricePesos = Number(row?.unit_price_pesos);
    if (!Number.isInteger(itemId) || itemId <= 0) return safeRows;
    if (!Number.isFinite(unitPricePesos) || unitPricePesos < 0) return safeRows;
    safeRows[itemId] = {
      unit_price_pesos: unitPricePesos,
      is_manual_override: row?.is_manual_override === true
    };
    return safeRows;
  }, {});
};

export const clearPricelistDraft = (pricelistId) => {
  const storage = getStorage();
  const storageKey = buildPricelistDraftKey(pricelistId);
  if (!storage || !storageKey) return false;
  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
};

export const savePricelistDraft = (pricelistId, rows = {}) => {
  const storage = getStorage();
  const storageKey = buildPricelistDraftKey(pricelistId);
  if (!storage || !storageKey) return false;
  const safeRows = sanitizeRows(rows);
  if (Object.keys(safeRows).length === 0) return clearPricelistDraft(pricelistId);

  try {
    storage.setItem(storageKey, JSON.stringify({
      saved_at: new Date().toISOString(),
      rows: safeRows
    }));
    return true;
  } catch {
    return false;
  }
};

/**
 * @returns {{rows: Record<number, {unit_price_pesos: number, is_manual_override: boolean}>, savedAt: string|null}}
 */
export const loadPricelistDraft = (pricelistId) => {
  const storage = getStorage();
  const storageKey = buildPricelistDraftKey(pricelistId);
  if (!storage || !storageKey) return { rows: {}, savedAt: null };

  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
    const savedAt = Date.parse(parsed?.saved_at || '');
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > PRICELIST_DRAFT_TTL_MS) {
      storage.removeItem(storageKey);
      return { rows: {}, savedAt: null };
    }
    return { rows: sanitizeRows(parsed?.rows), savedAt: parsed.saved_at };
  } catch {
    return { rows: {}, savedAt: null };
  }
};
