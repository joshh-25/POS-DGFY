import { getBusinessModePinMeta, normalizeBusinessMode } from '../../discovery/model/businessModePins.js';
import { getStorefrontTemplateConfig } from './storefrontTemplateRegistry.js';
import { hasServicesCapability as hasComposedServicesCapability } from '../../shared/model/workflowCapabilities.js';

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
    templateContent: Object.freeze({
      navigation: Object.freeze({
        brandLabel: 'DGFY.ph',
        searchPlaceholder: 'Search services, stores, or promos',
        primaryLinks: Object.freeze(['Overview', 'Highlights', 'Reviews']),
        utilityLinks: Object.freeze(['Contact', 'Support'])
      }),
      hero: Object.freeze({
        eyebrow: 'Shared storefront shell',
        primaryActionLabel: 'Explore Storefront',
        secondaryActionLabel: 'See Availability',
        tertiaryActionLabel: 'Contact Store',
        supportBadge: 'Flexible for every storefront mode'
      }),
      promo: Object.freeze({
        eyebrow: 'Highlights',
        title: 'Use this section for platform promos, reminders, or key offers.',
        description: 'Keep the structure shared while the actual promo cards stay mode-specific.',
        emptyLabel: 'No active promos yet'
      }),
      reviews: Object.freeze({
        eyebrow: 'Customer reviews',
        title: 'Trust signals should keep the same structure across storefront modes.',
        description: 'Ratings, summary text, and review cards should be data-driven from each storefront.',
        emptyLabel: 'Add review data when this storefront is connected.'
      }),
      footer: Object.freeze({
        description: 'Use the same footer structure across storefront modes while keeping link groups and copy editable.',
        legalLine: 'Template basis for future storefront builds.'
      })
    }),
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
    catalogSearchPlaceholder: 'Search services...',
    primaryActionLabel: 'Book a Service',
    trackHeading: 'Track Booking or Order',
    trackDescription: 'Enter a booking reference or order tracking PIN to check the latest status without leaving the sheet.',
    supportsServiceGrouping: true,
    templateContent: Object.freeze({
      navigation: Object.freeze({
        brandLabel: 'DGFY Services',
        searchPlaceholder: 'Search services, stores, or service areas',
        primaryLinks: Object.freeze(['Services', 'How it works', 'Reviews']),
        utilityLinks: Object.freeze(['Coverage', 'Support'])
      }),
      hero: Object.freeze({
        eyebrow: 'Services storefront template',
        primaryActionLabel: 'Book a Service',
        secondaryActionLabel: 'See Service Areas',
        tertiaryActionLabel: 'Talk to Support',
        supportBadge: 'Best baseline for shared storefront structure'
      }),
      promo: Object.freeze({
        eyebrow: 'Promos and reminders',
        title: 'Promos can stay flexible while the section layout remains shared.',
        description: 'This block works for offers, booking reminders, delivery notes, or seasonal campaigns.',
        emptyLabel: 'No active service promos today'
      }),
      reviews: Object.freeze({
        eyebrow: 'Proof and confidence',
        title: 'Customer reviews should reinforce trust before booking.',
        description: 'Use a summary card plus review cards so this section scales from one mode to another.',
        emptyLabel: 'No service reviews published yet'
      }),
      footer: Object.freeze({
        description: 'Services mode is the best baseline because it balances trust, clarity, and action-heavy flows.',
        legalLine: 'Shared footer shell for future storefront templates.'
      })
    }),
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
    templateContent: Object.freeze({
      navigation: Object.freeze({
        brandLabel: 'DGFY Simple',
        searchPlaceholder: 'Search products, stores, or categories',
        primaryLinks: Object.freeze(['Products', 'Offers', 'Reviews']),
        utilityLinks: Object.freeze(['Delivery', 'Support'])
      }),
      hero: Object.freeze({
        eyebrow: 'Simple storefront template',
        primaryActionLabel: 'Start Ordering',
        secondaryActionLabel: 'View Categories',
        tertiaryActionLabel: 'Ask a Question',
        supportBadge: 'Shared shell adapted for fast product ordering'
      }),
      promo: Object.freeze({
        eyebrow: 'Promos and bundles',
        title: 'Use shared promo cards for price-led product campaigns.',
        description: 'This section can surface bundle offers, freebies, or time-based store notices.',
        emptyLabel: 'No active product promos'
      }),
      reviews: Object.freeze({
        eyebrow: 'Customer feedback',
        title: 'Simple storefront reviews should keep the same layout but lighter copy.',
        description: 'Review content stays data-driven so each store can show different proof without changing the template.',
        emptyLabel: 'No product reviews yet'
      }),
      footer: Object.freeze({
        description: 'Use the shared footer shell for ordering, support, and policy links.',
        legalLine: 'Reusable footer basis for simple storefronts.'
      })
    }),
    heroTheme: Object.freeze({
      displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
      accent: '#0f766e',
      accentDark: '#134e4a',
      accentSoft: '#ecfeff',
      surface: '#0f172a'
    })
  }),
  retail: Object.freeze({
    heroEyebrow: 'Retail storefront',
    heroDescription: 'Browse shelf items, weighed goods, and refills, then check out or reserve for pickup.',
    catalogHeading: 'Shop the Store',
    catalogSubtitle: 'Browse general merchandise, per-kilo goods, and refill products currently in stock.',
    catalogSearchPlaceholder: 'Search products, brands, or categories...',
    primaryActionLabel: 'Add to Cart',
    trackHeading: 'Track Order',
    trackDescription: 'Enter a tracking PIN to check your latest order status.',
    supportsServiceGrouping: false,
    supportsProductGrouping: true,
    templateContent: Object.freeze({
      navigation: Object.freeze({
        brandLabel: 'DGFY Retail',
        searchPlaceholder: 'Search products, stores, or categories',
        primaryLinks: Object.freeze(['Shop', 'Offers', 'Reviews']),
        utilityLinks: Object.freeze(['Delivery', 'Support'])
      }),
      hero: Object.freeze({
        eyebrow: 'Retail storefront template',
        primaryActionLabel: 'Shop Now',
        secondaryActionLabel: 'View Categories',
        tertiaryActionLabel: 'Ask a Question',
        supportBadge: 'Shared shell adapted for retail shelf browsing'
      }),
      promo: Object.freeze({
        eyebrow: 'Promos and bundles',
        title: 'Use shared promo cards for price-led retail campaigns.',
        description: 'This section can surface bundle offers, discounts, or time-based store notices.',
        emptyLabel: 'No active promos'
      }),
      reviews: Object.freeze({
        eyebrow: 'Customer feedback',
        title: 'Retail storefront reviews keep the same layout as other modes.',
        description: 'Review content stays data-driven so each store can show different proof without changing the template.',
        emptyLabel: 'No product reviews yet'
      }),
      footer: Object.freeze({
        description: 'Use the shared footer shell for ordering, support, and policy links.',
        legalLine: 'Reusable footer basis for retail storefronts.'
      })
    }),
    heroTheme: Object.freeze({
      displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
      accent: '#ea580c',
      accentDark: '#9a3412',
      accentSoft: '#fff7ed',
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
    templateContent: Object.freeze({
      navigation: Object.freeze({
        brandLabel: 'DGFY Dining',
        searchPlaceholder: 'Search meals, drinks, or dining promos',
        primaryLinks: Object.freeze(['Menu', 'Promos', 'Reviews']),
        utilityLinks: Object.freeze(['Pickup', 'Support'])
      }),
      hero: Object.freeze({
        eyebrow: 'Food and beverage template',
        primaryActionLabel: 'Browse Menu',
        secondaryActionLabel: 'See Combos',
        tertiaryActionLabel: 'Contact Store',
        supportBadge: 'Shared shell tuned for menu-first storefronts'
      }),
      promo: Object.freeze({
        eyebrow: 'Offers and specials',
        title: 'Keep the promo layout shared even when the content is menu-driven.',
        description: 'This section can show combos, limited-time dishes, reservation reminders, or delivery offers.',
        emptyLabel: 'No featured specials right now'
      }),
      reviews: Object.freeze({
        eyebrow: 'What diners say',
        title: 'F&B storefront reviews can share the same structure with stronger visual flair.',
        description: 'The shell stays shared while each mode controls its own copy, summary, and review cards.',
        emptyLabel: 'No menu reviews published yet'
      }),
      footer: Object.freeze({
        description: 'Use the same footer rhythm across menu storefronts while keeping the content fully editable.',
        legalLine: 'Reusable footer basis for dining storefronts.'
      })
    }),
    heroTheme: Object.freeze({
      displayFont: "'Outfit', 'Avenir Next', 'Segoe UI', sans-serif",
      menuTitleFont: "'Outfit', 'Avenir Next', 'Segoe UI', sans-serif",
      bodyFont: "'Source Sans 3', 'Segoe UI', sans-serif",
      accent: '#FF8F00',
      accentDark: '#2E7D32',
      accentSoft: '#FFF8F0',
      accentMuted: '#FF8F00',
      surface: '#F8F9F4',
      surfaceRaised: '#ffffff',
      surfaceMuted: '#FFF8F0',
      surfaceInset: '#F8F9F4',
      borderSoft: '#DDE5D8',
      textPrimary: '#1F1F1F',
      textMuted: '#6B7280',
      buttonTextOnAccent: '#ffffff'
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
  // A tenant whose scalar mode is NOT 'services' can still have the `services`
  // capability composed in via the ops_enabled_capabilities overlay (Phase 6a).
  // That must not flip isServicesMode (which several consumers treat as "this
  // storefront is a booking-only shell with no product catalog") -- it only
  // needs to unlock service grouping/booking affordances alongside the
  // tenant's own primary mode. See workflowCapabilities.js.
  const hasServicesCapability = mode === 'services' || hasComposedServicesCapability(store);

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
    isHospitalityMode: mode === 'hospitality',
    isRetailMode: mode === 'retail',
    hasServicesCapability,
    supportsServiceGrouping: modeConfig.supportsServiceGrouping === true || hasServicesCapability
  };
};
