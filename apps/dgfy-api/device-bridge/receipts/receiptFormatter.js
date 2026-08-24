const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const paymentBreakdownLabel = (entry) => String(
  entry?.payment_label || entry?.payment_type || 'Other'
).replace(/_/g, ' ');

const clampWidth = (value = 48) => Math.max(32, Math.min(Number.parseInt(value, 10) || 48, 64));

const truncate = (value, max = 48) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3))}...`;
};

const wrapText = (value, max = 48) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines = [];
  let current = '';

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= max) {
      current = candidate;
      return;
    }

    lines.push(truncate(current, max));
    current = word;
  });

  if (current) {
    lines.push(truncate(current, max));
  }

  return lines;
};

const padRight = (value, width) => {
  const normalized = truncate(value, width);
  return normalized.padEnd(width, ' ');
};

const padLeft = (value, width) => {
  const normalized = truncate(value, width);
  return normalized.padStart(width, ' ');
};

const buildKeyValueLine = (label, value, width) => {
  const safeLabel = truncate(label, Math.max(8, width - 14));
  const safeValue = truncate(value, Math.max(8, width - safeLabel.length - 1));
  const spacing = Math.max(1, width - safeLabel.length - safeValue.length);
  return `${safeLabel}${' '.repeat(spacing)}${safeValue}`;
};

const buildLineItemRows = (line, width) => {
  const nameWidth = width;
  const detailWidth = width;
  const qtyText = `Qty ${Number(line?.quantity || 0).toFixed(2)}`;
  const unitText = money(line?.sale_price);
  const totalText = money(line?.line_subtotal);
  const leftWidth = Math.max(12, detailWidth - totalText.length - 1);
  const leftText = truncate(`${qtyText} x ${unitText}`, leftWidth);

  return [
    ...wrapText(line?.item_name || 'Item', nameWidth),
    `${padRight(leftText, leftWidth)} ${padLeft(totalText, totalText.length)}`
  ];
};

export const buildReceiptLines = (receipt = {}, { width = 48 } = {}) => {
  const normalizedWidth = clampWidth(width);
  const business = receipt?.business || {};
  const transaction = receipt?.transaction || {};
  const contract = receipt?.receipt_contract || {};
  const lines = Array.isArray(transaction?.lines) ? transaction.lines : [];
  const divider = '-'.repeat(normalizedWidth);
  const output = [
    business.name || 'DGFY',
    ...wrapText(business.address || '', normalizedWidth),
    business.tin_branch ? `TIN/Branch: ${business.tin_branch}` : '',
    contract.document_type === 'fiscal_invoice' ? 'FISCAL INVOICE' : 'NON-FISCAL SLIP',
    transaction.invoice_number ? `Invoice: ${transaction.invoice_number}` : '',
    transaction.created_at ? `Date: ${new Date(transaction.created_at).toLocaleString()}` : '',
    divider
  ].filter(Boolean);

  lines.forEach((line) => output.push(...buildLineItemRows(line, normalizedWidth)));

  output.push(divider);
  output.push(buildKeyValueLine('Subtotal', money(transaction.subtotal_amount), normalizedWidth));
  output.push(buildKeyValueLine('Discount', money(transaction.discount_amount), normalizedWidth));
  if (Number(transaction.restaurant_service_charge_amount || 0) > 0) {
    output.push(buildKeyValueLine('Svc Charge', money(transaction.restaurant_service_charge_amount), normalizedWidth));
  }
  output.push(buildKeyValueLine('VAT Amount (12%)', money(transaction.vat_amount), normalizedWidth));
  output.push(buildKeyValueLine('Total', money(transaction.total_amount), normalizedWidth));
  output.push(divider);
  if (business.footer_message) {
    output.push(...wrapText(business.footer_message, normalizedWidth));
  }
  output.push(`Receipt contract: ${contract.version || '2026.04.08'}`);

  return output;
};

export const buildShiftSummaryLines = (payload = {}, { width = 48 } = {}) => {
  const normalizedWidth = clampWidth(width);
  const business = payload?.business || {};
  const shift = payload?.shift || {};
  const cash = payload?.cash_summary || {};
  const sales = payload?.sales_summary || {};
  const divider = '-'.repeat(normalizedWidth);
  const lines = [
    business.name || 'DGFY',
    'CASHIER SHIFT SALES SUMMARY',
    shift.business_date ? `Business date: ${shift.business_date}` : '',
    shift.terminal_id ? `Terminal: ${shift.terminal_id}` : '',
    shift.pos_terminal_shift_id ? `Shift: ${shift.pos_terminal_shift_id}` : '',
    divider,
    buildKeyValueLine('Transactions', String(sales.transaction_count || 0), normalizedWidth),
    buildKeyValueLine('Subtotal', money(sales.subtotal_amount), normalizedWidth),
    buildKeyValueLine('Discounts', money(sales.discount_amount), normalizedWidth),
    buildKeyValueLine('VAT', money(sales.vat_amount), normalizedWidth),
    buildKeyValueLine('Total sales', money(sales.total_amount), normalizedWidth),
    buildKeyValueLine('POS voids', money(sales.void_amount), normalizedWidth),
    ...(Number(sales.post_close_void_transaction_count || 0) > 0
      ? [buildKeyValueLine(
        `Post-close voids (${sales.post_close_void_transaction_count})`,
        money(sales.post_close_void_amount),
        normalizedWidth
      )]
      : []),
    divider,
    'PAYMENT BREAKDOWN'
  ].filter(Boolean);

  (Array.isArray(sales.payment_breakdown) ? sales.payment_breakdown : []).forEach((entry) => {
    lines.push(buildKeyValueLine(
      `${paymentBreakdownLabel(entry)} (${entry.count || 0})`,
      money(entry.amount),
      normalizedWidth
    ));
  });

  lines.push(
    divider,
    'CASH RECONCILIATION',
    buildKeyValueLine('Opening float', money(cash.opening_float_amount), normalizedWidth),
    buildKeyValueLine('Cash sales', money(cash.cash_sales_amount), normalizedWidth),
    buildKeyValueLine('Cash in', money(cash.cash_in_total), normalizedWidth),
    buildKeyValueLine('Cash out', money(cash.cash_out_total), normalizedWidth),
    buildKeyValueLine('Expected cash', money(cash.expected_cash_amount), normalizedWidth),
    buildKeyValueLine('Closing cash', money(cash.closing_cash_amount), normalizedWidth),
    buildKeyValueLine('Variance', money(cash.cash_variance_amount), normalizedWidth),
    divider,
    'Keep this report with the cashier close evidence.'
  );

  return lines;
};

export const buildZReadingLines = (payload = {}, { width = 48 } = {}) => {
  const normalizedWidth = clampWidth(width);
  const business = payload?.business || {};
  const reading = payload?.z_reading || {};
  const summary = reading?.summary || {};
  const divider = '-'.repeat(normalizedWidth);
  const lines = [
    business.name || 'DGFY',
    'Z-READING / CLOSE DAY',
    reading.business_date ? `Business date: ${reading.business_date}` : '',
    reading.location_id ? `Location: ${reading.location_id}` : '',
    reading.reading_identifier ? `Reading: ${reading.reading_identifier}` : '',
    reading.generated_at ? `Generated: ${new Date(reading.generated_at).toLocaleString()}` : '',
    divider,
    buildKeyValueLine('Transactions', String(summary.transaction_count || 0), normalizedWidth),
    buildKeyValueLine('Subtotal', money(summary.subtotal_amount), normalizedWidth),
    buildKeyValueLine('Discounts', money(summary.discount_amount), normalizedWidth),
    buildKeyValueLine('VAT', money(summary.vat_amount), normalizedWidth),
    buildKeyValueLine('Total sales', money(summary.total_amount), normalizedWidth),
    buildKeyValueLine('POS voids', money(summary.void_amount), normalizedWidth),
    divider,
    'PAYMENT BREAKDOWN'
  ].filter(Boolean);

  (Array.isArray(summary.payment_breakdown) ? summary.payment_breakdown : []).forEach((entry) => {
    lines.push(buildKeyValueLine(
      `${paymentBreakdownLabel(entry)} (${entry.count || 0})`,
      money(entry.amount),
      normalizedWidth
    ));
  });

  lines.push(
    divider,
    'FISCAL COUNTERS',
    buildKeyValueLine('Z counter', String(reading.z_counter_value || 0), normalizedWidth),
    buildKeyValueLine('Reset counter', String(reading.reset_counter_value || 0), normalizedWidth),
    buildKeyValueLine('Lifetime total', money(Number(reading.lifetime_grand_total_cents || 0) / 100), normalizedWidth),
    divider,
    'Provider refunds are reconciled separately.',
    'Keep this report with the day-end close evidence.'
  );

  return lines;
};
