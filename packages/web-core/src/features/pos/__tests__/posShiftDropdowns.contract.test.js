import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const terminalWorkspaceSource = readSource('../components/TerminalOperationsWorkspace.jsx');
const cashierHistorySource = readSource('../components/CashierHistoryPanel.jsx');
const branchTerminalsSource = readSource('../components/AdminOpenShiftOverview.jsx');
const cashDrawerEventSource = readSource('../components/CashDrawerEventForm.jsx');
const textSizeSource = readSource('../components/PosTextSizeControl.jsx');
const posStylesSource = readSource('../../../index.css');

const countSharedDropdowns = (source) => (source.match(/<PosDropdownSelect\b/g) || []).length;
const stripLineComments = (source) => source.replace(/^\s*\/\/.*$/gm, '');

describe('POS Shift dropdown consistency contract', () => {
    it('uses the shared dropdown for every Shift-owned select control', () => {
        expect(countSharedDropdowns(terminalWorkspaceSource)).toBe(5);
        expect(countSharedDropdowns(cashierHistorySource)).toBe(1);
        expect(countSharedDropdowns(branchTerminalsSource)).toBe(1);
        expect(countSharedDropdowns(cashDrawerEventSource)).toBe(1);
        expect(stripLineComments(terminalWorkspaceSource)).not.toMatch(/<select(?:\s|>)/);
        expect(stripLineComments(cashierHistorySource)).not.toMatch(/<select(?:\s|>)/);
        expect(stripLineComments(branchTerminalsSource)).not.toMatch(/<select(?:\s|>)/);
        expect(stripLineComments(cashDrawerEventSource)).not.toMatch(/<select(?:\s|>)/);
    });

    it('shares the menu primitive with text sizing and the cashier-history page-size filter', () => {
        expect(textSizeSource).toContain("import PosDropdownSelect from './PosDropdownSelect.jsx';");
        expect(cashierHistorySource).toContain('renderPageSizeDropdown={renderCashierHistoryPageSizeDropdown}');
    });

    it('keeps the title left and groups the Branch filter with search on the right', () => {
        expect(branchTerminalsSource).toContain('className="flex flex-col gap-4 xl:flex-row xl:items-center"');
        expect(branchTerminalsSource).toContain('className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center xl:ml-auto"');
        expect(branchTerminalsSource).toContain('className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-600"');
        expect(branchTerminalsSource).toContain('className="w-36 max-w-full shrink-0 sm:w-52"');
        expect(branchTerminalsSource.indexOf('id="pos-admin-branch-terminals-location"'))
            .toBeLessThan(branchTerminalsSource.indexOf('placeholder="Search terminal name or ID..."'));
        expect(branchTerminalsSource.indexOf('placeholder="Search terminal name or ID..."'))
            .toBeLessThan(branchTerminalsSource.indexOf('label="Refresh branch terminals"'));
        expect(branchTerminalsSource).toContain('dataTestId="pos-admin-shift-location-refresh"');
    });

    it('sets the Terminals heading to 16px on tablet and desktop while preserving narrow-phone sizing', () => {
        expect(branchTerminalsSource).toContain(
            'className="pos-terminal-section-heading text-base font-black leading-5 tracking-tight text-[#0B1647]"'
        );
        expect(posStylesSource).toContain('@media screen and (min-width: 640px)');
        expect(posStylesSource).toContain('.dgfy-pos-shell .pos-terminal-section-heading {');
        expect(posStylesSource).toContain('font-size: calc(1rem * var(--pos-text-size-scale, 1));');
    });

    it('allows popup menus to extend vertically without allowing horizontal overflow', () => {
        expect(terminalWorkspaceSource).toContain("'overflow-x-clip overflow-y-visible'");
    });
});
