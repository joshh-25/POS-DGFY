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
  migrateToPayMongo: vi.fn(),
  changePayMongoPlan: vi.fn(),
  syncPayMongoSubscription: vi.fn(),
  cancelPayMongoSubscription: vi.fn(),
  setupPayMongoRecurring: vi.fn()
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
      currentUser: {
        is_master_admin: true,
        role: 'admin',
        company: {
          plan: 'standard',
          payment_method: 'manual',
          subscription_status: 'active'
        }
      },
      setCurrentUser: vi.fn()
    };
  });

  it('hides subscription tab and payment sections when subscriptions are disabled', () => {
    const html = renderToStaticMarkup(<Settings />);
    expect(html).not.toContain('Subscription');
    expect(html).not.toContain('Link PayMongo Subscription');
    expect(html).not.toContain('Billing History');
  });
});

