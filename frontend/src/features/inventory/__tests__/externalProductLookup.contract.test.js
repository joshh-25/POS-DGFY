import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modalPath = path.resolve(__dirname, '../../../../Components/items/ItemFormModal.jsx');
const posModalPath = path.resolve(__dirname, '../../../features/pos/components/TerminalOperationsWorkspace.jsx');
const servicePath = path.resolve(__dirname, '../../../services/itemService.js');

describe('external product lookup contracts', () => {
  let modalContent = '';
  let posModalContent = '';
  let serviceContent = '';

  beforeAll(() => {
    modalContent = fs.readFileSync(modalPath, 'utf8');
    posModalContent = fs.readFileSync(posModalPath, 'utf8');
    serviceContent = fs.readFileSync(servicePath, 'utf8');
  });

  it('uses the governed inventory lookup endpoint', () => {
    expect(serviceContent).toContain("api.get('/items/barcodes/external-lookup'");
  });

  it('requires explicit acceptance before persisting a manufacturer barcode', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('Use product details');
      expect(content).toContain('acceptedExternalProduct?.found');
      expect(content).toContain('manufacturer_barcode: { code: acceptedExternalProduct.code }');
    });
  });

  it('keeps category and external image data advisory only', () => {
    [modalContent, posModalContent].forEach((content) => {
      expect(content).toContain('Category suggestion:');
      expect(content).toContain('Category and image are not imported automatically.');
    });
  });
});
