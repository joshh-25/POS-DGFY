const STOREFRONT_MONEY_FORMATTER = new Intl.NumberFormat('en-PH', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const money = (value) => {
  const amount = Number(value || 0);
  return `₱${STOREFRONT_MONEY_FORMATTER.format(Number.isFinite(amount) ? amount : 0)}`;
};

export const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const toSlug = (value) => String(value || '').trim().toLowerCase();
