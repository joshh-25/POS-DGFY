import { ArrowDownRight, ArrowUpRight, BarChart3, Receipt, ShoppingCart, Tag, TrendingUp } from 'lucide-react';

const money = (value, currencySymbol = '₱') => {
  const symbol = String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol;
  return `${symbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calculateKpiDelta = (current, previous) => {
  const currentValue = Number(current);
  const previousValue = Number(previous);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
};

export const getProfitOnly = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
};

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
  delta = null,
  inverse = false,
  footer,
  className = ''
}) {
  const hasDelta = Number.isFinite(delta);
  const shouldShowFooter = hasDelta || Boolean(footer);
  const isImprovement = inverse ? delta <= 0 : delta >= 0;
  const DeltaIcon = isImprovement ? ArrowUpRight : ArrowDownRight;
  const deltaText = hasDelta ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : null;

  return (
    <article className={`min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] sm:px-3 sm:py-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
        <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 ${accents[accent] || accents.blue}`}>
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold leading-tight text-slate-500">{label}</p>
          <p className="mt-1 min-w-0 break-words text-[clamp(0.6875rem,3.5vw,0.8125rem)] font-black leading-tight tracking-tight text-[#102A56] sm:truncate sm:text-[18px] sm:leading-none">{value}</p>
          {shouldShowFooter ? (
            <div className={`mt-1 flex min-h-4 min-w-0 items-start gap-1 text-[10px] font-bold leading-tight sm:mt-2 sm:items-center sm:leading-none ${hasDelta ? (isImprovement ? 'text-emerald-600' : 'text-rose-500') : 'text-slate-400'}`}>
              {hasDelta ? <DeltaIcon className="h-3 w-3 shrink-0" strokeWidth={2.75} aria-hidden="true" /> : null}
              <span className="min-w-0 break-words">{footer || `${deltaText} vs previous period`}</span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function PosReportsKpiCards({
  summaryCards = {},
  dailySummary = {},
  comparison = {},
  currencySymbol = '₱',
  selectedTender = null
}) {
  const symbol = String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol;
  const previous = comparison?.previous || {};
  const monetaryLabel = (label) => `${label} (${symbol})`;
  const cards = [
    {
      label: monetaryLabel('Total Sales'),
      value: money(summaryCards.total_sales, symbol),
      current: summaryCards.total_sales,
      previous: previous.net_sales,
      Icon: ShoppingCart,
      accent: 'blue'
    },
    {
      label: monetaryLabel('Gross Sales'),
      value: money(summaryCards.gross_sales, symbol),
      current: summaryCards.gross_sales,
      previous: previous.gross_sales,
      Icon: BarChart3,
      accent: 'blue'
    },
    {
      label: 'Transactions',
      value: Number(summaryCards.total_transactions || 0).toLocaleString('en-US'),
      current: summaryCards.total_transactions,
      previous: previous.total_transactions,
      Icon: Receipt,
      accent: 'purple'
    },
    {
      label: monetaryLabel('All Discounts'),
      value: money(dailySummary.discounts, symbol),
      current: dailySummary.discounts,
      previous: previous.discounts,
      Icon: Tag,
      accent: 'red',
      inverse: true
    },
    {
      label: monetaryLabel('Profit'),
      value: money(getProfitOnly(summaryCards.pos_profit_loss), symbol),
      current: getProfitOnly(summaryCards.pos_profit_loss),
      previous: getProfitOnly(previous.pos_profit_loss),
      Icon: TrendingUp,
      accent: 'teal',
      className: 'col-span-2 xl:col-span-1'
    }
  ];

  return (
    <div className={`order-1 grid grid-cols-2 gap-2.5 ${selectedTender ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
      {cards.map((card) => (
        <PosReportsKpiCard
          key={card.label}
          {...card}
          delta={calculateKpiDelta(card.current, card.previous)}
        />
      ))}
      {selectedTender ? (
        <PosReportsKpiCard
          label={monetaryLabel(`${selectedTender.payment_label} Collected`)}
          value={money(selectedTender.amount, symbol)}
          Icon={Receipt}
          accent="purple"
          footer={`${Number(selectedTender.transaction_count || 0).toLocaleString('en-US')} completed transactions; whole-transaction tender, excluding voids/refunds`}
        />
      ) : null}
    </div>
  );
}
