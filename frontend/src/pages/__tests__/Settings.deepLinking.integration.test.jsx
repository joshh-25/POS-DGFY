/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    requestEmailChangeOtp: vi.fn(),
    changePassword: vi.fn()
  },
  settingsServiceMock: {
    getAllSettings: vi.fn(),
    getCompanyInfo: vi.fn(),
    updateSettings: vi.fn(),
    uploadStorefrontAsset: vi.fn(),
    deleteStorefrontAsset: vi.fn()
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
    deleteTenantLocation: vi.fn(),
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

vi.mock('../../components/maps/MapPinPicker.jsx', () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange?.({ latitude: 10.720263, longitude: 122.599488, address_line: 'Iloilo City, Iloilo, Philippines' })}
    >
      MapPicker
    </button>
  )
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
    vi.restoreAllMocks();
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

    mocks.settingsServiceMock.getAllSettings.mockResolvedValue({
      storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
      storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
      store_is_visible: { value: false, data_type: 'boolean' },
      customer_access_mode: { value: 'catalog', data_type: 'string' },
      effective_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
      max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
      platform_max_customer_access_mode: { value: 'transaction', data_type: 'string', source: 'runtime_default' },
      registration_stage_max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
      customer_access_registration_stage: { value: 'informal', data_type: 'string', source: 'runtime' },
      customer_access_limitation_reason: { value: '', data_type: 'string', source: 'runtime' }
    });
    mocks.settingsServiceMock.getCompanyInfo.mockResolvedValue({ company_token: 'TOKEN-123' });
    mocks.settingsServiceMock.updateSettings.mockResolvedValue({});
    mocks.settingsServiceMock.uploadStorefrontAsset.mockResolvedValue({ image_url: '/uploads/storefront-assets/t1/new.png' });
    mocks.settingsServiceMock.deleteStorefrontAsset.mockResolvedValue({ deleted: true });

    mocks.paymentServiceMock.getPendingPlan.mockResolvedValue({});
    mocks.paymentServiceMock.getBillingHistory.mockResolvedValue([]);
    mocks.paymentServiceMock.syncPayMongoSubscription.mockResolvedValue({});
    mocks.paymentServiceMock.changePayMongoPlan.mockResolvedValue({ effective_immediately: true });
    mocks.paymentServiceMock.cancelPayMongoSubscription.mockResolvedValue({ message: 'Cancelled' });
    mocks.paymentServiceMock.setupPayMongoRecurring.mockResolvedValue({ checkoutLink: 'https://example.test/checkout' });
    mocks.paymentServiceMock.migrateToPayMongo.mockResolvedValue({});

    mocks.tenantLocationServiceMock.listTenantLocationsWithMeta.mockResolvedValue({
      rows: [
        { location_id: 11, name: 'Main Branch', is_active: true, is_primary_storefront: true },
        { location_id: 12, name: 'East Branch', is_active: true, is_primary_storefront: false },
        { location_id: 13, name: 'Old Popup Pin', is_active: false, is_primary_storefront: false }
      ],
      meta: {}
    });
    mocks.tenantLocationServiceMock.createTenantLocation.mockResolvedValue({});
    mocks.tenantLocationServiceMock.updateTenantLocation.mockResolvedValue({});
    mocks.tenantLocationServiceMock.deactivateTenantLocation.mockResolvedValue({});
    mocks.tenantLocationServiceMock.deleteTenantLocation.mockResolvedValue({});
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

  it('shows Customer Access Mode runtime enforcement as active by default', async () => {
    renderSettings('/settings?tab=storefront#storefront-access-settings');

    expect(await screen.findByText(/Runtime enforcement: Enforced/i)).toBeTruthy();
    expect(screen.getByText(/Public Storefront access-mode enforcement is active for this tenant/i)).toBeTruthy();
  });

  it('uses backend-computed customer access metadata for effective and max mode display', async () => {
    mocks.settingsServiceMock.getAllSettings.mockResolvedValueOnce({
      storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
      storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
      store_is_visible: { value: true, data_type: 'boolean' },
      customer_access_mode: { value: 'transaction', data_type: 'string' },
      effective_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
      max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
      platform_max_customer_access_mode: { value: 'transaction', data_type: 'string', source: 'runtime_default' },
      registration_stage_max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
      customer_access_registration_stage: { value: 'informal', data_type: 'string', source: 'runtime' },
      customer_access_limitation_reason: {
        value: 'Registration stage informal allows up to catalog mode.',
        data_type: 'string',
        source: 'runtime'
      }
    });

    renderSettings('/settings?tab=storefront#storefront-access-settings');

    expect(await screen.findByText(/Effective mode:/i)).toBeTruthy();
    const accessModeSelect = screen.getByLabelText('Customer Access Mode');
    expect(within(accessModeSelect).getByRole('option', { name: 'Transaction' }).disabled).toBe(false);
    expect(screen.getByText(/Max allowed:/i)).toBeTruthy();
    expect(screen.getByText(/Platform max:/i)).toBeTruthy();
    expect(screen.getByText(/Registration max:/i)).toBeTruthy();
    expect(screen.getByText(/Company admins can request modes up to platform max/i)).toBeTruthy();
    expect(screen.getByText('Registration stage informal allows up to catalog mode.')).toBeTruthy();
  });

  it('refreshes backend-computed customer access metadata after saving a requested mode', async () => {
    const user = userEvent.setup();
    mocks.settingsServiceMock.getAllSettings
      .mockResolvedValueOnce({
        storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
        storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
        store_is_visible: { value: true, data_type: 'boolean' },
        customer_access_mode: { value: 'catalog', data_type: 'string' },
        effective_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
        max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
        platform_max_customer_access_mode: { value: 'transaction', data_type: 'string', source: 'runtime_default' },
        registration_stage_max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
        customer_access_registration_stage: { value: 'informal', data_type: 'string', source: 'runtime' },
        customer_access_limitation_reason: { value: '', data_type: 'string', source: 'runtime' }
      })
      .mockResolvedValueOnce({
        storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
        storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
        store_is_visible: { value: true, data_type: 'boolean' },
        customer_access_mode: { value: 'transaction', data_type: 'string' },
        effective_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
        max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
        platform_max_customer_access_mode: { value: 'transaction', data_type: 'string', source: 'runtime_default' },
        registration_stage_max_customer_access_mode: { value: 'catalog', data_type: 'string', source: 'runtime' },
        customer_access_registration_stage: { value: 'informal', data_type: 'string', source: 'runtime' },
        customer_access_limitation_reason: {
          value: 'Registration stage informal allows up to catalog mode.',
          data_type: 'string',
          source: 'runtime'
        }
      });

    renderSettings('/settings?tab=storefront#storefront-access-settings');
    const accessModeSelect = await screen.findByLabelText('Customer Access Mode');

    await user.selectOptions(accessModeSelect, 'transaction');
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mocks.settingsServiceMock.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ customer_access_mode: 'transaction' })
      );
      expect(mocks.settingsServiceMock.getAllSettings).toHaveBeenLastCalledWith({ force: true });
    });
    expect(accessModeSelect.value).toBe('transaction');
    expect(screen.getByText('Registration stage informal allows up to catalog mode.')).toBeTruthy();
    expect(screen.getByText(/Effective mode:/i).textContent).toContain('catalog');
  });

  it('persists public map and storefront page visibility from Settings', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=storefront');
    const visibilitySwitch = await screen.findByRole('switch', {
      name: /Show company on DGFY map and public storefront page/i
    });

    expect(visibilitySwitch.getAttribute('aria-checked')).toBe('false');

    await user.click(visibilitySwitch);
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mocks.settingsServiceMock.updateSettings).toHaveBeenCalled();
    });
    const latestPayload = mocks.settingsServiceMock.updateSettings.mock.calls.at(-1)?.[0] || {};
    expect(latestPayload.store_is_visible).toBe(true);
  });

  it('warns when public visibility is enabled without an active primary storefront pin', async () => {
    mocks.settingsServiceMock.getAllSettings.mockResolvedValueOnce({
      storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
      storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
      store_is_visible: { value: true, data_type: 'boolean' }
    });
    mocks.tenantLocationServiceMock.listTenantLocationsWithMeta.mockResolvedValueOnce({
      rows: [
        { location_id: 13, name: 'Old Popup Pin', is_active: false, is_primary_storefront: true }
      ],
      meta: {}
    });

    renderSettings('/settings?tab=storefront');

    expect(await screen.findByText(/will not publish until an active primary storefront pin is saved/i)).toBeTruthy();
  });

  it('blocks Settings location creation until a usable Philippines map pin exists', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=storefront');
    await screen.findByText('MapPicker');
    await user.clear(screen.getByPlaceholderText('Main Branch'));
    await user.type(screen.getByPlaceholderText('Main Branch'), 'Unpinned Branch');
    await user.clear(screen.getByPlaceholderText('Street, City, Province'));
    await user.type(screen.getByPlaceholderText('Street, City, Province'), 'Unpinned Road');

    await user.click(screen.getByRole('button', { name: /Add Location/i }));

    expect(mocks.toastMock.error).toHaveBeenCalledWith('Please pin the location on the map.');
    expect(mocks.tenantLocationServiceMock.createTenantLocation).not.toHaveBeenCalled();
  });

  it('blocks Settings edits of legacy 0,0 locations until the map pin is replaced', async () => {
    const user = userEvent.setup();
    mocks.tenantLocationServiceMock.listTenantLocationsWithMeta.mockResolvedValueOnce({
      rows: [
        {
          location_id: 99,
          name: 'Legacy Zero Pin',
          address_line: 'Legacy Road',
          latitude: 0,
          longitude: 0,
          is_active: true,
          is_primary_storefront: true
        }
      ],
      meta: {}
    });

    renderSettings('/settings?tab=storefront');
    await screen.findByText('Legacy Zero Pin');
    await user.click(screen.getByRole('button', { name: /Edit/i }));
    await user.click(screen.getByRole('button', { name: /Update Location/i }));

    expect(mocks.toastMock.error).toHaveBeenCalledWith('Please pin the location on the map.');
    expect(mocks.tenantLocationServiceMock.updateTenantLocation).not.toHaveBeenCalled();
  });

  it('persists reversible no-location storefront setup and restores map pin editing', async () => {
    const user = userEvent.setup();
    mocks.settingsServiceMock.getAllSettings.mockResolvedValueOnce({
      storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
      storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
      store_is_visible: { value: true, data_type: 'boolean' },
      store_has_no_location: { value: false, data_type: 'boolean' }
    });

    renderSettings('/settings?tab=storefront');
    const noLocationLabel = await screen.findByText('This Store Has No Location');
    const noLocationCard = noLocationLabel.closest('.rounded-lg');
    const noLocationSwitch = within(noLocationCard).getByRole('switch');

    expect(screen.getByText('MapPicker')).toBeTruthy();
    await user.click(noLocationSwitch);

    expect(screen.queryByText('MapPicker')).toBeNull();
    expect(screen.getAllByText(/Location actions are paused while the store is excluded from map pins/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(mocks.settingsServiceMock.updateSettings).toHaveBeenCalled());
    expect(mocks.settingsServiceMock.updateSettings.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      store_is_visible: true,
      store_has_no_location: true
    }));

    await user.click(noLocationSwitch);
    expect(await screen.findByText('MapPicker')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'MapPicker' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Street, City, Province').value).toBe('Iloilo City, Iloilo, Philippines');
    });
    await user.clear(screen.getByPlaceholderText('Main Branch'));
    await user.type(screen.getByPlaceholderText('Main Branch'), 'Restored Branch');
    await user.clear(screen.getByPlaceholderText('Street, City, Province'));
    await user.type(screen.getByPlaceholderText('Street, City, Province'), 'Restored Road');
    const primaryPinLabel = screen.getByText('Primary Storefront Pin');
    const primaryPinCard = primaryPinLabel.closest('.space-y-2');
    await user.click(within(primaryPinCard).getByRole('switch'));
    await user.click(screen.getByRole('button', { name: /Add Location/i }));

    await waitFor(() => expect(mocks.tenantLocationServiceMock.createTenantLocation).toHaveBeenCalled());
    expect(mocks.tenantLocationServiceMock.createTenantLocation.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      name: 'Restored Branch',
      address_line: 'Restored Road',
      latitude: 10.720263,
      longitude: 122.599488,
      is_primary_storefront: true
    }));
  });

  it('shows Customer Access Mode rollback status when the backend runtime flag is disabled', async () => {
    mocks.settingsServiceMock.getAllSettings.mockResolvedValueOnce({
      storefront_cover_image_url: { value: '/uploads/storefront-assets/t1/cover.png' },
      storefront_profile_image_url: { value: '/uploads/storefront-assets/t1/profile.png' },
      customer_access_modes_enabled: { value: false, data_type: 'boolean', source: 'runtime' }
    });

    renderSettings('/settings?tab=storefront#storefront-access-settings');

    expect(await screen.findByText(/Runtime enforcement: Rollback active/i)).toBeTruthy();
    expect(screen.getByText(/globally disabled except for allowlisted tenants/i)).toBeTruthy();
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

  it('blocks accepted users from clearing the required phone number', async () => {
    const user = userEvent.setup();
    mocks.storeState.currentUser = {
      ...mocks.storeState.currentUser,
      phone_number: '+63 912 345 6789'
    };
    mocks.userServiceMock.getCurrentUser.mockResolvedValue(mocks.storeState.currentUser);

    renderSettings('/settings?tab=profile');
    const phoneInput = await screen.findByLabelText(/Phone Number/i);
    await user.clear(phoneInput);
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mocks.toastMock.error).toHaveBeenCalledWith('Phone number is required');
    });
    expect(mocks.userServiceMock.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects password changes shorter than 8 characters before API submission', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=profile');
    await screen.findByRole('button', { name: /Save Changes/i });

    await user.type(screen.getByPlaceholderText('Current Password'), 'old-password');
    await user.type(screen.getByPlaceholderText('New Password'), 'abcdefg');
    await user.type(screen.getByPlaceholderText('Confirm New Password'), 'abcdefg');
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mocks.toastMock.error).toHaveBeenCalledWith('New password must be at least 8 characters');
    });
    expect(mocks.userServiceMock.changePassword).not.toHaveBeenCalled();
  });

  it('generates a matching 16-character password in Settings', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=profile');
    await screen.findByRole('button', { name: /Save Changes/i });

    await user.click(screen.getByRole('button', { name: /generate/i }));

    const password = screen.getByPlaceholderText('New Password').value;
    expect(password).toHaveLength(16);
    expect(screen.getByPlaceholderText('Confirm New Password').value).toBe(password);
    expect(screen.getByText('At least 8 characters')).toBeTruthy();
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
    expect(await screen.findByLabelText(/Terminal location 1/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Storefront/i }));
    await user.click(await screen.findByRole('button', { name: 'MapPicker' }));
    await user.type(screen.getByPlaceholderText('Main Branch'), 'HQ Branch');
    await user.clear(screen.getByPlaceholderText('Street, City, Province'));
    await user.type(screen.getByPlaceholderText('Street, City, Province'), 'Iloilo City');
    await user.click(screen.getByRole('button', { name: /Add Location/i }));
    await waitFor(() => {
      expect(mocks.tenantLocationServiceMock.createTenantLocation).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /Delete Pin/i }));
    expect(await screen.findByRole('heading', { name: /Delete Location Pin/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Delete Permanently/i }));
    await waitFor(() => {
      expect(mocks.tenantLocationServiceMock.deleteTenantLocation).toHaveBeenCalledWith(13);
    });
  });

  it('keeps active locations on the deactivate path before permanent delete', async () => {
    renderSettings('/settings?tab=storefront');
    await screen.findByRole('button', { name: /Delete Pin/i });

    expect(screen.getAllByText(/Deactivate before permanent delete/i)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Deactivate/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Delete Pin/i })).toHaveLength(1);
  });

  it('surfaces location delete blockers for inactive pins without deleting', async () => {
    const user = userEvent.setup();
    mocks.tenantLocationServiceMock.deleteTenantLocation.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          message: 'Location has operational history and cannot be permanently deleted. Deactivate it instead.',
          errors: {
            reference_counts: {
              posTransactions: 2,
              serviceBookings: 1,
              total: 3
            }
          }
        }
      }
    });

    renderSettings('/settings?tab=storefront');
    await screen.findByRole('button', { name: /Delete Pin/i });

    await user.click(screen.getByRole('button', { name: /Delete Pin/i }));
    await user.click(await screen.findByRole('button', { name: /Delete Permanently/i }));

    expect(await screen.findByText(/POS transactions: 2/i)).toBeTruthy();
    expect(await screen.findByText(/Service bookings: 1/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Deactivate Instead/i })).toBeNull();
    expect(mocks.tenantLocationServiceMock.deactivateTenantLocation).not.toHaveBeenCalled();
  });

  it('persists terminal registry location_id in save payload', async () => {
    const user = userEvent.setup();

    renderSettings('/settings?tab=pos');
    await screen.findByRole('button', { name: /POS Setup/i });

    await user.click(screen.getByRole('button', { name: /Add Terminal/i }));
    await user.type(screen.getByPlaceholderText('COUNTER-01'), 'COUNTER-01');

    const terminalLocationSelect = await screen.findByLabelText(/Terminal location/i);
    await user.selectOptions(terminalLocationSelect, '11');

    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mocks.settingsServiceMock.updateSettings).toHaveBeenCalled();
    });
    const latestPayload = mocks.settingsServiceMock.updateSettings.mock.calls.at(-1)?.[0] || {};
    expect(Array.isArray(latestPayload.pos_terminal_registry)).toBe(true);
    expect(latestPayload.pos_terminal_registry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          terminal_id: 'COUNTER-01',
          location_id: 11
        })
      ])
    );
  });

  it('supports storefront cover/profile upload and remove actions', async () => {
    const user = userEvent.setup();
    renderSettings('/settings?tab=storefront');
    await screen.findByRole('button', { name: /Storefront/i });

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    expect(fileInputs.length).toBeGreaterThanOrEqual(2);
    const coverFile = new File(['cover'], 'cover.png', { type: 'image/png' });
    await user.upload(fileInputs[0], coverFile);

    await waitFor(() => {
      expect(mocks.settingsServiceMock.uploadStorefrontAsset).toHaveBeenCalledWith('cover', expect.any(File));
    });

    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/i });
    await user.click(removeButtons[0]);
    await waitFor(() => {
      expect(mocks.settingsServiceMock.deleteStorefrontAsset).toHaveBeenCalledWith('cover');
    });
  });

  it('disables storefront branding uploads for non-admin users without micropermission', async () => {
    mocks.storeState.currentUser = {
      username: 'staff1',
      email: 'staff1@example.com',
      role: 'staff',
      is_master_admin: false,
      permissions: ['settings:view'],
      company: {
        plan: 'premium',
        payment_method: 'paymongo',
        subscription_status: 'active'
      }
    };
    mocks.userServiceMock.getCurrentUser.mockResolvedValue(mocks.storeState.currentUser);

    renderSettings('/settings?tab=storefront');
    await screen.findByRole('button', { name: /Storefront/i });

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    expect(fileInputs.length).toBeGreaterThanOrEqual(2);
    fileInputs.forEach((input) => {
      expect(input.hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByText(/settings:storefront_branding_edit/i)).toBeTruthy();
  });

  it('allows storefront branding uploads for non-admin users with micropermission', async () => {
    mocks.storeState.currentUser = {
      username: 'manager1',
      email: 'manager1@example.com',
      role: 'manager',
      is_master_admin: false,
      permissions: ['settings:view', 'settings:storefront_branding_edit'],
      company: {
        plan: 'premium',
        payment_method: 'paymongo',
        subscription_status: 'active'
      }
    };
    mocks.userServiceMock.getCurrentUser.mockResolvedValue(mocks.storeState.currentUser);

    renderSettings('/settings?tab=storefront');
    await screen.findByRole('button', { name: /Storefront/i });

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    expect(fileInputs.length).toBeGreaterThanOrEqual(2);
    fileInputs.forEach((input) => {
      expect(input.hasAttribute('disabled')).toBe(false);
    });
  });

  it('reset clears local storefront media previews', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderSettings('/settings?tab=storefront');
    await screen.findByRole('button', { name: /Save Changes/i });
    expect(screen.getByAltText('Storefront cover preview')).toBeTruthy();
    expect(screen.getByAltText('Storefront profile preview')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Reset/i }));

    await waitFor(() => {
      expect(screen.getByText('No cover photo uploaded')).toBeTruthy();
      expect(screen.getByText('No icon')).toBeTruthy();
    });

    expect(consoleErrorSpy.mock.calls.some((call) => (
      call.some((part) => String(part).includes('A component is changing a controlled input to be uncontrolled'))
    ))).toBe(false);
    consoleErrorSpy.mockRestore();
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
