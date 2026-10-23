import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const panelContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSTransactionHistoryPanel.jsx'),
    'utf8'
);
const tableActionButtonContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosTableActionButton.jsx'),
    'utf8'
);
const historyAppliedFilterChipsContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosAppliedFilterChips.jsx'),
    'utf8'
);
const skupervisorPanelContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/SkupervisorPOSTransactionHistoryPanel.jsx'),
    'utf8'
);
const receiptDialogsContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx'),
    'utf8'
);
const terminalContent = [
    'src/features/pos/components/POSCheckoutTerminal.jsx',
    // Staging repair 2026-09-28-01 (#2110) extracted the shell body here.
    'src/features/pos/hooks/usePosTerminalViewModel.js',
].map((relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8')).join('\n');
const historyWorkflowContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/hooks/usePosHistoryVoidWorkflow.js'),
    'utf8'
);
const queryContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/utils/posHistoryQuery.js'),
    'utf8'
);
const searchUtilityContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/utils/posHistorySearch.js'),
    'utf8'
);
const terminalViewContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
    'utf8'
);
const appStyles = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/index.css'),
    'utf8'
);
const historyFilterPartsContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosFilterDialogParts.jsx'),
    'utf8'
);
const cashierFilterControlContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosCashierFilterControl.jsx'),
    'utf8'
);
const historyDialogShellContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosFilterDialogShell.jsx'),
    'utf8'
);
const historyDatePickerContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosDateRangePicker.jsx'),
    'utf8'
);
const historyTabsContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosLineTabNavigation.jsx'),
    'utf8'
);

describe('POS transaction history search and filter contract', () => {
    it('keeps History edge spacing while removing the outer card shell', () => {
        expect(terminalViewContent).toContain("currentViewMode === 'history'\n                            ? 'flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden'");
        expect(terminalViewContent).not.toContain('max-sm:p-2 max-sm:pb-0');
        expect(panelContent).toContain('<PosPageFrame page="history"');
        expect(terminalViewContent).toContain('fallback={<section className="text-sm text-slate-500">Loading POS sales history...</section>}');
    });

    it('keeps phone cards and progressively condenses tablet history columns', () => {
        expect(panelContent).toContain("isMobileViewport ? 'text-[12px] min-w-0 table-fixed dgfy-pos-history-table--mobile'");
        expect(panelContent).toContain('isTabletTableViewport ? `text-[12px] min-w-0 table-fixed dgfy-pos-history-table--tablet');
        expect(panelContent).toContain('dgfy-pos-history-table--tablet-portrait');
        expect(panelContent).toContain('dgfy-pos-history-table--tablet-landscape');
        expect(panelContent).toContain('w-full whitespace-nowrap ${isMobileViewport');
        expect(panelContent).toContain('text-slate-700 transition-colors whitespace-nowrap ${isMobileViewport');
        expect(panelContent).toContain(": 'pos-history-action-column min-w-0';");
        expect(panelContent).toContain("const isCompactHistoryViewport = isMobileViewport;");
        expect(panelContent).toContain('isPosTabletPortraitViewport');
        expect(panelContent).toContain('Boolean(isMobileViewportProp) || detectedMobileViewport;');
        expect(panelContent).toContain('const historyVisibleColumnCount = isMobileViewport');
        expect(panelContent).toContain('isTabletPortraitViewport ? 5 : 6');
        expect(panelContent).toContain('POS_HISTORY_TABLET_MAX_WIDTH_PX = 1199');
        expect(panelContent).toContain("import PosTableActionButton from './PosTableActionButton.jsx';");
        expect(panelContent).toContain('dgfy-pos-history-table--single-view');
        expect(panelContent).toContain('dgfy-pos-history-table--tablet');
        expect(panelContent).toContain('data-pos-history-panel="true"');
        expect(panelContent).toContain('data-testid="pos-history-mobile-list"');
        expect(panelContent).toContain('data-testid={`pos-history-mobile-card-${row.pos_transaction_id}`}');
        expect(panelContent).toContain('data-testid={`pos-history-mobile-details-${row.pos_transaction_id}`}');
        expect(panelContent).toContain('function MobileHistoryDetailRow');
        expect(panelContent).toContain('function MobileHistoryCard');
        expect(panelContent).toContain('icon={Eye}');
        expect(panelContent).toContain('aria-controls={detailsId}');
        expect(panelContent).toContain('role="region"');
        expect(panelContent).toContain('data-testid="pos-history-mobile-list" className="flex flex-col gap-1.5 bg-white py-2"');
        expect(panelContent).toContain('const historyTableSurfaceClassName = isMobileViewport');
        expect(panelContent).toContain('overflow-visible rounded-none border-0 bg-transparent shadow-none');
        expect(panelContent).toContain('label="Rest. charge"');
        expect(panelContent).toContain("updateFilterDialogPosition('filters', filterButtonRef.current);");
        expect(panelContent).toContain('pos-history-action-cell pos-history-action-group flex w-full flex-nowrap items-center justify-center ${isMobileViewport ? \'gap-1\' : \'gap-2\'}');
        expect(panelContent).toContain('data-testid="pos-history-filter-button"');
        expect(panelContent).toContain("import PosFilterCountBadge from './PosFilterCountBadge.jsx';");
        expect(panelContent).toContain('<PosFilterCountBadge count={activeFilterCount} />');
        expect(appStyles).toContain('.dgfy-pos-filter-count-badge');
        expect(panelContent).toContain('data-testid="pos-history-calendar-button"');
        expect(panelContent).toContain('data-testid="pos-history-sync-button"');
        expect(panelContent).toContain('border-rose-300 bg-rose-50/40 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800');
        expect(panelContent).toContain('data-testid="pos-history-scroll-region"');
        expect(panelContent).toContain('testId="pos-history-pagination-footer"');
        expect(panelContent).toContain('<col className="w-[12.5%]" />');
        expect(appStyles).toContain('.dgfy-pos-history-table--single-view > colgroup > col {');
        expect(appStyles).toContain('width: 12.5%;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet {');
        expect(appStyles).toContain('min-width: 0;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-portrait > colgroup > col:last-child { width: 25%; }');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet > colgroup > col {');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet .pos-history-action-column {');
        expect(appStyles).toContain('min-width: 0;');
        expect(appStyles).toContain('position: static;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-landscape {');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-landscape > colgroup > col:last-child {');
        expect(appStyles).toContain('width: 26%;');
        expect(panelContent).toContain("import PosTableSurface, { POS_TABLE_HEADER_BLUE_TINT_CLASS, POS_TABLE_HEADER_STANDARD_CLASS } from './PosTableSurface.jsx';");
        expect(panelContent).toContain('<thead className={POS_TABLE_HEADER_STANDARD_CLASS}>');
        expect(appStyles).toContain('.pos-table-header--standard > tr > th {\n  height: var(--pos-table-header-height);');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet .pos-history-action-column > .pos-history-action-cell,');
        expect(appStyles).toContain('min-height: 4rem;');
        expect(appStyles).toContain('min-height: 4.25rem;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet .pos-history-action-column {');
        expect(appStyles).toContain('text-align: center;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet .pos-history-action-column > .pos-history-action-cell,');
        expect(appStyles).toContain('padding-left: 0.5rem;\n  padding-right: 0.5rem;');
        expect(appStyles).toContain('justify-content: center;');
        expect(appStyles).not.toContain('.pos-history-action-button--tablet {');
        expect(appStyles).toContain('vertical-align: middle;');
        expect(appStyles).toContain('height: 4.25rem;');
        expect(appStyles).toContain('min-height: 4.25rem;');
        expect(appStyles).toContain('height: 3.5rem;');
        expect(appStyles).toContain('min-height: 3.5rem;');
        expect(appStyles).toContain('.dgfy-pos-history-mobile-sheet {');
        expect(appStyles).toContain('@media (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
        expect(appStyles).toContain('animation: dgfy-pos-history-mobile-sheet-enter 240ms cubic-bezier(0.16, 1, 0.3, 1) both;');
        expect(appStyles).toContain('position: fixed !important;');
        expect(appStyles).toContain('top: auto !important;');
        expect(appStyles).toContain('transform: none !important;');
        expect(appStyles).toContain('max-height: min(90dvh, 40rem) !important;');
        expect(appStyles).toContain('.dgfy-pos-history-tablet-portrait-dialog {');
        expect(appStyles).toContain('width: min(42rem, calc(100vw - 2rem)) !important;');
        expect(appStyles).toContain('transform: translate(-50%, -50%) !important;');
        expect(appStyles).toContain('.dgfy-pos-history-horizontal-scroll {');
        expect(appStyles).toContain('scrollbar-color: #94a3b8 transparent;');
        expect(appStyles).toContain('touch-action: pan-x;');
        expect(appStyles).toContain('@keyframes dgfy-pos-history-mobile-sheet-enter');
        expect(appStyles).toContain('animation: dgfy-pos-history-mobile-sheet-enter 240ms');
        expect(appStyles).toContain('.dgfy-pos-history-mobile-landscape-dialog {');
        expect(appStyles).toContain('position: fixed !important;');
        expect(appStyles).toContain('width: min(26rem, calc(100vw - 2rem)) !important;');
        expect(appStyles).toContain('@keyframes dgfy-pos-history-mobile-landscape-dialog-enter');
        expect(appStyles).toContain('animation: dgfy-pos-history-mobile-landscape-dialog-enter 180ms');
        expect(appStyles).toContain('[data-testid="pos-history-primary-actions"] {');
        expect(appStyles).toContain('[data-testid="pos-history-void-approval-row"] {');
        expect(appStyles).toContain('flex: 1 1 0%;');
        expect(appStyles).toContain('[data-testid="pos-history-toolbar"] {');
        expect(appStyles).toContain('flex-direction: row;');
        expect(panelContent).toContain("isPhoneHistoryToolbar ? 'flex w-full min-w-0 flex-col gap-2 px-0 py-0'");
        expect(panelContent).toContain('POS_FILTER_TRIGGER_HEIGHT_CLASS');
        expect(appStyles).toContain('tbody > tr:hover > td:not([colspan])');
        expect(panelContent).toContain('transition-colors whitespace-nowrap');
        expect(panelContent).toContain('icon={Eye}');
        expect(panelContent).toContain('POS_PAGINATION_FOOTER_CLASS');
        expect(appStyles).toContain('.dgfy-pos-pagination-footer');
        expect(appStyles).toContain('padding-bottom: 0.75rem !important;');
        expect(panelContent).toContain('flex h-full min-h-0 min-w-0 max-w-full flex-col gap-0');
        expect(panelContent).toContain('<PosFilterDialogShell');
        expect(historyDialogShellContent).toContain("const defaultOverlayClassName = isMobileDialog || tabletPortrait");
        expect(historyDialogShellContent).toContain("'bg-slate-950/60 backdrop-blur-sm'");
        expect(historyDialogShellContent).toContain("'bg-transparent backdrop-blur-none'");
        expect(historyDialogShellContent).toContain('border border-slate-300');
        expect(historyDialogShellContent).toContain('shadow-[0_12px_30px_rgba(15,23,42,0.2)]');
        expect(panelContent).toContain('aria-label={pendingSyncLabel}');
        expect(panelContent).toContain('size="icon"');
        expect(panelContent).toContain('ref={filterButtonRef}');
        expect(panelContent).toContain('data-testid="pos-history-source-tabs"');
        expect(panelContent).toContain('data-testid="pos-history-toolbar"');
        expect(panelContent).toContain('flex flex-nowrap items-center gap-2 pb-4 pt-2 min-[1024px]:gap-3');
        expect(panelContent).toContain('Filter by Date');
        expect(panelContent).toContain('gap-1 whitespace-nowrap rounded-xl border-[#1A4E8D]');
        expect(historyDialogShellContent).toContain("position: 'fixed'");
        expect(historyDialogShellContent).toContain("width: `${position.width}px`");
        expect(historyDialogShellContent).toContain('w-auto max-w-none');
        expect(panelContent).toContain('overflow-x-hidden overflow-y-auto');
        expect(panelContent).toContain('aria-controls="pos-history-filter-dialog"');
        expect(panelContent).toContain('aria-controls="pos-history-calendar-dialog"');
        expect(panelContent).toContain('<PosLineTabNavigation');
        expect(panelContent).toContain('ariaLabel="Transaction sources"');
        expect(panelContent).toContain('idPrefix="pos-history-source-tab"');
        expect(panelContent).toContain('hideScrollbar');
        expect(panelContent).not.toContain('mobileGridColumns={3}');
        expect(panelContent).not.toContain('singleLineMobile');
        expect(panelContent).toContain('testId: `pos-history-source-tab-${sourceTab.value}`');
        expect(panelContent).toContain("{ value: 'all', label: 'All Sources', icon: List }");
        expect(panelContent).toContain("{ value: 'in_store', label: 'In-Store', icon: Store }");
        expect(panelContent).toContain("{ value: 'online_store', label: 'Online Store', icon: Globe }");
        expect(panelContent).toContain('icon: sourceTab.icon');
        expect(panelContent).not.toContain('showIcons={false}');
        expect(historyTabsContent).toContain('data-testid={tab.testId || undefined}');
        expect(panelContent).toContain("label: 'All Sources'");
        expect(panelContent).not.toContain('testId="pos-history-filter-source"');
        expect(panelContent).toContain('data-testid="pos-history-source-tabs" className="dgfy-pos-scrollbar-hidden mb-2 min-w-0 max-w-full overflow-x-auto"');
        expect(panelContent).not.toContain("lg:gap-3 items-center pb-4 pt-2 lg:px-4");
        expect(panelContent).toContain('<PosAppliedFilterChips');
        expect(historyAppliedFilterChipsContent).toContain('bg-blue-50');
        expect(historyAppliedFilterChipsContent).toContain('Remove filter: ${filter.label}');
        expect(historyAppliedFilterChipsContent).toContain('Clear all');
        expect(historyFilterPartsContent).toContain('dgfy-pos-history-horizontal-scroll');
        expect(historyFilterPartsContent).toContain('inline-flex items-center justify-center whitespace-nowrap rounded-lg border');
        expect(historyFilterPartsContent).toContain("'h-9 w-[6.5rem] min-w-[6.5rem] shrink-0 px-2 py-1 text-[11px]'");
        expect(panelContent).toContain('const dialogMaxWidth = 464;');
        expect(panelContent).toContain('Math.min(dialogMaxWidth, Math.max(0, panelRight - panelLeft))');
        expect(panelContent).toContain("const minDialogHeight = mode === 'calendar' ? 480 : 280;");
        expect(panelContent).toContain('const getOrderMethodFilterOptions = (posWorkflow) => {');
        expect(panelContent).toContain('allowedMethods');
        expect(panelContent).toContain('options={orderMethodOptions}');
        expect(panelContent).not.toContain("{ value: 'dine_in', label: 'Dine-In' }");
        expect(panelContent).toContain('Math.max(viewportPadding,');
        expect(panelContent).toContain("isMobileDialog ? 'px-4 py-3' : filterDialogMode === 'calendar' ? 'px-4 py-2.5' : isDesktopDialog ? 'px-4 py-3' : 'px-5 py-4 sm:px-6 sm:py-5'");
        expect(panelContent).toContain("isMobileDialog ? 'px-4 py-3' : filterDialogMode === 'calendar' ? 'px-4 py-2' : isDesktopFilterDialog ? 'px-4 py-2.5' : 'px-5 py-5 sm:px-6'");
        expect(panelContent).toContain("isDesktopFilterDialog ? 'gap-4' : isMobileDialog ? 'gap-3' : 'gap-5'");
        expect(panelContent).toContain("isMobileDialog ? 'gap-3 px-4 py-3' : filterDialogMode === 'calendar' ? 'gap-2 px-4 py-2' : isDesktopFilterDialog ? 'gap-2 px-4 py-2.5' : 'gap-3 px-5 py-4 sm:px-6 sm:py-4'");
        expect(historyDialogShellContent).toContain('dgfy-pos-history-filter-dialog w-auto max-w-none rounded-xl');
        expect(historyDialogShellContent).toContain('dgfy-pos-history-calendar-dialog max-w-none rounded-xl');
        expect(panelContent).toContain('const isTabletPortraitDialog = isTabletPortraitViewport;');
        expect(panelContent).toContain('const isMobileDialog = isMobileViewport && !isTabletPortraitDialog;');
        expect(historyDialogShellContent).toContain('dgfy-pos-history-tablet-portrait-dialog');
        expect(historyDialogShellContent).toContain("landscapeMobile ? 'dgfy-pos-history-mobile-landscape-dialog' : ''");
        expect(panelContent).toContain('const isPosHistoryLandscapeViewport =');
        expect(panelContent).toContain('const isPosHistoryNarrowLandscapeMobileViewport =');
        expect(panelContent).toContain('const isPosHistoryLandscapePanelViewport =');
        expect(panelContent).toContain('detectedLandscapePanelViewport');
        expect(panelContent).toContain('window.visualViewport?.addEventListener');
        expect(panelContent).toContain("window.addEventListener('orientationchange', sync);");
        expect(panelContent).toContain('dgfy-pos-history-dialog-header');
        expect(panelContent).toContain('dgfy-pos-history-dialog-body');
        expect(panelContent).toContain('dgfy-pos-history-dialog-footer');
        expect(panelContent).not.toContain('w-24');
        expect(panelContent).toContain("isMobileDialog ? 'h-9' : filterDialogMode === 'calendar' ? 'h-9' : isDesktopFilterDialog ? 'h-10' : 'h-11'");
        expect(panelContent).toContain('const historyPanelRef = useRef(null);');
        expect(panelContent).toContain('const panelRect = historyPanelRef.current?.getBoundingClientRect?.();');
        expect(panelContent).toContain('new ResizeObserver(reposition)');
        expect(panelContent).toContain('ref={historyPanelRef}');
        expect(panelContent).toContain('sidebarCollapsed = false');
        expect(panelContent).toContain('[filterDialogOpen, filterDialogMode, isDesktopDialog, sidebarCollapsed, updateFilterDialogPosition]');
        expect(terminalViewContent).toContain('sidebarCollapsed={sidebarCollapsed}');
        expect(terminalViewContent).toContain("currentViewMode === 'history'\n                            ? 'flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden'");
        expect(panelContent).toContain('data-testid="pos-history-reset-dates"');
        expect(panelContent).toContain("isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'");
        expect(historyFilterPartsContent).toContain("mobile ? 'h-11 w-11 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : 'h-9 w-9'");
        expect(historyFilterPartsContent).toContain('<X className="h-5 w-5" aria-hidden="true" />');
        expect(historyFilterPartsContent).toContain('descriptionClassName =');
        expect(panelContent).toContain("applyTestId={filterDialogMode === 'calendar' ? 'pos-history-apply-dates' : 'pos-history-apply-filters'}");
        expect(historyDatePickerContent).toContain('data-testid={`${testIdPrefix}-preset-${preset.value}`}');
        expect(historyDatePickerContent).toContain("onChange('', '');");
        expect(historyDatePickerContent).toContain('onClick={() => applyPreset(\'custom\')}');
        expect(historyDatePickerContent).toContain('data-testid={`${testIdPrefix}-previous-month`}');
        expect(historyDatePickerContent).toContain('data-testid={`${testIdPrefix}-next-month`}');
        expect(historyFilterPartsContent).toContain("applyLabel = 'Apply Filters'");
        expect(historyDatePickerContent).toContain("mobile ? 'gap-3' : 'gap-2'");
        expect(historyDatePickerContent).toContain("grid grid-cols-2 ${mobile ? 'gap-2.5' : 'gap-1.5'}");
        expect(historyDatePickerContent).toContain("mobile ? 'h-9 rounded-lg px-2 text-[11px]' : 'h-8 rounded-lg px-2 text-[11px]'");
        expect(historyDatePickerContent).toContain("mobile ? 'h-9 text-[13px]' : 'h-7 text-[11px]'");
        expect(historyDatePickerContent).toContain("const rangeTrackClassName = mobile ? 'before:inset-y-2' : 'before:inset-y-1';");
        expect(historyDatePickerContent).toContain("const rangeTrackStartClassName = isRangeStart ? 'before:left-1/2' : 'before:left-0';");
        expect(historyDatePickerContent).toContain("const rangeTrackEndClassName = isRangeEnd ? 'before:right-1/2' : 'before:right-0';");
        expect(historyDatePickerContent).toContain('before:absolute ${rangeTrackClassName} ${rangeTrackStartClassName} ${rangeTrackEndClassName} before:z-0 before:bg-[#C7DCF3]');
        expect(historyDatePickerContent).toContain('before:rounded-l-full');
        expect(historyDatePickerContent).toContain('before:rounded-r-full');
        expect(historyDatePickerContent).toContain("mobile ? 'h-7 w-7' : 'h-6 w-6'");
        expect(historyDialogShellContent).toContain("'h-[min(90vh,40rem)] max-h-[min(90vh,40rem)] dgfy-pos-history-calendar-dialog max-w-none rounded-xl'");
        expect(panelContent).toContain("cancelTestId=\"pos-history-cancel-dates\"");
        expect(panelContent).toContain("resetTestId=\"pos-history-reset-filters\"");
        expect(panelContent).toContain('const [filterDraft, setFilterDraft] = useState(null);');
        expect(panelContent).toContain('filterApplyPendingRef.current = true;');
        expect(panelContent).toContain('pos-history-action-column');
        expect(panelContent).toContain('<PosTableActionButton');
        expect(panelContent).toContain('className="h-10 w-full min-w-0 sm:flex-1"');
        expect(panelContent).toContain('pos-history-void-dialog sm:max-w-md');
        expect(panelContent).toContain('className="space-y-2 px-6"');
        expect(panelContent).toContain('pos-history-void-footer');
        expect(panelContent).toContain("import { Ban, CalendarDays, ClipboardCheck, ClipboardList, Eye, Filter, Globe, List, ListFilter, RefreshCcw, RotateCcw, Store, Undo2 } from 'lucide-react';");
        expect(panelContent).toContain("import PosSearchField from './PosSearchField.jsx';");
        expect(panelContent).toContain('<Filter className="h-4 w-4" aria-hidden="true" />');
        expect(panelContent).toContain('icon={ClipboardList}');
        expect(panelContent).toContain('icon={Eye}');
        expect(panelContent).toContain('icon={Ban}');
        expect(panelContent).toContain('tone="danger"');
        expect(panelContent).toContain('<PosTableDetailsDialog');
        expect(panelContent).toContain('testId="pos-history-details-dialog"');
        expect(panelContent).toContain('title="Transaction Details"');
        expect(panelContent).toContain('View details for');
        expect(panelContent).toContain('icon={Undo2}');
        expect(panelContent).toContain('inline-flex items-center gap-1.5 text-[13px] font-semibold');
        expect(panelContent).toContain('const getPaymentStatusTextClassName');
        expect(panelContent).toContain('>Date &amp; Time</th>');
        expect(panelContent).toContain("label: 'Fee'");
        expect(panelContent).toContain("label: 'Restaurant Charge'");
        expect(panelContent).toContain("label: 'VAT'");
        expect(panelContent).toContain('>Vatable</th>');
        expect(panelContent).toContain('>Total</th>');
        expect(panelContent).toContain('dgfy-pos-history-header-cell');
        expect(panelContent).toContain('Fee</span>');
        expect(panelContent).toContain('text-left text-[13px] font-black text-[#1A4E8D]">Total</th>');
        expect(panelContent).not.toContain('>Fee (PHP)</th>');
        expect(panelContent).not.toContain('>Total (PHP)</th>');
        expect(panelContent).toContain("{ key: 'fee', label: 'Fee', value: `₱${money(row?.service_fee_amount)}` }");
        expect(panelContent).toContain('max-w-[68%] break-words text-right font-medium text-[#334155]');
        expect(panelContent).toContain('pos-history-date-time-${row.pos_transaction_id}');
        expect(panelContent).toContain('pos-history-payment-${row.pos_transaction_id}');
        expect(panelContent).toContain('pos-history-row-content pos-history-row-content--column min-w-0 leading-tight');
        expect(panelContent).toContain('text-[11px] text-slate-500');
        expect(panelContent).toContain('pos-history-row-content pos-history-row-content--column min-w-0 max-w-full gap-0.5 leading-tight');
        expect(panelContent).toContain('pos-history-action-cell pos-history-action-group flex w-full flex-nowrap items-center justify-center ${isMobileViewport ? \'gap-1\' : \'gap-2\'}');
        expect(panelContent).toContain('money(row.service_fee_amount)');
        expect(panelContent).toContain('money(row.restaurant_service_charge_amount)');
        expect(panelContent).not.toContain('>View</span>');
        expect(panelContent).not.toContain('>Void</');
    });

    it('keeps discount visible on mobile cards and total amounts on one line', () => {
        // The desktop table dropped its fixed 8rem Discount column; discount
        // now renders in the mobile detail rows while the table keeps
        // single-line rows. Both surfaces below prove the rendered contract.
        expect(panelContent).toContain("{ key: 'discount', label: 'Discount', value: getHistoryDiscountLabel(row) }");
        expect(panelContent).toContain('label="Discount"');
        expect(panelContent).toContain('discount_label_snapshot');
        expect(panelContent).toContain('whitespace-nowrap');
        expect(panelContent).toContain('>Total</th>');
    });

    it('renders a visible void status and audit details for voided transactions', () => {
        expect(panelContent).not.toContain('{isTabletViewport && !isMobileViewport && <th scope="col" className="dgfy-pos-history-header-cell px-2.5 py-4 text-left text-[13px] font-black">Status</th>}');
        expect(panelContent).not.toContain('data-testid={`pos-void-status-${row.pos_transaction_id}`}');
        expect(panelContent).toContain('resolvePosVoidReason(row)');
        expect(panelContent).toContain('resolvePosVoidActorLabel(row)');
        expect(panelContent).toContain('formatPosVoidTimestamp(row.voided_at)');
        expect(panelContent).toContain('Voided transaction');
        expect(receiptDialogsContent).toContain('data-testid="pos-void-audit-panel"');
        expect(receiptDialogsContent).toContain('data-testid="pos-void-status-badge"');
        expect(receiptDialogsContent).toContain('data-testid="pos-void-financial-outcome"');
        expect(receiptDialogsContent).toContain('Financial follow-up');
        expect(receiptDialogsContent).toContain('data-testid="pos-refund-adjustment-audit"');
        expect(panelContent).toContain('Resolve refund for');
        expect(panelContent).toContain('<POSRefundWorkflowDialog');
        expect(receiptDialogsContent).toContain('This transaction is no longer an active sale.');
    });

    it('exposes Employee Credit and cashier-name filters in the POS history panel', () => {
        expect(panelContent).toContain("{ value: 'employee_credit', label: 'Employee Credit' }");
        expect(panelContent).toContain('label="Delivery Provider"');
        expect(panelContent).toContain('testId="pos-history-filter-delivery-provider"');
        expect(panelContent).toContain('Search all transaction fields...');
        expect(panelContent).toContain('<PosCashierFilterControl');
        expect(cashierFilterControlContent).toContain('<span id={headingId} className={fieldLabelClassName}>{label}</span>');
        expect(cashierFilterControlContent).toContain('type="search"');
        expect(cashierFilterControlContent).toContain('Search Cashier');
        expect(cashierFilterControlContent).toContain('Cashier options');
        expect(cashierFilterControlContent).toContain('const optionsId = `${testIdPrefix}-options`;');
        expect(cashierFilterControlContent).toContain('aria-expanded={expanded}');
        expect(cashierFilterControlContent).toContain('listUsesTwoColumns');
        expect(cashierFilterControlContent).toContain('listIsScrollable');
        expect(panelContent).not.toContain('Cashier ID');
        expect(panelContent).not.toContain('Search cashier ID...');
    });

    it('passes cashier names through the POS history query and searches displayed transaction data', () => {
        expect(queryContent).toContain('cashier_name: cashierName');
        expect(queryContent).toContain('delivery_provider: deliveryProvider');
        expect(queryContent).not.toContain('cashier_id: cashierId');
        expect(terminalContent).toContain('historyCashierName');
        expect(terminalContent).toContain('historyDeliveryProvider');
        expect(historyWorkflowContent).toContain('rowMatchesHistoryFilters');
        expect(searchUtilityContent).toContain("'employee_credit_employee_name_snapshot'");
        expect(searchUtilityContent).toContain("'discount.employee_name'");
        expect(searchUtilityContent).toContain("'total_amount'");
    });

    it('renders every successful payment method for split transactions on both POS history surfaces', () => {
        expect(panelContent).toContain('formatPosTransactionPaymentMethods(row)');
        expect(skupervisorPanelContent).toContain('formatPosTransactionPaymentMethods(row)');
    });

    it('keeps History icon actions at 36px while text scaling enlarges other buttons', () => {
        expect(tableActionButtonContent).toContain('pos-table-action-button h-9 w-9');
        expect(appStyles).toContain('[aria-label="POS transaction history table"] button:not(.pos-table-action-button)');
        expect(appStyles).toContain('min-height: max(3rem, calc(3rem * var(--pos-text-size-scale, 1)))');
    });
});
