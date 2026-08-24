import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readSource = (relativePath) => fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos', relativePath),
  'utf8'
);

describe('POS shift-close parked-sale handoff contract', () => {
  it('only presents claimed carts as blockers with actionable copy', () => {
    const dialogSource = readSource('components/TerminalPageDialogLayer.jsx');
    const pageSource = readSource('pages/TerminalPage.jsx');

    expect(dialogSource).toContain('closeShiftBlocker.claimedParkedSaleCount');
    expect(dialogSource).toContain('claimed parked sale');
    expect(dialogSource).not.toContain('active parked sale');
    expect(pageSource).toContain('resolutionState.claimedParkedSaleCount');
    expect(pageSource).toContain('Resolve claimed parked sales');
  });
});
