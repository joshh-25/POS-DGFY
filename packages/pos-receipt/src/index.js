const money = (value) => Number(value || 0).toFixed(2);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const text = (value, fallback = '-') => String(value ?? '').trim() || fallback;
const upper = (value) => text(value, '').replace(/_/g, ' ').toUpperCase();
const displayDiscountType = (value) => String(value || '').trim().toLowerCase() === 'manual' ? 'OTHER' : upper(value);
const quantity = (line) => Number(line?.quantity ?? line?.qty ?? 0) || 0;
const unitPrice = (line) => {
  const explicit = Number(line?.sale_price ?? line?.unit_price ?? line?.unit_price_snapshot ?? line?.price);
  if (Number.isFinite(explicit)) return explicit;
  const total = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
  return Number.isFinite(total) ? (quantity(line) ? total / quantity(line) : total) : 0;
};
const lineTotal = (line) => {
  const total = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
  return Number.isFinite(total) ? total : quantity(line) * unitPrice(line);
};
const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const discountAllocationForLine = (transaction, line) => {
  const allocations = Array.isArray(transaction?.discount?.lines) ? transaction.discount.lines : [];
  const lineId = Number(line?.line_id ?? line?.id);
  if (!Number.isFinite(lineId)) return null;
  return allocations.find((allocation) => Number(allocation?.transaction_line_id) === lineId) || null;
};
const allocationAmount = (allocation, field) => {
  const value = Number(allocation?.[field]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};
const grossLineTotal = (transaction, line) => {
  const explicit = Number(line?.gross_amount ?? line?.gross_total ?? line?.gross_subtotal);
  if (Number.isFinite(explicit)) return roundCurrency(explicit);
  const allocation = discountAllocationForLine(transaction, line);
  const persistedAdjustments = allocationAmount(allocation, 'discount_amount')
    + allocationAmount(allocation, 'vat_removed')
    + allocationAmount(line?.item_discount || line?.item_discount_snapshot, 'discount_amount');
  if (persistedAdjustments > 0) return roundCurrency(lineTotal(line) + persistedAdjustments);
  return roundCurrency(Math.max(lineTotal(line), quantity(line) * unitPrice(line)));
};
const lineDiscountAmount = (transaction, line) => {
  const allocation = discountAllocationForLine(transaction, line);
  const itemDiscount = allocationAmount(line?.item_discount || line?.item_discount_snapshot, 'discount_amount');
  if (allocation) return roundCurrency(itemDiscount + allocationAmount(allocation, 'discount_amount'));
  if (itemDiscount > 0) return itemDiscount;
  return roundCurrency(Math.max(0, grossLineTotal(transaction, line) - lineTotal(line)));
};
const discountRowLabel = (transaction) => {
  const label = text(transaction?.discount_label_snapshot, '');
  return label ? `Discount (${label})` : 'Discount';
};
const signedDiscount = (value) => {
  const amount = roundCurrency(value);
  return money(amount > 0 ? -amount : 0);
};
const formatQuantity = (value) => Number.isInteger(Number(value)) ? String(value) : Number(value || 0).toFixed(2);
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const documentInfo = (transaction, receiptContract) => {
  const type = String(receiptContract?.document_type || transaction?.document_type || 'non_fiscal_slip').toLowerCase();
  const context = String(receiptContract?.document_context || transaction?.document_context || (type === 'fiscal_invoice' ? 'fiscal' : 'non_fiscal')).toLowerCase();
  return { fiscal: type === 'fiscal_invoice', training: context === 'training_test' };
};
const parsePaymentBreakdown = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const parseArrayMetadata = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const paymentBreakdownRows = (transaction) => parsePaymentBreakdown(transaction?.payment_breakdown)
  .filter((entry) => Number(entry?.amount || 0) > 0)
  .map((entry) => `<p><span>${escapeHtml(text(entry?.payment_label || entry?.payment_type, 'Payment'))}</span><span>${money(entry.amount)}</span></p>`)
  .join('');

export const normalizePaperWidth = (value) => value === '57mm' ? '57mm' : '80mm';

/**
 * Escaped, dependency-free HTML shared by browser POS and Expo DOM receipt preview.
 * Inputs are intentionally plain data so no platform imports leak across runtimes.
 */
function renderPosReceiptHtmlBase({ transaction, businessSettings = {}, receiptContract = null, paperWidth = '80mm' } = {}) {
  if (!transaction) return '';
  const width = normalizePaperWidth(paperWidth);
  const { fiscal, training } = documentInfo(transaction, receiptContract);
  const vat = !String(businessSettings.pos_taxpayer_type || '').toLowerCase().includes('non');
  const label = fiscal ? (vat ? 'VAT INVOICE' : 'NON-VAT INVOICE') : 'NON-FISCAL SLIP';
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  const discount = transaction.discount && typeof transaction.discount === 'object' ? transaction.discount : null;
  const business = text(businessSettings.pos_business_name, '');
  const registered = text(businessSettings.pos_registered_name, '');
  const icon = text(businessSettings.storefront_profile_image_url || businessSettings.profile_image_url, '');
  const discountType = String(discount?.discount_type || '').trim().toLowerCase();
  const statutoryDiscount = discountType === 'senior' || discountType === 'pwd';
  const iconAlt = business ? `${business} icon` : 'Business icon';
  const itemRows = lines.map((line, index) => {
    // Sale-time snapshot wins over the live item join, so a later item
    // rename/delete can never retro-change a historical receipt.
    const name = text(line.item_name_snapshot || line.item?.name || line.item_snapshot?.name || line.name || `Item #${line.item_id || index + 1}`);
    const modifiers = parseArrayMetadata(line.fnb_modifiers_snapshot);
    const addOns = modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', ');
    const lineNote = text(line.fnb_special_instructions, '');
    const netTotal = roundCurrency(lineTotal(line));
    const itemDiscountAmount = allocationAmount(line?.item_discount || line?.item_discount_snapshot, 'discount_amount');
    const globalDiscountAmount = allocationAmount(discountAllocationForLine(transaction, line), 'discount_amount');
    const discountAmount = roundCurrency(itemDiscountAmount + globalDiscountAmount);
    const grossTotal = discountAmount > 0 ? grossLineTotal(transaction, line) : netTotal;
    const discountRows = [
      itemDiscountAmount > 0 ? `<div class="grid line-adjustment"><span>Item Discount</span><span></span><span></span><span>${signedDiscount(itemDiscountAmount)}</span></div>` : '',
      globalDiscountAmount > 0 ? `<div class="grid line-adjustment"><span>${escapeHtml(discountRowLabel(transaction))}</span><span></span><span></span><span>${signedDiscount(globalDiscountAmount)}</span></div>` : '',
      discountAmount > 0 ? `<div class="grid line-net-total"><span>NET TOTAL</span><span></span><span></span><strong>${money(netTotal)}</strong></div>` : ''
    ].join('');
    const addOnMarkup = addOns ? `<small class="add-ons">Add-ons: ${escapeHtml(addOns)}</small>` : '';
    const noteMarkup = lineNote ? `<small class="line-note">Note: ${escapeHtml(lineNote)}</small>` : '';
    return `<div class="line"><div class="grid"><strong>${escapeHtml(name)}</strong><span>${money(unitPrice(line))}</span><span>${formatQuantity(quantity(line))}</span><strong>${money(grossTotal)}</strong></div>${discountRows}${addOnMarkup}${noteMarkup}</div>`;
  }).join('');
  const governedRows = discount ? [
    ['VAT Removed', discount.vat_removed], ['VAT-Exempt Amount', discount.vat_exempt_amount], ['Customer', discount.customer_name], ['Employee', discount.employee_name], ['Employee ID', discount.employee_id], ['Promo Code', discount.promo_code], ['Discount Type', displayDiscountType(discount.discount_type)], ['Reason', discount.reason]
  ].filter(([, value]) => value != null && value !== '' && Number(value) !== 0).map(([labelText, value]) => `<p><span>${escapeHtml(labelText)}</span><span>${escapeHtml(typeof value === 'number' ? money(value) : value)}</span></p>`).join('') : '';
  const fiscalRows = fiscal ? `<p><span>Vatable Sales</span><span>${money(transaction.vatable_sales)}</span></p><p><span>VAT 12%</span><span>${money(transaction.vat_amount)}</span></p><p><span>VAT Exempt Sales</span><span>${money(transaction.vat_exempt_sales)}</span></p><p><span>Zero Rated Sales</span><span>${money(transaction.zero_rated_sales)}</span></p>` : `<p><span>Estimated Tax</span><span>Included</span></p>`;
  const fiscalHeaderRows = fiscal
    ? `<div>${vat ? 'VAT' : 'NON-VAT'} REG TIN: ${escapeHtml(text(businessSettings.pos_tin_branch))}</div><div>MIN: ${escapeHtml(text(businessSettings.pos_min_number))}</div><div>PTU: ${escapeHtml(text(businessSettings.pos_ptu_number))}</div><div>ATP/OCN No.: ${escapeHtml(text(businessSettings.pos_accreditation_number))}</div>`
    : '';
  const statutoryReceiptFields = statutoryDiscount
    ? `<div class="statutory"><p>SC/PWD/NAAC/MOV/Solo Parent ID No.: ${escapeHtml(text(discount?.senior_pwd_id_number, '____________'))}</p><p>Signature: __________________________</p></div>`
    : '';
  return `<style>
  .dgfy-receipt{--receipt-width:${width};box-sizing:border-box;width:var(--receipt-width);max-width:100%;margin:auto;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font:11px/1.22 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 1px 3px #0f172a1a}.dgfy-receipt *{box-sizing:border-box}.dgfy-receipt .head,.dgfy-receipt .footer{border-bottom:1px dashed #cbd5e1;padding-bottom:8px;margin-bottom:8px;text-align:center}.dgfy-receipt .logo{max-width:80px;max-height:72px;object-fit:contain;margin:0 auto 6px;display:block}.dgfy-receipt h3{margin:6px 0 0;font-size:12px;letter-spacing:.05em}.dgfy-receipt p{display:flex;justify-content:space-between;gap:8px;margin:2px 0}.dgfy-receipt .notice{display:block;margin-top:5px;padding:3px 6px;border:1px solid #fcd34d;background:#fffbeb;color:#b45309;border-radius:5px;font-size:9px}.dgfy-receipt .notice.training{border-color:#fca5a5;background:#fef2f2;color:#b91c1c}.dgfy-receipt .meta{text-align:left;margin-top:8px;color:#334155}.dgfy-receipt .columns,.dgfy-receipt .grid{display:grid;grid-template-columns:minmax(0,1fr) 3.25rem 1.25rem 3.25rem;gap:4px}.dgfy-receipt .columns{padding-bottom:4px;border-bottom:1px dashed #cbd5e1;font-size:8px;color:#64748b;text-transform:uppercase}.dgfy-receipt .columns span:not(:first-child),.dgfy-receipt .grid span,.dgfy-receipt .grid strong:not(:first-child){text-align:right}.dgfy-receipt .line{padding:5px 0;border-bottom:1px dashed #e2e8f0}.dgfy-receipt .line small{display:block;color:#64748b;margin-top:2px;padding-left:2ch}.dgfy-receipt .line-adjustment{color:#b45309;font-size:10px;padding-top:2px}.dgfy-receipt .line-net-total{border-top:1px dotted #cbd5e1;margin-top:2px;padding-top:2px;color:#020617;font-weight:800}.dgfy-receipt .summary,.dgfy-receipt .payment{border-top:1px dashed #cbd5e1;margin-top:8px;padding-top:8px;color:#475569}.dgfy-receipt .summary .total{border-top:1px solid #cbd5e1;padding-top:4px;margin-top:4px;color:#020617;font-size:12px;font-weight:800}.dgfy-receipt .footer{border-bottom:0;border-top:1px dashed #cbd5e1;margin:8px 0 0;padding:8px 0 0;color:#64748b;display:block}.dgfy-receipt .footer p{display:block;margin:2px 0}.dgfy-receipt .buyer{border-top:1px dashed #cbd5e1;margin-top:8px;padding-top:8px;text-align:left;color:#334155}.dgfy-receipt[data-paper-width="57mm"]{font-size:10px}.dgfy-receipt[data-paper-width="57mm"] .columns,.dgfy-receipt[data-paper-width="57mm"] .grid{grid-template-columns:minmax(0,1fr) 2.45rem 1.05rem 2.45rem;gap:3px}.dgfy-receipt[data-paper-width="57mm"] .logo{max-width:64px}.dgfy-receipt .add-ons{font-weight:600}.dgfy-receipt .line-note{font-style:italic}@media print{.dgfy-receipt{border:0;border-radius:0;box-shadow:none;padding:0}}
  </style><article class="dgfy-receipt" data-paper-width="${width}"><header class="head">${icon ? `<img class="logo" src="${escapeHtml(icon)}" alt="${escapeHtml(iconAlt)}">` : ''}${registered ? `<strong>${escapeHtml(registered.toUpperCase())}</strong>` : ''}${business && business.toLowerCase() !== 'dgfy' ? `<div>${escapeHtml(business.toUpperCase())}</div>` : ''}${businessSettings.pos_address ? `<div>${escapeHtml(businessSettings.pos_address)}</div>` : ''}<h3>${label}</h3>${!fiscal ? `<div class="notice ${training ? 'training' : ''}"><strong>NOT A FISCAL RECEIPT</strong><br>${training ? 'Training/Test mode only' : 'Non-fiscal document'}</div>` : fiscalHeaderRows}${fiscal ? `<div class="buyer"><strong>SOLD TO:</strong><p>Customer/Registered Name: ${escapeHtml(text(transaction.customer_name || transaction.buyer_name, '________________'))}</p><p>TIN: ${escapeHtml(text(transaction.buyer_tin, '________________'))}</p><p>Business Address: ${escapeHtml(text(transaction.buyer_address, '____________________'))}</p>${transaction.buyer_business_style ? `<p>Business Style: ${escapeHtml(transaction.buyer_business_style)}</p>` : ''}</div>` : ''}<div class="meta"><p><span>Receipt No.</span><span>${escapeHtml(text(transaction.invoice_number))}</span></p><p><span>Date/Time</span><span>${escapeHtml(dateTime(transaction.created_at))}</span></p><p><span>Terminal</span><span>${escapeHtml(text(transaction.terminal_id))}</span></p><p><span>Cashier</span><span>${escapeHtml(text(transaction.cashier?.username || transaction.acceptedByUser?.username))}</span></p></div></header><section>${lines.length ? `<div class="columns"><span>Item</span><span>Unit Price</span><span>Qty</span><span>Total</span></div>${itemRows}` : ''}</section><section class="summary"><p><strong>TOTAL SALES</strong><span>${money(transaction.subtotal_amount)}</span></p>${governedRows}${fiscalRows}<p><span>${escapeHtml(discountRowLabel(transaction))}</span><span>${signedDiscount(transaction.discount_amount)}</span></p><p><span>${escapeHtml(transaction.service_fee_label_snapshot || 'DGFY convenience fee')}${transaction.service_fee_method_snapshot ? ` (${escapeHtml(transaction.service_fee_method_snapshot)})` : ''}</span><span>${money(transaction.service_fee_amount)}</span></p>${Number(transaction.restaurant_service_charge_amount || 0) ? `<p><span>${escapeHtml(transaction.restaurant_service_charge_label_snapshot || 'Restaurant service charge')}</span><span>${money(transaction.restaurant_service_charge_amount)}</span></p>` : ''}${Number(transaction.delivery_fee || 0) ? `<p><span>Delivery Fee</span><span>${money(transaction.delivery_fee)}</span></p>` : ''}<p class="total"><span>TOTAL AMOUNT DUE</span><span>${money(transaction.total_amount)}</span></p></section><section class="payment"><p><span>Payment Method:</span><span>${escapeHtml(upper(transaction.payment_type))}</span></p><p><span>Payment Status:</span><span>${escapeHtml(upper(transaction.payment_status))}</span></p>${transaction.payment_reference ? `<p><span>Payment Reference:</span><span>${escapeHtml(transaction.payment_reference)}</span></p>` : ''}${transaction.payment_type === 'cash' ? `<p><span>Cash Received:</span><span>${money(transaction.cash_received)}</span></p><p><span>Change:</span><span>${money(transaction.change_amount)}</span></p>` : ''}${statutoryReceiptFields}</section><footer class="footer"><p><strong>${fiscal ? 'FISCAL RECEIPT' : 'NON-FISCAL RECEIPT'}</strong></p><p>${fiscal ? 'Includes tax breakdown and fiscal identifiers.' : 'This document is not an official tax receipt.'}</p>${businessSettings.pos_receipt_footer_message ? `<p>${escapeHtml(businessSettings.pos_receipt_footer_message)}</p>` : ''}<p>Thank you. Please come again.</p><p><strong>Powered by DGFY POS</strong></p></footer></article>`;
}

export function renderPosReceiptHtml(input = {}) {
  const html = renderPosReceiptHtmlBase(input);
  const breakdown = paymentBreakdownRows(input?.transaction);
  if (!breakdown || !html) return html;
  return html.replace(
    '</section><footer class="footer">',
    `<p><strong>Payment Breakdown</strong><span></span></p>${breakdown}</section><footer class="footer">`
  );
}

function renderThermalReceiptTextBase(input = {}) {
  const transaction = input.transaction || {};
  const width = normalizePaperWidth(input.paperWidth);
  const columns = width === '57mm' ? 32 : 42;
  const rule = '-'.repeat(columns);
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  const pair = (label, value) => `${label}`.slice(0, columns - String(value).length - 1).padEnd(columns - String(value).length, ' ') + String(value);
  const lineRows = lines.flatMap((line) => {
    const netTotal = roundCurrency(lineTotal(line));
    const itemDiscountAmount = allocationAmount(line?.item_discount || line?.item_discount_snapshot, 'discount_amount');
    const globalDiscountAmount = allocationAmount(discountAllocationForLine(transaction, line), 'discount_amount');
    const discountAmount = roundCurrency(itemDiscountAmount + globalDiscountAmount);
    const grossTotal = discountAmount > 0 ? grossLineTotal(transaction, line) : netTotal;
    const modifiers = parseArrayMetadata(line.fnb_modifiers_snapshot);
    const addOns = modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', ');
    const lineNote = text(line.fnb_special_instructions, '');
    const rows = [
      text(line.item_name_snapshot || line.item?.name || line.item_snapshot?.name || line.name, 'Item'),
      pair(`${formatQuantity(quantity(line))} x ${money(unitPrice(line))}`, money(grossTotal))
    ];
    if (addOns) rows.push(`  Add-ons: ${addOns}`.slice(0, columns));
    if (lineNote) rows.push(`  Note: ${lineNote}`.slice(0, columns));
    if (discountAmount > 0) {
      if (itemDiscountAmount > 0) rows.push(pair('Item Discount', signedDiscount(itemDiscountAmount)));
      if (globalDiscountAmount > 0) rows.push(pair(discountRowLabel(transaction), signedDiscount(globalDiscountAmount)));
      rows.push(pair('NET TOTAL', money(netTotal)));
    }
    return rows;
  });
  const summaryRows = [
    rule,
    ...(Number.isFinite(Number(transaction.subtotal_amount)) ? [pair('TOTAL SALES', money(transaction.subtotal_amount))] : []),
    ...(Number(transaction.discount_amount || 0) > 0 ? [pair(discountRowLabel(transaction), signedDiscount(transaction.discount_amount))] : []),
    pair('TOTAL AMOUNT DUE', money(transaction.total_amount)),
    pair('Payment', upper(transaction.payment_type)),
    rule,
    'Thank you. Please come again.'
  ];
  return [text(input.businessSettings?.pos_business_name, 'DGFY POS'), rule, pair('Receipt No.', text(transaction.invoice_number)), pair('Date/Time', dateTime(transaction.created_at)), ...lineRows, ...summaryRows].join('\n');
}

export function renderThermalReceiptText(input = {}) {
  const rendered = renderThermalReceiptTextBase(input);
  const transaction = input.transaction || {};
  const breakdown = parsePaymentBreakdown(transaction.payment_breakdown).filter((entry) => Number(entry?.amount || 0) > 0);
  if (!breakdown.length) return rendered;
  const columns = normalizePaperWidth(input.paperWidth) === '57mm' ? 32 : 42;
  const pair = (label, value) => `${label}`.slice(0, columns - String(value).length - 1).padEnd(columns - String(value).length, ' ') + String(value);
  const paymentLine = pair('Payment', upper(transaction.payment_type));
  const rows = breakdown.map((entry) => `${entry.payment_label || upper(entry.payment_type)} ${money(entry.amount)}`).join('\n');
  return rendered.replace(paymentLine, `${paymentLine}\n${rows}`);
}
