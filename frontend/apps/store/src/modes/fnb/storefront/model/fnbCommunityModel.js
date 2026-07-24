import { normalizeStorefrontReviewSummary } from '../../../../features/discovery/utils/storefrontDiscoveryNormalization.js';
import { formatStorefrontAddress } from '../../../../shared/model/storefrontCatalogModel.js';
import { formatStorefrontHoursLabel } from '../../../../shared/model/storefrontHoursModel.js';
import { parseOptionalObject } from '../../../../shared/model/storefrontJsonModel.js';
import { deriveStorefrontRegistrationYear } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';

export function buildFnbCommunityModel({
  selectedStore,
  selectedLocation,
  overviewSectionModel,
  supportingSectionModel,
  heroSectionModel,
  filteredFnbViewModel,
  fallbackDescription
}) {
  if (!selectedStore) return null;

  const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
  const facebookLink = String(socialLinks.facebook || '').trim();
  const instagramLink = String(socialLinks.instagram || '').trim();
  const tiktokLink = String(socialLinks.tiktok || '').trim();
  const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
  const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
  const email = String(heroSectionModel?.email || '').trim();
  const phone = String(heroSectionModel?.phone || '').trim();
  const hours = formatStorefrontHoursLabel(
    selectedStore?.storefront_hours,
    heroSectionModel?.hours || selectedStore?.storefront_hours_status?.display || ''
  );
  const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
  const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
  const registrationYear = deriveStorefrontRegistrationYear(
    selectedStore?.business_registered_at
    || selectedStore?.registered_at
    || selectedStore?.tenant_created_at
    || selectedStore?.created_at
  );
  const rawReviewSummary = supportingSectionModel?.reviewSummary || parseOptionalObject(selectedStore?.storefront_review_summary) || null;
  const reviewSummary = normalizeStorefrontReviewSummary(rawReviewSummary);
  const reviewHighlights = Array.isArray(supportingSectionModel?.reviewHighlights)
    ? supportingSectionModel.reviewHighlights.filter(Boolean)
    : [];
  const menuCategories = Array.isArray(filteredFnbViewModel?.menuSections)
    ? filteredFnbViewModel.menuSections.map((section) => ({
      key: section.sectionKey,
      label: section.sectionLabel,
      count: Number(section?.items?.length || 0)
    }))
    : [];

  return {
    name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
    tagline: heroSectionModel?.tagline || '',
    aboutText: heroSectionModel?.aboutText || fallbackDescription,
    sectionAboutText: heroSectionModel?.aboutText || '',
    locationLabel: addressLine || locationName || 'Location details coming soon',
    hours,
    reviewSummary,
    reviewHighlights,
    menuCategories,
    registrationYear,
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
}
