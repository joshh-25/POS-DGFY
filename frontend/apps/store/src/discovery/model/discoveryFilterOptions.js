export const DISCOVERY_SORT_LABEL_BY_VALUE = {
  nearest: 'Nearest',
  catalog: 'Most Popular',
  rating: 'Highest Rated',
  open: 'Open Now'
};

export const POPULAR_DISCOVERY_CATEGORIES = Object.freeze([
  { label: 'Food', query: 'Food' },
  { label: 'Grocery', query: 'Grocery' },
  { label: 'Laundry', query: 'Laundry' },
  { label: 'Salon', query: 'Salon' },
  { label: 'Hardware', query: 'Hardware' },
  { label: 'More', query: 'Services' }
]);

export const DISCOVERY_CATEGORY_FILTER_OPTIONS = Object.freeze([
  ['all', 'All'],
  ['food', 'Food'],
  ['grocery', 'Grocery'],
  ['laundry', 'Laundry'],
  ['salon', 'Salon'],
  ['hardware', 'Hardware'],
  ['services', 'Services'],
  ['pharmacy', 'Pharmacy'],
  ['electronics', 'Electronics'],
  ['bakery', 'Bakery'],
  ['clothing', 'Clothing'],
  ['drinks', 'Drinks'],
  ['food stall', 'Food Stall'],
  ['frozen', 'Frozen']
]);

export const DISCOVERY_CATEGORY_MATCHERS = Object.freeze({
  food: ['food', 'cafe', 'coffee', 'bakery', 'drinks', 'food stall', 'frozen', 'f&b'],
  grocery: ['grocery', 'supermarket', 'mart'],
  laundry: ['laundry', 'wash'],
  salon: ['salon', 'beauty', 'spa'],
  hardware: ['hardware', 'repair', 'auto'],
  services: ['services', 'service'],
  pharmacy: ['pharmacy', 'health', 'medical'],
  electronics: ['electronics', 'gadget', 'device', 'tech'],
  bakery: ['bakery', 'bread', 'pastry'],
  clothing: ['clothing', 'fashion', 'apparel'],
  drinks: ['drinks', 'beverage', 'juice', 'milk tea'],
  'food stall': ['food stall', 'stall'],
  frozen: ['frozen', 'ice cream']
});

const formatDiscoveryModeLabel = (modeKey, labels = {}) => (
  labels[modeKey]
  || String(modeKey || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
);

export const buildDiscoveryBusinessModeOptions = ({
  workflowModeLabels = {},
  workflowModeSelectValues = []
} = {}) => ([
  ['all', 'Category: All'],
  ...workflowModeSelectValues.map((modeKey) => [
    modeKey,
    formatDiscoveryModeLabel(modeKey, workflowModeLabels)
  ])
]);
