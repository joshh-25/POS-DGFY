export const buildFnbRecipeBlockerMessage = (error) => {
  const details = error?.response?.data?.errors || error?.response?.data?.details || {};
  const reasonCode = String(details?.reason_code || '').trim().toUpperCase();
  if (reasonCode === 'FNB_RECIPE_INGREDIENT_SHORTFALL') {
    const product = details.product_name || 'Selected menu item';
    const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
    const unit = details.unit_of_measure ? ` ${details.unit_of_measure}` : '';
    const location = details.location_id ? ` at location ${details.location_id}` : '';
    return `${product}: ${ingredient} short${location}. Avail ${details.available ?? 0}${unit}; req ${details.requested ?? ''}${unit}.`;
  }
  if (reasonCode === 'FNB_RECIPE_UOM_INCOMPATIBLE') {
    const product = details.product_name || 'Selected menu item';
    const ingredient = details.ingredient_name || `ingredient ${details.ingredient_item_id || ''}`.trim();
    return `${product}: ${ingredient} unit mismatch (${details.recipe_uom || 'recipe'} to ${details.ingredient_uom || 'stock'}). Update UOM.`;
  }
  if (reasonCode === 'FNB_KITCHEN_ORDER_UNAVAILABLE') {
    return 'Kitchen order unavailable. Refresh F&B setup.';
  }
  return null;
};

export const buildValidationDetailMessage = (error) => {
  const fnbRecipeBlocker = buildFnbRecipeBlockerMessage(error);
  if (fnbRecipeBlocker) return fnbRecipeBlocker;
  if (error?.response?.status !== 422) return null;

  const validationErrors = error?.response?.data?.errors;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    const summarized = validationErrors
      .map((entry) => {
        const field = String(entry?.field || '').trim();
        const message = String(entry?.message || '').trim();
        if (!message) return null;
        return field ? `${field}: ${message}` : message;
      })
      .filter(Boolean);

    if (summarized.length > 0) return summarized.slice(0, 2).join(' | ');
  }

  const fallback = String(error?.response?.data?.message || '').trim();
  return fallback || null;
};
