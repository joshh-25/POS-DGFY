import { describe, expect, it } from 'vitest';
import { buildStorefrontQrTargetUrl } from './QrCodeManagementPage.jsx';

describe('QR code storefront target', () => {
  it('opens the dedicated branch menu page while preserving the QR token', () => {
    expect(buildStorefrontQrTargetUrl({
      storeSlug: 'Masu-Cafe-ed841f',
      qrToken: 'DGFYQR_test-token',
      locationId: 1,
      origin: 'http://127.0.0.1:5175'
    })).toBe('http://127.0.0.1:5175/tenant-store/masu-cafe-ed841f/categories?location_id=1&qr_token=DGFYQR_test-token');
  });
});
