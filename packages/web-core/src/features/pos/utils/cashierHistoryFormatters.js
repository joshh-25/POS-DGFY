const DASH = '\u2014';

export const formatCashierHistoryMoney = (value, currency = '\u20b1') => {
  const normalizedCurrency = String(currency || '').toUpperCase();
  const symbol = normalizedCurrency === 'PHP'
    ? '\u20b1'
    : (currency || '\u20b1');
  const amount = Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol}${symbol === '\u20b1' ? '' : ' '}${amount}`;
};

export const getCashierHistoryDateTimeParts = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  };
};

export const formatCashierHistoryTableDate = (value) => {
  if (!value) return DASH;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return DASH;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month}. ${parts.day}, ${parts.year}`;
};

export const formatCashierHistoryDateTime = (value) => {
  const parts = getCashierHistoryDateTimeParts(value);
  return parts ? `${formatCashierHistoryTableDate(value)}, ${parts.time}` : 'Not recorded';
};

export const formatCashierHistoryDuration = (openedAt, closedAt, openLabel = DASH) => {
  if (!closedAt) return openLabel;
  const opened = openedAt ? new Date(openedAt).getTime() : NaN;
  const closed = new Date(closedAt).getTime();
  if (!Number.isFinite(opened) || !Number.isFinite(closed) || closed < opened) return DASH;

  const totalSeconds = Math.floor((closed - opened) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
};

export const formatCashierHistoryPaymentLabel = (entry, fallback = 'Other') => String(
  entry?.payment_label || entry?.payment_type || fallback
).replace(/_/g, ' ');
