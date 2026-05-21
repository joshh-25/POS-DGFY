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
    expect(viewModel.serviceGroups.map((group) => group.categoryMeta.iconToken)).toEqual(['laundry', 'aircon']);
    expect(viewModel.serviceGroups[0].items[0].variantName).toBe('Wash & Fold');
    expect(viewModel.serviceGroups[0].items[0].requiredIntakeCount).toBe(1);
    expect(viewModel.serviceGroups[1].items[0].serviceAreaLabel).toBe('Home / on-site visit');
    expect(viewModel.servicesLayoutMode).toBe('booking_heavy');
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

  it('infers a lead-gen layout for small low-friction service catalogs', () => {
    const viewModel = getServicesStorefrontViewModel([
      {
        item_id: 21,
        name: 'Consultation',
        category: 'service',
        service_detail: {
          service_category: 'consultation',
          payment_policy: 'customer_choice',
          service_area_type: 'in_store'
        }
      },
      {
        item_id: 22,
        name: 'Follow-up Visit',
        category: 'service',
        service_detail: {
          service_category: 'consultation',
          payment_policy: 'customer_choice',
          service_area_type: 'in_store'
        }
      }
    ]);

    expect(viewModel.servicesLayoutMode).toBe('lead_gen');
  });

  it('infers a directory layout for broader multi-family catalogs without strong booking signals', () => {
    const viewModel = getServicesStorefrontViewModel([
      {
        item_id: 31,
        name: 'Laundry Service - Wash & Fold',
        category: 'service',
        service_detail: { service_category: 'laundry', payment_policy: 'customer_choice', service_area_type: 'in_store' }
      },
      {
        item_id: 32,
        name: 'Laundry Service - Dry Clean',
        category: 'service',
        service_detail: { service_category: 'laundry', payment_policy: 'customer_choice', service_area_type: 'in_store' }
      },
      {
        item_id: 33,
        name: 'Home Cleaning',
        category: 'service',
        service_detail: { service_category: 'home_cleaning', payment_policy: 'customer_choice', service_area_type: 'in_store' }
      },
      {
        item_id: 34,
        name: 'Pet Grooming',
        category: 'service',
        service_detail: { service_category: 'pet_grooming', payment_policy: 'customer_choice', service_area_type: 'in_store' }
      },
      {
        item_id: 35,
        name: 'Massage',
        category: 'service',
        service_detail: { service_category: 'wellness', payment_policy: 'customer_choice', service_area_type: 'in_store' }
      },
      {
        item_id: 36,
        name: 'Nail Care',
        category: 'service',
        service_detail: { service_category: 'wellness', payment_policy: 'customer_choice', service_area_type: 'in_store' }
      }
    ]);

    expect(viewModel.servicesLayoutMode).toBe('directory');
  });

  it('prefers SKU folder names over service_category for storefront service grouping', () => {
    const viewModel = getServicesStorefrontViewModel([
      {
        item_id: 41,
        name: 'Cassette Type',
        category: 'service',
        folder_id: 7,
        folder_name: 'Wash',
        service_detail: {
          service_category: 'aircon_cleaning',
          payment_policy: 'customer_choice',
          service_area_type: 'customer_location'
        }
      },
      {
        item_id: 42,
        name: 'Split Type',
        category: 'service',
        folder_id: 9,
        folder_name: 'Add-ons',
        service_detail: {
          service_category: 'aircon_cleaning',
          payment_policy: 'customer_choice',
          service_area_type: 'customer_location'
        }
      }
    ]);

    expect(viewModel.serviceGroups.map((group) => group.categoryMeta.label)).toEqual(['Wash', 'Add Ons']);
    expect(viewModel.serviceGroups[0].items[0].categoryKey).toBe('wash');
    expect(viewModel.serviceGroups[1].items[0].categoryKey).toBe('add-ons');
    expect(viewModel.serviceGroups.map((group) => group.categoryMeta.iconToken)).toEqual(['laundry', 'addon']);
  });
});
