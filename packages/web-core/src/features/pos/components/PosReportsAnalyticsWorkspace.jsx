import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadOfflinePosReportSnapshot, saveOfflinePosReportSnapshot } from '../services/offlinePosSnapshotStore.js';
import {
  ArrowLeftRight,
  AlertTriangle,
  BarChart3,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Filter,
  FileText,
  LayoutDashboard,
  Printer,
  Receipt,
  Scale,
  ShoppingBag,
  Tags,
  Users
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  exportPosReportCsv,
  fetchPosReportsBreakdown,
  fetchPosZReadingDetails,
  fetchPosZReadingHistory,
  fetchPosReportsOverview
} from '../services/posService.js';
import EmployeeCreditReportPanel from './EmployeeCreditReportPanel.jsx';
import PosLineTabNavigation from './PosLineTabNavigation.jsx';
import PosReportsDateFilterPanel from './PosReportsDateFilterPanel.jsx';
import PosReportsFilterPanel from './PosReportsFilterPanel.jsx';
import PosSingleDatePicker from './PosSingleDatePicker.jsx';
import PosReportsKpiCards from './PosReportsKpiCards.jsx';
import PosReportsAdjustmentKpiCards from './PosReportsAdjustmentKpiCards.jsx';
import PosReportsOverviewTable from './PosReportsOverviewTable.jsx';
import PosReportsAdjustmentsTable from './PosReportsAdjustmentsTable.jsx';
import PosReportsAttendanceTable from './PosReportsAttendanceTable.jsx';
import PosReportsCashiersTable from './PosReportsCashiersTable.jsx';
import PosReportsRegistersTable from './PosReportsRegistersTable.jsx';
import PosReportsHandoffTable from './PosReportsHandoffTable.jsx';
import PosReportsProfitLossTable from './PosReportsProfitLossTable.jsx';
import PosReportsSalesTable from './PosReportsSalesTable.jsx';
import PosReportsTopItemsTable from './PosReportsTopItemsTable.jsx';
import PosReportsBreakdownTable, { PosReportsBreakdownSummary } from './PosReportsBreakdownTable.jsx';
import PosReportsComparisonPanel from './PosReportsComparisonPanel.jsx';
import PosReportsToolbar from './PosReportsToolbar.jsx';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';
import PosZReadingHistoryTable from './PosZReadingHistoryTable.jsx';
import PosZReadingHistoryToolbar from './PosZReadingHistoryToolbar.jsx';
import {
  buildDailySalesCheckCsv,
  buildDailySalesCheckPrintHtml,
  buildZReadingHistoryCsv,
  buildZReadingHistoryPrintHtml,
  getDailySalesCheckCashSummary,
  getDailySalesCheckVoidActivity
} from './posZReadingReconciliationExports.js';
import PosSubtabNavigation from './PosSubtabNavigation.jsx';
import PosPageFrame from './PosPageFrame.jsx';
import { POS_MOBILE_STICKY_TAB_ROW_CLASS, POS_PAGE_CONTENT_STACK_CLASS } from './PosPageSpacing.js';
import { buildPosReportsActiveFilters } from './posReportsActiveFilters.js';
import { getPosReportRefundsVoidsDisplayValue } from './posReportFormatting.js';
import { formatPosTransactionPaymentMethods } from '../utils/posPaymentMethods.js';
import {
  DELIVERY_PROVIDER_OPTIONS,
  formatDeliveryProviderSummaryLabel,
  parseDeliveryProviderSummary
} from '../utils/posDeliveryProviders.js';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';
import {
  BackOfficeReportDataTable as DataTable,
  BackOfficeReportEmptyState as EmptyState,
  BackOfficeReportSectionCard as SectionCard
} from '../../../components/backOffice/BackOfficePrimitives.jsx';

const REPORT_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, granularity: 'daily', exportSection: 'daily' },
  { id: 'z_readings', label: 'Z-Readings', icon: Calendar, granularity: 'daily', exportSection: 'daily' },
  { id: 'sales', label: 'Sales', icon: Receipt, granularity: 'daily', exportSection: 'sales' },
  { id: 'hourly', label: 'Hourly Sales', icon: Clock3, granularity: 'daily', breakdown: 'hourly', exportSection: 'hourly' },
  { id: 'item_sales', label: 'Item Sales', icon: ShoppingBag, granularity: 'daily', breakdown: 'items', exportSection: 'item_sales' },
  { id: 'category_sales', label: 'Sales by Category', icon: Tags, granularity: 'daily', breakdown: 'categories', exportSection: 'category_sales' },
  { id: 'comparison', label: 'Comparison', icon: ArrowLeftRight, granularity: 'daily', exportSection: 'comparison' },
  { id: 'top_items', label: 'Top Selling Items', icon: ShoppingBag, granularity: 'daily', exportSection: 'daily' },
  { id: 'profit_loss', label: 'Profit/Loss', icon: Scale, granularity: 'monthly', exportSection: 'profit_loss' },
  { id: 'operations', label: 'Operations', icon: BarChart3, granularity: 'daily', exportSection: 'cashiers' }
];

const getDefaultBreakdownSort = (breakdown) => (
  breakdown === 'hourly'
    ? { sort_by: 'bucket_start_local', sort_direction: 'asc' }
    : { sort_by: 'net_sales', sort_direction: 'desc' }
);

const REPORT_OPERATION_SECTIONS = [
  { id: 'cashiers', label: 'Cashiers', icon: Users },
  { id: 'registers', label: 'Registers', icon: Calculator },
  { id: 'adjustments', label: 'Adjustments', icon: Receipt },
  { id: 'handoffs', label: 'Handoff', icon: ArrowLeftRight },
  { id: 'attendance', label: 'Attendance', icon: Clock3 },
  { id: 'employee_credit', label: 'Credit Activity', icon: CreditCard, permission: 'pos:employee_credit:report' }
];

const Z_READING_SECTIONS = [
  { id: 'daily_check', label: 'Daily Sales Check', icon: CheckCircle2 },
  { id: 'history', label: 'History', icon: Clock3 }
];

const PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'card', label: 'Card' },
  { value: 'maya', label: 'Online' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'employee_credit', label: 'Employee Credit' }
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'in_store', label: 'Walk-in Sales' },
  { value: 'online_store', label: 'Online Sales' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' }
];

const DELIVERY_PROVIDER_FILTER_OPTIONS = [
  { value: '', label: 'All delivery providers' },
  ...DELIVERY_PROVIDER_OPTIONS
];

const CHART_COLORS = ['#2563EB', '#14B8A6', '#F97316', '#0EA5E9', '#8B5CF6'];
const REPORT_TAB_TRANSITION_MS = 150;
const REPORT_TAB_SLIDE_OFFSET = 28;
const money = (value, currencySymbol = '₱') => `${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ORDER_METHOD_LABELS = Object.freeze({
  dine_in: 'Dine In',
  takeout: 'Takeout',
  pickup: 'Pickup',
  delivery: 'Delivery',
  online: 'Online'
});
const formatSalesSource = (value) => String(value || '').trim().toLowerCase() === 'online_store' ? 'Online Sales' : 'Walk-in Sales';
const formatOrderMethod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ORDER_METHOD_LABELS[normalized]
    || normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    || '—';
};
const aggregatePaymentBreakdown = (rows = []) => {
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach((entry) => {
    const label = String(entry?.payment_method || '').trim() || 'Online';
    const key = label.toLowerCase();
    const current = groups.get(key) || {
      payment_method: label,
      total_transactions: 0,
      net_sales: 0
    };
    current.total_transactions += Number(entry?.total_transactions || 0);
    current.net_sales += Number(entry?.net_sales || 0);
    groups.set(key, current);
  });
  return Array.from(groups.values()).map((entry) => ({
    ...entry,
    net_sales: Number(entry.net_sales || 0)
  }));
};
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const printDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '-'
    : parsed.toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Manila'
    });
};

const toDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeReportDateInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const month = String(Number(first)).padStart(2, '0');
    const day = String(Number(second)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return toDateInput(parsed);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getDefaultRange = (granularity = 'daily') => {
  const now = new Date();
  if (granularity === 'weekly') {
    const day = now.getDay();
    const mondayDelta = day === 0 ? -6 : 1 - day;
    const start = addDays(now, mondayDelta);
    return { dateFrom: toDateInput(start), dateTo: toDateInput(now) };
  }
  if (granularity === 'monthly') {
    return {
      dateFrom: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      dateTo: toDateInput(now)
    };
  }
  if (granularity === 'yearly') {
    return {
      dateFrom: toDateInput(new Date(now.getFullYear(), 0, 1)),
      dateTo: toDateInput(now)
    };
  }
  return { dateFrom: toDateInput(now), dateTo: toDateInput(now) };
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const DailySalesCheckMetric = ({ label, value, description, className = '' }) => (
  <div className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40 sm:p-4 ${className}`}>
    <dt className="text-xs font-bold uppercase leading-4 tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1.5 min-w-0 break-words text-xl font-black leading-tight tabular-nums text-slate-950 sm:text-2xl">
      {value}
      <span className="mt-1.5 block break-words text-xs font-normal leading-4 text-slate-600">{description}</span>
    </dd>
  </div>
);

export const ZReadingReconciliationCard = ({
  data,
  currencySymbol,
  title = 'Z-reading reconciliation',
  onPrint,
  onExport,
  actionsDisabled = false
}) => {
  if (!data) return null;

  const status = String(data.status || 'not_comparable');
  const statusConfig = status === 'matched'
    ? { label: 'Matched', Icon: Check, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
    : status === 'variance'
      ? { label: 'Variance found', Icon: AlertTriangle, className: 'border-rose-200 bg-rose-50 text-rose-800', metricClassName: 'border-rose-200 bg-rose-50/60' }
      : { label: status === 'not_generated' ? 'Not generated' : 'Comparison unavailable', Icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-800' };
  const StatusIcon = statusConfig.Icon;
  const isComparable = status === 'matched' || status === 'variance';
  const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const formatAmount = (value) => hasNumber(value) ? money(value, currencySymbol) : '—';
  const formatDeduction = (value) => hasNumber(value) ? `−${formatAmount(value)}` : '—';
  const formatCount = (value) => hasNumber(value) ? Number(value).toLocaleString('en-US') : '—';
  const hasSavedZReading = data.snapshot_persisted === true;
  const paymentBreakdown = Array.isArray(data.z_payment_breakdown) ? data.z_payment_breakdown : [];
  const cashSummary = getDailySalesCheckCashSummary(data);
  const voidActivity = getDailySalesCheckVoidActivity(data);
  const voidRefundActivity = voidActivity.available
    ? `${formatCount(voidActivity.count)} · ${formatAmount(voidActivity.amount)}`
    : '—';
  return (
    <section
      className="min-w-0 max-w-full"
      aria-labelledby="daily-sales-check-heading"
    >
      {typeof onPrint === 'function' && typeof onExport === 'function' ? (
        <div className="mb-3 flex min-w-0 justify-end" role="group" aria-label="Daily Sales Check actions">
          <div className="flex w-full flex-col gap-3 min-[360px]:w-auto min-[360px]:flex-row min-[768px]:gap-2">
            <Button
              type="button"
              onClick={onPrint}
              disabled={actionsDisabled}
              aria-label="Print or save Daily Sales Check as PDF"
              className="min-h-11 w-full min-w-0 justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-slate-800 min-[360px]:w-auto sm:min-h-10 sm:px-4 sm:text-[13px] lg:min-h-9"
            >
              <Printer className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </Button>
            <Button
              type="button"
              onClick={onExport}
              disabled={actionsDisabled}
              aria-label="Export Daily Sales Check as CSV"
              className="min-h-11 w-full min-w-0 justify-center gap-1.5 rounded-xl bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] min-[360px]:w-auto sm:min-h-10 sm:px-4 sm:text-[13px] lg:min-h-9"
            >
              <Download className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>
      ) : null}

      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 id="daily-sales-check-heading" className="min-w-0 break-words text-sm font-black text-slate-950">{title}</h3>
          <span
            role="status"
            aria-live="polite"
            aria-describedby={status === 'not_comparable' && data.message ? 'daily-sales-check-status-message' : undefined}
            className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-4 ${statusConfig.className}`}
          >
            <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {statusConfig.label}
          </span>
        </div>
        {data.reading_identifier ? (
          <p className="flex min-w-0 items-center gap-1.5 break-all text-xs font-bold text-slate-600">
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            {data.reading_identifier}
          </p>
        ) : null}
      </header>

      {status === 'not_comparable' && data.message ? (
        <p id="daily-sales-check-status-message" className="mt-3 break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {data.message}
        </p>
      ) : null}

      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Daily sales reconciliation">
        <DailySalesCheckMetric
          label="Report recognized sales"
          value={formatAmount(data.report_recognized_sales)}
          description="Completed, recognized transaction totals"
        />
        <DailySalesCheckMetric
          label="Z-reading total"
          value={formatAmount(data.z_total_amount)}
          description={status === 'not_generated'
            ? 'No immutable snapshot yet'
            : isComparable
              ? 'Saved immutable total for this business date'
              : 'Unavailable for this report selection'}
        />
        <DailySalesCheckMetric
          label="Difference"
          value={isComparable ? formatAmount(data.variance) : '—'}
          description={status === 'variance'
            ? 'Recognized sales minus the saved total. Review scope and post-close events.'
            : 'Shown only when both totals are comparable'}
          className={statusConfig.metricClassName || ''}
        />
        <DailySalesCheckMetric
          label="Report net sales"
          value={formatAmount(data.report_net_sales)}
          description="Different metric; includes line-level discounts/refunds"
        />
      </dl>

      {hasSavedZReading ? (
        <section className="mt-4 min-w-0 border-t border-slate-200 pt-4" aria-labelledby="daily-sales-payment-breakdown-heading">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <h4 id="daily-sales-payment-breakdown-heading" className="text-sm font-bold text-slate-950">Payment breakdown</h4>
            <p className="text-xs text-slate-600">From the saved Z-reading snapshot</p>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
            Payment method amounts are before refunds and voids. Those deductions are shown below and included in net sales.
          </p>
          {paymentBreakdown.length > 0 ? (
            <dl className="mt-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Saved Z-reading payment breakdown">
              {paymentBreakdown.map((entry) => {
                const paymentKey = String(entry.payment_type || entry.payment_label || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
                const label = paymentKey === 'cash'
                  ? 'Cash payments before refunds'
                  : entry.payment_label || String(entry.payment_type || 'Other payment').replace(/_/g, ' ');
                return (
                  <div key={entry.payment_type || entry.payment_label || 'other'} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <dt className="break-words text-xs text-slate-600">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-bold tabular-nums text-[#1A4E8D]">
                      {formatAmount(entry.amount)} · {formatCount(entry.count)} {Number(entry.count || 0) === 1 ? 'payment' : 'payments'}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No payment entries were recorded in this saved Z-reading.</p>
          )}
          {cashSummary.available ? (
            <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Cash reconciliation summary">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <dt className="break-words text-xs text-slate-600">Cash payments before refunds</dt>
                <dd className="mt-1 break-words text-sm font-bold tabular-nums text-[#1A4E8D]">{formatAmount(cashSummary.cashPaymentsBeforeRefunds)}</dd>
              </div>
              <div className="min-w-0 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
                <dt className="break-words text-xs text-slate-600">Cash refunds / voids</dt>
                <dd className="mt-1 break-words text-sm font-bold tabular-nums text-rose-700">{formatDeduction(cashSummary.cashRefundsVoids)}</dd>
              </div>
              <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                <dt className="break-words text-xs text-slate-600">Net cash sales</dt>
                <dd className="mt-1 break-words text-sm font-bold tabular-nums text-emerald-800">{formatAmount(cashSummary.netCashSales)}</dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}

      <div className="mt-4 grid min-w-0 gap-4 border-t border-slate-200 pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,auto)] xl:items-end">
        <section className="min-w-0" aria-labelledby="daily-sales-additional-activity-heading">
          <h4 id="daily-sales-additional-activity-heading" className="text-sm font-bold text-slate-950">Additional Activity</h4>
          <dl className="mt-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">Void/refund activity</dt>
              <dd className="mt-1 break-words text-sm font-bold tabular-nums text-[#1A4E8D]">{voidRefundActivity}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">Refunds / voids deducted from sales</dt>
              <dd className="mt-1 break-words text-sm font-bold tabular-nums text-rose-700">{formatDeduction(data.report_refunds_voids)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-600">Audit adjustment records</dt>
              <dd className="mt-1 break-words text-sm font-bold tabular-nums text-[#1A4E8D]">{formatAmount(data.report_adjustment_amount)}</dd>
              <p className="mt-1 text-xs leading-4 text-slate-500">Audit reference; not an additional deduction.</p>
            </div>
          </dl>
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:min-w-[18rem] xl:border-l xl:border-slate-200 xl:pl-4" aria-label="Reading timestamps">
          <div className="flex min-w-0 items-start gap-2.5">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-slate-600">Date &amp; time generated</p>
              <p className="mt-0.5 break-words text-sm font-bold text-slate-950">{data.generated_at ? printDateTime(data.generated_at) : '—'}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-slate-600">Checked at</p>
              <p className="mt-0.5 break-words text-sm font-bold text-slate-950">{data.evaluated_at ? printDateTime(data.evaluated_at) : '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

function PosReportsAnalyticsWorkspace({
  terminalUser = null,
  terminalMeta,
  operatingLocationId = null,
  reportRefreshKey = 0,
  employeeCreditReportRefreshKey = 0,
  isOnline = true,
  offlineSnapshotScope = {},
  sectionId
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [renderedTab, setRenderedTab] = useState('overview');
  const [operationSection, setOperationSection] = useState('cashiers');
  const [renderedOperationSection, setRenderedOperationSection] = useState('cashiers');
  const [zReadingSection, setZReadingSection] = useState('daily_check');
  const [dailySalesCheckDate, setDailySalesCheckDate] = useState(() => toDateInput(new Date()));
  const [dailySalesCheckDateCustomized, setDailySalesCheckDateCustomized] = useState(false);
  const [dailySalesCheckReport, setDailySalesCheckReport] = useState(null);
  const [dailySalesCheckLoading, setDailySalesCheckLoading] = useState(false);
  const [dailySalesCheckError, setDailySalesCheckError] = useState('');
  const [dailySalesCheckRefreshKey, setDailySalesCheckRefreshKey] = useState(0);
  const [zReadingHistoryRows, setZReadingHistoryRows] = useState([]);
  const [zReadingHistorySearchInput, setZReadingHistorySearchInput] = useState('');
  const [zReadingHistorySearchQuery, setZReadingHistorySearchQuery] = useState('');
  const [zReadingHistoryFilters, setZReadingHistoryFilters] = useState({ terminalId: '', closedBy: '' });
  const [zReadingHistoryActionBusy, setZReadingHistoryActionBusy] = useState(false);
  const [zReadingHistoryActionError, setZReadingHistoryActionError] = useState('');
  const [zReadingHistoryPage, setZReadingHistoryPage] = useState(1);
  const [zReadingHistoryLimit, setZReadingHistoryLimit] = useState(20);
  const [zReadingHistoryTotal, setZReadingHistoryTotal] = useState(0);
  const [zReadingHistoryLoading, setZReadingHistoryLoading] = useState(false);
  const [zReadingHistoryError, setZReadingHistoryError] = useState('');
  const [zReadingHistoryRefreshKey, setZReadingHistoryRefreshKey] = useState(0);
  const [zReadingHistoryPreview, setZReadingHistoryPreview] = useState({ open: false, row: null, data: null, loading: false, error: '' });
  const zReadingPreviewRequestRef = useRef(0);
  const [reportPanelInlineStyle, setReportPanelInlineStyle] = useState({ opacity: 1, transition: 'none' });
  const reportPanelAnimationTimersRef = useRef([]);
  const [granularity, setGranularity] = useState('daily');
  const [dateRange, setDateRange] = useState(() => getDefaultRange('daily'));
  const [defaultDisplayDateRange, setDefaultDisplayDateRange] = useState(() => getDefaultRange('daily'));
  const [reportDateFilterApplied, setReportDateFilterApplied] = useState(false);
  const [cashierId, setCashierId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [source, setSource] = useState('');
  const [deliveryProvider, setDeliveryProvider] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [overviewSearchQuery, setOverviewSearchQuery] = useState('');
  const [reportFiltersOpen, setReportFiltersOpen] = useState(false);
  const [reportDateFilterOpen, setReportDateFilterOpen] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [breakdownData, setBreakdownData] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState('');
  const [breakdownOffline, setBreakdownOffline] = useState(false);
  const [breakdownPage, setBreakdownPage] = useState(1);
  const [breakdownLimit, setBreakdownLimit] = useState(50);
  const [breakdownSort, setBreakdownSort] = useState(() => getDefaultBreakdownSort('hourly'));
  const [employeeCreditReportData, setEmployeeCreditReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currencySymbol = String(terminalMeta?.pettyCashSymbol || '₱').toUpperCase() === 'PHP' ? '₱' : (terminalMeta?.pettyCashSymbol || '₱');
  const operationSections = useMemo(() => REPORT_OPERATION_SECTIONS.filter((section) => (
    !section.permission || terminalUser?.is_master_admin === true || resolveUserPermissionList(terminalUser).includes(section.permission)
  )), [terminalUser]);
  const selectedReportTab = useMemo(() => REPORT_TABS.find((tab) => tab.id === activeTab) || REPORT_TABS[0], [activeTab]);
  const renderedReportTab = useMemo(() => REPORT_TABS.find((tab) => tab.id === renderedTab) || REPORT_TABS[0], [renderedTab]);
  const activeBreakdown = selectedReportTab.breakdown || null;
  const isBreakdownTab = Boolean(activeBreakdown);
  const displayGranularity = activeTab === 'comparison' ? granularity : selectedReportTab.granularity;
  const clearReportPanelAnimationTimers = useCallback(() => {
    reportPanelAnimationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    reportPanelAnimationTimersRef.current = [];
  }, []);
  const transitionReportPanel = useCallback((nextTab, nextOperationSection) => {
    if (!nextTab || !nextOperationSection) return;
    clearReportPanelAnimationTimers();

    if (nextTab === renderedTab && nextOperationSection === renderedOperationSection) {
      setReportPanelInlineStyle({ opacity: 1, transition: 'none' });
      return;
    }

    const transitioningMainTab = nextTab !== renderedTab;
    const currentKey = transitioningMainTab ? renderedTab : renderedOperationSection;
    const nextKey = transitioningMainTab ? nextTab : nextOperationSection;
    const orderedKeys = transitioningMainTab
      ? REPORT_TABS.map((tab) => tab.id)
      : operationSections.map((section) => section.id);

    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setRenderedTab(nextTab);
      setRenderedOperationSection(nextOperationSection);
      setReportPanelInlineStyle({ opacity: 1, transition: 'none' });
      return;
    }

    const currentIndex = orderedKeys.indexOf(currentKey);
    const nextIndex = orderedKeys.indexOf(nextKey);
    const movingForward = currentIndex < 0 || nextIndex > currentIndex;
    const exitOffset = movingForward ? -REPORT_TAB_SLIDE_OFFSET : REPORT_TAB_SLIDE_OFFSET;
    const enterOffset = movingForward ? REPORT_TAB_SLIDE_OFFSET : -REPORT_TAB_SLIDE_OFFSET;

    setReportPanelInlineStyle({
      transform: `translateX(${exitOffset}px)`,
      opacity: 0,
      transition: `transform ${REPORT_TAB_TRANSITION_MS}ms ease, opacity ${REPORT_TAB_TRANSITION_MS}ms ease`
    });

    const swapTimer = window.setTimeout(() => {
      setRenderedTab(nextTab);
      setRenderedOperationSection(nextOperationSection);
      setReportPanelInlineStyle({ transform: `translateX(${enterOffset}px)`, opacity: 0, transition: 'none' });

      const enterTimer = window.setTimeout(() => {
        setReportPanelInlineStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: `transform ${REPORT_TAB_TRANSITION_MS}ms ease, opacity ${REPORT_TAB_TRANSITION_MS}ms ease`
        });

        const settleTimer = window.setTimeout(() => {
          setReportPanelInlineStyle({ opacity: 1, transition: 'none' });
        }, REPORT_TAB_TRANSITION_MS);
        reportPanelAnimationTimersRef.current.push(settleTimer);
      }, 16);
      reportPanelAnimationTimersRef.current.push(enterTimer);
    }, REPORT_TAB_TRANSITION_MS);

    reportPanelAnimationTimersRef.current.push(swapTimer);
  }, [clearReportPanelAnimationTimers, operationSections, renderedOperationSection, renderedTab]);

  useEffect(() => () => clearReportPanelAnimationTimers(), [clearReportPanelAnimationTimers]);
  const reportFilterButtonRef = useRef(null);
  const reportDateFilterButtonRef = useRef(null);
  const zReadingHistoryFilterButtonRef = useRef(null);
  const normalizedDateRange = useMemo(() => ({
    dateFrom: normalizeReportDateInput(dateRange.dateFrom),
    dateTo: normalizeReportDateInput(dateRange.dateTo)
  }), [dateRange.dateFrom, dateRange.dateTo]);
  const offlineReportKey = useMemo(() => JSON.stringify({
    granularity: displayGranularity,
    breakdown: activeBreakdown,
    reportTab: activeTab,
    locationId: operatingLocationId || null,
    dateFrom: normalizedDateRange.dateFrom,
    dateTo: normalizedDateRange.dateTo,
    cashierId,
    paymentType,
    source,
    deliveryProvider,
    categoryId
  }), [
    categoryId,
    cashierId,
    displayGranularity,
    operatingLocationId,
    normalizedDateRange.dateFrom,
    normalizedDateRange.dateTo,
    paymentType,
    source,
    deliveryProvider,
    activeBreakdown,
    activeTab
  ]);

  const handleTabChange = (tabId) => {
    const nextTab = String(tabId || 'overview').trim() || 'overview';
    const selectedTab = REPORT_TABS.find((tab) => tab.id === nextTab) || REPORT_TABS[0];
    if (selectedTab.id === activeTab) return;
    transitionReportPanel(selectedTab.id, operationSection);
    setActiveTab(selectedTab.id);
    setOverviewSearchQuery('');
    if (selectedTab.id === 'z_readings') {
      setReportFiltersOpen(false);
      setReportDateFilterOpen(false);
    }
  };

  const handleZReadingSectionChange = (sectionId) => {
    if (!Z_READING_SECTIONS.some((section) => section.id === sectionId)) return;
    setZReadingSection(sectionId);
  };

  const handleOperationSectionChange = (sectionId) => {
    const nextSection = operationSections.find((section) => section.id === sectionId)?.id;
    if (!nextSection || nextSection === operationSection) return;
    transitionReportPanel(activeTab, nextSection);
    setOperationSection(nextSection);
  };

  useEffect(() => {
    if (operationSections.some((section) => section.id === operationSection)) return;
    const fallbackSection = operationSections[0]?.id || 'cashiers';
    clearReportPanelAnimationTimers();
    setOperationSection(fallbackSection);
    setRenderedOperationSection(fallbackSection);
    setRenderedTab(activeTab);
    setReportPanelInlineStyle({ opacity: 1, transition: 'none' });
  }, [activeTab, clearReportPanelAnimationTimers, operationSection, operationSections]);

  useEffect(() => {
    if (activeTab === 'operations' && operationSection === 'employee_credit') return;
    setEmployeeCreditReportData(null);
  }, [activeTab, operationSection]);

  const handleClearAllFilters = () => {
    const selectedTab = REPORT_TABS.find((tab) => tab.id === activeTab) || REPORT_TABS[0];
    if (activeTab === 'comparison') setGranularity(selectedTab.granularity);
    setDateRange(defaultDisplayDateRange);
    setReportDateFilterApplied(false);
    setCashierId('');
    setPaymentType('');
    setSource('');
    setDeliveryProvider('');
    setCategoryId('');
    setOverviewSearchQuery('');
    setZReadingHistoryPage(1);
    setReportFiltersOpen(false);
    setReportDateFilterOpen(false);
  };

  const handleRemoveReportFilter = (filterKey) => {
    if (filterKey === 'date') {
      setDateRange(defaultDisplayDateRange);
      setReportDateFilterApplied(false);
    } else if (filterKey === 'cashier') {
      setCashierId('');
    } else if (filterKey === 'payment') {
      setPaymentType('');
    } else if (filterKey === 'source') {
      setSource('');
    } else if (filterKey === 'delivery_provider') {
      setDeliveryProvider('');
    } else if (filterKey === 'category') {
      setCategoryId('');
    } else if (filterKey === 'granularity' && activeTab === 'comparison') {
      setGranularity(selectedReportTab.granularity);
    } else if (filterKey === 'search') {
      setOverviewSearchQuery('');
    }
  };

  const handleApplyReportFilters = (nextFilters) => {
    setCashierId(nextFilters.cashierId);
    setPaymentType(nextFilters.paymentType);
    setSource(nextFilters.source);
    setDeliveryProvider(nextFilters.deliveryProvider);
    setCategoryId(nextFilters.categoryId);
    setReportFiltersOpen(false);
  };

  const handleApplyReportDateRange = (nextDateRange) => {
    setDateRange({ ...nextDateRange });
    setReportDateFilterApplied(true);
    setZReadingHistoryPage(1);
    setReportDateFilterOpen(false);
  };

  useEffect(() => {
    if (reportDateFilterApplied) return;
    const firstTransactionDate = normalizeReportDateInput(reportData?.date_bounds?.first_transaction_date);
    const today = normalizeReportDateInput(reportData?.date_bounds?.today) || toDateInput(new Date());
    if (!firstTransactionDate || firstTransactionDate > today) return;

    const nextDefaultRange = { dateFrom: firstTransactionDate, dateTo: today };
    setDefaultDisplayDateRange((current) => (
      current.dateFrom === nextDefaultRange.dateFrom && current.dateTo === nextDefaultRange.dateTo
        ? current
        : nextDefaultRange
    ));
    setDateRange((current) => (
      current.dateFrom === nextDefaultRange.dateFrom && current.dateTo === nextDefaultRange.dateTo
        ? current
        : nextDefaultRange
    ));
  }, [reportData?.date_bounds?.first_transaction_date, reportData?.date_bounds?.today, reportDateFilterApplied]);

  useEffect(() => {
    setBreakdownPage(1);
    setBreakdownSort(getDefaultBreakdownSort(activeBreakdown));
  }, [activeBreakdown, cashierId, categoryId, deliveryProvider, normalizedDateRange.dateFrom, normalizedDateRange.dateTo, operatingLocationId, paymentType, source]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setZReadingHistoryPage(1);
      setZReadingHistorySearchQuery(String(zReadingHistorySearchInput || '').trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [zReadingHistorySearchInput]);

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      if (activeTab === 'z_readings') {
        setLoading(false);
        return;
      }

      if (isBreakdownTab) {
        setBreakdownLoading(true);
        setBreakdownError('');
        setBreakdownOffline(false);
        setBreakdownData(null);
        if (!isOnline) {
          const snapshot = loadOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, `breakdown:${activeBreakdown}`);
          if (!cancelled) {
            setBreakdownData(snapshot?.payload || null);
            setBreakdownOffline(Boolean(snapshot));
            setBreakdownError(snapshot
              ? 'Offline snapshot loaded. Report values are display-only until the connection is restored.'
              : 'No cached breakdown exists for these filters. Reconnect once to load it.');
            setBreakdownLoading(false);
          }
          return;
        }
        try {
          const payload = await fetchPosReportsBreakdown({
            breakdown: activeBreakdown,
            date_from: normalizedDateRange.dateFrom,
            date_to: normalizedDateRange.dateTo,
            cashier_id: cashierId || undefined,
            payment_type: paymentType || undefined,
            source: source || undefined,
            delivery_provider: deliveryProvider || undefined,
            category_id: categoryId || undefined,
            location_id: operatingLocationId || undefined,
            page: breakdownPage,
            limit: breakdownLimit,
            sort_by: breakdownSort.sort_by,
            sort_direction: breakdownSort.sort_direction
          });
          if (!cancelled) {
            setBreakdownData(payload);
            saveOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, payload, `breakdown:${activeBreakdown}`);
          }
        } catch (loadError) {
          if (!cancelled) {
            setBreakdownError(loadError?.response?.data?.message || 'Failed to load the selected POS report breakdown.');
          }
        } finally {
          if (!cancelled) setBreakdownLoading(false);
        }
        return;
      }

      setBreakdownLoading(false);
      setBreakdownOffline(false);
      setBreakdownError('');
      setLoading(true);
      setError('');
      if (!isOnline) {
        const snapshot = loadOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, 'overview');
        if (!cancelled) {
          setReportData(snapshot?.payload || null);
          setError(snapshot ? 'Offline estimate from the last synced report. Pending local sales are not final until Sync completes.' : 'No cached report exists for this filter. Reconnect once to load it.');
          setLoading(false);
        }
        return;
      }
      try {
        const payload = await fetchPosReportsOverview({
          granularity: displayGranularity,
          date_from: normalizedDateRange.dateFrom,
          date_to: normalizedDateRange.dateTo,
          cashier_id: cashierId || undefined,
          payment_type: paymentType || undefined,
          source: source || undefined,
          delivery_provider: deliveryProvider || undefined,
          category_id: categoryId || undefined,
          location_id: operatingLocationId || undefined
        });
        if (!cancelled) {
          setReportData(payload);
          saveOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, payload, 'overview');
        }
      } catch (loadError) {
        if (!cancelled) {
          setReportData((current) => current || null);
          setError(loadError?.response?.data?.message || 'Failed to load POS reports.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadReports();
    return () => {
      cancelled = true;
    };
  }, [
    activeBreakdown,
    categoryId,
    cashierId,
    breakdownLimit,
    breakdownPage,
    breakdownSort.sort_by,
    breakdownSort.sort_direction,
    displayGranularity,
    isOnline,
    isBreakdownTab,
    normalizedDateRange.dateFrom,
    normalizedDateRange.dateTo,
    offlineReportKey,
    offlineSnapshotScope,
    operatingLocationId,
    paymentType,
    reportRefreshKey,
    source,
    deliveryProvider,
    activeTab
  ]);

  const summaryCards = reportData?.summary_cards || {};
  const selectedTender = summaryCards.selected_tender || null;
  const filterOptions = reportData?.filter_options || {};
  const dailyReport = reportData?.daily_report || {};
  const monthlyReport = reportData?.monthly_report || {};
  const yearlyReport = reportData?.yearly_report || {};
  const comparisonReport = reportData?.sales_comparison || {};
  const profitLoss = reportData?.profit_loss || {};
  const cashierLifecycle = reportData?.cashier_lifecycle || {};
  const zReadingReconciliation = reportData?.z_reading_reconciliation || null;
  const dailySalesCheckData = dailySalesCheckReport?.z_reading_reconciliation
    ? {
      ...dailySalesCheckReport.z_reading_reconciliation,
      report_payment_breakdown: dailySalesCheckReport.daily_report?.payment_breakdown || [],
      report_voided_refunded_transactions: dailySalesCheckReport.daily_report?.summary?.voided_refunded_transactions,
      report_adjustment_rows: dailySalesCheckReport.daily_report?.adjustment_rows || []
    }
    : null;

  useEffect(() => {
    if (dailySalesCheckDateCustomized) return;
    const reportToday = normalizeReportDateInput(reportData?.date_bounds?.today);
    if (reportToday && reportToday !== dailySalesCheckDate) setDailySalesCheckDate(reportToday);
  }, [dailySalesCheckDate, dailySalesCheckDateCustomized, reportData?.date_bounds?.today]);

  useEffect(() => {
    if (activeTab !== 'z_readings' || zReadingSection !== 'daily_check') return undefined;
    let cancelled = false;

    const loadDailySalesCheck = async () => {
      if (!isOnline) {
        setDailySalesCheckReport(null);
        setDailySalesCheckError('Daily Sales Check needs a live branch report and is unavailable offline.');
        setDailySalesCheckLoading(false);
        return;
      }

      setDailySalesCheckLoading(true);
      setDailySalesCheckError('');
      try {
        const payload = await fetchPosReportsOverview({
          granularity: 'daily',
          date_from: dailySalesCheckDate,
          date_to: dailySalesCheckDate,
          location_id: Number(operatingLocationId) > 0 ? Number(operatingLocationId) : undefined
        });
        if (!cancelled) setDailySalesCheckReport(payload);
      } catch (loadError) {
        if (!cancelled) {
          setDailySalesCheckReport(null);
          setDailySalesCheckError(loadError?.response?.data?.message || 'Failed to load the Daily Sales Check.');
        }
      } finally {
        if (!cancelled) setDailySalesCheckLoading(false);
      }
    };

    loadDailySalesCheck();
    return () => { cancelled = true; };
  }, [activeTab, dailySalesCheckDate, dailySalesCheckRefreshKey, isOnline, operatingLocationId, reportRefreshKey, zReadingSection]);

  useEffect(() => {
    if (activeTab !== 'z_readings' || zReadingSection !== 'history') return undefined;
    let cancelled = false;

    const loadZReadingHistory = async () => {
      if (!isOnline) {
        setZReadingHistoryRows([]);
        setZReadingHistoryTotal(0);
        setZReadingHistoryError('Saved Z-reading history needs a live connection and is not cached on this terminal.');
        setZReadingHistoryLoading(false);
        return;
      }

      setZReadingHistoryLoading(true);
      setZReadingHistoryError('');
      try {
        const payload = await fetchPosZReadingHistory({
          date_from: normalizedDateRange.dateFrom || undefined,
          date_to: normalizedDateRange.dateTo || undefined,
          search: zReadingHistorySearchQuery || undefined,
          terminal_id: zReadingHistoryFilters.terminalId || undefined,
          closed_by: zReadingHistoryFilters.closedBy || undefined,
          page: zReadingHistoryPage,
          limit: zReadingHistoryLimit,
          location_id: Number(operatingLocationId) > 0 ? Number(operatingLocationId) : undefined
        });
        if (!cancelled) {
          setZReadingHistoryRows(Array.isArray(payload?.rows) ? payload.rows : []);
          setZReadingHistoryTotal(Number(payload?.pagination?.total || 0));
        }
      } catch (loadError) {
        if (!cancelled) {
          setZReadingHistoryRows([]);
          setZReadingHistoryTotal(0);
          setZReadingHistoryError(loadError?.response?.data?.message || 'Failed to load saved Z-reading history.');
        }
      } finally {
        if (!cancelled) setZReadingHistoryLoading(false);
      }
    };

    loadZReadingHistory();
    return () => { cancelled = true; };
  }, [activeTab, isOnline, normalizedDateRange.dateFrom, normalizedDateRange.dateTo, operatingLocationId, zReadingHistoryFilters.closedBy, zReadingHistoryFilters.terminalId, zReadingHistoryLimit, zReadingHistoryPage, zReadingHistoryRefreshKey, zReadingHistorySearchQuery, zReadingSection]);

  const handlePreviewZReading = async (row) => {
    const requestId = zReadingPreviewRequestRef.current + 1;
    zReadingPreviewRequestRef.current = requestId;
    setZReadingHistoryPreview({ open: true, row, data: null, loading: true, error: '' });
    try {
      const data = await fetchPosZReadingDetails(row.business_date, {
        location_id: row.location_id || (Number(operatingLocationId) > 0 ? Number(operatingLocationId) : undefined)
      });
      if (requestId !== zReadingPreviewRequestRef.current) return;
      if (data?.snapshot_persisted !== true) {
        setZReadingHistoryPreview((current) => ({
          ...current,
          data: null,
          loading: false,
          error: 'The saved snapshot could not be confirmed. No on-demand reading is shown as history.'
        }));
        return;
      }
      setZReadingHistoryPreview((current) => ({ ...current, data, loading: false, error: '' }));
    } catch (loadError) {
      if (requestId === zReadingPreviewRequestRef.current) {
        setZReadingHistoryPreview((current) => ({
          ...current,
          loading: false,
          error: loadError?.response?.data?.message || 'Failed to load saved Z-reading details.'
        }));
      }
    }
  };

  const closeZReadingPreview = () => {
    zReadingPreviewRequestRef.current += 1;
    setZReadingHistoryPreview({ open: false, row: null, data: null, loading: false, error: '' });
  };

  const trendSeries = useMemo(() => {
    if (activeTab === 'comparison') {
      return comparisonReport.flexible_trend || [];
    }
    if (displayGranularity === 'monthly') return monthlyReport.sales_trend || [];
    if (displayGranularity === 'yearly') return yearlyReport.monthly_breakdown || [];
    return dailyReport.trend || [];
  }, [activeTab, comparisonReport.flexible_trend, dailyReport.trend, displayGranularity, monthlyReport.sales_trend, yearlyReport.monthly_breakdown]);

  const paymentChartRows = aggregatePaymentBreakdown(dailyReport.payment_breakdown).map((entry, index) => ({
    ...entry,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  }));
  const deliveryProviderRows = parseDeliveryProviderSummary(dailyReport.delivery_provider_breakdown);
  const orderSourceRows = Array.isArray(dailyReport.order_source_breakdown) ? dailyReport.order_source_breakdown : [];
  const orderMethodRows = Array.isArray(dailyReport.order_method_breakdown) ? dailyReport.order_method_breakdown : [];
  const activeReportData = isBreakdownTab ? breakdownData : reportData;
  const activeLoading = isBreakdownTab ? breakdownLoading : loading;
  const activeError = isBreakdownTab ? breakdownError : error;
  const isInitialLoading = activeLoading && !activeReportData;
  const isRefreshing = activeLoading && Boolean(activeReportData);
  const showBlockingError = Boolean(activeError) && !activeReportData;
  const showInlineError = Boolean(activeError) && Boolean(activeReportData);

  const hasData = isBreakdownTab
    ? Boolean(breakdownData)
    : Boolean(reportData) && (
    Number(summaryCards.total_transactions || 0) > 0
    || Number(summaryCards.total_sales || 0) > 0
    || Number(dailyReport.adjustment_summary?.adjustment_count || 0) > 0
    || (trendSeries || []).length > 0
    || (activeTab === 'operations' && Object.keys(cashierLifecycle || {}).length > 0)
  );
  const shouldRenderReportPanel = isBreakdownTab
    ? Boolean(breakdownData)
    : activeTab === 'z_readings' || (Boolean(reportData) && (hasData || activeTab === 'overview'));
  const shouldShowOperationsSubtabs = activeTab === 'operations'
    && !isBreakdownTab
    && !isInitialLoading
    && !showBlockingError
    && shouldRenderReportPanel;

  const cashiers = Array.isArray(filterOptions.cashiers) ? filterOptions.cashiers : [];
  const categories = (Array.isArray(filterOptions.categories) ? filterOptions.categories : []).map((entry) => (
    typeof entry === 'string'
      ? { folder_id: null, name: entry, legacy: true }
      : entry
  ));
  const transactionRows = Array.isArray(dailyReport.transaction_rows) ? dailyReport.transaction_rows : [];
  const selectedCashier = cashiers.find((entry) => String(entry.cashier_id) === String(cashierId));
  const reportCashierLabel = cashierId
    ? (selectedCashier?.cashier_name || `Cashier #${cashierId}`)
    : 'All cashiers';
  const selectedPaymentLabel = paymentType
    ? PAYMENT_OPTIONS.find((option) => option.value === paymentType)?.label || paymentType
    : '';
  const selectedSourceLabel = source
    ? SOURCE_OPTIONS.find((option) => option.value === source)?.label || source
    : '';
  const selectedDeliveryProviderLabel = deliveryProvider
    ? DELIVERY_PROVIDER_FILTER_OPTIONS.find((option) => option.value === deliveryProvider)?.label || deliveryProvider
    : '';
  const selectedCategory = categories.find((entry) => String(entry.folder_id) === String(categoryId));
  const activeReportFilterChips = useMemo(() => buildPosReportsActiveFilters({
    dateFilterApplied: reportDateFilterApplied,
    dateRange: normalizedDateRange,
    granularity: displayGranularity,
    defaultGranularity: selectedReportTab.granularity,
    cashierLabel: cashierId ? reportCashierLabel : '',
    paymentLabel: selectedPaymentLabel,
    sourceLabel: selectedSourceLabel,
    deliveryProviderLabel: selectedDeliveryProviderLabel,
    categoryLabel: categoryId ? (selectedCategory?.name || `Category #${categoryId}`) : '',
    searchQuery: overviewSearchQuery
  }), [
    categoryId,
    cashierId,
    displayGranularity,
    normalizedDateRange,
    overviewSearchQuery,
    reportCashierLabel,
    reportDateFilterApplied,
    selectedCategory?.name,
    selectedPaymentLabel,
    selectedReportTab.granularity,
    selectedSourceLabel,
    selectedDeliveryProviderLabel
  ]);

  const handleExportCsv = async () => {
    const selectedTab = REPORT_TABS.find((tab) => tab.id === activeTab) || REPORT_TABS[0];
    const reportParams = {
      location_id: operatingLocationId || undefined,
      section: activeTab === 'operations' ? operationSection : selectedTab.exportSection,
      date_from: normalizedDateRange.dateFrom,
      date_to: normalizedDateRange.dateTo,
      cashier_id: cashierId || undefined,
      payment_type: paymentType || undefined,
      source: source || undefined,
      delivery_provider: deliveryProvider || undefined,
      category_id: categoryId || undefined
    };
    if (selectedTab.breakdown) {
      reportParams.page = breakdownPage;
      reportParams.limit = breakdownLimit;
      reportParams.sort_by = breakdownSort.sort_by;
      reportParams.sort_direction = breakdownSort.sort_direction;
    } else {
      reportParams.granularity = displayGranularity;
    }
    const { blob, filename } = await exportPosReportCsv({
      ...reportParams
    });
    downloadBlob(blob, filename);
  };

  const buildZReadingHistoryQuery = (page) => ({
    date_from: normalizedDateRange.dateFrom || undefined,
    date_to: normalizedDateRange.dateTo || undefined,
    search: zReadingHistorySearchQuery || undefined,
    terminal_id: zReadingHistoryFilters.terminalId || undefined,
    closed_by: zReadingHistoryFilters.closedBy || undefined,
    page,
    limit: 100,
    location_id: Number(operatingLocationId) > 0 ? Number(operatingLocationId) : undefined
  });

  const fetchAllMatchingZReadingHistory = async () => {
    const firstPage = await fetchPosZReadingHistory(buildZReadingHistoryQuery(1));
    const firstRows = Array.isArray(firstPage?.rows) ? firstPage.rows : [];
    const totalPages = Math.max(1, Number(firstPage?.pagination?.totalPages) || 1);
    const allRows = [...firstRows];

    for (let firstUnrequestedPage = 2; firstUnrequestedPage <= totalPages; firstUnrequestedPage += 4) {
      const pageNumbers = Array.from(
        { length: Math.min(4, totalPages - firstUnrequestedPage + 1) },
        (_, index) => firstUnrequestedPage + index
      );
      const payloads = await Promise.all(pageNumbers.map((page) => fetchPosZReadingHistory(buildZReadingHistoryQuery(page))));
      payloads.forEach((payload) => {
        if (Array.isArray(payload?.rows)) allRows.push(...payload.rows);
      });
    }

    return allRows;
  };

  const handleExportZReadingHistory = async () => {
    if (zReadingHistoryActionBusy) return;
    setZReadingHistoryActionBusy(true);
    setZReadingHistoryActionError('');
    try {
      const rows = await fetchAllMatchingZReadingHistory();
      const csv = buildZReadingHistoryCsv(rows, { currencySymbol, formatMoney: money });
      if (!csv) {
        setZReadingHistoryActionError('No saved Z-readings match the current filters.');
        return;
      }
      const dateRangeLabel = [normalizedDateRange.dateFrom, normalizedDateRange.dateTo].filter(Boolean).join('-') || 'all-dates';
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `pos-z-reading-history-${dateRangeLabel}.csv`);
    } catch (exportError) {
      setZReadingHistoryActionError(exportError?.response?.data?.message || 'Could not export the matching Z-reading history. Try again.');
    } finally {
      setZReadingHistoryActionBusy(false);
    }
  };

  const handlePrintZReadingHistory = async () => {
    if (zReadingHistoryActionBusy || typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'width=1120,height=900');
    if (!printWindow) {
      setZReadingHistoryActionError('Allow pop-ups for this POS page to print or save the history as PDF.');
      return;
    }

    setZReadingHistoryActionBusy(true);
    setZReadingHistoryActionError('');
    try {
      const rows = await fetchAllMatchingZReadingHistory();
      const html = buildZReadingHistoryPrintHtml(rows, {
        currencySymbol,
        formatMoney: money,
        dateFrom: normalizedDateRange.dateFrom,
        dateTo: normalizedDateRange.dateTo,
        search: zReadingHistorySearchQuery
      });
      if (!html) {
        printWindow.close();
        setZReadingHistoryActionError('No saved Z-readings match the current filters.');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (printError) {
      printWindow.close();
      setZReadingHistoryActionError(printError?.response?.data?.message || 'Could not prepare the Z-reading history for printing. Try again.');
    } finally {
      setZReadingHistoryActionBusy(false);
    }
  };

  const handleExportDailySalesCheck = () => {
    const data = dailySalesCheckData;
    const formatOptions = { businessDate: dailySalesCheckDate, currencySymbol, formatMoney: money, formatDateTime: printDateTime };
    const csv = buildDailySalesCheckCsv(data, formatOptions);
    if (!csv) return;

    const dateForFilename = String(data.business_date || dailySalesCheckDate || 'selected-date').replace(/[^\d-]/g, '') || 'selected-date';
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `pos-daily-sales-check-${dateForFilename}.csv`
    );
  };

  const handlePrintDailySalesCheck = () => {
    const data = dailySalesCheckData;
    const formatOptions = { businessDate: dailySalesCheckDate, currencySymbol, formatMoney: money, formatDateTime: printDateTime };
    const html = buildDailySalesCheckPrintHtml(data, formatOptions);
    if (typeof window === 'undefined' || !html) return;

    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handlePrint = () => {
    const isEmployeeCreditReport = activeTab === 'operations' && operationSection === 'employee_credit';
    if (typeof window === 'undefined' || !activeReportData || (isEmployeeCreditReport && !employeeCreditReportData)) return;
    const printWindow = window.open('', '_blank', 'width=1120,height=900');
    if (!printWindow) return;

    if (isBreakdownTab) {
      const breakdownRows = Array.isArray(breakdownData?.rows) ? breakdownData.rows : [];
      const breakdownSummary = breakdownData?.summary || {};
      const title = selectedReportTab.label;
      const rowCells = (row) => {
        if (activeBreakdown === 'hourly') {
          return [
            row.bucket_start_local,
            row.transaction_count,
            row.item_quantity,
            money(row.gross_sales, currencySymbol),
            money(row.net_sales, currencySymbol),
            money(getPosReportRefundsVoidsDisplayValue(row.refunds_voids), currencySymbol),
            money(row.profit, currencySymbol)
          ];
        }
        if (activeBreakdown === 'items') {
          return [
            row.item_name,
            row.sku || '—',
            row.category_name || 'Uncategorized',
            row.quantity,
            row.orders,
            money(row.net_sales, currencySymbol),
            money(getPosReportRefundsVoidsDisplayValue(row.refunds_voids), currencySymbol),
            `${Number(row.sales_share || 0).toFixed(2)}%`,
            money(row.profit, currencySymbol)
          ];
        }
        return [
          row.category_name || 'Uncategorized',
          row.item_count,
          row.quantity,
          row.orders,
          money(row.net_sales, currencySymbol),
          `${Number(row.sales_share || 0).toFixed(2)}%`,
          money(row.profit, currencySymbol)
        ];
      };
      const headers = activeBreakdown === 'hourly'
        ? ['Hour', 'Transactions', 'Items Sold', 'Gross Sales', 'Net Sales', 'Refunds/Voids', 'Profit']
        : activeBreakdown === 'items'
          ? ['Item', 'SKU', 'Category', 'Quantity', 'Orders', 'Net Sales', 'Refunds/Voids', 'Sales Share', 'Profit']
          : ['Category', 'Items', 'Quantity', 'Orders', 'Net Sales', 'Sales Share', 'Profit'];
      const printableRows = breakdownRows.map((row) => `<tr>${rowCells(row).map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
      const filterText = [
        `Cashier: ${cashierId ? reportCashierLabel : 'All cashiers'}`,
        `Payment: ${selectedPaymentLabel || 'All payments'}`,
        `Source: ${selectedSourceLabel || 'All sources'}`,
        `Category: ${categoryId ? (selectedCategory?.name || `Category #${categoryId}`) : 'All categories'}`
      ].join(' · ');
      printWindow.document.write(`
        <html>
          <head>
            <title>${escapeHtml(title)}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
              h1 { margin: 0 0 8px; font-size: 28px; }
              p { margin: 0 0 10px; color: #475569; }
              .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 20px 0; }
              .card { border: 1px solid #cbd5e1; border-radius: 14px; padding: 14px; }
              .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 700; }
              .value { font-size: 20px; font-weight: 800; margin-top: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 18px; }
              th, td { border: 1px solid #e2e8f0; padding: 9px; font-size: 12px; text-align: left; }
              th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.06em; }
              @media print { .grid { grid-template-columns: repeat(5, 1fr); } }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(title)}</h1>
            <p>Range: ${escapeHtml(breakdownData?.range?.date_from || normalizedDateRange.dateFrom)} to ${escapeHtml(breakdownData?.range?.date_to || normalizedDateRange.dateTo)} · Timezone: ${escapeHtml(breakdownData?.timezone || 'Asia/Manila')}</p>
            <p>Applied filters: ${escapeHtml(filterText)} · Generated: ${escapeHtml(printDateTime(breakdownData?.generated_at))}</p>
            <div class="grid">
              <div class="card"><div class="label">Net Sales</div><div class="value">${escapeHtml(money(breakdownSummary.net_sales, currencySymbol))}</div></div>
              <div class="card"><div class="label">Gross Sales</div><div class="value">${escapeHtml(money(breakdownSummary.gross_sales, currencySymbol))}</div></div>
              <div class="card"><div class="label">Recorded Transactions</div><div class="value">${Number(breakdownSummary.total_transactions || 0)}</div></div>
              <div class="card"><div class="label">Completed Sales</div><div class="value">${Number(breakdownSummary.completed_transactions ?? breakdownSummary.total_transactions ?? 0)}</div></div>
              <div class="card"><div class="label">Voided/Refunded</div><div class="value">${Number(breakdownSummary.voided_refunded_transactions || 0)}</div></div>
              <div class="card"><div class="label">Items Sold</div><div class="value">${Number(breakdownSummary.total_items_sold || 0)}</div></div>
              <div class="card"><div class="label">Profit</div><div class="value">${escapeHtml(money(breakdownSummary.profit ?? breakdownSummary.pos_profit_loss, currencySymbol))}</div></div>
            </div>
            <table>
              <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
              <tbody>${printableRows || `<tr><td colspan="${headers.length}">No rows found.</td></tr>`}</tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      return;
    }

    if (activeTab === 'operations' && operationSection === 'employee_credit') {
      const employeeCreditEntries = employeeCreditReportData?.entries || [];
      const employeeCreditTotals = employeeCreditReportData?.totals || {};
      const employeeCreditRows = employeeCreditEntries.map((entry) => {
        const employeeName = entry.account?.employeeProfile?.full_name
          || entry.account?.employee?.username
          || entry.account?.employee?.email
          || '-';
        return `
          <tr>
            <td>${escapeHtml(printDateTime(entry.created_at))}</td>
            <td>${escapeHtml(employeeName)}</td>
            <td>${escapeHtml(String(entry.entry_type || '').replace(/_/g, ' '))}</td>
            <td style="text-align:right">${escapeHtml(money(entry.amount, currencySymbol))}</td>
            <td style="text-align:right">${escapeHtml(money(entry.balance_after, currencySymbol))}</td>
            <td>${escapeHtml(entry.actor?.username || '-')}</td>
            <td>${escapeHtml(entry.authorization_reference || '-')}</td>
          </tr>
        `;
      }).join('');

      printWindow.document.write(`
        <html>
          <head>
            <title>Employee Credit Activity</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
              h1 { margin: 0 0 8px; font-size: 28px; }
              p { margin: 0 0 12px; color: #475569; }
              .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
              .card { border: 1px solid #cbd5e1; border-radius: 14px; padding: 14px; }
              .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; font-weight: 700; }
              .value { font-size: 24px; font-weight: 800; margin-top: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 18px; }
              th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; }
              th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.08em; text-align: left; }
            </style>
          </head>
          <body>
            <h1>Employee Credit Activity</h1>
            <p>Range: ${escapeHtml(normalizedDateRange.dateFrom)} to ${escapeHtml(normalizedDateRange.dateTo)}</p>
            <div class="grid">
              <div class="card"><div class="label">Credit Sales</div><div class="value">${escapeHtml(money(employeeCreditTotals.credit_sales, currencySymbol))}</div></div>
              <div class="card"><div class="label">Repayments</div><div class="value">${escapeHtml(money(employeeCreditTotals.repayments, currencySymbol))}</div></div>
              <div class="card"><div class="label">Admin Adjustments</div><div class="value">${escapeHtml(money(employeeCreditTotals.grants, currencySymbol))}</div></div>
              <div class="card"><div class="label">Reversals</div><div class="value">${escapeHtml(money(employeeCreditTotals.reversals, currencySymbol))}</div></div>
            </div>
            <table>
              <thead><tr><th>Time</th><th>Employee</th><th>Type</th><th>Amount</th><th>Outstanding After</th><th>Cashier</th><th>Reference</th></tr></thead>
              <tbody>${employeeCreditRows || '<tr><td colspan="7">No Employee Credit activity found.</td></tr>'}</tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      return;
    }

    const topItems = (dailyReport.top_items || []).slice(0, 10).map((item) => `
      <tr>
        <td>${escapeHtml(item.item_name)}</td>
        <td>${escapeHtml(item.sku_code || '-')}</td>
        <td style="text-align:right">${Number(item.quantity || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right">${escapeHtml(money(item.net_sales, currencySymbol))}</td>
        <td style="text-align:right">${escapeHtml(money(item.pos_profit_loss, currencySymbol))}</td>
      </tr>
    `).join('');
    const cashierRows = (dailyReport.cashier_summary || []).map((entry) => {
      const cash = entry?.shift_money || {};
      return `
        <tr>
          <td>${escapeHtml(entry.cashier_name || '-')}</td>
          <td style="text-align:right">${Number(cash.shift_count || entry.shift_ids?.length || 0)}</td>
          <td style="text-align:right">${Number(cash.closed_shift_count || 0)}</td>
          <td style="text-align:right">${escapeHtml(money(cash.opening_float_amount, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.cash_sales_amount, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.cash_in_total, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.cash_out_total, currencySymbol))}</td>
          <td style="text-align:right">${escapeHtml(money(cash.expected_cash_amount, currencySymbol))}</td>
          <td style="text-align:right">${cash.closing_cash_amount == null ? '-' : escapeHtml(money(cash.closing_cash_amount, currencySymbol))}</td>
          <td style="text-align:right">${cash.cash_variance_amount == null ? '-' : escapeHtml(money(cash.cash_variance_amount, currencySymbol))}</td>
        </tr>
      `;
    }).join('');
    const filteredTransactions = transactionRows.map((entry) => `
      <tr>
        <td>${escapeHtml(entry.invoice_number || entry.pos_transaction_id || '-')}</td>
        <td>${escapeHtml(printDateTime(entry.created_at))}</td>
        <td>${escapeHtml(entry.cashier_name || '-')}</td>
        <td>${escapeHtml(formatPosTransactionPaymentMethods(entry))}</td>
        <td>${escapeHtml(formatSalesSource(entry.order_source))}</td>
        <td>${escapeHtml(Array.isArray(entry.delivery_provider_breakdown) ? entry.delivery_provider_breakdown.map((provider) => `${provider.display_label || provider.provider_name || provider.provider_type}: ${money(provider.amount, currencySymbol)}`).join(' + ') : '-')}</td>
        <td>${escapeHtml(entry.status || '-')}</td>
        <td style="text-align:right">${escapeHtml(money(entry.total_amount, currencySymbol))}</td>
        <td style="text-align:right">${escapeHtml(money(entry.net_sales, currencySymbol))}</td>
      </tr>
    `).join('');
    const deliveryProviderPrintRows = deliveryProviderRows.map((entry) => `
      <tr>
        <td>${escapeHtml(formatDeliveryProviderSummaryLabel(entry))}</td>
        <td style="text-align:right">${Number(entry.transaction_count || 0)}</td>
        <td style="text-align:right">${escapeHtml(money(entry.amount, currencySymbol))}</td>
      </tr>
    `).join('');
    const zReadingPrint = zReadingReconciliation ? `
          <div class="section">
            <h2>Z-reading reconciliation</h2>
            <p>Status: ${escapeHtml(zReadingReconciliation.status || 'unavailable')}</p>
            <p>${escapeHtml(zReadingReconciliation.message || '')}</p>
            <p>Report recognized sales: ${escapeHtml(zReadingReconciliation.report_recognized_sales == null ? '-' : money(zReadingReconciliation.report_recognized_sales, currencySymbol))}</p>
            <p>Z-reading total: ${escapeHtml(zReadingReconciliation.z_total_amount == null ? '-' : money(zReadingReconciliation.z_total_amount, currencySymbol))}</p>
            <p>Difference: ${escapeHtml(zReadingReconciliation.variance == null ? '-' : money(zReadingReconciliation.variance, currencySymbol))}</p>
            <p>Report refunds/voids: ${escapeHtml(money(zReadingReconciliation.report_refunds_voids, currencySymbol))}</p>
            <p>Report adjustments: ${escapeHtml(money(zReadingReconciliation.report_adjustment_amount, currencySymbol))}</p>
            <p>Reading: ${escapeHtml(zReadingReconciliation.reading_identifier || '-')} · Generated: ${escapeHtml(zReadingReconciliation.generated_at ? printDateTime(zReadingReconciliation.generated_at) : '-')} · Checked: ${escapeHtml(zReadingReconciliation.evaluated_at ? printDateTime(zReadingReconciliation.evaluated_at) : '-')}</p>
          </div>
    ` : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Cashier Sales & Cash Reconciliation</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            p { margin: 0 0 12px; color: #475569; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
            .card { border: 1px solid #cbd5e1; border-radius: 14px; padding: 14px; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; font-weight: 700; }
            .value { font-size: 24px; font-weight: 800; margin-top: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; font-size: 12px; }
            th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.08em; text-align: left; }
            .section { page-break-inside: avoid; margin-top: 24px; }
          </style>
        </head>
        <body>
          <h1>Cashier Sales & Cash Reconciliation</h1>
          <p>Cashier: ${escapeHtml(reportCashierLabel)}</p>
          <p>Range: ${escapeHtml(normalizedDateRange.dateFrom)} to ${escapeHtml(normalizedDateRange.dateTo)}</p>
          <div class="grid">
            <div class="card"><div class="label">Total Sales</div><div class="value">${escapeHtml(money(summaryCards.total_sales, currencySymbol))}</div></div>
            <div class="card"><div class="label">Recorded Transactions</div><div class="value">${Number(dailyReport.summary?.total_transactions ?? summaryCards.total_transactions ?? 0)}</div></div>
            <div class="card"><div class="label">Completed Sales</div><div class="value">${Number(dailyReport.summary?.completed_transactions ?? dailyReport.summary?.total_transactions ?? summaryCards.total_transactions ?? 0)}</div></div>
            <div class="card"><div class="label">Voided/Refunded</div><div class="value">${Number(dailyReport.summary?.voided_refunded_transactions || 0)}</div></div>
            <div class="card"><div class="label">Gross Sales</div><div class="value">${escapeHtml(money(summaryCards.gross_sales, currencySymbol))}</div></div>
            <div class="card"><div class="label">All Discounts</div><div class="value">${escapeHtml(money(dailyReport.summary?.discounts, currencySymbol))}</div></div>
            <div class="card"><div class="label">POS Profit/Loss</div><div class="value">${escapeHtml(money(summaryCards.pos_profit_loss, currencySymbol))}</div></div>
            ${selectedTender ? `<div class="card"><div class="label">${escapeHtml(selectedTender.payment_label)} Collected</div><div class="value">${escapeHtml(money(selectedTender.amount, currencySymbol))}</div></div>` : ''}
          </div>
          ${zReadingPrint}
          <div class="section">
            <h2>Cash Reconciliation</h2>
            <table>
              <thead><tr><th>Cashier</th><th>Shifts</th><th>Closed</th><th>Opening Float</th><th>Cash Sales</th><th>Cash In</th><th>Cash Out</th><th>Expected Cash</th><th>Closing Cash</th><th>Variance</th></tr></thead>
              <tbody>${cashierRows || '<tr><td colspan="10">No shift cash records found.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="section">
            <h2>Filtered Transactions</h2>
            <table>
              <thead><tr><th>Invoice</th><th>Datetime</th><th>Cashier</th><th>Payment</th><th>Sales Source</th><th>Delivery Provider</th><th>Status</th><th>Total</th><th>Reported Net Sales</th></tr></thead>
              <tbody>${filteredTransactions || '<tr><td colspan="9">No transactions found.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="section">
            <h2>Delivery Provider Breakdown</h2>
            <table>
              <thead><tr><th>Provider</th><th>Transactions</th><th>Amount</th></tr></thead>
              <tbody>${deliveryProviderPrintRows || '<tr><td colspan="3">No delivery provider sales found.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="section">
            <h2>Daily Top Items</h2>
            <table>
              <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Net Sales</th><th>POS Profit/Loss</th></tr></thead>
              <tbody>${topItems || '<tr><td colspan="5">No rows found.</td></tr>'}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const renderReportFilterPanel = () => (
      <PosReportsFilterPanel
      key={reportFiltersOpen ? 'reports-filter-open' : 'reports-filter-closed'}
      open={reportFiltersOpen}
      onClose={() => setReportFiltersOpen(false)}
      onApplyFilters={handleApplyReportFilters}
      cashierId={cashierId}
      cashiers={cashiers}
      paymentType={paymentType}
      paymentOptions={PAYMENT_OPTIONS}
      source={source}
      sourceOptions={SOURCE_OPTIONS}
      deliveryProvider={deliveryProvider}
      deliveryProviderOptions={DELIVERY_PROVIDER_FILTER_OPTIONS}
      categoryId={categoryId}
      categories={categories}
      anchorRef={reportFilterButtonRef}
      />
  );

  const renderReportDateFilterPanel = () => (
    <PosReportsDateFilterPanel
      key={reportDateFilterOpen ? 'reports-date-open' : 'reports-date-closed'}
      open={reportDateFilterOpen}
      onClose={() => setReportDateFilterOpen(false)}
        onApplyDateRange={handleApplyReportDateRange}
        dateRange={dateRange}
        anchorRef={reportDateFilterButtonRef}
      />
  );

  const renderReportToolbar = () => (
    <PosReportsToolbar
      searchQuery={overviewSearchQuery}
      onSearchQueryChange={setOverviewSearchQuery}
      onOpenFilters={() => setReportFiltersOpen(true)}
      onOpenDateFilter={() => setReportDateFilterOpen(true)}
      activeFilterChips={activeReportFilterChips}
      onRemoveFilter={handleRemoveReportFilter}
      onClearAllFilters={handleClearAllFilters}
      onPrint={handlePrint}
      onExport={handleExportCsv}
      exportDisabled={!activeReportData}
      printDisabled={!activeReportData || (activeTab === 'operations' && operationSection === 'employee_credit' && !employeeCreditReportData)}
      filtersOpen={reportFiltersOpen}
      dateFilterOpen={reportDateFilterOpen}
      filterButtonRef={reportFilterButtonRef}
      dateFilterButtonRef={reportDateFilterButtonRef}
    />
  );

  const zReadingHistoryFilterChips = [
    ...(reportDateFilterApplied ? [{
      key: 'date',
      label: `Date: ${normalizedDateRange.dateFrom || 'All dates'}${normalizedDateRange.dateTo ? ` – ${normalizedDateRange.dateTo}` : ''}`
    }] : []),
    ...(zReadingHistoryFilters.terminalId ? [{ key: 'terminal', label: `Terminal: ${zReadingHistoryFilters.terminalId}` }] : []),
    ...(zReadingHistoryFilters.closedBy ? [{ key: 'closed-by', label: `Closed by: ${zReadingHistoryFilters.closedBy}` }] : [])
  ];

  const handleRemoveZReadingHistoryFilter = (filterKey) => {
    if (filterKey === 'date') {
      handleRemoveReportFilter('date');
    } else if (filterKey === 'terminal') {
      setZReadingHistoryFilters((current) => ({ ...current, terminalId: '' }));
    } else if (filterKey === 'closed-by') {
      setZReadingHistoryFilters((current) => ({ ...current, closedBy: '' }));
    }
    setZReadingHistoryPage(1);
  };

  const clearZReadingHistoryFilters = () => {
    setDateRange(defaultDisplayDateRange);
    setReportDateFilterApplied(false);
    setZReadingHistorySearchInput('');
    setZReadingHistorySearchQuery('');
    setZReadingHistoryFilters({ terminalId: '', closedBy: '' });
    setZReadingHistoryPage(1);
    setReportDateFilterOpen(false);
    setZReadingHistoryActionError('');
  };

  const renderZReadingToolbar = () => zReadingSection === 'daily_check' ? (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="min-w-0">
        <label htmlFor="pos-z-reading-business-date" className="block text-sm font-bold text-slate-800">Business date</label>
        <p id="pos-z-reading-date-help" className="mt-1 text-xs leading-5 text-slate-500">
          Choose one date to compare the full branch day against its saved Z-reading.
        </p>
      </div>
      <PosSingleDatePicker
        id="pos-z-reading-business-date"
        value={dailySalesCheckDate}
        todayDate={normalizeReportDateInput(reportData?.date_bounds?.today)}
        describedBy="pos-z-reading-date-help"
        onChange={(nextDate) => {
          setDailySalesCheckDateCustomized(true);
          setDailySalesCheckDate(nextDate);
        }}
      />
    </div>
  ) : (
    <>
      <PosZReadingHistoryToolbar
        searchQuery={zReadingHistorySearchInput}
        onSearchQueryChange={(nextValue) => {
          setZReadingHistorySearchInput(nextValue);
          setZReadingHistoryActionError('');
        }}
        filters={zReadingHistoryFilters}
        onApplyFilters={(nextFilters) => {
          setZReadingHistoryFilters(nextFilters);
          setZReadingHistoryPage(1);
          setZReadingHistoryActionError('');
        }}
        onRemoveFilter={handleRemoveZReadingHistoryFilter}
        onClearAllFilters={clearZReadingHistoryFilters}
        activeFilterChips={zReadingHistoryFilterChips}
        onOpenDateFilter={() => setReportDateFilterOpen(true)}
        dateFilterButtonRef={reportDateFilterButtonRef}
        dateFilterOpen={reportDateFilterOpen}
        filterButtonRef={zReadingHistoryFilterButtonRef}
        onPrint={handlePrintZReadingHistory}
        onExport={handleExportZReadingHistory}
        printDisabled={!isOnline || zReadingHistoryLoading || zReadingHistoryTotal === 0 || zReadingHistorySearchInput.trim() !== zReadingHistorySearchQuery}
        exportDisabled={!isOnline || zReadingHistoryLoading || zReadingHistoryTotal === 0 || zReadingHistorySearchInput.trim() !== zReadingHistorySearchQuery}
        actionBusy={zReadingHistoryActionBusy}
      />
      {zReadingHistoryActionError ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {zReadingHistoryActionError}
        </div>
      ) : null}
    </>
  );

  const renderDeliveryProviderBreakdown = () => (
    <SectionCard title="Delivery Provider Breakdown">
      {deliveryProviderRows.length === 0 ? (
        <p className="text-sm font-semibold text-slate-500">No delivery provider sales were recorded for the selected filters.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {deliveryProviderRows.map((entry) => (
            <div key={`${entry.provider_type}-${entry.provider_name || ''}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-black text-slate-900">{formatDeliveryProviderSummaryLabel(entry)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{Number(entry.transaction_count || 0).toLocaleString('en-US')} transactions</p>
              </div>
              <p className="text-sm font-black tabular-nums text-[#1A4E8D]">{money(entry.amount, currencySymbol)}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );

  const renderOrderSourceBreakdown = () => (
    <SectionCard title="Sales Source Breakdown">
      {orderSourceRows.length === 0 ? (
        <p className="text-sm font-semibold text-slate-500">No Walk-in Sales or Online Sales were recorded for the selected filters.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {orderSourceRows.map((entry) => {
            const transactionCount = Number(entry?.total_transactions ?? entry?.count ?? 0);
            const sourceLabel = formatSalesSource(entry?.order_source);
            return (
              <div key={entry?.order_source || sourceLabel} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-black text-slate-900">{sourceLabel}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{transactionCount.toLocaleString('en-US')} transaction{transactionCount === 1 ? '' : 's'}</p>
                </div>
                <p className="text-sm font-black tabular-nums text-[#1A4E8D]">{money(entry?.net_sales ?? entry?.amount, currencySymbol)}</p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  const renderOrderMethodBreakdown = () => (
    <SectionCard title="Order Method Breakdown">
      {orderMethodRows.length === 0 ? (
        <p className="text-sm font-semibold text-slate-500">No order methods were recorded for the selected filters.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {orderMethodRows.map((entry) => {
            const transactionCount = Number(entry?.total_transactions ?? entry?.count ?? 0);
            return (
              <div key={entry?.order_method || formatOrderMethod(entry?.order_method)} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-black text-slate-900">{formatOrderMethod(entry?.order_method)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{transactionCount.toLocaleString('en-US')} transaction{transactionCount === 1 ? '' : 's'}</p>
                </div>
                <p className="text-sm font-black tabular-nums text-[#1A4E8D]">{money(entry?.net_sales ?? entry?.amount, currencySymbol)}</p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  const renderOverallTotal = () => (
    <SectionCard title="Overall Total">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">Walk-in Sales + Online Sales</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
            <span>{Number(dailyReport.summary?.total_transactions ?? summaryCards.total_transactions ?? 0).toLocaleString('en-US')} recorded</span>
            <span>{Number(dailyReport.summary?.completed_transactions ?? dailyReport.summary?.total_transactions ?? summaryCards.total_transactions ?? 0).toLocaleString('en-US')} completed</span>
            <span>{Number(dailyReport.summary?.voided_refunded_transactions ?? 0).toLocaleString('en-US')} voided/refunded</span>
          </div>
        </div>
        <p className="text-xl font-black tabular-nums text-[#1A4E8D]">{money(summaryCards.total_sales, currencySymbol)}</p>
      </div>
    </SectionCard>
  );

  const renderTrendAndPaymentBreakdown = () => (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <SectionCard title={activeTab === 'comparison' ? 'Comparison Trend' : displayGranularity === 'yearly' ? 'Yearly Breakdown' : displayGranularity === 'monthly' ? 'Monthly Trend' : 'Sales Trend'}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendSeries}>
                <defs>
                  <linearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip formatter={(value) => money(value, currencySymbol)} />
                <Area type="monotone" dataKey="net_sales" stroke="#2563EB" fill="url(#reportTrendFill)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Payment Method Breakdown">
          {paymentChartRows.length === 0 ? <p className="text-sm font-semibold text-slate-500">No payment methods were recorded for the selected filters.</p> : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentChartRows}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="payment_method" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip formatter={(value) => money(value, currencySymbol)} />
                    <Bar dataKey="net_sales" radius={[8, 8, 0, 0]}>
                      {paymentChartRows.map((entry) => <Cell key={`payment-cell-${entry.payment_method}`} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                {paymentChartRows.map((entry) => (
                  <div key={`payment-row-${entry.payment_method}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-black text-slate-900">{entry.payment_method}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{Number(entry.total_transactions || 0).toLocaleString('en-US')} transaction{Number(entry.total_transactions || 0) === 1 ? '' : 's'}</p>
                    </div>
                    <p className="text-sm font-black tabular-nums text-[#1A4E8D]">{money(entry.net_sales, currencySymbol)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>
      {renderDeliveryProviderBreakdown()}
      {renderOrderSourceBreakdown()}
      {renderOrderMethodBreakdown()}
      {renderOverallTotal()}
    </>
  );

  return (
    <PosPageFrame id={sectionId} page="reports" className="max-[767px]:overflow-x-clip">
      {renderReportFilterPanel()}
      {renderReportDateFilterPanel()}
      <div
        data-testid="pos-reports-sticky-content"
        className={`${POS_PAGE_CONTENT_STACK_CLASS} sm:gap-6`}
      >
      <div
        data-testid="pos-reports-sticky-tabs"
        className={`min-w-0 ${POS_MOBILE_STICKY_TAB_ROW_CLASS}`}
      >
        <PosLineTabNavigation
          tabs={REPORT_TABS}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          ariaLabel="POS reports"
          hideScrollbar
          idPrefix={(tabId) => `${sectionId || 'pos-reports'}-${tabId}-tab`}
          panelId={`${sectionId || 'pos-reports'}-panel`}
        />
      </div>
      {activeTab !== 'z_readings' ? (
        <div className="min-w-0">
          <PosReportsKpiCards
            summaryCards={summaryCards}
            dailySummary={dailyReport.summary}
            comparison={comparisonReport.flexible_range}
            currencySymbol={currencySymbol}
            selectedTender={selectedTender}
            transactionRows={transactionRows}
          />
        </div>
      ) : null}
      {shouldShowOperationsSubtabs ? (
        <div className="flex min-w-0 flex-col gap-2">
          <PosSubtabNavigation
            tabs={operationSections}
            activeTab={operationSection}
            onTabChange={handleOperationSectionChange}
            ariaLabel="Operations reports"
            idPrefix={`${sectionId || 'pos-reports'}-operations`}
            panelId={`${sectionId || 'pos-reports'}-panel`}
            desktopColumns={operationSections.length === 6 ? 6 : 5}
            compactMobile
          />
          {renderReportToolbar()}
        </div>
      ) : activeTab === 'z_readings' ? (
        <>
          <PosSubtabNavigation
            tabs={Z_READING_SECTIONS}
            activeTab={zReadingSection}
            onTabChange={handleZReadingSectionChange}
            ariaLabel="Z-reading reports"
            idPrefix={`${sectionId || 'pos-reports'}-z-readings`}
            panelId={`${sectionId || 'pos-reports'}-panel`}
            desktopColumns={2}
            compactMobile
          />
          {renderZReadingToolbar()}
        </>
      ) : renderReportToolbar()}

      {activeTab !== 'z_readings' && showInlineError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {activeError}
        </div>
      ) : null}

      {activeTab !== 'z_readings' && isInitialLoading ? (
        <EmptyState message="Loading POS reports..." />
      ) : activeTab !== 'z_readings' && showBlockingError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm font-semibold text-rose-700">{activeError}</div>
      ) : !shouldRenderReportPanel ? (
        <EmptyState message="No POS report data found for the selected filters." />
      ) : (
        <div
          id={`${sectionId || 'pos-reports'}-panel`}
          role="tabpanel"
          aria-labelledby={renderedTab === 'operations'
            ? `${sectionId || 'pos-reports'}-operations-${renderedOperationSection}`
            : `${sectionId || 'pos-reports'}-${renderedTab}-tab`}
          tabIndex={0}
          className="relative space-y-4"
          style={reportPanelInlineStyle}
        >
          {activeTab !== 'z_readings' && isRefreshing ? (
            <div className="flex items-center justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-[#1D4ED8]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#2563EB]" />
                Updating report...
              </div>
            </div>
          ) : null}

          <div className={isRefreshing ? 'opacity-80 transition-opacity' : 'transition-opacity'}>

          {renderedReportTab.breakdown && isBreakdownTab ? (
            <div className="space-y-4">
              <PosReportsBreakdownSummary
                breakdown={renderedReportTab.breakdown}
                data={breakdownData}
                currencySymbol={currencySymbol}
                stale={breakdownOffline}
              />
              <PosReportsBreakdownTable
                breakdown={renderedReportTab.breakdown}
                data={breakdownData}
                currencySymbol={currencySymbol}
                searchQuery={overviewSearchQuery}
                sort={breakdownSort}
                onSortChange={(nextSort) => {
                  setBreakdownSort(nextSort);
                  setBreakdownPage(1);
                }}
                onPageChange={setBreakdownPage}
                onPageSizeChange={(nextLimit) => {
                  setBreakdownLimit(nextLimit);
                  setBreakdownPage(1);
                }}
                loading={breakdownLoading}
                disabled={breakdownOffline}
              />
            </div>
          ) : null}

          {renderedTab === 'overview' ? (
            <div className="space-y-4">
              <PosReportsOverviewTable
                rows={trendSeries}
                currencySymbol={currencySymbol}
                searchQuery={overviewSearchQuery}
              />
              {renderDeliveryProviderBreakdown()}
            </div>
          ) : null}

          {renderedTab === 'z_readings' ? (
            zReadingSection === 'daily_check' ? (
              <div className="space-y-4">
                {dailySalesCheckLoading ? (
                  <EmptyState message="Loading the selected business date…" />
                ) : dailySalesCheckError ? (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-800">
                    <span className="min-w-0">{dailySalesCheckError}</span>
                    {isOnline ? (
                      <Button type="button" variant="outline" onClick={() => setDailySalesCheckRefreshKey((current) => current + 1)}>
                        Try again
                      </Button>
                    ) : null}
                  </div>
                ) : dailySalesCheckData ? (
                  <ZReadingReconciliationCard
                    data={dailySalesCheckData}
                    currencySymbol={currencySymbol}
                    title="Z-reading reconciliation"
                    onPrint={handlePrintDailySalesCheck}
                    onExport={handleExportDailySalesCheck}
                    actionsDisabled={dailySalesCheckLoading}
                  />
                ) : (
                  <EmptyState message="No comparison data is available for this business date." />
                )}
              </div>
            ) : (
              <PosZReadingHistoryTable
                rows={zReadingHistoryRows}
                loading={zReadingHistoryLoading}
                error={zReadingHistoryError}
                page={zReadingHistoryPage}
                limit={zReadingHistoryLimit}
                total={zReadingHistoryTotal}
                onPageChange={setZReadingHistoryPage}
                onPageSizeChange={(nextLimit) => {
                  setZReadingHistoryLimit(Number(nextLimit) || 20);
                  setZReadingHistoryPage(1);
                }}
                onRetry={() => setZReadingHistoryRefreshKey((current) => current + 1)}
                onPreview={handlePreviewZReading}
                preview={{ ...zReadingHistoryPreview, onClose: closeZReadingPreview }}
                currencySymbol={currencySymbol}
              />
            )
          ) : null}

          {renderedTab === 'sales' ? (
            <div className="space-y-4">
              <PosReportsSalesTable
                rows={transactionRows}
                currencySymbol={currencySymbol}
                searchQuery={overviewSearchQuery}
              />
              {renderTrendAndPaymentBreakdown()}
            </div>
          ) : null}

          {renderedTab === 'operations' && renderedOperationSection === 'attendance' ? (
            <PosReportsAttendanceTable
              rows={cashierLifecycle.attendance?.rows || []}
              searchQuery={overviewSearchQuery}
            />
          ) : null}

          {renderedTab === 'operations' && renderedOperationSection === 'cashiers' ? (
            <PosReportsCashiersTable
              rows={dailyReport.cashier_summary || []}
              currencySymbol={currencySymbol}
              searchQuery={overviewSearchQuery}
            />
          ) : null}

          {renderedTab === 'operations' && renderedOperationSection === 'registers' ? (
            <PosReportsRegistersTable
              rows={cashierLifecycle.registers || []}
              currencySymbol={currencySymbol}
              searchQuery={overviewSearchQuery}
            />
          ) : null}

          {renderedTab === 'operations' && renderedOperationSection === 'adjustments' ? (
            <div className="space-y-4">
              <PosReportsAdjustmentKpiCards
                summary={dailyReport.adjustment_summary}
                rows={dailyReport.adjustment_rows}
                currencySymbol={currencySymbol}
              />
              <PosReportsAdjustmentsTable
                rows={Array.isArray(dailyReport.adjustment_rows) ? dailyReport.adjustment_rows : []}
                currencySymbol={currencySymbol}
                searchQuery={overviewSearchQuery}
                idPrefix="pos-reports-operations-adjustments"
              />
            </div>
          ) : null}

          {renderedTab === 'operations' && renderedOperationSection === 'handoffs' ? (
            <div className="space-y-4">
              <PosReportsHandoffTable
                rows={cashierLifecycle.operators?.rows || []}
                searchQuery={overviewSearchQuery}
              />
              <PosReportsResponsiveTable
                columns={[
                  { key: 'event_at', label: 'Event Time', align: 'left', required: true, render: (row) => printDateTime(row.event_at) },
                  { key: 'event_type', label: 'Event', align: 'left', render: (row) => String(row.event_type || '').replace(/_/g, ' ') },
                  { key: 'outgoing_operator_name', label: 'Outgoing', align: 'left', render: (row) => row.outgoing_operator_name || '-' },
                  { key: 'incoming_operator_name', label: 'Incoming', align: 'left', render: (row) => row.incoming_operator_name || '-' },
                  { key: 'custody_mode', label: 'Custody', align: 'center', render: (row) => String(row.custody_mode || '').replace(/_/g, ' ') },
                  { key: 'counted_cash_amount', label: 'Counted', valueTone: (row) => row.counted_cash_amount == null ? 'muted' : 'secondary', align: 'left', render: (row) => row.counted_cash_amount == null ? 'Not counted' : money(row.counted_cash_amount, currencySymbol) },
                  { key: 'variance_amount', label: 'Variance', valueTone: (row) => row.variance_amount == null ? 'muted' : Number(row.variance_amount) < 0 ? 'danger' : 'secondary', align: 'left', render: (row) => row.variance_amount == null ? 'Not attributed' : money(row.variance_amount, currencySymbol) }
                ]}
                rows={cashierLifecycle.handoffs?.rows || []}
                searchQuery={overviewSearchQuery}
                getSearchValue={(row) => [row.event_at, row.event_type, row.outgoing_operator_name, row.incoming_operator_name, row.custody_mode, row.counted_cash_amount, row.variance_amount].join(' ')}
                title="Drawer handoff timeline"
                ariaLabel="Drawer handoff timeline table"
                idPrefix="pos-reports-drawer-handoffs"
                emptyMessage="No shared-access or counted handoffs were recorded for these filters."
                searchEmptyMessage="No handoff timeline rows match your search."
                resultLabel="handoff events"
                showActions={false}
              />
            </div>
          ) : null}

          {renderedTab === 'operations' && renderedOperationSection === 'employee_credit' ? (
            <EmployeeCreditReportPanel
              dateFrom={normalizedDateRange.dateFrom}
              dateTo={normalizedDateRange.dateTo}
              currencySymbol={currencySymbol}
              refreshKey={employeeCreditReportRefreshKey}
              isOnline={isOnline}
              searchQuery={overviewSearchQuery}
              onReportDataChange={setEmployeeCreditReportData}
            />
          ) : null}

          {renderedTab === 'comparison' ? (
            <PosReportsComparisonPanel
              comparison={comparisonReport}
              currencySymbol={currencySymbol}
              granularity={displayGranularity}
              onGranularityChange={setGranularity}
            />
          ) : null}

          {renderedTab === 'profit_loss' ? (
            <div className="space-y-4">
              <PosReportsProfitLossTable
                rows={profitLoss.rows || []}
                currencySymbol={currencySymbol}
                searchQuery={overviewSearchQuery}
              />
              {renderTrendAndPaymentBreakdown()}
            </div>
          ) : null}

          {renderedTab === 'sales' && displayGranularity === 'yearly' ? (
            <SectionCard title="Year-over-Year">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Current year</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{money(yearlyReport.year_over_year?.current?.net_sales, currencySymbol)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Profit {money(yearlyReport.year_over_year?.current?.pos_profit_loss, currencySymbol)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Previous year</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{money(yearlyReport.year_over_year?.previous?.net_sales, currencySymbol)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Profit {money(yearlyReport.year_over_year?.previous?.pos_profit_loss, currencySymbol)}</p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {renderedTab === 'top_items' ? (
            <PosReportsTopItemsTable
              rows={displayGranularity === 'yearly'
                ? (yearlyReport.top_items || [])
                : displayGranularity === 'monthly'
                  ? (monthlyReport.top_items || [])
                  : (dailyReport.top_items || [])}
              currencySymbol={currencySymbol}
              totalSales={dailyReport.summary?.net_sales}
              searchQuery={overviewSearchQuery}
            />
          ) : null}
          </div>
        </div>
      )}
      </div>
    </PosPageFrame>
  );
}

export default PosReportsAnalyticsWorkspace;
