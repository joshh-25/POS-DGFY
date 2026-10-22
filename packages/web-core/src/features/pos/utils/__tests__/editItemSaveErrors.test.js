import { describe, expect, it } from 'vitest';
import { resolveEditItemSaveError } from '../editItemSaveErrors.js';

describe('edit item save error diagnostics', () => {
  it('reports the actual save stage and request reference for an image API failure', () => {
    const result = resolveEditItemSaveError({
      response: {
        status: 500,
        headers: { 'x-request-id': 'upload-request-123' },
        data: {
          message: 'The server could not process this image. Try again.',
          error_code: 'STOREFRONT_IMAGE_PROCESSING_FAILED'
        }
      }
    }, 'storefront_images');

    expect(result).toEqual(expect.objectContaining({
      stage: 'storefront_images',
      requestId: 'upload-request-123',
      code: 'STOREFRONT_IMAGE_PROCESSING_FAILED',
      status: 500
    }));
    expect(result.message).toContain('The server could not process this image');
    expect(result.message).toContain('Reference: upload-request-123');
  });

  it('does not blame image upload when item details fail before the upload stage', () => {
    const result = resolveEditItemSaveError({
      response: {
        status: 422,
        data: { message: 'Selling price must be greater than cost.' }
      }
    }, 'item_details');

    expect(result.message).toBe('Selling price must be greater than cost.');
    expect(result.message).not.toContain('image');
    expect(result.stage).toBe('item_details');
  });

  it('uses the first field detail for a generic 422 validation response', () => {
    const result = resolveEditItemSaveError({
      response: {
        status: 422,
        data: {
          message: 'Validation failed',
          request_id: 'validation-request-456',
          errors: [
            { field: 'default_sale_price', message: 'Selling price must not exceed ₱999,999.9999.' },
            { field: 'cost_per_unit', message: 'Cost per unit must not exceed ₱999,999.9999.' }
          ]
        }
      }
    });

    expect(result.message).toBe('Selling price must not exceed ₱999,999.9999. Reference: validation-request-456.');
    expect(result.status).toBe(422);
  });

  it('does not substitute field details for non-422 or non-generic server messages', () => {
    const non422 = resolveEditItemSaveError({
      response: {
        status: 500,
        data: {
          message: 'Validation failed',
          errors: [{ message: 'Internal validation detail' }]
        }
      }
    });
    const specific422 = resolveEditItemSaveError({
      response: {
        status: 422,
        data: {
          message: 'Selling price must be greater than cost.',
          errors: [{ message: 'Another message' }]
        }
      }
    });

    expect(non422.message).toBe('Validation failed.');
    expect(specific422.message).toBe('Selling price must be greater than cost.');
  });

  it('gives a timeout-specific message for long-running image optimization', () => {
    const result = resolveEditItemSaveError({ code: 'ECONNABORTED' }, 'storefront_images');

    expect(result.message).toContain('did not finish before the server response timed out');
    expect(result.stage).toBe('storefront_images');
  });
});
