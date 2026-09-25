import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webCoreRoot = path.resolve(testDirectory, '../../../..');
const read = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('POS Items modal viewport contract', () => {
  it('keeps the shared modal constraint compatible with Chrome 80', () => {
    const css = read('src/index.css');
    const panelRule = css.slice(css.indexOf('.pos-items-modal-panel {'), css.indexOf('.pos-items-modal-panel--auto'));

    expect(panelRule.indexOf('height: calc(100vh - 1.5rem)')).toBeLessThan(panelRule.indexOf('height: calc(100dvh - 1.5rem)'));
    expect(panelRule.indexOf('max-height: calc(100vh - 1.5rem)')).toBeLessThan(panelRule.indexOf('max-height: calc(100dvh - 1.5rem)'));
    expect(css).toContain('.pos-items-modal-scroll-region');
    expect(css).toContain('overscroll-behavior: contain');
    expect(css).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it.each([
    ['Add/Edit Item', 'src/features/pos/components/TerminalOperationsWorkspace.jsx'],
    ['Create Service', 'src/features/pos/components/PosServiceCatalogCreateModal.jsx'],
    ['Edit Service', 'src/features/pos/components/PosServiceCatalogEditModal.jsx'],
    ['Product scanner', 'src/features/inventory/components/ProductQrScannerModal.jsx']
  ])('applies the bounded panel and internal scrolling to %s', (_surface, relativePath) => {
    const source = read(relativePath);
    expect(source).toContain('pos-items-modal-panel');
    expect(source).toContain('pos-items-modal-scroll-region');
  });

  it('keeps Add and Edit Item actions outside their scrolling bodies', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    expect(source.match(/pos-items-modal-panel/g)).toHaveLength(2);
    expect(source.match(/pos-items-catalog-form-modal/g)).toHaveLength(2);
    expect(source.match(/pos-items-modal-scroll-region/g)).toHaveLength(2);
    expect(source.match(/pos-items-modal-footer(?![-\w])/g)).toHaveLength(2);
  });

  it('keeps Add and Edit footer actions in one shared tablet button row', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    const css = read('src/index.css');

    expect(source.match(/pos-items-modal-footer-actions/g)).toHaveLength(2);
    expect(source).toContain('pos-items-modal-footer-info');
    expect(css).toContain('.pos-items-catalog-form-modal .pos-items-modal-footer {');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('.pos-items-catalog-form-modal .pos-items-modal-footer-actions > :where(button, [role="button"])');
    expect(css).toContain('white-space: nowrap;');
  });

  it('compacts both Add and Edit Item modals in portrait tablet view only', () => {
    const css = read('src/index.css');
    const tabletRuleStart = css.indexOf('/* Add/Edit Item share one compact portrait-tablet modal contract.');
    const desktopRuleStart = css.indexOf('@media (min-width: 1280px)', tabletRuleStart);
    const tabletRule = css.slice(tabletRuleStart, desktopRuleStart);

    expect(tabletRule).toContain('@media (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
    expect(tabletRule).toContain('.pos-items-modal-overlay');
    expect(tabletRule).toContain('padding: 2rem;');
    expect(tabletRule).toContain('.pos-items-catalog-form-modal');
    expect(tabletRule).toContain('max-width: calc(100vw - 4rem);');
    expect(tabletRule).toContain('height: calc(100dvh - 4rem);');
    expect(tabletRule).toContain('max-height: calc(100dvh - 4rem);');
    expect(tabletRule).toContain('padding-inline: 1rem;');
    expect(tabletRule).toContain('height: 2rem !important;');
    expect(tabletRule).toContain('height: 3.25rem;');
    expect(tabletRule).toContain('min-height: 5.5rem;');
  });

  it('optimizes Add and Edit Item modals for landscape tablets without changing PC sizing', () => {
    const css = read('src/index.css');
    const landscapeRuleStart = css.indexOf('/* Landscape tablets have enough width for the desktop form composition');
    const desktopRuleStart = css.indexOf('@media (min-width: 1280px)', landscapeRuleStart);
    const landscapeRule = css.slice(landscapeRuleStart, desktopRuleStart);

    expect(landscapeRule).toContain('@media (orientation: landscape) and (min-width: 1024px) and (max-width: 1279.98px)');
    expect(landscapeRule).toContain('height: calc(100dvh - 2rem);');
    expect(landscapeRule).toContain('grid-template-columns:');
    expect(landscapeRule).toContain('min-height: 7.5rem;');
    expect(landscapeRule).toContain('height: 2.25rem;');
  });

  it('locks background scrolling and closes custom item modals from Escape', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    expect(source).toContain('const releaseScrollLock = acquireModalScrollLock();');
    expect(source).toContain("event.key !== 'Escape'");
    expect(source).toContain("document.addEventListener('keydown', handleKeyDown, true)");
    expect(source).toContain("document.removeEventListener('keydown', handleKeyDown, true)");
  });
});
