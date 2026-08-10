import { describe, expect, it } from '@jest/globals';
import {
    detectBarcodeSymbology,
    generateInternalBarcodeValue,
    hasValidGtinCheckDigit,
    normalizeBarcodeValue,
    normalizeGtin,
    normalizeBarcodeMultiplier,
    parseBarcodeStructuredPayload
} from '../src/modules/shared/utils/barcodePolicy.js';

describe('barcodePolicy', () => {
    it('normalizes keyboard-wedge input while preserving tenant-local identity semantics', () => {
        expect(normalizeBarcodeValue('  012345678905  ')).toBe('012345678905');
        expect(detectBarcodeSymbology('012345678905')).toBe('upc_a');
        expect(detectBarcodeSymbology('4006381333931')).toBe('ean13');
    });

    it('extracts barcode codes from public QR URLs and JSON payloads', () => {
    expect(normalizeBarcodeValue('https://store.example.com/demo-store/qr/ims-demo-0001')).toBe('IMS-DEMO-0001');
    expect(normalizeBarcodeValue('https://store.example.com/demo-store?bc=case-24')).toBe('CASE-24');
    expect(normalizeBarcodeValue(JSON.stringify({ type: 'storefront_qr', code: 'svc-100' }))).toBe('SVC-100');
    expect(normalizeBarcodeValue(JSON.stringify({ type: 'service_booking', reference: 'SB-123' }))).toBe('SERVICE_BOOKING:SB-123');
  });

    it('parses direct service booking ticket payloads for non-cart scan routing', () => {
        expect(parseBarcodeStructuredPayload('SERVICE_BOOKING:SB-123')).toEqual(expect.objectContaining({
            type: 'service_booking',
            reference: 'SB-123'
        }));
        expect(normalizeBarcodeValue('SERVICE_BOOKING:SB-123')).toBe('SERVICE_BOOKING:SB-123');
        expect(detectBarcodeSymbology('SERVICE_BOOKING:SB-123')).toBe('qr');
    });

    it('generates internal codes without pretending to be UPC/EAN/GTIN allocations', () => {
        const generated = generateInternalBarcodeValue({
            tenantToken: 'Demo Tenant!',
            itemId: 42,
            scope: 'pos'
        });

        expect(generated).toMatch(/^IMS-DEMOTENA-POS-000042-[A-F0-9]{8}$/);
        expect(detectBarcodeSymbology(generated)).toBe('code128');
    });

    it('normalizes invalid package multipliers back to a safe unit quantity', () => {
        expect(normalizeBarcodeMultiplier('24')).toBe(24);
        expect(normalizeBarcodeMultiplier('-1')).toBe(1);
        expect(normalizeBarcodeMultiplier('bad')).toBe(1);
    });

    it('validates UPC, EAN, and GTIN check digits before external lookup', () => {
        expect(normalizeGtin(' 4006-3813-3393-1 ')).toBe('4006381333931');
        expect(hasValidGtinCheckDigit('012345678905')).toBe(true);
        expect(hasValidGtinCheckDigit('4006381333931')).toBe(true);
        expect(hasValidGtinCheckDigit('3017620422003')).toBe(true);
        expect(hasValidGtinCheckDigit('4006381333932')).toBe(false);
        expect(hasValidGtinCheckDigit('NOT-A-GTIN')).toBe(false);
    });
});
