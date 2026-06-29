import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const posCheckoutPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');

describe('POS terminal responsive scroll contracts', () => {
  let terminalLayoutContent = '';
  let posCheckoutContent = '';

  beforeAll(() => {
    terminalLayoutContent = fs.readFileSync(terminalLayoutPath, 'utf8');
    posCheckoutContent = fs.readFileSync(posCheckoutPath, 'utf8');
  });

  it('keeps terminal shell viewport-safe and avoids hard xl screen lock', () => {
    expect(terminalLayoutContent).toContain('min-h-[100dvh]');
    expect(terminalLayoutContent).not.toContain('xl:h-screen');
  });

  it('lets checkout cards expand naturally and avoids legacy 100vh calc sizing', () => {
    expect(posCheckoutContent).toContain("const shellClassName = 'space-y-5';");
    expect(posCheckoutContent).toContain("const checkoutGridClassName = 'grid grid-cols-1 gap-4 2xl:grid-cols-12 2xl:gap-6';");
    expect(posCheckoutContent).toContain("const checkoutPaneClassName = '2xl:min-h-[32rem] 2xl:max-h-none';");
    expect(posCheckoutContent).not.toContain('overflow-y-auto');
    expect(posCheckoutContent).not.toContain('min-h-0 overflow-hidden');
    expect(posCheckoutContent).not.toContain('splitPaneScrollClassName');
    expect(posCheckoutContent).not.toContain('calc(100vh-13.5rem)');
  });

  it('spans checkout catalog and current-sale panes across the 2xl grid instead of compressing into single columns', () => {
    expect(posCheckoutContent).toContain('2xl:col-span-8');
    expect(posCheckoutContent).toContain('2xl:col-span-4');
    expect(posCheckoutContent).toContain('min-w-0 rounded-xl border border-slate-200 bg-white');
    expect(posCheckoutContent).toContain('min-w-0 space-y-4 2xl:col-span-4');
  });

  it('pins current-sale terminal actions with sticky footer controls', () => {
    expect(posCheckoutContent).toContain('sticky bottom-0 z-20 grid grid-cols-1 gap-2');
    expect(posCheckoutContent).toContain('Checkout');
    expect(posCheckoutContent).toContain('Close Day / Z-Reading');
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

  it('keeps catalog/current-sale content exposed as non-scroll regions', () => {
    expect(posCheckoutContent).toContain('aria-label="POS catalog contents"');
    expect(posCheckoutContent).toContain('aria-label="Current sale contents"');
    expect(posCheckoutContent).not.toContain('onKeyDown={handleScrollPaneKeyDown}');
    expect(posCheckoutContent).not.toContain('onScroll={syncCatalogPaneScrollState}');
    expect(posCheckoutContent).not.toContain('onScroll={syncCurrentSalePaneScrollState}');
    expect(posCheckoutContent).not.toContain('handlePaneScrollKeyDown(event)');
    expect(posCheckoutContent).not.toContain('tabIndex={0}');
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

  it('keeps workspace container scroll fallback enabled in checkout mode', () => {
    expect(terminalLayoutContent).toContain('xl:overflow-y-auto xl:overscroll-contain');
    expect(terminalLayoutContent).not.toContain("isCheckoutWorkspaceMode ? 'xl:overflow-hidden'");
  });
});
