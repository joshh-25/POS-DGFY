import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS cart deletion contract', () => {
  it('keeps quantity-zero updates separate from explicit line removal', () => {
    const cartWorkflow = read('../hooks/usePosCartWorkflow.js');
    const legacyTerminal = read('../components/SkupervisorPOSCheckoutTerminal.jsx');

    expect(cartWorkflow).toContain('if (safeQty <= 0) return line;');
    expect(cartWorkflow).toContain('setCart(nextCart);');
    expect(legacyTerminal).toContain('if (safeQty <= 0) return line;');
    expect(legacyTerminal).toContain('onClick={() => removeCartLine(lineKey)}');
  });
});
