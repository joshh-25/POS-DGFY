const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

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
  output.push(buildKeyValueLine('Service Fee', money(transaction.service_fee_amount), normalizedWidth));
  if (Number(transaction.restaurant_service_charge_amount || 0) > 0) {
    output.push(buildKeyValueLine('Svc Charge', money(transaction.restaurant_service_charge_amount), normalizedWidth));
  }
  output.push(buildKeyValueLine('VAT', money(transaction.vat_amount), normalizedWidth));
  output.push(buildKeyValueLine('Total', money(transaction.total_amount), normalizedWidth));
  output.push(divider);
  if (business.footer_message) {
    output.push(...wrapText(business.footer_message, normalizedWidth));
  }
  output.push(`Receipt contract: ${contract.version || '2026.04.08'}`);

  return output;
};
