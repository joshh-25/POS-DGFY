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

    beforeAll(() => {
        terminalPageSource = readSource('../pages/TerminalPage.jsx');
        terminalLayoutSource = readSource('../components/TerminalPageLayout.jsx');
        lockDrawerSource = readSource('../components/TerminalLockDrawer.jsx');
        controlSource = readSource('../components/PosTextSizeControl.jsx');
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
        expect(terminalLayoutSource).toContain('desktopLabeled');
        expect(terminalLayoutSource.indexOf('<PosTextSizeControl')).toBeLessThan(
            terminalLayoutSource.indexOf('data-testid="pos-header-park-slot"')
        );
        expect(terminalLayoutSource).toContain(
            'shrink-0 translate-x-2 items-center justify-center rounded-xl text-[#1A4E8D] hover:bg-slate-100 lg:h-10 lg:w-10 lg:translate-x-2.5'
        );
        expect(lockDrawerSource).toContain("import PosTextSizeControl from './PosTextSizeControl.jsx';");
        expect(lockDrawerSource).toContain('id="pos-text-size-lock-drawer"');
        expect(lockDrawerSource.indexOf('<PosTextSizeControl')).toBeLessThan(
            lockDrawerSource.indexOf('<form onSubmit={onSubmit}')
        );
    });

    it('matches neighboring header icon and hit-area sizes responsively', () => {
        expect(controlSource).toContain('h-8 w-8');
        expect(controlSource).toContain('lg:h-10 lg:w-10');
        expect(controlSource).toContain('h-5 w-5 shrink-0 text-[#1A4E8D] lg:h-5 lg:w-5');
        expect(controlSource).toContain('lg:w-[12.5rem]');
        expect(controlSource).toContain('lg:rounded-xl lg:border');
        expect(controlSource).toContain('{selectedLabel}');
        expect(controlSource).toContain('text-[#1A4E8D]');
    });
});
