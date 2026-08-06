const trimText = (value) => String(value || '').trim();

const parseOptionalArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseOptionalObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeTargetItemIds = (value) => (
  Array.isArray(value)
    ? value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry > 0)
    : []
);

const buildPercentLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '';
  const formattedValue = Number.isInteger(numericValue)
    ? String(numericValue)
    : String(numericValue.toFixed(2)).replace(/\.?0+$/, '');
  return `${formattedValue}% OFF`;
};

const buildCatalogIndexes = (catalog = []) => {
  const catalogIndex = new Map();
  const catalogCategoryIndex = new Map();
  (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
    const itemId = Number(entry?.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0) return;
    const itemName = trimText(entry?.name || entry?.item_name);
    const categoryLabel = trimText(
      entry?.categoryMeta?.label
      || entry?.category_name
      || entry?.folder_name
      || entry?.category
    );
    if (itemName) catalogIndex.set(itemId, itemName);
    if (categoryLabel) catalogCategoryIndex.set(itemId, categoryLabel);
  });
  return { catalogIndex, catalogCategoryIndex };
};

const normalizePromoEntry = (entry, { catalogIndex, catalogCategoryIndex } = {}) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (entry.active === false) return null;

  const title = trimText(entry.title);
  const subtitle = trimText(entry.subtitle);
  const badge = trimText(entry.badge);
  const promoCode = trimText(entry.promo_code || entry.promoCode).toUpperCase();
  const validityText = trimText(entry.validity_text || entry.validityText);
  const headline = trimText(entry.headline || entry.primary_text);
  const supportingText = trimText(entry.supporting_text || entry.secondary_text || entry.supportingText);
  const discountPercent = Number(entry.discount_percent ?? entry.discountPercent);
  const discountLabel = buildPercentLabel(discountPercent) || trimText(entry.discount_label || entry.discountLabel);
  const targetItemIds = normalizeTargetItemIds(entry.target_item_ids || entry.targetItemIds);
  const availabilityStatus = trimText(entry.availability_status || entry.availabilityStatus || 'available') || 'available';
  const availabilityMessage = trimText(entry.availability_message || entry.availabilityMessage);
  const validTimeStart = trimText(entry.valid_time_start || entry.validTimeStart);
  const validTimeEnd = trimText(entry.valid_time_end || entry.validTimeEnd);
  const validFrom = trimText(entry.valid_from || entry.validFrom);
  const validUntil = trimText(entry.valid_until || entry.validUntil);
  const eligibleItemNames = targetItemIds
    .map((itemId) => catalogIndex?.get(itemId))
    .filter(Boolean);
  const eligibleCategories = Array.from(new Set(
    targetItemIds
      .map((itemId) => catalogCategoryIndex?.get(itemId))
      .filter(Boolean)
  ));
  const eligibleItemsText = eligibleItemNames.length > 0
    ? `${eligibleItemNames.slice(0, 3).join(', ')}${eligibleItemNames.length > 3 ? ` +${eligibleItemNames.length - 3} more` : ''}`
    : '';
  const eligibleCategoriesText = eligibleCategories.length > 0
    ? eligibleCategories.join(', ')
    : '';

  if (!title && !subtitle && !badge && !validityText && !headline && !supportingText && !promoCode && !discountLabel) {
    return null;
  }

  return {
    title,
    subtitle,
    badge,
    promo_code: promoCode,
    promoCode,
    validityText,
    validity_text: validityText,
    headline,
    supportingText,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : null,
    discount_percent: Number.isFinite(discountPercent) ? discountPercent : null,
    discountLabel,
    availabilityStatus,
    availability_status: availabilityStatus,
    availabilityMessage,
    availability_message: availabilityMessage,
    validTimeStart,
    valid_time_start: validTimeStart,
    validTimeEnd,
    valid_time_end: validTimeEnd,
    validFrom,
    valid_from: validFrom,
    validUntil,
    valid_until: validUntil,
    targetItemIds,
    target_item_ids: targetItemIds,
    eligibleItemNames,
    eligibleCategories,
    eligibleItemsText,
    eligibleCategoriesText,
  };
};

const getPromoCandidates = ({ selectedStore, supportingPromo }) => {
  const candidates = [];
  const storePromos = parseOptionalArray(selectedStore?.storefront_promos);
  if (storePromos.length > 0) candidates.push(...storePromos);

  const normalizedSupportingPromo = parseOptionalObject(supportingPromo);
  const modernCandidateCount = candidates.length;
  if (normalizedSupportingPromo?.active === true) {
    const supportingItems = Array.isArray(normalizedSupportingPromo.items) ? normalizedSupportingPromo.items : [];
    if (supportingItems.length > 0) {
      candidates.push(...supportingItems);
    } else if (modernCandidateCount === 0) {
      candidates.push(normalizedSupportingPromo);
    }
  }

  const legacyPromo = parseOptionalObject(selectedStore?.storefront_promo);
  if (candidates.length === 0 && legacyPromo?.active === true) candidates.push(legacyPromo);

  return candidates;
};

export const buildFnbPromoSectionModel = ({
  catalog = [],
  selectedStore = null,
  supportingPromo = null,
  maxItems = 3,
} = {}) => {
  const indexes = buildCatalogIndexes(catalog);
  const seenCodes = new Set();
  const seenDisplayKeys = new Set();
  return getPromoCandidates({ selectedStore, supportingPromo })
    .map((entry) => normalizePromoEntry(entry, indexes))
    .filter(Boolean)
    .filter((entry) => {
      const codeKey = trimText(entry.promoCode);
      if (codeKey) {
        if (seenCodes.has(codeKey)) return false;
        seenCodes.add(codeKey);
        return true;
      }
      const displayKey = [
        entry.title,
        entry.subtitle,
        entry.badge,
        entry.validityText,
        entry.discountLabel,
      ].map(trimText).join('|').toLowerCase();
      if (seenDisplayKeys.has(displayKey)) return false;
      seenDisplayKeys.add(displayKey);
      return true;
    })
    .slice(0, maxItems);
};

export default buildFnbPromoSectionModel;
