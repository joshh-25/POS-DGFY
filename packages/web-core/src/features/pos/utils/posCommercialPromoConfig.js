const normalizePromoCode = (value) => String(value || '').trim().toUpperCase().slice(0, 40);

export const normalizeCommercialPromoConfigs = (settings = {}) => {
  const promos = Array.isArray(settings?.storefront_promos?.value) ? settings.storefront_promos.value : [];
  const legacyPromo = settings?.storefront_promo?.value;
  const normalized = promos
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({ ...entry, promo_code: normalizePromoCode(entry.promo_code) }));
  if (legacyPromo && typeof legacyPromo === 'object' && !Array.isArray(legacyPromo)) {
    const legacyCode = normalizePromoCode(legacyPromo.promo_code);
    if (legacyCode && !normalized.some((entry) => normalizePromoCode(entry.promo_code) === legacyCode)) {
      normalized.push({ ...legacyPromo, promo_code: legacyCode });
    }
  }
  return normalized;
};
