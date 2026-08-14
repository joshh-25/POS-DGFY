export const getCartLineQuantity = (line) => Math.max(1, Number(line?.quantity || 1));

export const getLineModifiersTotal = (line) => (
  (Array.isArray(line?.line_modifiers) ? line.line_modifiers : []).reduce(
    (sum, entry) => sum + ((Number(entry?.price_delta || 0) || 0) * Math.min(99, Math.max(1, Number.parseInt(entry?.quantity || 1, 10) || 1))),
    0
  )
);

export const getLineUnitTotal = (line) => (
  (Number(line?.price || 0) || 0) + getLineModifiersTotal(line)
);

export const getLineTotal = (line) => getCartLineQuantity(line) * getLineUnitTotal(line);

export const buildCartTotals = (cart = []) => {
  const lines = Array.isArray(cart) ? cart : [];
  return lines.reduce((totals, line) => {
    const quantity = getCartLineQuantity(line);
    totals.subtotal += quantity * (Number(line?.price || 0) || 0);
    totals.addOnsTotal += quantity * getLineModifiersTotal(line);
    totals.total += getLineTotal(line);
    totals.count += Number(line?.quantity || 0);
    return totals;
  }, {
    subtotal: 0,
    addOnsTotal: 0,
    total: 0,
    count: 0
  });
};
