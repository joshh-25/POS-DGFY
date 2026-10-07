import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

const formatHour = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return value || '—';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
};

const formatCompactMoney = (value, currencySymbol) => `${resolveCurrencySymbol(currencySymbol)}${Number(value || 0).toLocaleString('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
})}`;

const HourlySalesTooltip = ({ active, payload, label, currencySymbol }) => {
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
        <p>Transactions: <span className="font-black text-slate-900">{formatNumber(row.transaction_count)}</span></p>
        <p>Items sold: <span className="font-black text-slate-900">{formatNumber(row.item_quantity)}</span></p>
      </div>
    </div>
  );
};

export default function PosReportsHourlySalesChart({ rows = [], currencySymbol = '₱' }) {
  const chartData = (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    label: formatHour(row?.bucket_start_local)
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-500">Gross sales, net sales, and profit by loaded hour.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600" role="group" aria-label="Hourly sales chart legend">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#2563EB]" aria-hidden="true" />Gross Sales</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#16A34A]" aria-hidden="true" />Net Sales</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#DC2626]" aria-hidden="true" />Profit</span>
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="h-[320px] min-w-0" role="img" aria-label="Hourly sales chart showing gross sales, net sales, and profit by hour">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 2, bottom: 8 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickMargin={8} minTickGap={24} />
              <YAxis stroke="#64748B" fontSize={11} tickFormatter={(value) => formatCompactMoney(value, currencySymbol)} />
              <Tooltip content={<HourlySalesTooltip currencySymbol={currencySymbol} />} />
              <Bar dataKey="gross_sales" name="Gross Sales" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Line type="monotone" dataKey="net_sales" name="Net Sales" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 2.5, fill: '#16A34A' }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 2.5, fill: '#DC2626' }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
          No hourly sales data is available for the selected filters.
        </div>
      )}
    </div>
  );
}
