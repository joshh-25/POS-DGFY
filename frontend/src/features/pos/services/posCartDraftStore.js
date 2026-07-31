import { buildOfflinePosScopeKey } from './offlinePosScope.js';

const STORAGE_KEY_PREFIX = 'dgfy.pos.cart-draft.v1';
const CART_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const CART_LINE_FIELDS = [
  'line_key',
  'item_id',
  'item_name',
  'quantity',
  'base_sale_price',
  'sale_price',
  'price_override_reason',
  'unit_of_measure',
  'category',
  'vat_type',
  'senior_pwd_discount_eligible',
  'course',
  'kitchen_station_id',
  'fnbKitchenRoutes',
  'modifier_groups',
  'line_modifiers',
  'special_instructions',
  'scan_metadata'
];

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const buildPosCartDraftKey = (scope = {}, shiftId = null) => {
  const scopeKey = buildOfflinePosScopeKey(scope);
  const normalizedShiftId = String(shiftId || '').trim();
  return scopeKey && normalizedShiftId
    ? `${STORAGE_KEY_PREFIX}:${scopeKey}:${encodeURIComponent(normalizedShiftId)}`
    : '';
};

const sanitizeCartLine = (line) => {
  if (!line || typeof line !== 'object') return null;
  const itemId = Number(line.item_id);
  const quantity = Number(line.quantity);
  const salePrice = Number(line.sale_price);
  if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(salePrice) || salePrice < 0) return null;

  return CART_LINE_FIELDS.reduce((safeLine, field) => {
    if (line[field] !== undefined) safeLine[field] = line[field];
    return safeLine;
  }, {});
};

export const clearPosCartDraft = (scope = {}, shiftId = null) => {
  const storage = getStorage();
  const storageKey = buildPosCartDraftKey(scope, shiftId);
  if (!storage || !storageKey) return false;
  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
};

export const savePosCartDraft = (scope = {}, shiftId = null, cart = []) => {
  const storage = getStorage();
  const storageKey = buildPosCartDraftKey(scope, shiftId);
  if (!storage || !storageKey) return false;
  const safeCart = (Array.isArray(cart) ? cart : []).map(sanitizeCartLine).filter(Boolean);
  if (safeCart.length === 0) return clearPosCartDraft(scope, shiftId);

  try {
    storage.setItem(storageKey, JSON.stringify({
      saved_at: new Date().toISOString(),
      cart: safeCart
    }));
    return true;
  } catch {
    return false;
  }
};

export const loadPosCartDraft = (scope = {}, shiftId = null, catalog = []) => {
  const storage = getStorage();
  const storageKey = buildPosCartDraftKey(scope, shiftId);
  if (!storage || !storageKey) return [];

  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
    const savedAt = Date.parse(parsed?.saved_at || '');
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > CART_DRAFT_TTL_MS) {
      storage.removeItem(storageKey);
      return [];
    }
    const catalogById = new Map(
      (Array.isArray(catalog) ? catalog : [])
        .map((item) => [Number(item?.item_id), item])
        .filter(([itemId]) => Number.isInteger(itemId) && itemId > 0)
    );
    return (Array.isArray(parsed?.cart) ? parsed.cart : [])
      .map(sanitizeCartLine)
      .filter((line) => line && catalogById.has(Number(line.item_id)))
      .map((line) => {
        const item = catalogById.get(Number(line.item_id));
        return {
          ...line,
          item_name: String(item?.name || line.item_name || 'Item'),
          unit_of_measure: item?.unit_of_measure || line.unit_of_measure,
          category: item?.category || line.category,
          vat_type: item?.vat_type || line.vat_type || 'vatable',
          senior_pwd_discount_eligible: item?.senior_pwd_discount_eligible === true
        };
      });
  } catch {
    return [];
  }
};

