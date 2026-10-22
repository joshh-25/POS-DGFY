import { AlertTriangle, BarChart3, Package2, Percent, Receipt, Scale, ShoppingCart, Tag } from 'lucide-react';

const numeric = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const money = (value, currencySymbol = '₱') => {
  const symbol = String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol;
  const numericValue = numeric(value || 0);
  const sign = numericValue < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(numericValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const count = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, Math.trunc(numericValue)) : fallback;
};

const distinctTransactionCount = (rows = [], predicate = () => true) => {
  const transactionIds = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!predicate(row)) return;
    const transactionId = row?.pos_transaction_id || row?.transaction_id || row?.invoice_number;
    if (transactionId !== null && transactionId !== undefined && transactionId !== '') {
      transactionIds.add(String(transactionId));
    }
  });
  return transactionIds.size;
};

const isVoidedOrRefunded = (row = {}) => (
  String(row?.status || '').trim().toLowerCase() === 'voided'
  || ['refund_pending', 'partial_refunded', 'refunded'].includes(String(row?.payment_status || '').trim().toLowerCase())
);

const accents = {
  blue: 'bg-blue-50 text-[#2563EB]',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
  red: 'bg-rose-50 text-rose-500',
  teal: 'bg-emerald-50 text-emerald-500'
};

export function PosReportsKpiCard({
  label,
  value,
  Icon,
  accent = 'blue',
  valueClassName = '',
  className = ''
}) {
  return (
    <article className={`min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] sm:px-3 sm:py-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
        <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 ${accents[accent] || accents.blue}`}>
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold leading-tight text-slate-500">{label}</p>
          <p className={`mt-1 min-w-0 break-words text-[clamp(0.6875rem,3.5vw,0.8125rem)] font-black leading-tight tracking-tight text-[#102A56] sm:truncate sm:text-[18px] sm:leading-none ${valueClassName}`}>{value}</p>
        </div>
      </div>
    </article>
  );
}

export default function PosReportsKpiCards({
  variant = 'overview',
  summaryCards = {},
  dailySummary = {},
  currencySymbol = '₱',
  transactionRows = []
}) {
  const symbol = String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol;
  const monetaryLabel = (label) => `${label} (${symbol})`;
  const netSales = numeric(dailySummary.net_sales ?? summaryCards.net_sales ?? summaryCards.total_sales ?? 0);
  const profitLoss = numeric(dailySummary.pos_profit_loss ?? summaryCards.pos_profit_loss ?? 0);
  const hasTransactionStatusEvidence = (Array.isArray(transactionRows) ? transactionRows : [])
    .some((row) => row?.status || row?.payment_status);
  const recordedTransactions = count(
    dailySummary.total_transactions,
    count(summaryCards.total_transactions, distinctTransactionCount(transactionRows))
  );
  const completedTransactions = count(
    dailySummary.completed_transactions,
    hasTransactionStatusEvidence
      ? distinctTransactionCount(transactionRows, (row) => !isVoidedOrRefunded(row)
        && (!row?.status || String(row.status).trim().toLowerCase() === 'completed'))
      : recordedTransactions
  );
  const voidedRefundedTransactions = count(
    dailySummary.voided_refunded_transactions,
    hasTransactionStatusEvidence
      ? distinctTransactionCount(transactionRows, isVoidedOrRefunded)
      : Math.max(0, recordedTransactions - completedTransactions)
  );
  const cardsByVariant = {
    overview: [
      {
        label: monetaryLabel('Net Sales'),
        value: money(netSales, symbol),
        Icon: ShoppingCart,
        accent: 'blue'
      },
      {
        label: 'Transactions',
        value: recordedTransactions.toLocaleString('en-US'),
        Icon: Receipt,
        accent: 'purple'
      },
      {
        label: monetaryLabel('Discounts'),
        value: money(dailySummary.discounts, symbol),
        Icon: Tag,
        accent: 'red'
      },
      {
        label: 'Voided/Refunded',
        value: voidedRefundedTransactions.toLocaleString('en-US'),
        Icon: AlertTriangle,
        accent: 'red'
      }
    ],
    sales: [
      {
        label: monetaryLabel('Gross Sales'),
        value: money(summaryCards.gross_sales ?? dailySummary.gross_sales, symbol),
        Icon: BarChart3,
        accent: 'blue'
      },
      {
        label: monetaryLabel('Discounts'),
        value: money(dailySummary.discounts, symbol),
        Icon: Tag,
        accent: 'red'
      },
      {
        label: monetaryLabel('Net Sales'),
        value: money(netSales, symbol),
        Icon: ShoppingCart,
        accent: 'blue'
      }
    ],
    profit_loss: [
      {
        label: monetaryLabel('Net Sales'),
        value: money(netSales, symbol),
        Icon: ShoppingCart,
        accent: 'blue'
      },
      {
        label: monetaryLabel('Cost of Goods Sold'),
        value: money(dailySummary.cogs ?? summaryCards.cogs, symbol),
        Icon: Package2,
        accent: 'purple'
      },
      {
        label: monetaryLabel('POS Profit/Loss'),
        value: money(profitLoss, symbol),
        Icon: Scale,
        accent: profitLoss < 0 ? 'red' : 'teal'
      },
      {
        label: 'Profit Margin',
        value: `${numeric(dailySummary.profit_margin ?? (netSales > 0 ? (profitLoss / netSales) * 100 : 0)).toFixed(2)}%`,
        Icon: Percent,
        accent: profitLoss < 0 ? 'red' : 'green'
      }
    ]
  };
  const cards = cardsByVariant[variant] || cardsByVariant.overview;
  const desktopGridColumnsClass = cards.length === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-4';

  return (
    <div className={`order-1 grid grid-cols-2 gap-2.5 ${desktopGridColumnsClass}`}>
      {cards.map((card) => (
        <PosReportsKpiCard
          key={card.label}
          {...card}
        />
      ))}
    </div>
  );
}
