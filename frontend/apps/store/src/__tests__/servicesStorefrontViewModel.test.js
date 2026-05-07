import { describe, expect, it } from 'vitest';
import { getServiceCategoryMeta, getServicesStorefrontViewModel } from '../servicesStorefrontViewModel.js';

describe('servicesStorefrontViewModel', () => {
  it('groups service items into storefront families and trims variant names', () => {
    const viewModel = getServicesStorefrontViewModel([
      {
        item_id: 1,
        name: 'Laundry Service - Wash & Fold',
        category: 'service',
        service_detail: {
          service_category: 'laundry',
          duration_minutes: 90,
          payment_policy: 'postpaid_only',
          service_area_type: 'in_store',
          intake_form_schema: {
            fields: [
              { id: 'customer_name', label: 'Customer Name', required: true },
              { id: 'special_notes', label: 'Special Instructions', required: false }
            ]
          }
        }
      },
      {
        item_id: 2,
        name: 'Aircon Cleaning - Split Type',
        category: 'service',
        service_detail: {
          service_category: 'aircon_cleaning',
          duration_minutes: 150,
          payment_policy: 'customer_choice',
          service_area_type: 'customer_location'
        }
      }
    ]);

    expect(viewModel.totalServices).toBe(2);
    expect(viewModel.serviceFamilyCount).toBe(2);
    expect(viewModel.serviceGroups.map((group) => group.categoryMeta.label)).toEqual(['Laundry', 'Aircon Cleaning']);
    expect(viewModel.serviceGroups[0].items[0].variantName).toBe('Wash & Fold');
    expect(viewModel.serviceGroups[0].items[0].requiredIntakeCount).toBe(1);
    expect(viewModel.serviceGroups[1].items[0].serviceAreaLabel).toBe('Home / on-site visit');
  });

  it('returns sensible fallback metadata for unknown service families', () => {
    expect(getServiceCategoryMeta('pet_grooming')).toEqual(expect.objectContaining({
      label: 'Pet Grooming'
    }));
  });

  it('includes service-family guidance for the services landing and detail view', () => {
    expect(getServiceCategoryMeta('laundry')).toEqual(expect.objectContaining({
      howItWorks: expect.arrayContaining(['Choose the laundry care type that matches the load.']),
      preparationNotes: expect.arrayContaining(['Bring bulky items directly to the branch for easier handling.'])
    }));
  });

  it('exposes allServices for single-family storefront rendering paths', () => {
    const viewModel = getServicesStorefrontViewModel([
      {
        item_id: 11,
        name: 'Laundry Service - Comforter Care',
        category: 'service',
        service_detail: {
          service_category: 'laundry',
          duration_minutes: 120
        }
      }
    ]);

    expect(viewModel.totalServices).toBe(1);
    expect(viewModel.allServices).toHaveLength(1);
    expect(viewModel.allServices[0]).toEqual(expect.objectContaining({
      item_id: 11,
      variantName: 'Comforter Care'
    }));
  });
});
