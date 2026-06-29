import { describe, expect, it } from 'vitest';
import {
  classifyStoreCatalogError,
  normalizeStorefrontErrorMessage
} from '../storefrontErrorMessages.js';

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

  it('maps checkout validation detail arrays to field-specific copy', () => {
    expect(normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'Validation failed',
      payload: {
        errors: [{ field: 'payment_type', message: '"payment_type" must be one of [cash]' }]
      }
    })).toBe('Choose a valid payment method before placing the order.');

    expect(normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: [{ field: 'customer_email', message: '"customer_email" must be a valid email' }]
    })).toBe('Enter a valid email address or leave it blank.');

    expect(normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'Validation failed',
      errors: [{ field: 'lines', message: '"lines" must contain at least 1 items' }]
    })).toBe('Your cart is empty or contains an invalid item. Review the cart and try again.');

    expect(normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: [{ field: 'delivery_address', message: '"delivery_address" is required' }]
    })).toBe('Delivery address is required for delivery orders.');

    expect(normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: [{ field: 'idempotency_key', message: '"idempotency_key" is required' }]
    })).toBe('Checkout session expired. Refresh the cart and try again.');
  });

  it('maps customer access mode blocks to Storefront mode copy', () => {
    const message = normalizeStorefrontErrorMessage({
      errorCode: 'CUSTOMER_ACCESS_MODE_BLOCKED',
      message: 'Customer access mode does not allow quote_checkout',
      details: {
        requested_mode: 'catalog',
        effective_mode: 'catalog'
      }
    });
    expect(message).toBe('Customers can browse your catalog, but cart, quote, booking, and checkout are disabled.');
  });

  it('maps F&B recipe shortfalls to ingredient-specific checkout copy', () => {
    const message = normalizeStorefrontErrorMessage({
      errorCode: 'VALIDATION_FAILED',
      message: 'Insufficient ingredient stock',
      details: {
        reason_code: 'FNB_RECIPE_INGREDIENT_SHORTFALL',
        product_name: 'Burger',
        ingredient_name: 'Ground beef',
        available: 0.2,
        requested: 0.25,
        unit_of_measure: 'kg',
        location_id: 4
      }
    });
    expect(message).toContain('Burger cannot be checked out');
    expect(message).toContain('Ground beef');
    expect(message).toContain('Available: 0.2 kg; required: 0.25 kg');
  });

  it('maps F&B kitchen queue failures to staff-actionable copy', () => {
    const message = normalizeStorefrontErrorMessage({
      errorCode: 'CONFLICT',
      message: 'F&B kitchen order could not be created',
      details: {
        reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE'
      }
    });
    expect(message).toContain('Kitchen order could not be queued');
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

  it('classifies 500 catalog errors as runtime issues (not setup guidance)', () => {
    const result = classifyStoreCatalogError({
      status: 500,
      errorCode: 'STORE_CATALOG_RUNTIME_ERROR',
      message: 'Failed to list storefront catalog'
    });
    expect(result.message).toContain('Failed to list storefront catalog');
    expect(result.guidance).toContain('Server/runtime issue');
  });

  it('classifies location validation errors with branch guidance', () => {
    const result = classifyStoreCatalogError({
      status: 422,
      errorCode: 'STORE_CATALOG_LOCATION_INVALID',
      message: 'location_id must be a positive integer when provided'
    });
    expect(result.guidance).toContain('fulfillment location is invalid');
  });

  it('classifies 429 catalog errors with retry guidance', () => {
    const result = classifyStoreCatalogError({
      status: 429,
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests from this IP, please try again later.',
      details: {
        retryAfterSeconds: 381
      }
    });
    expect(result.message).toContain('temporarily rate-limited');
    expect(result.guidance).toContain('Please wait about 7 minute(s)');
  });

  it('does not inject setup/runtime guidance when no explicit catalog code is present', () => {
    const result = classifyStoreCatalogError({
      status: 500,
      errorCode: 'UNKNOWN_CODE',
      message: 'Some uncategorized failure'
    });
    expect(result.guidance).toBe('');
  });
});
