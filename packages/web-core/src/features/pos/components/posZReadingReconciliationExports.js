import { formatDeliveryProviderSummaryLabel, parseDeliveryProviderSummary } from '../utils/posDeliveryProviders.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getDailySalesCheckRows = (data, {
  businessDate,
  currencySymbol = '₱',
  formatMoney,
  formatDateTime
} = {}) => {
  if (!data) return [];

  const status = String(data.status || 'not_comparable');
  const isComparable = status === 'matched' || status === 'variance';
  const statusLabel = status === 'matched'
    ? 'Matched'
    : status === 'variance'
      ? 'Variance found'
      : status === 'not_generated'
        ? 'Not generated'
        : 'Comparison unavailable';
  const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const formatAmount = (value) => hasNumber(value) && typeof formatMoney === 'function'
    ? formatMoney(value, currencySymbol)
    : '—';
  const formatCount = (value) => hasNumber(value) ? Number(value).toLocaleString('en-US') : '—';
  const hasZVoidActivity = hasNumber(data.z_void_transaction_count) || hasNumber(data.z_void_amount);
  const zVoids = hasZVoidActivity
    ? `${formatCount(data.z_void_transaction_count)} · ${formatAmount(data.z_void_amount)}`
    : '—';
  const paymentBreakdown = Array.isArray(data.z_payment_breakdown) ? data.z_payment_breakdown : [];
  const formatTimestamp = (value) => value && typeof formatDateTime === 'function' ? formatDateTime(value) : '—';
  const rows = [
    ['Business date', data.business_date || businessDate || '—'],
    ['Status', statusLabel],
    ['Z-reading reference', data.reading_identifier || '—']
  ];

  if (status === 'not_comparable' && data.message) rows.push(['Comparison note', data.message]);

  rows.push(
    ['Report recognized sales', formatAmount(data.report_recognized_sales)],
    ['Z-reading total', formatAmount(data.z_total_amount)],
    ['Difference', isComparable ? formatAmount(data.variance) : '—'],
    ['Report net sales', formatAmount(data.report_net_sales)],
    ['Z voids', zVoids],
    ['Report refunds / voids', formatAmount(data.report_refunds_voids)],
    ['Report adjustments', formatAmount(data.report_adjustment_amount)],
    ['Date & time generated', formatTimestamp(data.generated_at)],
    ['Checked at', formatTimestamp(data.evaluated_at)]
  );

  if (data.snapshot_persisted === true) {
    rows.push(['Payment breakdown (saved Z-reading)', '']);
    if (paymentBreakdown.length === 0) {
      rows.push(['Payments', 'No payment entries recorded']);
    } else {
      paymentBreakdown.forEach((entry) => {
        const label = entry.payment_label || String(entry.payment_type || 'Other payment').replace(/_/g, ' ');
        const count = formatCount(entry.count);
        rows.push([label, `${formatAmount(entry.amount)} · ${count} ${Number(entry.count || 0) === 1 ? 'payment' : 'payments'}`]);
      });
    }
  }

  return rows;
};

const escapeCsvCell = (value) => {
  const text = String(value ?? '');
  const formulaSafeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafeText.replace(/"/g, '""')}"`;
};

export const buildDailySalesCheckCsv = (data, options = {}) => {
  const rows = getDailySalesCheckRows(data, options);
  if (!rows.length) return '';
  return `\uFEFF${[['Metric', 'Value'], ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
};

export const buildDailySalesCheckPrintHtml = (data, options = {}) => {
  const rows = getDailySalesCheckRows(data, options);
  if (!rows.length) return '';

  const tableRows = rows.map(([label, value]) => (
    `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
  )).join('');

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Daily Sales Check</title>
        <style>
          body { color: #0f172a; font-family: Arial, sans-serif; margin: 0 auto; max-width: 900px; padding: 32px; }
          h1 { font-size: 24px; margin: 0 0 8px; }
          p { color: #475569; margin: 0 0 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
          th { color: #475569; font-size: 12px; font-weight: 700; width: 42%; }
          td { font-size: 14px; }
          @media print { body { max-width: none; padding: 0; } tr { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>Daily Sales Check</h1>
        <p>Selected business date reconciliation summary</p>
        <table><tbody>${tableRows}</tbody></table>
      </body>
    </html>`;
};

const formatHistoryDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '—';
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
};

const formatHistoryTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
};

const getZReadingHistoryRows = (rows = [], { currencySymbol = '₱', formatMoney } = {}) => (
  (Array.isArray(rows) ? rows : []).map((row) => {
    const providers = parseDeliveryProviderSummary(row?.summary?.delivery_provider_breakdown);
    return [
      formatHistoryDate(row?.business_date),
      row?.reading_identifier || '—',
      row?.closed_from_terminal_id || '—',
      row?.closed_by_display_name || (row?.closed_by_user_id ? `User #${row.closed_by_user_id}` : '—'),
      row?.summary?.transaction_count ?? '—',
      typeof formatMoney === 'function'
        ? formatMoney(row?.summary?.total_amount, currencySymbol)
        : `${currencySymbol}${Number(row?.summary?.total_amount || 0).toFixed(2)}`,
      providers.length > 0
        ? providers.map((entry) => `${formatDeliveryProviderSummaryLabel(entry)}: ${typeof formatMoney === 'function' ? formatMoney(entry.amount, currencySymbol) : `${currencySymbol}${Number(entry.amount || 0).toFixed(2)}`}`).join(' + ')
        : '—',
      formatHistoryTimestamp(row?.generated_at)
    ];
  })
);

export const buildZReadingHistoryCsv = (rows, options = {}) => {
  const values = getZReadingHistoryRows(rows, options);
  if (!values.length) return '';
  const headers = ['Business date', 'Z-reading reference', 'Terminal', 'Closed by', 'Transactions', 'Z-reading total', 'Delivery providers', 'Generated at'];
  return `\uFEFF${[headers, ...values].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
};

export const buildZReadingHistoryPrintHtml = (rows, {
  currencySymbol = '₱',
  formatMoney,
  dateFrom = '',
  dateTo = '',
  search = ''
} = {}) => {
  const values = getZReadingHistoryRows(rows, { currencySymbol, formatMoney });
  if (!values.length) return '';
  const headers = ['Business date', 'Z-reading reference', 'Terminal', 'Closed by', 'Transactions', 'Z-reading total', 'Delivery providers', 'Generated at'];
  const tableHead = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const tableRows = values.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  const dateLabel = `${dateFrom || 'All dates'}${dateTo ? ` – ${dateTo}` : ''}`;
  const searchLabel = String(search || '').trim();

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Saved Z-reading history</title>
        <style>
          body { color: #0f172a; font-family: Arial, sans-serif; margin: 0 auto; max-width: 1200px; padding: 28px; }
          h1 { font-size: 22px; margin: 0 0 6px; }
          p { color: #475569; font-size: 12px; margin: 0 0 16px; }
          table { border-collapse: collapse; font-size: 10px; width: 100%; }
          th, td { border-bottom: 1px solid #dbe4ef; padding: 8px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
          th { background: #f1f5f9; color: #334155; font-size: 9px; text-transform: uppercase; }
          @media print { body { max-width: none; padding: 0; } tr { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>Saved Z-reading history</h1>
        <p>Business dates: ${escapeHtml(dateLabel)} · ${values.length} saved reading${values.length === 1 ? '' : 's'}${searchLabel ? ` · Search: ${escapeHtml(searchLabel)}` : ''}</p>
        <table><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
      </body>
    </html>`;
};
