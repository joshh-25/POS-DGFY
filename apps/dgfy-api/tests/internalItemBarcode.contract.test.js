import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';
import { createItemDraftSchema } from '../src/validators/itemValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryPath = path.resolve(
    __dirname,
    '../src/modules/inventory/repositories/itemRepository.js'
);

describe('internal item barcode contract', () => {
    it('accepts an explicitly classified private barcode without treating it as a manufacturer GTIN', () => {
        const { error, value } = createItemDraftSchema.validate({
            name: 'Green Cross Alcohol',
            internal_barcode: { code: '4800049720016' }
        });

        expect(error).toBeUndefined();
        expect(value.internal_barcode.code).toBe('4800049720016');
    });

    it('keeps manufacturer barcodes subject to GTIN check-digit validation', () => {
        const { error } = createItemDraftSchema.validate({
            name: 'Green Cross Alcohol',
            manufacturer_barcode: { code: '4800049720016' }
        });

        expect(error?.message).toContain('valid GTIN');
    });

    it('accepts a POS-scoped manufacturer GTIN while keeping inventory as the default', () => {
        const posResult = createItemDraftSchema.validate({
            name: 'POS-scanned product',
            manufacturer_barcode: { code: '4006381333931', scope: 'pos' }
        });
        const inventoryResult = createItemDraftSchema.validate({
            name: 'Inventory-scanned product',
            manufacturer_barcode: { code: '4006381333931' }
        });

        expect(posResult.error).toBeUndefined();
        expect(posResult.value.manufacturer_barcode.scope).toBe('pos');
        expect(inventoryResult.error).toBeUndefined();
        expect(inventoryResult.value.manufacturer_barcode.scope).toBe('inventory');
    });

    it('rejects manufacturer barcode scopes outside inventory and POS', () => {
        const { error } = createItemDraftSchema.validate({
            name: 'Invalid barcode scope',
            manufacturer_barcode: { code: '4006381333931', scope: 'storefront_qr' }
        });

        expect(error?.message).toContain('must be one of');
    });

    it('does not allow the same request to classify a barcode as both manufacturer and internal', () => {
        const { error } = createItemDraftSchema.validate({
            name: 'Conflicting Barcode',
            manufacturer_barcode: { code: '4006381333931' },
            internal_barcode: { code: 'PRIVATE-4006381333931' }
        });

        expect(error?.message).toContain('exclusive peers');
    });

    it('persists internal barcodes with tenant-generated POS scope in the item transaction', () => {
        const repositoryContent = fs.readFileSync(repositoryPath, 'utf8');

        expect(repositoryContent).toContain("source: 'tenant_generated'");
        expect(repositoryContent).toContain("scope: 'pos'");
        expect(repositoryContent).toContain("metadata: { attached_via: 'manual_internal_barcode' }");
        expect(repositoryContent).toContain(
            'itemData?.manufacturer_barcode?.code || itemData?.internal_barcode?.code'
        );
    });
});
