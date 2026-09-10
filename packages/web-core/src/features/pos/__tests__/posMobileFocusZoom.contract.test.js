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
