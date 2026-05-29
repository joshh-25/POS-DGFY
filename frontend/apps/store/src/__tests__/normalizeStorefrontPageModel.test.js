import { describe, expect, it } from 'vitest';
import { normalizeStorefrontPageModel } from '../normalizeStorefrontPageModel.js';
import { findCanonicalStorefrontSlug } from '../StorefrontApp.jsx';

describe('normalizeStorefrontPageModel', () => {
  it('derives service mode metadata and section visibility from storefront content', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'services',
        storefront_tagline: 'Reliable laundry and aircon care.',
        storefront_about: 'Laundry and aircon services.',
        storefront_phone: '09171234567',
        storefront_email: 'abz@gmail.com',
        storefront_why_choose_us: ['Laundry and aircon in one place'],
        storefront_categories: ['Laundry Service'],
        storefront_promo: { title: '10% Off', active: true },
        storefront_review_highlights: [{ reviewer_name: 'Ana', rating: 5, comment: 'Great' }],
        storefront_gallery_images: [{ url: '/uploads/storefront-assets/example.jpg' }]
      },
      catalog: [
        {
          item_id: 1,
          category: 'service',
          name: 'Laundry Service - Wash & Fold',
          service_detail: {
            service_category: 'laundry',
            duration_minutes: 60
          }
        }
      ]
    });

    expect(model.isServicesMode).toBe(true);
    expect(model.servicesLayoutMode).toBe('lead_gen');
    expect(model.servicesViewModel.totalServices).toBe(1);
    expect(model.sections.hero.hasTagline).toBe(true);
    expect(model.sections.overview.hasAbout).toBe(true);
    expect(model.sections.overview.hasContact).toBe(true);
    expect(model.sections.supporting.hasPromo).toBe(true);
    expect(model.sections.supporting.hasReviews).toBe(true);
    expect(model.sections.supporting.hasGallery).toBe(true);
  });

  it('collapses optional sections when storefront data is missing', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'retail'
      },
      catalog: []
    });

    expect(model.isServicesMode).toBe(false);
    expect(model.sections.hero.hasTagline).toBe(false);
    expect(model.sections.overview.hasAbout).toBe(false);
    expect(model.sections.overview.hasContact).toBe(false);
    expect(model.sections.categories.isVisible).toBe(false);
    expect(model.sections.supporting.hasPromo).toBe(false);
    expect(model.sections.supporting.hasReviews).toBe(false);
    expect(model.sections.supporting.hasGallery).toBe(false);
  });

  it('derives food and beverage menu metadata from catalog data', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'fnb',
        storefront_categories: ['Rice Meals'],
        storefront_tagline: 'Fresh meals and drinks all day.'
      },
      catalog: [
        {
          item_id: 1,
          category: 'product',
          name: 'Iced Mocha',
          unit_of_measure: 'cup',
          default_sale_price: 145,
          description: 'Cold coffee beverage'
        }
      ]
    });

    expect(model.isFnbMode).toBe(true);
    expect(model.fnbViewModel.totalItems).toBe(1);
    expect(model.hero.primaryCategoryLabel).toBe('Rice Meals');
    expect(model.sections.categories.isVisible).toBe(true);
  });

  it('includes configured social contact rows and delivery partners from storefront settings', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'fnb',
        storefront_phone: '09171234567',
        storefront_social_links: {
          facebook: 'https://facebook.com/example',
          messenger: 'https://m.me/example',
          instagram: 'https://instagram.com/example'
        },
        storefront_delivery_partners: [
          { partner: 'grab', label: 'Grab', url: 'https://grab.com/store/example' },
          { partner: 'foodpanda', label: 'foodpanda', url: 'https://foodpanda.page.link/example' }
        ]
      },
      catalog: []
    });

    expect(model.hero.contactRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Call', href: 'tel:09171234567' }),
      expect.objectContaining({ label: 'Facebook', href: 'https://facebook.com/example' }),
      expect.objectContaining({ label: 'Messenger', href: 'https://m.me/example' }),
      expect.objectContaining({ label: 'Instagram', href: 'https://instagram.com/example' })
    ]));
    expect(model.hero.deliveryPartners).toEqual([
      { partner: 'grab', label: 'Grab', url: 'https://grab.com/store/example' },
      { partner: 'foodpanda', label: 'foodpanda', url: 'https://foodpanda.page.link/example' }
    ]);
  });

  it('resolves short storefront slugs to canonical discovery slugs', () => {
    expect(findCanonicalStorefrontSlug('abeezee', [
      { slug: 'abeezee-bb983b', tenant_name: 'ABeeZee' }
    ])).toBe('abeezee-bb983b');
  });
});
