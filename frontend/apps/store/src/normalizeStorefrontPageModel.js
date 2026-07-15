import { getStorefrontModeAdapter } from './modePresentationRegistry.js';
import { getFoodBeverageStorefrontViewModel } from './fnbStorefrontViewModel.js';
import { getServicesStorefrontViewModel } from './servicesStorefrontViewModel.js';
import { formatStorefrontBusinessHoursDisplay, normalizeStorefrontBusinessHours } from '../../../src/features/settings/storefrontBusinessHours.js';

const trimText = (value) => String(value || '').trim();

const STOREFRONT_TEMP_CONTACT_OVERRIDES = Object.freeze({
  abeezee: Object.freeze({
    phone: '09102323238'
  })
});

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

const formatPromoTime = (value) => {
  const match = trimText(value).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return '';
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
};

const getZonedPromoClock = (now, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) * 60) + Number(parts.minute)
  };
};

const toMinutes = (value) => {
  const match = trimText(value).match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
};

const formatPromoDateTime = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return formatPromoTime(time);
  const [year, month, day] = date.split('-').map(Number);
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(new Date(year, month - 1, day));
  return time ? `${formattedDate}, ${formatPromoTime(time)}` : formattedDate;
};

export const getStorefrontPromoAvailability = ({
  validFrom = '',
  validUntil = '',
  validTimeStart = '',
  validTimeEnd = '',
  now = new Date(),
  timeZone = 'Asia/Manila'
} = {}) => {
  const { date: currentDate, minutes: currentMinutes } = getZonedPromoClock(now, timeZone);
  if (validUntil && currentDate > validUntil) return { status: 'expired', message: '' };
  if (validFrom && currentDate < validFrom) {
    return {
      status: 'scheduled',
      message: `Available from ${formatPromoDateTime(validFrom, validTimeStart)}`
    };
  }

  const startMinutes = toMinutes(validTimeStart);
  const endMinutes = toMinutes(validTimeEnd);
  if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) {
    return { status: 'available', message: '' };
  }
  const isWithinWindow = startMinutes < endMinutes
    ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
    : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  if (isWithinWindow) return { status: 'available', message: '' };

  const startsToday = startMinutes < endMinutes ? currentMinutes < startMinutes : true;
  return {
    status: 'scheduled',
    message: startsToday
      ? `Available today at ${formatPromoTime(validTimeStart)}`
      : `Available tomorrow at ${formatPromoTime(validTimeStart)}`
  };
};

const normalizeStorefrontPromos = ({ promos, legacyPromo, now = new Date(), timeZone = 'Asia/Manila' } = {}) => {
  const seenCodes = new Set();
  const normalize = (entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const promoCode = trimText(entry.promo_code || entry.promoCode).toUpperCase();
    const title = trimText(entry.title);
    const badge = trimText(entry.badge);
    const discountPercent = Number(entry.discount_percent ?? entry.discountPercent);
    const validFrom = trimText(entry.valid_from || entry.validFrom);
    const validUntil = trimText(entry.valid_until || entry.validUntil);
    if (entry.active !== true || (!promoCode && !title && !badge)) return null;
    const validTimeStart = trimText(entry.valid_time_start || entry.validTimeStart);
    const validTimeEnd = trimText(entry.valid_time_end || entry.validTimeEnd);
    const availability = getStorefrontPromoAvailability({
      validFrom,
      validUntil,
      validTimeStart,
      validTimeEnd,
      now,
      timeZone
    });
    if (availability.status === 'expired') return null;
    if (promoCode && seenCodes.has(promoCode)) return null;
    if (promoCode) seenCodes.add(promoCode);
    return {
      ...entry,
      promo_code: promoCode,
      promoCode,
      title,
      badge,
      subtitle: trimText(entry.subtitle),
      validity_text: trimText(entry.validity_text || entry.validityText),
      discount_percent: Number.isFinite(discountPercent) ? discountPercent : null,
      discountPercent: Number.isFinite(discountPercent) ? discountPercent : null,
      valid_time_start: validTimeStart,
      validTimeStart,
      valid_time_end: validTimeEnd,
      validTimeEnd,
      valid_from: validFrom,
      validFrom,
      valid_until: validUntil,
      validUntil,
      availability_status: availability.status,
      availabilityStatus: availability.status,
      availability_message: availability.message,
      availabilityMessage: availability.message,
      active: true
    };
  };

  const configuredPromos = parseOptionalArray(promos);
  const normalized = configuredPromos.map(normalize).filter(Boolean);
  if (configuredPromos.length === 0 && normalized.length === 0) {
    const legacy = normalize(legacyPromo);
    if (legacy) normalized.push(legacy);
  }
  return normalized;
};

const normalizeTextArray = (value) => parseOptionalArray(value)
  .map((entry) => String(entry || '').trim())
  .filter(Boolean);

const isStorefrontGalleryAssetPath = (value) => (
  /^storefront-assets\/[^/]+\/[^/]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(trimText(value))
);

const isExpiredSignedAssetUrl = (value) => {
  const text = trimText(value);
  if (!text) return false;
  try {
    const parsed = new URL(text);
    const expirationTimestamp = Number(parsed.searchParams.get('expirationTimestamp'));
    return parsed.hostname === 'file.notion.so'
      && Number.isFinite(expirationTimestamp)
      && expirationTimestamp <= Date.now();
  } catch {
    return false;
  }
};

const normalizeGalleryUrl = ({ path = '', url = '' } = {}) => {
  const trimmedPath = trimText(path);
  const trimmedUrl = trimText(url);
  const localPath = isStorefrontGalleryAssetPath(trimmedPath)
    ? trimmedPath
    : (isStorefrontGalleryAssetPath(trimmedUrl) ? trimmedUrl : '');
  if (localPath) return `/uploads/${localPath}`;
  const fallbackUrl = trimmedUrl || trimmedPath;
  return isExpiredSignedAssetUrl(fallbackUrl) ? '' : fallbackUrl;
};

const normalizeGalleryArray = (value) => parseOptionalArray(value)
  .map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    return {
      url: normalizeGalleryUrl(entry),
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

const getStorefrontTempContactOverride = (selectedStore = null) => {
  const slug = trimText(selectedStore?.slug).toLowerCase();
  const tenantName = trimText(selectedStore?.tenant_name).toLowerCase();
  if (slug && STOREFRONT_TEMP_CONTACT_OVERRIDES[slug]) {
    return STOREFRONT_TEMP_CONTACT_OVERRIDES[slug];
  }
  if (slug.startsWith('abeezee') || tenantName === 'abeezee' || tenantName.startsWith('abeezee')) {
    return STOREFRONT_TEMP_CONTACT_OVERRIDES.abeezee;
  }
  return null;
};

const buildStorefrontMessageHref = ({ messengerLink = '', phone = '', email = '' } = {}) => {
  const messenger = trimText(messengerLink);
  const contactPhone = trimText(phone);
  const contactEmail = trimText(email);
  if (messenger) return messenger;
  if (contactPhone) return `sms:${contactPhone}`;
  if (contactEmail) return `mailto:${contactEmail}`;
  return '';
};

const formatRatingLabel = (reviewSummary) => {
  if (!reviewSummary || reviewSummary.score == null) return '';
  const countLabel = reviewSummary.totalCount > 0 ? ` (${reviewSummary.totalCount})` : '';
  return `${Number(reviewSummary.score).toFixed(1)}${countLabel}`;
};

const normalizeStorefrontDeliveryPartners = (value) => {
  const allowedPartners = new Set(['grab', 'foodpanda', 'lalamove', 'custom']);
  const seen = new Set();
  return parseOptionalArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        const partner = trimText(entry).toLowerCase();
        if (!allowedPartners.has(partner)) return null;
        return {
          partner,
          label: partner === 'foodpanda'
            ? 'foodpanda'
            : partner.charAt(0).toUpperCase() + partner.slice(1),
          url: ''
        };
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const partner = trimText(entry.partner).toLowerCase();
      if (!allowedPartners.has(partner)) return null;
      return {
        partner,
        label: trimText(entry.label)
          || (partner === 'foodpanda' ? 'foodpanda' : partner.charAt(0).toUpperCase() + partner.slice(1)),
        url: trimText(entry.url)
      };
    })
    .filter((entry) => {
      const key = `${entry.partner}::${entry.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter(Boolean);
};

export const normalizeStorefrontPageModel = ({
  selectedStore = null,
  catalog = [],
  now = new Date()
} = {}) => {
  const modeAdapter = getStorefrontModeAdapter(selectedStore);
  const servicesViewModel = getServicesStorefrontViewModel(catalog);
  const fnbViewModel = getFoodBeverageStorefrontViewModel(catalog);
  const isServicesMode = modeAdapter.isServicesMode === true;
  const isFnbMode = modeAdapter.isFnbMode === true;
  const isSimpleMode = modeAdapter.isSimpleMode === true;
  const isHospitalityMode = modeAdapter.isHospitalityMode === true;
  const socialLinks = normalizeLinkMap(selectedStore?.storefront_social_links);
  const legacyPromo = normalizeLinkMap(selectedStore?.storefront_promo);
  const promoTimeZone = String(normalizeStorefrontBusinessHours(selectedStore?.storefront_hours)?.timezone || 'Asia/Manila').trim() || 'Asia/Manila';
  const promos = normalizeStorefrontPromos({
    promos: selectedStore?.storefront_promos,
    legacyPromo,
    now,
    timeZone: promoTimeZone
  });
  const promo = promos.length > 0
    ? { active: true, items: promos }
    : legacyPromo;
  const reviewSummary = normalizeReviewSummary(selectedStore?.storefront_review_summary);
  const reviewHighlights = parseOptionalArray(selectedStore?.storefront_review_highlights)
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
  const galleryImages = normalizeGalleryArray(selectedStore?.storefront_gallery_images);
  const categories = normalizeTextArray(selectedStore?.storefront_categories);
  const whyChooseUs = normalizeTextArray(selectedStore?.storefront_why_choose_us);
  const deliveryPartners = normalizeStorefrontDeliveryPartners(selectedStore?.storefront_delivery_partners);
  const aboutText = trimText(selectedStore?.storefront_about);
  const tagline = trimText(selectedStore?.storefront_tagline);
  const coverImage = trimText(selectedStore?.storefront_cover_image_url || selectedStore?.storefront_cover_image_path);
  const profileImage = trimText(selectedStore?.storefront_profile_image_url || selectedStore?.storefront_profile_image_path);
  const tempContactOverride = getStorefrontTempContactOverride(selectedStore);
  const phone = trimText(selectedStore?.storefront_phone || tempContactOverride?.phone);
  const email = trimText(selectedStore?.storefront_email);
  const messengerLink = trimText(socialLinks.messenger);
  const facebookLink = trimText(socialLinks.facebook);
  const instagramLink = trimText(socialLinks.instagram);
  const preferredSupportLink = messengerLink || facebookLink;
  const preferredSupportLabel = messengerLink ? 'Messenger' : (facebookLink ? 'Facebook' : '');
  const messageHref = buildStorefrontMessageHref({ messengerLink, phone, email });
  const locationSummary = trimText(selectedStore?.location_name || selectedStore?.address_line);
  const addressLine = trimText(selectedStore?.address_line);
  const rawHoursData = selectedStore?.storefront_hours ? normalizeStorefrontBusinessHours(selectedStore.storefront_hours) : null;
  const hours = trimText(
    formatStorefrontBusinessHoursDisplay(selectedStore?.storefront_hours)
    || selectedStore?.storefront_hours
    || selectedStore?.storefront_hours_status?.display
  );
  
  const contactRows = [];
  if (phone) contactRows.push({ label: 'Call', value: phone, href: `tel:${phone}` });
  if (facebookLink) contactRows.push({ label: 'Facebook', value: 'Facebook', href: facebookLink });
  if (messengerLink) contactRows.push({ label: 'Messenger', value: 'Messenger', href: messengerLink });
  if (instagramLink) contactRows.push({ label: 'Instagram', value: 'Instagram', href: instagramLink });
  if (hours) contactRows.push({ label: 'Hours', value: hours, href: '', rawHoursData });

  const derivedServiceCategoryLabels = servicesViewModel.serviceGroups
    .map((group) => trimText(group?.categoryMeta?.label || group?.categoryKey))
    .filter(Boolean);
  const derivedMenuSectionLabels = fnbViewModel.menuSections
    .map((section) => trimText(section?.sectionLabel || section?.sectionKey))
    .filter(Boolean);

  const primaryCategoryLabel = isServicesMode
    ? (
        categories[0]
        || (derivedServiceCategoryLabels.length > 0 ? derivedServiceCategoryLabels.slice(0, 2).join(' & ') : '')
        || modeAdapter.heroEyebrow
      )
    : isFnbMode
      ? (
          categories[0]
          || (derivedMenuSectionLabels.length > 0 ? derivedMenuSectionLabels.slice(0, 2).join(' & ') : '')
          || modeAdapter.heroEyebrow
        )
    : categories[0] || modeAdapter.heroEyebrow;

  return {
    mode: modeAdapter.mode,
    modeAdapter,
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    isHospitalityMode,
    servicesViewModel,
    fnbViewModel,
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
      rawHoursData,
      messengerLink: preferredSupportLink,
      facebookLink,
      instagramLink,
      socialLinks,
      deliveryPartners,
      contactRows,
      whyChooseUs,
      galleryPreview: galleryImages.slice(0, 4).map(img => img.url),
      actions: {
        canCall: Boolean(phone),
        canMessage: Boolean(messageHref),
        canOrder: true,
        callHref: phone ? `tel:${phone}` : '',
        messageHref,
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
      deliveryPartners,
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
        isVisible: categories.length > 0
          || (isServicesMode && servicesViewModel.serviceGroups.length > 0)
          || (isFnbMode && fnbViewModel.menuSections.length > 0)
      },
      supporting: {
        hasReviews: reviewHighlights.length > 0 || Boolean(reviewSummary),
        hasPromo: Boolean(trimText(promo.title) || trimText(promo.subtitle) || promo.active === true),
        hasGallery: galleryImages.length > 0
      }
    }
  };
};
