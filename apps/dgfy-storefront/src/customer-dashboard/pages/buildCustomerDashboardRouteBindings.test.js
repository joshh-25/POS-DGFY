import { describe, expect, it, vi } from 'vitest';
import { buildCustomerDashboardRouteBindings } from './buildCustomerDashboardRouteBindings.js';

describe('buildCustomerDashboardRouteBindings', () => {
  it('keeps selected-company Day Close actions available to the dashboard page', () => {
    const getOwnBusinessDayCloseStatus = vi.fn();
    const configureOwnBusinessDayClosePin = vi.fn();

    const bindings = buildCustomerDashboardRouteBindings({
      getOwnBusinessDayCloseStatus,
      configureOwnBusinessDayClosePin
    });

    expect(bindings.actions.getOwnBusinessDayCloseStatus).toBe(getOwnBusinessDayCloseStatus);
    expect(bindings.actions.configureOwnBusinessDayClosePin).toBe(configureOwnBusinessDayClosePin);
  });
});
