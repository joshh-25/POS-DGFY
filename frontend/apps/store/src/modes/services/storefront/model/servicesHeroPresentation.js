const SERVICES_HERO_HIGHLIGHT = '#f59e0b';
const SERVICES_HERO_PRIMARY_SHADOW = 'rgba(15,118,110,0.24)';
const SERVICES_HERO_MOBILE_INFO_CARD_WIDTH = 'calc(100% - 32px)';

function deriveServicesHeroTheme(heroTheme) {
  return {
    servicesPrimary: heroTheme?.accent || '#0f766e',
    servicesPrimaryDark: heroTheme?.accentDark || '#134e4a',
    servicesPrimarySoft: heroTheme?.accentSoft || '#ecfeff',
    servicesBodyFont: heroTheme?.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif",
    servicesDisplayFont: heroTheme?.displayFont || heroTheme?.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif",
    servicesHighlight: SERVICES_HERO_HIGHLIGHT,
    servicesPrimaryShadow: SERVICES_HERO_PRIMARY_SHADOW,
    servicesMobileInfoCardWidth: SERVICES_HERO_MOBILE_INFO_CARD_WIDTH
  };
}

function deriveServicesHeroContent({
  buildVisibleStorefrontContactRows,
  getDeliveryPlatformLinks,
  isServiceGalleryExpanded,
  maxWhyChooseUs,
  selectedLocation,
  selectedStore,
  serviceHeroModel
}) {
  const addressText = String(serviceHeroModel.addressLine || serviceHeroModel.locationLabel || '').trim();
  const selectedBranchLabel = String(selectedLocation?.name || serviceHeroModel.locationLabel || '').trim();
  const storefrontCityLabel = String(selectedLocation?.city || selectedStore?.city || '').trim();
  const galleryImages = Array.isArray(serviceHeroModel.galleryImages) ? serviceHeroModel.galleryImages.filter(Boolean) : [];
  const previewImages = isServiceGalleryExpanded ? galleryImages : galleryImages.slice(0, 4);
  const aboutText = String(serviceHeroModel.sectionAboutText || '').trim();
  const hasAboutSection = aboutText.length > 0;
  const hasGallerySection = galleryImages.length > 0;
  const hasAboutOrGallerySection = hasAboutSection || hasGallerySection;
  const hasAboutToggle = aboutText.length > 180;
  const hasAddress = Boolean(addressText);
  const hasMapData = Number.isFinite(Number(selectedLocation?.latitude ?? selectedStore?.latitude))
    && Number.isFinite(Number(selectedLocation?.longitude ?? selectedStore?.longitude));
  const visibleWhyChooseUs = Array.isArray(serviceHeroModel.whyChooseUs)
    ? serviceHeroModel.whyChooseUs.slice(0, maxWhyChooseUs)
    : [];
  const visibleContactRows = buildVisibleStorefrontContactRows({
    contactRows: serviceHeroModel.contactRows,
    hours: serviceHeroModel.hours,
    rawHoursData: serviceHeroModel.rawHoursData,
    addressText,
    directionsUrl: serviceHeroModel.directionsUrl,
    destinationLatitude: selectedLocation?.latitude ?? selectedStore?.latitude,
    destinationLongitude: selectedLocation?.longitude ?? selectedStore?.longitude
  });
  const hasWhyChooseUs = visibleWhyChooseUs.length > 0;
  const hasContactRows = visibleContactRows.length > 0;
  const desktopColumns = hasAboutOrGallerySection
    ? (hasWhyChooseUs ? '1fr 1.6fr 0.92fr' : '1fr 1.6fr')
    : (hasWhyChooseUs ? '1.6fr 0.92fr' : '1fr');
  const deliveryPlatformLinks = getDeliveryPlatformLinks(serviceHeroModel.deliveryPartners);

  return {
    aboutText,
    addressText,
    deliveryPlatformLinks,
    desktopColumns,
    galleryImages,
    hasAboutOrGallerySection,
    hasAboutSection,
    hasAboutToggle,
    hasAddress,
    hasContactRows,
    hasGallerySection,
    hasMapData,
    hasWhyChooseUs,
    previewImages,
    selectedBranchLabel,
    storefrontCityLabel,
    visibleContactRows,
    visibleWhyChooseUs
  };
}

function buildServiceFallbackReasons({ serviceGroups = [], servicesViewModel = null, categories = [] } = {}) {
  const reasons = [];
  if (Array.isArray(categories) && categories.length > 0) {
    reasons.push(...categories.slice(0, 2));
  }
  if (Array.isArray(serviceGroups) && serviceGroups.length > 0) {
    serviceGroups.slice(0, 2).forEach((group) => {
      const count = Number(group?.items?.length || 0);
      if (count > 0) {
        reasons.push(`${group.categoryMeta?.label || 'Service'} options (${count})`);
      }
    });
  }
  const totalServices = Number(servicesViewModel?.totalServices || 0);
  if (totalServices > 0) {
    reasons.push(`${totalServices} services currently listed`);
  }
  return [...new Set(reasons.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, 4);
}

export {
  buildServiceFallbackReasons,
  deriveServicesHeroContent,
  deriveServicesHeroTheme
};
