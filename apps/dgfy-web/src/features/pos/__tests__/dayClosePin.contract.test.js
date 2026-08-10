import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(process.cwd(), relativePath),
  'utf8'
);

describe('POS Day Close PIN contract', () => {
  it('requires a personal Day Close PIN before the terminal submits close day', () => {
    const terminalPageSource = readSource('src/features/pos/pages/TerminalPage.jsx');
    const posServiceSource = readSource('src/features/pos/services/posService.js');

    expect(terminalPageSource).toContain('Your POS Day Close PIN');
    expect(terminalPageSource).toContain('closePosDay(null, { dayClosePin: zReadingClosePin })');
    expect(posServiceSource).toContain('day_close_pin: dayClosePin');
  });

  it('lets the Master Admin configure separate cashier Day Close PINs', () => {
    const workspaceSource = readSource('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    const userServiceSource = readSource('src/services/userService.js');

    expect(workspaceSource).toContain('POS Day Close PINs');
    expect(workspaceSource).toContain('updatePosDayClosePin(dayClosePinUser.user_id');
    expect(userServiceSource).toContain('/pos-day-close-pin');
  });
});
