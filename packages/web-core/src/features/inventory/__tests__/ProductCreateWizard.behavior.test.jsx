// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProductCreateWizard, {
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

    expect(fnbSteps).toHaveLength(11);
    expect(fnbSteps.map((step) => step.name)).not.toContain('Properties');
    expect(fnbSteps.map((step) => step.name)).not.toContain('Quality Control');
    expect(fnbSteps[1]).toMatchObject({
      number: 2,
      name: 'POS Setup'
    });

    expect(foodManufacturingSteps).toHaveLength(13);
    expect(foodManufacturingSteps.map((step) => step.name)).toEqual(expect.arrayContaining([
      'Properties',
      'Quality Control'
    ]));
    expect(foodManufacturingSteps[1]).toMatchObject({
      number: 2,
      name: 'POS Setup'
    });
  });

  it('renders numbered F&B step buttons and navigates directly to POS Setup', async () => {
    renderProductWizard();

    expect(screen.getByText('Step 1 of 11')).toBeTruthy();
    const navigator = screen.getByRole('navigation', { name: 'Product wizard steps' });
    expect(within(navigator).getAllByRole('button')).toHaveLength(11);
    expect(within(navigator).queryByRole('button', { name: /Physical and chemical/i })).toBeNull();
    expect(within(navigator).queryByRole('button', { name: /Manufacturing quality checks/i })).toBeNull();

    fireEvent.click(within(navigator).getByRole('button', { name: /Step 2: POS Setup/i }));

    expect(screen.getByText('Step 2 of 11')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'POS Setup' })).toBeTruthy();
    expect(screen.getByText(/POS Controls/i)).toBeTruthy();
    expect(screen.getAllByText(/Storefront Catalog/i).length).toBeGreaterThan(0);
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
