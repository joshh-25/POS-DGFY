import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const posCheckoutPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const posCurrentSaleActionsPath = path.resolve(__dirname, '../components/PosCurrentSaleActions.jsx');
const posHistoryPath = path.resolve(__dirname, '../components/POSTransactionHistoryPanel.jsx');
const terminalSidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const appStylesPath = path.resolve(__dirname, '../../../index.css');

describe('POS terminal responsive scroll contracts', () => {
  let terminalLayoutContent = '';
  let posCheckoutContent = '';
  let posCurrentSaleActionsContent = '';
  let posHistoryContent = '';
  let terminalSidebarContent = '';
  let appStylesContent = '';

  beforeAll(() => {
    terminalLayoutContent = fs.readFileSync(terminalLayoutPath, 'utf8');
    posCheckoutContent = fs.readFileSync(posCheckoutPath, 'utf8');
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
    expect(terminalLayoutContent).toContain("? `lg:grid ${effectiveSidebarCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[244px_minmax(0,1fr)]'}`");
    expect(terminalLayoutContent).toContain(": `xl:grid ${effectiveSidebarCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[244px_minmax(0,1fr)]'}`");
  });

  it('keeps the mobile navigation control available in the persistent header', () => {
    expect(terminalLayoutContent).toContain("aria-label={isDesktopWide ? (effectiveSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar') : 'Open sidebar menu'}");
    expect(terminalLayoutContent).toContain('setMobileNavOpen(true);');
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
    expect(posCheckoutContent).toContain("const shellClassName = 'h-full min-h-0 overflow-hidden';");
    expect(posCheckoutContent).toContain("const checkoutGridClassName = 'grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_325px] md:pb-0 2xl:gap-6';");
    expect(posCheckoutContent).toContain('aria-label="POS catalog contents"');
    expect(posCheckoutContent).toContain('aria-label="Current sale contents"');
    expect(posCheckoutContent).toContain("const checkoutPaneClassName = 'flex h-full min-h-0 max-h-full flex-col overflow-hidden';");
    expect(posCheckoutContent).not.toContain('md:max-xl:min-h-[78rem]');
  });

  it('keeps responsive catalog cards and paginated catalog slices', () => {
    expect(posCheckoutContent).toContain('repeat(auto-fill, minmax(min(100%');
    expect(posCheckoutContent).toContain('new window.ResizeObserver(scheduleCapacityMeasurement)');
    expect(posCheckoutContent).toContain('const catalogPageSize = Math.max(1, catalogGridLayout.pageSize * 2);');
    expect(posCheckoutContent).toContain('data-catalog-page-size={catalogPageSize}');
    expect(posCheckoutContent).toContain('return catalogForDisplay.slice(pageStart, pageStart + catalogPageSize);');
    expect(posCheckoutContent).toContain('Page {catalogPage} of {totalCatalogPages}');
    expect(posCheckoutContent).toContain('data-testid="pos-catalog-controls"');
    expect(posCheckoutContent).toContain('data-testid="pos-catalog-scroll"');
    expect(posCheckoutContent).toContain('dgfy-pos-scroll-region relative mt-2 min-h-0 flex-1 overflow-y-auto');
    expect(posCheckoutContent).toContain('const viewport = catalogCapacityViewportRef.current;');
    expect(posCheckoutContent).not.toContain('const CATALOG_PAGE_SIZE = 12;');
    expect(posCheckoutContent).not.toContain('scrollIntoView({ block: \'start\', behavior: \'auto\' })');
  });

  it('keeps catalog interaction swipe-safe without pointer capture hacks', () => {
    expect(posCheckoutContent).toContain("if (event.pointerType !== 'pen') return;");
    expect(posCheckoutContent).not.toContain('setPointerCapture');
    expect(posCheckoutContent).not.toContain('releasePointerCapture');
    expect(posCheckoutContent).toContain('addCatalogItemToCart(item');
  });

  it('keeps current-sale actions and mobile sheet behavior intact', () => {
    expect(posCheckoutContent).toContain('fixed inset-x-0 bottom-0 z-50 h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)]');
    expect(posCheckoutContent).toContain('md:static md:z-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto');
    expect(posCheckoutContent).toContain("const currentSaleBodyClassName = 'dgfy-pos-current-sale-panel-scroll grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto_auto] gap-2 overflow-hidden md:grid-rows-[auto_auto_auto] md:overflow-y-auto md:overscroll-contain md:pr-1 md:touch-pan-y';");
    expect(posCheckoutContent).toContain("const currentSaleItemsListClassName = 'dgfy-pos-scroll-region h-full min-h-0 overflow-y-auto overscroll-contain pr-1 touch-pan-y';");
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-panel"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-items"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-totals"');
    expect(posCheckoutContent).toContain('md:h-[clamp(18rem,46vh,26rem)] md:flex-none');
    expect(posCheckoutContent).toContain('<PosCurrentSaleActions');
    expect(posCheckoutContent).toContain('presentationBundle={posPresentationBundle}');
    expect(posCurrentSaleActionsContent).toContain('data-testid="pos-current-sale-actions"');
    expect(posCurrentSaleActionsContent).toContain('data-has-parked-sale-controls={showParkedSaleControls');
    expect(posCurrentSaleActionsContent).toContain('dgfy-pos-current-sale-actions grid shrink-0 grid-cols-2');
    expect(posCurrentSaleActionsContent).toContain('flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center');
    expect(posCheckoutContent).not.toContain('max-h-[25rem] overflow-y-auto');
    expect(posCurrentSaleActionsContent).toContain('Checkout');
    expect(posCurrentSaleActionsContent).toContain('Open Cash Drawer');
    expect(posCurrentSaleActionsContent).not.toContain('Close Day / Z-Reading');
    expect(posCurrentSaleActionsContent).not.toContain('Print Last Receipt');
  });

  it('collects workflow and payment settings inside checkout confirmation', () => {
    const currentSaleIndex = posCheckoutContent.indexOf('data-testid="pos-current-sale-panel"');
    const checkoutDialogIndex = posCheckoutContent.indexOf('<Dialog open={checkoutConfirmModalOpen}');
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
    expect(checkoutDialogSection).toContain('onClick={handlePrintOrder}');
    expect(checkoutDialogSection).toContain('Print Order');
    expect(checkoutDialogSection).toContain('grid grid-cols-3 gap-2');
    expect(posCheckoutContent).toContain('!isCheckoutWorkflowValid || !isCustomerPaymentSufficient');
  });

  it('keeps the compact desktop summary separate from the unchanged mobile summary', () => {
    expect(posCheckoutContent).toContain('className="grid grid-cols-2 gap-x-3 gap-y-1 md:hidden"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-desktop-summary" className="hidden gap-y-0.5 md:grid"');
    expect(posCheckoutContent).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(posCheckoutContent).toContain('whitespace-nowrap text-right font-extrabold tabular-nums');
    expect(posCheckoutContent).toContain('>Items Subtotal</span>');
    expect(posCheckoutContent).toContain('>Net Items</span>');
    expect(posCheckoutContent).toContain('>Discount</span>');
    expect(posCheckoutContent).toContain('>VATable Sales</span>');
    expect(posCheckoutContent).toContain('>VAT Exempt Sales</span>');
    expect(posCheckoutContent).toContain('>VAT Amount</span>');
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
    expect(appStylesContent).toContain('scrollbar-gutter: stable;');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll:hover,');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll:hover::-webkit-scrollbar-thumb,');
    expect(appStylesContent).toContain('.dgfy-pos-current-sale-panel-scroll::-webkit-scrollbar {');
    expect(appStylesContent).toContain('@media (min-width: 768px) and (max-height: 720px)');
    expect(appStylesContent).toContain(".dgfy-pos-current-sale-actions[data-has-parked-sale-controls='true'] {");
    expect(appStylesContent).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
  });

  it('keeps history filters and table scrolling inside the history panel', () => {
    expect(posHistoryContent).toContain('grid grid-cols-2 gap-4 xl:grid-cols-4');
    expect(posHistoryContent).toContain('dgfy-pos-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y');
    expect(posHistoryContent).toContain('overflow-x-auto border-t border-slate-200');
    expect(posHistoryContent).toContain('aria-label="POS transaction history table"');
  });

  it('keeps the sidebar locked open with settings navigation available', () => {
    expect(terminalSidebarContent).toContain('h-full min-h-0 overflow-hidden rounded-none');
    expect(terminalSidebarContent).toContain('dgfy-pos-sidebar-scroll min-h-0 flex-1 overflow-y-auto');
    expect(terminalSidebarContent).toContain('testId="pos-nav-settings"');
    expect(terminalSidebarContent).toContain('my-5 border-t border-slate-200');
    expect(terminalSidebarContent).toContain('Lock Terminal');
    expect(terminalSidebarContent).not.toContain('data-testid="pos-sidebar-session-footer"');
  });
});
