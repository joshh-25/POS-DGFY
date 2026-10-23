import { sanitizeExternalLink } from '../../shared/utils/externalLinks.js';

export const isExternalListing = (listing) => listing?.entity_type === 'external_listing';

// The public discovery response owns the destination. Managed records expose /e/:slug;
// legacy curated records retain their existing absolute URL compatibility path.
export const resolveExternalActionHref = (listing) => {
  if (!isExternalListing(listing)) return '';
  return sanitizeExternalLink(listing.storefront_url || listing.external_storefront_url);
};
