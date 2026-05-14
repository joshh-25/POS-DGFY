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
  'promo',
  'catalog',
  'reviews',
  'footer'
]);

const BASE_STOREFRONT_TEMPLATE = Object.freeze({
  templateVersion: '2026.05',
  sectionOrder: SHARED_SECTION_ORDER,
  sharedSections: SHARED_STOREFRONT_SECTIONS,
  tokens: Object.freeze({
    navigationAccent: '#0f172a',
    heroAccent: '#ea580c',
    promoAccent: '#ea580c',
    reviewAccent: '#0f766e',
    footerAccent: '#0f172a'
  }),
  sharedShellVariant: 'services_fnb_live_shell',
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
    tokens: Object.freeze({
      navigationAccent: '#1c0f07',
      heroAccent: '#c96a2b',
      promoAccent: '#c96a2b',
      reviewAccent: '#166534',
      footerAccent: '#1c0f07'
    })
  })
});

export const getStorefrontTemplateConfig = (mode = 'default') => {
  const modeOverride = MODE_TEMPLATE_OVERRIDES[mode] || MODE_TEMPLATE_OVERRIDES.default;
  return Object.freeze({
    ...BASE_STOREFRONT_TEMPLATE,
    ...modeOverride,
    sectionOrder: SHARED_SECTION_ORDER,
    sharedSections: SHARED_STOREFRONT_SECTIONS,
    tokens: Object.freeze({
      ...BASE_STOREFRONT_TEMPLATE.tokens,
      ...(modeOverride.tokens || {})
    })
  });
};
