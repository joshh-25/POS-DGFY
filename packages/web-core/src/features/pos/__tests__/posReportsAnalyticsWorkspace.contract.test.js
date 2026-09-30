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
const filterPartsSource = fs.readFileSync(path.resolve(__dirname, '../components/PosFilterDialogParts.jsx'), 'utf8');
const cashierFilterSource = fs.readFileSync(path.resolve(__dirname, '../components/PosCashierFilterControl.jsx'), 'utf8');
const dialogShellSource = fs.readFileSync(path.resolve(__dirname, '../components/PosFilterDialogShell.jsx'), 'utf8');
const datePickerSource = fs.readFileSync(path.resolve(__dirname, '../components/PosDateRangePicker.jsx'), 'utf8');
const tableSurfaceSource = fs.readFileSync(path.resolve(__dirname, '../components/PosTableSurface.jsx'), 'utf8');
const attendanceTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsAttendanceTable.jsx'), 'utf8');
const handoffTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsHandoffTable.jsx'), 'utf8');
const topItemsTableSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsTopItemsTable.jsx'), 'utf8');
const toolbarSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsToolbar.jsx'), 'utf8');
const appliedFilterChipsSource = fs.readFileSync(path.resolve(__dirname, '../components/PosAppliedFilterChips.jsx'), 'utf8');
const lineTabSource = fs.readFileSync(path.resolve(__dirname, '../components/PosLineTabNavigation.jsx'), 'utf8');
const pageSpacingSource = fs.readFileSync(path.resolve(__dirname, '../components/PosPageSpacing.js'), 'utf8');
const subtabNavigationSource = fs.readFileSync(path.resolve(__dirname, '../components/PosSubtabNavigation.jsx'), 'utf8');
const primitivesPath = path.resolve(__dirname, '../../../components/backOffice/BackOfficePrimitives.jsx');
const primitivesSource = fs.readFileSync(primitivesPath, 'utf8');

describe('POS report category filter contract', () => {
  it('uses each selected report tab granularity for requests and offline snapshots', () => {
    expect(workspaceSource).toContain("const displayGranularity = activeTab === 'comparison' ? granularity : selectedReportTab.granularity;");
    expect(workspaceSource).toMatch(/const offlineReportKey = useMemo\(\(\) => JSON\.stringify\(\{\s*granularity: displayGranularity,/);
    expect(workspaceSource).toMatch(/fetchPosReportsOverview\(\{\s*granularity: displayGranularity,/);
    expect(workspaceSource).toMatch(/\}\), \[\s*categoryId,\s*cashierId,\s*displayGranularity,/);
  });

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
    expect(workspaceSource).toContain('<PosPageFrame id={sectionId} page="reports" className="max-[767px]:overflow-x-clip p-0">');
    expect(workspaceSource).toContain('data-testid="pos-reports-sticky-tabs"');
    expect(workspaceSource).toContain('POS_MOBILE_STICKY_TAB_ROW_CLASS');
    expect(pageSpacingSource).toContain('max-[767px]:sticky max-[767px]:top-0 max-[767px]:z-30 max-[767px]:-mt-4 max-[767px]:w-full max-[767px]:bg-white max-[767px]:pt-4');
    expect(workspaceSource).toContain('POS_PAGE_CONTENT_STACK_CLASS');
    expect(workspaceSource).not.toContain('showIcons={false}');
    expect(workspaceSource.indexOf('<PosReportsKpiCards')).toBeLessThan(workspaceSource.indexOf('<PosLineTabNavigation'));
    expect(workspaceSource.indexOf('<PosLineTabNavigation')).toBeLessThan(workspaceSource.indexOf('<PosSubtabNavigation'));
    expect(workspaceSource.indexOf('<PosSubtabNavigation')).toBeLessThan(workspaceSource.indexOf('{renderReportToolbar()}'));
    expect(workspaceSource).toContain("const shouldShowOperationsSubtabs = activeTab === 'operations'");
    expect(lineTabSource).toContain('role="tablist" aria-orientation="horizontal"');
  });

  it('hides only the Reports tab scrollbar while retaining horizontal overflow', () => {
    expect(workspaceSource).toMatch(/ariaLabel="POS reports"\s+hideScrollbar/);
    expect(lineTabSource).toContain('hideScrollbar = false');
    expect(lineTabSource).toContain("hideScrollbar ? 'dgfy-pos-scrollbar-hidden' : ''");
    expect(lineTabSource).toContain('overflow-x-auto');
  });

  it('keeps mobile report tabs sticky through the full report content scroll range', () => {
    const contentStart = workspaceSource.indexOf('data-testid="pos-reports-sticky-content"');
    const stickyTabs = workspaceSource.indexOf('data-testid="pos-reports-sticky-tabs"');
    const reportPanel = workspaceSource.indexOf('role="tabpanel"');
    const contentEnd = workspaceSource.lastIndexOf('</div>', workspaceSource.indexOf('</PosPageFrame>'));

    expect(contentStart).toBeGreaterThanOrEqual(0);
    expect(contentStart).toBeLessThan(stickyTabs);
    expect(stickyTabs).toBeLessThan(reportPanel);
    expect(reportPanel).toBeLessThan(contentEnd);
    expect(workspaceSource.slice(contentStart, contentEnd)).toContain('POS_PAGE_CONTENT_STACK_CLASS} sm:gap-6');
    expect(workspaceSource.slice(contentStart, contentEnd)).toContain('data-testid="pos-reports-sticky-tabs"');
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

  it('uses the full main-branch comparison workspace without changing the report shell', () => {
    const comparisonStart = workspaceSource.lastIndexOf("{renderedTab === 'comparison' ? (");
    const comparisonEnd = workspaceSource.indexOf("{renderedTab === 'profit_loss' ? (", comparisonStart);
    const comparisonSource = workspaceSource.slice(comparisonStart, comparisonEnd);

    expect(comparisonSource).toContain('<PosReportsComparisonPanel');
    expect(comparisonSource).toContain('comparison={comparisonReport}');
    expect(comparisonSource).toContain('granularity={displayGranularity}');
    expect(comparisonSource).toContain('onGranularityChange={setGranularity}');
    expect(comparisonSource).not.toContain('sales-comparison-snapshot-title');
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
    expect(filterPanelSource).toContain("value: entry.folder_id || ''");
    expect(filterPanelSource).toContain('label: entry.name');
    expect(workspaceSource).not.toContain('value={category}');
  });

  it('keeps report cards viewport-safe and renders table rows as mobile cards', () => {
    expect(primitivesSource).toContain('min-w-0 max-w-full overflow-hidden rounded-2xl');
    expect(primitivesSource).toContain('grid min-w-0 gap-3 sm:hidden');
    expect(primitivesSource).toContain('hidden min-w-0 max-w-full overflow-x-auto overscroll-x-contain');
    expect(primitivesSource).toContain('min-w-[720px]');
  });

  it('keeps every report table on the shared compact visual contract', () => {
    expect(responsiveTableSource).toMatch(/<PosTableSurface(?:\s|>)/);
    expect(tableSurfaceSource).toContain('rounded-xl border border-slate-200 bg-white shadow-sm');
    expect(tableSurfaceSource).toContain('border-b border-slate-200 bg-white');
    expect(tableSurfaceSource).toContain('hover:bg-slate-50/70');
    expect(tableSurfaceSource).toContain('px-2.5 py-4');
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
    expect(filterPanelSource).toContain('<PosFilterDialogShell');
    expect(dateFilterSource).toContain('<PosFilterDialogShell');
    expect(dialogShellSource).toContain('<Dialog');
    expect(dialogShellSource).toContain('<DialogContent');
    expect(dialogShellSource).toContain('mobileSheet={isMobileDialog}');
    expect(dialogShellSource).toContain('dgfy-pos-history-filter-dialog w-auto max-w-none rounded-xl');
    expect(dialogShellSource).toContain('dgfy-pos-history-calendar-dialog max-w-none rounded-xl');
    expect(filterPanelSource).toContain('compact={!isMobileDialog}');
    expect(filterPanelSource).toContain('mobile={isMobileDialog}');
    expect(filterPanelSource).not.toContain('scrollable');
    expect(filterPanelSource).not.toContain('showSelectedIcon');
    expect(dateFilterSource).toContain('mobile={isMobileDialog}');
    expect(filterPanelSource).toContain('Payment Type');
    expect(filterPanelSource).toContain('Sources');
    expect(filterPanelSource).toContain('Categories');
    expect(filterPanelSource).toContain('<PosCashierFilterControl');
    expect(cashierFilterSource).toContain('Search Cashier');
    expect(cashierFilterSource).toContain('Cashier options');
    expect(cashierFilterSource).toContain('onExpandedChange?.(true)');
    expect(cashierFilterSource).toContain('focus-within:ring-2');
    expect(filterPanelSource).toContain('<PosFilterChoiceGroup');
    expect(filterPartsSource).toContain('aria-pressed={selected}');
    expect(filterPartsSource).toContain("resetLabel = 'Reset All'");
    expect(filterPartsSource).toContain("applyLabel = 'Apply Filters'");
    expect(filterPanelSource).not.toContain('<select');
    expect(filterPanelSource).not.toContain('Date range');
    expect(filterPanelSource).not.toContain('RANGE_OPTIONS');
    expect(workspaceSource).toContain('reportFiltersOpen');
    expect(toolbarSource).toContain('aria-controls="pos-reports-filter-dialog"');
    expect(toolbarSource).toContain('aria-controls="pos-reports-date-dialog"');
    expect(toolbarSource).toContain('Filter by Date');
    expect(toolbarSource).toContain('Print / Save PDF');
    expect(toolbarSource).toContain('Export CSV');
    expect(toolbarSource).toContain('<PosAppliedFilterChips');
    expect(workspaceSource).toContain('PosReportsDateFilterPanel');
    expect(workspaceSource).toContain('onOpenDateFilter={() => setReportDateFilterOpen(true)}');
    expect(datePickerSource).toContain('Last 7 Days');
    expect(datePickerSource).toContain('Custom Range');
    expect(datePickerSource).toContain('onPointerDown');
    expect(datePickerSource).toContain('onPointerEnter');
    expect(filterPartsSource).toContain("applyLabel = 'Apply Filters'");
  });

  it('shows a compact applied-filter count with removable chips and Clear all', () => {
    expect(workspaceSource).toContain('activeFilterChips={activeReportFilterChips}');
    expect(workspaceSource).toContain('onRemoveFilter={handleRemoveReportFilter}');
    expect(workspaceSource).toContain('onClearAllFilters={handleClearAllFilters}');
    expect(toolbarSource).toContain('const activeFilterCount = activeFilterChips.length;');
    expect(appliedFilterChipsSource).toContain('Applied filters');
    expect(appliedFilterChipsSource).toContain('Clear all');
    expect(appliedFilterChipsSource).toContain('Remove filter: ${filter.label}');
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

  it('discloses the immutable Z-reading reconciliation without mixing net sales metrics', () => {
    expect(workspaceSource).toContain('z_reading_reconciliation');
    expect(workspaceSource).toContain('Z-reading reconciliation');
    expect(workspaceSource).toContain('Report recognized sales');
    expect(workspaceSource).toContain('Z-reading total');
    expect(workspaceSource).toContain('Report net sales');
    expect(workspaceSource).toContain('Report refunds/voids');
    expect(workspaceSource).toContain('Generated:');
    expect(workspaceSource).toContain("timeZone: 'Asia/Manila'");
  });

  it('keeps the report toolbar focused on the primary print and CSV exports', () => {
    expect(workspaceSource).toContain('exportPosReportCsv');
    expect(workspaceSource).not.toContain('exportProcurementCsv');
    expect(workspaceSource).not.toContain('handleExportProcurementCsv');
    expect(workspaceSource).not.toContain('Procurement CSV');
    expect(workspaceSource).toContain('{renderReportToolbar()}');
  });
});
