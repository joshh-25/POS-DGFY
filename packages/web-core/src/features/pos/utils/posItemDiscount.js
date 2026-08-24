const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const normalizeMethod = (value) => String(value || '').trim().toLowerCase() === 'fixed'
  ? 'fixed'
  : 'percentage';

const getLineGrossAmount = (line) => round4(Number(line?.quantity || 0) * Number(line?.sale_price || 0));

export const calculatePosItemDiscounts = (cart = []) => {
  const lines = (Array.isArray(cart) ? cart : []).map((line) => {
    const grossAmount = getLineGrossAmount(line);
    const draft = line?.item_discount && typeof line.item_discount === 'object'
      ? line.item_discount
      : null;
    if (!draft) {
      return {
        line_key: line?.line_key || line?.line_id || null,
        item_id: Number(line?.item_id),
        gross_amount: grossAmount,
        item_discount_amount: 0,
        global_discount_base_amount: grossAmount,
        final_line_amount: grossAmount,
        item_discount_snapshot: null,
      };
    }

    const discountType = String(draft.discount_type || 'manual').trim().toLowerCase();
    const method = normalizeMethod(draft.method);
    const rate = method === 'percentage' ? Math.min(100, Math.max(0, Number(draft.rate || 0))) : null;
    const requestedAmount = method === 'fixed' ? Math.max(0, Number(draft.amount || 0)) : null;
    let vatRemoved = 0;
    let vatExemptAmount = 0;
    let discountAmount = 0;
    if (['senior', 'pwd'].includes(discountType)) {
      vatExemptAmount = String(line?.vat_type || line?.vat_type_snapshot || 'vatable').toLowerCase() === 'vatable'
        ? round4(grossAmount / 1.12)
        : grossAmount;
      vatRemoved = round4(grossAmount - vatExemptAmount);
      discountAmount = round4(vatRemoved + (vatExemptAmount * 0.2));
    } else if (discountType !== 'promo') {
      discountAmount = method === 'fixed'
        ? round4(Math.min(grossAmount, requestedAmount || 0))
        : round4(Math.min(grossAmount, grossAmount * ((rate || 0) / 100)));
    }
    const globalBase = round4(Math.max(0, grossAmount - discountAmount));
    return {
      line_key: line?.line_key || line?.line_id || null,
      item_id: Number(line?.item_id),
      gross_amount: grossAmount,
      item_discount_amount: discountAmount,
      global_discount_base_amount: globalBase,
      final_line_amount: globalBase,
      item_discount_snapshot: {
        type: 'item',
        discount_type: discountType,
        label: String(draft.label || 'Item Discount').trim() || 'Item Discount',
        method,
        rate,
        amount: requestedAmount,
        customer_name: String(draft.customer_name || '').trim() || null,
        id_number: String(draft.id_number || '').trim() || null,
        employee_name: String(draft.employee_name || '').trim() || null,
        employee_id: String(draft.employee_id || '').trim() || null,
        promo_code: String(draft.promo_code || '').trim().toUpperCase() || null,
        discount_amount: discountAmount,
        vat_removed: vatRemoved,
        vat_exempt_amount: vatExemptAmount,
        reason: String(draft.reason || '').trim() || null,
        approver_user_id: Number(draft.approver_user_id) || null,
        approver_name: String(draft.approver_name || '').trim() || null,
        approved_at: draft.approved_at || null,
      },
    };
  });

  return {
    subtotalAmount: round4(lines.reduce((sum, line) => sum + line.gross_amount, 0)),
    discountAmount: round4(lines.reduce((sum, line) => sum + line.item_discount_amount, 0)),
    totalAmount: round4(lines.reduce((sum, line) => sum + line.global_discount_base_amount, 0)),
    lines,
  };
};

export const getItemDiscountDraft = (line) => {
  const discount = line?.item_discount;
  if (!discount || typeof discount !== 'object') return null;
  return {
    enabled: true,
    discount_type: String(discount.discount_type || 'manual').trim().toLowerCase(),
    method: normalizeMethod(discount.method),
    rate: discount.rate == null ? '' : String(discount.rate),
    amount: discount.amount == null ? '' : String(discount.amount),
    customer_name: String(discount.customer_name || ''),
    id_number: String(discount.id_number || ''),
    employee_name: String(discount.employee_name || ''),
    employee_id: String(discount.employee_id || ''),
    promo_code: String(discount.promo_code || ''),
    reason: String(discount.reason || ''),
    approver_user_id: discount.approver_user_id ? String(discount.approver_user_id) : '',
    approver_name: String(discount.approver_name || ''),
    approved_at: discount.approved_at || null,
  };
};

export default calculatePosItemDiscounts;
