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
        expect(cssSource).toContain(':where([class*="text-[26px]"])');
    });

    it('retains the POS mobile input zoom guard and print reset', () => {
        expect(cssSource).toContain('.dgfy-pos-shell :is(input, textarea, select)');
        expect(cssSource).toContain('font-size: 16px !important;');
        expect(cssSource).toContain('@media print');
        expect(cssSource).toContain('--pos-text-size-scale: 1;');
    });
});
