import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS text-size layout hardening contracts', () => {
    let checkoutSource = '';
    let currentSaleActionsSource = '';
    let itemsSource = '';
    let layoutSource = '';
    let textSizeControlSource = '';
    let dropdownSource = '';
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
        currentSaleActionsSource = readSource('../components/PosCurrentSaleActions.jsx');
        itemsSource = readSource('../components/TerminalOperationsWorkspace.jsx');
        layoutSource = readSource('../components/TerminalPageLayout.jsx');
        textSizeControlSource = readSource('../components/PosTextSizeControl.jsx');
        dropdownSource = readSource('../components/PosDropdownSelect.jsx');
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

    it('keeps Sell action labels readable at every POS text size', () => {
        expect(currentSaleActionsSource).toContain(
            "const actionLabelClassName = 'w-full min-w-0 break-words text-center text-[11px] font-extrabold leading-[1.15] line-clamp-2 sm:text-xs';"
        );
        expect(currentSaleActionsSource).toContain('flex h-auto min-h-[46px] w-full min-w-0 flex-col items-center justify-center');
        expect(currentSaleActionsSource).not.toContain('whitespace-nowrap text-center text-[10px]');
        expect(appStyles).toContain('height: max(3.5rem, calc(3.5rem * var(--pos-text-size-scale, 1)));');
        expect(appStyles).toContain('min-height: max(3.5rem, calc(3.5rem * var(--pos-text-size-scale, 1)));');
        expect(appStyles).toContain('max-height: max(3.5rem, calc(3.5rem * var(--pos-text-size-scale, 1)));');
        expect(appStyles).toContain('body[data-pos-text-size="normal"] .dgfy-pos-current-sale-actions > button');
        expect(appStyles).toContain('padding: 0.25rem;');
        expect(appStyles).toContain('line-height: 0.875rem;');
        expect(appStyles).toContain('screen and (orientation: landscape) and (min-width: 1024px) and (max-width: 1279.98px)');
        expect(appStyles).toContain('white-space: normal;');
        expect(appStyles).toContain('line-height: calc(0.875rem * var(--pos-text-size-scale, 1));');
        expect(appStyles).toContain('font-size: calc(0.6875rem * var(--pos-text-size-scale, 1));');
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

    it('keeps the Items catalog readable when text size grows', () => {
        expect(itemsSource).toContain('pos-items-desktop-toolbar');
        expect(itemsSource).toContain('pos-items-desktop-actions');
        expect(itemsSource).toContain('pos-items-desktop-card-grid');
        expect(appStyles).toContain('body[data-pos-text-size="large"] .dgfy-pos-items-catalog-results');
        expect(appStyles).toContain('grid-auto-rows: minmax(8rem, auto);');
        expect(appStyles).toContain('body[data-pos-text-size="extra-large"] .dgfy-pos-items-catalog-results');
        expect(appStyles).toContain('grid-auto-rows: minmax(9rem, auto);');
        expect(appStyles).toContain('grid-template-rows: auto auto;');
        expect(appStyles).toContain('grid-column: 1 / -1;');
        expect(appStyles).toContain('grid-template-columns: minmax(0, 1fr) minmax(8rem, 10rem);');
        expect(appStyles).toContain('grid-auto-rows: minmax(14rem, auto);');
        expect(appStyles).toContain('align-self: stretch;');
        expect(appStyles).toContain('aspect-ratio: auto;');
        expect(appStyles).toContain('touch-action: pan-x;');
        expect(appStyles).toContain('width: max-content;');
        expect(textSizeControlSource).toContain('optionClassName="pos-text-size-control__option"');
        expect(dropdownSource).toContain("const DEFAULT_OPTION_CLASS_NAME = 'flex w-full items-center justify-between");
        expect(appStyles).toContain('.pos-text-size-control__option:not([aria-selected="true"]):hover');
        expect(appStyles).toContain('body[data-pos-text-size="large"] .pos-items-desktop-toolbar');
        expect(appStyles).toContain('flex-wrap: nowrap;');
        expect(appStyles).toContain('overflow-wrap: anywhere;');
        expect(appStyles).toContain('@media screen and (orientation: landscape) and (min-width: 1024px) and (max-width: 1279.98px)');
        expect(appStyles).toContain('grid-auto-rows: minmax(14rem, auto);');
        expect(appStyles).toContain('grid-auto-rows: minmax(16rem, auto);');
        expect(appStyles).toContain('padding: 0.5rem !important;');
        expect(appStyles).toContain('border-radius: 0.5rem;');
        expect(appStyles).toContain('overflow: visible;');
        expect(appStyles).toContain('height: 100% !important;');
        expect(appStyles).toContain('body[data-pos-text-size="normal"] .dgfy-pos-shell[data-pos-items-view="true"] .dgfy-pos-items-catalog-results');
        expect(appStyles).toContain('grid-auto-rows: minmax(12rem, auto);');
        expect(appStyles).toContain('min-height: 12rem;');
        expect(appStyles).toContain('grid-template-rows: minmax(0, auto) minmax(4.25rem, auto);');
        expect(textSizeControlSource).toContain('pos-text-size-control relative');
        expect(appStyles).toContain('.pos-items-catalog-workspace .pos-categories-mobile-card-actions button');
        expect(appStyles).toContain('aspect-ratio: 1 / 1;');
        expect(appStyles).toContain('width: 2.25rem !important;');
        expect(appStyles).toContain('width: 2.5rem !important;');
    });

    it('keeps the original presentation for normal desktop Items', () => {
        expect(appStyles).toContain('@media screen and (min-width: 1280px) and (hover: hover) and (pointer: fine)');
        expect(appStyles).toContain('body[data-pos-text-size="normal"] .dgfy-pos-shell[data-pos-items-view="true"] .pos-items-mobile-card-metrics > div > div');
        expect(appStyles).toContain('display: block;');
        expect(appStyles).toContain('grid-auto-rows: max-content;');
        expect(appStyles).toContain('scrollbar-color: transparent transparent;');
    });
});
