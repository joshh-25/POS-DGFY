import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('standalone POS catalog card presentation', () => {
    it('keeps the DGFY surface to name and price with image-aware name placement', () => {
        const source = read('packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx');

        expect(source).toContain('{!hasImage && (');
        expect(source).toContain('data-pos-catalog-card-caption="true"');
        expect(source).toContain('{hasImage && (');
        expect(source).toContain('truncate text-left font-black text-[#0F172A]');
        expect(source).toContain('line-clamp-2 text-[18px] font-black leading-tight');
        expect(source).toContain('font-black text-[#1A4E8D] whitespace-nowrap text-[15px]');
        expect(source).toContain("'max-sm:w-[128px]'");
        expect(source).toContain("{ flex: '0 0 128px', width: '128px' }");
        expect(source).toContain("{ width: '128px', maxWidth: 'none', aspectRatio: 'auto' }");
        expect(source).toContain("{ width: '100%', maxWidth: 'none', height: '100%', aspectRatio: 'auto' }");
        expect(source).toContain('relative flex flex-1 min-w-0 flex-col gap-1 p-1.5 sm:hidden');
        expect(source).toContain('flex min-w-0 flex-col items-start gap-0.5 pr-14');
        expect(source).toContain("'flex min-w-0 min-h-[2.5rem] flex-col items-start justify-center p-1 text-left text-[12px] leading-tight'");
        expect(source).toContain("'flex min-w-0 min-h-[2.5rem] flex-col items-start justify-center p-1 text-left text-[10px] leading-tight'");
        expect(source).toContain("${!hasImage ? 'pt-px pb-1' : ''}");
        expect(source).toContain('absolute bottom-1.5 right-1.5 flex shrink-0 items-center gap-1');
        expect(source).not.toContain("'flex min-w-0 min-h-[2.5rem] items-center justify-center p-1 text-center text-[12px] leading-tight'");
        expect(source).not.toContain("'flex min-w-0 min-h-[2.5rem] items-center justify-center p-1 text-center text-[10px] leading-tight'");
        expect(source).toContain("'flex min-w-0 flex-col items-start gap-0.5 p-1 min-h-[2.5rem] text-[12px] leading-tight'");
        expect(source).toContain("'flex min-w-0 flex-col items-start gap-0 p-1 text-[10px] leading-tight'");
        expect(source).not.toContain("'mt-auto flex min-w-0 flex-col items-start gap-0.5 p-1 text-[12px] leading-tight'");
        expect(source).not.toContain("'mt-auto flex min-w-0 flex-col items-start gap-0 p-1 text-[10px] leading-tight'");
        expect(source).toContain("? `₱${money(item.default_sale_price)}`");
        expect(source).toContain(": 'Not set'");
    });

    it('renders compact status badges over standalone catalog images', () => {
        const source = read('packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx');

        expect(source).toContain('                                                        overlay');
        expect(source).toContain('{!IS_DGFY_POS_SURFACE && (');
    });

    it('keeps standalone desktop cards equal within each content-sized row', () => {
        const viewSource = read('packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx');
        const terminalSource = read('packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx');

        expect(viewSource).toContain('gridAutoRows: `${catalogGridLayout.cardHeight}px`');
        expect(viewSource).not.toContain("? 'max-content'");
        expect(viewSource).toContain("sm:flex sm:min-h-0");
        expect(terminalSource).toContain('sm:grid sm:grid-rows-[minmax(0,1fr)_auto]');
        expect(terminalSource).toContain('group box-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-clip-padding bg-white');
        expect(terminalSource).toContain('flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-md');
    });
});
