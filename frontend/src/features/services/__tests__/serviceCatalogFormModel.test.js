import { describe, expect, it } from 'vitest';
import {
  SERVICE_CATALOG_FORM_DEFAULTS,
  buildServiceCatalogPayload,
  createServiceCatalogFormValues
} from '../catalog/serviceCatalogFormModel.js';

describe('serviceCatalogFormModel', () => {
  it('creates an isolated governed service form state', () => {
    const first = createServiceCatalogFormValues();
    const second = createServiceCatalogFormValues();

    first.name = 'Changed locally';

    expect(second).toEqual(SERVICE_CATALOG_FORM_DEFAULTS);
    expect(second.name).toBe('');
    expect(second.unit_of_measure).toBe('service');
    expect(second.visible_in_pos).toBe(true);
  });

  it('maps an existing service response into editable form values', () => {
    const values = createServiceCatalogFormValues({
      name: 'Laundry Basket',
      sku_code: 'SVC-001',
      description: 'Wash, dry, and fold',
      default_sale_price: '5000.0000',
      cost_per_unit: '4900.0000',
      vat_type: 'vat_exempt',
      status: 'active',
      service_detail: {
        service_category: 'Laundry',
        duration_minutes: 90,
        visible_in_pos: true,
        visible_in_storefront: false,
        addons_enabled: true,
        intake_form_schema: {
          fields: [{ label: 'Preferred detergent?', type: 'text', required: true }]
        }
      }
    });

    expect(values).toEqual(expect.objectContaining({
      name: 'Laundry Basket',
      service_category: 'Laundry',
      duration_minutes: 90,
      default_sale_price: '5000.0000',
      track_internal_cost: true,
      initial_track_internal_cost: true,
      cost_per_unit: '4900.0000',
      visible_in_storefront: false,
      addons_enabled: true,
      intake_question: 'Preferred detergent?',
      intake_question_type: 'text',
      intake_question_required: true
    }));
  });

  it('builds the normalized Services API payload without UI-only fields', () => {
    const payload = buildServiceCatalogPayload({
      ...createServiceCatalogFormValues(),
      name: '  Laundry Basket  ',
      sku_code: ' SVC-001 ',
      service_category: ' Laundry ',
      duration_minutes: '90',
      default_sale_price: '5000.50',
      track_internal_cost: true,
      cost_per_unit: '1200.25',
      intake_question: ' Preferred detergent? ',
      intake_question_type: 'text',
      intake_question_required: true,
      addons_enabled: true
    });

    expect(payload).toEqual(expect.objectContaining({
      name: 'Laundry Basket',
      sku_code: 'SVC-001',
      service_category: 'Laundry',
      duration_minutes: 90,
      default_sale_price: 5000.5,
      cost_per_unit: 1200.25,
      unit_of_measure: 'service',
      addons_enabled: true,
      intake_form_schema: {
        fields: [{
          id: 'intake_1',
          label: 'Preferred detergent?',
          type: 'text',
          required: true
        }]
      }
    }));
    expect(payload).not.toHaveProperty('track_internal_cost');
    expect(payload).not.toHaveProperty('intake_question');
    expect(payload).not.toHaveProperty('status');
  });

  it('omits internal cost by default and includes status only for edit payloads', () => {
    const values = {
      ...createServiceCatalogFormValues(),
      name: 'Laundry Basket',
      default_sale_price: '5000',
      status: 'inactive'
    };

    expect(buildServiceCatalogPayload(values)).not.toHaveProperty('cost_per_unit');
    expect(buildServiceCatalogPayload(values, { includeStatus: true })).toEqual(expect.objectContaining({
      status: 'inactive'
    }));
  });

  it('clears a previously tracked internal cost when the operator disables it', () => {
    const values = createServiceCatalogFormValues({
      name: 'Laundry Basket',
      default_sale_price: '5000',
      cost_per_unit: '1200'
    });
    values.track_internal_cost = false;

    expect(buildServiceCatalogPayload(values, { includeStatus: true })).toEqual(expect.objectContaining({
      cost_per_unit: null
    }));
  });
});
