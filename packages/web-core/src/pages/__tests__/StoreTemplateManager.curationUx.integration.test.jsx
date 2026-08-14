/** @vitest-environment jsdom */
// issue #178 final-touch pass: the admin curation surface was confusing
// enough to block handoff - unlabeled form fields, a doubled "Food
// Manufacturing" option (the deprecated `manufacturing` alias leaking into
// the dropdown), and 21 alphabetical module checkboxes with no descriptions
// or grouping. These tests pin the fix: labeled fields, a de-aliased and
// external-mode-free base-mode dropdown, a grouped/filtered/described
// module grid, and engine-classification badges. Several assertions fail
// against the pre-overhaul component (flat SELECTABLE_MODULES list, raw
// WORKFLOW_MODE_VALUES dropdown, unlabeled inputs).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoreTemplateManager from '../../../../../apps/dgfy-web/Pages/admin/StoreTemplateManager.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    listStoreTemplates: vi.fn(),
    listStoreTemplateAuditLogs: vi.fn(),
    createStoreTemplateDraft: vi.fn(),
    updateStoreTemplateModules: vi.fn(),
    publishStoreTemplate: vi.fn(),
    deprecateStoreTemplate: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminService);

describe('StoreTemplateManager curation UX overhaul (issue #178 final-touch pass)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.listStoreTemplates.mockResolvedValue({
      data: {
        templates: [
          {
            template_id: 1, template_key: 'retail_store', label: 'Retail Store',
            base_mode: 'retail', status: 'published', version: 1, is_preset: true, is_canonical: true,
            modules: ['catalog']
          },
          {
            template_id: 2, template_key: 'hospitality_property', label: 'Hospitality Property',
            base_mode: 'hospitality', status: 'published', version: 1, is_preset: true, is_canonical: true,
            modules: ['catalog']
          }
        ]
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('gives every draft-form field an accessible label', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    expect(screen.getByLabelText(/template key/i)).toBeTruthy();
    expect(screen.getByLabelText(/display label/i)).toBeTruthy();
    expect(screen.getByLabelText(/base mode/i)).toBeTruthy();
  });

  it('filters the module grid to the default base mode\'s relevant groups, hiding unrelated families', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    // Default base mode is retail (TEMPLATE_AUTHORABLE_MODES[0]): the
    // hospitality module group is not relevant and must not be shown -
    // the pre-overhaul flat 21-checkbox list rendered every module
    // regardless of base mode.
    expect(screen.queryByText('Housekeeping Board')).toBeNull();
    expect(screen.queryByText('Guest Folios')).toBeNull();
  });

  it('reveals hidden module groups via the "show all" toggle', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    expect(screen.queryByText('Housekeeping Board')).toBeNull();

    const toggle = screen.getByText(/show all module groups/i);
    await userEvent.click(toggle);

    expect(screen.getByText('Housekeeping Board')).toBeTruthy();
  });

  it('describes the storefront module in plain language instead of just "Online Store"', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    expect(screen.getByText(/the customer-facing catalog page and online checkout/i)).toBeTruthy();
  });

  it('tags modules with their selling surface', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    expect(screen.getAllByText('Back office').length).toBeGreaterThan(0);
  });

  it('shows an engine-classification badge for a transitional (native-today, external-planned) template row, but not for a native one', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    const retailRow = screen.getByText('retail_store').closest('tr');
    const hospitalityRow = screen.getByText('hospitality_property').closest('tr');

    expect(hospitalityRow.textContent).toContain('Native today');
    expect(hospitalityRow.textContent).toContain('external planned');
    expect(retailRow.textContent).not.toContain('external planned');
  });

  it('offers a de-aliased base-mode dropdown with no external-engine modes and exactly one Food Manufacturing option', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('retail_store');

    const trigger = screen.getByLabelText(/base mode/i);
    await userEvent.click(trigger);

    const optionTexts = Array.from(document.querySelectorAll('.cursor-pointer')).map((el) => el.textContent || '');
    const foodManufacturingOptions = optionTexts.filter((text) => text.startsWith('Food Manufacturing'));

    expect(foodManufacturingOptions.length).toBe(1);
    expect(optionTexts.some((text) => text.includes('Healthcare'))).toBe(false);
    expect(optionTexts.some((text) => text.includes('Ticketing'))).toBe(false);
  });
});
