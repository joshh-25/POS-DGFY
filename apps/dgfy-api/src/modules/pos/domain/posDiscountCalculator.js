const VAT_RATE = 0.12;
const STATUTORY_TYPES = new Set(['senior', 'pwd']);
const isSeniorPwdDiscountEligible = (value) => value === true || value === 1 || value === '1';
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export const calculatePosDiscount = ({ lines = [], application = null } = {}) => {
  const normalizedLines = lines.map((line) => {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    const salePrice = Math.max(0, Number(line.sale_price) || 0);
    const grossAmount = round4(quantity * salePrice);
    const globalDiscountBaseAmount = line.global_discount_base_amount == null
      ? grossAmount
      : round4(Math.min(grossAmount, Math.max(0, Number(line.global_discount_base_amount) || 0)));
    return {
      ...line,
      quantity,
      sale_price: salePrice,
      gross_amount: grossAmount,
      global_discount_base_amount: globalDiscountBaseAmount
    };
  });
  const subtotalAmount = round4(normalizedLines.reduce((sum, line) => sum + line.global_discount_base_amount, 0));
  const type = String(application?.type || 'none').trim().toLowerCase();
  if (!application || type === 'none') {
    return { type: 'none', subtotal_amount: subtotalAmount, vat_removed: 0, vat_exempt_amount: 0, discount_amount: 0, total_amount: subtotalAmount, lines: normalizedLines.map((line) => ({ ...line, final_line_amount: line.global_discount_base_amount, discount_amount: 0, vat_removed: 0, vat_exempt_amount: 0, eligible_quantity: 0 })) };
  }

  const statutory = STATUTORY_TYPES.has(type);
  const requestedRate = statutory ? 20 : clamp(application.rate, 0, 100);
  const method = String(application.method || 'percentage').toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
  const selectionEntries = Array.isArray(application.lines) ? application.lines : [];
  const selectionsByLineRef = new Map(selectionEntries
    .map((entry) => [String(entry?.line_ref || '').trim(), entry])
    .filter(([lineRef]) => lineRef));
  const legacySelectionsByItemId = new Map(selectionEntries
    .filter((entry) => !String(entry?.line_ref || '').trim())
    .map((entry) => [Number(entry.item_id), entry]));
  const getSelection = (line) => {
    const lineRef = String(line?.line_ref || '').trim();
    if (lineRef && selectionsByLineRef.has(lineRef)) return selectionsByLineRef.get(lineRef);
    return legacySelectionsByItemId.get(Number(line.item_id));
  };
  const hasSelections = selectionsByLineRef.size > 0 || legacySelectionsByItemId.size > 0;
  const hasStatutorySelections = hasSelections;
  const restrictToSelections = !statutory && hasSelections;
  const eligibleBase = round4(normalizedLines.reduce((sum, line) => {
    const selected = getSelection(line);
    if (!statutory) {
      if (restrictToSelections && !selected) return sum;
      const eligibleQuantity = clamp(selected?.eligible_quantity ?? line.quantity, 0, line.quantity);
      const globalUnitPrice = line.quantity > 0 ? line.global_discount_base_amount / line.quantity : 0;
      return sum + round4(eligibleQuantity * globalUnitPrice);
    }
    const autoEligible = isSeniorPwdDiscountEligible(line.senior_pwd_discount_eligible);
    if ((hasStatutorySelections && !selected) || !autoEligible) return sum;
    const eligibleQuantity = clamp(selected?.eligible_quantity ?? line.quantity, 0, line.quantity);
    return sum + round4(eligibleQuantity * (line.quantity > 0 ? line.global_discount_base_amount / line.quantity : 0));
  }, 0));
  let remainingFixed = method === 'fixed' ? clamp(application.amount, 0, eligibleBase) : 0;
  const fixedDiscountAmount = remainingFixed;
  const eligibleLineIndexes = normalizedLines
    .map((line, index) => {
      const selected = getSelection(line);
      if (statutory) {
        return (!hasStatutorySelections || selected) && isSeniorPwdDiscountEligible(line.senior_pwd_discount_eligible)
          ? index
          : null;
      }
      return !restrictToSelections || selected ? index : null;
    })
    .filter((index) => index != null);
  // Runs in Node -- no runtime risk here -- but kept symmetric with the frontend twin
  // (POSCheckoutTerminal.jsx) fixed for the iMin POS WebView in #664/#666.
  const finalEligibleIndex = eligibleLineIndexes[eligibleLineIndexes.length - 1];

  const calculatedLines = normalizedLines.map((line, index) => {
    const selected = getSelection(line);
    const eligibleQuantity = statutory
      ? ((!hasStatutorySelections || selected) && isSeniorPwdDiscountEligible(line.senior_pwd_discount_eligible)
        ? clamp(selected?.eligible_quantity ?? line.quantity, 0, line.quantity)
        : 0)
      : (restrictToSelections && !selected
        ? 0
        : clamp(selected?.eligible_quantity ?? line.quantity, 0, line.quantity));
    const globalUnitPrice = line.quantity > 0 ? line.global_discount_base_amount / line.quantity : 0;
    const eligibleGross = round4(eligibleQuantity * globalUnitPrice);
    let vatRemoved = 0;
    let vatExemptAmount = 0;
    let discountAmount = 0;
    if (statutory && eligibleGross > 0) {
      if (line.vat_type === 'vatable' || line.vat_type_snapshot === 'vatable') {
        vatExemptAmount = round4(eligibleGross / (1 + VAT_RATE));
        vatRemoved = round4(eligibleGross - vatExemptAmount);
      } else {
        vatExemptAmount = eligibleGross;
      }
      discountAmount = round4(vatExemptAmount * 0.20);
    } else if (!statutory && eligibleGross > 0) {
      if (method === 'fixed') {
        discountAmount = index === finalEligibleIndex
          ? remainingFixed
          : round4(Math.min(remainingFixed, eligibleBase > 0 ? (eligibleGross / eligibleBase) * fixedDiscountAmount : 0));
        remainingFixed = round4(remainingFixed - discountAmount);
      } else {
        discountAmount = round4(eligibleGross * (requestedRate / 100));
      }
    }
    return {
      ...line,
      eligible_quantity: eligibleQuantity,
      gross_eligible_amount: eligibleGross,
      vat_removed: vatRemoved,
      vat_exempt_amount: vatExemptAmount,
      discount_amount: discountAmount,
      eligibility_override_reason: selected?.override_reason || null,
      final_line_amount: round4(line.global_discount_base_amount - vatRemoved - discountAmount)
    };
  });

  const vatRemoved = round4(calculatedLines.reduce((sum, line) => sum + line.vat_removed, 0));
  let discountAmount = round4(calculatedLines.reduce((sum, line) => sum + line.discount_amount, 0));
  // A null/empty maximum means the rule is uncapped. Avoid Number(null) and
  // Number('') because both become 0 and would erase a valid discount.
  const rawMaximum = application.max_discount_amount;
  const maximum = rawMaximum === null || rawMaximum === undefined || rawMaximum === ''
    ? null
    : Number(rawMaximum);
  if (maximum !== null && Number.isFinite(maximum) && maximum >= 0 && discountAmount > maximum) {
    const factor = maximum / discountAmount;
    calculatedLines.forEach((line) => {
      line.discount_amount = round4(line.discount_amount * factor);
      line.final_line_amount = round4(line.global_discount_base_amount - line.vat_removed - line.discount_amount);
    });
    discountAmount = round4(calculatedLines.reduce((sum, line) => sum + line.discount_amount, 0));
  }
  const vatExemptAmount = round4(calculatedLines.reduce((sum, line) => sum + line.vat_exempt_amount, 0));
  return {
    type,
    method,
    rate: method === 'percentage' ? requestedRate : null,
    subtotal_amount: subtotalAmount,
    eligible_amount: eligibleBase,
    vat_removed: vatRemoved,
    vat_exempt_amount: vatExemptAmount,
    discount_amount: discountAmount,
    total_amount: round4(subtotalAmount - vatRemoved - discountAmount),
    lines: calculatedLines
  };
};

export default calculatePosDiscount;
