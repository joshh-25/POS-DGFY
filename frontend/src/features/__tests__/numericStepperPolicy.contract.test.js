import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '../../..');

const scanFile = (relativePath) => fs.readFileSync(path.resolve(frontendRoot, relativePath), 'utf8');

describe('Numeric step policy contracts', () => {
  it('keeps POS checkout quantity increment/decrement at step-by-1', () => {
    const posCheckout = scanFile('src/features/pos/components/POSCheckoutTerminal.jsx');
    expect(posCheckout).toContain("onClick={() => updateCartQuantity(line.item_id, Number(line.quantity || 0) - 1)}");
    expect(posCheckout).toContain("onClick={() => updateCartQuantity(line.item_id, Number(line.quantity || 0) + 1)}");
    expect(posCheckout).not.toContain('? 0.25 : -0.25');
  });

  it('tracks deliberate precision exceptions outside integer steppers', () => {
    const yieldStep = scanFile('Components/products/wizard/YieldManagementStep.jsx');
    const physicalProps = scanFile('Components/products/wizard/PhysicalPropertiesStep.jsx');

    expect(yieldStep).toContain('Deliberate precision control');
    expect(physicalProps).toContain('Deliberate precision control');
    expect(yieldStep).toContain('step={0.5}');
    expect(physicalProps).toContain('step={0.1}');
    expect(physicalProps).toContain('step={0.001}');
  });
});
