// Pricelist-only presentation and value helpers. Keep these out of the POS page shell so the
// shared terminal components do not accumulate Pricelist domain code.

export const PAGE_SIZE_HINT = 1000;
export const DESKTOP_TABLE_PAGE_SIZE = 50;
export const DESKTOP_TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100];
export const PRICELIST_PAGE_SIZE = 20;
export const PRICELIST_PAGE_SIZE_OPTIONS = [20, 40, 60];

export const STATUS_BADGE_CLASS = Object.freeze({
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-200 text-slate-500 border-slate-300'
});

export const STATUS_LABEL = Object.freeze({
  draft: 'draft',
  active: 'active',
  archived: 'archived'
});

export const REASON_CODE_MESSAGES = Object.freeze({
  PRICELIST_NOT_FOUND: 'This pricelist could not be found.',
  PRICELIST_VERSION_CONFLICT: 'This pricelist was changed elsewhere. Reloading the latest version.',
  PRICELIST_ARCHIVED_IMMUTABLE: 'Archived pricelists cannot be modified.',
  // #717: raised by POST /:id/archive when at least one voucher still attaches this pricelist.
  PRICELIST_IN_USE_BY_VOUCHER: 'This pricelist is attached to one or more vouchers and cannot be archived. Detach it from every voucher first.',
  PRICELIST_ITEM_REF_NOT_FOUND: 'One or more items on this pricelist could not be found.',
  PRICELIST_NOT_PUBLISHABLE: 'This pricelist is already live and is not a pending draft revision.'
});

export const getReasonCode = (data) => String(data?.errors?.reason_code || '').trim();

export const describeError = (error, fallback) => {
  const data = error?.response?.data;
  const reasonCode = getReasonCode(data);
  return REASON_CODE_MESSAGES[reasonCode] || data?.message || fallback;
};

export const pesoNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
export const centavosToPesoNumber = (centavos) => Math.round((Number(centavos) || 0)) / 100;
export const pesosToCentavos = (pesos) => Math.round(pesoNumber(pesos) * 100);
export const money = (pesos) => `₱${pesoNumber(pesos).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatSavedAt = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

/**
 * Build the editable row set: one row per catalog item, always -- an untouched row stays at SRP
 * (`is_manual_override: false`) and contributes zero discount at redemption.
 */
export const buildRows = (items, pricelistItemsByItemId) => items.map((item) => {
  const itemId = Number(item.item_id);
  const existing = pricelistItemsByItemId.get(itemId);
  const srpPesos = pesoNumber(item.default_sale_price);
  return {
    item_id: itemId,
    name: item.name || `Item #${itemId}`,
    sku_code: item.sku_code || '',
    category: item.category || '',
    srp_pesos: srpPesos,
    cost_per_unit: item.cost_per_unit != null ? pesoNumber(item.cost_per_unit) : null,
    unit_price_pesos: existing ? centavosToPesoNumber(existing.unit_price_centavos) : srpPesos,
    is_manual_override: existing ? existing.is_manual_override === true : false
  };
});

export const rowNoDiscountWarning = (row) => (
  pesosToCentavos(row.unit_price_pesos) === pesosToCentavos(row.srp_pesos)
);

export const rowAboveSrpWarning = (row) => (
  pesosToCentavos(row.unit_price_pesos) > pesosToCentavos(row.srp_pesos)
);

// Warn only, never block -- allow_below_cost lives on the voucher and is enforced at redemption.
export const rowBelowCostWarning = (row) => (
  row.cost_per_unit != null && pesosToCentavos(row.unit_price_pesos) < pesosToCentavos(row.cost_per_unit)
);
