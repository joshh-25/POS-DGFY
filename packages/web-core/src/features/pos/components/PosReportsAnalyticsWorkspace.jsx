import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadOfflinePosReportSnapshot, saveOfflinePosReportSnapshot } from '../services/offlinePosSnapshotStore.js';
import {
  ArrowLeftRight,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  BarChart3,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Filter,
  LayoutDashboard,
  Printer,
  Receipt,
  Scale,
  ShoppingBag,
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
  exportProcurementCsv,
  fetchPosReportsOverview
} from '../services/posService.js';
import EmployeeCreditReportPanel from './EmployeeCreditReportPanel.jsx';
import PosLineTabNavigation from './PosLineTabNavigation.jsx';
import PosReportsDateFilterPanel from './PosReportsDateFilterPanel.jsx';
import PosReportsFilterPanel from './PosReportsFilterPanel.jsx';
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
import PosReportsComparisonPanel from './PosReportsComparisonPanel.jsx';
import PosReportsToolbar from './PosReportsToolbar.jsx';
import PosReportsResponsiveTable from './PosReportsResponsiveTable.jsx';
import PosSubtabNavigation from './PosSubtabNavigation.jsx';
import PosPageFrame from './PosPageFrame.jsx';
import { POS_MOBILE_STICKY_TAB_ROW_CLASS, POS_PAGE_CONTENT_STACK_CLASS } from './PosPageSpacing.js';
import { buildPosReportsActiveFilters } from './posReportsActiveFilters.js';
import { formatPosTransactionPaymentMethods } from '../utils/posPaymentMethods.js';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';
import {
  BackOfficeReportDataTable as DataTable,
  BackOfficeReportEmptyState as EmptyState,
  BackOfficeReportMetric as MetricCard,
  BackOfficeReportSectionCard as SectionCard
} from '../../../components/backOffice/BackOfficePrimitives.jsx';

const REPORT_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, granularity: 'daily', exportSection: 'daily' },
  { id: 'sales', label: 'Sales', icon: Receipt, granularity: 'daily', exportSection: 'sales' },
  { id: 'comparison', label: 'Comparison', icon: ArrowLeftRight, granularity: 'daily', exportSection: 'comparison' },
  { id: 'top_items', label: 'Top Selling Items', icon: ShoppingBag, granularity: 'daily', exportSection: 'daily' },
  { id: 'profit_loss', label: 'Profit/Loss', icon: Scale, granularity: 'monthly', exportSection: 'profit_loss' },
  { id: 'operations', label: 'Operations', icon: BarChart3, granularity: 'daily', exportSection: 'cashiers' }
];

const REPORT_OPERATION_SECTIONS = [
  { id: 'cashiers', label: 'Cashiers', icon: Users },
  { id: 'registers', label: 'Registers', icon: Calculator },
  { id: 'adjustments', label: 'Adjustments', icon: Receipt },
  { id: 'handoffs', label: 'Handoff', icon: ArrowLeftRight },
  { id: 'attendance', label: 'Attendance', icon: Clock3 },
  { id: 'employee_credit', label: 'Credit Activity', icon: CreditCard, permission: 'pos:employee_credit:report' }
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
  { value: 'in_store', label: 'In-Store' },
  { value: 'online_store', label: 'Online Store' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' }
];

const CHART_COLORS = ['#2563EB', '#14B8A6', '#F97316', '#0EA5E9', '#8B5CF6'];
const REPORT_TAB_TRANSITION_MS = 150;
const REPORT_TAB_SLIDE_OFFSET = 28;
const money = (value, currencySymbol = '₱') => `${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol}${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (value) => `${Number(value || 0).toFixed(1)}%`;
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

const deltaTone = (value) => (Number(value || 0) >= 0
  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
  : 'text-rose-700 bg-rose-50 border-rose-200');

const ZReadingReconciliationCard = ({ data, currencySymbol }) => {
  if (!data) return null;

  const status = String(data.status || 'not_comparable');
  const statusConfig = status === 'matched'
    ? { label: 'Matched', Icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
    : status === 'variance'
      ? { label: 'Variance found', Icon: AlertTriangle, className: 'border-rose-200 bg-rose-50 text-rose-800' }
      : { label: status === 'not_generated' ? 'Not generated' : 'Comparison unavailable', Icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-800' };
  const StatusIcon = statusConfig.Icon;
  const isComparable = status === 'matched' || status === 'variance';
  const hasReportTotal = data.report_recognized_sales !== null && data.report_recognized_sales !== undefined;

  return (
    <SectionCard
      title="Z-reading reconciliation"
      actions={data.reading_identifier ? <span className="text-xs font-black text-slate-500">{data.reading_identifier}</span> : null}
    >
      <div className={`rounded-2xl border px-4 py-3 ${statusConfig.className}`}>
        <div className="flex items-start gap-3">
          <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-black">{statusConfig.label}</p>
            <p className="mt-1 text-xs font-semibold leading-5">{data.message || 'The selected report scope cannot be compared with a Z-reading.'}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Report recognized sales" value={hasReportTotal ? money(data.report_recognized_sales, currencySymbol) : '—'} hint="Completed, recognized transaction totals" />
        <MetricCard label="Z-reading total" value={data.z_total_amount === null || data.z_total_amount === undefined ? '—' : money(data.z_total_amount, currencySymbol)} hint={data.generated_at ? `Generated ${printDateTime(data.generated_at)}` : 'No immutable snapshot yet'} />
        <MetricCard label="Difference" value={data.variance === null || data.variance === undefined ? '—' : money(data.variance, currencySymbol)} tone={isComparable && Number(data.variance || 0) < 0 ? 'negative' : isComparable ? 'positive' : 'default'} hint={isComparable ? 'Report recognized sales minus Z-reading total' : 'Shown only when both totals are comparable'} />
        <MetricCard label="Report net sales" value={money(data.report_net_sales, currencySymbol)} hint="Different metric; includes line-level discounts/refunds" />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
        <span>Z voids: {Number(data.z_void_transaction_count || 0)} · {money(data.z_void_amount, currencySymbol)}</span>
        <span>Report refunds/voids: {money(data.report_refunds_voids, currencySymbol)}</span>
        <span>Report adjustments: {money(data.report_adjustment_amount, currencySymbol)}</span>
        {data.generated_at ? <span>Generated: {printDateTime(data.generated_at)}</span> : null}
        {data.evaluated_at ? <span>Checked: {printDateTime(data.evaluated_at)}</span> : null}
      </div>
    </SectionCard>
  );
};

function PosReportsAnalyticsWorkspace({
  terminalUser = null,
  terminalMeta,
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
  const [reportPanelInlineStyle, setReportPanelInlineStyle] = useState({ opacity: 1, transition: 'none' });
  const reportPanelAnimationTimersRef = useRef([]);
  const [granularity, setGranularity] = useState('daily');
  const [dateRange, setDateRange] = useState(() => getDefaultRange('daily'));
  const [defaultDisplayDateRange, setDefaultDisplayDateRange] = useState(() => getDefaultRange('daily'));
  const [reportDateFilterApplied, setReportDateFilterApplied] = useState(false);
  const [cashierId, setCashierId] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [overviewSearchQuery, setOverviewSearchQuery] = useState('');
  const [reportFiltersOpen, setReportFiltersOpen] = useState(false);
  const [reportDateFilterOpen, setReportDateFilterOpen] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [employeeCreditReportData, setEmployeeCreditReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currencySymbol = String(terminalMeta?.pettyCashSymbol || '₱').toUpperCase() === 'PHP' ? '₱' : (terminalMeta?.pettyCashSymbol || '₱');
  const operationSections = useMemo(() => REPORT_OPERATION_SECTIONS.filter((section) => (
    !section.permission || terminalUser?.is_master_admin === true || resolveUserPermissionList(terminalUser).includes(section.permission)
  )), [terminalUser]);
  const selectedReportTab = useMemo(() => REPORT_TABS.find((tab) => tab.id === activeTab) || REPORT_TABS[0], [activeTab]);
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
  const normalizedDateRange = useMemo(() => ({
    dateFrom: normalizeReportDateInput(dateRange.dateFrom),
    dateTo: normalizeReportDateInput(dateRange.dateTo)
  }), [dateRange.dateFrom, dateRange.dateTo]);
  const offlineReportKey = useMemo(() => JSON.stringify({
    granularity: displayGranularity,
    dateFrom: normalizedDateRange.dateFrom,
    dateTo: normalizedDateRange.dateTo,
    cashierId,
    paymentType,
    source,
    categoryId
  }), [
    categoryId,
    cashierId,
    displayGranularity,
    normalizedDateRange.dateFrom,
    normalizedDateRange.dateTo,
    paymentType,
    source
  ]);

  const handleTabChange = (tabId) => {
    const nextTab = String(tabId || 'overview').trim() || 'overview';
    const selectedTab = REPORT_TABS.find((tab) => tab.id === nextTab) || REPORT_TABS[0];
    if (selectedTab.id === activeTab) return;
    transitionReportPanel(selectedTab.id, operationSection);
    setActiveTab(selectedTab.id);
    setOverviewSearchQuery('');
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
    setCategoryId('');
    setOverviewSearchQuery('');
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
    setCategoryId(nextFilters.categoryId);
    setReportFiltersOpen(false);
  };

  const handleApplyReportDateRange = (nextDateRange) => {
    setDateRange({ ...nextDateRange });
    setReportDateFilterApplied(true);
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
    let cancelled = false;

    const loadReports = async () => {
      setLoading(true);
      setError('');
      if (!isOnline) {
        const snapshot = loadOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey);
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
          category_id: categoryId || undefined
        });
        if (!cancelled) {
          setReportData(payload);
          saveOfflinePosReportSnapshot(offlineSnapshotScope, offlineReportKey, payload);
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
    categoryId,
    cashierId,
    displayGranularity,
    isOnline,
    normalizedDateRange.dateFrom,
    normalizedDateRange.dateTo,
    offlineReportKey,
    offlineSnapshotScope,
    paymentType,
    reportRefreshKey,
    source
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

  const trendSeries = useMemo(() => {
    if (activeTab === 'comparison') {
      return comparisonReport.flexible_trend || [];
    }
    if (displayGranularity === 'monthly') return monthlyReport.sales_trend || [];
    if (displayGranularity === 'yearly') return yearlyReport.monthly_breakdown || [];
    return dailyReport.trend || [];
  }, [activeTab, comparisonReport.flexible_trend, dailyReport.trend, displayGranularity, monthlyReport.sales_trend, yearlyReport.monthly_breakdown]);

  const paymentChartRows = (dailyReport.payment_breakdown || []).map((entry, index) => ({
    ...entry,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  }));
  const isInitialLoading = loading && !reportData;
  const isRefreshing = loading && Boolean(reportData);
  const showBlockingError = Boolean(error) && !reportData;
  const showInlineError = Boolean(error) && Boolean(reportData);

  const hasData = Boolean(reportData) && (
    Number(summaryCards.total_transactions || 0) > 0
    || Number(summaryCards.total_sales || 0) > 0
    || Number(dailyReport.adjustment_summary?.adjustment_count || 0) > 0
    || (trendSeries || []).length > 0
    || (activeTab === 'operations' && Object.keys(cashierLifecycle || {}).length > 0)
  );
  const shouldRenderReportPanel = Boolean(reportData) && (hasData || activeTab === 'overview');
  const shouldShowOperationsSubtabs = activeTab === 'operations'
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
  const selectedCategory = categories.find((entry) => String(entry.folder_id) === String(categoryId));
  const activeReportFilterChips = useMemo(() => buildPosReportsActiveFilters({
    dateFilterApplied: reportDateFilterApplied,
    dateRange: normalizedDateRange,
    granularity: displayGranularity,
    defaultGranularity: selectedReportTab.granularity,
    cashierLabel: cashierId ? reportCashierLabel : '',
    paymentLabel: selectedPaymentLabel,
    sourceLabel: selectedSourceLabel,
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
    selectedSourceLabel
  ]);

  const handleExportCsv = async () => {
    const selectedTab = REPORT_TABS.find((tab) => tab.id === activeTab) || REPORT_TABS[0];
    const { blob, filename } = await exportPosReportCsv({
      section: activeTab === 'operations' ? operationSection : selectedTab.exportSection,
      granularity: displayGranularity,
      date_from: normalizedDateRange.dateFrom,
      date_to: normalizedDateRange.dateTo,
      cashier_id: cashierId || undefined,
      payment_type: paymentType || undefined,
      source: source || undefined,
      category_id: categoryId || undefined
    });
    downloadBlob(blob, filename);
  };

  // Procurement export is intentionally independent of the currently loaded
  // report: the endpoint builds the inventory snapshot from the live catalog.
  const handleExportProcurementCsv = async () => {
    const { blob, filename } = await exportProcurementCsv();
    downloadBlob(blob, filename);
  };

  const handlePrint = () => {
    const isEmployeeCreditReport = activeTab === 'operations' && operationSection === 'employee_credit';
    if (typeof window === 'undefined' || !reportData || (isEmployeeCreditReport && !employeeCreditReportData)) return;
    const printWindow = window.open('', '_blank', 'width=1120,height=900');
    if (!printWindow) return;

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
        <td>${escapeHtml(entry.status || '-')}</td>
        <td style="text-align:right">${escapeHtml(money(entry.total_amount, currencySymbol))}</td>
        <td style="text-align:right">${escapeHtml(money(entry.net_sales, currencySymbol))}</td>
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
            <div class="card"><div class="label">Transactions</div><div class="value">${Number(summaryCards.total_transactions || 0)}</div></div>
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
              <thead><tr><th>Invoice</th><th>Datetime</th><th>Cashier</th><th>Payment</th><th>Status</th><th>Total</th><th>Reported Net Sales</th></tr></thead>
              <tbody>${filteredTransactions || '<tr><td colspan="7">No transactions found.</td></tr>'}</tbody>
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

  const comparisonCards = comparisonReport.fixed_periods || [];

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
      exportDisabled={!reportData}
      printDisabled={!reportData || (activeTab === 'operations' && operationSection === 'employee_credit' && !employeeCreditReportData)}
      filtersOpen={reportFiltersOpen}
      dateFilterOpen={reportDateFilterOpen}
      filterButtonRef={reportFilterButtonRef}
      dateFilterButtonRef={reportDateFilterButtonRef}
    />
  );

  const renderTrendAndPaymentBreakdown = () => (
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

      <SectionCard title="Payment Breakdown">
        <div className="h-[280px]">
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
      </SectionCard>
    </div>
  );

  return (
    <PosPageFrame id={sectionId} page="reports" className="max-[767px]:overflow-x-clip">
      {renderReportFilterPanel()}
      {renderReportDateFilterPanel()}
      <div
        data-testid="pos-reports-sticky-content"
        className={`${POS_PAGE_CONTENT_STACK_CLASS} sm:gap-6`}
      >
      <div className="min-w-0">
        <PosReportsKpiCards
          summaryCards={summaryCards}
          dailySummary={dailyReport.summary}
          comparison={comparisonReport.flexible_range}
          currencySymbol={currencySymbol}
          selectedTender={selectedTender}
        />
      </div>
      <div
        data-testid="pos-reports-sticky-tabs"
        className={`min-w-0 ${POS_MOBILE_STICKY_TAB_ROW_CLASS}`}
      >
        <PosLineTabNavigation
          tabs={REPORT_TABS}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          ariaLabel="POS reports"
          idPrefix={(tabId) => `${sectionId || 'pos-reports'}-${tabId}-tab`}
          panelId={`${sectionId || 'pos-reports'}-panel`}
        />
        {shouldShowOperationsSubtabs ? (
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
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {renderReportToolbar()}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 gap-1.5 rounded-xl border-slate-200 px-3 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50 sm:min-h-10 sm:px-4 sm:text-[13px] lg:min-h-9"
          onClick={handleExportProcurementCsv}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Procurement CSV</span>
        </Button>
      </div>

      {showInlineError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {error}
        </div>
      ) : null}

      {isInitialLoading ? (
        <EmptyState message="Loading POS reports..." />
      ) : showBlockingError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm font-semibold text-rose-700">{error}</div>
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
          {isRefreshing ? (
            <div className="flex items-center justify-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-[#1D4ED8]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#2563EB]" />
                Updating report...
              </div>
            </div>
          ) : null}

          <div className={isRefreshing ? 'opacity-80 transition-opacity' : 'transition-opacity'}>

          {renderedTab === 'overview' ? (
            <div className="space-y-4">
              <ZReadingReconciliationCard data={zReadingReconciliation} currencySymbol={currencySymbol} />
              <PosReportsOverviewTable
                rows={trendSeries}
                currencySymbol={currencySymbol}
                searchQuery={overviewSearchQuery}
              />

            </div>
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
            <section aria-labelledby="sales-comparison-snapshot-title" className="mt-4">
              <h3 id="sales-comparison-snapshot-title" className="mb-4 text-sm font-black text-slate-950">
                Sales Comparison Snapshot
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {comparisonCards.map((entry) => {
                  const positive = Number(entry.sales_delta_percentage || 0) >= 0;
                  const DeltaIcon = positive ? ArrowUpRight : ArrowDownRight;
                  return (
                    <div key={entry.key} className={`rounded-2xl border px-4 py-4 ${positive ? 'border-emerald-200 bg-emerald-50/80' : 'border-rose-200 bg-rose-50/80'}`}>
                      <p className="text-sm font-black text-slate-950">{entry.label}</p>
                      <p className="mt-3 text-2xl font-black text-slate-950">{money(entry.current?.net_sales, currencySymbol)}</p>
                      <div className={`mt-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${deltaTone(entry.sales_delta_percentage)}`}>
                        <DeltaIcon className="h-3.5 w-3.5" />
                        {percent(entry.sales_delta_percentage)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
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
