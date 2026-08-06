import { sanitizeExternalLink } from '../../../../shared/utils/externalLinks.js';

const DELIVERY_PARTNER_LOGOS = Object.freeze({
  grab: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSboB_YmMRIM3d5SN4mxXvUZmG5j0kbI1N2hg&s',
  foodpanda: 'https://cdn.worldvectorlogo.com/logos/foodpanda-logo.svg',
  lalamove: 'https://images.seeklogo.com/logo-png/44/1/lalamove-logo-png_seeklogo-447373.png'
});

export const buildFnbHeroDeliveryPartners = (deliveryPartners = []) => (
  (Array.isArray(deliveryPartners) ? deliveryPartners : [])
    .map((entry) => {
      const partner = String(entry?.partner || '').trim().toLowerCase();
      if (!partner) return null;
      const href = sanitizeExternalLink(entry?.url);
      if (!href) return null;
      return {
        partner,
        label: String(entry?.label || (partner === 'foodpanda' ? 'foodpanda' : partner.charAt(0).toUpperCase() + partner.slice(1))).trim(),
        href,
        logoUrl: DELIVERY_PARTNER_LOGOS[partner] || ''
      };
    })
    .filter(Boolean)
);
