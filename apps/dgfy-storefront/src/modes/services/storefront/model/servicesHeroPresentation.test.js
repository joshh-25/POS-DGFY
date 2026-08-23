import { describe, expect, it } from 'vitest';
import {
  buildServicesCatalogPresentation,
  buildServicesRetailHeroSectionModel
} from './servicesHeroPresentation.js';

describe('buildServicesCatalogPresentation', () => {
  it('derives laundry-specific catalog copy from the merchant mode without hardcoding card data', () => {
    const result = buildServicesCatalogPresentation({
      modeLabel: 'Laundry Service',
      modeAdapter: {
        catalogEyebrow: 'Service Catalog',
        catalogHeading: 'Choose the care you need',
        catalogSubtitle: '',
        catalogSearchPlaceholder: 'Search services...',
        catalogAddActionLabel: 'Add service',
        catalogUnavailableLabel: 'Unavailable',
        catalogMissingImageLabel: 'No service image',
        catalogMaxWidth: 1216
      }
    });

    expect(result).toEqual({
      eyebrow: 'Laundry Services',
      heading: 'Choose the care you need',
      subtitle: '',
      searchPlaceholder: 'Search laundry services...',
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
