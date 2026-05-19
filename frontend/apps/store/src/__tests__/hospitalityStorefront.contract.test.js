import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (file) => fs.readFileSync(path.join(appRoot, file), 'utf8');

describe('Hospitality storefront contract', () => {
  it('registers Hospitality as a stay booking storefront mode instead of a retail catalog mode', () => {
    const app = readSource('StorefrontApp.jsx');
    const registry = readSource('modePresentationRegistry.js');
    const normalizer = readSource('normalizeStorefrontPageModel.js');
    const templates = readSource('storefrontTemplateRegistry.js');

    expect(registry).toContain('hospitality: Object.freeze');
    expect(registry).toContain("primaryActionLabel: 'Book a Stay'");
    expect(registry).toContain("isHospitalityMode: mode === 'hospitality'");
    expect(normalizer).toContain('isHospitalityMode');
    expect(templates).toContain("catalogCardVariant: 'hospitality_booking'");
    expect(templates).toContain("journeyVariant: 'stay'");
    expect(app).toContain('HospitalityBookingPanel');
  });

  it('uses public PMS booking APIs for availability, quote, hold, confirmation, and lookup', () => {
    const app = readSource('StorefrontApp.jsx');
    const panel = readSource('HospitalityBookingPanel.jsx');

    expect(app).toContain('/api/v1/store/hospitality/availability?');
    expect(app).toContain('/api/v1/store/hospitality/quote');
    expect(app).toContain('/api/v1/store/hospitality/booking-holds');
    expect(app).toContain('/api/v1/store/hospitality/bookings');
    expect(panel).toContain("const API_BASE = '/api/v1/store/hospitality'");
    expect(panel).toContain("requestJson('/quote'");
    expect(panel).toContain("requestJson('/booking-holds'");
    expect(panel).toContain("requestJson('/bookings'");
    expect(panel).toContain("requestJson('/bookings',");
    expect(panel).toContain("`/bookings/${encodeURIComponent(reference)}/claim`");
    expect(panel).toContain('headers.Authorization = `Bearer ${authToken}`');
    expect(panel).toContain('readStoreAuthToken');
    expect(panel).toContain('createIdempotencyKey');
  });

  it('exposes customer-facing stay controls, amenities, packages, and booking status without opening the cart drawer', () => {
    const app = readSource('StorefrontApp.jsx');
    const panel = readSource('HospitalityBookingPanel.jsx');

    expect(panel).toContain('Direct Booking');
    expect(panel).toContain('Room Availability');
    expect(panel).toContain('Paid add-ons');
    expect(panel).toContain('Confirm Booking');
    expect(panel).toContain('Policies');
    expect(panel).toContain('acceptedPolicies');
    expect(panel).toContain('bookingAttemptKey');
    expect(panel).toContain('Booking confirmed');
    expect(panel).toContain('Booking lookup');
    expect(panel).toContain('Load Stay History');
    expect(panel).toContain('Save to My Stays');
    expect(panel).toContain('online card capture is not enabled');
    expect(app).toContain('isHospitalityMode || isServicesCartDrawerMode');
    expect(app).toContain('!isHospitalityMode && !(isSimpleMode && isResolvedOrderSubpage)');
    expect(app).toContain('!isServicesMode && !isFnbMode && !isSimpleMode && !isHospitalityMode');
  });
});
