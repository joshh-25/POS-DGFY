/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingSetupModal, { OnboardingReminderBanner } from '../components/OnboardingSetupModal.jsx';

const mocks = vi.hoisted(() => ({
  onboardingServiceMock: {
    bulkCreateOnboardingItems: vi.fn(),
    completeOnboarding: vi.fn(),
    saveOnboardingStep: vi.fn(),
    trackOnboardingEvent: vi.fn()
  },
  settingsServiceMock: {
    uploadStorefrontAsset: vi.fn()
  },
  tenantLocationServiceMock: {
    createTenantLocation: vi.fn(),
    listTenantLocations: vi.fn(),
    updateTenantLocation: vi.fn()
  },
  storefrontCatalogServiceMock: {
    uploadStorefrontCatalogImage: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/onboardingService.js', () => mocks.onboardingServiceMock);
vi.mock('@/services/settingsService.js', () => mocks.settingsServiceMock);
vi.mock('@/src/services/tenantLocationService.js', () => mocks.tenantLocationServiceMock);
vi.mock('@/src/services/storefrontCatalogService.js', () => mocks.storefrontCatalogServiceMock);
vi.mock('@/src/components/maps/MapPinPicker.jsx', () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange?.({ latitude: 14.599512, longitude: 120.984246 })}
    >
      Mock MapLibre Pin
    </button>
  )
}));
vi.mock('sonner', () => ({
  toast: mocks.toastMock
}));

const baseOnboarding = {
  tenant_onboarding_state: 'in_progress',
  tenant_onboarding_progress: {
    step_payloads: {},
    checklist_snapshot: {
      required_total: 3,
      completed_required_count: 1,
      missing_requirements: ['has_primary_storefront_location', 'has_priced_starter_item']
    }
  }
};

const baseUser = {
  is_master_admin: true,
  company: {
    name: 'Tenant Example'
  }
};

const renderModal = (props = {}) => render(
  <OnboardingSetupModal
    open
    onboarding={baseOnboarding}
    currentUser={baseUser}
    workflowMode="food_manufacturing"
    onClose={vi.fn()}
    onRefreshUser={vi.fn()}
    {...props}
  />
);

describe('OnboardingSetupModal behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onboardingServiceMock.trackOnboardingEvent.mockResolvedValue({ accepted: true });
    mocks.onboardingServiceMock.saveOnboardingStep.mockResolvedValue({ tenant_onboarding_state: 'in_progress' });
    mocks.onboardingServiceMock.completeOnboarding.mockResolvedValue({ tenant_onboarding_state: 'completed' });
    mocks.onboardingServiceMock.bulkCreateOnboardingItems.mockImplementation(({ rows = [] } = {}) => ({
      workflow_mode: 'food_manufacturing',
      summary: { total: 1, created: 1, failed: 0 },
      results: [
        {
          client_row_id: rows[0]?.client_row_id,
          row_number: 1,
          status: 'created',
          item: { item_id: 10, name: 'Starter Bread' },
          errors: []
        }
      ]
    }));
    mocks.settingsServiceMock.uploadStorefrontAsset.mockResolvedValue({});
    mocks.tenantLocationServiceMock.listTenantLocations.mockResolvedValue([]);
    mocks.tenantLocationServiceMock.createTenantLocation.mockResolvedValue({ location_id: 5, name: 'Main' });
    mocks.tenantLocationServiceMock.updateTenantLocation.mockResolvedValue({ location_id: 5, name: 'Main' });
    mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImage.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the three-step wizard and allows optional assets to be skipped', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByText(/Step 1 of 3/i)).toBeTruthy();
    expect(screen.getByText(/1\) Profile and Cover/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.saveOnboardingStep).toHaveBeenCalledWith({
        stepKey: 'brand_assets',
        payload: expect.objectContaining({ skipped: true })
      });
      expect(screen.getByText(/2\) Main Storefront Location/i)).toBeTruthy();
    });
  });

  it('creates a primary storefront location and saves onboarding progress', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);

    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    fireEvent.change(screen.getAllByDisplayValue('18:00')[1], { target: { value: '20:00' } });
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));

    await waitFor(() => {
      expect(mocks.tenantLocationServiceMock.createTenantLocation).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Main Branch',
        address_line: '123 Main Street',
        latitude: 14.5995,
        longitude: 120.9842,
        is_primary_storefront: true
      }));
      expect(mocks.onboardingServiceMock.saveOnboardingStep).toHaveBeenCalledWith({
        stepKey: 'primary_location',
        payload: expect.objectContaining({
          location_id: 5,
          business_hours: expect.objectContaining({
            mode: 'weekly',
            weekly: expect.objectContaining({
              mon: expect.objectContaining({ close: '20:00' })
            })
          })
        })
      });
      expect(screen.getByText(/3\) Starter Items/i)).toBeTruthy();
    });
  });

  it('uses the MapLibre pin picker to populate primary location coordinates', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.click(screen.getByRole('button', { name: /Mock MapLibre Pin/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Latitude/i).value).toBe('14.599512');
      expect(screen.getByLabelText(/Longitude/i).value).toBe('120.984246');
    });
  });

  it('shows mode-specific item presets and preserves partial row errors', async () => {
    const user = userEvent.setup();
    mocks.onboardingServiceMock.bulkCreateOnboardingItems.mockImplementation(({ rows = [] } = {}) => ({
      workflow_mode: 'food_manufacturing',
      summary: {
        total: rows.length,
        created: rows.filter((row) => String(row.name || '').trim()).length,
        failed: rows.filter((row) => !String(row.name || '').trim()).length
      },
      results: rows.map((row, index) => (
        String(row.name || '').trim()
          ? {
            client_row_id: row.client_row_id,
            row_number: index + 1,
            status: 'created',
            item: { item_id: 10 + index, name: row.name },
            errors: []
          }
          : {
            client_row_id: row.client_row_id,
            row_number: index + 1,
            status: 'failed',
            item: null,
            errors: ['Item name is required.']
          }
      ))
    }));

    renderModal();
    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    await screen.findByText(/3\) Starter Items/i);

    expect(screen.getByRole('button', { name: /Complete Onboarding/i }).disabled).toBe(true);
    expect(screen.getByText(/save at least one priced starter item/i)).toBeTruthy();
    expect(screen.getByRole('option', { name: /Finished Product/i })).toBeTruthy();
    await user.type(screen.getByLabelText(/Item name/i), 'Starter Bread');
    await user.type(screen.getByLabelText(/Selling price/i), '25');
    await user.click(screen.getByRole('button', { name: /Add Row/i }));
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalled();
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems.mock.calls[0][0].rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'Starter Bread', location_id: 5 }),
        expect.objectContaining({ name: '', location_id: 5 })
      ]));
      expect(screen.getByText(/Created\./i)).toBeTruthy();
      expect(screen.getByText(/Item name is required\./i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Complete Onboarding/i }).disabled).toBe(false);
    });

    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalledTimes(2);
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems.mock.calls[1][0].rows).toHaveLength(1);
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems.mock.calls[1][0].rows[0]).toEqual(expect.objectContaining({
        name: '',
        location_id: 5
      }));
    });
  });

  it('retries optional item image upload without resubmitting the created item', async () => {
    const user = userEvent.setup();
    mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImage
      .mockRejectedValueOnce({ response: { data: { message: 'Upload failed.' } } })
      .mockResolvedValueOnce({});

    renderModal();
    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    await screen.findByText(/3\) Starter Items/i);

    await user.type(screen.getByLabelText(/Item name/i), 'Starter Bread');
    await user.type(screen.getByLabelText(/Selling price/i), '25');
    await user.upload(
      screen.getByLabelText(/Item image/i),
      new File(['image'], 'starter.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await screen.findByText(/Upload failed\./i);
    await user.click(screen.getByRole('button', { name: /Retry Image Upload/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalledTimes(1);
      expect(mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImage).toHaveBeenCalledTimes(2);
      expect(mocks.toastMock.success).toHaveBeenCalledWith('Item image uploaded.');
    });
  });
});

describe('OnboardingReminderBanner behavior', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders progress and action when onboarding is incomplete', () => {
    const onOpenWizard = vi.fn();
    render(<OnboardingReminderBanner onboarding={baseOnboarding} onOpenWizard={onOpenWizard} />);
    expect(screen.getByText(/Tenant onboarding is incomplete/i)).toBeTruthy();
    expect(screen.getByText(/Completion progress: 1\/3 required checks\./i)).toBeTruthy();
  });

  it('does not render when onboarding is completed', () => {
    render(
      <OnboardingReminderBanner
        onboarding={{ ...baseOnboarding, tenant_onboarding_state: 'completed' }}
        onOpenWizard={vi.fn()}
      />
    );
    expect(screen.queryByText(/Tenant onboarding is incomplete/i)).toBeNull();
  });
});
