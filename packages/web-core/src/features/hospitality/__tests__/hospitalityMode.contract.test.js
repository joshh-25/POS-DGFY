import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isWorkflowPageVisible, isWorkflowPathBlocked } from '../../settings/workflowMode.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Hospitality frontend contract', () => {
  it('registers the IMS route and navigation behind the Hospitality workflow capability', () => {
    const main = read('apps/dgfy-ims/src/main.jsx');
    const layout = read('apps/dgfy-ims/Layout.jsx');
    const utils = read('apps/dgfy-ims/utils.js');

    expect(main).toContain("path=\"/hospitality\"");
    expect(main).toContain('requiredCapability="hospitalityReservations"');
    expect(layout).toContain("name: 'Hospitality'");
    expect(layout).toContain("page: 'Hospitality'");
    expect(utils).toContain("'Hospitality': '/hospitality'");
  });

  it('keeps manufacturing production modules out of Hospitality by capability, not by a hardcoded mode list', () => {
    // Previously asserted as the literal source text `blockInHospitality
    // moduleLabel="Job Orders"`. Both surfaces now derive from
    // `productionWorkflows`, which Hospitality does not hold.
    expect(isWorkflowPageVisible('JobOrders', 'hospitality')).toBe(false);
    expect(isWorkflowPageVisible('DispatchOrders', 'hospitality')).toBe(false);
    expect(isWorkflowPathBlocked('/job-orders', 'hospitality')).toBe(true);
    expect(isWorkflowPathBlocked('/dispatch-orders', 'hospitality')).toBe(true);
  });

  it('exposes Hospitality APIs for rooms, reservations, guests, operations, folios, amenities, rates, and reports', () => {
    const api = read('packages/web-core/src/features/hospitality/api/hospitalityApi.js');

    expect(api).toContain('/hospitality/dashboard');
    expect(api).toContain('/hospitality/room-types');
    expect(api).toContain('/hospitality/rooms');
    expect(api).toContain('/hospitality/guests');
    expect(api).toContain('/hospitality/reservations');
    expect(api).toContain('/hospitality/reservations/${reservationId}/rooms/${reservationRoomId}');
    expect(api).toContain('/hospitality/stays');
    expect(api).toContain('/hospitality/folios');
    expect(api).toContain('/hospitality/housekeeping/tasks');
    expect(api).toContain('/hospitality/maintenance/requests');
    expect(api).toContain('/hospitality/amenities');
    expect(api).toContain('/hospitality/room-amenities');
    expect(api).toContain('/hospitality/property-amenities');
    expect(api).toContain('/hospitality/facilities');
    expect(api).toContain('/hospitality/facilities/bookings');
    expect(api).toContain('/hospitality/packages');
    expect(api).toContain('/hospitality/packages/items');
    expect(api).toContain('/hospitality/guest-messages');
    expect(api).toContain('/hospitality/rate-plans');
    expect(api).toContain('/hospitality/reports');
  });

  it('keeps the Hospitality console PMS-native rather than retail, manufacturing, F&B, or Services-native', () => {
    const page = read('packages/web-core/src/features/hospitality/pages/HospitalityPage.jsx');

    expect(page).toContain('Reservations');
    expect(page).toContain('Rooms');
    expect(page).toContain('Guests');
    expect(page).toContain('Housekeeping');
    expect(page).toContain('Maintenance');
    expect(page).toContain('Folios');
    expect(page).toContain('Amenities');
    expect(page).toContain('Rates');
    expect(page).toContain('Create Reservation');
    expect(page).toContain('Auto-assign the best available room');
    expect(page).toContain('Assignment needed');
    expect(page).toContain('Edit Stay Dates');
    expect(page).toContain('Override Checkout');
    expect(page).toContain('Linked customer');
    expect(page).toContain('Occupancy');
    expect(page).toContain('ADR');
    expect(page).toContain('RevPAR');
    expect(page).toContain('Room Status');
    expect(page).toContain('Post Folio Line');
    expect(page).toContain('Amenity Link');
    expect(page).toContain('Facility Booking');
    expect(page).toContain('Package Item');
    expect(page).toContain('Guest Message');
    expect(page).not.toContain('Job Order');
    expect(page).not.toContain('Dispatch Order');
    expect(page).not.toContain('Kitchen Station');
    expect(page).not.toContain('Waitlist');
  });
});
