/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    getAllSettings: vi.fn(),
    uploadStorefrontAsset: vi.fn()
  },
  tenantLocationServiceMock: {
    createTenantLocation: vi.fn(),
    listTenantLocations: vi.fn(),
    updateTenantLocation: vi.fn()
  },
  storefrontCatalogServiceMock: {
    uploadStorefrontCatalogImage: vi.fn(),
    uploadStorefrontCatalogImages: vi.fn()
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
vi.mock('../../../services/onboardingService.js', () => mocks.onboardingServiceMock);
vi.mock('../../../services/settingsService.js', () => mocks.settingsServiceMock);
vi.mock('../../../services/tenantLocationService.js', () => mocks.tenantLocationServiceMock);
vi.mock('../../../services/storefrontCatalogService.js', () => mocks.storefrontCatalogServiceMock);
vi.mock('@/src/components/maps/MapPinPicker.jsx', () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange?.({ latitude: 14.599512, longitude: 120.984246, address_line: 'Mock Pin Road, Manila' })}
    >
      Mock MapLibre Pin
    </button>
  )
}));
vi.mock('../../../components/maps/MapPinPicker.jsx', () => ({
  default: ({ onChange }) => (
    <button
      type="button"
      onClick={() => onChange?.({ latitude: 14.599512, longitude: 120.984246, address_line: 'Mock Pin Road, Manila' })}
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
    mocks.settingsServiceMock.getAllSettings.mockResolvedValue({
      store_is_visible: { value: false }
    });
    mocks.tenantLocationServiceMock.listTenantLocations.mockResolvedValue([]);
    mocks.tenantLocationServiceMock.createTenantLocation.mockResolvedValue({ location_id: 5, name: 'Main' });
    mocks.tenantLocationServiceMock.updateTenantLocation.mockResolvedValue({ location_id: 5, name: 'Main' });
    mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImage.mockResolvedValue({});
    mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImages.mockResolvedValue({});
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

  it('unlocks saved reachable setup steps from server onboarding progress', async () => {
    const user = userEvent.setup();
    renderModal({
      onboarding: {
        ...baseOnboarding,
        tenant_onboarding_progress: {
          step_payloads: {
            brand_assets: { skipped: true },
            primary_location: {
              location_id: 5,
              public_storefront_visible: true
            }
          },
          checklist_snapshot: {
            required_total: 3,
            completed_required_count: 2,
            missing_requirements: ['has_priced_starter_item']
          }
        }
      }
    });

    const starterStep = screen.getByRole('button', { name: /Step 3: Menu Item/i });
    expect(starterStep.getAttribute('aria-disabled')).toBeNull();

    await user.click(starterStep);

    expect(screen.getByText(/3\) Menu Item/i)).toBeTruthy();
  });

  it('creates a primary storefront location and saves onboarding progress', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.click(screen.getByLabelText(/Make storefront searchable to customers/i));

    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    fireEvent.change(screen.getByLabelText(/Close Time/i), { target: { value: '20:00' } });
    await user.click(screen.getByRole('button', { name: /Add Time Set/i }));
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
          public_storefront_visible: true,
          business_hours: expect.objectContaining({
            mode: 'weekly',
            weekly: expect.objectContaining({
              mon: expect.objectContaining({ close: '20:00' })
            })
          })
        })
      });
      expect(screen.getByText(/3\) Menu Item/i)).toBeTruthy();
    });
  });

  it('uses the MapLibre pin picker to populate primary location coordinates', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.click(screen.getByLabelText(/Make storefront searchable to customers/i));
    await user.click(screen.getByRole('button', { name: /Mock MapLibre Pin/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Latitude/i).value).toBe('14.599512');
      expect(screen.getByLabelText(/Longitude/i).value).toBe('120.984246');
      expect(screen.getByLabelText(/Address/i).value).toBe('Mock Pin Road, Manila');
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
    await user.click(screen.getByLabelText(/Make storefront searchable to customers/i));
    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    await screen.findByText(/3\) Menu Item/i);

    expect(screen.getByRole('button', { name: /Complete Onboarding/i }).disabled).toBe(true);
    expect(screen.getByText(/save one priced menu item/i)).toBeTruthy();
    expect(screen.getByRole('option', { name: /^Menu Item$/i })).toBeTruthy();
    await user.type(screen.getByLabelText(/Item name/i), 'Starter Bread');
    await user.type(screen.getByLabelText(/Selling price/i), '25');
    await user.click(screen.getByRole('button', { name: /Add Row/i }));
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalled();
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems.mock.calls[0][0].rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'Starter Bread', mode_item_preset: 'finished_product', location_id: 5 }),
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

  it('only offers Menu Item for F&B starter setup while submitting menu_item for Storefront visibility', async () => {
    const user = userEvent.setup();
    renderModal({
      workflowMode: 'fnb',
      onboarding: {
        ...baseOnboarding,
        tenant_onboarding_progress: {
          step_payloads: {
            brand_assets: { skipped: true },
            primary_location: {
              location_id: 5,
              public_storefront_visible: true
            }
          },
          checklist_snapshot: {
            required_total: 3,
            completed_required_count: 2,
            missing_requirements: ['has_priced_starter_item']
          }
        }
      }
    });

    await user.click(screen.getByRole('button', { name: /Step 3: Menu Item/i }));

    const itemType = screen.getByLabelText(/Item type/i);
    expect(itemType.value).toBe('menu_item');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /^Menu Item$/i })).toBeTruthy();

    await user.type(screen.getByLabelText(/Item name/i), 'Chicken Rice Bowl');
    await user.type(screen.getByLabelText(/Selling price/i), '149');
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalledWith({
        rows: [
          expect.objectContaining({
            name: 'Chicken Rice Bowl',
            mode_item_preset: 'menu_item',
            default_sale_price: '149'
          })
        ]
      });
    });
  });

  it('remaps stale default Food Manufacturing starter rows after settings resolve to F&B', async () => {
    const user = userEvent.setup();
    mocks.settingsServiceMock.getAllSettings.mockResolvedValue({
      ops_workflow_mode: { value: 'fnb' },
      store_is_visible: { value: false }
    });

    renderModal({
      workflowMode: 'food_manufacturing',
      onboarding: {
        ...baseOnboarding,
        tenant_onboarding_progress: {
          step_payloads: {
            brand_assets: { skipped: true },
            primary_location: {
              location_id: 5,
              public_storefront_visible: true
            }
          },
          checklist_snapshot: {
            required_total: 3,
            completed_required_count: 2,
            missing_requirements: ['has_priced_starter_item']
          }
        }
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/Mode: Food & Beverage\./i)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Step 3: Menu Item/i }));

    const itemType = screen.getByLabelText(/Item type/i);
    expect(itemType.value).toBe('menu_item');

    await user.type(screen.getByLabelText(/Item name/i), 'Chicken Rice Bowl');
    await user.type(screen.getByLabelText(/Selling price/i), '149');
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalledWith({
        rows: [
          expect.objectContaining({
            name: 'Chicken Rice Bowl',
            mode_item_preset: 'menu_item',
            default_sale_price: '149'
          })
        ]
      });
    });
  });

  it('retries optional item image upload without resubmitting the created item', async () => {
    const user = userEvent.setup();
    mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImages
      .mockRejectedValueOnce({ response: { data: { message: 'Upload failed.' } } })
      .mockResolvedValueOnce({});

    renderModal();
    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.click(screen.getByLabelText(/Make storefront searchable to customers/i));
    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    await screen.findByText(/3\) Menu Item/i);

    await user.type(screen.getByLabelText(/Item name/i), 'Starter Bread');
    await user.type(screen.getByLabelText(/Selling price/i), '25');
    await user.upload(
      screen.getAllByLabelText(/Item image/i)[0],
      new File(['image'], 'starter.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await screen.findByText(/Upload failed\./i);
    await user.click(screen.getByRole('button', { name: /Retry Image Upload/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.bulkCreateOnboardingItems).toHaveBeenCalledTimes(1);
      expect(mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImages).toHaveBeenCalledTimes(2);
      expect(mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImages.mock.calls[0][1]).toHaveLength(1);
      expect(mocks.toastMock.success).toHaveBeenCalledWith('Item image uploaded.');
    });
  });

  it('limits onboarding item gallery uploads to the backend per-item maximum', async () => {
    const user = userEvent.setup();

    renderModal();
    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.click(screen.getByLabelText(/Make storefront searchable to customers/i));
    await user.clear(screen.getByLabelText(/Location name/i));
    await user.type(screen.getByLabelText(/Location name/i), 'Main Branch');
    await user.type(screen.getByLabelText(/Address/i), '123 Main Street');
    await user.type(screen.getByLabelText(/Latitude/i), '14.5995');
    await user.type(screen.getByLabelText(/Longitude/i), '120.9842');
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));
    await screen.findByText(/3\) Menu Item/i);

    await user.type(screen.getByLabelText(/Item name/i), 'Starter Bread');
    await user.type(screen.getByLabelText(/Selling price/i), '25');
    const files = Array.from({ length: 6 }, (_, index) => (
      new File([`image-${index}`], `starter-${index}.png`, { type: 'image/png' })
    ));
    await user.upload(screen.getAllByLabelText(/Item image/i)[0], files.slice(0, 2));
    const selectedImageCarousel = screen.getByRole('region', { name: /Starter Bread selected image carousel/i });
    expect(selectedImageCarousel).toBeTruthy();
    expect(within(selectedImageCarousel).getAllByRole('button', { name: /Focus selected item image/i })).toHaveLength(2);
    await user.upload(screen.getAllByLabelText(/Item image/i)[0], files.slice(2));
    await waitFor(() => {
      expect(within(selectedImageCarousel).getAllByRole('button', { name: /Focus selected item image/i })).toHaveLength(5);
      expect(within(selectedImageCarousel).getByLabelText(/Selected item image thumbnails/i)).toBeTruthy();
    });
    await user.click(within(selectedImageCarousel).getByRole('button', { name: /Next selected item image/i }));
    await user.click(within(selectedImageCarousel).getByRole('button', { name: /Remove selected item image 2/i }));
    await user.click(screen.getByRole('button', { name: /Save Items/i }));

    await waitFor(() => {
      expect(mocks.toastMock.error).toHaveBeenCalledWith('Only 3 more item images can be selected. Galleries are limited to 5 images.');
      expect(mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImages).toHaveBeenCalledTimes(1);
      expect(mocks.storefrontCatalogServiceMock.uploadStorefrontCatalogImages.mock.calls[0][1]).toHaveLength(4);
    });
  });

  it('can keep the public storefront hidden without creating a default map pin', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    expect(screen.getByLabelText(/Make storefront searchable to customers/i).checked).toBe(false);
    expect(screen.queryByRole('button', { name: /Mock MapLibre Pin/i })).toBeNull();
    expect(screen.getByText(/Turn on searchable storefront before placing the public map pin/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));

    await waitFor(() => {
      expect(mocks.tenantLocationServiceMock.createTenantLocation).not.toHaveBeenCalled();
      expect(mocks.onboardingServiceMock.saveOnboardingStep).toHaveBeenCalledWith({
        stepKey: 'primary_location',
        payload: expect.objectContaining({
          location_id: null,
          public_storefront_visible: false
        })
      });
      expect(screen.getByText(/3\) Menu Item/i)).toBeTruthy();
    });
  });

  it('saves a searchable no-location storefront without creating a map pin', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));
    await screen.findByText(/2\) Main Storefront Location/i);
    await user.click(screen.getByLabelText(/Make storefront searchable to customers/i));
    await user.click(screen.getByLabelText(/This Store Has No Location/i));
    expect(screen.queryByRole('button', { name: /Mock MapLibre Pin/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));

    await waitFor(() => {
      expect(mocks.tenantLocationServiceMock.createTenantLocation).not.toHaveBeenCalled();
      expect(mocks.onboardingServiceMock.saveOnboardingStep).toHaveBeenCalledWith({
        stepKey: 'primary_location',
        payload: expect.objectContaining({
          location_id: null,
          public_storefront_visible: true,
          store_has_no_location: true
        })
      });
      expect(screen.getByText(/3\) Menu Item/i)).toBeTruthy();
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
