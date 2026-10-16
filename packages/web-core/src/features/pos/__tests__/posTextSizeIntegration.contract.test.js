import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS text-size integration contracts', () => {
    let terminalPageSource = '';
    let terminalLayoutSource = '';
    let lockDrawerSource = '';
    let controlSource = '';
    let appStylesSource = '';

    beforeAll(() => {
        terminalPageSource = readSource('../pages/TerminalPage.jsx');
        terminalLayoutSource = readSource('../components/TerminalPageLayout.jsx');
        lockDrawerSource = readSource('../components/TerminalLockDrawer.jsx');
        controlSource = readSource('../components/PosTextSizeControl.jsx');
        appStylesSource = readSource('../../../index.css');
    });

    it('hydrates and applies the device preference at the shared POS page boundary', () => {
        expect(terminalPageSource).toContain("from '../utils/posTextSizePreference.js'");
        expect(terminalPageSource).toContain('readPosTextSizePreference()');
        expect(terminalPageSource).toContain('writePosTextSizePreference(value)');
        expect(terminalPageSource).toContain("data-pos-text-size");
        expect(terminalPageSource).toContain('posTextSize={posTextSize}');
        expect(terminalPageSource).toContain('onPosTextSizeChange={handlePosTextSizeChange}');
    });

    it('renders controls in both unlocked header and lock drawer surfaces', () => {
        expect(terminalLayoutSource).toContain("import PosTextSizeControl from './PosTextSizeControl.jsx';");
        expect(terminalLayoutSource).toContain('id="pos-text-size-header"');
        expect(terminalLayoutSource).toContain('onPosTextSizeChange={onPosTextSizeChange}');
        expect(terminalLayoutSource).not.toContain('desktopLabeled');
        expect(terminalLayoutSource).toContain('dgfy-pos-header-page-title-group');
        expect(terminalLayoutSource).toContain('data-testid="pos-desktop-terminal-indicator"');
        expect(terminalLayoutSource).toContain("className={posViewMode === 'checkout'");
        expect(terminalLayoutSource).toContain(": 'hidden'}");
        expect(terminalLayoutSource.indexOf('<PosTextSizeControl')).toBeLessThan(
            terminalLayoutSource.indexOf('data-testid="pos-header-park-slot"')
        );
        expect(terminalLayoutSource).toContain(
            'shrink-0 translate-x-2 items-center justify-center rounded-xl text-[#1A4E8D] hover:bg-slate-100 lg:h-10 lg:w-10 lg:translate-x-2.5'
        );
        expect(lockDrawerSource).toContain("import PosTextSizeControl from './PosTextSizeControl.jsx';");
        expect(lockDrawerSource).toContain('id="pos-text-size-lock-drawer"');
        expect(lockDrawerSource.indexOf('<PosTextSizeControl')).toBeLessThan(
            lockDrawerSource.indexOf('<form onSubmit={handleFormSubmit}')
        );
    });

    it('matches neighboring header icon and hit-area sizes responsively', () => {
        expect(controlSource).toContain('h-10 w-10');
        expect(controlSource).toContain('h-5 w-5 shrink-0 text-[#1A4E8D] lg:h-5 lg:w-5');
        expect(controlSource).toContain('valueClassName="hidden"');
        expect(controlSource).toContain('chevronClassName="hidden"');
        expect(controlSource).toContain('ariaLabel={`POS text size: ${selectedLabel}`}');
        expect(controlSource).toContain('title={`Text size: ${selectedLabel}`}');
        expect(controlSource).not.toContain('desktopLabeled');
        expect(controlSource).toContain('text-[#1A4E8D]');
        expect(appStylesSource).not.toMatch(/\.pos-text-size-control__trigger\s*\{[^}]*\bwidth\s*:/s);
    });

    it('keeps the desktop terminal status beside the title at the POS desktop breakpoint', () => {
        expect(terminalLayoutSource.indexOf('dgfy-pos-header-page-title-group')).toBeLessThan(
            terminalLayoutSource.indexOf('dgfy-pos-header-terminal-row')
        );
        expect(terminalLayoutSource).toContain('role="status"');
        expect(appStylesSource).toContain('@media screen and (min-width: 1024px)');
        expect(appStylesSource).toContain('.dgfy-pos-topbar .dgfy-pos-header-page-title-group');
        expect(appStylesSource).toContain('.dgfy-pos-topbar .dgfy-pos-header-terminal-row');
    });
});
