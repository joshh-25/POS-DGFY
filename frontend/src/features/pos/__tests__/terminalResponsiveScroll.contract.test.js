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

describe('POS terminal responsive scroll contracts', () => {
  let terminalLayoutContent = '';
  let posCheckoutContent = '';
  let posHistoryContent = '';
  let terminalSidebarContent = '';

  beforeAll(() => {
    terminalLayoutContent = fs.readFileSync(terminalLayoutPath, 'utf8');
    posCheckoutContent = fs.readFileSync(posCheckoutPath, 'utf8');
    posHistoryContent = fs.readFileSync(posHistoryPath, 'utf8');
    terminalSidebarContent = fs.readFileSync(terminalSidebarPath, 'utf8');
  });

  it('keeps the terminal shell viewport-safe without restoring hard xl screen locks', () => {
    expect(terminalLayoutContent).toContain('min-h-[100dvh]');
    expect(terminalLayoutContent).not.toContain('xl:h-screen');
    expect(terminalLayoutContent).toContain("const shellLayoutClassName = IS_DGFY_POS_SURFACE");
    expect(terminalLayoutContent).toContain("? `lg:grid ${effectiveSidebarCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[244px_minmax(0,1fr)]'}`");
    expect(terminalLayoutContent).toContain(": `xl:grid ${effectiveSidebarCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[244px_minmax(0,1fr)]'}`");
  });

  it('keeps the workspace pane scrollable inside the fixed shell', () => {
    expect(terminalLayoutContent).toContain('dgfy-pos-scrollbar-hidden flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y');
    expect(terminalLayoutContent).toContain("? 'xl:flex xl:flex-col xl:overflow-hidden'");
    expect(terminalLayoutContent).toContain(": 'xl:overflow-y-auto xl:overscroll-contain xl:overscroll-y-contain xl:touch-pan-y'");
    expect(terminalLayoutContent).toContain('grid grid-cols-1 gap-2 p-2 xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)]');
    expect(terminalLayoutContent).toContain('<div key="checkout-workspace" className="min-h-0 catalog-slide-enter xl:h-full">');
  });

  it('keeps checkout split into catalog and current-sale panes', () => {
    expect(posCheckoutContent).toContain("const shellClassName = 'h-auto min-h-0 space-y-5 xl:h-full';");
    expect(posCheckoutContent).toContain("const checkoutGridClassName = 'grid min-h-0 grid-cols-1 gap-4 pb-24 md:grid-cols-[minmax(0,1fr)_325px] md:pb-0 xl:h-full xl:overflow-hidden 2xl:gap-6';");
    expect(posCheckoutContent).toContain('aria-label="POS catalog contents"');
    expect(posCheckoutContent).toContain('aria-label="Current sale contents"');
    expect(posCheckoutContent).toContain("const checkoutPaneClassName = 'h-full max-h-full';");
  });

  it('keeps responsive catalog cards and paginated catalog slices', () => {
    expect(posCheckoutContent).toContain('auto-rows-[7rem]');
    expect(posCheckoutContent).toContain('md:grid-cols-3 md:auto-rows-[11rem]');
    expect(posCheckoutContent).toContain('const CATALOG_PAGE_SIZE = 12;');
    expect(posCheckoutContent).toContain('return safeCatalog.slice(pageStart, pageStart + catalogPageSize);');
    expect(posCheckoutContent).toContain('Page {catalogPage} of {totalCatalogPages}');
    expect(posCheckoutContent).not.toContain('ResizeObserver');
    expect(posCheckoutContent).not.toContain('scrollIntoView({ block: \'start\', behavior: \'auto\' })');
  });

  it('keeps catalog interaction swipe-safe without pointer capture hacks', () => {
    expect(posCheckoutContent).toContain("if (event.pointerType !== 'pen') return;");
    expect(posCheckoutContent).not.toContain('setPointerCapture');
    expect(posCheckoutContent).not.toContain('releasePointerCapture');
    expect(posCheckoutContent).toContain('addToCart(item);');
  });

  it('keeps current-sale actions and mobile sheet behavior intact', () => {
    expect(posCheckoutContent).toContain('fixed inset-x-0 bottom-0 z-50 max-h-[88vh]');
    expect(posCheckoutContent).toContain('md:static md:z-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto');
    expect(posCheckoutContent).toContain('Checkout');
    expect(posCheckoutContent).toContain('Close Day / Z-Reading');
    expect(posCheckoutContent).toContain('Print Last Receipt');
    expect(posCheckoutContent).toContain('Open Cash Drawer');
  });

  it('keeps history filters and table scrolling inside the history panel', () => {
    expect(posHistoryContent).toContain('grid grid-cols-2 gap-4 xl:grid-cols-4');
    expect(posHistoryContent).toContain('min-h-0 flex-1 overflow-hidden border-t border-slate-200');
    expect(posHistoryContent).toContain('dgfy-pos-scrollbar-hidden h-full overflow-auto');
    expect(posHistoryContent).toContain('aria-label="POS transaction history table"');
  });

  it('keeps the sidebar locked open with settings navigation available', () => {
    expect(terminalSidebarContent).toContain('dgfy-pos-sidebar-scroll min-h-0 flex-1 overflow-y-auto');
    expect(terminalSidebarContent).toContain('testId="pos-nav-settings"');
    expect(terminalSidebarContent).toContain('my-5 border-t border-slate-200');
    expect(terminalSidebarContent).toContain('Lock Terminal');
    expect(terminalSidebarContent).not.toContain('data-testid="pos-sidebar-session-footer"');
  });
});
