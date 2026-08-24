import { SERVICES_BODY_FONT, SERVICES_DISPLAY_FONT } from '../../servicesTypography.js';

const SERVICES_HERO_HIGHLIGHT = '#f59e0b';
const SERVICES_HERO_PRIMARY_SHADOW = 'rgba(15,118,110,0.24)';
const SERVICES_HERO_MOBILE_INFO_CARD_WIDTH = 'calc(100% - 32px)';
const SERVICES_CATALOG_MAX_WIDTH = 1216;
const SERVICES_CATALOG_HORIZONTAL_PADDING = 24;

function buildServicesCatalogPresentation({ modeAdapter = {}, modeLabel = '' } = {}) {
  const normalizedModeLabel = String(modeLabel || '')
    .replace(/\b(?:service|services|storefront)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fallbackEyebrow = String(modeAdapter.catalogEyebrow || modeAdapter.heroEyebrow || '').trim();

  return {
    eyebrow: normalizedModeLabel ? `${normalizedModeLabel} Services` : fallbackEyebrow,
    heading: String(modeAdapter.catalogHeading || '').trim(),
    subtitle: String(modeAdapter.catalogSubtitle || '').trim(),
    searchPlaceholder: normalizedModeLabel
      ? `Search ${normalizedModeLabel.toLowerCase()} services...`
      : String(modeAdapter.catalogSearchPlaceholder || '').trim(),
    addActionLabel: String(modeAdapter.catalogAddActionLabel || '').trim(),
    unavailableLabel: String(modeAdapter.catalogUnavailableLabel || '').trim(),
    missingImageLabel: String(modeAdapter.catalogMissingImageLabel || '').trim(),
    maxWidth: Number(modeAdapter.catalogMaxWidth) || SERVICES_CATALOG_MAX_WIDTH,
    horizontalPadding: Number.isFinite(Number(modeAdapter.catalogHorizontalPadding))
      ? Number(modeAdapter.catalogHorizontalPadding)
      : SERVICES_CATALOG_HORIZONTAL_PADDING,
    usesOuterGutter: modeAdapter.catalogUseOuterGutter !== false,
    toolbarVariant: String(modeAdapter.catalogToolbarVariant || 'services-compact')
  };
}

function buildServicesRetailHeroSectionModel({ heroSectionModel, serviceHeroModel } = {}) {
  const baseHero = heroSectionModel || {};
  const serviceHero = serviceHeroModel || {};
  const serviceGalleryImages = Array.isArray(serviceHero.galleryImages)
    ? serviceHero.galleryImages.filter(Boolean)
    : [];
  const baseGalleryPreview = Array.isArray(baseHero.galleryPreview)
    ? baseHero.galleryPreview.filter(Boolean)
    : [];
  const baseGalleryFull = Array.isArray(baseHero.galleryFull) && baseHero.galleryFull.length > 0
    ? baseHero.galleryFull.filter(Boolean)
    : baseGalleryPreview;
  const hasServiceGallery = serviceGalleryImages.length > 0;
  const galleryPreview = hasServiceGallery ? serviceGalleryImages.slice(0, 4) : baseGalleryPreview;
  const galleryFull = hasServiceGallery ? serviceGalleryImages : baseGalleryFull;
  const galleryTotalCount = hasServiceGallery
    ? serviceGalleryImages.length
    : (Number.isFinite(Number(baseHero.galleryTotalCount)) ? Number(baseHero.galleryTotalCount) : galleryFull.length);

  return {
    ...baseHero,
    name: serviceHero.name || baseHero.name || baseHero.storeName || 'Storefront',
    storeName: serviceHero.name || baseHero.storeName || baseHero.name || 'Storefront',
    coverImageUrl: serviceHero.coverImageUrl || baseHero.coverImageUrl,
    profileImageUrl: serviceHero.profileImageUrl || baseHero.profileImageUrl,
    tagline: serviceHero.tagline || baseHero.tagline,
    statusLabel: serviceHero.statusLabel || baseHero.statusLabel,
    ratingLabel: serviceHero.ratingLabel || baseHero.ratingLabel,
    modeLabel: serviceHero.modeLabel || baseHero.modeLabel,
    locationLabel: serviceHero.locationLabel || baseHero.locationLabel,
    addressLine: serviceHero.addressLine || baseHero.addressLine,
    aboutText: serviceHero.sectionAboutText || serviceHero.aboutText || baseHero.aboutText,
    whyChooseUs: Array.isArray(serviceHero.whyChooseUs) && serviceHero.whyChooseUs.length > 0
      ? serviceHero.whyChooseUs
      : baseHero.whyChooseUs,
    galleryPreview,
    galleryFull,
    galleryTotalCount,
    hours: serviceHero.hours || baseHero.hours,
    contactRows: Array.isArray(serviceHero.contactRows) && serviceHero.contactRows.length > 0
      ? serviceHero.contactRows
      : baseHero.contactRows,
    actions: {
      ...baseHero.actions,
      ...serviceHero.actions
    }
  };
}

function deriveServicesHeroTheme(heroTheme) {
  return {
    servicesPrimary: heroTheme?.accent || '#0f766e',
    servicesPrimaryDark: heroTheme?.accentDark || '#134e4a',
    servicesPrimarySoft: heroTheme?.accentSoft || '#ecfeff',
    servicesBodyFont: heroTheme?.bodyFont || SERVICES_BODY_FONT,
    servicesDisplayFont: heroTheme?.displayFont || heroTheme?.bodyFont || SERVICES_DISPLAY_FONT,
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
  const hasMapData = Array.isArray(serviceHeroModel.mapStores)
    && serviceHeroModel.mapStores.length > 0;
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
  buildServicesCatalogPresentation,
  buildServicesRetailHeroSectionModel,
  buildServiceFallbackReasons,
  deriveServicesHeroContent,
  deriveServicesHeroTheme
};
