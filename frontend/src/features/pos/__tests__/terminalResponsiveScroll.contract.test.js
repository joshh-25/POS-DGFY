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

  it('keeps checkout panes shrink-safe and avoids legacy 100vh calc sizing', () => {
    expect(posCheckoutContent).toContain('min-h-0 overflow-hidden');
    expect(posCheckoutContent).toContain('splitPaneScrollClassName');
    expect(posCheckoutContent).not.toContain('calc(100vh-13.5rem)');
  });

  it('pins current-sale terminal actions with sticky footer controls', () => {
    expect(posCheckoutContent).toContain('sticky bottom-0 grid grid-cols-1 gap-2');
    expect(posCheckoutContent).toContain('Checkout');
    expect(posCheckoutContent).toContain('Close Day / Z-Reading');
  });

  it('uses viewport-aware split-pane detection and truthful scroll affordances', () => {
    expect(posCheckoutContent).toContain("window.matchMedia('(min-width: 1536px)')");
    expect(posCheckoutContent).toContain('const hasSplitPaneScroll = isEmbeddedLayout || isAtLeast2xlViewport;');
    expect(posCheckoutContent).toContain("Scroll: Page (Catalog)");
    expect(posCheckoutContent).toContain("Scroll: Page (Current Sale)");
    expect(posCheckoutContent).toContain("Scroll tip: hover or focus inside each pane to scroll it independently.");
  });

  it('keeps catalog/current-sale panes keyboard-scrollable with explicit focus targets', () => {
    expect(posCheckoutContent).toContain('aria-label="POS catalog scroll area"');
    expect(posCheckoutContent).toContain('aria-label="Current sale scroll area"');
    expect(posCheckoutContent).toContain('onKeyDown={handleScrollPaneKeyDown}');
    expect(posCheckoutContent).toContain('onScroll={syncCatalogPaneScrollState}');
    expect(posCheckoutContent).toContain('onScroll={syncCurrentSalePaneScrollState}');
    expect(posCheckoutContent).toContain('handlePaneScrollKeyDown(event)');
    expect(posCheckoutContent).toContain('tabIndex={0}');
  });

  it('renders overflow cues only when pane content is actually scrollable', () => {
    expect(posCheckoutContent).toContain('catalogPaneScrollState.canScroll');
    expect(posCheckoutContent).toContain('currentSalePaneScrollState.canScroll');
    expect(posCheckoutContent).toContain('!catalogPaneScrollState.atTop');
    expect(posCheckoutContent).toContain('!currentSalePaneScrollState.atBottom');
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
