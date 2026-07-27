import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modalPath = path.resolve(__dirname, '../../../../Components/items/ItemFormModal.jsx');
const posModalPath = path.resolve(__dirname, '../../../features/pos/components/TerminalOperationsWorkspace.jsx');
const servicePath = path.resolve(__dirname, '../../../services/itemService.js');
const storefrontServicePath = path.resolve(__dirname, '../../../services/storefrontCatalogService.js');
const barcodePolicyPath = path.resolve(__dirname, '../../../utils/barcodePolicy.js');
const scannerPath = path.resolve(__dirname, '../components/ProductQrScannerModal.jsx');

describe('external product lookup contracts', () => {
  let modalContent = '';
  let posModalContent = '';
  let serviceContent = '';
  let storefrontServiceContent = '';
  let barcodePolicyContent = '';
  let scannerContent = '';

  beforeAll(() => {
    modalContent = fs.readFileSync(modalPath, 'utf8');
    posModalContent = fs.readFileSync(posModalPath, 'utf8');
    serviceContent = fs.readFileSync(servicePath, 'utf8');
    storefrontServiceContent = fs.readFileSync(storefrontServicePath, 'utf8');
    barcodePolicyContent = fs.readFileSync(barcodePolicyPath, 'utf8');
    scannerContent = fs.readFileSync(scannerPath, 'utf8');
  });

  it('uses the governed inventory lookup endpoint', () => {
    expect(serviceContent).toContain("api.get('/items/barcodes/external-lookup'");
  });

  it('validates GTIN check digits before calling the registry', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('getGtinValidationMessage');
    });
    expect(barcodePolicyContent).toContain('Invalid GTIN check digit. Scan a real package barcode or enter item details manually.');
  });

  it('requires explicit acceptance before persisting a manufacturer barcode', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('Use product details');
      expect(content).toContain('acceptedExternalProduct?.found');
      expect(content).toContain('manufacturer_barcode: { code: acceptedExternalProduct.code }');
    });
  });

  it('applies category suggestions only after explicit acceptance', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('Category suggestion:');
      expect(content).toContain('categorySuggestion');
    });
  });

  it('shows advisory price provenance and requires explicit price acceptance', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('Suggested selling price: PHP');
      expect(content).toContain('Use suggested price');
      expect(content).toContain('suggested_price.location');
      expect(content).toContain('suggested_price.observed_at');
    });
  });

  it('imports accepted POS registry images through the governed backend endpoint', () => {
    expect(posModalContent).toContain('importExternalStorefrontCatalogImage');
    expect(posModalContent).toContain('Registry image import');
    expect(posModalContent).toContain('selectedImageFiles.length === 0');
    expect(storefrontServiceContent).toContain("api.post(`/items/${itemId}/storefront-image/external`, { code })");
  });

  it('offers a camera QR scanner in both create-item surfaces and reuses the governed lookup', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('ProductQrScannerModal');
      expect(content).toContain('Scan QR');
      expect(content).toContain('handleExternalProductLookup(code)');
    });
  });

  it('loads the scanner lazily, prefers the rear camera, and stops camera tracks', () => {
    expect(scannerContent).toContain("import('@zxing/browser')");
    expect(scannerContent).toContain("facingMode: { ideal: 'environment' }");
    expect(scannerContent).toContain('parseProductQrPayload');
    expect(scannerContent).toContain('activeControls.stop()');
    expect(scannerContent).toContain('stream.getTracks().forEach((track) => track.stop())');
    expect(scannerContent).toContain('Camera scanning requires HTTPS');
  });

  it('requests camera permission only after an explicit operator action', () => {
    expect(scannerContent).toContain('if (!open || !cameraRequested)');
    expect(scannerContent).toContain("setCameraRequested(true)");
    expect(scannerContent).toContain('Enable Camera');
    expect(scannerContent).toContain('Try Camera Again');
    expect(scannerContent).toContain('trusted HTTPS address');
  });
});
