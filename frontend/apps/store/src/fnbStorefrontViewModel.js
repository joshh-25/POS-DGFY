const DEFAULT_SECTION = 'Chef Specials';

const SECTION_PRESETS = Object.freeze([
  { label: 'Coffee & Tea', keywords: ['coffee', 'latte', 'espresso', 'cappuccino', 'tea', 'matcha', 'americano'] },
  { label: 'Cold Beverages', keywords: ['shake', 'juice', 'smoothie', 'soda', 'cola', 'lemonade', 'frappe', 'iced', 'milk tea'] },
  { label: 'Desserts', keywords: ['dessert', 'cake', 'halo', 'pastry', 'brownie', 'ice cream', 'cookie', 'sweet'] },
  { label: 'Rice Meals', keywords: ['meal', 'rice', 'silog', 'bowl', 'platter'] },
  { label: 'Mains', keywords: ['pasta', 'burger', 'steak', 'sisig', 'chicken', 'beef', 'pork', 'seafood', 'pizza', 'sandwich'] },
  { label: 'Snacks', keywords: ['snack', 'fries', 'wings', 'nachos', 'dumpling', 'siomai', 'finger food'] }
]);

const PRODUCT_KIND_PRESETS = Object.freeze([
  { label: 'Beverage', keywords: ['coffee', 'latte', 'espresso', 'tea', 'matcha', 'juice', 'smoothie', 'shake', 'soda', 'frappe', 'milk tea', 'beverage', 'drink'] },
  { label: 'Dessert', keywords: ['dessert', 'cake', 'halo', 'pastry', 'brownie', 'ice cream', 'cookie', 'sweet'] },
  { label: 'Snack', keywords: ['snack', 'fries', 'wings', 'nachos', 'dumpling', 'siomai', 'finger food'] },
  { label: 'Meal', keywords: ['meal', 'rice', 'silog', 'bowl', 'pasta', 'burger', 'steak', 'sisig', 'chicken', 'beef', 'pork', 'seafood', 'pizza', 'sandwich'] }
]);

const SECTION_VISUAL_PRESETS = Object.freeze([
  {
    iconToken: 'coffee',
    accent: '#7c3aed',
    accentSoft: '#f3e8ff',
    keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'rocket fuel', 'tea', 'matcha']
  },
  {
    iconToken: 'drink',
    accent: '#2563eb',
    accentSoft: '#dbeafe',
    keywords: ['beverage', 'drinks', 'drink', 'mock', 'refresh', 'soda', 'lemonade', 'shake', 'frappe', 'smoothie', 'juice', 'blend']
  },
  {
    iconToken: 'dessert',
    accent: '#db2777',
    accentSoft: '#fce7f3',
    keywords: ['dessert', 'cheesecake', 'croffles', 'sweet', 'pastry', 'cake', 'cookie', 'waffle']
  },
  {
    iconToken: 'burger',
    accent: '#ea580c',
    accentSoft: '#ffedd5',
    keywords: ['burger', 'sandwich', 'bites']
  },
  {
    iconToken: 'chicken',
    accent: '#d97706',
    accentSoft: '#fef3c7',
    keywords: ['chicken', 'wings', 'cluck', 'fried']
  },
  {
    iconToken: 'pizza',
    accent: '#ef4444',
    accentSoft: '#fee2e2',
    keywords: ['pizza']
  },
  {
    iconToken: 'seafood',
    accent: '#0891b2',
    accentSoft: '#cffafe',
    keywords: ['seafood', 'fish', 'calamari', 'shrimp', 'sardines']
  },
  {
    iconToken: 'meal',
    accent: '#16a34a',
    accentSoft: '#dcfce7',
    keywords: ['meal', 'rice', 'silog', 'bowl', 'platter', 'mains', 'meteorice', 'breakfast']
  },
  {
    iconToken: 'snack',
    accent: '#f59e0b',
    accentSoft: '#fef3c7',
    keywords: ['snack', 'starter', 'fries', 'nachos', 'quesadilla', 'spring roll']
  }
]);

const STOCK_STATUS_META = Object.freeze({
  in_stock: { label: 'Ready now', tone: 'ready' },
  bookable: { label: 'Available to order', tone: 'ready' },
  low_stock: { label: 'Limited servings', tone: 'limited' },
  out_of_stock: { label: 'Sold out', tone: 'sold_out' },
  unavailable: { label: 'Unavailable', tone: 'sold_out' }
});

const normalizeText = (value) => String(value || '').trim();

const titleCase = (value) => normalizeText(value)
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const normalizeKey = (value) => normalizeText(value).toLowerCase();

const resolveSectionVisualMeta = (sectionLabel) => {
  const normalizedLabel = normalizeKey(sectionLabel);
  const matchedPreset = SECTION_VISUAL_PRESETS.find((preset) => (
    preset.keywords.some((keyword) => normalizedLabel.includes(keyword))
  ));

  if (matchedPreset) {
    return {
      iconToken: matchedPreset.iconToken,
      accent: matchedPreset.accent,
      accentSoft: matchedPreset.accentSoft,
      glyph: titleCase(sectionLabel).charAt(0) || 'M'
    };
  }

  return {
    iconToken: 'menu',
    accent: '#475569',
    accentSoft: '#f1f5f9',
    glyph: titleCase(sectionLabel).charAt(0) || 'M'
  };
};

const buildSearchText = (item = {}) => [
  item?.name,
  item?.description,
  item?.category,
  item?.product_type,
  item?.menu_category,
  item?.storefront_category,
  item?.category_label,
  item?.item_group,
  item?.item_group_name,
  item?.folder_name
]
  .map(normalizeText)
  .filter(Boolean)
  .join(' ')
  .toLowerCase();

const matchPresetLabel = (searchText, presets) => {
  for (const preset of presets) {
    if (preset.keywords.some((keyword) => searchText.includes(keyword))) {
      return preset.label;
    }
  }
  return '';
};

const resolveSectionLabel = (item = {}) => {
  const directLabel = [
    item?.folder_name,
    item?.item_group_name,
    item?.item_group,
    item?.menu_section,
    item?.menu_category,
    item?.storefront_category,
    item?.category_label,
    item?.product_type
  ]
    .map(normalizeText)
    .find(Boolean);

  if (directLabel) return titleCase(directLabel);

  const presetLabel = matchPresetLabel(buildSearchText(item), SECTION_PRESETS);
  if (presetLabel) return presetLabel;

  return DEFAULT_SECTION;
};

const resolveProductKind = (item = {}) => {
  const presetLabel = matchPresetLabel(buildSearchText(item), PRODUCT_KIND_PRESETS);
  if (presetLabel) return presetLabel;

  const category = normalizeKey(item?.category);
  if (category === 'service') return 'Service';

  return 'Menu Item';
};

const resolveAvailabilityMeta = (item = {}) => {
  if (item?.is_available === true) return STOCK_STATUS_META.in_stock;
  if (item?.is_available === false) return STOCK_STATUS_META.out_of_stock;

  const statusKey = normalizeKey(item?.availability_status);
  return STOCK_STATUS_META[statusKey] || STOCK_STATUS_META.in_stock;
};

const formatUnitLabel = (unit) => {
  const normalized = normalizeKey(unit);
  if (!normalized) return 'Per serving';
  if (normalized === 'serving') return 'Per serving';
  if (normalized === 'cup') return 'Per cup';
  if (normalized === 'glass') return 'Per glass';
  if (normalized === 'bottle') return 'Per bottle';
  if (normalized === 'slice') return 'Per slice';
  if (normalized === 'plate') return 'Per plate';
  return `Per ${normalized}`;
};

const buildFlavorTags = (item = {}) => {
  const searchText = buildSearchText(item);
  const tags = [];

  if (searchText.includes('spicy')) tags.push('Spicy');
  if (searchText.includes('iced') || searchText.includes('cold')) tags.push('Cold');
  if (searchText.includes('hot')) tags.push('Hot');
  if (searchText.includes('signature') || searchText.includes('house')) tags.push('Signature');
  if (searchText.includes('combo') || searchText.includes('bundle')) tags.push('Bundle');

  return tags.slice(0, 2);
};

const buildFallbackDescription = (item = {}, productKind) => {
  const availabilityMeta = resolveAvailabilityMeta(item);
  return `${productKind} available in this storefront. ${availabilityMeta.label}.`;
};

const resolveItemDescription = (item = {}, productKind) => {
  const description = [
    item?.description,
    item?.item_description,
    item?.storefront_description,
    item?.short_description,
    item?.notes
  ]
    .map(normalizeText)
    .find(Boolean);

  return description || buildFallbackDescription(item, productKind);
};

export const getFoodBeverageStorefrontViewModel = (catalog = []) => {
  const menuItems = (Array.isArray(catalog) ? catalog : [])
    .filter((item) => normalizeKey(item?.category) !== 'service')
    .map((item, index) => {
      const sectionLabel = resolveSectionLabel(item);
      const productKind = resolveProductKind(item);
      const availabilityMeta = resolveAvailabilityMeta(item);
      const sectionVisualMeta = resolveSectionVisualMeta(sectionLabel);
      return {
        ...item,
        sectionKey: normalizeKey(sectionLabel).replace(/\s+/g, '_') || `section_${index}`,
        sectionLabel,
        sectionVisualMeta,
        productKind,
        availabilityMeta,
        unitLabel: formatUnitLabel(item?.unit_of_measure),
        flavorTags: buildFlavorTags(item),
        descriptionPreview: resolveItemDescription(item, productKind)
      };
    });

  const sectionMap = new Map();
  menuItems.forEach((item, index) => {
    const existing = sectionMap.get(item.sectionKey) || {
      sectionKey: item.sectionKey,
      sectionLabel: item.sectionLabel,
      items: [],
      firstSeenIndex: index
    };
    existing.items.push(item);
    sectionMap.set(item.sectionKey, existing);
  });

  const menuSections = [...sectionMap.values()]
    .sort((left, right) => left.firstSeenIndex - right.firstSeenIndex)
    .map((section) => ({
      ...section,
      visualMeta: section.items[0]?.sectionVisualMeta || resolveSectionVisualMeta(section.sectionLabel),
      items: [...section.items].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')))
    }));

  const beverageCount = menuItems.filter((item) => item.productKind === 'Beverage').length;
  const dessertCount = menuItems.filter((item) => item.productKind === 'Dessert').length;
  const readyNowCount = menuItems.filter((item) => item.availabilityMeta?.tone === 'ready').length;
  const prices = menuItems
    .map((item) => Number(item?.default_sale_price))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return {
    menuItems,
    menuSections,
    totalItems: menuItems.length,
    menuSectionCount: menuSections.length,
    beverageCount,
    dessertCount,
    readyNowCount,
    startingPrice: prices.length > 0 ? Math.min(...prices) : null,
    highestPrice: prices.length > 0 ? Math.max(...prices) : null
  };
};
