const PARTNERS = Object.freeze({
  proventus: { name: 'Proventus', action: 'View Job', pinMode: 'external_jobs', allowImage: false },
  eytitu: { name: 'Eytitu', action: 'Book This Taxi', pinMode: 'external_taxis', allowImage: false },
  mapviu: { name: 'Mapviu', action: 'Inquire', pinMode: 'external_real_estate', allowImage: true },
  synqcore: { name: 'Synqcore', action: 'Book Stay', pinMode: 'external_hotels', allowImage: true }
});

export const getExternalListingPresentation = (listing) => {
  if (listing?.entity_type !== 'external_listing') return null;
  return PARTNERS[String(listing.external_provider || '').toLowerCase()] || {
    name: 'Partner site', action: 'Visit partner', pinMode: 'external_listing', allowImage: false
  };
};
