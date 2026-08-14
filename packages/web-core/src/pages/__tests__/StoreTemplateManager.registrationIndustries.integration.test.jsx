/** @vitest-environment jsdom */
// issue #178 Phase 40 (visibility panel) + issue #316 (full CRUD): the
// admin "Registration industries" panel on StoreTemplateManager - lists
// every catalog industry (seeded baseline + admin-created) with its live
// state, and lets an admin hide/show, create, or edit one.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StoreTemplateManager from '../../../../../apps/dgfy-web/Pages/admin/StoreTemplateManager.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    listStoreTemplates: vi.fn(),
    listStoreTemplateAuditLogs: vi.fn(),
    createStoreTemplateDraft: vi.fn(),
    updateStoreTemplateModules: vi.fn(),
    publishStoreTemplate: vi.fn(),
    deprecateStoreTemplate: vi.fn(),
    listRegistrationIndustryVisibility: vi.fn(),
    createRegistrationIndustry: vi.fn(),
    updateRegistrationIndustry: vi.fn(),
    setRegistrationIndustryVisibility: vi.fn(),
    listRegistrationIndustryAuditLogs: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminService);

const baseIndustries = [
  {
    key: 'retail', label: 'Retail', summary: 'Retail businesses.', niches: ['Supermarket'],
    workflow_mode: 'retail', template_key: 'retail_store', order: 1, is_system: true,
    hidden: false, hidden_reason: null, hidden_updated_by: null
  },
  {
    key: 'food_manufacturing', label: 'Food Manufacturing', summary: 'Food manufacturers.', niches: [],
    workflow_mode: 'food_manufacturing', template_key: 'food_manufacturer', order: 6, is_system: true,
    hidden: true, hidden_reason: 'temporarily pausing this vertical', hidden_updated_by: 'platform_admin'
  }
];

const publishedTemplates = [
  { template_id: 1, template_key: 'retail_store', label: 'Retail Store', status: 'published', base_mode: 'retail', modules: [] },
  { template_id: 2, template_key: 'services_shop', label: 'Services Shop', status: 'published', base_mode: 'services', modules: [] }
];

const findHideOrShowButton = (row) => (
  within(row).getAllByRole('button').find((btn) => /^(hide|show)$/i.test(btn.textContent))
);
const findEditButton = (row) => (
  within(row).getAllByRole('button').find((btn) => /^(edit|cancel)$/i.test(btn.textContent))
);

describe('StoreTemplateManager registration-industries panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.listStoreTemplates.mockResolvedValue({ data: { templates: publishedTemplates } });
    mocks.adminService.listRegistrationIndustryVisibility.mockResolvedValue({ data: { industries: baseIndustries } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists every registration industry with its visibility state', async () => {
    render(<StoreTemplateManager />);

    expect(screen.getByText('Registration industries')).toBeTruthy();
    expect(await screen.findAllByText('Retail')).not.toHaveLength(0);
    expect(screen.getAllByText('Food Manufacturing').length).toBeGreaterThan(0);
    expect(screen.getByText('Visible')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getAllByText('Baseline').length).toBe(2);
  });

  it('shows the hide reason and actor for a hidden industry', async () => {
    render(<StoreTemplateManager />);

    expect(await screen.findAllByText('Food Manufacturing')).not.toHaveLength(0);
    expect(screen.getByText(/temporarily pausing this vertical/)).toBeTruthy();
    expect(screen.getByText(/platform_admin/)).toBeTruthy();
  });

  it('hides a visible industry via the prompt-reason flow, calling the wrapper and reloading', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('pausing retail for maintenance');
    mocks.adminService.setRegistrationIndustryVisibility.mockResolvedValue({ data: { industry: { key: 'retail', hidden: true } } });

    render(<StoreTemplateManager />);
    const [retailLabel] = await screen.findAllByText('Retail');

    const retailRow = retailLabel.closest('tr');
    fireEvent.click(findHideOrShowButton(retailRow));

    await waitFor(() => expect(mocks.adminService.setRegistrationIndustryVisibility).toHaveBeenCalledWith(
      'retail',
      { hidden: true, reason: 'pausing retail for maintenance' }
    ));
    await waitFor(() => expect(mocks.adminService.listRegistrationIndustryVisibility).toHaveBeenCalledTimes(2));

    promptSpy.mockRestore();
  });

  it('does not call the wrapper when the prompt is cancelled', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

    render(<StoreTemplateManager />);
    const [retailLabel] = await screen.findAllByText('Retail');

    const retailRow = retailLabel.closest('tr');
    fireEvent.click(findHideOrShowButton(retailRow));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.adminService.setRegistrationIndustryVisibility).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('shows an error and does not call the wrapper when the reason is too short', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('no');

    render(<StoreTemplateManager />);
    const [retailLabel] = await screen.findAllByText('Retail');

    const retailRow = retailLabel.closest('tr');
    fireEvent.click(findHideOrShowButton(retailRow));

    expect(await screen.findByText(/a reason is required/i)).toBeTruthy();
    expect(mocks.adminService.setRegistrationIndustryVisibility).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  describe('create', () => {
    it('submits the create-industry form payload, including split niches and the reason', async () => {
      mocks.adminService.createRegistrationIndustry.mockResolvedValue({ data: { industry: { key: 'pet_grooming' } } });

      render(<StoreTemplateManager />);
      await screen.findAllByText('Retail');

      fireEvent.change(screen.getByLabelText('Industry key'), { target: { value: 'pet_grooming' } });
      fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Pet Grooming' } });
      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Grooming and boarding.' } });
      fireEvent.change(screen.getByLabelText('Niches (comma-separated)'), { target: { value: 'Pet salon, Mobile grooming' } });
      fireEvent.change(screen.getByLabelText('Reason (required, min 3 characters)'), { target: { value: 'New vertical' } });
      // Default workflow mode option ("Retail") is native, so a published
      // template must be selected explicitly.
      fireEvent.click(screen.getByLabelText('Template'));
      fireEvent.click(screen.getByText('Retail Store (retail_store)'));

      fireEvent.click(screen.getByRole('button', { name: 'Create industry' }));

      await waitFor(() => expect(mocks.adminService.createRegistrationIndustry).toHaveBeenCalledWith(
        expect.objectContaining({
          industry_key: 'pet_grooming',
          label: 'Pet Grooming',
          summary: 'Grooming and boarding.',
          niches: ['Pet salon', 'Mobile grooming'],
          template_key: 'retail_store',
          reason: 'New vertical'
        })
      ));
    });

    it('surfaces a 409 error from the backend without clearing the form', async () => {
      mocks.adminService.createRegistrationIndustry.mockRejectedValue({
        response: { data: { message: 'Registration industry already exists: retail' } }
      });

      render(<StoreTemplateManager />);
      await screen.findAllByText('Retail');

      fireEvent.change(screen.getByLabelText('Industry key'), { target: { value: 'retail' } });
      fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Retail' } });
      fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Duplicate.' } });
      fireEvent.change(screen.getByLabelText('Reason (required, min 3 characters)'), { target: { value: 'Testing duplicate' } });
      fireEvent.click(screen.getByLabelText('Template'));
      fireEvent.click(screen.getByText('Retail Store (retail_store)'));

      fireEvent.click(screen.getByRole('button', { name: 'Create industry' }));

      expect(await screen.findByText(/already exists/i)).toBeTruthy();
      expect(screen.getByLabelText('Industry key').value).toBe('retail');
    });
  });

  describe('edit', () => {
    it('locks the workflow-mode select for a system (baseline) row', async () => {
      render(<StoreTemplateManager />);
      const [retailLabel] = await screen.findAllByText('Retail');
      const retailRow = retailLabel.closest('tr');

      fireEvent.click(findEditButton(retailRow));

      expect(await screen.findByText(/mode is engineering-owned/i)).toBeTruthy();
    });

    it('submits only the changed fields on save', async () => {
      mocks.adminService.updateRegistrationIndustry.mockResolvedValue({ data: { industry: { key: 'retail' } } });

      render(<StoreTemplateManager />);
      const [retailLabel] = await screen.findAllByText('Retail');
      const retailRow = retailLabel.closest('tr');
      fireEvent.click(findEditButton(retailRow));

      // The edit form renders as a second <tr> right below the row - both
      // it and the always-visible "New industry" form below share field
      // labels ("Label", "Reason (...)"), so queries must be scoped to the
      // edit row specifically.
      const editRow = (await screen.findByRole('button', { name: 'Save changes' })).closest('tr');
      fireEvent.change(within(editRow).getByLabelText('Label'), { target: { value: 'Retail & Trade' } });
      fireEvent.change(within(editRow).getByLabelText('Reason (required, min 3 characters)'), { target: { value: 'Clarifying the label' } });

      fireEvent.click(within(editRow).getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mocks.adminService.updateRegistrationIndustry).toHaveBeenCalledWith(
        'retail',
        { reason: 'Clarifying the label', label: 'Retail & Trade' }
      ));
    });

    it('does not submit when no field actually changed', async () => {
      render(<StoreTemplateManager />);
      const [retailLabel] = await screen.findAllByText('Retail');
      const retailRow = retailLabel.closest('tr');
      fireEvent.click(findEditButton(retailRow));

      const editRow = (await screen.findByRole('button', { name: 'Save changes' })).closest('tr');
      fireEvent.change(within(editRow).getByLabelText('Reason (required, min 3 characters)'), { target: { value: 'Trying to save nothing' } });

      fireEvent.click(within(editRow).getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText(/change at least one field/i)).toBeTruthy();
      expect(mocks.adminService.updateRegistrationIndustry).not.toHaveBeenCalled();
    });
  });

  // Genuine-regression proof for the constant-desync fix (issue #316): with
  // RegistrationReachabilityNote reverted to reading the hardcoded
  // REGISTRATION_INDUSTRIES/REGISTRATION_EXCLUDED_TEMPLATE_KEYS constants
  // instead of the loaded registrationIndustries API state, this test
  // fails - the constant's 'Retail' label would render regardless of what
  // the live API data says. Confirmed failing against that reversion, then
  // restored.
  it('reachability note reflects the live API label, not the hardcoded constant', async () => {
    mocks.adminService.listRegistrationIndustryVisibility.mockResolvedValue({
      data: {
        industries: [
          { ...baseIndustries[0], label: 'Retail & Trade (renamed live)' },
          baseIndustries[1]
        ]
      }
    });
    mocks.adminService.listStoreTemplates.mockResolvedValue({
      data: {
        templates: [
          { template_id: 1, template_key: 'retail_store', label: 'Retail Store', base_mode: 'retail', status: 'published', version: 1, modules: [] }
        ]
      }
    });

    render(<StoreTemplateManager />);

    expect(await screen.findByText(/Shown at registration as: Retail & Trade \(renamed live\)/)).toBeTruthy();
  });

  it('shows "Not offered at registration" for a published template no loaded industry references', async () => {
    mocks.adminService.listRegistrationIndustryVisibility.mockResolvedValue({ data: { industries: [] } });
    mocks.adminService.listStoreTemplates.mockResolvedValue({
      data: {
        templates: [
          { template_id: 5, template_key: 'services_with_parts_retail', label: 'Services w/ Parts', base_mode: 'services', status: 'published', version: 1, modules: [] }
        ]
      }
    });

    render(<StoreTemplateManager />);

    expect(await screen.findByText(/not offered at registration/i)).toBeTruthy();
  });
});
