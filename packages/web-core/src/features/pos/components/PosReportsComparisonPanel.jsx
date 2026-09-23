import { ArrowDownRight, ArrowUpRight, CalendarDays } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import PosReportsDropdown from './PosReportsDropdown.jsx';

const COMPARISON_GRANULARITIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
];

const money = (value, currencySymbol = '₱') => `${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatRange = (range) => {
  if (!range?.dateFrom || !range?.dateTo) return 'Selected period';
  return range.dateFrom === range.dateTo
    ? formatDate(range.dateFrom)
    : `${formatDate(range.dateFrom)} – ${formatDate(range.dateTo)}`;
};

const formatTrendLabel = (value, granularity) => {
  const raw = String(value || '');
  if (granularity === 'monthly' && /^\d{4}-\d{2}$/.test(raw)) {
    return formatDate(`${raw}-01`).replace(/ 1, /, ' ');
  }
  if (granularity === 'yearly' || /^\d{4}$/.test(raw)) return raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatDate(raw).replace(/, \d{4}$/, '') : raw;
};

const percentageDelta = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (previousValue === 0) return currentValue > 0 ? 100 : 0;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
};

const COMPARISON_METRICS = [
  { key: 'net_sales', label: 'Net Sales', format: money },
  { key: 'gross_sales', label: 'Gross Sales', format: money },
  { key: 'pos_profit_loss', label: 'POS Profit/Loss', format: money },
  { key: 'total_transactions', label: 'Transactions', format: formatNumber }
];

const resolveMetric = (summary = {}, key) => Number(summary?.[key] || 0);

const DeltaValue = ({ value, currencySymbol, isCurrency = true }) => {
  const numericValue = Number(value || 0);
  const positive = numericValue >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 font-black ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{isCurrency ? money(numericValue, currencySymbol) : formatNumber(numericValue)}</span>
      <span className="sr-only">{positive ? 'increase' : 'decrease'}</span>
    </span>
  );
};

const TrendTooltip = ({ active, payload, label, currencySymbol }) => {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-black text-slate-900">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-1 flex items-center justify-between gap-4 font-semibold text-slate-600">
          <span>{entry.name}</span>
          <span className="font-black text-slate-900">{money(entry.value, currencySymbol)}</span>
        </p>
      ))}
    </div>
  );
};

export default function PosReportsComparisonPanel({
  comparison = {},
  currencySymbol = '₱',
  granularity = 'daily',
  onGranularityChange
}) {
  const flexibleRange = comparison.flexible_range || {};
  const current = flexibleRange.current || {};
  const previous = flexibleRange.previous || {};
  const trend = Array.isArray(comparison.flexible_trend) ? comparison.flexible_trend : [];
  const chartData = trend.map((entry) => ({
    ...entry,
    label: formatTrendLabel(entry.label, granularity)
  }));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm shadow-slate-200/50 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#1A4E8D]" aria-hidden="true" />
              <p className="text-sm font-black text-slate-900">{COMPARISON_GRANULARITIES.find((entry) => entry.value === granularity)?.label || 'Daily'}</p>
            </div>
            <p className="mt-1 pl-6 text-[11px] font-semibold text-slate-500">
              {formatRange(flexibleRange.current_range)} vs {formatRange(flexibleRange.previous_range)}
            </p>
          </div>
          <div className="flex min-h-10 items-center gap-2 self-start sm:self-auto">
            <span className="whitespace-nowrap text-xs font-bold text-slate-600">Compare by</span>
            <PosReportsDropdown
              id="pos-reports-compare-granularity"
              value={granularity}
              options={COMPARISON_GRANULARITIES}
              onChange={onGranularityChange}
              ariaLabel="Compare trend by"
              triggerClassName="min-w-[7.5rem]"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60" aria-labelledby="sales-comparison-summary-title">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 id="sales-comparison-summary-title" className="text-sm font-black text-slate-900">Sales Comparison Summary</h3>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">Key performance comparison for the selected periods.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] table-fixed text-[13px]">
            <thead className="border-b border-slate-200 bg-[#F7FAFF] text-[11px] text-[#0F172A]">
              <tr>
                <th scope="col" className="w-[27%] px-4 py-3 text-left font-black">Metric</th>
                <th scope="col" className="w-[24%] px-4 py-3 text-right font-black">Current Period</th>
                <th scope="col" className="w-[24%] px-4 py-3 text-right font-black">Comparison Period</th>
                <th scope="col" className="w-[15%] px-4 py-3 text-right font-black">Change</th>
                <th scope="col" className="w-[10%] px-4 py-3 text-right font-black">Change %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARISON_METRICS.map((metric) => {
                const currentValue = resolveMetric(current, metric.key);
                const previousValue = resolveMetric(previous, metric.key);
                const delta = currentValue - previousValue;
                const deltaPercent = percentageDelta(currentValue, previousValue);
                const isCurrency = metric.key !== 'total_transactions';
                return (
                  <tr key={metric.key} className="odd:bg-white even:bg-[#F8FBFF] text-slate-700 transition-colors hover:bg-[#EEF5FF]">
                    <th scope="row" className="px-4 py-2.5 text-left font-black text-[#0F172A]">{metric.label}</th>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#334155]">{metric.format(currentValue, currencySymbol)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#334155]">{metric.format(previousValue, currencySymbol)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><DeltaValue value={delta} currencySymbol={currencySymbol} isCurrency={isCurrency} /></td>
                    <td className="px-4 py-2.5 text-right font-black tabular-nums"><DeltaValue value={deltaPercent} currencySymbol={currencySymbol} isCurrency={false} />%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60" aria-labelledby="sales-comparison-trend-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="sales-comparison-trend-title" className="text-sm font-black text-slate-900">Sales Comparison Trend</h3>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">Net sales over the selected periods.</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-600" aria-label="Chart legend">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2563EB]" aria-hidden="true" />{formatRange(flexibleRange.current_range)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#16A34A]" aria-hidden="true" />{formatRange(flexibleRange.previous_range)}</span>
          </div>
        </div>
        {chartData.length > 0 ? (
          <div className="mt-3 h-[280px]" role="img" aria-label="Line chart comparing current and previous period net sales">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 2, bottom: 4 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickMargin={8} />
                <YAxis stroke="#64748B" fontSize={11} tickFormatter={(value) => `${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol}${Number(value || 0).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`} />
                <Tooltip content={<TrendTooltip currencySymbol={currencySymbol} />} />
                <Line type="monotone" dataKey="current_net_sales" name="Current period" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 2.5, fill: '#2563EB' }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="previous_net_sales" name="Comparison period" stroke="#16A34A" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: '#16A34A' }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
            No comparison trend data is available for the selected periods.
          </div>
        )}
      </section>
    </div>
  );
}
