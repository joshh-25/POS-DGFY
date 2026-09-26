/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PosSettingsWorkspace from '../settings/PosSettingsWorkspace.jsx';
import PosBusinessReceiptsSection from '../settings/PosBusinessReceiptsSection.jsx';
import { deleteStorefrontAsset, getAllSettings, getCompanyInfo, getDiscountRules, updateSettingByKey, updateSettings, uploadStorefrontAsset } from '@/services/settingsService.js';
import { updateProfile } from '@/services/userService.js';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { listStorefrontReviews } from '../settings/storefrontReviewsService.js';

vi.mock('@/services/settingsService.js', async (importOriginal) => ({
  ...await importOriginal(),
  getAllSettings: vi.fn(),
  getCompanyInfo: vi.fn().mockResolvedValue(null),
  getDiscountRules: vi.fn(),
  deleteStorefrontAsset: vi.fn(),
  updateSettingByKey: vi.fn(),
  updateSettings: vi.fn(),
  uploadStorefrontAsset: vi.fn()
}));
vi.mock('@/services/userService.js', async (importOriginal) => ({
  ...await importOriginal(),
  updateProfile: vi.fn()
}));
vi.mock('@/services/tenantLocationService.js', async (importOriginal) => ({
  ...await importOriginal(),
  listTenantLocations: vi.fn().mockResolvedValue([])
}));
vi.mock('@/src/utils/iminRuntimeFeedback.js', async (importOriginal) => ({
  ...await importOriginal(),
  posToast: { success: vi.fn(), error: vi.fn() }
}));
vi.mock('../settings/storefrontReviewsService.js', () => ({
  listStorefrontReviews: vi.fn()
}));

const buildProps = (overrides = {}) => ({
  initialTab: 'profile',
  sectionId: 'settings-test',
  terminalUser: {
    user_id: 42,
    username: 'Test Operator',
    email: 'operator@example.test',
    phone_number: '+639000000000',
    permissions: []
  },
  terminalMeta: {},
  locationsState: { locations: [] },
  locked: false,
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  listTenantLocations.mockResolvedValue([]);
  getAllSettings.mockResolvedValue({});
  getDiscountRules.mockResolvedValue([]);
  updateProfile.mockResolvedValue({});
  deleteStorefrontAsset.mockResolvedValue({});
  updateSettingByKey.mockResolvedValue({});
  updateSettings.mockResolvedValue({});
  uploadStorefrontAsset.mockResolvedValue({});
  listStorefrontReviews.mockResolvedValue({
    reviews: [{ review_id: 'review-1', reviewer_name: 'Juan D.', rating: 5, comment: 'Fast delivery.', submitted_at: '2026-09-12T10:24:00.000Z' }],
    summary: { average_rating: 5, total_count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } }
  });
});
afterEach(cleanup);

describe('extracted POS Settings workspace', () => {
  it('switches the Business Admin POS settings tabs and moves the active underline state', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'pos_setup',
      allowedTabIds: ['pos_setup', 'taxes', 'discounts'],
      terminalUser: { ...buildProps().terminalUser, is_master_admin: true }
    })} />);

    const posSetupTab = await screen.findByRole('tab', { name: 'POS Setup', exact: true });
    const taxesTab = screen.getByRole('tab', { name: 'Taxes', exact: true });
    const discountsTab = screen.getByRole('tab', { name: 'Discounts', exact: true });

    expect(posSetupTab.getAttribute('aria-selected')).toBe('true');
    expect(taxesTab.getAttribute('aria-selected')).toBe('false');
    expect(discountsTab.getAttribute('aria-selected')).toBe('false');
    expect(posSetupTab.className).toContain('border-[#1A4E8D]');

    fireEvent.click(taxesTab);
    await waitFor(() => {
      expect(taxesTab.getAttribute('aria-selected')).toBe('true');
      expect(posSetupTab.getAttribute('aria-selected')).toBe('false');
      expect(screen.getByRole('heading', { name: 'Taxes', exact: true })).toBeTruthy();
    });
    expect(taxesTab.className).toContain('border-[#1A4E8D]');

    fireEvent.click(discountsTab);
    await waitFor(() => {
      expect(discountsTab.getAttribute('aria-selected')).toBe('true');
      expect(taxesTab.getAttribute('aria-selected')).toBe('false');
      expect(screen.getByRole('heading', { name: 'Discount Management', exact: true })).toBeTruthy();
    });
    expect(discountsTab.className).toContain('border-[#1A4E8D]');
  });

  it('preserves a profile draft across tabs and saves only the profile payload', async () => {
    const onRefreshTerminalUser = vi.fn().mockResolvedValue(undefined);
    render(<PosSettingsWorkspace {...buildProps({ onRefreshTerminalUser })} />);
    expect(await screen.findByText('Test Operator')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save Profile' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    const username = await screen.findByDisplayValue('Test Operator');
    fireEvent.change(username, { target: { value: 'Updated Operator' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Storefront', exact: true }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Profile' })).toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: 'Profile Setting', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(await screen.findByDisplayValue('Updated Operator')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
      username: 'Updated Operator',
      email: 'operator@example.test',
      phone_number: '+639000000000'
    }));
    expect(onRefreshTerminalUser).toHaveBeenCalledWith({ suppressGlobalErrors: true });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('exposes the Taxes tab to POS settings editors and saves the category VAT policy', async () => {
    const settingsPayload = {
      pos_tax_policies: {
        value: {
          version: 3,
          categories: {
            senior: { vat_treatment: 'vat_exempt' },
            pwd: { vat_treatment: 'vat_exempt' },
            manual: { vat_treatment: 'standard' },
            employee: { vat_treatment: 'standard' },
            promo: { vat_treatment: 'standard' },
            voucher: { vat_treatment: 'standard' }
          }
        }
      }
    };
    getAllSettings.mockResolvedValue(settingsPayload);
    updateSettings.mockResolvedValue({
      pos_tax_policies: {
        value: {
          ...settingsPayload.pos_tax_policies.value,
          version: 4,
          categories: {
            ...settingsPayload.pos_tax_policies.value.categories,
            manual: { vat_treatment: 'vat_exempt' }
          }
        }
      }
    });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'taxes',
      terminalUser: { ...buildProps().terminalUser, is_master_admin: true }
    })} />);

    expect(await screen.findByRole('heading', { name: 'Taxes' })).toBeTruthy();
    const othersTreatment = screen.getByRole('combobox', { name: 'Others VAT treatment' });
    expect(othersTreatment.value).toBe('standard');
    fireEvent.change(othersTreatment, { target: { value: 'vat_exempt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Taxes' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      pos_tax_policies: expect.objectContaining({
        version: 3,
        categories: expect.objectContaining({
          manual: { vat_treatment: 'vat_exempt' }
        })
      })
    }));
    expect(toast.success).toHaveBeenCalledWith('Tax settings synced to shared settings.');
  });

  it('keeps a failed profile save editable and reports the error', async () => {
    updateProfile.mockRejectedValueOnce({ response: { data: { message: 'Profile update rejected' } } });
    render(<PosSettingsWorkspace {...buildProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    fireEvent.change(await screen.findByDisplayValue('Test Operator'), { target: { value: 'Unsaved Operator' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Profile update rejected'));
    expect(screen.getByDisplayValue('Unsaved Operator')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Profile' }).disabled).toBe(false);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('preserves locked controls and permission-based tab visibility', async () => {
    render(<PosSettingsWorkspace {...buildProps({ locked: true })} />);
    expect(await screen.findByText('Test Operator')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Profile' })).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();
    for (const name of ['Payments', 'Delivery Pricing', 'Employees']) {
      expect(screen.queryByRole('button', { name, exact: true })).toBeNull();
    }
  });

  it('recovers from a settings load failure through Retry', async () => {
    getAllSettings.mockRejectedValueOnce({ response: { data: { message: 'Settings unavailable' } } });
    render(<PosSettingsWorkspace {...buildProps()} />);
    expect(await screen.findByText('Settings unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Edit profile' })).toBeTruthy();
    expect(getAllSettings).toHaveBeenCalledTimes(2);
  });

  it('cancels a profile draft and returns to view-only mode', async () => {
    render(<PosSettingsWorkspace {...buildProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    fireEvent.change(await screen.findByDisplayValue('Test Operator'), { target: { value: 'Draft Operator' } });
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByDisplayValue('Draft Operator')).toBeNull();
    expect(await screen.findByText('Test Operator')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save Profile' })).toBeNull();
  });

  it('hides company identity details while editing the profile', async () => {
    getCompanyInfo.mockResolvedValueOnce({ company_name: 'Tenant Company', company_token: 'tenant-token' });
    render(<PosSettingsWorkspace {...buildProps({
      terminalUser: { ...buildProps().terminalUser, is_master_admin: true }
    })} />);
    expect(await screen.findByText('Tenant Company')).toBeTruthy();
    expect(screen.getAllByText('tenant-token').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));

    expect(screen.queryByText('Tenant Company')).toBeNull();
    expect(screen.queryByText('tenant-token')).toBeNull();
  });

  it('does not show the shared unsaved banner while POS visibility auto-save is in progress', async () => {
    const settingsPayload = { pos_open_status: { value: true } };
    let resolveSave;
    getAllSettings.mockImplementation(async () => settingsPayload);
    updateSettings.mockImplementation((payload) => new Promise((resolve) => {
      resolveSave = () => {
        settingsPayload.pos_open_status = { value: payload.pos_open_status };
        resolve(settingsPayload);
      };
    }));

    render(<PosSettingsWorkspace {...buildProps()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'POS Setup', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Operations & Access', exact: true }));

    const visibilityToggle = await screen.findByRole('switch', { name: 'POS visible to customers' });
    expect(visibilityToggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(visibilityToggle);

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ pos_open_status: false })));
    expect(screen.queryByText('Unsaved POS setup changes')).toBeNull();

    resolveSave();
    await waitFor(() => expect(visibilityToggle.getAttribute('aria-checked')).toBe('false'));
    expect(screen.queryByText('Unsaved POS setup changes')).toBeNull();
  });

  it('keeps POS Setup section navigation usable on narrow layouts', async () => {
    render(<PosSettingsWorkspace {...buildProps()} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'POS Setup', exact: true }));
    const subTabList = await screen.findByRole('tablist', { name: 'POS Setup sections' });

    expect(subTabList.firstElementChild.className).toContain('min-w-max');
    expect(subTabList.firstElementChild.className).toContain('flex');
    expect(screen.getByRole('tab', { name: 'Discounts & Automation', exact: true })).toBeTruthy();
  });

  it('lets an empty Business & Receipts setup form be closed after discard or setup start', () => {
    const setPosForm = vi.fn();
    render(<PosBusinessReceiptsSection locked={false} loading={false} posForm={{}} setPosForm={setPosForm} />);

    expect(screen.queryByRole('button', { name: 'Cancel', exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set Up Now', exact: true }));
    expect(screen.getByRole('button', { name: 'Cancel', exact: true })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.getByRole('button', { name: 'Set Up Now', exact: true })).toBeTruthy();
  });

  it('retains the selected Storefront subtab after leaving and returning to POS Settings', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    expect(screen.getByRole('tab', { name: 'Store Content', exact: true }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Profile Setting', exact: true }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Profile Setting', exact: true }).getAttribute('aria-selected')).toBe('true'));

    fireEvent.click(screen.getByRole('tab', { name: 'Storefront', exact: true }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Store Content', exact: true }).getAttribute('aria-selected')).toBe('true'));
  });

  it('provides a read-only Reviews subtab backed by storefront customer reviews', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, company: { id: 'tenant-1' } }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Reviews', exact: true }));

    expect(await screen.findByTestId('storefront-reviews-list')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reviews', exact: true })).toBeTruthy();
    expect(screen.getByText('Juan D.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add Review|Edit Review|Delete Review|Approve|Reject/i })).toBeNull();
    expect(listStorefrontReviews).toHaveBeenCalledWith({ tenantId: 'tenant-1', limit: 50 });
  });

  it('renders Store Content basic information in a compact read-only summary', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_tagline: { value: 'Everyday Filipino essentials, close to home.' },
      storefront_about: { value: 'A handy neighborhood store serving everyday needs.' }
    });

    render(<PosSettingsWorkspace {...buildProps({ initialTab: 'storefront' })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));

    const basicInformation = await screen.findByRole('heading', { name: 'Basic Information', exact: true });
    expect(basicInformation).toBeTruthy();
    expect(screen.getByText('This information will appear on your storefront.')).toBeTruthy();
    expect(screen.getByText('A short phrase that describes your store.')).toBeTruthy();
    expect(screen.getByText('A brief description about your store.')).toBeTruthy();
    expect(screen.getByText('Everyday Filipino essentials, close to home.')).toBeTruthy();
    expect(basicInformation.closest('section')?.textContent).toContain('A handy neighborhood store serving everyday needs.');
    expect(screen.queryByText('Public contact and description')).toBeNull();

    const categoriesSection = screen.getByRole('heading', { name: 'Store Categories', exact: true }).closest('section');
    const whyChooseUsSection = screen.getByRole('heading', { name: 'Why Choose Us', exact: true }).closest('section');
    const socialLinksSection = screen.getByRole('heading', { name: 'Social Links', exact: true }).closest('section');
    const deliveryPartnersSection = screen.getByRole('heading', { name: 'Delivery Partners', exact: true }).closest('section');
    expect(categoriesSection?.parentElement?.className).toContain('lg:col-span-2');
    expect(whyChooseUsSection?.parentElement?.className).toContain('lg:col-span-2');
    expect(socialLinksSection?.parentElement?.className).toContain('lg:col-span-2');
    expect(deliveryPartnersSection?.parentElement?.className).toContain('lg:col-span-2');
  });

  it('uses circular icon-only edit controls for Store Content summaries', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));

    const editControls = [
      screen.getByRole('button', { name: 'Edit basic information', exact: true }),
      screen.getByRole('button', { name: 'Edit Store Image', exact: true }),
      screen.getByRole('button', { name: 'Edit storefront contact information', exact: true })
    ];

    editControls.forEach((control) => {
      expect(control.className).toContain('rounded-full');
      expect(control.className).toContain('w-11');
      expect(control.className).toContain('bg-[#1A4E8D]');
      expect(control.className).toContain('text-white');
      expect(control.textContent).toBe('');
    });
    expect(screen.queryByRole('button', { name: 'Edit reviews', exact: true })).toBeNull();
  });

  it('opens Basic Information in a bounded modal with an expandable About field', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit basic information', exact: true }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.id).toBe('store-basic-information-editor');
    expect(dialog.className).toContain('max-w-2xl');
    expect(dialog.className).toContain('overflow-y-auto');
    expect(screen.getByText('Update the text customers see on your storefront.')).toBeTruthy();
    expect(screen.getByLabelText('Tagline').className).toContain('text-[13px]');
    expect(screen.getByLabelText('About').className).toContain('resize-y');
    const expandAbout = screen.getByRole('button', { name: 'Expand field', exact: true });
    expect(expandAbout.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expandAbout);
    expect(screen.getByRole('button', { name: 'Collapse field', exact: true }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText('Business Hours')).toBeNull();
    expect(screen.queryByText('Create Time Set')).toBeNull();
    expect(screen.queryByText('Schedule Sets')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves Business Hours into the Business Hours and Locations subtab', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_hours: {
        value: {
          weekly: {
            mon: { enabled: true, intervals: [{ open: '08:00', close: '21:00' }] },
            tue: { enabled: true, intervals: [{ open: '08:00', close: '21:00' }] },
            wed: { enabled: true, intervals: [{ open: '08:00', close: '21:00' }] },
            thu: { enabled: true, intervals: [{ open: '08:00', close: '21:00' }] },
            fri: { enabled: true, intervals: [{ open: '08:00', close: '21:00' }] },
            sat: { enabled: false },
            sun: { enabled: false }
          }
        }
      }
    });
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Setup', exact: true }));
    expect(screen.queryByRole('heading', { name: 'Business Hours', exact: true })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Locations', exact: true })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Business Hours and Locations', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Business Hours', exact: true })).toBeTruthy();
    expect(screen.queryByText('Set when customers can place orders from your storefront.')).toBeNull();
    const businessHoursHeading = screen.getByRole('heading', { name: 'Business Hours', exact: true });
    expect(businessHoursHeading.closest('section')?.className).toContain('border-0');
    expect(businessHoursHeading.closest('section')?.className).toContain('p-0');
    expect(screen.queryByText('How hours appear on storefront.', { exact: true })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Current Schedule', exact: true })).toBeTruthy();
    const addScheduleButton = screen.getByRole('button', { name: 'Add Schedule Set', exact: true });
    expect(addScheduleButton).toBeTruthy();
    expect(addScheduleButton.className).toContain('h-10');
    expect(screen.getByRole('button', { name: 'Edit Monday - Friday schedule', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit business hours', exact: true })).toBeNull();
    expect(screen.getByText('Monday - Friday')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Preview on Storefront', exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Schedule Set', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Add New Schedule Set', exact: true })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const storefrontLocationsHeading = screen.getByRole('heading', { name: 'Storefront Locations', exact: true });
    expect(storefrontLocationsHeading.closest('section')?.className).toContain('relative');
    expect(storefrontLocationsHeading.closest('section')?.parentElement?.className).toContain('space-y-5');
    expect(storefrontLocationsHeading.closest('section')?.parentElement?.className).toContain('lg:space-y-8');
    expect(screen.queryByText('Review locations, coverage, and operational status. Select a branch to view its details, then choose Edit when you need to make a change.')).toBeNull();
  });

  it('keeps the Current Schedule preview inline and opens the add form in place', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Business Hours and Locations', exact: true }));
    const businessHoursEditor = screen.getByLabelText('Edit Business Hours');

    expect(screen.getByRole('heading', { name: 'Current Schedule', exact: true })).toBeTruthy();
    expect(screen.getByText('This is how your business hours will appear on your storefront.')).toBeTruthy();
    expect(within(businessHoursEditor).getByRole('button', { name: 'Add Schedule Set', exact: true })).toBeTruthy();
    expect(within(businessHoursEditor).getByRole('button', { name: /Edit .* schedule/, exact: true })).toBeTruthy();
    expect(within(businessHoursEditor).queryByRole('button', { name: 'Save Changes', exact: true })).toBeNull();
    expect(within(businessHoursEditor).queryByRole('button', { name: 'Cancel', exact: true })).toBeNull();
    fireEvent.click(within(businessHoursEditor).getByRole('button', { name: 'Add Schedule Set', exact: true }));
    const addScheduleForm = await screen.findByRole('heading', { name: 'Add New Schedule Set', exact: true });
    expect(addScheduleForm).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(addScheduleForm.closest('form')).getByRole('button', { name: 'Cancel', exact: true }));
    expect(screen.queryByRole('heading', { name: 'Add New Schedule Set', exact: true })).toBeNull();
    expect(within(businessHoursEditor).getByRole('heading', { name: 'Current Schedule', exact: true })).toBeTruthy();
  });

  it('returns to the default schedule preview when cancelling an inline schedule set', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Business Hours and Locations', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Schedule Set', exact: true }));
    const addScheduleForm = screen.getByText('Add New Schedule Set', { exact: true }).closest('form');
    fireEvent.click(within(addScheduleForm).getByRole('button', { name: 'Cancel', exact: true }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Current Schedule', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Schedule Set', exact: true })).toBeTruthy();
  });

  it('uses consistent branch labels across the preview and edit layout', async () => {
    listTenantLocations.mockResolvedValue([{
      location_id: 7,
      name: 'Tinda Han',
      address_line: 'Arguelles, Iloilo City, Iloilo, Philippines',
      latitude: 10.7261,
      longitude: 122.5575,
      delivery_radius_km: 5,
      current_wait_time_minutes: 15,
      is_active: true,
      is_open: true,
      is_primary_storefront: true,
      allow_out_of_stock_sales: true,
      supports_delivery: true,
      supports_pickup: true,
      scheduling_enabled: true,
      immediate_fulfillment_enabled: true
    }]);

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Business Hours and Locations', exact: true }));
    await waitFor(() => expect(listTenantLocations).toHaveBeenCalled());
    const storefrontLocationsList = screen.getByLabelText('Storefront locations list');
    const branchSelector = within(storefrontLocationsList).getByRole('button', { name: /Tinda Han/ });
    expect(branchSelector.className).toContain('w-[176px]');
    expect(branchSelector.parentElement?.className).toContain('overflow-x-auto');
    const previewAddressLabel = [...document.querySelectorAll('dt')].find((label) => label.textContent?.trim() === 'Address');
    expect(previewAddressLabel).toBeTruthy();
    expect(previewAddressLabel.className).toContain('text-[12px]');
    expect(previewAddressLabel.className).toContain('text-[#0F172A]');
    const branchInformationHeading = screen.getByRole('heading', { name: 'Branch Information', exact: true });
    const branchDetailsContainer = branchInformationHeading.parentElement?.parentElement?.parentElement;
    expect(branchDetailsContainer?.className).toContain('border');
    expect(branchDetailsContainer?.className).not.toContain('border-t-0');
    expect([...document.querySelectorAll('dt')].some((label) => label.textContent?.trim() === 'Coordinates')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Branch: Tinda Han', exact: true }));

    expect(await screen.findByRole('heading', { name: 'Edit Business Hours', exact: true })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Edit Branch', exact: true })).toBeTruthy();
    expect(screen.getByText('Update your branch details and settings.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Edit Branch', exact: true }).className).toContain('text-[14px]');
    expect(screen.queryByRole('heading', { name: 'Location', exact: true })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Basic Details', exact: true }).className).toContain('text-[13px]');
    const saveLocationButton = screen.getByRole('button', { name: 'Save Changes', exact: true });
    expect(saveLocationButton).toBeTruthy();
    expect(saveLocationButton.parentElement?.className).toContain('fixed');
    expect(saveLocationButton.parentElement?.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]');
    expect(saveLocationButton.parentElement?.className).toContain('border-t');
    expect(saveLocationButton.parentElement?.className).toContain('bg-white');
    expect(saveLocationButton.parentElement?.className).toContain('shadow-');
    expect(screen.getByRole('button', { name: 'Add Location', exact: true })).toBeTruthy();
    expect(screen.getAllByText('Primary location', { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByText('Delivery radius (km)', { exact: true })).toBeTruthy();
    expect(screen.getByText('Estimated wait time (min)', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Coordinates', exact: true })).toBeNull();
    expect([...document.querySelectorAll('label')].some((label) => label.textContent?.includes('Latitude'))).toBe(false);
    expect([...document.querySelectorAll('label')].some((label) => label.textContent?.includes('Longitude'))).toBe(false);
    const branchNameInput = screen.getByDisplayValue('Tinda Han');
    const branchNameLabel = branchNameInput.parentElement?.querySelector('label');
    expect(branchNameLabel?.className).toContain(previewAddressLabel.className);
    expect(branchNameLabel?.className).not.toContain('uppercase');
    expect(branchNameLabel?.className).not.toContain('tracking-[');
    fireEvent.change(branchNameInput, { target: { value: 'Tinda Han Updated' } });
    expect(branchNameInput.value).toBe('Tinda Han Updated');
  });

  it('uses the same preview-aligned layout when adding a branch', async () => {
    listTenantLocations.mockResolvedValue([{
      location_id: 7,
      name: 'Tinda Han',
      address_line: 'Arguelles, Iloilo City, Iloilo, Philippines',
      latitude: 10.7261,
      longitude: 122.5575,
      delivery_radius_km: 5,
      current_wait_time_minutes: 15,
      is_active: true,
      is_open: true,
      is_primary_storefront: true,
      allow_out_of_stock_sales: true,
      supports_delivery: true,
      supports_pickup: true,
      scheduling_enabled: true,
      immediate_fulfillment_enabled: true
    }]);

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Business Hours and Locations', exact: true }));
    await waitFor(() => expect(listTenantLocations).toHaveBeenCalled());
    const storefrontLocationsSection = screen.getByRole('heading', { name: 'Storefront Locations', exact: true }).closest('section');
    fireEvent.click(within(storefrontLocationsSection).getByRole('button', { name: 'Add Location', exact: true }));

    expect(await screen.findByRole('heading', { name: 'Add Branch', exact: true })).toBeTruthy();
    expect(document.getElementById('location-editor-heading')).toBeTruthy();
    expect(document.getElementById('location-editor-heading')?.closest('section')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Basic Details', exact: true })).toBeTruthy();
  });

  it('shows one Store Content save bar only after a content change', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_categories: { value: ['BBQ', 'Seafood'] }
    });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    expect(screen.queryByText('Unsaved Store Content changes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Categories', exact: true })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit category Seafood', exact: true }));
    const editInput = screen.getByRole('textbox', { name: 'Edit category Seafood', exact: true });
    fireEvent.change(editInput, { target: { value: 'Grilled Seafood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));

    expect(await screen.findByText('Unsaved Store Content changes')).toBeTruthy();
    const contentSaveBar = screen.getByText('Unsaved Store Content changes').parentElement?.parentElement?.parentElement;
    expect(contentSaveBar?.className).toContain('fixed');
    expect(contentSaveBar?.className).toContain('bottom-4');
    expect(contentSaveBar?.className).not.toContain('bottom-0');
    expect(within(contentSaveBar).getByRole('button', { name: 'Save Changes', exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save Categories', exact: true })).toBeNull();

    fireEvent.click(within(contentSaveBar).getByRole('button', { name: 'Cancel', exact: true }));
    await waitFor(() => expect(screen.queryByText('Unsaved Store Content changes')).toBeNull());
    expect(screen.getByRole('listitem', { name: '2. Seafood', exact: true })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit category Seafood', exact: true }));
    const secondEditInput = screen.getByRole('textbox', { name: 'Edit category Seafood', exact: true });
    fireEvent.change(secondEditInput, { target: { value: 'Grilled Seafood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    const secondContentSaveBar = screen.getByText('Unsaved Store Content changes').parentElement?.parentElement;
    fireEvent.click(within(secondContentSaveBar).getByRole('button', { name: 'Save Changes', exact: true }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      storefront_categories: ['BBQ', 'Grilled Seafood']
    })));
    await waitFor(() => expect(screen.queryByText('Unsaved Store Content changes')).toBeNull());
  });

  it('keeps the Store Content bar and edited values when the save fails', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_categories: { value: ['BBQ', 'Seafood'] }
    });
    updateSettings.mockRejectedValueOnce({ response: { data: { message: 'Store Content save rejected' } } });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Seafood', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit category Seafood', exact: true }), { target: { value: 'Grilled Seafood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));

    const contentSaveBar = screen.getByText('Unsaved Store Content changes').parentElement?.parentElement?.parentElement;
    fireEvent.click(within(contentSaveBar).getByRole('button', { name: 'Save Changes', exact: true }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      storefront_categories: ['BBQ', 'Grilled Seafood']
    })));
    expect(await screen.findByText('Unsaved Store Content changes')).toBeTruthy();
    expect(screen.getByRole('listitem', { name: '2. Grilled Seafood', exact: true })).toBeTruthy();
    expect(within(screen.getByText('Unsaved Store Content changes').parentElement?.parentElement?.parentElement).getByRole('button', { name: 'Save Changes', exact: true }).disabled).toBe(false);
  });

  it('protects Store Content when switching storefront sections', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_categories: { value: ['BBQ', 'Seafood'] }
    });
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Seafood', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit category Seafood', exact: true }), { target: { value: 'Grilled Seafood' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));

    fireEvent.click(screen.getByRole('tab', { name: 'Store Setup', exact: true }));
    const confirmation = await screen.findByRole('dialog');
    expect(within(confirmation).getByText('Unsaved Store Content changes')).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Stay', exact: true }));
    expect(screen.getByRole('tab', { name: 'Store Content', exact: true }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Store Setup', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving', exact: true }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Store Setup', exact: true }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.queryByText('Unsaved Store Content changes')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Store Content', exact: true }));
    expect(await screen.findByRole('listitem', { name: '2. Seafood', exact: true })).toBeTruthy();
  });

  it('edits storefront mobile number and email from the Information modal', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_phone: { value: '+63 917 123 4567' },
      storefront_email: { value: 'tindahan@gmail.com' }
    });
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit storefront contact information', exact: true }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('+63 917 123 4567')).toBeTruthy();
    expect(within(dialog).getByDisplayValue('tindahan@gmail.com')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Mobile number'), { target: { value: '+63 918 000 0000' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'hello@tindahan.test' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes', exact: true }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      storefront_phone: '+63 918 000 0000',
      storefront_email: 'hello@tindahan.test'
    })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('replaces the Store Image preview with one direct editor preview', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));

    expect(screen.queryByAltText('Storefront cover preview')).toBeNull();
    expect(screen.getAllByRole('group', { name: 'Cover photo adjustment canvas', exact: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Edit cover photo', exact: true })).toBeTruthy();
    expect(screen.getByLabelText('Change profile icon', { exact: true })).toBeTruthy();
    const actionRow = screen.getByText('Drag or zoom the cover photo after choosing Reposition.', { exact: true }).parentElement?.parentElement;
    expect(actionRow).toBeTruthy();
    expect(within(actionRow).getByRole('button', { name: 'Cancel', exact: true })).toBeTruthy();
    expect(within(actionRow).getByRole('button', { name: 'Save Changes', exact: true })).toBeTruthy();
  });

  it('stages profile uploads behind the profile action menu until Save', async () => {
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });
    uploadStorefrontAsset.mockResolvedValue({ image_url: '/uploads/storefront-assets/new-profile.png' });
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Change profile icon', exact: true }));
    const profileMenu = screen.getByRole('menu', { name: 'Profile icon actions', exact: true });
    expect(within(profileMenu).getByRole('menuitem', { name: 'Upload photo', exact: true })).toBeTruthy();
    expect(within(profileMenu).getByRole('menuitem', { name: 'Remove', exact: true })).toBeTruthy();

    fireEvent.click(within(profileMenu).getByRole('menuitem', { name: 'Upload photo', exact: true }));
    fireEvent.change(document.getElementById('storefront-profile-upload-preview'), { target: { files: [file] } });
    expect(uploadStorefrontAsset).not.toHaveBeenCalled();
    expect(screen.getByText('New profile selected. Save to apply.', { exact: true })).toBeTruthy();

    fireEvent.click(within(screen.getByLabelText('Edit Store Image')).getByRole('button', { name: 'Save Changes', exact: true }));
    await waitFor(() => expect(uploadStorefrontAsset).toHaveBeenCalledWith('profile', file));
  });

  it('stages profile removal behind Save and leaves the asset untouched on Cancel', async () => {
    getAllSettings.mockResolvedValue({ storefront_profile_image_url: { value: '/uploads/storefront-assets/profile.png' } });
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Change profile icon', exact: true }));
    const profileMenu = screen.getByRole('menu', { name: 'Profile icon actions', exact: true });
    fireEvent.click(within(profileMenu).getByRole('menuitem', { name: 'Remove', exact: true }));
    expect(deleteStorefrontAsset).not.toHaveBeenCalled();
    expect(screen.getByText('Profile icon will be removed when saved.', { exact: true })).toBeTruthy();

    fireEvent.click(within(screen.getByLabelText('Edit Store Image')).getByRole('button', { name: 'Cancel', exact: true }));
    expect(deleteStorefrontAsset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Store Image', exact: true }));
    const imageEditor = screen.getByLabelText('Edit Store Image');
    fireEvent.click(within(imageEditor).getByRole('button', { name: 'Change profile icon', exact: true }));
    fireEvent.click(within(within(imageEditor).getByRole('menu', { name: 'Profile icon actions', exact: true })).getByRole('menuitem', { name: 'Remove', exact: true }));
    fireEvent.click(within(imageEditor).getByRole('button', { name: 'Save Changes', exact: true }));
    await waitFor(() => expect(deleteStorefrontAsset).toHaveBeenCalledWith('profile'));
  });

  it('shows Display and checkout options as auto-saving switches in Store Setup', async () => {
    getAllSettings.mockResolvedValue({
      storefront_ui_v2_enabled: { value: false },
      storefront_follow_enabled: { value: true },
      storefront_share_enabled: { value: false },
      storefront_guest_checkout_enabled: { value: true },
      storefront_cash_payment_enabled: { value: true }
    });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Setup', exact: true }));
    const displayOptionsHeading = await screen.findByRole('heading', { name: 'Display and checkout options', exact: true });
    expect(displayOptionsHeading.closest('section')?.className).toContain('pt-4');
    expect(displayOptionsHeading.closest('section')?.className).toContain('sm:pt-6');
    const harmonizedUi = await screen.findByRole('switch', { name: 'Harmonized UI', exact: true });
    expect(harmonizedUi.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(harmonizedUi);

    await waitFor(() => expect(updateSettingByKey).toHaveBeenCalledWith('storefront_ui_v2_enabled', true));
    await waitFor(() => expect(harmonizedUi.getAttribute('aria-checked')).toBe('true'));
  });

  it('defaults Storefront visibility and presentation switches on when rows are missing', async () => {
    getAllSettings.mockResolvedValue({});

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Setup', exact: true }));

    for (const label of ['Storefront visible', 'Harmonized UI', 'Show Follow Button', 'Show Share Button']) {
      const switches = await screen.findAllByRole('switch', { name: label, exact: true });
      expect(switches.length).toBeGreaterThan(0);
      switches.forEach((toggle) => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    }
  });

  it('keeps Store Categories on the existing storefront settings save payload', async () => {
    getAllSettings.mockResolvedValueOnce({
      storefront_categories: { value: ['BBQ', 'Seafood'] }
    });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit category Seafood', exact: true }));
    const editRow = screen.getByRole('listitem', { name: '2. Seafood', exact: true });
    fireEvent.change(within(editRow).getByRole('textbox', { name: 'Edit category Seafood', exact: true }), { target: { value: 'Grilled Seafood' } });
    fireEvent.click(within(editRow).getByRole('button', { name: 'Save', exact: true }));
    const contentSaveBar = screen.getByText('Unsaved Store Content changes').parentElement?.parentElement?.parentElement;
    fireEvent.click(within(contentSaveBar).getByRole('button', { name: 'Save Changes', exact: true }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ storefront_categories: ['BBQ', 'Grilled Seafood'] })));
  });

  it('returns to the same Storefront subtab after saving its configuration', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    expect(screen.queryByRole('button', { name: 'Edit cover photo', exact: true })).toBeNull();
    expect(screen.queryByLabelText('Change profile icon', { exact: true })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    expect(await screen.findByRole('button', { name: 'Edit cover photo', exact: true })).toBeTruthy();
    expect(screen.getByLabelText('Change profile icon', { exact: true })).toBeTruthy();
    fireEvent.click(within(screen.getByLabelText('Edit Store Image')).getByRole('button', { name: 'Save Changes', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Store Image', exact: true })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Store Content', exact: true }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Edit Store Image', exact: true })).toBeTruthy();
  });

  it('hides media editing controls again when Store Content editing is cancelled', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    expect(await screen.findByRole('button', { name: 'Edit cover photo', exact: true })).toBeTruthy();
    expect(screen.getByLabelText('Change profile icon', { exact: true })).toBeTruthy();

    const visibleCancel = screen.getAllByRole('button', { name: 'Cancel', exact: true }).find((button) => !button.closest('.hidden'));
    fireEvent.click(visibleCancel);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Store Image', exact: true })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Edit cover photo', exact: true })).toBeNull();
    expect(screen.queryByLabelText('Change profile icon', { exact: true })).toBeNull();
  });

  it('offers explicit cover photo actions without rendering the removed toolbar', async () => {
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    const editCoverPhoto = await screen.findByRole('button', { name: 'Edit cover photo', exact: true });
    expect(screen.queryByRole('menu', { name: 'Cover photo actions', exact: true })).toBeNull();
    fireEvent.click(editCoverPhoto);

    expect(await screen.findByRole('group', { name: 'Cover photo adjustment canvas', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cover photo editing help', exact: true })).toBeTruthy();
    expect(screen.getByRole('menu', { name: 'Cover photo actions', exact: true })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Upload photo', exact: true })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Reposition', exact: true }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: 'Remove', exact: true }).disabled).toBe(true);
    expect(screen.getByLabelText('Choose a cover photo', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose photo', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom out cover photo', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in cover photo', exact: true })).toBeNull();
  });

  it('enters direct reposition mode from the cover photo action menu', async () => {
    getAllSettings.mockResolvedValueOnce({ storefront_cover_image_url: { value: 'https://example.test/cover.jpg' } });
    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit cover photo', exact: true }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reposition', exact: true }));

    const canvas = await screen.findByRole('group', { name: 'Cover photo adjustment canvas', exact: true });
    expect(canvas.getAttribute('tabindex')).toBe('0');
    expect(canvas.className).toContain('touch-none');
    expect(screen.getByText('Drag or use arrow keys to reposition image')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Reposition mode active');
    expect(screen.queryByRole('menu', { name: 'Cover photo actions', exact: true })).toBeNull();

    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    const preview = screen.getByAltText('Cover photo crop preview');
    expect(preview.style.transform).toBe('scale(1.1)');
    expect(preview.style.objectPosition).toBe('48% 50%');
  });

  it('applies the uploaded asset URL immediately after the follow-up settings read', async () => {
    getAllSettings.mockResolvedValue({
      storefront_profile_image_url: { value: '/uploads/storefront-assets/old-profile.png' }
    });
    uploadStorefrontAsset.mockResolvedValue({
      image_url: '/uploads/storefront-assets/new-profile.png'
    });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Change profile icon', exact: true }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upload photo', exact: true }));
    const profileInput = document.getElementById('storefront-profile-upload-preview');
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });
    fireEvent.change(profileInput, { target: { files: [file] } });

    expect(uploadStorefrontAsset).not.toHaveBeenCalled();
    expect(screen.getByText('New profile selected. Save to apply.', { exact: true })).toBeTruthy();
    fireEvent.click(within(screen.getByLabelText('Edit Store Image')).getByRole('button', { name: 'Save Changes', exact: true }));
    await waitFor(() => expect(uploadStorefrontAsset).toHaveBeenCalledWith('profile', file));
    await waitFor(() => expect(screen.getAllByAltText('Storefront profile preview').some((image) => image.getAttribute('src')?.includes('/uploads/storefront-assets/new-profile.png'))).toBe(true));
  });

  it('keeps the uploaded asset URL through the final storefront save refresh', async () => {
    getAllSettings.mockResolvedValue({
      storefront_profile_image_url: { value: '/uploads/storefront-assets/old-profile.png' }
    });
    uploadStorefrontAsset.mockResolvedValue({
      image_url: '/uploads/storefront-assets/new-profile.png'
    });

    render(<PosSettingsWorkspace {...buildProps({
      initialTab: 'storefront',
      terminalUser: { ...buildProps().terminalUser, permissions: ['settings:edit'] }
    })} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Store Content', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Store Image', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Change profile icon', exact: true }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Upload photo', exact: true }));
    const profileInput = document.getElementById('storefront-profile-upload-preview');
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });
    fireEvent.change(profileInput, { target: { files: [file] } });
    expect(uploadStorefrontAsset).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByLabelText('Edit Store Image')).getByRole('button', { name: 'Save Changes', exact: true }));
    await waitFor(() => expect(uploadStorefrontAsset).toHaveBeenCalledWith('profile', file));

    await waitFor(() => expect(screen.getAllByAltText('Storefront profile preview').some((image) => image.getAttribute('src')?.includes('/uploads/storefront-assets/new-profile.png'))).toBe(true));
  });

  it('uses icon-led headings across POS Setup sections', async () => {
    render(<PosSettingsWorkspace {...buildProps()} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'POS Setup', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Operations & Access', exact: true }));

    for (const headingId of ['pos-operations-defaults-title', 'pos-operations-access-title']) {
      const heading = document.getElementById(headingId);
      expect(heading?.parentElement?.parentElement?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    }

    fireEvent.click(await screen.findByRole('tab', { name: 'Discounts & Automation', exact: true }));
    const discountHeading = document.getElementById('pos-discount-presets-title');
    expect(discountHeading?.parentElement?.parentElement?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('keeps legacy discount presets read-only after the configurable-rule cutover', async () => {
    render(<PosSettingsWorkspace {...buildProps()} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'POS Setup', exact: true }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Discounts & Automation', exact: true }));

    expect(screen.queryByRole('button', { name: 'Add Discount', exact: true })).toBeNull();
    expect(await screen.findByText('No legacy discount presets detected. Use Discount Management to create and approve a configurable discount.')).toBeTruthy();
  });
});
