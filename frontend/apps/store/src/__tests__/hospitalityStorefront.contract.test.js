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

    expect(app).toContain('HospitalityBookingPanel');
    expect(panel).toContain("const API_BASE = '/api/v1/store/hospitality'");
    expect(panel).toContain('requestJson(`/availability?');
    expect(panel).toContain("requestJson('/quote'");
    expect(panel).toContain("requestJson('/booking-holds'");
    expect(panel).toContain("requestJson('/bookings'");
    expect(panel).toContain("requestJson('/bookings',");
    expect(panel).toContain("`/bookings/${encodeURIComponent(reference)}/claim`");
    expect(panel).toContain("import { requestJson as requestStorefrontJson } from './services/requestJson.js'");
    expect(panel).toContain('authToken');
    expect(panel).not.toContain("entry.startsWith('sku_csrf_token=')");
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
    expect(app).toContain('HospitalityBookingPanel');
    expect(app).toContain('workflow_mode');
    expect(app).toContain('!isFnbMode && !isSimpleMode');
  });

  it('keeps the shared empty catalog state free of discovery-only viewport refs', () => {
    const app = readSource('StorefrontApp.jsx');
    const emptyStateStart = app.indexOf('function StoreCatalogEmptyState');
    const emptyStateEnd = app.indexOf('export default function StorefrontApp');
    const emptyStateSource = app.slice(emptyStateStart, emptyStateEnd);

    expect(emptyStateStart).toBeGreaterThanOrEqual(0);
    expect(emptyStateEnd).toBeGreaterThan(emptyStateStart);
    expect(emptyStateSource).not.toContain('isDiscoveryMobileViewport');
    expect(emptyStateSource).not.toContain('mobileCategoryRailRef');
  });
});
