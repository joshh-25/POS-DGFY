import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const panelContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSTransactionHistoryPanel.jsx'),
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
const terminalContent = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx'),
    'utf8'
);
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

describe('POS transaction history search and filter contract', () => {
    it('keeps the history pagination footer flush with the outer card bottom', () => {
        expect(terminalViewContent).toContain('bg-white p-4 pb-0 shadow-sm shadow-slate-200/70 sm:p-5 sm:pb-0');
        expect(terminalViewContent).toContain('max-sm:p-2 max-sm:pb-0');
    });

    it('keeps the tablet landscape history layout aligned with the PC table contract', () => {
        expect(panelContent).toContain("isMobileViewport ? 'text-[12px] min-w-0 table-fixed dgfy-pos-history-table--mobile' : isTabletViewport ? 'text-[12px] min-w-[1180px] table-fixed dgfy-pos-history-table--tablet dgfy-pos-history-table--tablet-landscape' : 'text-[13px] min-w-0 table-fixed dgfy-pos-history-table--single-view'");
        expect(panelContent).toContain('w-full whitespace-nowrap ${isMobileViewport');
        expect(panelContent).toContain('whitespace-nowrap">');
        expect(panelContent).toContain(": 'pos-history-action-column min-w-0';");
        expect(panelContent).toContain("isMobileViewport\n        ? 'h-10 w-10'");
        expect(panelContent).toContain("const isCompactHistoryViewport = isMobileViewport;");
        expect(panelContent).toContain('isPosTabletPortraitViewport');
        expect(panelContent).toContain('Boolean(isMobileViewportProp) || detectedMobileViewport || isTabletPortraitViewport');
        expect(panelContent).toContain("const historyVisibleColumnCount = isMobileViewport ? 3 : 12;");
        expect(panelContent).toContain("const historyActionButtonClassName = isMobileViewport\n        ? 'h-10 w-10'\n        : 'h-9 w-9';");
        expect(panelContent).toContain("const historyActionSizeClassName = isMobileViewport\n        ? 'pos-history-action-button--large'\n        : 'pos-history-action-button--standard';");
        expect(panelContent).toContain('dgfy-pos-history-table--single-view');
        expect(panelContent).toContain('dgfy-pos-history-table--tablet');
        expect(panelContent).toContain('data-pos-history-panel="true"');
        expect(panelContent).toContain('data-testid="pos-history-mobile-list"');
        expect(panelContent).toContain('data-testid={`pos-history-mobile-card-${row.pos_transaction_id}`}');
        expect(panelContent).toContain('data-testid={`pos-history-mobile-details-${row.pos_transaction_id}`}');
        expect(panelContent).toContain('function MobileHistoryField');
        expect(panelContent).toContain('function MobileHistoryCard');
        expect(panelContent).toContain('<Eye className="h-4 w-4" aria-hidden="true" />');
        expect(panelContent).toContain('const actionButtonClassName =');
        expect(panelContent).toContain('grid grid-cols-3 gap-x-3 gap-y-2');
        expect(panelContent).toContain('label="Rest. charge"');
        expect(panelContent).toContain("updateFilterDialogPosition('filters', filterButtonRef.current);");
        expect(panelContent).toContain("pos-history-row-content flex-nowrap ${isTabletViewport && !isMobileViewport ? 'justify-start' : 'justify-center'}");
        expect(panelContent).toContain('data-testid="pos-history-filter-button"');
        expect(panelContent).toContain('data-testid="pos-history-calendar-button"');
        expect(panelContent).toContain('data-testid="pos-history-sync-button"');
        expect(panelContent).toContain('border-rose-300 bg-rose-50/40 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800');
        expect(panelContent).toContain('data-testid="pos-history-scroll-region"');
        expect(panelContent).toContain('testId="pos-history-pagination-footer"');
        expect(panelContent).toContain('<col className="w-[8.3333%]" />');
        expect(appStyles).toContain('.dgfy-pos-history-table--single-view > colgroup > col {');
        expect(appStyles).toContain('width: 8.333333%;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet {');
        expect(appStyles).toContain('min-width: 1180px;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet > colgroup > col {');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet .pos-history-action-column {');
        expect(appStyles).toContain('min-width: 0;');
        expect(appStyles).toContain('position: static;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-landscape {');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-landscape > colgroup > col:last-child {');
        expect(appStyles).toContain('width: 11%;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-landscape .pos-history-action-column {');
        expect(appStyles).toContain('text-align: left;');
        expect(appStyles).toContain('.dgfy-pos-history-table--tablet-landscape .pos-history-action-column > .pos-history-row-content {');
        expect(appStyles).toContain('justify-content: flex-start;');
        expect(appStyles).not.toContain('.pos-history-action-button--tablet {');
        expect(appStyles).toContain('vertical-align: middle;');
        expect(appStyles).toContain('height: 4.5rem;');
        expect(appStyles).toContain('min-height: 4.5rem;');
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
        expect(appStyles).toContain('[data-testid="pos-history-toolbar"] .pos-history-toolbar-control {');
        expect(appStyles).toContain('max-height: 2.5rem;');
        expect(appStyles).toContain('[data-testid="pos-history-toolbar"] {');
        expect(appStyles).toContain('flex-direction: row;');
        expect(panelContent).toContain('flex-row w-full px-0');
        expect(panelContent).toContain('pos-history-toolbar-control');
        expect(appStyles).toContain('tbody > tr:hover > td:not([colspan])');
        expect(panelContent).toContain('transition-colors whitespace-nowrap');
        expect(panelContent).toContain('shadow-none hover:bg-transparent');
        expect(panelContent).toContain('dgfy-pos-history-pagination-footer shrink-0 rounded-none border-0 border-t border-slate-200 px-6 py-2.5 shadow-none');
        expect(appStyles).toContain('.dgfy-pos-history-pagination-footer');
        expect(appStyles).toContain('padding-bottom: 0.75rem !important;');
        expect(panelContent).toContain('flex h-full min-h-0 min-w-0 max-w-full flex-col gap-0');
        expect(panelContent).toContain("overlayClassName={isMobileDialog || isTabletPortraitDialog ? 'bg-slate-950/60 backdrop-blur-sm' : 'bg-transparent backdrop-blur-none'}");
        expect(panelContent).toContain('border border-slate-300');
        expect(panelContent).toContain('shadow-[0_12px_30px_rgba(15,23,42,0.2)]');
        expect(panelContent).toContain('aria-label={pendingSyncLabel}');
        expect(panelContent).toContain('size="icon"');
        expect(panelContent).toContain('ref={filterButtonRef}');
        expect(panelContent).toContain("position: 'fixed'");
        expect(panelContent).toContain("width: `${filterDialogPosition.width}px`");
        expect(panelContent).toContain('w-auto max-w-none');
        expect(panelContent).toContain('overflow-x-hidden overflow-y-auto');
        expect(panelContent).toContain('aria-controls="pos-history-filter-dialog"');
        expect(panelContent).toContain('aria-controls="pos-history-calendar-dialog"');
        expect(panelContent).toContain('role="tablist" aria-label="Transaction sources"');
        expect(panelContent).toContain('data-testid={`pos-history-source-tab-${sourceTab.value}`}');
        expect(panelContent).toContain("label: 'All Sources'");
        expect(panelContent).not.toContain('testId="pos-history-filter-source"');
        expect(panelContent).toContain("isMobileViewport ? 'flex flex-nowrap gap-2' : 'flex flex-wrap gap-2 lg:gap-3'");
        expect(panelContent).toContain("isMobileViewport ? 'basis-0' : 'basis-[18rem]'");
        expect(panelContent).toContain("isMobileViewport ? 'h-10 pl-10 pr-3 text-[11px]' : 'h-11 pl-12 pr-4 text-[13px]'");
        expect(panelContent).toContain("isMobileViewport ? 'h-10 w-10 min-w-0 px-0' : 'h-11 min-w-[6.25rem] px-4'");
        expect(panelContent).toContain("isMobileViewport ? 'mb-0 overflow-x-hidden px-3' : 'mb-2 overflow-x-auto px-3 lg:px-4'");
        expect(panelContent).toContain("isMobileViewport ? 'dgfy-pos-history-horizontal-scroll flex-nowrap overflow-x-auto overscroll-x-contain touch-pan-x' : 'flex-wrap'");
        expect(panelContent).toContain('h-7 max-w-full shrink-0 items-center rounded-full border');
        expect(panelContent).toContain('px-3 py-0 text-[11px] font-bold leading-none');
        expect(panelContent).toContain("isMobileViewport ? 'sr-only' : 'mr-1'");
        expect(panelContent).toContain("isMobileViewport ? 'after:bottom-1' : 'after:bottom-0'");
        expect(panelContent).toContain('after:h-0.5 after:rounded-full after:bg-[#1A4E8D]');
        expect(panelContent).toContain("isMobileViewport ? 'after:inset-x-0' : 'after:inset-x-4'");
        expect(panelContent).toContain('flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x');
        expect(panelContent).toContain('dgfy-pos-history-horizontal-scroll');
        expect(panelContent).toContain('inline-flex items-center justify-center whitespace-nowrap rounded-lg border');
        expect(panelContent).toContain("'h-11 w-[6.5rem] min-w-[6.5rem] shrink-0 px-2 py-1 text-[11px]'");
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
        expect(panelContent).toContain('dgfy-pos-history-filter-dialog w-auto max-w-none rounded-xl');
        expect(panelContent).toContain('dgfy-pos-history-calendar-dialog max-w-none rounded-xl');
        expect(panelContent).toContain('const isTabletPortraitDialog = isTabletPortraitViewport;');
        expect(panelContent).toContain('const isMobileDialog = isMobileViewport && !isTabletPortraitDialog;');
        expect(panelContent).toContain('dgfy-pos-history-tablet-portrait-dialog');
        expect(panelContent).toContain("isLandscapeMobileViewport ? 'dgfy-pos-history-mobile-landscape-dialog' : ''");
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
        expect(panelContent).toContain("isMobileDialog ? 'h-12' : filterDialogMode === 'calendar' ? 'h-9' : isDesktopFilterDialog ? 'h-10' : 'h-11'");
        expect(panelContent).toContain('const historyPanelRef = useRef(null);');
        expect(panelContent).toContain('const panelRect = historyPanelRef.current?.getBoundingClientRect?.();');
        expect(panelContent).toContain('new ResizeObserver(reposition)');
        expect(panelContent).toContain('ref={historyPanelRef}');
        expect(panelContent).toContain('sidebarCollapsed = false');
        expect(panelContent).toContain('[filterDialogOpen, filterDialogMode, isDesktopDialog, sidebarCollapsed, updateFilterDialogPosition]');
        expect(terminalViewContent).toContain('sidebarCollapsed={sidebarCollapsed}');
        expect(terminalViewContent).toContain('min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-xl');
        expect(panelContent).toContain('data-testid="pos-history-reset-dates"');
        expect(panelContent).toContain("isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'");
        expect(panelContent).toContain("isMobileDialog ? 'h-11 w-11 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : 'h-9 w-9'");
        expect(panelContent).toContain('<X className="h-5 w-5" />');
        expect(panelContent).toContain('<DialogDescription className="mt-0.5 text-[12px] text-slate-500">');
        expect(panelContent).toContain("data-testid={filterDialogMode === 'calendar' ? 'pos-history-apply-dates' : 'pos-history-apply-filters'}");
        expect(panelContent).toContain('data-testid={`pos-history-calendar-preset-${preset.value}`}');
        expect(panelContent).toContain('const activateCustomRange = () => {');
        expect(panelContent).toContain("onChange('', '');");
        expect(panelContent).toContain('onClick={activateCustomRange}');
        expect(panelContent).toContain('data-testid="pos-history-calendar-previous-month"');
        expect(panelContent).toContain('data-testid="pos-history-calendar-next-month"');
        expect(panelContent).toContain('Apply Filters');
        expect(panelContent).toContain("mobile ? 'gap-3' : 'gap-2'");
        expect(panelContent).toContain("grid grid-cols-2 ${mobile ? 'gap-2.5' : 'gap-1.5'}");
        expect(panelContent).toContain("mobile ? 'h-11 rounded-lg px-2 text-[11px]' : 'h-8 rounded-lg px-2 text-[11px]'");
        expect(panelContent).toContain("mobile ? 'h-10 text-[13px]' : 'h-7 text-[11px]'");
        expect(panelContent).toContain("const rangeTrackClassName = mobile ? 'before:inset-y-2' : 'before:inset-y-1';");
        expect(panelContent).toContain("const rangeTrackStartClassName = isRangeStart ? 'before:left-1/2' : 'before:left-0';");
        expect(panelContent).toContain("const rangeTrackEndClassName = isRangeEnd ? 'before:right-1/2' : 'before:right-0';");
        expect(panelContent).toContain('before:absolute ${rangeTrackClassName} ${rangeTrackStartClassName} ${rangeTrackEndClassName} before:z-0 before:bg-[#C7DCF3]');
        expect(panelContent).toContain('before:rounded-l-full');
        expect(panelContent).toContain('before:rounded-r-full');
        expect(panelContent).toContain("mobile ? 'h-8 w-8' : 'h-6 w-6'");
        expect(panelContent).toContain("'max-h-[min(90vh,40rem)] dgfy-pos-history-calendar-dialog max-w-none rounded-xl'");
        expect(panelContent).toContain("'pos-history-cancel-dates' : 'pos-history-reset-filters'");
        expect(panelContent).toContain('const [filterDraft, setFilterDraft] = useState(null);');
        expect(panelContent).toContain('filterApplyPendingRef.current = true;');
        expect(panelContent).toContain('pos-history-action-column');
        expect(panelContent).toContain('aspect-square');
        expect(panelContent).toContain('className="h-10 w-full min-w-0 sm:flex-1"');
        expect(panelContent).toContain('pos-history-void-dialog sm:max-w-md');
        expect(panelContent).toContain('className="space-y-2 px-6"');
        expect(panelContent).toContain('pos-history-void-footer');
        expect(panelContent).toContain("import { Ban, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Eye, Globe, ListFilter, RefreshCcw, RotateCcw, Search, Store, Undo2, UserRound, X } from 'lucide-react';");
        expect(panelContent).toContain('<ClipboardList className="h-5 w-5" aria-hidden="true" />');
        expect(panelContent).toContain('pos-history-view-action');
        expect(appStyles).toContain('.pos-history-view-action {');
        expect(appStyles).toContain('background-color: #f8fafc;');
        expect(panelContent).toContain('bg-slate-50 text-slate-600 hover:bg-slate-100');
        expect(panelContent).toContain('<Eye className="h-4 w-4" aria-hidden="true" />');
        expect(panelContent).toContain('<Ban className="h-4 w-4" aria-hidden="true" />');
        expect(panelContent).toContain('pos-history-void-action');
        expect(panelContent).toContain('border border-slate-200 bg-white p-0 text-rose-700 shadow-sm');
        expect(panelContent).toContain('inline-flex items-center gap-1.5 text-[13px] font-semibold');
        expect(panelContent).toContain('const getPaymentStatusTextClassName');
        expect(panelContent).toContain('>Date &amp; Time</th>');
        expect(panelContent).toContain('>Fee</th>');
        expect(panelContent).toContain('dgfy-pos-history-header--wrap');
        expect(panelContent).toContain('>Rest. charge</th>');
        expect(panelContent).toContain('>VAT</th>');
        expect(panelContent).toContain('>Vatable</th>');
        expect(panelContent).toContain('>Total</th>');
        expect(panelContent).toContain('dgfy-pos-history-header-cell');
        expect(panelContent).toContain('Fee</span>');
        expect(panelContent).toContain('w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-nowrap px-3 py-4 text-right text-[13px] font-black text-[#1A4E8D]">Total</th>');
        expect(panelContent).not.toContain('>Fee (PHP)</th>');
        expect(panelContent).not.toContain('>Total (PHP)</th>');
        expect(panelContent).toContain('text-left text-[#334155]"><div className="pos-history-row-content">₱{money(row.service_fee_amount)}</div></td>');
        expect(panelContent).toContain('pos-history-date-time-${row.pos_transaction_id}');
        expect(panelContent).toContain('pos-history-payment-${row.pos_transaction_id}');
        expect(panelContent).toContain('pos-history-row-content pos-history-row-content--column min-w-0 leading-tight');
        expect(panelContent).toContain('text-[11px] text-slate-500');
        expect(panelContent).toContain('pos-history-row-content pos-history-row-content--column min-w-0 max-w-full gap-0.5 leading-tight');
        expect(panelContent).toContain("pos-history-row-content flex-nowrap ${isTabletViewport && !isMobileViewport ? 'justify-start' : 'justify-center'}");
        expect(panelContent).toContain('money(row.service_fee_amount)');
        expect(panelContent).toContain('money(row.restaurant_service_charge_amount)');
        expect(panelContent).not.toContain('>View</span>');
        expect(panelContent).not.toContain('>Void</');
    });

    it('allocates a compact discount column and keeps total amounts on one line', () => {
        expect(panelContent).toContain('w-[8rem] min-w-[8rem] max-w-[8rem] px-2 py-4 text-left');
        expect(panelContent).toContain('w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-nowrap px-3 py-4 text-right text-[13px]');
        expect(panelContent).toContain('w-[8rem] min-w-[8rem] max-w-[8rem] break-words px-2 py-4 text-[#334155]');
        expect(panelContent).toContain('w-[8rem] min-w-[8rem] max-w-[8rem] whitespace-nowrap px-3 py-4 text-right font-black tabular-nums');
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
        expect(panelContent).toContain('Search all transaction fields...');
        expect(panelContent).toContain('<span className={fieldLabelClassName}>Cashier</span>');
        expect(panelContent).toContain('type="search"');
        expect(panelContent).toContain('Search Cashier');
        expect(panelContent).toContain('Select Cashier');
        expect(panelContent).toContain('pos-history-cashier-options');
        expect(panelContent).toContain('pos-history-cashier-dropdown-toggle');
        expect(panelContent).toContain('aria-expanded={cashierPickerOpen}');
        expect(panelContent).toContain('cashierListUsesTwoColumns');
        expect(panelContent).toContain('cashierListIsScrollable');
        expect(panelContent).not.toContain('Cashier ID');
        expect(panelContent).not.toContain('Search cashier ID...');
    });

    it('passes cashier names through the POS history query and searches displayed transaction data', () => {
        expect(queryContent).toContain('cashier_name: cashierName');
        expect(queryContent).not.toContain('cashier_id: cashierId');
        expect(terminalContent).toContain('historyCashierName');
        expect(historyWorkflowContent).toContain('rowMatchesHistoryFilters');
        expect(searchUtilityContent).toContain("'employee_credit_employee_name_snapshot'");
        expect(searchUtilityContent).toContain("'discount.employee_name'");
        expect(searchUtilityContent).toContain("'total_amount'");
    });

    it('renders every successful payment method for split transactions on both POS history surfaces', () => {
        expect(panelContent).toContain('formatPosTransactionPaymentMethods(row)');
        expect(skupervisorPanelContent).toContain('formatPosTransactionPaymentMethods(row)');
    });
});
