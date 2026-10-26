export const DISCOVERY_SORT_LABEL_BY_VALUE = {
  nearest: 'Nearest',
  catalog: 'Most Popular',
  rating: 'Highest Rated',
  open: 'Open Now'
};

export const DISCOVERY_DISTANCE_FILTER_OPTIONS = Object.freeze([
  ['all', 'Any Distance'],
  ['1', 'Within 1 km'],
  ['3', 'Within 3 km'],
  ['5', 'Within 5 km'],
  ['10', 'Within 10 km']
]);

export const DISCOVERY_DISTANCE_LABEL_BY_VALUE = Object.fromEntries(DISCOVERY_DISTANCE_FILTER_OPTIONS);

export const DISCOVERY_PARTNER_CATEGORY_OPTIONS = Object.freeze([
  ['hotel', 'Hotel'],
  ['real estate', 'Real Estate'],
  ['taxi', 'Taxi'],
  ['job', 'Job']
]);

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
  ['frozen', 'Frozen'],
  ...DISCOVERY_PARTNER_CATEGORY_OPTIONS
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
  frozen: ['frozen', 'ice cream'],
  hotel: ['hotel', 'hospitality'],
  'real estate': ['real estate', 'property'],
  taxi: ['taxi', 'transport'],
  job: ['job', 'employment']
});

const formatDiscoveryModeLabel = (modeKey, labels = {}) => (
  labels[modeKey]
  || String(modeKey || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
);

export const buildDiscoveryBusinessModeOptions = ({
  workflowModeLabels = {},
  workflowModeSelectValues = []
} = {}) => {
  const partnerOptions = DISCOVERY_PARTNER_CATEGORY_OPTIONS;
  const partnerValues = new Set(partnerOptions.map(([value]) => value));
  const nativeModeOptions = workflowModeSelectValues
    .filter((modeKey) => !partnerValues.has(String(modeKey || '').trim().toLowerCase()))
    .map((modeKey) => [
      modeKey,
      formatDiscoveryModeLabel(modeKey, workflowModeLabels)
    ]);

  return [
    ['all', 'Category: All'],
    ...nativeModeOptions,
    ...partnerOptions
  ];
};
