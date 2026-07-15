import { formatFollowersLabel } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import {
  buildGoogleMapsDirectionsUrl,
  buildVisibleStorefrontContactRows
} from '../../../../shared/utils/storefrontContactPresentation.js';
import { buildPublicStorefrontUrl } from '../../../../app/runtime/storefrontRuntime.js';
import { buildFnbFallbackReasons } from './fnbStorefrontPresentation.js';
import { buildFnbHeroDeliveryPartners } from './fnbHeroDeliveryPartners.js';

export function buildFnbHeroViewModel({
  cartCount,
  fnbViewModel,
  followEnabled,
  followersCount,
  heroSectionModel,
  maxWhyChooseUs,
  selectedLocation,
  selectedLocationId,
  selectedStore,
  storeLocations
}) {
  const safeHeroSectionModel = heroSectionModel || {};
  const safeStoreLocations = Array.isArray(storeLocations) ? storeLocations : [];
  const addressText = String(safeHeroSectionModel.addressLine || safeHeroSectionModel.locationLabel || '').trim();
  const selectedBranchLabel = String(selectedLocation?.name || safeHeroSectionModel.locationLabel || '').trim();
  const galleryImages = Array.isArray(safeHeroSectionModel.galleryPreview) ? safeHeroSectionModel.galleryPreview.filter(Boolean) : [];
  const aboutText = String(safeHeroSectionModel.aboutText || '').trim();
  const deliveryPlatformLinks = buildFnbHeroDeliveryPartners(safeHeroSectionModel.deliveryPartners);
  const whyChooseUs = Array.isArray(safeHeroSectionModel.whyChooseUs) && safeHeroSectionModel.whyChooseUs.length > 0
    ? safeHeroSectionModel.whyChooseUs
    : buildFnbFallbackReasons({
      fnbViewModel,
      categories: [safeHeroSectionModel.primaryCategoryLabel, safeHeroSectionModel.locationSummary]
    });
  const visibleWhyChooseUs = whyChooseUs.slice(0, maxWhyChooseUs);
  const hasAboutSection = aboutText.length > 0;
  const hasGallerySection = galleryImages.length > 0;
  const hasAboutOrGallerySection = hasAboutSection || hasGallerySection;
  const hasMapData = Number.isFinite(Number(selectedLocation?.latitude ?? selectedStore?.latitude))
    && Number.isFinite(Number(selectedLocation?.longitude ?? selectedStore?.longitude));
  const visibleContactRows = buildVisibleStorefrontContactRows({
    contactRows: safeHeroSectionModel.contactRows,
    hours: safeHeroSectionModel.hours,
    rawHoursData: safeHeroSectionModel.rawHoursData,
    addressText,
    directionsUrl: buildGoogleMapsDirectionsUrl({
      latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
      longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
      addressLine: addressText
    })
  });
  const hasWhyChooseUs = visibleWhyChooseUs.length > 0;

  return {
    aboutText,
    addressText,
    deliveryPlatformLinks,
    desktopColumns: hasAboutOrGallerySection
      ? (hasWhyChooseUs ? '1fr 1.6fr 0.92fr' : '1fr 1.6fr')
      : (hasWhyChooseUs ? '1.6fr 0.92fr' : '1fr'),
    displayHours: String(safeHeroSectionModel.hours || '').trim(),
    followersLabel: followEnabled ? formatFollowersLabel(followersCount) : '',
    galleryImages,
    hasAboutOrGallerySection,
    hasAboutSection,
    hasAboutToggle: aboutText.length > 180,
    hasContactRows: visibleContactRows.length > 0,
    hasGallerySection,
    hasMapData,
    hasMobileStoreDetailsSummary: Boolean(safeHeroSectionModel.hours) || deliveryPlatformLinks.length > 0,
    hasWhyChooseUs,
    mapSelectedKey: selectedLocationId != null
      ? `loc-${selectedLocationId}`
      : `tenant-${selectedStore?.tenant_id || selectedStore?.slug || 'store'}`,
    mapStores: safeStoreLocations.length > 0
      ? safeStoreLocations.map((location) => ({ ...location, tenant_name: selectedStore?.tenant_name }))
      : [selectedStore],
    orderLabel: cartCount > 0 ? 'Open Cart' : (safeHeroSectionModel.actions?.orderLabel || 'Browse Menu'),
    profileImageKey: `hero-profile:${selectedStore?.slug || 'store'}`,
    selectedBranchLabel,
    storefrontCityLabel: String(fnbViewModel?.storefront_location?.city || '').trim(),
    storefrontShareUrl: selectedStore?.slug ? buildPublicStorefrontUrl(selectedStore.slug) : '',
    visibleContactRows,
    visibleWhyChooseUs
  };
}
