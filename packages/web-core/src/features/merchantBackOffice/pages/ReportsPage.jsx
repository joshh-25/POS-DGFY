import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  DollarSign,
  Download,
  BarChart3,
  Loader2,
  Package,
  ShoppingCart,
  Factory,
  Calendar,
  Save,
  History,
  ChevronDown,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Hourglass,
  Truck,
  PieChart,
  WalletCards
} from 'lucide-react';
import CostAnalysisWidget from '@/components/reports/CostAnalysisWidget';
import TenantRevenueReadOnlyPanel from '@/src/features/reports/TenantRevenueReadOnlyPanel.jsx';
import SalesStockReportPanel from '../components/SalesStockReportPanel.jsx';
import { Link, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils.js';
import { useReports } from '@/hooks/useReports.js';
import { useLocations } from '@/hooks/useLocations.js';
import { formatNumber, formatPeso } from '@/lib/numberUtils.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const REPORT_TYPE_BY_TAB = Object.freeze({
  expiry: 'expiry',
  aging: 'stock_aging',
  production: 'production',
  procurement: 'po_analysis',
  summary: 'executive_summary'
});

const REPORT_TAB_BY_TYPE = Object.freeze(
  Object.fromEntries(Object.entries(REPORT_TYPE_BY_TAB).map(([tab, reportType]) => [reportType, tab]))
);

const REPORT_TAB_LABELS = Object.freeze({
  expiry: 'Expiry risk',
  aging: 'Stock aging',
  production: 'Production',
  procurement: 'Purchasing',
  summary: 'Overview',
  'sales-stock': 'Sales & stock',
  cost: 'Cost analysis',
  'tenant-revenue': 'Revenue & transfers'
});

const TENANT_WIDE_REPORT_TABS = new Set(['cost', 'tenant-revenue']);

const buildReportsHandoffPath = (rootPath, section, filters = {}) => {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) query.set(key, String(value));
  });
  const search = query.toString();
  return `${rootPath}/${section}${search ? `?${search}` : ''}`;
};

function ReportPanelStatus({ label, loading, error, hasData }) {
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Please try again.';

  if (!hasData && loading) {
    return (
      <div className="business-admin-report-panel-state" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading {label}…</span>
      </div>
    );
  }

  if (!hasData && error) {
    return (
      <div className="business-admin-reports-error business-admin-report-panel-error bg-red-50 border border-red-200 rounded-2xl p-6" role="alert">
        <p className="text-red-800 font-medium">{label} could not be loaded</p>
        <p className="text-red-600 text-sm mt-1">{errorMessage}</p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="business-admin-report-panel-state" role="status" aria-live="polite">
        <span>No {label.toLowerCase()} data is available.</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="business-admin-report-panel-refresh" role="status" aria-live="polite">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Updating {label}…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="business-admin-report-panel-refresh business-admin-report-panel-refresh-error" role="alert">
        <span>Could not refresh {label.toLowerCase()}. Showing the last loaded data.</span>
        <span className="sr-only">{errorMessage}</span>
      </div>
    );
  }

  return <div className="business-admin-report-panel-refresh" aria-hidden="true" />;
}

export default function ReportsPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('summary');
  const [dateFilters, setDateFilters] = useState({ startDate: '', endDate: '', location_id: '' });
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const { locations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
  );

  const {
    loading,
    error,
    expiryReport,
    stockAgingReport,
    productionReport,
    poAnalysisReport,
    executiveSummary,
    snapshots,
    fetchExpiryReport,
    fetchStockAgingReport,
    fetchProductionReport,
    fetchPOAnalysisReport,
    fetchExecutiveSummary,
    fetchSnapshots,
    saveSnapshot,
    loadSnapshot,
    exportCSV
  } = useReports();

  const activeReportType = REPORT_TYPE_BY_TAB[activeTab];
  const supportsReportActions = Boolean(activeReportType);
  const supportsLocationFilter = !TENANT_WIDE_REPORT_TABS.has(activeTab);
  const activeTabLabel = REPORT_TAB_LABELS[activeTab] || 'Report';
  const hasActiveFilters = Boolean(dateFilters.startDate || dateFilters.endDate || dateFilters.location_id);
  const rootPath = location.pathname.startsWith('/backoffice') ? '/backoffice' : '/business-admin';
  const salesTimelinePath = buildReportsHandoffPath(rootPath, 'sales', {
    date_from: dateFilters.startDate,
    date_to: dateFilters.endDate,
    source_context: 'reports'
  });
  const orderCenterPath = buildReportsHandoffPath(rootPath, 'orders', {
    date_from: dateFilters.startDate,
    date_to: dateFilters.endDate,
    branch_id: dateFilters.location_id
  });

  // Fetch data when tab changes or filters change
  useEffect(() => {
    const filters = {
      startDate: dateFilters.startDate || undefined,
      endDate: dateFilters.endDate || undefined,
      location_id: dateFilters.location_id || undefined
    };

    switch (activeTab) {
      case 'expiry':
        fetchExpiryReport(filters);
        break;
      case 'aging':
        fetchStockAgingReport(filters);
        break;
      case 'production':
        fetchProductionReport(filters);
        break;
      case 'procurement':
        fetchPOAnalysisReport(filters);
        break;
      case 'summary':
        fetchExecutiveSummary(filters);
        break;
    }
  }, [activeTab, dateFilters, fetchExpiryReport, fetchStockAgingReport, fetchProductionReport, fetchPOAnalysisReport, fetchExecutiveSummary]);

  // Fetch snapshots when tab changes
  useEffect(() => {
    if (activeReportType) fetchSnapshots(activeReportType);
  }, [activeReportType, fetchSnapshots]);

  const handleExportCSV = async () => {
    if (!activeReportType) return;
    try {
      await exportCSV(activeReportType, dateFilters);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleResetFilters = () => {
    setDateFilters({ startDate: '', endDate: '', location_id: '' });
  };

  const handleSaveSnapshot = async () => {
    const dataMap = {
      expiry: expiryReport,
      aging: stockAgingReport,
      production: productionReport,
      procurement: poAnalysisReport,
      summary: executiveSummary
    };
    const snapshotData = dataMap[activeTab];
    if (!activeReportType || !snapshotData) return;

    try {
      setLoadingSnapshot(true);
      await saveSnapshot(activeReportType, snapshotData, dateFilters, snapshotName || undefined);
      setShowSnapshotDialog(false);
      setSnapshotName('');
      fetchSnapshots(activeReportType);
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const handleLoadSnapshot = async (snapshotId) => {
    try {
      const snapshot = await loadSnapshot(snapshotId);
      if (snapshot) {
        const snapshotTab = REPORT_TAB_BY_TYPE[snapshot.report_type];
        if (snapshotTab) setActiveTab(snapshotTab);
        setDateFilters((previous) => ({
          ...previous,
          startDate: snapshot.date_range_start || '',
          endDate: snapshot.date_range_end || ''
        }));
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err);
    }
  };

  const statusColors = {
    expired: "bg-red-100 text-red-700 border-red-200",
    critical: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    upcoming: "bg-yellow-100 text-yellow-700 border-yellow-200",
    fresh: "bg-emerald-100 text-emerald-700 border-emerald-200",
    aging: "bg-amber-100 text-amber-700 border-amber-200"
  };

  return (
    <div className="business-admin-reports-page space-y-5">
      <section className="business-admin-reports-hero">
        <div className="business-admin-reports-hero-heading">
          <div className="business-admin-reports-title-group">
            <div className="business-admin-reports-hero-icon">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="business-admin-reports-title-copy">
              <p className="business-admin-reports-kicker">Business overview</p>
              <h2>Reports &amp; analytics</h2>
              <p>See what needs attention, where performance is moving, and what to review next.</p>
            </div>
          </div>
          <div className="business-admin-reports-hero-status">
            <span className="business-admin-reports-chip business-admin-reports-chip-primary">{activeTabLabel}</span>
            <span className="business-admin-reports-chip">
              {supportsLocationFilter ? 'Branch-aware' : 'Business-wide read-only'}
            </span>
          </div>
        </div>

        <div className="business-admin-reports-filter-panel">
          <div className="business-admin-reports-filter-heading">
            <div>
              <span className="business-admin-reports-kicker">Filters</span>
              <strong>Choose period and scope</strong>
            </div>
            {hasActiveFilters ? (
              <button type="button" className="business-admin-reports-reset" onClick={handleResetFilters}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reset filters
              </button>
            ) : (
              <span className="business-admin-reports-filter-hint">Updates automatically</span>
            )}
          </div>

          <div className="business-admin-reports-filter-grid">
            <div className="business-admin-reports-field">
              <Label htmlFor="report-date-from" className="business-admin-reports-field-label">From</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="report-date-from"
                type="date"
                value={dateFilters.startDate}
                onChange={(e) => setDateFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="business-admin-reports-input h-10 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm"
              />
            </div>
          </div>
            <div className="business-admin-reports-field">
              <Label htmlFor="report-date-to" className="business-admin-reports-field-label">To</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="report-date-to"
                type="date"
                value={dateFilters.endDate}
                onChange={(e) => setDateFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="business-admin-reports-input h-10 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm"
              />
            </div>
          </div>
          {supportsLocationFilter ? (
            <div className="business-admin-reports-field">
              <Label htmlFor="report-location" className="business-admin-reports-field-label">Branch</Label>
              <Select
                value={dateFilters.location_id || 'all'}
                onValueChange={(value) => setDateFilters((prev) => ({ ...prev, location_id: value === 'all' ? '' : value }))}
              >
                <SelectTrigger id="report-location" className="business-admin-reports-input h-10 rounded-xl border-slate-200 bg-slate-50 text-sm">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {activeLocations.map((location) => (
                    <SelectItem key={`report-location-${location.location_id}`} value={String(location.location_id)}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="business-admin-reports-field">
              <span className="business-admin-reports-field-label">Scope</span>
              <div className="business-admin-reports-scope-value">
                All business data · branch filter not used
              </div>
            </div>
          )}
          </div>

          <div className="business-admin-reports-actions">
            {supportsReportActions ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="business-admin-reports-action h-10 rounded-xl">
                    <History className="mr-2 h-4 w-4" />
                    Saved reports
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => setShowSnapshotDialog(true)}>
                    <Save className="mr-2 h-4 w-4" />
                    Save current report
                  </DropdownMenuItem>
                  <div className="my-1 h-px bg-slate-100" />
                  <div className="px-2 py-1 text-xs font-medium text-slate-500">Previous snapshots</div>
                  {snapshots.length > 0 ? snapshots.slice(0, 5).map(snap => (
                    <DropdownMenuItem key={snap.snapshot_id} onClick={() => handleLoadSnapshot(snap.snapshot_id)}>
                      <Clock className="mr-2 h-4 w-4" />
                      {snap.report_name || new Date(snap.created_at).toLocaleDateString()}
                    </DropdownMenuItem>
                  )) : (
                    <DropdownMenuItem disabled>No saved snapshots yet</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {supportsReportActions ? (
              <Button variant="default" className="business-admin-reports-action business-admin-reports-action-primary h-10 rounded-xl" onClick={handleExportCSV} disabled={loading}>
                <Download className="mr-2 h-4 w-4" />
                Export report
              </Button>
            ) : (
              <span className="business-admin-reports-read-only">
                Read-only view
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="business-admin-reports-investigation-handoff" aria-label="Report investigation handoff">
        <div className="business-admin-reports-investigation-copy">
          <span className="business-admin-reports-kicker">Investigation handoff</span>
          <strong>Keep summaries, transactions, and receipts in their canonical views.</strong>
          <p>These reports preserve summary totals and export scope. Employee-focused summaries remain report-owned; transaction sorting and pagination belong to Sales timeline, while receipt-safe order details belong to Order center.</p>
        </div>
        <div className="business-admin-reports-investigation-actions">
          <Link to={salesTimelinePath} className="business-admin-reports-action inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold">Open Sales timeline</Link>
          <Link to={orderCenterPath} className="business-admin-reports-action inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold">Open Order center</Link>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="business-admin-reports-tabs-root space-y-5">
        <div className="business-admin-reports-tabs-shell">
          <div className="business-admin-reports-tabs-heading">
            <div>
              <span className="business-admin-reports-kicker">Explore reports</span>
              <strong>Choose a view</strong>
            </div>
            <span className="business-admin-reports-tabs-current">Viewing: {activeTabLabel}</span>
          </div>
           <div className="business-admin-reports-tabs-scroll overflow-x-auto">
           <TabsList aria-label="Report types" className="business-admin-reports-tabs-list flex h-auto min-w-max flex-nowrap gap-1 bg-transparent p-1">
          <TabsTrigger value="summary" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="expiry" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <AlertTriangle className="w-4 h-4" />
            Expiry risk
          </TabsTrigger>
          <TabsTrigger value="aging" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <Clock className="w-4 h-4" />
            Stock aging
          </TabsTrigger>
          <TabsTrigger value="production" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <Factory className="w-4 h-4" />
            Production
          </TabsTrigger>
          <TabsTrigger value="procurement" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <ShoppingCart className="w-4 h-4" />
            Purchasing
          </TabsTrigger>
          <TabsTrigger value="sales-stock" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <Package className="w-4 h-4" />
            Sales &amp; stock
          </TabsTrigger>
          <TabsTrigger value="cost" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <PieChart className="w-4 h-4" />
            Cost analysis
          </TabsTrigger>
          <TabsTrigger value="tenant-revenue" className="business-admin-reports-tab flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2">
            <WalletCards className="w-4 h-4" />
            Revenue &amp; transfers
          </TabsTrigger>
          </TabsList>
          </div>
        </div>

        <TabsContent value="tenant-revenue">
          <TenantRevenueReadOnlyPanel startDate={dateFilters.startDate} endDate={dateFilters.endDate} />
        </TabsContent>

        <TabsContent value="sales-stock">
          <SalesStockReportPanel dateFilters={dateFilters} />
        </TabsContent>

        {/* EXPIRY REPORT TAB */}
        <TabsContent value="expiry" forceMount>
          <ReportPanelStatus label="expiry risk" loading={loading} error={error} hasData={Boolean(expiryReport)} />
          {expiryReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Expired</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 mt-2">{expiryReport.summary.total_expired_batches}</p>
                  <p className="text-sm text-red-600">{formatPeso(expiryReport.summary.total_expired_value, 2)}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Critical (&lt;=7d)</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 mt-2">{expiryReport.summary.total_critical_batches}</p>
                  <p className="text-sm text-red-600">{formatPeso(expiryReport.summary.total_critical_value, 2)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm font-medium">Warning (&lt;=14d)</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700 mt-2">{expiryReport.summary.total_warning_batches}</p>
                  <p className="text-sm text-amber-600">{formatPeso(expiryReport.summary.total_warning_value, 2)}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-yellow-600">
                    <Hourglass className="w-5 h-5" />
                    <span className="text-sm font-medium">Upcoming (&lt;=30d)</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-700 mt-2">{expiryReport.summary.total_upcoming_batches}</p>
                  <p className="text-sm text-yellow-600">{formatPeso(expiryReport.summary.total_upcoming_value, 2)}</p>
                </div>
                <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <DollarSign className="w-5 h-5" />
                    <span className="text-sm font-medium">Total at Risk</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800 mt-2">{formatPeso(expiryReport.summary.total_value_at_risk, 2)}</p>
                </div>
              </div>

              {/* Expired Batches */}
              {expiryReport.expired.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                  <div className="p-4 border-b border-red-100 bg-red-50">
                    <h3 className="font-semibold text-red-800">Expired Batches ({expiryReport.expired.length})</h3>
                    <p className="text-sm text-red-600">These items have passed their expiry date</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-red-50/50">
                        <tr>
                          <th className="text-left p-3 font-medium text-red-700">Item</th>
                          <th className="text-left p-3 font-medium text-red-700">SKU</th>
                          <th className="text-left p-3 font-medium text-red-700">Location</th>
                          <th className="text-left p-3 font-medium text-red-700">Batch</th>
                          <th className="text-left p-3 font-medium text-red-700">Expiry Date</th>
                          <th className="text-right p-3 font-medium text-red-700">Days Expired</th>
                          <th className="text-right p-3 font-medium text-red-700">Qty</th>
                          <th className="text-right p-3 font-medium text-red-700">Value Lost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {expiryReport.expired.map(batch => (
                          <tr key={batch.batch_id} className="hover:bg-red-50/30">
                            <td className="p-3 font-medium text-slate-900">{batch.item_name}</td>
                            <td className="p-3 text-slate-600">{batch.sku_code}</td>
                            <td className="p-3 text-slate-600">{batch.location_name || (batch.location_id ? `#${batch.location_id}` : 'N/A')}</td>
                            <td className="p-3 text-slate-600">#{batch.batch_id}</td>
                            <td className="p-3 text-red-600">{batch.expiry_date}</td>
                            <td className="p-3 text-right text-red-700 font-semibold">{batch.days_expired}d ago</td>
                            <td className="p-3 text-right">{batch.available_quantity} {batch.unit_of_measure}</td>
                            <td className="p-3 text-right text-red-700 font-semibold">{formatPeso(batch.value_at_risk, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Critical Batches */}
              {expiryReport.critical.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">Critical - Expiring within 7 days ({expiryReport.critical.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-slate-600">Item</th>
                          <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                          <th className="text-left p-3 font-medium text-slate-600">Location</th>
                          <th className="text-left p-3 font-medium text-slate-600">Batch</th>
                          <th className="text-left p-3 font-medium text-slate-600">Expiry Date</th>
                          <th className="text-right p-3 font-medium text-slate-600">Days Left</th>
                          <th className="text-right p-3 font-medium text-slate-600">Qty</th>
                          <th className="text-right p-3 font-medium text-slate-600">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expiryReport.critical.map(batch => (
                          <tr key={batch.batch_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-900">{batch.item_name}</td>
                            <td className="p-3 text-slate-600">{batch.sku_code}</td>
                            <td className="p-3 text-slate-600">{batch.location_name || (batch.location_id ? `#${batch.location_id}` : 'N/A')}</td>
                            <td className="p-3 text-slate-600">#{batch.batch_id}</td>
                            <td className="p-3 text-slate-600">{batch.expiry_date}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline" className={statusColors.critical}>{batch.days_until_expiry}d</Badge>
                            </td>
                            <td className="p-3 text-right">{batch.available_quantity} {batch.unit_of_measure}</td>
                            <td className="p-3 text-right font-medium">{formatPeso(batch.value_at_risk, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warning Batches */}
              {expiryReport.warning.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">Warning - Expiring within 14 days ({expiryReport.warning.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-slate-600">Item</th>
                          <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                          <th className="text-left p-3 font-medium text-slate-600">Location</th>
                          <th className="text-left p-3 font-medium text-slate-600">Batch</th>
                          <th className="text-left p-3 font-medium text-slate-600">Expiry Date</th>
                          <th className="text-right p-3 font-medium text-slate-600">Days Left</th>
                          <th className="text-right p-3 font-medium text-slate-600">Qty</th>
                          <th className="text-right p-3 font-medium text-slate-600">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expiryReport.warning.map(batch => (
                          <tr key={batch.batch_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-900">{batch.item_name}</td>
                            <td className="p-3 text-slate-600">{batch.sku_code}</td>
                            <td className="p-3 text-slate-600">{batch.location_name || (batch.location_id ? `#${batch.location_id}` : 'N/A')}</td>
                            <td className="p-3 text-slate-600">#{batch.batch_id}</td>
                            <td className="p-3 text-slate-600">{batch.expiry_date}</td>
                            <td className="p-3 text-right">
                              <Badge variant="outline" className={statusColors.warning}>{batch.days_until_expiry}d</Badge>
                            </td>
                            <td className="p-3 text-right">{batch.available_quantity} {batch.unit_of_measure}</td>
                            <td className="p-3 text-right font-medium">{formatPeso(batch.value_at_risk, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No expiry data */}
              {expiryReport.expired.length === 0 && expiryReport.critical.length === 0 && expiryReport.warning.length === 0 && expiryReport.upcoming.length === 0 && (
                <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-emerald-900">Nothing needs attention</h3>
                    <p className="mt-1 text-sm text-emerald-700">No batches are expired or expiring soon in this period and branch scope.</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </TabsContent>

        {/* STOCK AGING REPORT TAB */}
        <TabsContent value="aging" forceMount>
          <ReportPanelStatus label="stock aging" loading={loading} error={error} hasData={Boolean(stockAgingReport)} />
          {stockAgingReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Total Batches</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{stockAgingReport.summary.total_batches}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm text-emerald-600">Fresh (&lt;=14d)</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{stockAgingReport.summary.fresh_batches}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm text-amber-600">Aging (15-30d)</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{stockAgingReport.summary.aging_batches}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm text-red-600">Critical (&gt;30d)</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{stockAgingReport.summary.critical_batches}</p>
                </div>
              </div>

              {/* Item Summary Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Stock Aging by Item</h3>
                  <p className="text-sm text-slate-500">Items sorted by oldest batch</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Item</th>
                        <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                        <th className="text-left p-3 font-medium text-slate-600">Category</th>
                        <th className="text-right p-3 font-medium text-slate-600">Batches</th>
                        <th className="text-right p-3 font-medium text-slate-600">Available Qty</th>
                        <th className="text-right p-3 font-medium text-slate-600">Oldest</th>
                        <th className="text-right p-3 font-medium text-slate-600">Turnover Rate</th>
                        <th className="text-right p-3 font-medium text-slate-600">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockAgingReport.by_item.map(item => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-slate-600">{item.sku_code}</td>
                          <td className="p-3 text-slate-600 capitalize">{item.category}</td>
                          <td className="p-3 text-right">{item.total_batches}</td>
                          <td className="p-3 text-right">{formatNumber(item.total_available_qty, 2)}</td>
                          <td className="p-3 text-right">
                            <Badge variant="outline" className={
                              item.oldest_days > 30 ? statusColors.critical :
                                item.oldest_days > 14 ? statusColors.aging :
                                  statusColors.fresh
                            }>
                              {item.oldest_days}d
                            </Badge>
                          </td>
                          <td className="p-3 text-right">{formatNumber(item.avg_turnover_rate, 1)}%</td>
                          <td className="p-3 text-right font-medium">{formatPeso(item.total_value, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* PRODUCTION REPORT TAB */}
        <TabsContent value="production" forceMount>
          <ReportPanelStatus label="production" loading={loading} error={error} hasData={Boolean(productionReport)} />
          {productionReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Total Job Orders</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{productionReport.summary.total_job_orders}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm text-emerald-600">Completion Rate</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{formatNumber(productionReport.summary.completion_rate, 1)}%</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-sm text-blue-600">Production Efficiency</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{formatNumber(productionReport.summary.production_efficiency, 1)}%</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm text-red-600">Waste Percentage</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{formatNumber(productionReport.summary.waste_percentage, 1)}%</p>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Job Order Status Breakdown</h3>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(productionReport.summary.status_breakdown).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full",
                        status === 'completed' ? 'bg-emerald-500' :
                          status === 'in_progress' ? 'bg-blue-500' :
                            status === 'partial' ? 'bg-amber-500' :
                              status === 'cancelled' ? 'bg-red-500' :
                                'bg-slate-400'
                      )} />
                      <span className="text-slate-600 capitalize">{status.replace(/_/g, ' ')}: </span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Consumed Items */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Top Consumed Items</h3>
                  <p className="text-sm text-slate-500">Items with highest consumption in production</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Item</th>
                        <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                        <th className="text-left p-3 font-medium text-slate-600">Category</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Consumed</th>
                        <th className="text-right p-3 font-medium text-slate-600">Movements</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productionReport.top_consumed_items.map(item => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-slate-600">{item.sku_code}</td>
                          <td className="p-3 text-slate-600 capitalize">{item.category}</td>
                          <td className="p-3 text-right font-medium">{formatNumber(item.total_consumed, 2)} {item.unit_of_measure}</td>
                          <td className="p-3 text-right">{item.movement_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Loss Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Loss Breakdown by Reason</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {Object.entries(productionReport.loss_breakdown).map(([reason, qty]) => (
                    <div key={reason} className="text-center">
                      <p className="text-2xl font-bold text-slate-800">{formatNumber(qty, 2)}</p>
                      <p className="text-sm text-slate-500 capitalize">{reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* PROCUREMENT REPORT TAB */}
        <TabsContent value="procurement" forceMount>
          <ReportPanelStatus label="purchasing" loading={loading} error={error} hasData={Boolean(poAnalysisReport)} />
          {poAnalysisReport ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-500">Total Orders</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{poAnalysisReport.summary.total_orders}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-sm text-amber-600">Pending Orders</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">{poAnalysisReport.summary.pending_orders}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm text-emerald-600">Fulfillment Rate</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{formatNumber(poAnalysisReport.summary.fulfillment_rate, 1)}%</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
                  <p className="text-sm text-purple-600">Total Value</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">{formatPeso(poAnalysisReport.summary.total_order_value, 2)}</p>
                </div>
                <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
                  <p className="text-sm text-cyan-700">Vs Avg Cost</p>
                  <p className={cn(
                    "text-2xl font-bold mt-1",
                    (poAnalysisReport?.cost_variance?.summary?.ordered_vs_weighted_variance_value || 0) > 0
                      ? "text-amber-700"
                      : "text-emerald-700"
                  )}>
                    {formatPeso(poAnalysisReport?.cost_variance?.summary?.ordered_vs_weighted_variance_value || 0, 2)}
                  </p>
                  <p className="text-xs text-cyan-700 mt-1">
                    {poAnalysisReport?.cost_variance?.summary?.ordered_vs_weighted_variance_percent != null
                      ? `${formatNumber(poAnalysisReport.cost_variance.summary.ordered_vs_weighted_variance_percent, 1)}%`
                      : 'No weighted baseline'}
                  </p>
                </div>
              </div>

              {/* Pending Deliveries */}
              {poAnalysisReport.pending_deliveries.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-amber-50">
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-amber-600" />
                      <h3 className="font-semibold text-amber-800">Pending Deliveries ({poAnalysisReport.pending_deliveries.length})</h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 font-medium text-slate-600">PO Number</th>
                          <th className="text-left p-3 font-medium text-slate-600">Supplier</th>
                          <th className="text-left p-3 font-medium text-slate-600">Order Date</th>
                          <th className="text-left p-3 font-medium text-slate-600">Expected</th>
                          <th className="text-left p-3 font-medium text-slate-600">Status</th>
                          <th className="text-right p-3 font-medium text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poAnalysisReport.pending_deliveries.map(po => (
                          <tr key={po.po_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-900">{po.po_number}</td>
                            <td className="p-3 text-slate-600">{po.supplier_name}</td>
                            <td className="p-3 text-slate-600">{po.order_date}</td>
                            <td className="p-3 text-slate-600">{po.expected_delivery_date || 'TBD'}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={po.status === 'partial' ? statusColors.warning : 'bg-blue-100 text-blue-700'}>
                                {po.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-medium">{formatPeso(po.total_amount, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Supplier Performance */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Supplier Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Supplier</th>
                        <th className="text-right p-3 font-medium text-slate-600">Orders</th>
                        <th className="text-right p-3 font-medium text-slate-600">Completed</th>
                        <th className="text-right p-3 font-medium text-slate-600">On-Time Rate</th>
                        <th className="text-right p-3 font-medium text-slate-600">Quality</th>
                        <th className="text-right p-3 font-medium text-slate-600">Vs Avg</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poAnalysisReport.supplier_performance.map(supplier => (
                        <tr key={supplier.supplier_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{supplier.supplier_name}</td>
                          <td className="p-3 text-right">{supplier.total_orders}</td>
                          <td className="p-3 text-right">{supplier.completed_orders}</td>
                          <td className="p-3 text-right">
                            <Badge variant="outline" className={
                              supplier.on_time_rate >= 90 ? 'bg-emerald-100 text-emerald-700' :
                                supplier.on_time_rate >= 70 ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                            }>
                              {formatNumber(supplier.on_time_rate, 0)}%
                            </Badge>
                          </td>
                          <td className="p-3 text-right">{supplier.quality_rating ? `${supplier.quality_rating}/5` : 'N/A'}</td>
                          <td className="p-3 text-right">
                            {supplier.ordered_vs_weighted_variance_percent != null
                              ? `${formatNumber(supplier.ordered_vs_weighted_variance_percent, 1)}%`
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-medium">{formatPeso(supplier.total_value, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Most Ordered Items */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Most Ordered Items</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-slate-600">Item</th>
                        <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                        <th className="text-right p-3 font-medium text-slate-600">Order Count</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Qty</th>
                        <th className="text-right p-3 font-medium text-slate-600">Vs Avg</th>
                        <th className="text-right p-3 font-medium text-slate-600">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poAnalysisReport.most_ordered_items.slice(0, 10).map(item => (
                        <tr key={item.item_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-slate-600">{item.sku_code}</td>
                          <td className="p-3 text-right">{item.order_count}</td>
                          <td className="p-3 text-right">{formatNumber(item.total_quantity, 2)}</td>
                          <td className="p-3 text-right">
                            {item.ordered_vs_weighted_variance_percent != null
                              ? `${formatNumber(item.ordered_vs_weighted_variance_percent, 1)}%`
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-medium">{formatPeso(item.total_value, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* EXECUTIVE SUMMARY TAB */}
        <TabsContent value="summary" forceMount>
          <ReportPanelStatus label="overview" loading={loading} error={error} hasData={Boolean(executiveSummary)} />
          {executiveSummary ? (
            <div className="space-y-6">
              {/* Main Value Card */}
              <div className="business-admin-reports-summary-hero">
                <p className="business-admin-reports-summary-hero-label">Weighted inventory value</p>
                <p className="business-admin-reports-summary-hero-value">
                  {formatPeso(
                    executiveSummary.inventory_overview.weighted_total_inventory_value
                    ?? executiveSummary.inventory_overview.total_inventory_value,
                    2
                  )}
                </p>
                <p className="business-admin-reports-summary-hero-meta">{executiveSummary.inventory_overview.total_items} items tracked</p>
                <p className="business-admin-reports-summary-hero-detail">
                  Previous valuation: {formatPeso(executiveSummary.inventory_overview.legacy_total_inventory_value
                    ?? executiveSummary.inventory_overview.total_inventory_value, 2)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Stock Health */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-slate-500" />
                    Stock Health
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Low Stock Items</span>
                      <span className={cn("font-semibold", executiveSummary.stock_health.low_stock_count > 0 ? "text-red-600" : "text-emerald-600")}>
                        {executiveSummary.stock_health.low_stock_count}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expiry Risk */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Expiry Risk
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Expired Batches</span>
                      <span className="font-semibold text-red-600">{executiveSummary.expiry_risk.expired_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Expired Value</span>
                      <span className="font-semibold text-red-600">{formatPeso(executiveSummary.expiry_risk.expired_value, 2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total at Risk</span>
                      <span className="font-semibold text-amber-600">{formatPeso(executiveSummary.expiry_risk.total_value_at_risk, 2)}</span>
                    </div>
                  </div>
                </div>

                {/* Aging Overview */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    Stock Aging
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fresh Batches</span>
                      <span className="font-semibold text-emerald-600">{executiveSummary.aging_overview.fresh_batches}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Aging Batches</span>
                      <span className="font-semibold text-amber-600">{executiveSummary.aging_overview.aging_batches}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Critical Batches</span>
                      <span className="font-semibold text-red-600">{executiveSummary.aging_overview.critical_batches}</span>
                    </div>
                  </div>
                </div>

                {/* Production */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Factory className="business-admin-reports-accent-icon w-5 h-5" />
                    Production
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Job Orders</span>
                      <span className="font-semibold">{executiveSummary.production_overview.total_job_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Completion Rate</span>
                      <span className="font-semibold text-emerald-600">{formatNumber(executiveSummary.production_overview.completion_rate, 1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Efficiency</span>
                      <span className="font-semibold text-blue-600">{formatNumber(executiveSummary.production_overview.production_efficiency, 1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Procurement */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <ShoppingCart className="business-admin-reports-accent-icon w-5 h-5" />
                    Procurement
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Orders</span>
                      <span className="font-semibold">{executiveSummary.procurement_overview.total_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pending Orders</span>
                      <span className="font-semibold text-amber-600">{executiveSummary.procurement_overview.pending_orders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fulfillment Rate</span>
                      <span className="font-semibold text-emerald-600">{formatNumber(executiveSummary.procurement_overview.fulfillment_rate, 1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Vs Avg Cost</span>
                      <span className={cn(
                        "font-semibold",
                        (executiveSummary.procurement_overview.ordered_vs_weighted_variance_value || 0) > 0
                          ? "text-amber-700"
                          : "text-emerald-700"
                      )}>
                        {executiveSummary.procurement_overview.ordered_vs_weighted_variance_percent != null
                          ? `${formatNumber(executiveSummary.procurement_overview.ordered_vs_weighted_variance_percent, 1)}%`
                          : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Movers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Fastest Moving Items</h3>
                  <div className="space-y-2">
                    {executiveSummary.top_movers.fastest.slice(0, 5).map((item, idx) => (
                      <div key={item.item_id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">#{idx + 1}</span>
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                        </div>
                        <span className="text-sm text-slate-600">{formatNumber(item.total_movement, 2)} moved</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Slowest Moving Items</h3>
                  <div className="space-y-2">
                    {executiveSummary.top_movers.slowest.slice(0, 5).map((item, idx) => (
                      <div key={item.item_id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">#{idx + 1}</span>
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                        </div>
                        <span className="text-sm text-slate-600">{formatNumber(item.total_movement, 2)} moved</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </TabsContent>

        {/* COST ANALYSIS TAB */}
        <TabsContent value="cost">
          <CostAnalysisWidget dateFilters={dateFilters} />
        </TabsContent>
      </Tabs>

      {/* Snapshot Save Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report Snapshot</DialogTitle>
            <DialogDescription>
              Save the current report data for future reference and auditing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="snapshot-name">Snapshot Name (Optional)</Label>
              <Input
                id="snapshot-name"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report - ${new Date().toLocaleDateString()}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnapshotDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveSnapshot} disabled={loadingSnapshot}>
              {loadingSnapshot ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
