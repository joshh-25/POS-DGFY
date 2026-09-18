import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('POS text-size CSS compatibility contract', () => {
    let cssSource = '';

    beforeAll(() => {
        cssSource = fs.readFileSync(path.resolve(__dirname, '../../../index.css'), 'utf8');
    });

    it('keeps scaling body-scoped and preserves rem-based POS geometry', () => {
        expect(cssSource).toContain('body[data-pos-text-size="large"]');
        expect(cssSource).toContain('--pos-text-size-scale: 1.15;');
        expect(cssSource).toContain('--pos-text-size-scale: 1.3;');
        expect(cssSource).toContain('@media screen');
        expect(cssSource).toContain('font-size: calc(1rem * var(--pos-text-size-scale));');
        expect(cssSource).not.toContain('html[data-pos-text-size]');
    });

    it('maps standard and existing arbitrary POS text utilities', () => {
        expect(cssSource).toContain(':where(.text-xs, [class*="text-xs"])');
        expect(cssSource).toContain(':where(.text-sm, [class*="text-sm"])');
        expect(cssSource).toContain(':where(.text-2xl, [class*="text-2xl"])');
        expect(cssSource).toContain(':where([class*="text-[10px]"])');
        expect(cssSource).toContain(':where([class*="text-[13.5px]"])');
        expect(cssSource).toContain(':where([class*="text-[16px]"])');
        expect(cssSource).toContain(':where([class*="text-[26px]"])');
    });

    it('retains the POS mobile input zoom guard and print reset', () => {
        expect(cssSource).toContain('.dgfy-pos-shell :is(input, textarea, select)');
        expect(cssSource).toContain('body[data-pos-surface="pos"] :is(input, textarea, select)');
        expect(cssSource).toContain('@media (max-width: 767.98px)');
        expect(cssSource).toContain('font-size: 16px !important;');
        expect(cssSource).toContain('@media print');
        expect(cssSource).toContain('--pos-text-size-scale: 1;');
    });

    it('does not retain text-size hover styling after touch taps', () => {
        expect(cssSource).toContain('@media (max-width: 1023.98px), (hover: none), (pointer: coarse)');
        expect(cssSource).toContain('.pos-text-size-control__trigger:hover');
        expect(cssSource).toContain('.pos-text-size-control__option:not([aria-selected="true"]):hover');
        expect(cssSource).toContain('-webkit-tap-highlight-color: transparent;');
    });

    it('uses a restrained global elevation and focus-shadow system', () => {
        expect(cssSource).toContain('--pos-shell-shadow: 0 1px 4px');
        expect(cssSource).toContain('--pos-surface-shadow: 0 2px 8px');
        expect(cssSource).toContain('--pos-elevated-shadow: 0 4px 12px');
        expect(cssSource).toContain('--pos-overlay-shadow: 0 10px 24px');
        expect(cssSource).toContain('--pos-control-focus-shadow: inset 0 0 0 1px');
        expect(cssSource).toContain('[class~="shadow-sm"]');
        expect(cssSource).toContain('[class*="shadow-["]');
        expect(cssSource).toContain(':where(input, textarea, select):focus');
        expect(cssSource).toContain(':where(button, [role="button"], a, summary):focus-visible');
    });

  it('uses Inter as the POS primary font with Roboto as the fallback', () => {
        expect(cssSource).toContain("--pos-font-family: 'Inter', 'Roboto', system-ui, sans-serif;");
        expect(cssSource).toContain("body[data-pos-surface=\"pos\"],\nbody[data-pos-text-size] {\n  font-family: 'Inter', 'Roboto', system-ui, sans-serif;\n}");
    expect(cssSource).toContain("body[data-pos-surface=\"pos\"] [data-sonner-toaster]");
  });

  it('uses a white background for the POS shell', () => {
    expect(cssSource).toContain('--pos-shell-bg: #ffffff;');
  });

  it('uses role-based POS letter spacing without changing print typography', () => {
        expect(cssSource).toContain('letter-spacing: 0;');
        expect(cssSource).toContain('letter-spacing: 0.03em;');
        expect(cssSource).toContain('letter-spacing: 0.06em;');
        expect(cssSource).toContain('letter-spacing: 0.02em;');
        expect(cssSource).toContain('line-height: 1.45;');
        expect(cssSource).toContain('.dgfy-pos-shell .tracking-tight');
        expect(cssSource).toContain('letter-spacing: -0.01em;');
        expect(cssSource).toContain('@media print');
    });
});
