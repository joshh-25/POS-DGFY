import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const posCheckoutPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const posHistoryPath = path.resolve(__dirname, '../components/POSTransactionHistoryPanel.jsx');
const terminalSidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const globalStylesPath = path.resolve(__dirname, '../../../index.css');

describe('POS terminal responsive scroll contracts', () => {
  let terminalLayoutContent = '';
  let posCheckoutContent = '';
  let posHistoryContent = '';
  let terminalSidebarContent = '';
  let globalStylesContent = '';

  beforeAll(() => {
    terminalLayoutContent = fs.readFileSync(terminalLayoutPath, 'utf8');
    posCheckoutContent = fs.readFileSync(posCheckoutPath, 'utf8');
    posHistoryContent = fs.readFileSync(posHistoryPath, 'utf8');
    terminalSidebarContent = fs.readFileSync(terminalSidebarPath, 'utf8');
    globalStylesContent = fs.readFileSync(globalStylesPath, 'utf8');
  });

  it('keeps terminal shell viewport-safe and avoids hard xl screen lock', () => {
    expect(terminalLayoutContent).toContain('min-h-[100dvh]');
    expect(terminalLayoutContent).not.toContain('xl:h-screen');
  });

  it('sizes checkout panes from the available shell height instead of viewport math', () => {
    expect(posCheckoutContent).toContain("const shellClassName = 'h-full min-h-0 space-y-5';");
    expect(posCheckoutContent).toContain("const checkoutGridClassName = 'grid h-full min-h-0");
    expect(terminalLayoutContent).toContain('xl:flex xl:flex-col');
    expect(terminalLayoutContent).toContain("? 'h-full min-h-0 transition'");
    expect(terminalLayoutContent).toContain('className={workspaceSectionClassName}');
    expect(posCheckoutContent).not.toContain('md:h-[calc(100vh-8rem)]');
    expect(posCheckoutContent).not.toContain('calc(100vh-13.5rem)');
  });

  it('keeps the catalog flexible while reserving a stable current-sale pane', () => {
    expect(posCheckoutContent).toContain('md:grid-cols-[minmax(0,1fr)_325px]');
    expect(posCheckoutContent).toContain('flex min-h-0 flex-col');
    expect(posCheckoutContent).toContain('relative flex min-h-0 flex-col overflow-hidden');
  });

  it('keeps catalog pagination and current-sale actions in fixed pane footers', () => {
    expect(posCheckoutContent).toContain('data-testid="pos-catalog-footer"');
    expect(posCheckoutContent).toContain('mt-auto shrink-0 border-t');
    expect(posCheckoutContent).not.toContain('Showing 9 items per page. Swipe left or right to browse catalog pages.');
    expect(posCheckoutContent).toContain('grid grid-cols-2 gap-2 border-t');
    expect(posCheckoutContent).toContain('Checkout');
    expect(posCheckoutContent).toContain('Close Day / Z-Reading');
    expect(posCheckoutContent).toContain('Print Last Receipt');
    expect(posCheckoutContent).toContain('Open Cash Drawer');
  });

  it('limits catalog pages to twelve equal-height item cards', () => {
    expect(posCheckoutContent).toContain('const catalogPageSize = 12;');
    expect(posCheckoutContent).toContain('return catalog.slice(pageStart, pageStart + catalogPageSize);');
    expect(posCheckoutContent).toContain('auto-rows-[7rem]');
    expect(posCheckoutContent).toContain('auto-rows-[11rem]');
    expect(posCheckoutContent).not.toContain('catalogAutoPageSize');
    expect(posCheckoutContent).not.toContain('ResizeObserver');
  });

  it('removes legacy scroll badges without restoring split-pane detection', () => {
    expect(posCheckoutContent).not.toContain("window.matchMedia('(min-width: 1536px)')");
    expect(posCheckoutContent).not.toContain('const hasSplitPaneScroll');
    expect(posCheckoutContent).not.toContain('isAtLeast2xlViewport');
    expect(posCheckoutContent).not.toContain('Page scroll');
    expect(posCheckoutContent).not.toContain('Catalog scroll');
    expect(posCheckoutContent).not.toContain('Sale scroll');
    expect(posCheckoutContent).not.toContain('Hover or focus a pane to scroll it.');
  });

  it('keeps scrolling scoped to catalog cards and current-sale content', () => {
    expect(posCheckoutContent).toContain('aria-label="POS catalog contents"');
    expect(posCheckoutContent).toContain('aria-label="Current sale contents"');
    expect(posCheckoutContent).toContain('flex-1 overflow-y-auto overscroll-y-contain pr-1 pb-3');
    expect(posCheckoutContent).not.toContain('onKeyDown={handleScrollPaneKeyDown}');
    expect(posCheckoutContent).not.toContain('onScroll={syncCatalogPaneScrollState}');
    expect(posCheckoutContent).not.toContain('onScroll={syncCurrentSalePaneScrollState}');
    expect(posCheckoutContent).not.toContain('handlePaneScrollKeyDown(event)');
  });

  it('keeps history rows vertically scrollable inside the fixed terminal shell', () => {
    expect(posHistoryContent).toContain('flex h-full min-h-0 flex-col');
    expect(posHistoryContent).toContain('flex min-h-0 flex-1 flex-col overflow-hidden border-t');
    expect(posHistoryContent).toContain('min-h-0 flex-1 overflow-auto overscroll-contain');
    expect(posHistoryContent).toContain('shrink-0 flex flex-col gap-4 border-t');
  });

  it('does not render split-pane overflow cues', () => {
    expect(posCheckoutContent).not.toContain('catalogPaneScrollState.canScroll');
    expect(posCheckoutContent).not.toContain('currentSalePaneScrollState.canScroll');
    expect(posCheckoutContent).not.toContain('!catalogPaneScrollState.atTop');
    expect(posCheckoutContent).not.toContain('!currentSalePaneScrollState.atBottom');
    expect(posCheckoutContent).not.toContain('bg-gradient-to-b from-white to-transparent');
    expect(posCheckoutContent).not.toContain('bg-gradient-to-t from-white to-transparent');
  });

  it('removes custom ArrowUp/ArrowDown interception in quantity and price inputs', () => {
    expect(posCheckoutContent).not.toContain('updateCartQuantity(line.item_id, Number(line.quantity || 0) + delta);');
    expect(posCheckoutContent).not.toContain('const nextValue = Math.max(0, Number(line.sale_price || 0) + delta);');
  });

  it('locks only checkout on desktop while keeping long operational panels scrollable', () => {
    expect(terminalLayoutContent).toContain('const workspaceDesktopOverflowClassName = isCheckoutWorkspaceMode');
    expect(terminalLayoutContent).toContain("? 'xl:flex xl:flex-col xl:overflow-hidden'");
    expect(terminalLayoutContent).toContain(": 'xl:overflow-y-auto xl:overscroll-contain xl:overscroll-y-contain xl:touch-pan-y'");
    expect(terminalLayoutContent).toContain('${workspaceDesktopOverflowClassName}');
    expect(terminalLayoutContent).toContain('const workspaceContentClassName = isCheckoutWorkspaceMode');
    expect(terminalLayoutContent).toContain("? 'grid grid-cols-1 gap-2 p-2 xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)]'");
    expect(terminalLayoutContent).toContain(": 'grid grid-cols-1 gap-2 p-2'");
    expect(terminalLayoutContent).toContain('className={workspaceSectionClassName}');
  });

  it('keeps catalog and current-sale panes equal-height with scoped scroll regions', () => {
    expect(terminalLayoutContent).toContain('<div key="checkout-workspace" className="h-full min-h-0 max-sm:animate-pos-slide-in">');
    expect(posCheckoutContent).toContain('<div key="view-checkout" className="h-full min-h-0 max-sm:animate-pos-slide-in">');
    expect(posCheckoutContent).toContain("const checkoutPaneClassName = 'h-full max-h-full';");
    expect(posCheckoutContent).toContain("const catalogPaneHeightClassName = 'h-full max-h-full';");
    expect(posCheckoutContent).toContain("const currentSalePaneHeightClassName = 'h-full max-h-full';");
    expect(posCheckoutContent).toContain('data-testid="pos-catalog-scroll"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-scroll"');
    expect(posCheckoutContent).toContain('data-testid="pos-current-sale-header"');
    expect(posCheckoutContent).toContain("const catalogViewportClassName = 'flex min-h-0 flex-1 flex-col overflow-hidden pr-0 pb-3';");
    expect(posCheckoutContent).toContain("const currentSaleBodyClassName = 'dgfy-pos-scrollbar-auto-hide min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y';");
    expect(posCheckoutContent).toContain("const currentSaleItemsListClassName = 'pr-1';");
    expect(posCheckoutContent).toContain('md:overflow-hidden md:pointer-events-auto');
  });

  it('shows both pane scrollbars only while the pointer hovers the scroll region', () => {
    expect(posCheckoutContent.match(/dgfy-pos-scrollbar-auto-hide/g)).toHaveLength(2);
    expect(globalStylesContent).toContain('.dgfy-pos-scrollbar-auto-hide:hover');
    expect(globalStylesContent).not.toContain('.dgfy-pos-scrollbar-auto-hide:focus');
    expect(globalStylesContent).not.toContain('.dgfy-pos-scrollbar-auto-hide:focus-within');
  });

  it('highlights cart-selected catalog items without obscuring their content', () => {
    expect(posCheckoutContent).toContain('const selectedCatalogItemIds = useMemo(() => new Set(');
    expect(posCheckoutContent).toContain('aria-pressed={isOutOfStock || posActionsBlocked ? undefined : isSelected}');
    expect(posCheckoutContent).toContain('!border-blue-300 !bg-blue-50 ring-1 ring-blue-200');
    expect(posCheckoutContent).toContain('className="h-full w-full object-cover object-center"');
  });

  it('keeps the terminal session action inside the scrollable sidebar navigation', () => {
    expect(terminalSidebarContent).toContain('data-testid="pos-sidebar-session-action"');
    expect(terminalSidebarContent).toContain('mt-5 border-t border-slate-200 pt-5');
    expect(terminalSidebarContent).not.toContain('data-testid="pos-sidebar-session-footer"');
  });

  it('preserves card clicks by keeping mouse pointers out of swipe capture', () => {
    expect(posCheckoutContent).toContain("if (event.pointerType !== 'pen') return;");
    expect(posCheckoutContent).not.toContain('setPointerCapture');
    expect(posCheckoutContent).not.toContain('releasePointerCapture');
    expect(posCheckoutContent).toContain('addToCart(item);');
  });
});
