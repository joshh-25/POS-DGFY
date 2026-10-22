import { buildServicesCapabilities } from '../src/modules/shared/domain/servicesCapabilities.js';

describe('Services capability projection contract', () => {
  it('fails closed when the Services workflow is disabled', () => {
    const result = buildServicesCapabilities({
      user: { permissions: ['services:bookings:view', 'pos:view'] },
      workflowEnabled: false,
      fallbackEnabled: true
    });

    expect(result.workflow_enabled).toBe(false);
    expect(result.canAccess).toBe(false);
    expect(result.viewBookings).toBe(false);
    expect(result.viewCatalog).toBe(false);
  });

  it('does not infer Services access from generic grants when fallback is disabled', () => {
    const result = buildServicesCapabilities({
      user: { permissions: ['reports:view', 'pos:view', 'items:view'] },
      workflowEnabled: true,
      fallbackEnabled: false
    });

    expect(result.generic_fallback_enabled).toBe(false);
    expect(result.viewDashboard).toBe(false);
    expect(result.viewBookings).toBe(false);
    expect(result.viewCatalog).toBe(false);
    expect(result.canAccess).toBe(false);
  });

  it('projects the approved generic fallback only when explicitly enabled', () => {
    const result = buildServicesCapabilities({
      user: { permissions: ['reports:view', 'pos:view', 'items:view'] },
      workflowEnabled: true,
      fallbackEnabled: true
    });

    expect(result.generic_fallback_enabled).toBe(true);
    expect(result.viewDashboard).toBe(true);
    expect(result.viewBookings).toBe(true);
    expect(result.viewCatalog).toBe(true);
    expect(result.viewClients).toBe(true);
    expect(result.canAccess).toBe(true);
  });

  it('grants every projected capability to a master administrator only when workflow is enabled', () => {
    const result = buildServicesCapabilities({
      user: { is_master_admin: true, permissions: [] },
      workflowEnabled: true,
      fallbackEnabled: false
    });

    expect(result.canAccess).toBe(true);
    expect(result.viewDashboard).toBe(true);
    expect(result.manageBookings).toBe(true);
    expect(result.manageReminders).toBe(true);
  });
});
