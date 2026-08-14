const SKU_CATEGORY_CONFIG = Object.freeze({
  raw_material: Object.freeze({
    prefix: 'RM',
    digits: 4,
    requiresInitials: false
  }),
  product: Object.freeze({
    prefix: 'PRD',
    digits: 3,
    requiresInitials: true
  }),
  packaging: Object.freeze({
    prefix: 'PKG',
    digits: 3,
    requiresInitials: true
  }),
  supplies: Object.freeze({
    prefix: 'SUP',
    digits: 3,
    requiresInitials: true
  })
});

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
]);

const normalizeText = (value) => String(value || '')
  .replace(/&/g, ' ')
  .replace(/[^A-Za-z0-9\s-]/g, ' ')
  .replace(/[-_/]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPositiveInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const normalizeSkuCategory = (category) => {
  const normalized = String(category || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SKU_CATEGORY_CONFIG, normalized)) {
    return normalized;
  }
  return 'raw_material';
};

export const buildSkuInitials = (name) => {
  const normalized = normalizeText(name);
  if (!normalized) return '';

  const tokens = normalized
    .split(' ')
    .filter(Boolean)
    .map((token) => token.trim());

  if (tokens.length === 0) return '';

  const withLetters = tokens.filter((token) => /[A-Za-z]/.test(token));
  const significantTokens = withLetters.filter((token) => !STOP_WORDS.has(token.toLowerCase()));
  const sourceTokens = significantTokens.length > 0
    ? significantTokens
    : withLetters;

  if (sourceTokens.length === 0) return '';

  const initials = sourceTokens
    .map((token) => token.replace(/^[^A-Za-z0-9]+/, ''))
    .filter(Boolean)
    .map((token) => token[0])
    .join('')
    .toUpperCase();

  return initials.slice(0, 4);
};

const getSkuSequenceRegex = ({ category, initials }) => {
  const normalizedCategory = normalizeSkuCategory(category);
  const config = SKU_CATEGORY_CONFIG[normalizedCategory];

  if (!config.requiresInitials) {
    return new RegExp(`^${escapeRegex(config.prefix)}-(\\d+)$`, 'i');
  }

  const safeInitials = escapeRegex(initials);
  return new RegExp(`^${escapeRegex(config.prefix)}-${safeInitials}-(\\d+)$`, 'i');
};

const getItemId = (item) => (
  item?.item_id
  || item?.id
  || null
);

const getSkuCode = (item) => String(item?.sku_code || '').trim().toUpperCase();

const getNextSequence = ({
  existingItems,
  category,
  initials,
  currentItemId
}) => {
  const regex = getSkuSequenceRegex({ category, initials });
  let maxSequence = 0;

  (Array.isArray(existingItems) ? existingItems : []).forEach((item) => {
    const itemId = getItemId(item);
    if (currentItemId && itemId && Number(itemId) === Number(currentItemId)) {
      return;
    }

    const sku = getSkuCode(item);
    if (!sku) return;

    const match = sku.match(regex);
    if (!match) return;

    const numericPart = toPositiveInteger(match[1]);
    if (!numericPart) return;
    if (numericPart > maxSequence) {
      maxSequence = numericPart;
    }
  });

  return maxSequence + 1;
};

export const suggestNextSku = ({
  name,
  category,
  existingItems = [],
  currentItemId = null
}) => {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return '';

  const normalizedCategory = normalizeSkuCategory(category);
  const config = SKU_CATEGORY_CONFIG[normalizedCategory];

  const initials = config.requiresInitials
    ? (buildSkuInitials(normalizedName) || 'GEN')
    : '';

  const nextSequence = getNextSequence({
    existingItems,
    category: normalizedCategory,
    initials,
    currentItemId
  });

  const sequence = String(nextSequence).padStart(config.digits, '0');
  if (!config.requiresInitials) {
    return `${config.prefix}-${sequence}`;
  }

  return `${config.prefix}-${initials}-${sequence}`;
};
