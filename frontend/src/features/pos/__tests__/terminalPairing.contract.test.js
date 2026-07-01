import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS terminal pairing contract', () => {
  it('pairs only after tenant session creation and keeps the token in an HttpOnly backend cookie', () => {
    const terminalPage = read('../pages/TerminalPage.jsx');
    const lockDrawer = read('../components/TerminalLockDrawer.jsx');
    const service = read('../services/posService.js');
    expect(terminalPage.indexOf('await startDgfyPosSession')).toBeLessThan(terminalPage.indexOf('await pairPosTerminal'));
    expect(terminalPage).toContain('await fetchPairedPosTerminal');
    expect(terminalPage).toContain('await clearPairedPosTerminal');
    expect(lockDrawer).toContain('Terminal Password');
    expect(lockDrawer).toContain('separate from the DGFY account password');
    expect(service).toContain("api.post('/pos/terminal/pair'");
    expect(service).not.toContain('localStorage.setItem');
  });
});
