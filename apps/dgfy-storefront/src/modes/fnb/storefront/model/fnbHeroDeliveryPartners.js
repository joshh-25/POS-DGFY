import {
  getDeliveryPartnerBrandColor,
  getDeliveryPartnerLogo
} from '../../../../../../../packages/web-core/src/utils/deliveryPartnerAssets.js';
import { sanitizeExternalLink } from '../../../../shared/utils/externalLinks.js';

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
        logoUrl: getDeliveryPartnerLogo(partner),
        brandColor: getDeliveryPartnerBrandColor(partner)
      };
    })
    .filter(Boolean)
);
