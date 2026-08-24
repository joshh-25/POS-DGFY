import { describe, expect, it } from 'vitest';
import {
  getGtinValidationMessage,
  hasValidGtinCheckDigit,
  parseProductQrPayload,
  resolveProductBarcodeInput
} from '../barcodePolicy.js';

describe('barcodePolicy', () => {
  it('accepts supported GTINs with valid check digits', () => {
    expect(hasValidGtinCheckDigit('4006381333931')).toBe(true);
    expect(getGtinValidationMessage('4006381333931')).toBe('');
  });

  it('explains invalid check digits without attempting a product lookup', () => {
    expect(hasValidGtinCheckDigit('0011111611018')).toBe(false);
    expect(getGtinValidationMessage('0011111611018')).toBe(
      'Invalid GTIN check digit. Scan a real package barcode or enter item details manually.'
    );
  });

  it('explains unsupported barcode lengths', () => {
    expect(getGtinValidationMessage('12345')).toBe('Enter a GTIN-8, UPC-A, EAN-13, or GTIN-14 barcode.');
  });

  it('extracts valid product identifiers from supported QR payloads', () => {
    expect(parseProductQrPayload('4006381333931')).toEqual({ code: '4006381333931', error: '' });
    expect(parseProductQrPayload('(01)04006381333931(10)LOT-7')).toEqual({ code: '04006381333931', error: '' });
    expect(parseProductQrPayload(']Q3010400638133393110LOT-7')).toEqual({ code: '04006381333931', error: '' });
    expect(parseProductQrPayload('https://id.gs1.org/01/04006381333931')).toEqual({ code: '04006381333931', error: '' });
  });

  it('rejects unrelated URLs, payment QRs, and malformed GS1 payloads', () => {
    expect(parseProductQrPayload('https://example.com/pay/order-4006381333931')).toEqual({
      code: '',
      error: 'This QR code does not contain a supported product GTIN.'
    });
    expect(parseProductQrPayload('000201010212merchant-payment-payload')).toEqual({
      code: '',
      error: 'This QR code does not contain a supported product GTIN.'
    });
    expect(parseProductQrPayload('https://id.gs1.org/01/04006381333932')).toEqual({
      code: '',
      error: 'Invalid GTIN check digit. Scan a real package barcode or enter item details manually.'
    });
  });

  it('uses a manual barcode before a GTIN', () => {
    expect(resolveProductBarcodeInput({
      manualBarcode: ' supplier-001 ',
      gtin: '4006381333931'
    })).toEqual({
      code: 'SUPPLIER-001',
      kind: 'manual',
      shouldGenerate: false,
      validationMessage: ''
    });
  });

  it('uses a valid GTIN when no manual barcode exists', () => {
    expect(resolveProductBarcodeInput({ gtin: '4006381333931' })).toEqual({
      code: '4006381333931',
      kind: 'gtin',
      shouldGenerate: false,
      validationMessage: ''
    });
  });

  it('generates only when both barcode fields are empty', () => {
    expect(resolveProductBarcodeInput()).toEqual({
      code: '',
      kind: 'generated',
      shouldGenerate: true,
      validationMessage: ''
    });
  });
});
