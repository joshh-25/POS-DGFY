import { getStorefrontModeAdapter } from './modePresentationRegistry.js';
import { getServicesStorefrontViewModel } from './servicesStorefrontViewModel.js';

const trimText = (value) => String(value || '').trim();

const parseOptionalArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseOptionalObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeLinkMap = (value) => (
  parseOptionalObject(value) || {}
);

const normalizeTextArray = (value) => parseOptionalArray(value)
  .map((entry) => String(entry || '').trim())
  .filter(Boolean);

const normalizeGalleryArray = (value) => parseOptionalArray(value)
  .map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    return {
      url: trimText(entry.url || entry.path),
      caption: trimText(entry.caption),
      alt: trimText(entry.alt)
    };
  })
  .filter((entry) => entry && entry.url);

const normalizeReviewSummary = (value) => {
  const raw = parseOptionalObject(value);
  if (!raw) return null;
  const score = Number(raw.score);
  const totalCount = Number(raw.total_count);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : null,
    totalCount: Number.isInteger(totalCount) && totalCount >= 0 ? totalCount : null
  };
};

const formatRatingLabel = (reviewSummary) => {
  if (!reviewSummary || reviewSummary.score == null) return '';
  const countLabel = reviewSummary.totalCount > 0 ? ` (${reviewSummary.totalCount})` : '';
  return `${Number(reviewSummary.score).toFixed(1)}${countLabel}`;
};

export const normalizeStorefrontPageModel = ({
  selectedStore = null,
  catalog = []
} = {}) => {
  const modeAdapter = getStorefrontModeAdapter(selectedStore);
  const servicesViewModel = getServicesStorefrontViewModel(catalog);
  const isServicesMode = modeAdapter.isServicesMode === true;
  const socialLinks = normalizeLinkMap(selectedStore?.storefront_social_links);
  const promo = normalizeLinkMap(selectedStore?.storefront_promo);
  const reviewSummary = normalizeReviewSummary(selectedStore?.storefront_review_summary);
  const reviewHighlights = parseOptionalArray(selectedStore?.storefront_review_highlights)
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
  const galleryImages = normalizeGalleryArray(selectedStore?.storefront_gallery_images);
  const categories = normalizeTextArray(selectedStore?.storefront_categories);
  const whyChooseUs = normalizeTextArray(selectedStore?.storefront_why_choose_us);
  const aboutText = trimText(selectedStore?.storefront_about);
  const tagline = trimText(selectedStore?.storefront_tagline);
  const coverImage = trimText(selectedStore?.storefront_cover_image_url || selectedStore?.storefront_cover_image_path);
  const profileImage = trimText(selectedStore?.storefront_profile_image_url || selectedStore?.storefront_profile_image_path);
  const phone = trimText(selectedStore?.storefront_phone);
  const email = trimText(selectedStore?.storefront_email);
  const messengerLink = trimText(socialLinks.messenger);
  const locationSummary = trimText(selectedStore?.location_name || selectedStore?.address_line);
  const addressLine = trimText(selectedStore?.address_line);
  const hours = trimText(selectedStore?.storefront_hours);
  
  const contactRows = [];
  if (phone) contactRows.push({ label: 'Call', value: phone, href: `tel:${phone}` });
  if (socialLinks.facebook) {
    contactRows.push({
      label: 'Facebook',
      value: trimText(selectedStore?.tenant_name) || 'Facebook',
      href: socialLinks.facebook
    });
  }
  if (hours) contactRows.push({ label: 'Hours', value: hours, href: '' });

  const derivedServiceCategoryLabels = servicesViewModel.serviceGroups
    .map((group) => trimText(group?.categoryMeta?.label || group?.categoryKey))
    .filter(Boolean);

  const primaryCategoryLabel = isServicesMode
    ? (
        categories[0]
        || (derivedServiceCategoryLabels.length > 0 ? derivedServiceCategoryLabels.slice(0, 2).join(' & ') : '')
        || modeAdapter.heroEyebrow
      )
    : categories[0] || modeAdapter.heroEyebrow;

  return {
    mode: modeAdapter.mode,
    modeAdapter,
    isServicesMode,
    servicesViewModel,
    servicesLayoutMode: servicesViewModel?.servicesLayoutMode || 'directory',
    hero: {
      name: trimText(selectedStore?.tenant_name) || 'Storefront',
      storeName: trimText(selectedStore?.tenant_name) || 'Storefront',
      tagline,
      coverImageUrl: coverImage,
      profileImageUrl: profileImage,
      statusLabel: selectedStore?.storefront_open ? 'Open' : 'Closed',
      ratingLabel: formatRatingLabel(reviewSummary),
      modeLabel: primaryCategoryLabel,
      locationLabel: locationSummary,
      primaryCategoryLabel,
      locationSummary,
      addressLine,
      aboutText,
      phone,
      email,
      hours,
      messengerLink,
      socialLinks,
      contactRows,
      whyChooseUs,
      galleryPreview: galleryImages.slice(0, 4).map(img => img.url),
      actions: {
        canCall: Boolean(phone),
        canMessage: Boolean(messengerLink || email),
        canOrder: true,
        callHref: phone ? `tel:${phone}` : '',
        messageHref: messengerLink ? messengerLink : (email ? `mailto:${email}` : ''),
        orderLabel: isServicesMode ? 'Order Now' : modeAdapter.primaryActionLabel
      }
    },
    overview: {
      aboutText,
      whyChooseUs,
      categories,
      contact: {
        phone,
        email,
        messengerLink
      },
      location: {
        label: trimText(selectedStore?.location_name) || 'Main location',
        addressLine: trimText(selectedStore?.address_line)
      }
    },
    supporting: {
      reviewSummary,
      reviewHighlights,
      galleryImages,
      promo
    },
    sections: {
      hero: {
        isVisible: Boolean(selectedStore),
        hasCoverImage: Boolean(coverImage),
        hasProfileImage: Boolean(profileImage),
        hasTagline: Boolean(tagline)
      },
      overview: {
        hasAbout: Boolean(aboutText),
        hasContact: Boolean(
          phone
          || email
          || messengerLink
        ),
        hasLocation: Boolean(
          trimText(selectedStore?.address_line)
          || trimText(selectedStore?.location_name)
          || Array.isArray(selectedStore?.active_location_snapshot)
        ),
        hasWhyChooseUs: whyChooseUs.length > 0
      },
      categories: {
        isVisible: categories.length > 0 || (isServicesMode && servicesViewModel.serviceGroups.length > 0)
      },
      supporting: {
        hasReviews: reviewHighlights.length > 0 || Boolean(reviewSummary),
        hasPromo: Boolean(trimText(promo.title) || trimText(promo.subtitle) || promo.active === true),
        hasGallery: galleryImages.length > 0
      }
    }
  };
};
