import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPage = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const sidebar = fs.readFileSync(path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx'), 'utf8');

describe('DGFY POS admin navigation bypass', () => {
  it('allows explicit admin navigation while preserving shift-gated checkout and cash actions', () => {
    expect(terminalPage).toContain('Skip for Admin');
    expect(terminalPage).toContain('Checkout and cash mutations remain blocked until a shift is open.');
    expect(terminalPage).toContain("if (!shiftState.shift) return 'Open a shift before checkout.'");
    expect(sidebar).toContain('navigationShiftReady');
    expect(sidebar).toContain('disabled={locked || !canAdjustCashDrawer || !hasActiveShift}');
  });

  it('hides management views from cashier navigation', () => {
    expect(sidebar).toContain("const isCashierRole = normalizedRole === 'cashier'");
    expect(sidebar).toContain('{!isCashierRole && <NavButton');
  });
});
