import { describe, expect, it } from 'vitest';
import { normalizeStorefrontPageModel } from '../normalizeStorefrontPageModel.js';
import { buildStorefrontSlugFallbackQueries, findCanonicalStorefrontSlug } from '../StorefrontApp.jsx';

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

  it('uses all active commercial promos and preserves the legacy promo only as a fallback', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        storefront_promo: { active: true, promo_code: 'LEGACY', title: 'Legacy promo' },
        storefront_promos: [
          { active: true, promo_code: 'SAVE10', title: '10% off', discount_percent: 10 },
          { active: true, promo_code: 'SAVE20', title: '20% off', discount_percent: 20 },
          { active: false, promo_code: 'HIDDEN', title: 'Hidden promo', discount_percent: 5 }
        ]
      },
      catalog: []
    });

    expect(model.supporting.promo.items).toEqual([
      expect.objectContaining({ promo_code: 'SAVE10' }),
      expect.objectContaining({ promo_code: 'SAVE20' })
    ]);
    expect(model.supporting.promo.items).toHaveLength(2);
  });

  it('uses the legacy storefront promo code when the commercial promo list is empty', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        storefront_promo: {
          active: true,
          promo_code: 'KUSINA20',
          title: '20% OFF',
          subtitle: 'All Dish',
          badge: 'Todays Promo',
          validity_text: 'Valid until July 31',
          discount_percent: 20
        },
        storefront_promos: null
      },
      catalog: []
    });

    expect(model.supporting.promo.items).toEqual([
      expect.objectContaining({
        promo_code: 'KUSINA20',
        promoCode: 'KUSINA20',
        discount_percent: 20,
        discountPercent: 20,
        availability_status: 'available'
      })
    ]);
  });

  it('keeps scheduled promos visible but unavailable while hiding expired and inactive promos', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        storefront_promos: [
          { active: true, promo_code: 'MIDNIGHT', title: 'Midnight sale', discount_percent: 20, valid_from: '2026-07-12', valid_time_start: '00:00', valid_until: '2026-07-13', valid_time_end: '02:00' },
          { active: true, promo_code: 'EXPIRED', title: 'Old sale', discount_percent: 20, valid_until: '2026-07-10' },
          { active: false, promo_code: 'OFF', title: 'Disabled sale', discount_percent: 20 }
        ]
      },
      catalog: [],
      now: new Date('2026-07-11T15:00:00.000Z')
    });

    expect(model.supporting.promo.items).toEqual([
      expect.objectContaining({
        promo_code: 'MIDNIGHT',
        availability_status: 'scheduled',
        availability_message: 'Available from Jul 12, 2026, 12:00 AM'
      })
    ]);
  });

  it('preserves external, backend-local, and path-only storefront gallery images', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'fnb',
        storefront_gallery_images: [
          { url: 'https://cdn.example.com/external.jpg', caption: 'External' },
          { url: '/uploads/storefront-assets/t1/local-url.png', caption: 'Local URL' },
          { path: 'storefront-assets/t1/path-only.png', caption: 'Path only' }
        ]
      },
      catalog: []
    });

    expect(model.supporting.galleryImages).toEqual([
      expect.objectContaining({ url: 'https://cdn.example.com/external.jpg' }),
      expect.objectContaining({ url: '/uploads/storefront-assets/t1/local-url.png' }),
      expect.objectContaining({ url: '/uploads/storefront-assets/t1/path-only.png' })
    ]);
    expect(model.hero.galleryPreview).toEqual([
      'https://cdn.example.com/external.jpg',
      '/uploads/storefront-assets/t1/local-url.png',
      '/uploads/storefront-assets/t1/path-only.png'
    ]);
  });

  it('prefers uploaded local gallery paths over stale external urls on the same row', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'fnb',
        storefront_gallery_images: [
          {
            url: 'https://file.notion.so/f/example/expired.png',
            path: 'storefront-assets/masu/gallery-uploaded.png',
            caption: 'Uploaded gallery image'
          }
        ]
      },
      catalog: []
    });

    expect(model.supporting.galleryImages).toEqual([
      expect.objectContaining({
        url: '/uploads/storefront-assets/masu/gallery-uploaded.png',
        caption: 'Uploaded gallery image'
      })
    ]);
    expect(model.hero.galleryPreview).toEqual([
      '/uploads/storefront-assets/masu/gallery-uploaded.png'
    ]);
  });

  it('omits expired signed gallery urls with placeholder local paths', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'fnb',
        storefront_gallery_images: [
          {
            url: 'https://file.notion.so/f/example/expired.png?expirationTimestamp=1000',
            path: 'storefront-assets/tenant/gallery',
            caption: 'Expired gallery image'
          }
        ]
      },
      catalog: []
    });

    expect(model.supporting.galleryImages).toEqual([]);
    expect(model.hero.galleryPreview).toEqual([]);
    expect(model.sections.supporting.hasGallery).toBe(false);
  });

  it('formats structured storefront hours for the tenant page model', () => {
    const model = normalizeStorefrontPageModel({
      selectedStore: {
        workflow_mode: 'fnb',
        storefront_hours: {
          mode: 'weekly',
          timezone: 'Asia/Manila',
          weekly: {
            sun: { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] },
            mon: { enabled: true, open: '06:00', close: '20:00', intervals: [{ open: '06:00', close: '12:00' }, { open: '13:00', close: '20:00' }] },
            tue: { enabled: true, open: '06:00', close: '20:00', intervals: [{ open: '06:00', close: '12:00' }, { open: '13:00', close: '20:00' }] },
            wed: { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] },
            thu: { enabled: true, open: '10:00', close: '18:00', intervals: [{ open: '10:00', close: '18:00' }] },
            fri: { enabled: true, open: '10:00', close: '18:00', intervals: [{ open: '10:00', close: '18:00' }] },
            sat: { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] }
          }
        },
        storefront_hours_status: { display: 'Mon-Sat 9:00 AM - 6:00 PM' }
      },
      catalog: []
    });

    expect(model.hero.hours).toBe('Mon-Tue 6:00 AM - 12:00 PM, 1:00 PM - 8:00 PM; Thu-Fri 10:00 AM - 6:00 PM');
    expect(model.hero.contactRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Hours', value: model.hero.hours })
    ]));
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

  it('builds discovery fallback queries for stale hash storefront slugs', () => {
    expect(buildStorefrontSlugFallbackQueries('space-bar-2193ed')).toEqual([
      'space-bar-2193ed',
      'space-bar',
      'space bar',
      'space bar 2193ed'
    ]);
    expect(findCanonicalStorefrontSlug('space bar', [
      { slug: 'space-bar-8ddb33', tenant_name: 'Space Bar' }
    ])).toBe('space-bar-8ddb33');
  });
});
