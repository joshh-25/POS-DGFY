import { describe, expect, it, vi } from 'vitest';
import { serviceTrackingAdapter } from '../modes/services/tracking/model/serviceTrackingAdapter.js';

describe('serviceTrackingAdapter', () => {
  it('fetches a public service booking by its booking reference', async () => {
    const requestJson = vi.fn().mockResolvedValue({ booking: { public_reference: 'SV-ABC123' } });

    await serviceTrackingAdapter.fetch(
      { mode: 'services', rawReference: 'sv-abc123', storeSlug: 'ralphs-laundry' },
      { requestJson }
    );

    expect(requestJson).toHaveBeenCalledWith(
      '/api/v1/store/services/bookings/SV-ABC123',
      { storeSlug: 'ralphs-laundry' }
    );
  });

  it('normalizes backend booking data without inventing unsupported timeline events or fees', () => {
    const result = serviceTrackingAdapter.normalize({
      data: {
        booking: {
          public_reference: 'SV-ABC123',
          status: 'in_service',
          service_item_id: 12,
          service_name: 'Wash, Dry & Fold',
          service: {
            image_url: '/uploads/storefront-assets/wash-fold.webp',
            image_variants: { thumbnail_url: '/uploads/storefront-assets/thumb.webp' }
          },
          quantity: 2,
          total_amount: 300,
          start_at: '2026-08-12T09:00:00Z',
          location: { name: 'Ralph’s Laundry Main' },
          payment_status: 'unpaid'
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      reference: 'SV-ABC123',
      statusCode: 'in_service',
      statusLabel: 'Service in progress',
      totalAmount: 300,
      subtotalAmount: null,
      serviceFeeAmount: null,
      items: [expect.objectContaining({
        name: 'Wash, Dry & Fold',
        qty: 2,
        amount: 300,
        image_url: '/uploads/storefront-assets/wash-fold.webp',
        image_variants: { thumbnail_url: '/uploads/storefront-assets/thumb.webp' }
      })]
    }));
  });
});
