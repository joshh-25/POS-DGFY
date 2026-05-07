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

  it('resolves short storefront slugs to canonical discovery slugs', () => {
    expect(findCanonicalStorefrontSlug('abeezee', [
      { slug: 'abeezee-bb983b', tenant_name: 'ABeeZee' }
    ])).toBe('abeezee-bb983b');
  });
});
