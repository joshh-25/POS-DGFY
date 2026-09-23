import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacePath = path.resolve(__dirname, '../components/PosReportsAnalyticsWorkspace.jsx');
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');
const filterPanelSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsFilterPanel.jsx'), 'utf8');
const dateFilterSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsDateFilterPanel.jsx'), 'utf8');
const kpiSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsKpiCards.jsx'), 'utf8');
const adjustmentKpiSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsAdjustmentKpiCards.jsx'), 'utf8');
const overviewTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsOverviewTable.jsx'), 'utf8');
const salesTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsSalesTable.jsx'), 'utf8');
const responsiveTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsResponsiveTable.jsx'), 'utf8');
const attendanceTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsAttendanceTable.jsx'), 'utf8');
const handoffTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsHandoffTable.jsx'), 'utf8');
const topItemsTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsTopItemsTable.jsx'), 'utf8');
const toolbarSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsToolbar.jsx'), 'utf8');
const lineTabSource = fs.readFileSync(path.resolve(__dirname, '../components/PosLineTabNavigation.jsx'), 'utf8');
const subtabNavigationSource = fs.readFileSync(path.resolve(__dirname, '../components/PosSubtabNavigation.jsx'), 'utf8');

describe('POS report category filter contract', () => {
  it('groups operational reports under the Operations tab without removing their views', () => {
    expect(workspaceSource).toContain("{ id: 'operations', label: 'Operations', icon: BarChart3, granularity: 'daily', exportSection: 'cashiers' }");
    expect(workspaceSource).toContain("{ id: 'cashiers', label: 'Cashiers', icon: Users }");
    expect(workspaceSource).toContain("{ id: 'registers', label: 'Registers', icon: Calculator }");
    expect(workspaceSource).toContain("{ id: 'adjustments', label: 'Adjustments', icon: Receipt }");
    expect(workspaceSource).toContain("{ id: 'handoffs', label: 'Handoff', icon: ArrowLeftRight }");
    expect(workspaceSource).toContain("{ id: 'attendance', label: 'Attendance', icon: Clock3 }");
    expect(workspaceSource).toContain("{ id: 'employee_credit', label: 'Credit Activity', icon: CreditCard, permission: 'pos:employee_credit:report' }");
    expect(workspaceSource).toContain('<PosSubtabNavigation');
    expect(workspaceSource).toContain('desktopColumns={operationSections.length === 6 ? 6 : 5}');
    expect(workspaceSource).toContain("renderedOperationSection === 'adjustments'");
    expect(workspaceSource).toContain('<PosReportsAdjustmentKpiCards');
    expect(workspaceSource).not.toContain('const MetricCard =');
    expect(adjustmentKpiSource).toContain('import { PosReportsKpiCard } from');
    expect(adjustmentKpiSource).toContain('if (adjustmentCount === 0) return null;');
    expect(workspaceSource).toContain("renderedOperationSection === 'employee_credit'");
    expect(workspaceSource).toContain('onReportDataChange={setEmployeeCreditReportData}');
    expect(workspaceSource).toContain('<PosReportsAttendanceTable');
    expect(attendanceTableSource).toContain('Duty/Role');
    expect(attendanceTableSource).toContain('Break (Hours)');
    expect(attendanceTableSource).toContain('Worked (Hours)');
    expect(attendanceTableSource).not.toContain('Late (Minutes)');
    expect(attendanceTableSource).not.toContain('Early Out (Minutes)');
    expect(attendanceTableSource).not.toContain('Notes');
    expect(workspaceSource).toContain('title="Drawer handoff timeline"');
    expect(workspaceSource).toContain("row.variance_amount == null ? 'Not attributed'");
    expect(workspaceSource).toContain('<PosReportsHandoffTable');
    expect(handoffTableSource).toContain('Session ID');
    expect(handoffTableSource).toContain('Duration');
    expect(handoffTableSource).toContain('Completed');
  });

  it('exposes the requested report tabs and keeps the overview business-date table', () => {
    expect(workspaceSource).toContain("{ id: 'overview', label: 'Overview', icon: LayoutDashboard, granularity: 'daily', exportSection: 'daily' }");
    expect(workspaceSource).toContain("{ id: 'sales', label: 'Sales', icon: Receipt, granularity: 'daily', exportSection: 'sales' }");
    expect(workspaceSource).toContain("{ id: 'comparison', label: 'Comparison', icon: ArrowLeftRight, granularity: 'daily', exportSection: 'comparison' }");
    expect(workspaceSource).toContain("{ id: 'top_items', label: 'Top Selling Items', icon: ShoppingBag, granularity: 'daily', exportSection: 'daily' }");
    expect(workspaceSource).toContain("{ id: 'profit_loss', label: 'Profit/Loss', icon: Scale, granularity: 'monthly', exportSection: 'profit_loss' }");
    expect(workspaceSource).toContain('<PosReportsOverviewTable');
    expect(overviewTableSource).toContain('Business Date');
    expect(overviewTableSource).toContain('Transactions');
    expect(overviewTableSource).toContain('label: `Gross Sales (${symbol})`');
    expect(overviewTableSource).toContain('label: `Net Sales (${symbol})`');
    expect(overviewTableSource).toContain('label: `Refunds/Voids (${symbol})`');
    expect(workspaceSource).toContain('<PosReportsSalesTable');
    expect(workspaceSource).toContain('<PosReportsTopItemsTable');
    expect(salesTableSource).toContain('Date/Time');
    expect(salesTableSource).toContain('Transaction/Invoice');
    expect(salesTableSource).toContain('label: `POS Profit/Loss (${symbol})`');
    expect(workspaceSource).toContain('ariaLabel="POS reports"');
    expect(workspaceSource).toContain('space-y-4 px-0 sm:space-y-6 sm:px-3');
    expect(workspaceSource).toContain('gap-4 sm:gap-6');
    expect(workspaceSource).not.toContain('showIcons={false}');
    expect(workspaceSource.indexOf('<PosReportsKpiCards')).toBeLessThan(workspaceSource.indexOf('<PosLineTabNavigation'));
    expect(workspaceSource.indexOf('<PosLineTabNavigation')).toBeLessThan(workspaceSource.indexOf('<PosSubtabNavigation'));
    expect(workspaceSource.indexOf('<PosSubtabNavigation')).toBeLessThan(workspaceSource.indexOf('{renderReportToolbar()}'));
    expect(workspaceSource).toContain("const shouldShowOperationsSubtabs = activeTab === 'operations'");
    expect(lineTabSource).toContain('role="tablist" aria-orientation="horizontal"');
  });

  it('uses the Settings-style directional transition for report tabs and Operations subtabs', () => {
    expect(workspaceSource).toContain('const REPORT_TAB_TRANSITION_MS = 150;');
    expect(workspaceSource).toContain('const REPORT_TAB_SLIDE_OFFSET = 28;');
    expect(workspaceSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(workspaceSource).toContain('transitionReportPanel(selectedTab.id, operationSection)');
    expect(workspaceSource).toContain('transitionReportPanel(activeTab, nextSection)');
    expect(workspaceSource).toContain('setRenderedTab(nextTab)');
    expect(workspaceSource).toContain('setRenderedOperationSection(nextOperationSection)');
    expect(workspaceSource).toContain('style={reportPanelInlineStyle}');
    expect(workspaceSource).toContain("aria-labelledby={renderedTab === 'operations'");
  });

  it('keeps Sales focused on the table and places visual breakdowns below it', () => {
    const salesTabSource = workspaceSource.slice(
      workspaceSource.indexOf("{renderedTab === 'sales' ? ("),
      workspaceSource.indexOf("{renderedTab === 'operations' && renderedOperationSection === 'attendance' ? (")
    );

    expect(salesTabSource).toContain('<PosReportsSalesTable');
    expect(salesTabSource).toContain('{renderTrendAndPaymentBreakdown()}');
    expect(salesTabSource.indexOf('<PosReportsSalesTable')).toBeLessThan(salesTabSource.indexOf('{renderTrendAndPaymentBreakdown()}'));
    expect(salesTabSource).not.toContain('Sales Summary');
  });

  it('left-aligns Sales financial columns while preserving numeric typography', () => {
    ['discount_amount', 'gross_sales', 'net_sales', 'profit_margin', 'pos_profit_loss'].forEach((key) => {
      const columnDefinition = salesTableSource.match(new RegExp(`\\{ key: '${key}',[^\\n]+`))?.[0] || '';
      expect(columnDefinition).toContain("align: 'left'");
      expect(columnDefinition).toContain('numeric: true');
    });
    expect(responsiveTableSource).toContain('column.numeric || column.align');
  });

  it('keeps Profit/Loss focused on the table and trend visual', () => {
    const profitLossTabSource = workspaceSource.slice(
      workspaceSource.lastIndexOf("{renderedTab === 'profit_loss' ? ("),
      workspaceSource.indexOf("{renderedTab === 'sales' && granularity === 'yearly' ? (")
    );

    expect(profitLossTabSource).toContain('<PosReportsProfitLossTable');
    expect(profitLossTabSource).toContain('{renderTrendAndPaymentBreakdown()}');
    expect(profitLossTabSource.indexOf('<PosReportsProfitLossTable')).toBeLessThan(profitLossTabSource.indexOf('{renderTrendAndPaymentBreakdown()}'));
    expect(profitLossTabSource).not.toContain('POS Profit/Loss Summary');
    expect(profitLossTabSource).not.toContain('MetricCard');
  });

  it('spaces the comparison snapshot from the trend and removes its outer card shell', () => {
    const snapshotStart = workspaceSource.lastIndexOf("{renderedTab === 'comparison' ? (");
    const snapshotEnd = workspaceSource.indexOf("{renderedTab === 'profit_loss' ? (", snapshotStart);
    const snapshotSource = workspaceSource.slice(snapshotStart, snapshotEnd);

    expect(snapshotSource).toContain('<section aria-labelledby="sales-comparison-snapshot-title" className="mt-4">');
    expect(snapshotSource).toContain('<h3 id="sales-comparison-snapshot-title"');
    expect(snapshotSource).toContain('grid gap-3 md:grid-cols-2 xl:grid-cols-4');
    expect(snapshotSource).not.toContain('<SectionCard');
  });

  it('maps the Top Selling Items table to the supported report aggregates', () => {
    expect(topItemsTableSource).toContain('Rank');
    expect(topItemsTableSource).toContain('Quantity Sold');
    expect(topItemsTableSource).toContain('label: `Net Sales (${symbol})`');
    expect(topItemsTableSource).toContain('% of Total Sales');
    expect(topItemsTableSource).toContain('label: `Average Price (${symbol})`');
    expect(topItemsTableSource).toContain('Orders');
    expect(topItemsTableSource).toContain('role="progressbar"');
    expect(workspaceSource).toContain('totalSales={dailyReport.summary?.net_sales}');
  });

  it('uses active folder IDs rather than date-dependent category names', () => {
    expect(workspaceSource).toContain("const [categoryId, setCategoryId] = useState('');");
    expect(workspaceSource).toContain('category_id: categoryId || undefined');
    expect(filterPanelSource).toContain("const value = entry.folder_id || '';");
    expect(filterPanelSource).toContain('{entry.name}');
    expect(workspaceSource).not.toContain('value={category}');
  });

  it('keeps report tables viewport-safe with controlled horizontal scrolling on mobile', () => {
    expect(workspaceSource).toContain('min-w-0 max-w-full overflow-hidden rounded-2xl');
    expect(responsiveTableSource).toContain('overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x');
    expect(responsiveTableSource).toContain('w-max min-w-full table-fixed');
    expect(responsiveTableSource).not.toContain('mobilePrimaryKeys');
    expect(responsiveTableSource).not.toContain('mobileDetailKeys');
  });

  it('keeps every report table on the shared compact visual contract', () => {
    expect(responsiveTableSource).toContain('rounded-xl border border-slate-200 bg-white shadow-sm');
    expect(responsiveTableSource).toContain('border-b border-slate-200 bg-[#F7FAFF]');
    expect(responsiveTableSource).toContain('odd:bg-white even:bg-[#F8FBFF]');
    expect(responsiveTableSource).toContain('hover:bg-[#EEF5FF]');
    expect(responsiveTableSource).toContain('px-4 py-2.5');
    [overviewTableSource, salesTableSource, topItemsTableSource].forEach((source) => {
      expect(source).toContain('<PosReportsResponsiveTable');
    });
  });

  it('shares the responsive subtab rail interaction contract with Operations', () => {
    expect(subtabNavigationSource).toContain('min-[1024px]:grid min-[1024px]:min-w-0');
    expect(subtabNavigationSource).toContain('min-[1024px]:grid-cols-5');
    expect(subtabNavigationSource).toContain('min-w-36 w-max shrink-0');
    expect(subtabNavigationSource).toContain('role="tab"');
    expect(subtabNavigationSource).toContain('aria-selected={active}');
    expect(subtabNavigationSource).toContain("['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']");
  });

  it('keeps all report filters in a responsive modal with button-based choices', () => {
    expect(filterPanelSource).toContain('role="dialog"');
    expect(filterPanelSource).toContain('aria-modal="false"');
    expect(dateFilterSource).toContain('aria-modal="false"');
    expect(filterPanelSource).not.toContain('bg-black/20');
    expect(dateFilterSource).not.toContain('bg-black/20');
    expect(filterPanelSource).toContain('lg:max-h-none');
    expect(filterPanelSource).toContain('lg:overflow-visible');
    expect(dateFilterSource).toContain('lg:max-h-none');
    expect(dateFilterSource).toContain('lg:overflow-visible');
    expect(filterPanelSource).toContain('Payment Type');
    expect(filterPanelSource).toContain('Sources');
    expect(filterPanelSource).toContain('Categories');
    expect(filterPanelSource).toContain('Search Cashier');
    expect(filterPanelSource).toContain('aria-pressed={draft.paymentType === option.value}');
    expect(filterPanelSource).toContain('Apply Filters');
    expect(filterPanelSource).toContain('Reset All');
    expect(filterPanelSource).not.toContain('<select');
    expect(filterPanelSource).not.toContain('Date range');
    expect(filterPanelSource).not.toContain('RANGE_OPTIONS');
    expect(workspaceSource).toContain('reportFiltersOpen');
    expect(toolbarSource).toContain('aria-controls="pos-reports-filter-dialog"');
    expect(toolbarSource).toContain('aria-controls="pos-reports-date-dialog"');
    expect(toolbarSource).toContain('Filter by date');
    expect(toolbarSource).toContain('Print / Save PDF');
    expect(toolbarSource).toContain('Export CSV');
    expect(workspaceSource).toContain('PosReportsDateFilterPanel');
    expect(workspaceSource).toContain('onOpenDateFilter={() => setReportDateFilterOpen(true)}');
    expect(dateFilterSource).toContain('Last 7 Days');
    expect(dateFilterSource).toContain('Custom Range');
    expect(dateFilterSource).toContain('onPointerDown');
    expect(dateFilterSource).toContain('onPointerEnter');
    expect(dateFilterSource).toContain('Apply Filters');
  });

  it('shows a compact applied-filter count with removable chips and Clear all', () => {
    expect(workspaceSource).toContain('activeFilterChips={activeReportFilterChips}');
    expect(workspaceSource).toContain('onRemoveFilter={handleRemoveReportFilter}');
    expect(workspaceSource).toContain('onClearAllFilters={handleClearAllFilters}');
    expect(toolbarSource).toContain('const activeFilterCount = activeFilterChips.length;');
    expect(toolbarSource).toContain('Applied report filters');
    expect(toolbarSource).toContain('Clear all');
    expect(toolbarSource).toContain('Remove filter: ${filter.label}');
    expect(toolbarSource).not.toContain('Reset Filter');
  });

  it('prints the selected cashier cash reconciliation and filtered transaction rows', () => {
    expect(workspaceSource).toContain('Cashier Sales & Cash Reconciliation');
    expect(workspaceSource).toContain('dailyReport.transaction_rows');
    expect(workspaceSource).toContain('Cash Reconciliation');
    expect(workspaceSource).toContain('Filtered Transactions');
    expect(workspaceSource).toContain('reportCashierLabel');
  });

  it('keeps Overview summary-focused and leaves detail in the owning report views', () => {
    const overviewSource = workspaceSource.slice(
      workspaceSource.indexOf("{renderedTab === 'overview'"),
      workspaceSource.indexOf("{renderedTab === 'sales'")
    );

    expect(overviewSource).not.toContain('Daily Summary');
    expect(overviewSource).not.toContain('Adjustment Summary');
    expect(overviewSource).not.toContain('All Discounts');
    expect(overviewSource).not.toContain('Payment & Order Method Breakdown');
    expect(overviewSource).not.toContain('Cashier / Shift Summary');
    expect(overviewSource).not.toContain('Filtered Transactions');
  });

  it('separates selected tender collections from full sales and displays mixed payment methods', () => {
    expect(workspaceSource).toContain('summaryCards.selected_tender');
    expect(kpiSource).toContain("`${selectedTender.payment_label} Collected`");
    expect(workspaceSource).toContain('formatPosTransactionPaymentMethods(entry)');
  });

  it('keeps procurement export out of the POS reports toolbar', () => {
    expect(workspaceSource).not.toContain('exportProcurementCsv');
    expect(workspaceSource).not.toContain('handleExportProcurementCsv');
    expect(toolbarSource).not.toContain('onExportProcurement');
    expect(toolbarSource).not.toContain('Procurement CSV');
  });
});
