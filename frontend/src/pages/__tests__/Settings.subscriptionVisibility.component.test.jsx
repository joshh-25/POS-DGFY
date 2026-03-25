import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

let mockedStoreState = {
  currentUser: null,
  setCurrentUser: vi.fn()
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=subscription'), vi.fn()]
  };
});

vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  PayPalButtons: () => React.createElement('div', null, 'PayPal Buttons')
}));

vi.mock('../../store/useStore.js', () => ({
  default: () => mockedStoreState
}));

vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true })
}));

vi.mock('../../services/userService.js', () => ({
  getCurrentUser: vi.fn()
}));

vi.mock('../../services/settingsService.js', () => ({
  getAllSettings: vi.fn(),
  getCompanyInfo: vi.fn(),
  updateSettings: vi.fn()
}));

vi.mock('../../services/paymentService.js', () => ({
  getPendingPlan: vi.fn(),
  getBillingHistory: vi.fn(),
  migrateToPayPal: vi.fn(),
  changePlan: vi.fn(),
  syncSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  upgradeToPremium: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../../Components/users/UserManagementModal.jsx', () => ({
  default: () => React.createElement('div', null, 'UserManagementModal')
}));

import Settings from '../../../Pages/Settings.jsx';

describe('Settings subscription visibility (component)', () => {
  beforeEach(() => {
    mockedStoreState = {
      currentUser: null,
      setCurrentUser: vi.fn()
    };
  });

  it('renders Link PayMongo Subscription for standard manual master admin', () => {
    mockedStoreState.currentUser = {
      is_master_admin: true,
      role: 'admin',
      company: {
        plan: 'standard',
        payment_method: 'manual',
        subscription_status: 'active'
      }
    };

    const html = renderToStaticMarkup(<Settings />);
    expect(html).toContain('Link PayMongo Subscription');
  });

  it('hides Link PayMongo Subscription when tenant already uses PayMongo', () => {
    mockedStoreState.currentUser = {
      is_master_admin: true,
      role: 'admin',
      company: {
        plan: 'standard',
        payment_method: 'paymongo',
        subscription_status: 'active'
      }
    };

    const html = renderToStaticMarkup(<Settings />);
    expect(html).not.toContain('Link PayMongo Subscription');
  });
});
