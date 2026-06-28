import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('POS page shell ownership', () => {
  it('preserves the current staging POS and SKUpervisor page owners', () => {
    const posPage = fs.readFileSync(path.resolve(__dirname, '../pages/POSPage.jsx'), 'utf8');
    const skupervisorPage = fs.readFileSync(path.resolve(__dirname, '../pages/SkupervisorPOSPage.jsx'), 'utf8');
    expect(posPage).toContain('POSCheckoutTerminal');
    expect(skupervisorPage).toContain('SkupervisorPOSCheckoutTerminal');
  });
});
