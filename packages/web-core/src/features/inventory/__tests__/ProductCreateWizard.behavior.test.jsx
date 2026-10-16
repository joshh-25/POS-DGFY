// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProductCreateWizard, {
  resolveProductWizardResumeStep,
  resolveProductWizardSteps
} from '../../../../Components/products/ProductCreateWizard.jsx';

vi.mock('@/hooks/useLocations.js', () => ({
  useLocations: (() => {
    const locations = [
      {
        location_id: 1,
        name: 'Main Branch',
        is_active: true,
        is_primary_storefront: true
      }
    ];
    return () => ({
      locations,
      loading: false
    });
  })()
}));

vi.mock('../../../../Components/utils/compositionValidation', () => ({
  validateComposition: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  showValidationErrors: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn()
  }
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = 'unset';
});

const renderProductWizard = (props = {}) => {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue({});
  const onSaveDraft = vi.fn().mockResolvedValue({});

  render(
    <ProductCreateWizard
      open
      onClose={onClose}
      onSubmit={onSubmit}
      onSaveDraft={onSaveDraft}
      items={[]}
      workflowMode="fnb"
      {...props}
    />
  );

  return { onClose, onSubmit, onSaveDraft };
};

const activeProduct = {
  item_id: 81,
  id: 81,
  name: 'Iced Tea',
  sku_code: 'FNB-TEA',
  status: 'active',
  category: 'product',
  product_type: 'finished_goods',
  vat_type: 'vatable',
  unit_of_measure: 'serving',
  current_stock: 0,
  max_capacity: 100,
  physical_properties: {
    texture: 'Liquid',
    color: 'Amber'
  },
  quality_control: {
    test_frequency: 'Daily'
  }
};

describe('ProductCreateWizard behavior', () => {
  it('derives F&B product steps without manufacturing-only properties and quality control', () => {
    const fnbSteps = resolveProductWizardSteps('fnb');
    const foodManufacturingSteps = resolveProductWizardSteps('food_manufacturing');

    expect(fnbSteps).toHaveLength(5);
    expect(fnbSteps.map((step) => step.name)).toEqual([
      'Basic Information',
      'POS & Selling',
      'Inventory & Storage',
      'Recipe, Cost & Compliance',
      'Barcodes & Review'
    ]);
    expect(fnbSteps[1]).toMatchObject({
      number: 2,
      name: 'POS & Selling'
    });

    expect(foodManufacturingSteps).toHaveLength(5);
    expect(foodManufacturingSteps[1]).toMatchObject({
      number: 2,
      name: 'POS & Selling'
    });
  });

  it('renders five grouped F&B steps and navigates directly to POS & Selling', async () => {
    renderProductWizard();

    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
    const navigator = screen.getByRole('navigation', { name: 'Product wizard steps' });
    expect(within(navigator).getAllByRole('button')).toHaveLength(5);

    fireEvent.click(within(navigator).getByRole('button', { name: /Step 2: POS & Selling/i }));

    expect(screen.getByText('Step 2 of 5')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'POS & Selling' })).toBeTruthy();
    expect(screen.getByText(/POS Controls/i)).toBeTruthy();
    expect(screen.getAllByText(/Storefront Catalog/i).length).toBeGreaterThan(0);
  });

  it('keeps grouped sections available without manufacturing-only sections in F&B mode', () => {
    renderProductWizard();
    const navigator = screen.getByRole('navigation', { name: 'Product wizard steps' });

    fireEvent.click(within(navigator).getByRole('button', { name: /Step 4: Recipe, Cost & Compliance/i }));

    expect(screen.getByRole('heading', { name: 'Recipe Formulation & Ingredient Ratios' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cost & Financial/i }));
    expect(screen.getByRole('heading', { name: 'Cost & Financial Validations' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Physical & Chemical Properties' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Quality Control & Testing/i })).toBeNull();
  });

  it('resumes legacy drafts at the correct grouped step', () => {
    const fnbSteps = resolveProductWizardSteps('fnb');
    const manufacturingSteps = resolveProductWizardSteps('food_manufacturing');

    expect(resolveProductWizardResumeStep({ last_completed_step: 7 }, fnbSteps, 'fnb')).toBe(3);
    expect(resolveProductWizardResumeStep({ last_completed_step: 8 }, fnbSteps, 'fnb')).toBe(4);
    expect(resolveProductWizardResumeStep({ last_completed_step: 12 }, manufacturingSteps, 'food_manufacturing')).toBe(5);
    expect(resolveProductWizardResumeStep({ wizard_version: 2, last_completed_step: 2 }, fnbSteps, 'fnb')).toBe(3);
  });

  it('clears manufacturing-only fields when an existing F&B product is saved', async () => {
    const { onSubmit } = renderProductWizard({
      product: activeProduct,
      workflowMode: 'fnb'
    });

    fireEvent.click(screen.getByRole('button', { name: /Save and exit/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({
      physical_properties: {},
      quality_control: {},
      status: 'active',
      wizard_metadata: null
    }));
  });

  it('preserves manufacturing fields when a non-F&B product is saved', async () => {
    const { onSubmit } = renderProductWizard({
      product: activeProduct,
      workflowMode: 'food_manufacturing'
    });

    fireEvent.click(screen.getByRole('button', { name: /Save and exit/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({
      physical_properties: activeProduct.physical_properties,
      quality_control: activeProduct.quality_control,
      status: 'active',
      wizard_metadata: null
    }));
  });
});
