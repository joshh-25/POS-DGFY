import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const resolveCurrencySymbol = (currencySymbol = '₱') => (
  String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol || '₱'
);

const money = (value, currencySymbol = '₱') => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

const formatCompactMoney = (value, currencySymbol) => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
})}`;

const chartDefinitions = {
  items: {
    nameKey: 'item_name',
    fallbackName: 'Unnamed item',
    description: 'Top items by net sales from the loaded report rows.',
    ariaLabel: 'Item sales chart showing net sales and profit by item',
    legendLabel: 'Item sales chart legend'
  },
  categories: {
    nameKey: 'category_name',
    fallbackName: 'Uncategorized',
    description: 'Top categories by net sales from the loaded report rows.',
    ariaLabel: 'Sales by category chart showing net sales and profit by category',
    legendLabel: 'Sales by category chart legend'
  }
};

const truncateLabel = (value) => {
  const label = String(value || '—');
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
};

const BreakdownChartTooltip = ({ active, payload, label, currencySymbol }) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0]?.payload || {};

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-black text-slate-900">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-1 flex items-center justify-between gap-4 font-semibold text-slate-600">
          <span>{entry.name}</span>
          <span className="font-black text-slate-900">{money(entry.value, currencySymbol)}</span>
        </p>
      ))}
      <div className="mt-2 border-t border-slate-100 pt-2 text-slate-500">
        <p>Quantity: <span className="font-black text-slate-900">{formatNumber(row.quantity)}</span></p>
        <p>Orders: <span className="font-black text-slate-900">{formatNumber(row.orders)}</span></p>
      </div>
    </div>
  );
};

export default function PosReportsBreakdownChart({ breakdown, rows = [], currencySymbol = '₱' }) {
  const definition = chartDefinitions[breakdown];
  if (!definition) return null;

  const chartData = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      ...row,
      label: row?.[definition.nameKey] || definition.fallbackName
    }))
    .sort((left, right) => {
      const salesDifference = Number(right.net_sales || 0) - Number(left.net_sales || 0);
      if (salesDifference !== 0) return salesDifference;
      return String(left.label).localeCompare(String(right.label));
    })
    .slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-500">{definition.description}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600" role="group" aria-label={definition.legendLabel}>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#2563EB]" aria-hidden="true" />Net Sales</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#DC2626]" aria-hidden="true" />Profit</span>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="h-[360px] min-w-0" role="img" aria-label={definition.ariaLabel}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(value) => formatCompactMoney(value, currencySymbol)} />
              <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={11} width={132} interval={0} tickFormatter={truncateLabel} />
              <Tooltip content={<BreakdownChartTooltip currencySymbol={currencySymbol} />} />
              <Bar dataKey="net_sales" name="Net Sales" fill="#2563EB" radius={[0, 6, 6, 0]} maxBarSize={18} />
              <Bar dataKey="profit" name="Profit" fill="#DC2626" radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          No breakdown data is available for the selected filters.
        </div>
      )}
    </div>
  );
}
