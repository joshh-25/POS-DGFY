const SHARED_STOREFRONT_SECTIONS = Object.freeze({
  navigation: true,
  hero: true,
  promo: true,
  reviews: true,
  footer: true
});

const SHARED_SECTION_ORDER = Object.freeze([
  'navigation',
  'hero',
  'mainContent',
  'promo',
  'reviews',
  'footer'
]);

const BASE_STOREFRONT_TEMPLATE = Object.freeze({
  templateVersion: '2026.05',
  sectionOrder: SHARED_SECTION_ORDER,
  sharedSections: SHARED_STOREFRONT_SECTIONS,
  breakpoints: Object.freeze({
    mobileMax: 767,
    tabletMin: 768,
    tabletMax: 1023,
    desktopMin: 1024
  }),
  tokens: Object.freeze({
    navigationAccent: '#0f172a',
    heroAccent: '#ea580c',
    promoAccent: '#ea580c',
    reviewAccent: '#0f766e',
    footerAccent: '#0f172a'
  }),
  sharedShellVariant: 'services_shell',
  catalogCardVariant: 'product_standard',
  journeyVariant: 'order'
});

const MODE_TEMPLATE_OVERRIDES = Object.freeze({
  default: Object.freeze({}),
  msme: Object.freeze({
    catalogCardVariant: 'product_simple',
    journeyVariant: 'order',
    tokens: Object.freeze({
      navigationAccent: '#0f172a',
      heroAccent: '#0f766e',
      promoAccent: '#0f766e',
      reviewAccent: '#0f766e',
      footerAccent: '#134e4a'
    })
  }),
  services: Object.freeze({
    catalogCardVariant: 'service_booking',
    journeyVariant: 'booking',
    sharedShellVariant: 'services_fnb_live_shell',
    tokens: Object.freeze({
      navigationAccent: '#172033',
      heroAccent: '#f97316',
      promoAccent: '#f97316',
      reviewAccent: '#0f766e',
      footerAccent: '#172033'
    })
  }),
  fnb: Object.freeze({
    catalogCardVariant: 'product_menu',
    journeyVariant: 'order',
    sectionOrder: Object.freeze([
      'navigation',
      'hero',
      'promo',
      'catalog',
      'reviews',
      'footer'
    ]),
    tokens: Object.freeze({
      navigationAccent: '#0f2942',
      heroAccent: '#d97706',
      promoAccent: '#d97706',
      reviewAccent: '#d97706',
      footerAccent: '#0f2942'
    })
  }),
  hospitality: Object.freeze({
    catalogCardVariant: 'hospitality_booking',
    journeyVariant: 'stay',
    tokens: Object.freeze({
      navigationAccent: '#102033',
      heroAccent: '#0f766e',
      promoAccent: '#0f766e',
      reviewAccent: '#0369a1',
      footerAccent: '#102033'
    })
  })
});

export const getStorefrontTemplateConfig = (mode = 'default') => {
  const modeOverride = MODE_TEMPLATE_OVERRIDES[mode] || MODE_TEMPLATE_OVERRIDES.default;
  return Object.freeze({
    ...BASE_STOREFRONT_TEMPLATE,
    ...modeOverride,
    sectionOrder: modeOverride.sectionOrder || SHARED_SECTION_ORDER,
    sharedSections: modeOverride.sharedSections || SHARED_STOREFRONT_SECTIONS,
    tokens: Object.freeze({
      ...BASE_STOREFRONT_TEMPLATE.tokens,
      ...(modeOverride.tokens || {})
    })
  });
};
