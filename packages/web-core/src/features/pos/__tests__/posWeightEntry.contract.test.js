import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

// Phase 6c: the backend has always been decimal-capable (quantity is
// DECIMAL(24,12)) and the retail `weighed_goods`/`refill_product` presets
// already ship, but every manual POS quantity-entry path was integer-only -
// the typed catalog input stripped the decimal point on every keystroke and
// the commit path re-floored whatever slipped through. Skupervisor had the
// opposite defect: its cart-line quantity field accepted decimals
// unconditionally, including on plain pcs-unit lines. Both are now gated on
// allowsDecimalQuantity(unit_of_measure), which only weight/volume UOMs pass.
describe('POS weight entry (decimal quantity) contract', () => {
    it('DGFY terminal: the typed manual-quantity input and its commit path are decimal-aware', () => {
        const source = [
            read('../components/POSCheckoutTerminal.jsx'),
            read('../components/POSCheckoutTerminalView.jsx'),
        ].join('\n');
        const cartWorkflow = read('../hooks/usePosCartWorkflow.js');

        expect(source).toContain("import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';");
        expect(source).toContain("inputMode={allowsDecimalQuantity(item.unit_of_measure) ? 'decimal' : 'numeric'}");
        expect(source).toContain("pattern={allowsDecimalQuantity(item.unit_of_measure) ? '[0-9]*\\\\.?[0-9]*' : '[0-9]*'}");
        expect(source).toContain('sanitizeQuantityInput(event.target.value, allowsDecimalQuantity(item.unit_of_measure))');
        expect(source).toContain('allowsDecimalQuantity(item.unit_of_measure)');
        expect(cartWorkflow).toContain('Math.max(0, round4(Number(quantityInputValue)) || 0)');
        // The -1/+1 steppers and the long-press meter stay integer-only -
        // manual typed entry is the only decimal-capable path (Open Decision
        // #5: manual entry first, scale hardware later) - see
        // numericStepperPolicy.contract.test.js for the locked step-by-1 contract.
        expect(source).toContain('onClick={() => adjustCartQuantity(item, -1)}');
    });

    it('Skupervisor terminal: the cart-line quantity field only allows a decimal for weight/volume items', () => {
        const source = read('../components/SkupervisorPOSCheckoutTerminal.jsx');

        expect(source).toContain("import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';");
        expect(source).toContain("min={allowsDecimalQuantity(line.unit_of_measure) ? '0.0001' : '1'}");
        expect(source).toContain("step={allowsDecimalQuantity(line.unit_of_measure) ? '0.0001' : '1'}");
        expect(source).toContain('Math.floor(Number(event.target.value) || 0)');
    });

    it('the shared allowsDecimalQuantity predicate lives in shared-constants, not duplicated per app', () => {
        const shared = read('../../../../../../packages/shared-constants/src/uomConverter.js');
        expect(shared).toContain('export const allowsDecimalQuantity');
        expect(shared).toContain("DECIMAL_QUANTITY_UOM_GROUPS = Object.freeze(['weight', 'volume'])");
    });
});
