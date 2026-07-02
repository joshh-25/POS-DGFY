import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('POS Always Available contract', () => {
  it('does not show or enforce out-of-stock state for a POS-only Always Available item', () => {
    const checkout = fs.readFileSync(path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx'), 'utf8');
    const skupervisorCheckout = fs.readFileSync(path.resolve(__dirname, '../components/SkupervisorPOSCheckoutTerminal.jsx'), 'utf8');
    expect(checkout).toContain("item?.pos_always_available === true");
    expect(checkout).toContain("isAlwaysAvailable ? 'Always available'");
    expect(skupervisorCheckout).toContain("isAlwaysAvailable ? 'Always available'");
  });
});
