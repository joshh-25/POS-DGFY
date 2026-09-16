import foodpandaLogo from '../assets/delivery-partners/Foodpanda.png';
import grabLogo from '../assets/delivery-partners/Grab.png';
import lalamoveLogo from '../assets/delivery-partners/Lalamove.png';

// Keep the partner branding in the shared frontend trunk so POS and Storefront
// always render the same local asset. Custom partners intentionally fall back
// to the text badge used by the settings UI.
export const DELIVERY_PARTNER_LOGOS = Object.freeze({
  grab: grabLogo,
  foodpanda: foodpandaLogo,
  lalamove: lalamoveLogo
});

export const DELIVERY_PARTNER_BRAND_COLORS = Object.freeze({
  grab: '#289245',
  foodpanda: '#FF2B85',
  lalamove: '#F16824'
});

export const getDeliveryPartnerLogo = (partner) => {
  const normalizedPartner = String(partner || '').trim().toLowerCase();
  return DELIVERY_PARTNER_LOGOS[normalizedPartner] || '';
};

export const getDeliveryPartnerBrandColor = (partner) => {
  const normalizedPartner = String(partner || '').trim().toLowerCase();
  return DELIVERY_PARTNER_BRAND_COLORS[normalizedPartner] || '';
};
