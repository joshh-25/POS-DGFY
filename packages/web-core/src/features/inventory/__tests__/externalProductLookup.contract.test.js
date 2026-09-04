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

  it('persists a valid scanned barcode even when registry metadata is unavailable', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('Use product details');
      expect(content).toContain('this barcode will still be saved');
    });
    expect(modalContent).toContain('manufacturer_barcode: { code: externalBarcode }');
  });

  it('requires explicit confirmation before saving a private code as an internal POS barcode', () => {
    expect(modalContent).toContain('Use as Internal Barcode');
    expect(modalContent).toContain('internal_barcode: { code: externalBarcode }');
    expect(modalContent).toContain('useInternalBarcode');
    expect(modalContent).toContain('getInternalBarcodeValidationMessage');
    // The POS terminal's quick-add flow dropped the separate confirm-before-save
    // step in favor of the same shared resolver, which still runs the internal-
    // barcode validation transparently.
    expect(posModalContent).toContain('resolveProductBarcodeInput({ manualBarcode, gtin: externalBarcode })');
    expect(barcodePolicyContent).toContain('normalizeBarcodeEntry');
    expect(barcodePolicyContent).toContain('Internal barcode contains unsupported characters.');
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

  it('offers a camera product scanner in both create-item surfaces and reuses the governed lookup', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('ProductQrScannerModal');
      expect(content).toMatch(/<ScanLine[\s\S]*?\n\s*Scan\s*\n/);
      expect(content).toContain('handleExternalProductLookup(code)');
    });
  });

  it('loads a barcode-only scanner lazily, prefers the rear camera, and stops camera tracks', () => {
    expect(scannerContent).toContain("import('@zxing/browser')");
    expect(scannerContent).toContain("import('@zxing/library')");
    expect(scannerContent).toContain('BrowserMultiFormatOneDReader');
    expect(scannerContent).toContain('DecodeHintType.POSSIBLE_FORMATS');
    ['EAN_8', 'EAN_13', 'UPC_A', 'UPC_E', 'ITF', 'CODE_128', 'CODE_39'].forEach((format) => {
      expect(scannerContent).toContain(`BarcodeFormat.${format}`);
    });
    expect(scannerContent).not.toContain('BarcodeFormat.QR_CODE');
    expect(scannerContent).not.toContain('BrowserMultiFormatReader');
    expect(scannerContent).not.toContain('BrowserQRCodeReader');
    expect(scannerContent).toContain("facingMode: { ideal: 'environment' }");
    expect(scannerContent).not.toContain('parseProductQrPayload');
    expect(scannerContent).not.toContain('getGtinValidationMessage');
    expect(scannerContent).toContain("String(result.getText() || '').trim()");
    expect(scannerContent).toContain('activeControls.stop()');
    expect(scannerContent).toContain('stream.getTracks().forEach((track) => track.stop())');
    expect(scannerContent).toContain('Camera scanning requires HTTPS');
  });

  it('requests camera permission only after an explicit operator action', () => {
    expect(scannerContent).toContain('if (!open || !cameraRequested)');
    expect(scannerContent).toContain("setCameraRequested(true)");
    expect(scannerContent).toContain("cameraRequested ? 'Scanning...' : 'Scan'");
    expect(scannerContent).toMatch(/Scanning[\s\S]*Enter manually/);
    expect(scannerContent).toContain('trusted HTTPS address');
  });

  it('keeps automatic lookup active after the operator starts scanning', () => {
    expect(scannerContent).toContain('onDetectedRef.current(code)');
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('handleExternalProductLookup(code)');
    });
  });

  it('re-arms the camera scanner after a successful decode', () => {
    expect(scannerContent).toMatch(/setCameraRequested\(false\);\s*\n\s*onDetectedRef\.current\(code\);/);
    // and the cleanup guard: a cancelled/torn-down camera effect must never
    // strand the Scan button disabled on "Starting..."
    expect(scannerContent).toMatch(/cancelled = true;[\s\S]*stopCamera\(\);[\s\S]*setStarting\(false\);/);
  });
});
