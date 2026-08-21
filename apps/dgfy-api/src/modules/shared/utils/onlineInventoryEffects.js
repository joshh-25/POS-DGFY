import { isStockBearingItem } from './stockBearingPolicy.js';

const positiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const lineStockSubject = (line = {}) => ({
  ...(line || {}),
  ...(line?.item || {}),
  category: line?.item?.category ?? line?.category
});

const modifierQuantity = (line, modifier) => (
  Number(line?.quantity || 0)
  * Math.min(99, Math.max(1, Number.parseInt(modifier?.quantity || 1, 10) || 1))
);

/**
 * Build the inventory effects for an online order once, so reservation and
 * fulfillment use the same recipe, modifier, and finished-item semantics.
 * The returned rows are inventory-owned effects, not stock movements yet.
 */
export const buildOnlineInventoryEffects = ({
  lines = [],
  recipePlan = null,
  locationId = null,
  orderId = null,
  invoiceNumber = null,
  trackingPin = null,
  allowOutOfStockSales = false
} = {}) => {
  const resolvedRecipePlan = recipePlan || { movementsByLineIndex: [] };
  return (Array.isArray(lines) ? lines : []).flatMap((line, index) => {
    const itemId = positiveInt(line?.item_id);
    const lineReference = positiveInt(line?.line_id) || `${itemId || 'line'}-${index + 1}`;
    const recipeMovements = resolvedRecipePlan.movementsByLineIndex?.[index] || [];
    const effects = [];
    const orderLabel = invoiceNumber || (orderId ? `#${orderId}` : 'online order');
    const trackingSuffix = trackingPin ? ` (${trackingPin})` : '';

    for (const movement of recipeMovements) {
      const ingredientId = positiveInt(movement?.ingredient_item_id);
      const quantity = Number(movement?.quantity || 0);
      if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) continue;
      effects.push({
        item_id: ingredientId,
        quantity,
        effect_type: 'recipe_ingredient',
        source_line_reference: `ONLINE:${orderId || 'PENDING'}:${lineReference}:ING:${ingredientId}`,
        movement_type: 'goods_issue',
        location_id: positiveInt(locationId),
        reference_type: 'POS',
        reference_id: `ONLINE:${orderId || 'PENDING'}:${lineReference}:ING:${ingredientId}`,
        notes: `Online F&B recipe consumption for ${movement?.product_name || `item ${itemId}`} on ${orderLabel}${trackingSuffix}`,
        metadata: {
          product_item_id: itemId,
          product_name: movement?.product_name || null,
          ingredient_name: movement?.ingredient_name || null,
          unit_of_measure: movement?.unit_of_measure || null
        }
      });
    }

    for (const modifier of (Array.isArray(line?.fnb_modifiers_snapshot) ? line.fnb_modifiers_snapshot : [])) {
      const modifierItemId = positiveInt(modifier?.sku_item_id);
      const quantity = modifierQuantity(line, modifier);
      if (!modifierItemId || !Number.isFinite(quantity) || quantity <= 0) continue;
      const modifierReference = `ONLINE:${orderId || 'PENDING'}:${lineReference}:MOD:${positiveInt(modifier?.modifier_option_id) || modifierItemId}`;
      effects.push({
        item_id: modifierItemId,
        quantity,
        effect_type: 'modifier',
        source_line_reference: modifierReference,
        movement_type: 'goods_issue',
        location_id: positiveInt(modifier?.location_id) || positiveInt(locationId),
        reference_type: 'POS',
        reference_id: modifierReference,
        notes: `Online F&B modifier consumption for ${modifier?.option_name || `item ${modifierItemId}`} on ${orderLabel}${trackingSuffix}`,
        metadata: {
          modifier_option_id: positiveInt(modifier?.modifier_option_id),
          option_name: modifier?.option_name || null
        }
      });
    }

    // A recipe-backed menu item consumes its ingredients, not the finished menu
    // item. A stock-exempt line never creates a finished-item effect. The
    // explicit storefront out-of-stock policy only bypasses the direct item
    // availability block; recipe and modifier effects remain protected.
    const isStockExemptLine = line?.stock_effect_type
      ? line.stock_effect_type === 'stock_exempt'
      : !isStockBearingItem(lineStockSubject(line));
    if (recipeMovements.length > 0 || isStockExemptLine || allowOutOfStockSales) return effects;

    const quantity = Number(line?.quantity);
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return effects;
    effects.push({
      item_id: itemId,
      quantity,
      effect_type: 'line_item',
      source_line_reference: `ONLINE:${orderId || 'PENDING'}:${lineReference}`,
      movement_type: 'goods_issue',
      location_id: positiveInt(locationId),
      reference_type: 'POS',
      reference_id: `ONLINE:${orderId || 'PENDING'}:${lineReference}`,
      notes: `Online order completion ${orderLabel}${trackingSuffix}`,
      metadata: {
        item_name: line?.item_name_snapshot || line?.item_name || null,
        unit_of_measure: line?.unit_of_measure || null
      }
    });
    return effects;
  });
};

export const buildLineStockPolicySubject = lineStockSubject;
