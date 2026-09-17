import { normalizeStorefrontBusinessHours } from '@/src/features/settings/storefrontBusinessHours.js';
import { normalizeCoverPhotoTransform } from '@sieitzz/shared-constants/coverPhotoTransform';

export const STOREFRONT_CONTENT_FIELDS = Object.freeze([
  'storefrontTagline',
  'storefrontPhone',
  'storefrontEmail',
  'storefrontAbout',
  'storefrontHours',
  'storefrontCategories',
  'storefrontWhyChooseUs',
  'storefrontSocialMessenger',
  'storefrontSocialFacebook',
  'storefrontSocialInstagram',
  'storefrontGalleryImages',
  'storefrontDeliveryPartners',
  'storefrontReviewHighlights',
  'storefrontReviewSummaryScore',
  'storefrontReviewSummaryTotalCount',
  'storefrontReviewSummaryStar1',
  'storefrontReviewSummaryStar2',
  'storefrontReviewSummaryStar3',
  'storefrontReviewSummaryStar4',
  'storefrontReviewSummaryStar5'
]);

export const STOREFRONT_CONTENT_GROUP_FIELDS = Object.freeze({
  basic: Object.freeze([
    'storefrontTagline',
    'storefrontPhone',
    'storefrontEmail',
    'storefrontAbout',
    'storefrontHours'
  ]),
  categories: Object.freeze(['storefrontCategories']),
  why: Object.freeze(['storefrontWhyChooseUs']),
  social: Object.freeze([
    'storefrontSocialMessenger',
    'storefrontSocialFacebook',
    'storefrontSocialInstagram'
  ]),
  gallery: Object.freeze(['storefrontGalleryImages']),
  delivery: Object.freeze(['storefrontDeliveryPartners']),
  reviews: Object.freeze([
    'storefrontReviewHighlights',
    'storefrontReviewSummaryScore',
    'storefrontReviewSummaryTotalCount',
    'storefrontReviewSummaryStar1',
    'storefrontReviewSummaryStar2',
    'storefrontReviewSummaryStar3',
    'storefrontReviewSummaryStar4',
    'storefrontReviewSummaryStar5'
  ])
});

const cloneValue = (value) => {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
};

const normalizeText = (value) => String(value ?? '').trim();

const normalizeStringList = (value) => (Array.isArray(value)
  ? value.map(normalizeText).filter(Boolean)
  : []);

const normalizeGalleryImages = (value) => (Array.isArray(value)
  ? value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const url = normalizeText(entry.url);
      const path = normalizeText(entry.path);
      if (!url && !path) return null;
      return {
        url,
        path,
        caption: normalizeText(entry.caption),
        alt: normalizeText(entry.alt),
        sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
      };
    })
    .filter(Boolean)
  : []);

const normalizeDeliveryPartners = (value) => (Array.isArray(value)
  ? value
    .map((entry) => {
      if (typeof entry === 'string') {
        const partner = normalizeText(entry).toLowerCase();
        return partner ? { partner, label: '', url: '' } : null;
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const partner = normalizeText(entry.partner).toLowerCase();
      if (!partner) return null;
      const label = normalizeText(entry.label);
      const url = normalizeText(entry.url);
      if (!label && !url) return null;
      return { partner, label, url };
    })
    .filter(Boolean)
  : []);

const normalizeReviewHighlights = (value) => (Array.isArray(value)
  ? value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const reviewer_name = normalizeText(entry.reviewer_name);
      const rating = normalizeText(entry.rating);
      const comment = normalizeText(entry.comment);
      if (!reviewer_name && !rating && !comment) return null;
      return { reviewer_name, rating, comment };
    })
    .filter(Boolean)
  : []);

export const selectStorefrontContentFields = (form = {}) => STOREFRONT_CONTENT_FIELDS.reduce((snapshot, field) => ({
  ...snapshot,
  [field]: cloneValue(form?.[field] ?? null)
}), {});

export const normalizeStorefrontContentForm = (form = {}) => ({
  storefrontTagline: normalizeText(form.storefrontTagline),
  storefrontPhone: normalizeText(form.storefrontPhone),
  storefrontEmail: normalizeText(form.storefrontEmail),
  storefrontAbout: normalizeText(form.storefrontAbout),
  storefrontHours: cloneValue(normalizeStorefrontBusinessHours(form.storefrontHours)),
  storefrontCategories: normalizeStringList(form.storefrontCategories),
  storefrontWhyChooseUs: normalizeStringList(form.storefrontWhyChooseUs),
  storefrontSocialMessenger: normalizeText(form.storefrontSocialMessenger),
  storefrontSocialFacebook: normalizeText(form.storefrontSocialFacebook),
  storefrontSocialInstagram: normalizeText(form.storefrontSocialInstagram),
  storefrontGalleryImages: normalizeGalleryImages(form.storefrontGalleryImages),
  storefrontDeliveryPartners: normalizeDeliveryPartners(form.storefrontDeliveryPartners),
  storefrontReviewHighlights: normalizeReviewHighlights(form.storefrontReviewHighlights),
  storefrontReviewSummaryScore: normalizeText(form.storefrontReviewSummaryScore),
  storefrontReviewSummaryTotalCount: normalizeText(form.storefrontReviewSummaryTotalCount),
  storefrontReviewSummaryStar1: normalizeText(form.storefrontReviewSummaryStar1),
  storefrontReviewSummaryStar2: normalizeText(form.storefrontReviewSummaryStar2),
  storefrontReviewSummaryStar3: normalizeText(form.storefrontReviewSummaryStar3),
  storefrontReviewSummaryStar4: normalizeText(form.storefrontReviewSummaryStar4),
  storefrontReviewSummaryStar5: normalizeText(form.storefrontReviewSummaryStar5)
});

export const normalizeStorefrontContentAssets = (assets = {}) => ({
  cover: normalizeText(assets.cover),
  profile: normalizeText(assets.profile),
  coverTransform: normalizeCoverPhotoTransform(assets.coverTransform)
});

export const createStorefrontContentBaseline = ({ form = {}, assets = {} } = {}) => ({
  form: normalizeStorefrontContentForm(form),
  assets: normalizeStorefrontContentAssets(assets)
});

export const cloneStorefrontContentBaseline = (baseline) => (baseline
  ? {
    form: cloneValue(baseline.form),
    assets: cloneValue(baseline.assets)
  }
  : null);

export const getStorefrontContentSnapshot = ({ form = {}, assets = {} } = {}) => {
  const normalized = createStorefrontContentBaseline({ form, assets });
  return JSON.stringify(normalized);
};

export const mergeStorefrontContentBaseline = (baseline, { form = {}, assets = {} } = {}, group = 'content') => {
  const current = cloneStorefrontContentBaseline(baseline) || createStorefrontContentBaseline({ form, assets });
  const normalized = createStorefrontContentBaseline({ form, assets });

  if (group === 'image') {
    return {
      ...current,
      assets: normalized.assets
    };
  }

  if (group === 'content' || !group) return normalized;

  const fields = STOREFRONT_CONTENT_GROUP_FIELDS[group];
  if (!fields) return current;

  return {
    ...current,
    form: fields.reduce((nextForm, field) => ({
      ...nextForm,
      [field]: cloneValue(normalized.form[field])
    }), current.form)
  };
};
