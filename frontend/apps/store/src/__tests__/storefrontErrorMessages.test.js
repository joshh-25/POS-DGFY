import { describe, expect, it } from 'vitest';
import { normalizeStorefrontErrorMessage } from '../storefrontErrorMessages.js';

describe('storefront error message normalization', () => {
  it('normalizes network transport errors', () => {
    const message = normalizeStorefrontErrorMessage({ isNetworkError: true }, 'fallback');
    expect(message).toContain('Request failed before reaching API');
  });

  it('maps resource not found to tracking guidance', () => {
    const message = normalizeStorefrontErrorMessage({
      errorCode: 'RESOURCE_NOT_FOUND',
      message: 'Tracking PIN was not found'
    });
    expect(message).toContain('Tracking PIN not found');
  });

  it('maps validation errors to actionable copy', () => {
    const message = normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'delivery_address is required for delivery orders'
    });
    expect(message).toContain('Fix required');
  });

  it('maps location capability mismatches to fulfillment guidance', () => {
    const message = normalizeStorefrontErrorMessage({
      message: 'Selected location does not support pickup orders'
    });
    expect(message).toContain('Selected fulfillment option is not available');
  });

  it('maps closed-location failures to clear availability guidance', () => {
    const message = normalizeStorefrontErrorMessage({
      message: 'Selected location is currently closed and cannot accept orders'
    });
    expect(message).toContain('currently closed');
  });
});
