const PARTNERS = Object.freeze({
  proventus: { name: 'Proventus', action: 'View job', pinMode: 'external_jobs' },
  eytitu: { name: 'Eytitu', action: 'Book ride', pinMode: 'external_taxis' },
  mapviu: { name: 'Mapviu', action: 'Inquire', pinMode: 'external_real_estate' },
  synqcore: { name: 'Synqcore', action: 'Book stay', pinMode: 'external_hotels' }
});

export const getExternalListingPresentation = (listing) => {
  if (listing?.entity_type !== 'external_listing') return null;
  return PARTNERS[String(listing.external_provider || '').toLowerCase()] || {
    name: 'Partner site', action: 'Visit partner', pinMode: 'external_listing'
  };
};
