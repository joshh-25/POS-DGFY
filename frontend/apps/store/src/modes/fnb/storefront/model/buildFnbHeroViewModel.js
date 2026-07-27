import { formatFollowersLabel } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import {
  buildGoogleMapsDirectionsUrl,
  buildVisibleStorefrontContactRows
} from '../../../../shared/utils/storefrontContactPresentation.js';
import { buildPublicStorefrontUrl, withAssetOrigin } from '../../../../app/runtime/storefrontRuntime.js';
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
    // Location records from /api/v1/store/locations don't carry the tenant's
    // business type, so the Discovery-shared marker icon lookup
    // (singleStore?.workflow_mode || singleStore?.business_mode) would otherwise
    // always fall back to the default icon. Carry it over from selectedStore so
    // the Contact & Location map pin matches the Discovery Map pin for this store.
    mapStores: safeStoreLocations.length > 0
      ? safeStoreLocations.map((location) => ({
        ...location,
        tenant_name: selectedStore?.tenant_name,
        workflow_mode: selectedStore?.workflow_mode,
        business_mode: selectedStore?.business_mode
      }))
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
