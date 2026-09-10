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
    expect(source.match(/pos-items-modal-scroll-region/g)).toHaveLength(2);
    expect(source.match(/pos-items-modal-footer/g)).toHaveLength(2);
  });

  it('locks background scrolling and closes custom item modals from Escape', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    expect(source).toContain('const releaseScrollLock = acquireModalScrollLock();');
    expect(source).toContain("event.key !== 'Escape'");
    expect(source).toContain("document.addEventListener('keydown', handleKeyDown, true)");
    expect(source).toContain("document.removeEventListener('keydown', handleKeyDown, true)");
  });
});
