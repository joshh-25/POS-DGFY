import { getBusinessModePinMeta, normalizeBusinessMode } from './businessModePins.js';
import { getStorefrontTemplateConfig } from './storefrontTemplateRegistry.js';

export const ModePresentationRegistry = Object.freeze({
  default: Object.freeze({
    heroEyebrow: 'Customer storefront',
    heroDescription: 'Browse the catalog, check availability, and open the cart whenever you are ready.',
    catalogHeading: 'Store Catalog',
    catalogSubtitle: 'Browse what this business currently offers in its public storefront.',
    catalogSearchPlaceholder: 'Search items in this store catalog...',
    primaryActionLabel: 'Order Now',
    trackHeading: 'Track Order',
    trackDescription: 'Enter a tracking PIN to check the latest status without leaving the sheet.',
    supportsServiceGrouping: false,
    heroTheme: Object.freeze({
      displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
      accent: '#ea580c',
      accentDark: '#9a3412',
      accentSoft: '#fff7ed',
      surface: '#0f172a'
    })
  }),
  services: Object.freeze({
    heroEyebrow: 'Services storefront',
    heroDescription: 'Book service families, answer intake questions, and keep one ticket for the full appointment journey.',
    catalogHeading: 'Book Services',
    catalogSubtitle: 'Choose a service family, pick a service type, then complete the booking details in the cart.',
    catalogSearchPlaceholder: 'Search laundry or aircon services...',
    primaryActionLabel: 'Book a Service',
    trackHeading: 'Track Booking or Order',
    trackDescription: 'Enter a booking reference or order tracking PIN to check the latest status without leaving the sheet.',
    supportsServiceGrouping: true,
    heroTheme: Object.freeze({
      displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
      accent: '#0f766e',
      accentDark: '#134e4a',
      accentSoft: '#ecfeff',
      surface: '#172033'
    })
  }),
  msme: Object.freeze({
    heroEyebrow: 'Simple storefront',
    heroDescription: 'Browse ready products, add what you need, and checkout in a straightforward order flow.',
    catalogHeading: 'Everyday Products',
    catalogSubtitle: 'Fast product browsing for simple operations with stock-aware ordering.',
    catalogSearchPlaceholder: 'Search products, essentials, or supplies...',
    primaryActionLabel: 'Start Ordering',
    trackHeading: 'Track Order',
    trackDescription: 'Enter a tracking PIN to check your latest order status.',
    supportsServiceGrouping: false,
    supportsProductGrouping: true,
    heroTheme: Object.freeze({
      displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
      accent: '#0f766e',
      accentDark: '#134e4a',
      accentSoft: '#ecfeff',
      surface: '#0f172a'
    })
  }),
  fnb: Object.freeze({
    heroEyebrow: 'Food and beverage storefront',
    heroDescription: 'Browse the live menu, compare food and drink sections, and build an order from product cards designed for ready-to-serve items.',
    catalogHeading: 'Menu Highlights',
    catalogSubtitle: 'Browse food and beverage sections, compare serving options, and add ready-to-order menu items to the cart.',
    catalogSearchPlaceholder: 'Search meals, drinks, desserts, or combo items...',
    primaryActionLabel: 'Browse Menu',
    trackHeading: 'Track Order',
    trackDescription: 'Enter a tracking PIN to check the latest order status without leaving the sheet.',
    supportsServiceGrouping: false,
    supportsProductGrouping: true,
    heroTheme: Object.freeze({
      displayFont: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
      menuTitleFont: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
      bodyFont: "'Trebuchet MS', 'Segoe UI', sans-serif",
      accent: '#c96a2b',
      accentDark: '#6f3415',
      accentSoft: '#fff0e2',
      accentMuted: '#e7b78f',
      surface: '#1c0f07',
      surfaceRaised: '#fffaf4',
      surfaceMuted: '#fff8f0',
      surfaceInset: '#fff3e8',
      borderSoft: '#edd4bc',
      textPrimary: '#2f1f16',
      textMuted: '#7c6757',
      buttonTextOnAccent: '#fffdf9'
    })
  }),
  hospitality: Object.freeze({
    heroEyebrow: 'Hospitality storefront',
    heroDescription: 'Search stay dates, compare room types, add amenities or packages, and confirm a direct booking.',
    catalogHeading: 'Direct Booking',
    catalogSubtitle: 'Search room availability and choose PMS-backed room types, packages, policies, and paid extras.',
    catalogSearchPlaceholder: 'Search rooms, amenities, packages, or policies...',
    primaryActionLabel: 'Book a Stay',
    trackHeading: 'Booking Lookup',
    trackDescription: 'Enter a booking reference to check stay dates, status, and payment state.',
    supportsServiceGrouping: false,
    supportsProductGrouping: false,
    heroTheme: Object.freeze({
      displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
      accent: '#0f766e',
      accentDark: '#134e4a',
      accentSoft: '#ecfeff',
      surface: '#102033',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#f8fafc',
      surfaceInset: '#ecfeff',
      borderSoft: '#bae6fd',
      textPrimary: '#0f172a',
      textMuted: '#64748b',
      buttonTextOnAccent: '#ffffff'
    })
  })
});

export const getStorefrontModeAdapter = (store = null) => {
  const mode = normalizeBusinessMode(store?.workflow_mode || store?.ops_workflow_mode);
  const modeConfig = ModePresentationRegistry[mode] || ModePresentationRegistry.default;
  const storefrontTemplate = getStorefrontTemplateConfig(mode);
  const pin = getBusinessModePinMeta(mode);

  return {
    mode,
    pin,
    storefrontTemplate,
    sharedSections: storefrontTemplate.sharedSections,
    sectionOrder: storefrontTemplate.sectionOrder,
    catalogCardVariant: storefrontTemplate.catalogCardVariant,
    journeyVariant: storefrontTemplate.journeyVariant,
    ...ModePresentationRegistry.default,
    ...modeConfig,
    isServicesMode: mode === 'services',
    isFnbMode: mode === 'fnb',
    isSimpleMode: mode === 'msme',
    isHospitalityMode: mode === 'hospitality'
  };
};
