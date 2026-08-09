/** @vitest-environment jsdom */
// issue #178 Phase 40: the admin "Registration industries" panel on
// StoreTemplateManager - lists all 11 catalog industries with their
// visibility state and lets an admin hide/show one via the same
// window.prompt reason pattern as publish/deprecate.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StoreTemplateManager from '../../../Pages/admin/StoreTemplateManager.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    listStoreTemplates: vi.fn(),
    listStoreTemplateAuditLogs: vi.fn(),
    createStoreTemplateDraft: vi.fn(),
    updateStoreTemplateModules: vi.fn(),
    publishStoreTemplate: vi.fn(),
    deprecateStoreTemplate: vi.fn(),
    listRegistrationIndustryVisibility: vi.fn(),
    setRegistrationIndustryVisibility: vi.fn(),
    listRegistrationIndustryAuditLogs: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminService);

const baseIndustries = [
  { key: 'retail', label: 'Retail', workflow_mode: 'retail', hidden: false, hidden_reason: null, hidden_updated_by: null },
  {
    key: 'food_manufacturing', label: 'Food Manufacturing', workflow_mode: 'food_manufacturing',
    hidden: true, hidden_reason: 'temporarily pausing this vertical', hidden_updated_by: 'platform_admin'
  }
];

describe('StoreTemplateManager registration-industries panel (issue #178 Phase 40)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.listStoreTemplates.mockResolvedValue({ data: { templates: [] } });
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
    const hideButton = retailRow.querySelector('button');
    hideButton.click();

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
    retailRow.querySelector('button').click();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.adminService.setRegistrationIndustryVisibility).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('shows an error and does not call the wrapper when the reason is too short', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('no');

    render(<StoreTemplateManager />);
    const [retailLabel] = await screen.findAllByText('Retail');

    const retailRow = retailLabel.closest('tr');
    retailRow.querySelector('button').click();

    expect(await screen.findByText(/a reason is required/i)).toBeTruthy();
    expect(mocks.adminService.setRegistrationIndustryVisibility).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });
});
