// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import PosPageShell from '../pages/PosPageShell.jsx';

// Phase 6: panel visibility on the shared POS shell is capability-driven (base
// mode capabilities composed with the enabled_capabilities overlay), not a
// mutually-exclusive isXWorkflowMode check. These are real render assertions,
// not source-text string matching - the previous hospitalityPos.contract.test.js
// only grepped for the literal string "isHospitalityWorkflowMode", which this
// change removes from the source entirely.

const permissionState = vi.hoisted(() => ({ current: { loading: false, can: () => true } }));
const workflowModeState = vi.hoisted(() => ({ current: { hasCapability: () => false } }));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => permissionState.current
}));

vi.mock('../../settings/WorkflowModeContext.jsx', () => ({
  useWorkflowMode: () => workflowModeState.current
}));

vi.mock('../../services/api/servicesApi.js', () => ({
  listServiceBookings: vi.fn().mockResolvedValue({ bookings: [] }),
  updateServiceBookingStatus: vi.fn()
}));

vi.mock('../../fnb/components/FnbDiningPanel.jsx', () => ({
  default: () => <div data-testid="fnb-dining-panel">F&amp;B Dining Panel</div>
}));

vi.mock('../components/HospitalityPosPanel.jsx', () => ({
  default: () => <div data-testid="hospitality-pos-panel">Hospitality POS Panel</div>
}));

const StubCheckoutTerminal = () => <div data-testid="checkout-terminal">Checkout</div>;

const setCapabilities = (capabilities) => {
  workflowModeState.current = {
    hasCapability: (capability) => capabilities.includes(capability)
  };
};

describe('PosPageShell capability-driven panel composition', () => {
  afterEach(() => {
    cleanup();
    permissionState.current = { loading: false, can: () => true };
    workflowModeState.current = { hasCapability: () => false };
  });

  it('renders no vertical panel when the tenant has none of the panel capabilities (e.g. plain retail/msme)', async () => {
    setCapabilities([]);
    render(<PosPageShell CheckoutTerminal={StubCheckoutTerminal} />);

    await waitFor(() => expect(screen.getByTestId('checkout-terminal')).toBeTruthy());
    expect(screen.queryByTestId('fnb-dining-panel')).toBeNull();
    expect(screen.queryByTestId('hospitality-pos-panel')).toBeNull();
    expect(screen.queryByText('Services Queue')).toBeNull();
  });

  it('renders only the F&B panel for an fnb-mode tenant with no overlay', async () => {
    setCapabilities(['fnbDining']);
    render(<PosPageShell CheckoutTerminal={StubCheckoutTerminal} />);

    await waitFor(() => expect(screen.getByTestId('fnb-dining-panel')).toBeTruthy());
    expect(screen.queryByTestId('hospitality-pos-panel')).toBeNull();
    expect(screen.queryByText('Services Queue')).toBeNull();
  });

  it('composes multiple panels for a tenant with an enabled_capabilities overlay spanning verticals', async () => {
    // e.g. a retail-mode tenant that has additionally enabled `services` and
    // `hospitalityReservations` via the Phase 6 overlay.
    setCapabilities(['services', 'hospitalityReservations']);
    render(<PosPageShell CheckoutTerminal={StubCheckoutTerminal} />);

    await waitFor(() => expect(screen.getByText('Services Queue')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('hospitality-pos-panel')).toBeTruthy());
    expect(screen.queryByTestId('fnb-dining-panel')).toBeNull();
  });
});
