import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const posCheckoutPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const posCheckoutViewPath = path.resolve(__dirname, '../components/POSCheckoutTerminalView.jsx');
const posCheckoutDialogPath = path.resolve(__dirname, '../components/POSCheckoutConfirmDialog.jsx');
const fnbWorkflowPanelPath = path.resolve(__dirname, '../components/FnbWorkflowPanel.jsx');
const counterWorkflowPanelPath = path.resolve(__dirname, '../components/CounterWorkflowPanel.jsx');
const posTerminalLayoutPath = path.resolve(__dirname, '../utils/posTerminalLayout.js');
const posCatalogWorkflowPath = path.resolve(__dirname, '../hooks/usePosCatalogWorkflow.js');
const posCurrentSaleActionsPath = path.resolve(__dirname, '../components/PosCurrentSaleActions.jsx');
const posHistoryPath = path.resolve(__dirname, '../components/POSTransactionHistoryPanel.jsx');
const terminalSidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const appStylesPath = path.resolve(__dirname, '../../../index.css');

describe('POS terminal responsive scroll contracts', () => {
  let terminalLayoutContent = '';
  let posCheckoutContent = '';
  let workflowPanelContent = '';
  let posTerminalLayoutContent = '';
  let posCatalogWorkflowContent = '';
  let posCurrentSaleActionsContent = '';
  let posHistoryContent = '';
  let terminalSidebarContent = '';
  let appStylesContent = '';

  beforeAll(() => {
    terminalLayoutContent = fs.readFileSync(terminalLayoutPath, 'utf8');
    posCheckoutContent = [posCheckoutPath, posCheckoutViewPath, posCheckoutDialogPath]
      .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
      .join('\n');
    workflowPanelContent = [fnbWorkflowPanelPath, counterWorkflowPanelPath]
      .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
      .join('\n');
    posTerminalLayoutContent = fs.readFileSync(posTerminalLayoutPath, 'utf8');
    posCatalogWorkflowContent = fs.readFileSync(posCatalogWorkflowPath, 'utf8');
    posCurrentSaleActionsContent = fs.readFileSync(posCurrentSaleActionsPath, 'utf8');
    posHistoryContent = fs.readFileSync(posHistoryPath, 'utf8');
    terminalSidebarContent = fs.readFileSync(terminalSidebarPath, 'utf8');
    appStylesContent = fs.readFileSync(appStylesPath, 'utf8');
  });

  it('keeps the terminal shell viewport-safe without restoring hard xl screen locks', () => {
    expect(terminalLayoutContent).toContain('dgfy-pos-shell overflow-hidden');
    expect(terminalLayoutContent).not.toContain('min-h-screen');
    expect(terminalLayoutContent).not.toContain('xl:h-screen');
    expect(terminalLayoutContent).toContain('sticky top-0 z-40 shrink-0 border-b border-pos');
    expect(terminalLayoutContent).toContain("const shellLayoutClassName = IS_DGFY_POS_SURFACE");
    expect(terminalLayoutContent).toContain("? (isTabletLayout");
    expect(terminalLayoutContent).toContain("'md:grid md:grid-cols-[68px_minmax(0,1fr)]'");
    expect(terminalLayoutContent).toContain("`lg:grid ${effectiveSidebarCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[244px_minmax(0,1fr)]'}`");
    expect(terminalLayoutContent).toContain(": `xl:grid ${effectiveSidebarCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[244px_minmax(0,1fr)]'}`");
  });

  it('locks only the outer POS document scroll while preserving inner scroll regions', () => {
    expect(terminalLayoutContent).toContain("const documentScrollLockClassName = 'dgfy-pos-document-scroll-lock';");
    expect(terminalLayoutContent).toContain('document.documentElement.classList.add(documentScrollLockClassName);');
    expect(terminalLayoutContent).toContain('document.body?.classList.add(documentScrollLockClassName);');
    expect(terminalLayoutContent).toContain('document.documentElement.classList.remove(documentScrollLockClassName);');
    expect(terminalLayoutContent).toContain('document.body?.classList.remove(documentScrollLockClassName);');
    expect(appStylesContent).toContain('html.dgfy-pos-document-scroll-lock,');
    expect(appStylesContent).toContain('body.dgfy-pos-document-scroll-lock {');
    expect(appStylesContent).toContain('overflow: hidden;');
    expect(posHistoryContent).toContain('overflow-y-auto');
  });

  it('keeps the mobile navigation control available in the persistent header', () => {
    expect(terminalLayoutContent).toContain("aria-label={!isFloatingSidebarLayout ? (effectiveSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar') : 'Open sidebar menu'}");
    expect(terminalLayoutContent).toContain('setMobileNavOpen(true);');
    expect(terminalLayoutContent).toContain('isTabletLayout = false');
    expect(terminalLayoutContent).toContain("{isFloatingSidebarLayout && mobileNavOpen && (");
  });

  it('shows the terminal status below the title on narrow mobile headers', () => {
    expect(terminalLayoutContent).toContain('data-testid="pos-mobile-terminal-indicator"');
    expect(terminalLayoutContent).toContain('flex min-h-[38px] min-w-0 items-center justify-between gap-2 lg:min-h-[46px] lg:gap-3');
    expect(terminalLayoutContent).toContain('flex min-w-0 items-center gap-1.5 leading-none sm:hidden');
    expect(terminalLayoutContent).toContain('role="status"');
    expect(terminalLayoutContent).toContain('{normalizedActiveTerminalId || \'COUNTER-01\'}');
    expect(terminalLayoutContent).toContain("{isOnline ? 'Online' : 'Offline'}");
    expect(terminalLayoutContent).toContain('text-[10px] font-extrabold text-slate-700');
    expect(terminalLayoutContent).toContain('text-[10px] text-slate-300');
    expect(terminalLayoutContent).not.toContain('basis-full pl-[3.25rem] sm:hidden');
    expect(terminalLayoutContent).toContain('hidden shrink-0 items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 shadow-xs sm:flex');
  });

  it('locks the checkout workspace while preserving scrolling for other modes', () => {
    expect(terminalLayoutContent).toContain("? 'flex min-h-0 flex-1 flex-col overflow-hidden'");
    expect(terminalLayoutContent).toContain(": 'dgfy-pos-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y'");
    expect(terminalLayoutContent).toContain('grid min-h-0 min-w-0 max-w-full flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-2 overflow-hidden p-2');
    expect(terminalLayoutContent).toContain('h-full min-h-0 min-w-0 max-w-full overflow-hidden transition');
    expect(terminalLayoutContent).toContain('data-testid="pos-workspace-scroll-container"');
    expect(terminalLayoutContent).toContain('className="min-w-0 max-w-full catalog-slide-enter"');
    expect(terminalLayoutContent).toContain('data-testid="pos-checkout-workspace" className="h-full min-h-0 overflow-hidden catalog-slide-enter"');
    expect(terminalLayoutContent).not.toContain('workspaceDesktopOverflowClassName');
  });

  it('keeps checkout split into catalog and current-sale panes', () => {
    expect(posTerminalLayoutContent).toContain("shellClassName: 'h-full min-h-0 overflow-hidden'");
    expect(posTerminalLayoutContent).toContain('checkoutGridClassName: isTabletViewport');
    expect(posTerminalLayoutContent).toContain('overflow-hidden pb-16 md:');
    expect(posTerminalLayoutContent).not.toContain('overflow-hidden pb-20 md:');
    expect(posTerminalLayoutContent).toContain("md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]");
    expect(posTerminalLayoutContent).toContain("md:grid-cols-[minmax(0,1fr)_325px]");
    expect(posTerminalLayoutContent).toContain('checkoutGridClassName: isTabletViewport\n        ? \'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] grid-cols-1 gap-2');
    expect(posTerminalLayoutContent).toContain(": 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)] grid-cols-1 gap-2 overflow-hidden");
    expect(posCheckoutContent).toContain('aria-label="POS catalog contents"');
    expect(posCheckoutContent).toContain('aria-label="Current sale contents"');
    expect(posCheckoutContent).toContain('role="region" aria-label="Current sale contents" className="dgfy-pos-current-sale-scroll-surface flex min-h-0 flex-1 flex-col overflow-hidden"');
    expect(posTerminalLayoutContent).toContain("checkoutPaneClassName: 'flex h-full min-h-0 max-h-full flex-col overflow-hidden'");
    expect(posCheckoutContent).not.toContain('md:max-xl:min-h-[78rem]');
  });

  it('keeps responsive catalog cards and paginated catalog slices', () => {
    const catalogContractContent = `${posCheckoutContent}\n${posCatalogWorkflowContent}`;
    expect(catalogContractContent).toContain('repeat(auto-fill, minmax(min(100%');
    expect(posCheckoutContent).toContain('max-sm:px-2 max-sm:pt-2 max-sm:pb-2 sm:grid sm:grid-rows-[minmax(0,1fr)_auto]');
    expect(posCheckoutContent).toContain("'max-sm:w-[128px]'");
    expect(catalogContractContent).toContain('new window.ResizeObserver(scheduleCapacityMeasurement)');
    expect(catalogContractContent).toContain('catalogPageSize');
    expect(catalogContractContent).toContain('catalogPageSizeOverride');
    expect(catalogContractContent).toContain('CatalogPageSizeControl');
    expect(catalogContractContent).toContain('role="listbox"');
    expect(catalogContractContent).toContain('role="option"');
    expect(catalogContractContent).toContain('aria-label={`Products per page, currently ${selectedLabel}`}');
    expect(posCheckoutContent).toContain('catalogPageSizeOptions,');
    expect(catalogContractContent).toContain('handleCatalogPageSizeChange');
    expect(catalogContractContent).toContain('data-catalog-page-size={catalogPageSize}');
    expect(catalogContractContent).toContain('getVisibleCatalogItems(catalogForDisplay, catalogPage, catalogPageSize)');
    expect(catalogContractContent).toContain('const getCatalogPageNumbers = (currentPage, totalPages) =>');
    expect(posCheckoutContent).toContain('{!isCompactTabletCatalogPagination && catalogPageNumbers.map((page) => {');
    expect(posCheckoutContent).toContain('{isCompactTabletCatalogPagination && (');
    expect(posCheckoutContent).toContain("onClick={() => handleCatalogPageChange('previous')}");
    expect(posCheckoutContent).toContain("onClick={() => handleCatalogPageChange('next')}");
    expect(posCheckoutContent).not.toContain("onClick={() => handleCatalogPageChange('first')}");
    expect(posCheckoutContent).not.toContain("onClick={() => handleCatalogPageChange('last')}");
    expect(posCheckoutContent).toContain('aria-label="Go to previous catalog page"');
    expect(posCheckoutContent).toContain('aria-label="Go to next catalog page"');
    expect(posCheckoutContent).toContain('CatalogPageJumpControl');
    expect(posCheckoutContent).toContain('aria-label="Go to catalog page"');
    expect(posCheckoutContent).toContain('hideLabels = false');
    expect(posCheckoutContent).toContain('{!hideLabels && <label');
    expect(posCheckoutContent).toContain('hideLabels\n                                    />');
    expect(posCheckoutContent).toContain('value={inputValue}');
    expect(posCheckoutContent).toContain("setInputValue(event.target.value.replace(/[^0-9]/g, ''))");
    expect(posCheckoutContent).toContain('const nextPage = Math.min(safeTotalPages, Math.max(1, requestedPage));');
    expect(posCheckoutContent).toContain('showPageSuffix');
    expect(catalogContractContent).toContain('aria-current={isCurrentPage ? \'page\' : undefined}');
    expect(catalogContractContent).toContain('const hasManyCatalogPages = totalCatalogPages > 5;');
    expect(catalogContractContent).toContain("'hidden sm:inline-flex'");
    expect(catalogContractContent).not.toContain('Page {catalogPage} of {totalCatalogPages}');
    expect(catalogContractContent).not.toContain('Catalog Footer');
    expect(catalogContractContent).toContain('data-testid="pos-catalog-footer"');
    expect(catalogContractContent).toContain('data-testid="pos-catalog-pagination"');
    expect(catalogContractContent).toContain('aria-label="Product catalog pagination"');
    expect(posCheckoutContent).toContain('const drawerDialogButtonClassName = isCompactTabletCatalogPagination');
    expect(posCheckoutContent).toContain('min-h-11 w-full min-w-0 whitespace-nowrap px-3 sm:w-auto sm:flex-1');
    expect(posCheckoutContent).toContain('className={drawerDialogButtonClassName}');
    expect(catalogContractContent).toContain('data-testid="pos-catalog-controls"');
    expect(catalogContractContent).toContain('data-testid="pos-catalog-scroll"');
    expect(catalogContractContent).toContain('dgfy-pos-scroll-region dgfy-pos-catalog-scroll relative mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-4 pb-1 max-sm:pt-[18px] sm:pt-6');
    expect(appStylesContent).toContain('scrollbar-gutter: auto;');
    expect(posCheckoutContent).toContain('relative z-10 mt-auto flex min-h-[56px] w-full shrink-0 items-center border-t');
    expect(posCheckoutContent).toContain('bg-white p-4 pb-0 shadow-sm shadow-slate-200/70 sm:p-6 sm:pb-0');
    expect(posCheckoutContent).toContain("? 'sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto]'\n                            : 'sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto_auto]'");
    expect(posCheckoutContent).toContain('className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:justify-self-center max-sm:col-span-2 max-sm:row-start-2 max-sm:w-max max-sm:justify-self-center max-sm:justify-center max-sm:gap-1"');
    expect(posCheckoutContent).toContain('mr-1 h-9 w-9 shrink-0 touch-manipulation border-slate-200 bg-white');
    expect(posCheckoutContent).toContain('ml-1 h-9 w-9 shrink-0 touch-manipulation border-slate-200 bg-white');
    expect(posCheckoutContent).toContain('h-9 w-9 shrink-0 touch-manipulation border-[#1A4E8D] bg-[#1A4E8D]');
    expect(posCheckoutContent).toContain('className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-300');
    expect(posCheckoutContent).toContain("showPageSuffix ? 'min-w-[6.25rem]' : 'min-w-[4.25rem]'");
    expect(posCheckoutContent).toContain('<span className="text-slate-500">/ page</span>');
    expect(posCheckoutContent).toContain('text-[11px] font-medium leading-none text-slate-900');
    expect(posCheckoutContent).toContain('hover:border-slate-400 hover:bg-white hover:text-slate-900 focus-visible:ring-slate-300');
    expect(posCheckoutContent).toContain('className="hidden sm:inline-flex"');
    expect(posCheckoutContent).toContain('max-sm:min-h-0 max-sm:py-2');
    expect(posCheckoutContent).not.toContain('border-t border-slate-100 pt-1 sm:w-auto sm:border-t-0');
    expect(posCheckoutContent).toContain('flex min-h-0 flex-col overflow-hidden`}>');
    expect(posCatalogWorkflowContent).toContain('const horizontalPadding = computedStyle');
    expect(posCatalogWorkflowContent).toContain('const verticalPadding = computedStyle');
    expect(catalogContractContent).toContain('catalogCapacityViewportRef');
    expect(catalogContractContent).not.toContain('const CATALOG_PAGE_SIZE = 12;');
    expect(catalogContractContent).not.toContain('scrollIntoView({ block: \'start\', behavior: \'auto\' })');
  });

  it('keeps catalog page swipes and supports mouse-drag folder scrolling', () => {
    const catalogContractContent = `${posCheckoutContent}\n${posCatalogWorkflowContent}`;
    expect(catalogContractContent).toContain("if (event.pointerType !== 'pen') return;");
    expect(catalogContractContent).toContain('const folderStripDragStateRef = useRef(null);');
    expect(catalogContractContent).toContain('event.currentTarget.setPointerCapture?.(event.pointerId);');
    expect(catalogContractContent).toContain('if (!drag.hasPointerCapture)');
    expect(catalogContractContent).toContain('event.currentTarget.releasePointerCapture(event.pointerId);');
    expect(posCheckoutContent).toContain('className="mb-0 flex cursor-grab items-center gap-2 overflow-x-auto px-1 py-1 dgfy-pos-scrollbar-hidden"');
    expect(catalogContractContent).toContain('onClickCapture={handleFolderStripClickCapture}');
    expect(catalogContractContent).toContain('onWheel={handleFolderStripWheel}');
    expect(catalogContractContent).toContain('cursor-grab');
    expect(posCheckoutContent).toContain('addCatalogItemToCart(item');
  });

  it('keeps current-sale actions and mobile sheet behavior intact', () => {
    expect(posCheckoutContent).toContain('pos-mobile-bottom-sheet');
    expect(posCheckoutContent).toContain('fixed inset-x-0 bottom-0 z-50 translate-y-0 pointer-events-auto');
    expect(posCheckoutContent).toContain('fixed inset-x-0 bottom-0 z-50 translate-y-full pointer-events-none');
    expect(posCheckoutContent).toContain('transition-transform duration-300 ease-out motion-reduce:transition-none');
    expect(posCheckoutContent).toContain('rounded-t-2xl rounded-b-none border border-slate-200 bg-white p-3 shadow-2xl');
    expect(posCheckoutContent).toContain('md:static md:z-auto md:h-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto md:transition-none');
    expect(posCheckoutContent).toContain('<div className="flex items-center justify-between gap-3">');
    expect(posTerminalLayoutContent).toContain("currentSaleBodyClassName: 'dgfy-pos-current-sale-panel-scroll grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto_auto] gap-2 overflow-hidden md:grid-rows-[auto_auto_auto] md:overflow-y-auto md:overscroll-contain md:pr-1 md:touch-pan-y'");
    expect(posTerminalLayoutContent).toContain("currentSaleItemsListClassName: 'dgfy-pos-scroll-region h-full min-h-0 overflow-y-auto overscroll-contain pr-1 touch-pan-y'");
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-panel"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-items"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-totals"');
    expect(posCheckoutContent).toContain('<ShoppingCart size={16} className="mr-1.5" aria-hidden="true" />');
    expect(posCheckoutContent).toContain("'Cart'");
    expect(posCheckoutContent).toContain('pos-modal-scroll-content grid min-h-0 min-w-0 max-w-full flex-1');
    expect(posCheckoutContent).toContain('flex-1 content-start gap-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 pt-2 lg:grid-cols-2');
    expect(posCheckoutContent).toContain('overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(posCheckoutContent).toContain('overflow-x-auto overflow-y-hidden overscroll-x-contain');
    expect(posCheckoutContent).toContain('grid min-w-[768px] shrink-0 grid-cols-6 gap-1.5');
    expect(posCheckoutContent).toContain('mobileSheet');
    expect(posCheckoutContent).toContain('pos-mobile-bottom-sheet pos-checkout-mobile-sheet');
    expect(posCheckoutContent).toContain("discountModalOpen ? 'pos-checkout-mobile-sheet-expanded' : ''");
    expect(posCheckoutContent).toContain('pos-checkout-mobile-scroll-locked');
    expect(posCheckoutContent).toContain('pos-checkout-mobile-scroll-expanded');
    expect(posCheckoutContent).toContain('max-sm:w-full max-sm:max-w-none max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x max-sm:border-t max-sm:border-b-0');
    expect(posCheckoutContent).toContain('max-h-[16rem] flex-none overflow-y-auto overscroll-contain bg-white p-4');
    expect(appStylesContent).toContain('@media (max-width: 639.98px)');
    expect(appStylesContent).toContain('body[data-pos-text-size] .pos-checkout-confirm-dialog');
    expect(appStylesContent).toContain('height: calc(100dvh - 9rem + 10px);');
    expect(appStylesContent).toContain('max-height: calc(100dvh - 9rem + 10px);');
    expect(appStylesContent).toContain('height: calc(100dvh - 3rem);');
    expect(appStylesContent).toContain('body[data-pos-text-size] .pos-checkout-mobile-sheet-expanded');
    expect(appStylesContent).toContain('overflow-y: hidden;');
    expect(appStylesContent).toContain('overflow-y: auto;');
    expect(appStylesContent).toContain('transition: height 280ms cubic-bezier(0.16, 1, 0.3, 1), max-height 280ms cubic-bezier(0.16, 1, 0.3, 1);');
    expect(appStylesContent).not.toContain('animation: pos-mobile-bottom-sheet-enter');
    expect(posCheckoutContent).toContain('grid min-w-[680px] grid-cols-[minmax(180px,1.5fr)_repeat(5,minmax(80px,1fr))] gap-2');
    expect(posCheckoutContent).toContain('h-9 whitespace-nowrap rounded-lg border px-2 text-[11px] font-extrabold');
    expect(posCheckoutContent).toContain('className="block text-[11px] font-bold text-slate-600">');
    expect(posCheckoutContent).toContain('<legend className="text-[11px] font-bold text-slate-600">Payment Type</legend>');
    expect(posCheckoutContent).toContain('className="w-full min-w-0 max-w-full space-y-1 py-[5px]" aria-label="Payment Type"');
    expect(posCheckoutContent).toContain('grid min-w-[720px] grid-cols-6 gap-2');
    expect(posCheckoutContent).toContain("isStatutoryDiscountSelected ? 'grid-cols-6 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'");
    expect(posCheckoutContent).toContain('relative box-border w-full min-w-0 cursor-pointer overflow-hidden rounded-lg border border-blue-300 bg-clip-padding');
    expect(posCheckoutContent).toContain('focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500');
    expect(workflowPanelContent).toContain('className="grid w-max min-w-full grid-cols-4 gap-1.5 overflow-visible sm:w-full"');
    expect(workflowPanelContent).toContain('overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x');
    expect(workflowPanelContent).toContain('text-[11px] font-bold text-slate-600">Order Method</');
    expect(workflowPanelContent).toContain('className="block text-[11px] font-bold text-slate-600"');
    expect(workflowPanelContent).toContain('space-y-1 py-[5px]" aria-label="Order Method"');
    expect(posCheckoutContent).toContain('className="min-w-0 max-w-full space-y-0 lg:col-span-2" data-testid="pos-checkout-order-settings"');
    expect(posCheckoutContent).toContain('grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-2 sm:gap-2');
    expect(posCheckoutContent).toContain('className="mt-1 flex items-center gap-1 sm:hidden"');
    expect(posCheckoutContent).toContain('Decrease quantity for ${line.item_name}');
    expect(posCheckoutContent).toContain('Increase quantity for ${line.item_name}');
    expect(posCheckoutContent).toContain('max-w-[5.5rem] shrink-0 items-center justify-center overflow-hidden');
    expect(posCheckoutContent).toContain('text-ellipsis whitespace-nowrap');
    expect(posCheckoutContent).toContain('<div className="col-span-2 flex min-h-0 flex-col overflow-hidden md:h-[clamp(18rem,46vh,26rem)] md:flex-none">');
    expect(posCheckoutContent).toContain('<div className="min-h-0 flex-1 overflow-hidden border-b border-slate-200 pb-2">');
    expect(posCheckoutContent).toContain('data-testid="pos-no-printer-notice"');
    expect(posCheckoutContent).toContain('No printer detected on this device.');
    expect(posCheckoutContent).toContain('rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600');
    expect(posCheckoutContent).toContain('<PosCurrentSaleActions');
    expect(posCheckoutContent).toContain('<div className="shrink-0 bg-white">');
    expect(posCheckoutContent).not.toContain('lg:absolute lg:inset-x-4 lg:bottom-4');
    expect(posCurrentSaleActionsContent).toContain('data-testid="pos-current-sale-actions"');
    expect(posCurrentSaleActionsContent).toContain('data-has-parked-sale-controls={hasParkedSaleControls ? \'true\' : \'false\'}');
    expect(posCurrentSaleActionsContent).toContain('className={`dgfy-pos-current-sale-actions ${tabletLayout ? \'dgfy-pos-tablet-action-grid\' : \'\'} grid shrink-0 ${gridClassName}');
    expect(posCurrentSaleActionsContent).toContain('grid shrink-0 ${gridClassName} gap-2 pt-2');
    expect(posCurrentSaleActionsContent).toContain("const gridClassName = compactParkedLayout ? 'grid-cols-6' : 'grid-cols-2 sm:grid-cols-2';");
    expect(posCurrentSaleActionsContent).toContain("const checkoutActionClassName = compactParkedLayout ? 'order-2 col-span-3' : '';");
    expect(posCurrentSaleActionsContent).toContain("const printActionClassName = compactParkedLayout ? 'order-1 col-span-3' : '';");
    expect(posCurrentSaleActionsContent).toContain("const bottomActionClassName = compactParkedLayout ? 'order-3 col-span-2' : '';");
    expect(posCurrentSaleActionsContent).toContain('dgfy-pos-tablet-action-grid');
    expect(posCurrentSaleActionsContent).toContain('flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center');
    expect(posCheckoutContent).not.toContain('max-h-[25rem] overflow-y-auto');
    expect(posCurrentSaleActionsContent).toContain('Checkout');
    expect(posCurrentSaleActionsContent).toContain('Open Cash Drawer');
    expect(posCurrentSaleActionsContent).toContain('<Banknote size={14} className="mb-0.5 shrink-0" aria-hidden="true" />');
    expect(posCurrentSaleActionsContent).not.toContain('Close Day / Z-Reading');
    expect(posCurrentSaleActionsContent).not.toContain('Print Last Receipt');
  });

  it('collects workflow and payment settings inside checkout confirmation', () => {
    const currentSaleIndex = posCheckoutContent.indexOf('data-testid="pos-current-sale-panel"');
    const checkoutDialogIndex = posCheckoutContent.indexOf('open={checkoutConfirmModalOpen}');
    const confirmationSettingsIndex = posCheckoutContent.indexOf('data-testid="pos-checkout-order-settings"');
    const workflowSlotIndex = posCheckoutContent.indexOf('<PosCheckoutDetailsSlot', confirmationSettingsIndex);
    const currentSaleSection = posCheckoutContent.slice(currentSaleIndex, checkoutDialogIndex);
    const checkoutDialogSection = posCheckoutContent.slice(checkoutDialogIndex);

    expect(currentSaleIndex).toBeGreaterThan(-1);
    expect(checkoutDialogIndex).toBeGreaterThan(currentSaleIndex);
    expect(confirmationSettingsIndex).toBeGreaterThan(checkoutDialogIndex);
    expect(workflowSlotIndex).toBeGreaterThan(confirmationSettingsIndex);
    expect(currentSaleSection).not.toContain('<FnbWorkflowPanel');
    expect(currentSaleSection).not.toContain('<ServicesWorkflowPanel');
    expect(currentSaleSection).not.toContain('Payment Type');
    expect(checkoutDialogSection).toContain('presentationBundle={posPresentationBundle}');
    expect(checkoutDialogSection).toContain('servicesClientName={servicesClientName}');
    expect(checkoutDialogSection).toContain('onClick={() => handlePrintOrder()}');
    expect(checkoutDialogSection).toContain('Print Order');
    expect(checkoutDialogSection).toContain('grid grid-cols-3 gap-2');
    expect(posCheckoutContent).toContain('!isCheckoutWorkflowValid || (!splitPaymentReady && !paymentIsSufficient)');
  });

  it('keeps the compact desktop summary separate with the governed totals typography', () => {
    expect(posCheckoutContent).toContain('className="grid grid-cols-2 gap-x-3 gap-y-1 md:hidden"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-desktop-summary" className="hidden gap-y-0.5 md:grid"');
    expect(posCheckoutContent).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(posCheckoutContent).toContain('whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums');
    expect(posCheckoutContent).toContain('text-[13px] text-[#334155]">Items Subtotal</span>');
    expect(posCheckoutContent).toContain('text-[13px] font-extrabold text-[#0F172A]">₱{money(cartSubtotal)}</span>');
    expect(posCheckoutContent).toContain('text-[18px] font-black text-[#0F172A]">Total</span>');
    expect(posCheckoutContent).toContain('text-[18px] font-black tabular-nums text-[#1A4E8D]">₱{money(cartTotal)}</span>');
    expect(posCheckoutContent).toContain('>Net Items</span>');
    expect(posCheckoutContent).toContain('>Discount</span>');
    expect(posCheckoutContent).toContain('>VATable Sales</span>');
    expect(posCheckoutContent).toContain('>VAT Exempt Sales</span>');
    expect(posCheckoutContent).toContain('>VAT Amount (12%)</span>');
    expect(posCheckoutContent).toContain('>Zero Rated Sales</span>');
  });

  it('reveals stable scrollbars only while interactive regions are active', () => {
    expect(appStylesContent).toContain('.dgfy-pos-scroll-region {');
    expect(appStylesContent).toContain('scrollbar-color: transparent transparent;');
    expect(appStylesContent).toContain('scrollbar-gutter: stable;');
    expect(appStylesContent).toContain('scrollbar-width: thin;');
    expect(appStylesContent).toContain('scroll-behavior: smooth;');
    expect(appStylesContent).toContain('overscroll-behavior-y: contain;');
    expect(appStylesContent).toContain('.dgfy-pos-scroll-region:hover,');
    expect(appStylesContent).toContain('.dgfy-pos-scroll-region:focus-within,');
    expect(appStylesContent).toContain('.dgfy-pos-scroll-region:active {');
    expect(appStylesContent).toContain('.dgfy-pos-scroll-region:hover::-webkit-scrollbar-thumb,');
    expect(appStylesContent).toContain('.dgfy-pos-scroll-region::-webkit-scrollbar {');
    expect(appStylesContent).toContain('@media (min-width: 768px)');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll {');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-scroll-surface .dgfy-pos-scroll-region {');
    expect(appStylesContent).toContain('scrollbar-color: #94a3b8 transparent;');
    expect(appStylesContent).toContain('scrollbar-gutter: stable;');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll:hover,');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll:hover::-webkit-scrollbar-thumb,');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll::-webkit-scrollbar {');
    expect(appStylesContent).not.toContain(".dgfy-pos-current-sale-actions[data-has-parked-sale-controls='true'] {");
    expect(appStylesContent).not.toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(appStylesContent).toContain('@media (min-width: 640px) and (max-width: 1023.98px)');
    expect(appStylesContent).toContain('.dgfy-pos-tablet-action-grid > button {');
    expect(appStylesContent).toContain('min-height: 54px;');
  });

  it('keeps history filters and table scrolling inside the history panel', () => {
    expect(posHistoryContent).toContain('grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4');
    // The panel owns vertical scrolling while only the table owns horizontal
    // scrolling, so filters and the surrounding card never pan sideways.
    expect(posHistoryContent).toContain('flex h-full min-h-0 min-w-0 max-w-full flex-col gap-4 overflow-x-hidden');
    expect(posHistoryContent).toContain('dgfy-pos-scrollbar-hidden min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y');
    expect(posHistoryContent).toContain('w-full min-w-0 max-w-full overscroll-x-contain overflow-x-auto border-t border-slate-200');
    expect(posHistoryContent).toContain('aria-label="POS transaction history table"');
  });

  it('keeps the sidebar locked open with settings navigation available', () => {
    expect(terminalSidebarContent).toContain('h-full min-h-0 overflow-hidden rounded-none');
    expect(terminalSidebarContent).toContain('dgfy-pos-sidebar-scroll min-h-0 flex-1 overflow-y-auto');
    expect(terminalSidebarContent).toContain('testId="pos-nav-settings"');
    expect(terminalSidebarContent).toContain("isCollapsed ? 'my-3' : 'my-5'");
    expect(terminalSidebarContent).toContain('border-t border-slate-200');
    expect(terminalSidebarContent).toContain('Lock Terminal');
    expect(terminalSidebarContent).not.toContain('data-testid="pos-sidebar-session-footer"');
    expect(terminalSidebarContent).toContain('isCollapsed = false');
    expect(terminalSidebarContent).toContain('collapsed={isCollapsed}');
    expect(terminalSidebarContent).toContain('title={collapsed ? label : undefined}');
    expect(terminalSidebarContent).toContain('className="h-8 w-7 object-cover object-left"');
    expect(workflowPanelContent).toContain('isTabletViewport = false');
    expect(workflowPanelContent).toContain("orderMethod === 'takeout' && isTabletViewport ? 'col-span-full '");
    expect(posCheckoutContent).toContain('isTabletViewport={isTabletViewport}');
  });
});
