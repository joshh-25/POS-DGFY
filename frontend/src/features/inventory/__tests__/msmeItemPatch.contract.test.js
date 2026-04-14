import { describe, expect, it } from 'vitest';
import { buildMsmeVisibleUpdatePatch } from '@/components/items/ItemFormModal.jsx';

describe('MSME item update payload contract', () => {
  it('keeps hidden manufacturing fields out of MSME update payloads', () => {
    const originalItem = {
      name: 'Original Name',
      product_folder: 'Retail',
      cost_per_unit: 25,
      batch_size: 120,
      yield_percentage: 92,
      processing_loss: 8,
      production_notes: 'Manufacturing note',
      regulatory_compliance: { haccp_plan: true }
    };

    const payload = {
      name: 'Updated Name',
      product_folder: '',
      cost_per_unit: 25,
      batch_size: null,
      yield_percentage: null,
      processing_loss: null,
      production_notes: null,
      regulatory_compliance: null
    };

    const patch = buildMsmeVisibleUpdatePatch({ payload, originalItem });

    expect(patch).toEqual({
      name: 'Updated Name',
      product_folder: null
    });
    expect(patch).not.toHaveProperty('batch_size');
    expect(patch).not.toHaveProperty('yield_percentage');
    expect(patch).not.toHaveProperty('processing_loss');
    expect(patch).not.toHaveProperty('production_notes');
    expect(patch).not.toHaveProperty('regulatory_compliance');
  });

  it('returns an empty patch when MSME-visible fields are unchanged', () => {
    const originalItem = {
      sku_code: 'SKU-001',
      name: 'Sugar',
      category: 'raw_material',
      description: null,
      unit_of_measure: 'kg',
      cost_per_unit: 10.5,
      vat_type: 'vatable',
      max_capacity: 100,
      current_stock: 20,
      fifo_enabled: false,
      shelf_life_days: null,
      opened_shelf_life_days: null,
      product_folder: null,
      packaging_specs: null
    };

    const payload = {
      sku_code: 'SKU-001',
      name: 'Sugar',
      category: 'raw_material',
      description: '',
      unit_of_measure: 'kg',
      cost_per_unit: '10.5',
      vat_type: 'vatable',
      max_capacity: '100',
      current_stock: '20',
      fifo_enabled: false,
      shelf_life_days: '',
      opened_shelf_life_days: '',
      product_folder: '',
      packaging_specs: {
        height: '',
        width: '',
        thickness: '',
        material: '',
        design: '',
        contents: ''
      }
    };

    const patch = buildMsmeVisibleUpdatePatch({ payload, originalItem });
    expect(patch).toEqual({});
  });

  it('includes changed packaging specs when the field is visible in MSME', () => {
    const originalItem = {
      category: 'packaging',
      packaging_specs: {
        height: '10cm',
        width: '5cm',
        thickness: '',
        material: 'paper',
        design: '',
        contents: ''
      }
    };

    const payload = {
      category: 'packaging',
      packaging_specs: {
        height: '12cm',
        width: '5cm',
        thickness: '',
        material: 'paper',
        design: '',
        contents: ''
      }
    };

    const patch = buildMsmeVisibleUpdatePatch({ payload, originalItem });

    expect(patch).toEqual({
      packaging_specs: {
        height: '12cm',
        width: '5cm',
        thickness: '',
        material: 'paper',
        design: '',
        contents: ''
      }
    });
  });

  it('includes default_sale_price changes for MSME edit payloads', () => {
    const originalItem = {
      cost_per_unit: 10,
      default_sale_price: 12
    };

    const payload = {
      cost_per_unit: 10,
      default_sale_price: '13.5'
    };

    const patch = buildMsmeVisibleUpdatePatch({ payload, originalItem });
    expect(patch).toEqual({
      default_sale_price: 13.5
    });
  });
});
