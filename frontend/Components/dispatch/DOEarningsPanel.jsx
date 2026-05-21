import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Loader2, TrendingUp, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { getEarningsReport } from '../../src/services/dispatchOrderService.js';
import { toast } from 'sonner';

const formatCurrency = (n) => {
  if (n == null || isNaN(n)) return '—';
  return `₱${parseFloat(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPct = (n) => {
  if (n == null || isNaN(n)) return '—';
  return `${parseFloat(n).toFixed(1)}%`;
};

const SummaryCard = ({ label, value, subValue, colorClass }) => (
  <div className={cn('border rounded-xl px-5 py-4', colorClass || 'bg-white border-slate-200')}>
    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-2xl font-bold mt-1 text-slate-900">{value}</p>
    {subValue && <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

/**
 * DOEarningsPanel — Gross earnings analytics for dispatched orders.
 * Shows revenue vs COGS breakdown by period, item, order, and recipient.
 */
export default function DOEarningsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('by_item');

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [recipientType, setRecipientType] = useState('all');
  const [period, setPeriod] = useState('month');
  const [status, setStatus] = useState('completed');

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        period,
        status,
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
        ...(recipientType !== 'all' && { recipient_type: recipientType }),
      };
      const result = await getEarningsReport(params);
      setData(result);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load earnings report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, recipientType, period, status]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCSV = () => {
    if (!data) return;
    const rows = [['Period', 'Revenue', 'COGS', 'Gross Profit', 'Margin %']];
    for (const row of (data.by_period || [])) {
      rows.push([row.period_label, row.revenue, row.cogs, row.gross_profit, row.margin_pct]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const chartData = (data?.by_period || []).map(p => ({
    name: p.period_label,
    Revenue: parseFloat(p.revenue) || 0,
    COGS: parseFloat(p.cogs) || 0,
    'Gross Profit': parseFloat(p.gross_profit) || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Recipient</Label>
            <Select value={recipientType} onValueChange={setRecipientType}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="external">External</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Group By</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed only</SelectItem>
                <SelectItem value="partial,completed">Include Partial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadReport} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {!loading && 'Refresh'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={!data || loading}>
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Excluded orders warning — only shown when there IS data but some DOs are excluded.
          When orders_counted === 0 and excluded_orders_count > 0, the empty state below
          handles the message instead to avoid redundant/contradictory UI. */}
      {data && data.summary.excluded_orders_count > 0 && data.summary.orders_counted > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{data.summary.excluded_orders_count} dispatch order{data.summary.excluded_orders_count !== 1 ? 's' : ''}</strong>{' '}
            in this period {data.summary.excluded_orders_count !== 1 ? 'have' : 'has'} no sale price recorded
            and {data.summary.excluded_orders_count !== 1 ? 'are' : 'is'} excluded from this report.
            Open those orders and set sale prices on their lines to include them.
          </span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : !data || data.summary.orders_counted === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          {data?.summary.excluded_orders_count > 0 ? (
            <>
              <p className="text-slate-500 text-sm">
                No earnings to display —{' '}
                <strong>{data.summary.excluded_orders_count}</strong> dispatch order{data.summary.excluded_orders_count !== 1 ? 's' : ''} in this period {data.summary.excluded_orders_count !== 1 ? 'have' : 'has'} no sale price recorded.
              </p>
              <p className="text-slate-400 text-xs mt-1">Open those orders and set sale prices on their lines to start tracking earnings.</p>
            </>
          ) : (
            <>
              <p className="text-slate-500 text-sm">No earnings data found for the selected filters.</p>
              <p className="text-slate-400 text-xs mt-1">Set sale prices on Dispatch Order lines to track earnings.</p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Revenue"
              value={formatCurrency(summary.revenue)}
              subValue={`${summary.orders_counted} order${summary.orders_counted !== 1 ? 's' : ''}`}
              colorClass="bg-teal-50 border-teal-200"
            />
            <SummaryCard
              label="Total COGS"
              value={formatCurrency(summary.cogs)}
              subValue={`${parseFloat(summary.units_dispatched || 0).toFixed(2)} units`}
              colorClass="bg-slate-50 border-slate-200"
            />
            <SummaryCard
              label="Gross Profit"
              value={formatCurrency(summary.gross_profit)}
              colorClass={parseFloat(summary.gross_profit) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}
            />
            <SummaryCard
              label="Gross Margin"
              value={formatPct(summary.margin_pct)}
              colorClass={parseFloat(summary.margin_pct) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}
            />
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue vs COGS ({period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly'})</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${v.toLocaleString()}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="COGS" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Gross Profit" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Breakdown tabs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b border-slate-100 px-4 pt-4">
                <TabsList className="bg-slate-100">
                  <TabsTrigger value="by_item" className="text-xs">By Item</TabsTrigger>
                  <TabsTrigger value="by_order" className="text-xs">By Order</TabsTrigger>
                  <TabsTrigger value="by_recipient" className="text-xs">By Recipient</TabsTrigger>
                  <TabsTrigger value="by_period" className="text-xs">By Period</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="by_item" className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2 pr-4 font-medium">Item</th>
                        <th className="text-right py-2 px-3 font-medium">Units</th>
                        <th className="text-right py-2 px-3 font-medium">Avg Sale Price</th>
                        <th className="text-right py-2 px-3 font-medium">Revenue</th>
                        <th className="text-right py-2 px-3 font-medium">COGS</th>
                        <th className="text-right py-2 px-3 font-medium">Gross Profit</th>
                        <th className="text-right py-2 pl-3 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(data.by_item || []).map(row => (
                        <tr key={row.item_id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4">
                            <p className="font-medium text-slate-800">{row.name}</p>
                            <p className="text-xs text-slate-400">{row.sku_code}</p>
                          </td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{parseFloat(row.units_dispatched).toFixed(2)} {row.unit_of_measure}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{formatCurrency(row.avg_sale_price)}</td>
                          <td className="text-right py-2.5 px-3 font-medium text-teal-700">{formatCurrency(row.revenue)}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{formatCurrency(row.cogs)}</td>
                          <td className={cn('text-right py-2.5 px-3 font-medium', parseFloat(row.gross_profit) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatCurrency(row.gross_profit)}
                          </td>
                          <td className={cn('text-right py-2.5 pl-3 font-medium', parseFloat(row.margin_pct) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatPct(row.margin_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="by_order" className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2 pr-4 font-medium">DO#</th>
                        <th className="text-left py-2 pr-4 font-medium">Recipient</th>
                        <th className="text-left py-2 pr-4 font-medium">Date</th>
                        <th className="text-right py-2 px-3 font-medium">Revenue</th>
                        <th className="text-right py-2 px-3 font-medium">COGS</th>
                        <th className="text-right py-2 px-3 font-medium">Gross Profit</th>
                        <th className="text-right py-2 pl-3 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(data.by_order || []).map(row => (
                        <tr key={row.do_id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{row.do_number}</td>
                          <td className="py-2.5 pr-4 text-slate-600">{row.recipient_name}</td>
                          <td className="py-2.5 pr-4 text-slate-500 text-xs">{new Date(row.dispatch_date).toISOString().slice(0, 10)}</td>
                          <td className="text-right py-2.5 px-3 font-medium text-teal-700">{formatCurrency(row.revenue)}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{formatCurrency(row.cogs)}</td>
                          <td className={cn('text-right py-2.5 px-3 font-medium', parseFloat(row.gross_profit) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatCurrency(row.gross_profit)}
                          </td>
                          <td className={cn('text-right py-2.5 pl-3 font-medium', parseFloat(row.margin_pct) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatPct(row.margin_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="by_recipient" className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2 pr-4 font-medium">Recipient</th>
                        <th className="text-left py-2 pr-4 font-medium">Type</th>
                        <th className="text-right py-2 px-3 font-medium">Orders</th>
                        <th className="text-right py-2 px-3 font-medium">Revenue</th>
                        <th className="text-right py-2 px-3 font-medium">COGS</th>
                        <th className="text-right py-2 px-3 font-medium">Gross Profit</th>
                        <th className="text-right py-2 pl-3 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(data.by_recipient || []).map(row => (
                        <tr key={row.recipient_name} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{row.recipient_name}</td>
                          <td className="py-2.5 pr-4 text-slate-500 capitalize text-xs">{row.recipient_type}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{row.order_count}</td>
                          <td className="text-right py-2.5 px-3 font-medium text-teal-700">{formatCurrency(row.revenue)}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{formatCurrency(row.cogs)}</td>
                          <td className={cn('text-right py-2.5 px-3 font-medium', parseFloat(row.gross_profit) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatCurrency(row.gross_profit)}
                          </td>
                          <td className={cn('text-right py-2.5 pl-3 font-medium', parseFloat(row.margin_pct) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatPct(row.margin_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="by_period" className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-slate-100">
                        <th className="text-left py-2 pr-4 font-medium">Period</th>
                        <th className="text-right py-2 px-3 font-medium">Units</th>
                        <th className="text-right py-2 px-3 font-medium">Revenue</th>
                        <th className="text-right py-2 px-3 font-medium">COGS</th>
                        <th className="text-right py-2 px-3 font-medium">Gross Profit</th>
                        <th className="text-right py-2 pl-3 font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(data.by_period || []).map(row => (
                        <tr key={row.period_label} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{row.period_label}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{parseFloat(row.units_dispatched).toFixed(2)}</td>
                          <td className="text-right py-2.5 px-3 font-medium text-teal-700">{formatCurrency(row.revenue)}</td>
                          <td className="text-right py-2.5 px-3 text-slate-600">{formatCurrency(row.cogs)}</td>
                          <td className={cn('text-right py-2.5 px-3 font-medium', parseFloat(row.gross_profit) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatCurrency(row.gross_profit)}
                          </td>
                          <td className={cn('text-right py-2.5 pl-3 font-medium', parseFloat(row.margin_pct) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {formatPct(row.margin_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </div>
  );
}
