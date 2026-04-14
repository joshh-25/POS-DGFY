/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../../../Pages/Settings.jsx';

const mocks = vi.hoisted(() => ({
  storeState: {
    currentUser: null,
    setCurrentUser: vi.fn()
  },
  userServiceMock: {
    getCurrentUser: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn()
  },
  settingsServiceMock: {
    getAllSettings: vi.fn(),
    getCompanyInfo: vi.fn(),
    updateSettings: vi.fn()
  },
  paymentServiceMock: {
    getPendingPlan: vi.fn(),
    getBillingHistory: vi.fn(),
    migrateToPayMongo: vi.fn(),
    changePayMongoPlan: vi.fn(),
    syncPayMongoSubscription: vi.fn(),
    cancelPayMongoSubscription: vi.fn(),
    setupPayMongoRecurring: vi.fn()
  },
  tenantLocationServiceMock: {
    listTenantLocationsWithMeta: vi.fn(),
    createTenantLocation: vi.fn(),
    updateTenantLocation: vi.fn(),
    deactivateTenantLocation: vi.fn(),
    reactivateTenantLocation: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../store/useStore.js', () => ({
  default: () => mocks.storeState
}));

vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true })
}));

vi.mock('../../services/userService.js', () => mocks.userServiceMock);
vi.mock('../../services/settingsService.js', () => mocks.settingsServiceMock);
vi.mock('../../services/paymentService.js', () => mocks.paymentServiceMock);
vi.mock('../../services/tenantLocationService.js', () => mocks.tenantLocationServiceMock);

vi.mock('../../../Components/users/UserManagementModal.jsx', () => ({
  default: ({ open }) => open ? <div>UserManagementModal</div> : null
}));

vi.mock('../../components/maps/OpenStreetMapPinPicker.jsx', () => ({
  default: () => <div>MapPicker</div>
}));

vi.mock('../../features/compliance/components/ComplianceProgramPanel.jsx', () => ({
  default: () => (
    <div>
      <div id="section-profile">Profile</div>
      <div id="section-artifacts">Artifacts</div>
      <div id="section-peripherals">Peripherals</div>
      <div id="section-final-review">Final Review</div>
    </div>
  )
}));

vi.mock('sonner', () => ({
  toast: mocks.toastMock
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderSettings(initialEntry = '/settings?tab=profile') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/settings"
          element={(
            <>
              <Settings />
              <LocationProbe />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('Settings deep-linking and action wiring', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.storeState.currentUser = {
      username: 'owner',
      email: 'owner@example.com',
      role: 'admin',
      is_master_admin: true,
      company: {
        plan: 'premium',
        payment_method: 'paymongo',
        subscription_status: 'active'
      }
    };
    mocks.storeState.setCurrentUser = vi.fn();

    mocks.userServiceMock.getCurrentUser.mockResolvedValue(mocks.storeState.currentUser);
    mocks.userServiceMock.updateProfile.mockResolvedValue({});
    mocks.userServiceMock.changePassword.mockResolvedValue({});

    mocks.settingsServiceMock.getAllSettings.mockResolvedValue({});
    mocks.settingsServiceMock.getCompanyInfo.mockResolvedValue({ company_token: 'TOKEN-123' });
    mocks.settingsServiceMock.updateSettings.mockResolvedValue({});

    mocks.paymentServiceMock.getPendingPlan.mockResolvedValue({});
    mocks.paymentServiceMock.getBillingHistory.mockResolvedValue([]);
    mocks.paymentServiceMock.syncPayMongoSubscription.mockResolvedValue({});
    mocks.paymentServiceMock.changePayMongoPlan.mockResolvedValue({ effective_immediately: true });
    mocks.paymentServiceMock.cancelPayMongoSubscription.mockResolvedValue({ message: 'Cancelled' });
    mocks.paymentServiceMock.setupPayMongoRecurring.mockResolvedValue({ checkoutLink: 'https://example.test/checkout' });
    mocks.paymentServiceMock.migrateToPayMongo.mockResolvedValue({});

    mocks.tenantLocationServiceMock.listTenantLocationsWithMeta.mockResolvedValue({ rows: [], meta: {} });
    mocks.tenantLocationServiceMock.createTenantLocation.mockResolvedValue({});
    mocks.tenantLocationServiceMock.updateTenantLocation.mockResolvedValue({});
    mocks.tenantLocationServiceMock.deactivateTenantLocation.mockResolvedValue({});
    mocks.tenantLocationServiceMock.reactivateTenantLocation.mockResolvedValue({});

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('normalizes route+hash deep links and scrolls to known section targets', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    renderSettings('/settings?tab=company#section-final-review');

    await screen.findByRole('button', { name: /Compliance/i });
    await waitFor(() => {
      expect(screen.getByText('Final Review')).toBeTruthy();
      expect(scrollSpy).toHaveBeenCalled();
    });
  });

  it('preserves unrelated query params when switching tabs', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=subscription&paypal_setup=success&foo=bar');
    await screen.findByRole('button', { name: /System/i });

    await user.click(screen.getByRole('button', { name: /System/i }));

    await waitFor(() => {
      const value = screen.getByTestId('location-search').textContent || '';
      expect(value).toContain('tab=system');
      expect(value).toContain('paypal_setup=success');
      expect(value).toContain('foo=bar');
    });
  });

  it('shows non-blocking info when hash target is unknown', async () => {
    renderSettings('/settings?tab=pos#section-does-not-exist');
    await screen.findByRole('button', { name: /POS Setup/i });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /POS Setup/i })).toBeTruthy();
      expect(mocks.toastMock.info).toHaveBeenCalled();
    });
  });

  it('keeps settings actions available when hash is malformed', async () => {
    const user = userEvent.setup();
    renderSettings('/settings?tab=profile#%5Bbad-selector');

    await screen.findByRole('button', { name: /Profile/i });
    await user.click(screen.getByRole('button', { name: /System/i }));

    await waitFor(() => {
      const value = screen.getByTestId('location-search').textContent || '';
      expect(value).toContain('tab=system');
    });
    expect(mocks.toastMock.info).toHaveBeenCalled();
  });

  it('keeps key Settings actions wired to concrete outcomes', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=profile');
    await screen.findByRole('button', { name: /Save Changes/i });

    await user.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => {
      expect(mocks.settingsServiceMock.updateSettings).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /Company/i }));
    await user.click(screen.getByRole('button', { name: /Manage Users/i }));
    expect(await screen.findByText('UserManagementModal')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /POS Setup/i }));
    await user.click(screen.getByRole('button', { name: /Add Terminal/i }));
    expect(await screen.findByLabelText(/Remove terminal 1/i)).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Main Branch'), 'HQ Branch');
    await user.type(screen.getByPlaceholderText('Street, City, Province'), 'Iloilo City');
    await user.click(screen.getByRole('button', { name: /Add Location/i }));
    await waitFor(() => {
      expect(mocks.tenantLocationServiceMock.createTenantLocation).toHaveBeenCalledTimes(1);
    });
  });

  it('shows feedback when clipboard copy fails', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock }
    });

    renderSettings('/settings?tab=company');
    await screen.findByRole('button', { name: /Company/i });
    await user.click(screen.getByRole('button', { name: /Copy company token/i }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(mocks.toastMock.error).toHaveBeenCalledWith('Clipboard copy failed. Please copy the value manually.');
    });
  });
});
