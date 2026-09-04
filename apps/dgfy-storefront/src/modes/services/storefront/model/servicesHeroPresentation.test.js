import { describe, expect, it } from 'vitest';
import {
  buildServicesCatalogPresentation,
  buildServicesRetailHeroSectionModel,
  deriveServicesHeroTheme
} from './servicesHeroPresentation.js';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

describe('buildServicesCatalogPresentation', () => {
  it('uses neutral catalog copy for every service business', () => {
    const result = buildServicesCatalogPresentation({
      modeLabel: 'Laundry Service',
      modeAdapter: {
        catalogEyebrow: 'Services',
        catalogHeading: 'Choose the service you need',
        catalogSubtitle: '',
        catalogSearchPlaceholder: 'Search services...',
        catalogPriceAllLabel: 'All Price',
        catalogCategoryLabel: 'Service Categories',
        catalogCategoryAllLabel: 'All services',
        catalogCategoryIconToken: 'menu',
        catalogAddActionLabel: 'Add service',
        catalogUnavailableLabel: 'Unavailable',
        catalogMissingImageLabel: 'No service image',
        catalogMaxWidth: 1216
      }
    });

    expect(result).toEqual({
      eyebrow: 'Services',
      heading: 'Choose the service you need',
      subtitle: '',
      priceAllLabel: 'All Price',
      categoryLabel: 'Service Categories',
      categoryAllLabel: 'All services',
      categoryIconToken: 'menu',
      searchPlaceholder: 'Search services...',
      addActionLabel: 'Add service',
      unavailableLabel: 'Unavailable',
      missingImageLabel: 'No service image',
      maxWidth: 1216,
      horizontalPadding: 24,
      usesOuterGutter: true,
      toolbarVariant: 'services-compact'
    });
  });
});

describe('buildServicesRetailHeroSectionModel', () => {
  it('adapts service content for the shared retail-style hero without losing service actions', () => {
    const result = buildServicesRetailHeroSectionModel({
      heroSectionModel: {
        name: 'Base business',
        rawHoursData: { monday: [] },
        deliveryPartners: [{ partner: 'grab' }],
        actions: { canMessage: true, messageHref: 'https://example.com/message' }
      },
      serviceHeroModel: {
        name: 'Ralph’s Laundry',
        coverImageUrl: '/cover.png',
        profileImageUrl: '/profile.png',
        modeLabel: 'Laundry',
        locationLabel: 'Iloilo City',
        addressLine: 'City Proper, Iloilo City',
        sectionAboutText: 'Laundry pickup and delivery.',
        whyChooseUs: ['Fast turnaround'],
        galleryImages: ['/one.png', '/two.png', '/three.png', '/four.png', '/five.png'],
        hours: 'Open daily',
        contactRows: [{ label: 'Call', value: '09123456789', href: 'tel:09123456789' }],
        actions: { canCall: true, callHref: 'tel:09123456789', orderLabel: 'Book a Service' }
      }
    });

    expect(result).toMatchObject({
      name: 'Ralph’s Laundry',
      storeName: 'Ralph’s Laundry',
      coverImageUrl: '/cover.png',
      profileImageUrl: '/profile.png',
      modeLabel: 'Laundry',
      locationLabel: 'Iloilo City',
      addressLine: 'City Proper, Iloilo City',
      aboutText: 'Laundry pickup and delivery.',
      whyChooseUs: ['Fast turnaround'],
      galleryPreview: ['/one.png', '/two.png', '/three.png', '/four.png'],
      galleryFull: ['/one.png', '/two.png', '/three.png', '/four.png', '/five.png'],
      galleryTotalCount: 5,
      hours: 'Open daily',
      rawHoursData: { monday: [] },
      deliveryPartners: [{ partner: 'grab' }],
      actions: {
        canMessage: true,
        messageHref: 'https://example.com/message',
        canCall: true,
        callHref: 'tel:09123456789',
        orderLabel: 'Book a Service'
      }
    });
  });

  it('uses the normalized storefront gallery when a service profile has no gallery', () => {
    const result = buildServicesRetailHeroSectionModel({
      heroSectionModel: {
        name: 'Base business',
        galleryPreview: ['/base-preview.png'],
        galleryFull: ['/base-preview.png', '/base-full.png'],
        galleryTotalCount: 2
      },
      serviceHeroModel: { name: 'Base business' }
    });

    expect(result.galleryPreview).toEqual(['/base-preview.png']);
    expect(result.galleryFull).toEqual(['/base-preview.png', '/base-full.png']);
    expect(result.galleryTotalCount).toBe(2);
  });
});

describe('deriveServicesHeroTheme', () => {
  it('keeps Services colors on the Services palette even when an inherited theme is supplied', () => {
    const result = deriveServicesHeroTheme({
      accent: '#0f766e',
      accentDark: '#134e4a',
      accentSoft: '#ecfeff',
      taglineColor: '#bfe8e4',
      bodyFont: 'Arial'
    });

    expect(result).toMatchObject({
      servicesPrimary: SERVICES_PALETTE.primary,
      servicesPrimaryDark: SERVICES_PALETTE.primaryDark,
      servicesPrimarySoft: SERVICES_PALETTE.primarySoft,
      servicesTaglineColor: SERVICES_PALETTE.primaryLight,
      servicesBodyFont: 'Arial'
    });
  });
});
