import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS text-size layout hardening contracts', () => {
    let checkoutSource = '';
    let sidebarSource = '';
    let historySource = '';
    let appStyles = '';

    beforeAll(() => {
        checkoutSource = [
            readSource('../components/POSCheckoutTerminal.jsx'),
            readSource('../components/POSCheckoutTerminalView.jsx'),
            readSource('../hooks/usePosCatalogWorkflow.js'),
            readSource('../utils/posCatalogWorkflow.js'),
        ].join('\n');
        sidebarSource = readSource('../components/TerminalWorkspaceSidebar.jsx');
        historySource = readSource('../components/POSTransactionHistoryPanel.jsx');
        appStyles = readSource('../../../index.css');
    });

    it('re-measures catalog capacity when the body text preference changes', () => {
        expect(checkoutSource).toContain("import { getPosTextSizeScale } from '../utils/posTextSizePreference.js';");
        expect(checkoutSource).toContain('new window.MutationObserver(scheduleCapacityMeasurement)');
        expect(checkoutSource).toContain("attributeFilter: ['data-pos-text-size']");
        expect(checkoutSource).toContain('const textSizeScale = getPosTextSizeScale(');
        expect(checkoutSource).toContain('Math.round(baseCardHeight * safeTextSizeScale)');
        expect(checkoutSource).toContain('data-catalog-text-scale={catalogGridLayout.textSizeScale}');
    });

    it('allows enlarged sidebar and current-sale labels to wrap', () => {
        expect(sidebarSource).toContain('break-words whitespace-normal text-[12px]');
        expect(sidebarSource).toContain('break-words whitespace-normal line-clamp-2 text-[10.5px]');
        expect(checkoutSource).toContain('block max-w-full line-clamp-2 text-[13px]');
        expect(checkoutSource).toContain('break-words line-clamp-2 text-[10px]');
    });

    it('keeps dialogs and history actions bounded and scrollable at larger text sizes', () => {
        expect(appStyles).toContain('body[data-pos-text-size] [role="dialog"]');
        expect(appStyles).toContain('max-height: calc(100dvh - 1rem);');
        expect(appStyles).toContain('body[data-pos-text-size] [aria-label="POS transaction history table"]');
        expect(appStyles).toContain('body[data-pos-text-size="normal"] [aria-label="POS transaction history table"].dgfy-pos-history-table--single-view');
        expect(appStyles).toContain('.dgfy-pos-history-panel {');
        expect(appStyles).toContain('@container pos-history (max-width: 1320px)');
        expect(appStyles).toContain('@container pos-history (max-width: 1200px)');
        expect(appStyles).toContain('data-pos-sidebar-state');
        expect(appStyles).toContain('overflow-wrap: normal;');
        expect(appStyles).toContain('white-space: nowrap;');
        expect(appStyles).toContain('font-size: 0.6875rem;');
        expect(appStyles).toContain('text-align: left;');
        expect(appStyles).toContain('min-height: max(3rem, calc(3rem * var(--pos-text-size-scale, 1)));');
        expect(historySource).toContain('dgfy-pos-history-table');
    });
});
