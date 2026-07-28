import fs from 'fs/promises';
import { describe, expect, it, jest } from '@jest/globals';
import { buildImportExternalProductImageUseCase } from '../src/modules/inventory/usecases/importExternalProductImageUseCase.js';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D
]);

const responseFor = ({ body = PNG_BYTES, mime = 'image/png', length = body.length } = {}) => ({
  ok: true,
  status: 200,
  headers: {
    get: (name) => {
      if (String(name).toLowerCase() === 'content-type') return mime;
      if (String(name).toLowerCase() === 'content-length') return String(length);
      return null;
    }
  },
  arrayBuffer: async () => body
});

const lookupResult = (imageUrl = 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_en.png') => ({
  found: true,
  code: '3017620422003',
  provider: 'open_food_facts',
  product: {
    image_url: imageUrl,
    provider_product_url: 'https://world.openfoodfacts.org/product/3017620422003'
  },
  attribution: {
    label: 'Product data from Open Food Facts',
    url: 'https://world.openfoodfacts.org/',
    database_license: 'ODbL',
    image_license: 'CC BY-SA'
  }
});

describe('external product image import', () => {
  it('downloads an allowlisted image and delegates storage with provenance', async () => {
    const upload = jest.fn(async ({ file, provenance }) => {
      expect(await fs.readFile(file.path)).toEqual(PNG_BYTES);
      expect(file.mimetype).toBe('image/png');
      expect(provenance).toEqual(expect.objectContaining({
        type: 'external_registry',
        provider: 'open_food_facts',
        barcode: '3017620422003',
        image_license: 'CC BY-SA'
      }));
      return { storefront_image_url: '/uploads/item.png' };
    });
    const importer = buildImportExternalProductImageUseCase({
      lookupExternalProduct: jest.fn().mockResolvedValue(lookupResult()),
      uploadStorefrontCatalogImage: upload,
      fetchImpl: jest.fn().mockResolvedValue(responseFor())
    });

    await expect(importer({ itemId: 54, code: '3017620422003', user: { user_id: 7 } }))
      .resolves.toEqual({ storefront_image_url: '/uploads/item.png' });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('rejects a provider image on an unapproved host without fetching it', async () => {
    const fetchImpl = jest.fn();
    const importer = buildImportExternalProductImageUseCase({
      lookupExternalProduct: jest.fn().mockResolvedValue(lookupResult('https://example.com/product.png')),
      uploadStorefrontCatalogImage: jest.fn(),
      fetchImpl
    });

    await expect(importer({ itemId: 54, code: '3017620422003', user: {} })).rejects.toMatchObject({
      details: { reason_code: 'PRODUCT_IMAGE_SOURCE_NOT_ALLOWED' }
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized registry images before reading the response body', async () => {
    const importer = buildImportExternalProductImageUseCase({
      lookupExternalProduct: jest.fn().mockResolvedValue(lookupResult()),
      uploadStorefrontCatalogImage: jest.fn(),
      fetchImpl: jest.fn().mockResolvedValue(responseFor({ length: 1025 })),
      maxBytes: 1024
    });

    await expect(importer({ itemId: 54, code: '3017620422003', user: {} })).rejects.toMatchObject({
      details: { reason_code: 'PRODUCT_IMAGE_TOO_LARGE' }
    });
  });

  it('rejects unsupported response content types', async () => {
    const importer = buildImportExternalProductImageUseCase({
      lookupExternalProduct: jest.fn().mockResolvedValue(lookupResult()),
      uploadStorefrontCatalogImage: jest.fn(),
      fetchImpl: jest.fn().mockResolvedValue(responseFor({ mime: 'text/html' }))
    });

    await expect(importer({ itemId: 54, code: '3017620422003', user: {} })).rejects.toMatchObject({
      details: { reason_code: 'PRODUCT_IMAGE_FORMAT_UNSUPPORTED' }
    });
  });
});
