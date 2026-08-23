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

    beforeAll(() => {
        terminalPageSource = readSource('../pages/TerminalPage.jsx');
        terminalLayoutSource = readSource('../components/TerminalPageLayout.jsx');
        lockDrawerSource = readSource('../components/TerminalLockDrawer.jsx');
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
        expect(lockDrawerSource).toContain("import PosTextSizeControl from './PosTextSizeControl.jsx';");
        expect(lockDrawerSource).toContain('id="pos-text-size-lock-drawer"');
        expect(lockDrawerSource.indexOf('<PosTextSizeControl')).toBeLessThan(
            lockDrawerSource.indexOf('<form onSubmit={onSubmit}')
        );
    });
});
