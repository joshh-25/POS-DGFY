// Keep this in sync with apps/dgfy-api/src/models/Item.js, where these fields
// are persisted as DECIMAL(10,4).
export const MAX_ITEM_PRICE = 999999.9999;

export const getItemPriceLimitError = ({ price, cost } = {}) => {
  const numericPrice = Number(price);
  if (Number.isFinite(numericPrice) && numericPrice > MAX_ITEM_PRICE) {
    return 'Selling price must not exceed ₱999,999.9999.';
  }

  const numericCost = Number(cost);
  if (Number.isFinite(numericCost) && numericCost > MAX_ITEM_PRICE) {
    return 'Cost per unit must not exceed ₱999,999.9999.';
  }

  return null;
};
