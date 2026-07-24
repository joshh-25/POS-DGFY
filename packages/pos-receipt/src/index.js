const money = (value) => Number(value || 0).toFixed(2);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const text = (value, fallback = '-') => String(value ?? '').trim() || fallback;
const upper = (value) => text(value, '').replaceAll('_', ' ').toUpperCase();
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
const formatQuantity = (value) => Number.isInteger(Number(value)) ? String(value) : Number(value || 0).toFixed(2);
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const documentInfo = (transaction, receiptContract) => {
  const type = String(receiptContract?.document_type || transaction?.document_type || 'non_fiscal_slip').toLowerCase();
  const context = String(receiptContract?.document_context || transaction?.document_context || (type === 'fiscal_invoice' ? 'fiscal' : 'non_fiscal')).toLowerCase();
  return { fiscal: type === 'fiscal_invoice', training: context === 'training_test' };
};

export const normalizePaperWidth = (value) => value === '57mm' ? '57mm' : '80mm';

/**
 * Escaped, dependency-free HTML shared by browser POS and Expo DOM receipt preview.
 * Inputs are intentionally plain data so no platform imports leak across runtimes.
 */
export function renderPosReceiptHtml({ transaction, businessSettings = {}, receiptContract = null, paperWidth = '80mm' } = {}) {
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
  const itemRows = lines.map((line, index) => {
    const name = text(line.item?.name || line.item_snapshot?.name || line.name || `Item #${line.item_id || index + 1}`);
    const modifiers = Array.isArray(line.fnb_modifiers_snapshot) ? line.fnb_modifiers_snapshot : (() => { try { return JSON.parse(line.fnb_modifiers_snapshot || '[]'); } catch { return []; } })();
    const notes = [modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', '), line.fnb_special_instructions].filter(Boolean).join(' · ');
    return `<div class="line"><div class="grid"><strong>${escapeHtml(name)}</strong><span>${money(unitPrice(line))}</span><span>${formatQuantity(quantity(line))}</span><strong>${money(lineTotal(line))}</strong></div>${notes ? `<small>Modifiers: ${escapeHtml(notes)}</small>` : ''}</div>`;
  }).join('');
  const governedRows = discount ? [
    ['VAT Removed', discount.vat_removed], ['VAT-Exempt Amount', discount.vat_exempt_amount], ['Customer', discount.customer_name], ['Senior/PWD ID', discount.senior_pwd_id_number], ['Employee', discount.employee_name], ['Employee ID', discount.employee_id], ['Promo Code', discount.promo_code], ['Discount Type', upper(discount.discount_type)], ['Reason', discount.reason]
  ].filter(([, value]) => value != null && value !== '' && Number(value) !== 0).map(([labelText, value]) => `<p><span>${escapeHtml(labelText)}</span><span>${escapeHtml(typeof value === 'number' ? money(value) : value)}</span></p>`).join('') : '';
  const fiscalRows = fiscal ? `<p><span>Vatable Sales</span><span>${money(transaction.vatable_sales)}</span></p><p><span>VAT 12%</span><span>${money(transaction.vat_amount)}</span></p><p><span>VAT Exempt Sales</span><span>${money(transaction.vat_exempt_sales)}</span></p><p><span>Zero Rated Sales</span><span>${money(transaction.zero_rated_sales)}</span></p>` : `<p><span>Estimated Tax</span><span>Included</span></p>`;
  return `<style>
  .dgfy-receipt{--receipt-width:${width};box-sizing:border-box;width:var(--receipt-width);max-width:100%;margin:auto;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font:11px/1.22 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 1px 3px #0f172a1a}.dgfy-receipt *{box-sizing:border-box}.dgfy-receipt .head,.dgfy-receipt .footer{border-bottom:1px dashed #cbd5e1;padding-bottom:8px;margin-bottom:8px;text-align:center}.dgfy-receipt .logo{max-width:80px;max-height:72px;object-fit:contain;margin:0 auto 6px;display:block}.dgfy-receipt h3{margin:6px 0 0;font-size:12px;letter-spacing:.05em}.dgfy-receipt p{display:flex;justify-content:space-between;gap:8px;margin:2px 0}.dgfy-receipt .notice{display:block;margin-top:5px;padding:3px 6px;border:1px solid #fcd34d;background:#fffbeb;color:#b45309;border-radius:5px;font-size:9px}.dgfy-receipt .notice.training{border-color:#fca5a5;background:#fef2f2;color:#b91c1c}.dgfy-receipt .meta{text-align:left;margin-top:8px;color:#334155}.dgfy-receipt .columns,.dgfy-receipt .grid{display:grid;grid-template-columns:minmax(0,1fr) 3.25rem 1.25rem 3.25rem;gap:4px}.dgfy-receipt .columns{padding-bottom:4px;border-bottom:1px dashed #cbd5e1;font-size:8px;color:#64748b;text-transform:uppercase}.dgfy-receipt .columns span:not(:first-child),.dgfy-receipt .grid span,.dgfy-receipt .grid strong:not(:first-child){text-align:right}.dgfy-receipt .line{padding:5px 0;border-bottom:1px dashed #e2e8f0}.dgfy-receipt .line small{display:block;color:#64748b;margin-top:2px}.dgfy-receipt .summary,.dgfy-receipt .payment{border-top:1px dashed #cbd5e1;margin-top:8px;padding-top:8px;color:#475569}.dgfy-receipt .summary .total{border-top:1px solid #cbd5e1;padding-top:4px;margin-top:4px;color:#020617;font-size:12px;font-weight:800}.dgfy-receipt .footer{border-bottom:0;border-top:1px dashed #cbd5e1;margin:8px 0 0;padding:8px 0 0;color:#64748b;display:block}.dgfy-receipt .footer p{display:block;margin:2px 0}.dgfy-receipt .buyer{border-top:1px dashed #cbd5e1;margin-top:8px;padding-top:8px;text-align:left;color:#334155}.dgfy-receipt[data-paper-width="57mm"]{font-size:10px}.dgfy-receipt[data-paper-width="57mm"] .columns,.dgfy-receipt[data-paper-width="57mm"] .grid{grid-template-columns:minmax(0,1fr) 2.45rem 1.05rem 2.45rem;gap:3px}.dgfy-receipt[data-paper-width="57mm"] .logo{max-width:64px}@media print{.dgfy-receipt{border:0;border-radius:0;box-shadow:none;padding:0}}
  </style><article class="dgfy-receipt" data-paper-width="${width}"><header class="head">${icon ? `<img class="logo" src="${escapeHtml(icon)}" alt="Business icon">` : ''}${registered ? `<strong>${escapeHtml(registered.toUpperCase())}</strong>` : ''}${business && business.toLowerCase() !== 'dgfy' ? `<div>${escapeHtml(business.toUpperCase())}</div>` : ''}${businessSettings.pos_address ? `<div>${escapeHtml(businessSettings.pos_address)}</div>` : ''}<h3>${label}</h3>${!fiscal ? `<div class="notice ${training ? 'training' : ''}"><strong>NOT A FISCAL RECEIPT</strong><br>${training ? 'Training/Test mode only' : 'Non-fiscal document'}</div>` : `<div>${vat ? 'VAT' : 'NON-VAT'} REG TIN: ${escapeHtml(text(businessSettings.pos_tin_branch))}<br>MIN: ${escapeHtml(text(businessSettings.pos_min_number))}<br>PTU: ${escapeHtml(text(businessSettings.pos_ptu_number))}<br>ATP/OCN No.: ${escapeHtml(text(businessSettings.pos_accreditation_number))}</div>`}${fiscal ? `<div class="buyer"><strong>SOLD TO:</strong><br>Customer/Registered Name: ${escapeHtml(text(transaction.customer_name || transaction.buyer_name, '________________'))}<br>TIN: ${escapeHtml(text(transaction.buyer_tin, '________________'))}<br>Business Address: ${escapeHtml(text(transaction.buyer_address, '____________________'))}</div>` : ''}<div class="meta"><p><span>Receipt No.</span><span>${escapeHtml(text(transaction.invoice_number))}</span></p><p><span>Date/Time</span><span>${escapeHtml(dateTime(transaction.created_at))}</span></p><p><span>Terminal</span><span>${escapeHtml(text(transaction.terminal_id))}</span></p><p><span>Cashier</span><span>${escapeHtml(text(transaction.cashier?.username || transaction.acceptedByUser?.username))}</span></p></div></header><section>${lines.length ? `<div class="columns"><span>Item</span><span>Unit Price</span><span>Qty</span><span>Line</span></div>${itemRows}` : ''}</section><section class="summary"><p><strong>TOTAL SALES</strong><span>${money(transaction.subtotal_amount)}</span></p>${governedRows}${fiscalRows}<p><span>Discount${transaction.discount_label_snapshot ? ` (${escapeHtml(transaction.discount_label_snapshot)})` : ''}</span><span>${money(transaction.discount_amount)}</span></p><p><span>${escapeHtml(transaction.service_fee_label_snapshot || 'DGFY convenience fee')}${transaction.service_fee_method_snapshot ? ` (${escapeHtml(transaction.service_fee_method_snapshot)})` : ''}</span><span>${money(transaction.service_fee_amount)}</span></p>${Number(transaction.restaurant_service_charge_amount || 0) ? `<p><span>${escapeHtml(transaction.restaurant_service_charge_label_snapshot || 'Restaurant service charge')}</span><span>${money(transaction.restaurant_service_charge_amount)}</span></p>` : ''}${Number(transaction.delivery_fee || 0) ? `<p><span>Delivery Fee</span><span>${money(transaction.delivery_fee)}</span></p>` : ''}<p class="total"><span>TOTAL AMOUNT DUE</span><span>${money(transaction.total_amount)}</span></p></section><section class="payment"><p><span>Payment Method:</span><span>${escapeHtml(upper(transaction.payment_type))}</span></p><p><span>Payment Status:</span><span>${escapeHtml(upper(transaction.payment_status))}</span></p>${transaction.payment_reference ? `<p><span>Payment Reference:</span><span>${escapeHtml(transaction.payment_reference)}</span></p>` : ''}${transaction.payment_type === 'cash' ? `<p><span>Cash Received:</span><span>${money(transaction.cash_received)}</span></p><p><span>Change:</span><span>${money(transaction.change_amount)}</span></p>` : ''}</section><footer class="footer"><p><strong>${fiscal ? 'FISCAL RECEIPT' : 'NON-FISCAL RECEIPT'}</strong></p><p>${fiscal ? 'Includes tax breakdown and fiscal identifiers.' : 'This document is not an official tax receipt.'}</p>${businessSettings.pos_receipt_footer_message ? `<p>${escapeHtml(businessSettings.pos_receipt_footer_message)}</p>` : ''}<p>Thank you. Please come again.</p><p><strong>Powered by DGFY POS</strong></p></footer></article>`;
}

export function renderThermalReceiptText(input = {}) {
  const transaction = input.transaction || {};
  const width = normalizePaperWidth(input.paperWidth);
  const columns = width === '57mm' ? 32 : 42;
  const rule = '-'.repeat(columns);
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  const pair = (label, value) => `${label}`.slice(0, columns - String(value).length - 1).padEnd(columns - String(value).length, ' ') + String(value);
  return [text(input.businessSettings?.pos_business_name, 'DGFY POS'), rule, pair('Receipt No.', text(transaction.invoice_number)), pair('Date/Time', dateTime(transaction.created_at)), rule, ...lines.flatMap((line) => [text(line.item?.name || line.item_snapshot?.name || line.name, 'Item'), pair(`${formatQuantity(quantity(line))} x ${money(unitPrice(line))}`, money(lineTotal(line)))]), rule, pair('TOTAL AMOUNT DUE', money(transaction.total_amount)), pair('Payment', upper(transaction.payment_type)), rule, 'Thank you. Please come again.'].join('\n');
}
