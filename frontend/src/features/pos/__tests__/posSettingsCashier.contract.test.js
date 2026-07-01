import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('POS cashier identity contract', () => {
  it('keeps DGFY membership first and rejects local-cashier setup adoption', () => {
    const terminalPage = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
    const lockDrawer = fs.readFileSync(path.resolve(__dirname, '../components/TerminalLockDrawer.jsx'), 'utf8');
    expect(lockDrawer).toContain('accepted DGFY memberships');
    expect(terminalPage).toContain('await startDgfyPosSession');
    expect(terminalPage).not.toContain('createLocalCashier');
    expect(terminalPage).not.toContain('/setup/cashiers');
  });
});
