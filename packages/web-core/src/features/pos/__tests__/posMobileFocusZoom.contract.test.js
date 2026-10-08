import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '../../../..');
const readSource = (relativePath) => fs.readFileSync(path.resolve(projectRoot, relativePath), 'utf8');

describe('POS mobile focus zoom contracts', () => {
  it('keeps portal-rendered scanner and item controls at the iOS-safe font size', () => {
    const css = readSource('src/index.css');
    const scanner = readSource('src/features/pos/components/POSBarcodeScanner.jsx');
    const skupervisorScanner = readSource('src/features/pos/components/SkupervisorPOSBarcodeScanner.jsx');
    const posItems = readSource('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    const sharedItemModal = readSource('Components/items/ItemFormModal.jsx');

    expect(css).toContain('@supports (-webkit-touch-callout: none)');
    expect(css).toContain('.pos-mobile-no-focus-zoom :is(input, textarea, select)');
    expect(scanner).toContain('pos-mobile-no-focus-zoom fixed inset-0');
    expect(skupervisorScanner).toContain('pos-mobile-no-focus-zoom rounded-2xl');
    expect(posItems.match(/pos-mobile-no-focus-zoom fixed inset-0/g)).toHaveLength(2);
    expect(sharedItemModal).toContain('pos-mobile-no-focus-zoom wizard-modal-shell');
  });

  it('disables browser double-tap zoom across the POS surface without disabling pinch zoom', () => {
    const css = readSource('src/index.css');
    const posEntry = readSource('../../apps/dgfy-pos/src/main.jsx');
    const posHtml = readSource('../../apps/dgfy-pos/index.html');

    expect(css).toContain('body[data-pos-surface="pos"] {\n  touch-action: manipulation;\n}');
    expect(css).toMatch(/}\s*\/\* Keep browser double-tap zoom[\s\S]*?\*\/\s*body\[data-pos-surface="pos"\] \{\s*touch-action: manipulation;\s*\}/);
    expect(posEntry).toContain("document.body.setAttribute('data-pos-surface', 'pos');");
    expect(posHtml).not.toMatch(/user-scalable\s*=\s*["']no["']/i);
    expect(posHtml).not.toMatch(/maximum-scale\s*=\s*["']1(?:\.0)?["']/i);
  });

  it('keeps the final mobile field guard scoped to the POS Items workspace', () => {
    const css = readSource('src/index.css');
    const finalGuardStart = css.lastIndexOf('Mobile browsers may zoom the page');
    const finalGuard = css.slice(finalGuardStart);

    expect(finalGuardStart).toBeGreaterThan(-1);
    expect(finalGuard).toContain('@media screen and (max-width: 767.98px)');
    expect(finalGuard).toContain('.dgfy-pos-shell[data-pos-items-view="true"] :is(');
    expect(finalGuard).toContain('.pos-items-modal-overlay :is(');
    expect(finalGuard).toContain('input:not([type="checkbox"]):not([type="radio"]):not([type="file"])');
    expect(finalGuard).toContain('[contenteditable="true"]');
    expect(finalGuard).toContain('font-size: 16px !important;');
    expect(finalGuard).not.toContain('body[data-pos-surface="pos"]');
    expect(finalGuard).not.toContain('.pos-mobile-no-focus-zoom :is(');
  });
  it('blurs an active scanner editor before closing the scan modal', () => {
    const scanner = readSource('src/features/pos/components/POSBarcodeScanner.jsx');

    expect(scanner).toContain("activeElement?.matches?.('input, textarea, select, [contenteditable=\"true\"]')");
    expect(scanner).toContain('activeElement.blur();');
  });

  it('keeps barcode dialog actions in one compact row', () => {
    const scanner = readSource('src/features/pos/components/POSBarcodeScanner.jsx');

    expect(scanner).toContain('mt-5 grid grid-cols-2 gap-2');
    expect(scanner).toContain('className="h-10 w-full rounded-lg"');
    expect(scanner).toContain('className="h-10 w-full rounded-lg bg-[#1A4E8D]');
    expect(scanner).not.toContain('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end');
  });
});
