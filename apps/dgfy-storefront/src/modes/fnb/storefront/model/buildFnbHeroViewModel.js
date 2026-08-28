import { formatFollowersLabel } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import {
  buildGoogleMapsDirectionsUrl,
  buildVisibleStorefrontContactRows
} from '../../../../shared/utils/storefrontContactPresentation.js';
import { formatStorefrontAddress } from '../../../../shared/model/storefrontCatalogModel.js';
import { buildPublicStorefrontUrl, withAssetOrigin } from '../../../../app/runtime/storefrontRuntime.js';
import { buildFnbFallbackReasons } from './fnbStorefrontPresentation.js';
import { buildFnbHeroDeliveryPartners } from './fnbHeroDeliveryPartners.js';
import { buildSelectedStorefrontMapStores } from '../../../../shared/model/storefrontMapModel.js';

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
  const mapPublicationDisabled = Boolean(
    selectedStore?.store_has_no_location
    || selectedStore?.map_publication_disabled
  );
  const mapStores = buildSelectedStorefrontMapStores({
    mapPublicationDisabled,
    selectedLocation,
    selectedStore,
    storeLocations: safeStoreLocations
  });
  const mapLocation = mapStores[0] || null;
  const publicLatitude = mapLocation?.latitude ?? null;
  const publicLongitude = mapLocation?.longitude ?? null;
  const addressText = formatStorefrontAddress(selectedLocation || safeHeroSectionModel)
    || String(safeHeroSectionModel.addressLine || safeHeroSectionModel.locationLabel || '').trim();
  const selectedBranchLabel = String(selectedLocation?.name || safeHeroSectionModel.locationLabel || '').trim();
  const galleryImages = Array.isArray(safeHeroSectionModel.galleryPreview)
    ? safeHeroSectionModel.galleryPreview.filter(Boolean).map((url) => withAssetOrigin(url)).filter(Boolean)
    : [];
  // `galleryPreview` is already capped at 4 entries upstream (normalizeStorefrontPageModel.js),
  // so the overflow count must come from `galleryTotalCount` (the true, unsliced count) rather
  // than comparing galleryImages against itself, which would always be zero.
  const galleryTotalCount = Number.isFinite(Number(safeHeroSectionModel.galleryTotalCount))
    ? Number(safeHeroSectionModel.galleryTotalCount)
    : galleryImages.length;
  const galleryOverflowCount = Math.max(0, galleryTotalCount - galleryImages.length);
  // Full, unsliced gallery list (asset-origin resolved) for the mobile fullscreen
  // viewer, which must be able to navigate every uploaded image, not just the
  // 4-tile preview cap used by the grid/overlay.
  const galleryImagesFull = Array.isArray(safeHeroSectionModel.galleryFull)
    ? safeHeroSectionModel.galleryFull.filter(Boolean).map((url) => withAssetOrigin(url)).filter(Boolean)
    : galleryImages;
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
  const hasMapData = Boolean(mapLocation);
  const visibleContactRows = buildVisibleStorefrontContactRows({
    contactRows: safeHeroSectionModel.contactRows,
    hours: safeHeroSectionModel.hours,
    rawHoursData: safeHeroSectionModel.rawHoursData,
    addressText,
    directionsUrl: hasMapData
      ? buildGoogleMapsDirectionsUrl({
          latitude: publicLatitude,
          longitude: publicLongitude,
          addressLine: addressText
        })
      : '',
    destinationLatitude: hasMapData ? publicLatitude : null,
    destinationLongitude: hasMapData ? publicLongitude : null
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
    galleryImagesFull,
    galleryOverflowCount,
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
    mapStores,
    orderLabel: cartCount > 0 ? 'Open Cart' : (safeHeroSectionModel.actions?.orderLabel || 'Browse Menu'),
    profileImageKey: `hero-profile:${selectedStore?.slug || 'store'}`,
    selectedBranchLabel,
    storefrontCityLabel: String(selectedLocation?.city || fnbViewModel?.storefront_location?.city || '').trim(),
    storefrontShareUrl: selectedStore?.slug ? buildPublicStorefrontUrl(selectedStore.slug) : '',
    visibleContactRows,
    visibleWhyChooseUs
  };
}
