import { useMemo } from 'react';

import { filterCatalogItems } from '../model/catalogSearch.js';
import { formatStorefrontAddress } from '../model/storefrontCatalogModel.js';
import { formatStorefrontHoursLabel } from '../model/storefrontHoursModel.js';
import { parseOptionalObject } from '../model/storefrontJsonModel.js';
import {
  canUseBooking,
  canUseCheckout,
  canUseProductCart,
  canViewCatalog,
  getAccessCapabilities
} from '../model/customerAccess.js';
import { buildGoogleMapsDirectionsUrl } from '../utils/storefrontContactPresentation.js';
import { normalizeStorefrontPageModel } from '../../app/runtime/normalizeStorefrontPageModel.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';
import { getFoodBeverageStorefrontViewModel } from '../../modes/fnb/storefront/model/fnbStorefrontViewModel.js';
import { buildFnbCommunityModel } from '../../modes/fnb/storefront/model/fnbCommunityModel.js';
import { buildFnbPromoSectionModel } from '../../modes/fnb/promos/model/fnbPromoModel.js';
import { buildServiceFallbackReasons } from '../../modes/services/storefront/model/servicesHeroPresentation.js';
import { buildSimpleFallbackReasons } from '../../modes/simple/storefront/model/simpleStorefrontPresentation.js';
import {
  deriveStorefrontRegistrationYear,
  formatRatingSummary,
  getPreferredSocialContact
} from '../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';

/**
 * ViewModel hook for the storefront catalog/page-model derivations.
 * Owns the pure `useMemo` view-model chain that used to live inline in
 * `StorefrontApp.jsx`: the normalized page model + mode flags, the
 * filtered catalog/F&B menu chain, the promo section model, the selected
 * location, access capabilities, the Services hero model, the F&B
 * community model, the Simple mode model, and the catalog empty/loading
 * state. Every declaration below is moved verbatim from the shell.
 */
export function useStorefrontCatalog({
  selectedStore,
  catalog,
  catalogSearch,
  storeLocations,
  selectedLocationId,
  loadingCatalog,
  catalogError,
  hasCatalogSearchQuery
}) {
  const pageModel = useMemo(() => (
    normalizeStorefrontPageModel({
      selectedStore,
      catalog
    })
  ), [selectedStore, catalog]);
  const {
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    isHospitalityMode,
    isRetailMode,
    modeAdapter,
    servicesViewModel,
    fnbViewModel,
    servicesLayoutMode,
    hero: heroSectionModel,
    overview: overviewSectionModel,
    supporting: supportingSectionModel
  } = pageModel;
  const filteredCatalog = useMemo(() => filterCatalogItems(catalog, catalogSearch), [catalog, catalogSearch]);
  const baseFilteredFnbViewModel = useMemo(() => getFoodBeverageStorefrontViewModel(filteredCatalog), [filteredCatalog]);
  const filteredFnbCatalog = useMemo(() => (
    Array.isArray(baseFilteredFnbViewModel?.menuItems) ? baseFilteredFnbViewModel.menuItems : []
  ), [baseFilteredFnbViewModel]);
  const filteredFnbViewModel = useMemo(() => getFoodBeverageStorefrontViewModel(filteredFnbCatalog), [filteredFnbCatalog]);
  const promoSectionModel = useMemo(() => buildFnbPromoSectionModel({
    catalog,
    selectedStore,
    supportingPromo: supportingSectionModel?.promo,
    maxItems: 3
  }), [catalog, selectedStore, supportingSectionModel?.promo]);
  const selectedLocation = useMemo(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) return null;
    if (selectedLocationId == null) return null;
    return storeLocations.find((location) => Number(location.location_id) === Number(selectedLocationId)) || null;
  }, [storeLocations, selectedLocationId]);
  const mapPublicationDisabled = Boolean(
    selectedStore?.store_has_no_location
    || selectedStore?.map_publication_disabled
  );
  const accessCapabilities = useMemo(() => getAccessCapabilities(selectedStore), [selectedStore]);
  const catalogPermitted = canViewCatalog(selectedStore);
  const productCartPermitted = canUseProductCart(selectedStore);
  const checkoutPermitted = canUseCheckout(selectedStore);
  const bookingPermitted = canUseBooking(selectedStore);
  const serviceHeroModel = useMemo(() => {
    if (!selectedStore || !isServicesMode) return null;
    const mapStores = mapPublicationDisabled
      ? []
      : (storeLocations.length > 0
          ? storeLocations.map((location) => ({
            ...location,
            tenant_name: selectedStore?.tenant_name,
            workflow_mode: selectedStore?.workflow_mode,
            business_mode: selectedStore?.business_mode
          }))
          : [selectedStore]);
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const galleryPreview = Array.isArray(supportingSectionModel?.galleryImages)
      ? supportingSectionModel.galleryImages.slice(0, 4).map((entry) => withAssetOrigin(entry.url || entry.path)).filter(Boolean)
      : [];
    const reviewSummary = supportingSectionModel?.reviewSummary || null;
    const serviceGroups = Array.isArray(servicesViewModel?.serviceGroups) ? servicesViewModel.serviceGroups : [];
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const preferredSocialContact = getPreferredSocialContact({ messengerLink, facebookLink });
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = formatStorefrontHoursLabel(
      selectedStore?.storefront_hours,
      heroSectionModel?.hours || selectedStore?.storefront_hours_status?.display || ''
    );
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const directionsUrl = mapPublicationDisabled
      ? ''
      : buildGoogleMapsDirectionsUrl({
          latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
          longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
          addressLine
        });
    const mergedGalleryImages = [...new Set(galleryPreview)];
    const mergedGalleryPreview = mergedGalleryImages.slice(0, 4);
    const whyChooseUs = Array.isArray(overviewSectionModel?.whyChooseUs) && overviewSectionModel.whyChooseUs.length > 0
      ? overviewSectionModel.whyChooseUs.slice(0, 4)
      : buildServiceFallbackReasons({
        serviceGroups,
        servicesViewModel,
        categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories : []
      });
    const ratingLabel = formatRatingSummary(reviewSummary);
    const reviewCount = Number((reviewSummary?.total_count ?? reviewSummary?.totalCount) || 0);
    const serviceCounts = {
      total: Number(servicesViewModel?.totalServices || 0),
      families: Number(servicesViewModel?.serviceFamilyCount || 0),
      onSite: Number(servicesViewModel?.onSiteCount || 0)
    };
    const quickStats = [
      serviceCounts.total > 0 ? { label: 'Services', value: String(serviceCounts.total) } : null,
      serviceCounts.families > 0 ? { label: 'Categories', value: String(serviceCounts.families) } : null,
      reviewCount > 0 ? { label: 'Reviews', value: String(reviewCount) } : null
    ].filter(Boolean);

    return {
      coverImageUrl: withAssetOrigin(heroSectionModel?.coverImageUrl),
      profileImageUrl: withAssetOrigin(heroSectionModel?.profileImageUrl),
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      statusLabel: heroSectionModel?.statusLabel || (selectedStore?.storefront_open ? 'Open' : 'Closed'),
      ratingLabel,
      modeLabel: heroSectionModel?.primaryCategoryLabel || modeAdapter.heroEyebrow,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      aboutText: heroSectionModel?.aboutText || '',
      sectionAboutText: heroSectionModel?.aboutText || '',
      categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories.slice(0, 3) : [],
      whyChooseUs,
      galleryImages: mergedGalleryImages,
      galleryPreview: mergedGalleryPreview,
      galleryOverflowCount: Math.max(0, (Array.isArray(supportingSectionModel?.galleryImages) ? supportingSectionModel.galleryImages.length : mergedGalleryPreview.length) - mergedGalleryPreview.length),
      reviewSummary,
      reviewHighlights: Array.isArray(supportingSectionModel?.reviewHighlights) ? supportingSectionModel.reviewHighlights : [],
      reviewCount,
      quickStats,
      serviceCounts,
      servicesLayoutMode,
      servicesWithRequiredIntakeCount: Number(servicesViewModel?.servicesWithRequiredIntakeCount || 0),
      servicesWithAvailabilityCount: Number(servicesViewModel?.servicesWithAvailabilityCount || 0),
      servicesWithStructuredScheduleCount: Number(servicesViewModel?.servicesWithStructuredScheduleCount || 0),
      prepaidServiceCount: Number(servicesViewModel?.prepaidServiceCount || 0),
      postpaidServiceCount: Number(servicesViewModel?.postpaidServiceCount || 0),
      hours,
      contactRows: [
        phone ? { icon: null, label: 'Call', value: phone, href: `tel:${phone}` } : null,
        preferredSocialContact ? { icon: null, label: preferredSocialContact.label, value: preferredSocialContact.value, href: preferredSocialContact.href } : null,
        email ? { icon: null, label: 'Email', value: email, href: `mailto:${email}` } : null
      ].filter(Boolean),
      actions: {
        canCall: Boolean(phone),
        callHref: phone ? `tel:${phone}` : '',
        canMessage: Boolean(messengerLink || email),
        messageHref: messengerLink || (email ? `mailto:${email}` : ''),
        canOrder: bookingPermitted || checkoutPermitted,
        orderLabel: modeAdapter.primaryActionLabel || 'Order Now'
      },
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean),
      mapStores,
      mapSelectedKey: selectedLocation?.location_id != null ? `loc-${selectedLocation.location_id}` : null,
      addressLine,
      facebookLink,
      directionsUrl,
      serviceGroups,
      registrationYear
    };
  }, [
    selectedStore,
    isServicesMode,
    mapPublicationDisabled,
    storeLocations,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    servicesViewModel,
    servicesLayoutMode,
    heroSectionModel,
    modeAdapter.heroDescription,
    modeAdapter.heroEyebrow,
    modeAdapter.primaryActionLabel,
    bookingPermitted,
    checkoutPermitted
  ]);
  const fnbCommunityModel = useMemo(() => buildFnbCommunityModel({
    selectedStore,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    heroSectionModel,
    filteredFnbViewModel,
    fallbackDescription: modeAdapter.heroDescription
  }), [
    selectedStore,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    heroSectionModel,
    filteredFnbViewModel,
    modeAdapter.heroDescription
  ]);
  const simpleStorefrontModel = useMemo(() => {
    if (!selectedStore || !isSimpleMode) return null;
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const preferredSocialContact = getPreferredSocialContact({ messengerLink, facebookLink });
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = formatStorefrontHoursLabel(
      selectedStore?.storefront_hours,
      heroSectionModel?.hours || selectedStore?.storefront_hours_status?.display || ''
    );
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const reviewSummary = supportingSectionModel?.reviewSummary || parseOptionalObject(selectedStore?.storefront_review_summary) || null;
    const reviewHighlights = Array.isArray(supportingSectionModel?.reviewHighlights)
      ? supportingSectionModel.reviewHighlights.filter(Boolean)
      : [];
    const productGroups = [...new Set(
      (Array.isArray(catalog) ? catalog : [])
        .map((item) => String(item?.categoryMeta?.label || item?.category_name || item?.category || '').trim())
        .filter(Boolean)
    )].slice(0, 5);
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const mapStores = mapPublicationDisabled
      ? []
      : (storeLocations.length > 0
          ? storeLocations.map((location) => ({
            ...location,
            tenant_name: selectedStore?.tenant_name,
            workflow_mode: selectedStore?.workflow_mode,
            business_mode: selectedStore?.business_mode
          }))
          : [selectedStore]);
    const whyChooseUs = Array.isArray(overviewSectionModel?.whyChooseUs) && overviewSectionModel.whyChooseUs.length > 0
      ? overviewSectionModel.whyChooseUs.slice(0, 4)
      : buildSimpleFallbackReasons({
          categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories : [],
          catalog
        });
    const directionsUrl = mapPublicationDisabled
      ? ''
      : buildGoogleMapsDirectionsUrl({
          latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
          longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
          addressLine
        });
    return {
      coverImageUrl: withAssetOrigin(heroSectionModel?.coverImageUrl),
      profileImageUrl: withAssetOrigin(heroSectionModel?.profileImageUrl),
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      statusLabel: heroSectionModel?.statusLabel || (selectedStore?.storefront_open ? 'Open' : 'Closed'),
      ratingLabel: formatRatingSummary(reviewSummary),
      modeLabel: heroSectionModel?.primaryCategoryLabel || modeAdapter.heroEyebrow,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      addressLine,
      aboutText: heroSectionModel?.aboutText || '',
      whyChooseUs,
      hours,
      reviewSummary,
      reviewHighlights,
      productGroups,
      registrationYear,
      directionsUrl,
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean),
      contactRows: [
        phone ? { icon: null, label: 'Call', value: phone, href: `tel:${phone}` } : null,
        preferredSocialContact ? { icon: null, label: preferredSocialContact.label, value: preferredSocialContact.value, href: preferredSocialContact.href } : null,
        email ? { icon: null, label: 'Email', value: email, href: `mailto:${email}` } : null
      ].filter(Boolean),
      actions: {
        canCall: Boolean(phone),
        callHref: phone ? `tel:${phone}` : '',
        canMessage: Boolean(messengerLink || email),
        messageHref: messengerLink || (email ? `mailto:${email}` : ''),
        canOrder: checkoutPermitted || productCartPermitted,
        orderLabel: modeAdapter.primaryActionLabel || 'Start Ordering'
      },
      mapStores,
      mapSelectedKey: selectedLocation?.location_id != null ? `loc-${selectedLocation.location_id}` : null
    };
  }, [
    selectedStore,
    isSimpleMode,
    mapPublicationDisabled,
    heroSectionModel,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    catalog,
    storeLocations,
    modeAdapter.heroDescription,
    modeAdapter.heroEyebrow,
    modeAdapter.primaryActionLabel,
    checkoutPermitted,
    productCartPermitted
  ]);
  // Reviews/promo/footer data for every industry that isn't services/fnb/simple
  // (hospitality, healthcare, retail, food_manufacturing, ticketing_transport,
  // logistics_distribution, education_institutions, ...) — mirrors
  // simpleStorefrontModel's shape (the fields StorefrontClassicCatalog's shared
  // Reviews/Footer sections consume), scoped down to just those fields since the
  // rest of the hero (contact/map/gallery/why-choose-us) is handled independently
  // inside DefaultStorefrontHero via buildFnbHeroViewModel.
  const defaultStorefrontModel = useMemo(() => {
    if (!selectedStore || isServicesMode || isFnbMode || isSimpleMode) return null;
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const reviewSummary = supportingSectionModel?.reviewSummary || parseOptionalObject(selectedStore?.storefront_review_summary) || null;
    const reviewHighlights = Array.isArray(supportingSectionModel?.reviewHighlights)
      ? supportingSectionModel.reviewHighlights.filter(Boolean)
      : [];
    const productGroups = [...new Set(
      (Array.isArray(catalog) ? catalog : [])
        .map((item) => String(item?.categoryMeta?.label || item?.category_name || item?.category || '').trim())
        .filter(Boolean)
    )].slice(0, 5);
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    return {
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      aboutText: heroSectionModel?.aboutText || '',
      hours: formatStorefrontHoursLabel(
        selectedStore?.storefront_hours,
        heroSectionModel?.hours || selectedStore?.storefront_hours_status?.display || ''
      ),
      reviewSummary,
      reviewHighlights,
      productGroups,
      registrationYear,
      locationLabel: heroSectionModel?.locationSummary || heroSectionModel?.addressLine || '',
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean)
    };
  }, [
    selectedStore,
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    heroSectionModel,
    supportingSectionModel,
    catalog
  ]);
  const catalogState = useMemo(() => {
    if (loadingCatalog && catalog.length === 0) return 'empty_setup';
    if (loadingCatalog) return 'loading';
    if (catalogError) return 'error';
    if (!hasCatalogSearchQuery && filteredCatalog.length === 0) return 'empty_setup';
    if (catalog.length === 0 && hasCatalogSearchQuery) return 'empty_search_on_zero';
    if (catalog.length === 0) return 'empty_setup';
    if (hasCatalogSearchQuery && filteredCatalog.length === 0) return 'empty_no_match';
    return 'ready';
  }, [loadingCatalog, catalogError, catalog.length, hasCatalogSearchQuery, filteredCatalog.length]);

  return {
    pageModel,
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    isHospitalityMode,
    isRetailMode,
    modeAdapter,
    servicesViewModel,
    fnbViewModel,
    servicesLayoutMode,
    heroSectionModel,
    overviewSectionModel,
    supportingSectionModel,
    filteredCatalog,
    baseFilteredFnbViewModel,
    filteredFnbCatalog,
    filteredFnbViewModel,
    promoSectionModel,
    selectedLocation,
    accessCapabilities,
    catalogPermitted,
    productCartPermitted,
    checkoutPermitted,
    bookingPermitted,
    serviceHeroModel,
    fnbCommunityModel,
    simpleStorefrontModel,
    defaultStorefrontModel,
    catalogState
  };
}
