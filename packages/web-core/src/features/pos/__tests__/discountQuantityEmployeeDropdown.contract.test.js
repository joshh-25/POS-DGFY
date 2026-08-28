import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const checkoutView = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
    'utf8'
);

describe('discount quantity and employee dropdown UI contracts', () => {
    it('restricts discount quantities to positive whole numbers', () => {
        expect(checkoutView).toContain('inputMode="numeric"');
        expect(checkoutView).toContain('min="1"');
        expect(checkoutView).toContain('step="1"');
        expect(checkoutView).toContain('Math.min(Math.max(1, Math.floor(requestedSelectedQuantity)), cartQuantity)');
        expect(checkoutView).toContain('const [discountQuantityInput, setDiscountQuantityInput] = React.useState(null);');
        expect(checkoutView).toContain("setDiscountQuantityInput({ lineRef, value: '' });");
        expect(checkoutView).toContain('Number.isInteger(requestedQuantity) && requestedQuantity > 0');
        expect(checkoutView).toContain("['.', ',', 'e', 'E', '+', '-'].includes(event.key)");
        expect(checkoutView).not.toContain('min="0.001"');
        expect(checkoutView).not.toContain('step="0.001"');
    });

    it('keeps employee options name-only and the select within its field', () => {
        expect(checkoutView).toContain('max-w-full truncate appearance-none');
        expect(checkoutView).toContain('{employee.full_name}');
        expect(checkoutView).not.toContain('{employee.full_name} ({employee.employee_code} · {employee.location_name})');
    });
});
