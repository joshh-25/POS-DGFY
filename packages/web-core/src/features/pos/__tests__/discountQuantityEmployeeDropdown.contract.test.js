import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const discountWorkspace = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSDiscountWorkspace.jsx'),
    'utf8'
);

describe('discount quantity and employee dropdown UI contracts', () => {
    it('restricts discount quantities to positive whole numbers', () => {
        expect(discountWorkspace).toContain('inputMode="numeric"');
        expect(discountWorkspace).toContain('min="1"');
        expect(discountWorkspace).toContain('step="1"');
        expect(discountWorkspace).toContain('Math.min(Math.max(1, Math.floor(requestedSelectedQuantity)), primaryAvailableQuantity)');
        expect(discountWorkspace).toContain('const [discountQuantityInput, setDiscountQuantityInput] = React.useState(null);');
        expect(discountWorkspace).toContain("setDiscountQuantityInput({ lineRef, value: '' });");
        expect(discountWorkspace).toContain('Number.isInteger(requestedQuantity) && requestedQuantity > 0');
        expect(discountWorkspace).toContain("['.', ',', 'e', 'E', '+', '-'].includes(event.key)");
        expect(discountWorkspace).toContain('disabled={cartQuantity === 0}');
        expect(discountWorkspace).toContain("'No whole units'");
        expect(discountWorkspace).not.toContain('min="0.001"');
        expect(discountWorkspace).not.toContain('step="0.001"');
    });

    it('keeps employee options name-only and the select within its field', () => {
        expect(discountWorkspace).toContain('max-w-full truncate appearance-none');
        expect(discountWorkspace).toContain('{employee.full_name}');
        expect(discountWorkspace).not.toContain('{employee.full_name} ({employee.employee_code} · {employee.location_name})');
    });
});
