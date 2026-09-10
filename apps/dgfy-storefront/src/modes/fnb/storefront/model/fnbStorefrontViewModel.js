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
    accent: '#1a4e8d',
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

const resolveNumericFolderId = (folderId) => {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  const numeric = Number(folderId);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

// RF-1 (PR #1583 review): grouping/dedup identity for one section occurrence, primary or
// secondary. Prefers the folder's own stable numeric `folder_id` -- always present on a
// `secondary_categories` row, and present on the primary occurrence whenever `items.folder_id` is
// non-null (ADR 0080 Decision 1's "the primary category and the single tiebreak") -- over the
// normalized display label. Two genuinely distinct folders whose *names* happen to normalize
// identically (e.g. "A B" and "A_B" both -> `a_b`) must never collapse into one group, and a real
// secondary membership must never be silently dropped just because its name matches the primary's.
// Public grouping callers only admit live numeric folder identities. The name fallback remains
// defensive for non-public callers and never creates a Storefront category control.
// NOT the same field as `sectionKey`/`sectionLabel`: those stay name-derived on purpose (icon/
// preset matching via `resolveSectionVisualMeta`, and any existing consumer keyed on them) and are
// not guaranteed unique across two distinct folders that happen to share a display name -- this
// identity is what grouping, dedup, and the composite render key actually key on.
const resolveSectionIdentity = (folderId, sectionKey) => {
  const numericFolderId = resolveNumericFolderId(folderId);
  return numericFolderId !== null ? `folder:${numericFolderId}` : `name:${sectionKey}`;
};

const hasValidPrimarySection = (item = {}) => (
  resolveNumericFolderId(item?.folder_id) !== null && normalizeText(item?.folder_name).length > 0
);

// ADR 0080 Decision 5 opt-in (Phase 289, #1318): resolves the distinct secondary sections an
// item also belongs to, beyond its primary `sectionKey`/`sectionLabel` already computed above.
// `item.secondary_categories` is `[{ folder_id, folder_name }]`, ordered by sort_order (Decision
// 6) -- reads it, writes nothing. Deduped against the primary and against itself by
// `resolveSectionIdentity` (folder_id-based, not the normalized label), so an accidental
// primary/secondary overlap (Decision 2) or a duplicate membership row never renders the same item
// twice under one section -- while two genuinely distinct folders that merely share a display name
// each still get their own occurrence.
const resolveSecondarySectionOccurrences = (item = {}, primarySectionIdentity) => {
  const secondaryCategories = Array.isArray(item?.secondary_categories) ? item.secondary_categories : [];
  if (secondaryCategories.length === 0) return [];

  const seenIdentities = new Set([primarySectionIdentity]);
  const occurrences = [];
  secondaryCategories.forEach((secondaryCategory) => {
    if (resolveNumericFolderId(secondaryCategory?.folder_id) === null) return;
    const secondaryLabel = titleCase(normalizeText(secondaryCategory?.folder_name));
    if (!secondaryLabel) return;
    const secondarySectionKey = normalizeKey(secondaryLabel).replace(/\s+/g, '_');
    if (!secondarySectionKey) return;
    const secondaryIdentity = resolveSectionIdentity(secondaryCategory?.folder_id, secondarySectionKey);
    if (seenIdentities.has(secondaryIdentity)) return;
    seenIdentities.add(secondaryIdentity);
    occurrences.push({ sectionKey: secondarySectionKey, sectionLabel: secondaryLabel, sectionIdentity: secondaryIdentity, sortOrder: Number(secondaryCategory?.sort_order || 0) });
  });

  return occurrences;
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
        categorySortOrder: Number(item?.folder_sort_order || 0),
        productKind,
        availabilityMeta,
        unitLabel: formatUnitLabel(item?.unit_of_measure),
        flavorTags: buildFlavorTags(item),
        descriptionPreview: resolveItemDescription(item, productKind)
      };
    });

  // ADR 0080 Decision 5: the F&B menu's section grouping renders an item once per section it
  // belongs to (primary + each distinct secondary category), keyed by a composite
  // `{sectionIdentity}:{itemId}` (RF-1: folder_id-based, not the normalized label -- see
  // `resolveSectionIdentity`) so list-renderer keys stay unique AND two distinct folders never
  // collapse into one group. `menuItems` above stays exactly one entry per item -- it backs
  // `totalItems`/the count stats below, the unsectioned "All" tab, and `buildFnbRelatedItems`'
  // cross-sell rail, none of which opt into the union (Decision 5's own carve-out for cross-sell/
  // single-label surfaces).
  const sectionEntries = [];
  menuItems.forEach((item) => {
    const primaryIdentity = hasValidPrimarySection(item)
      ? resolveSectionIdentity(item.folder_id, item.sectionKey)
      : null;
    if (primaryIdentity) {
      sectionEntries.push({ ...item, sectionIdentity: primaryIdentity, menuItemKey: `${primaryIdentity}:${item.item_id}` });
    }
    resolveSecondarySectionOccurrences(item, primaryIdentity).forEach((occurrence) => {
      sectionEntries.push({
        ...item,
        sectionKey: occurrence.sectionKey,
        sectionLabel: occurrence.sectionLabel,
        sectionIdentity: occurrence.sectionIdentity,
        sectionVisualMeta: resolveSectionVisualMeta(occurrence.sectionLabel),
        categorySortOrder: occurrence.sortOrder,
        menuItemKey: `${occurrence.sectionIdentity}:${item.item_id}`
      });
    });
  });

  // Grouped by the stable `sectionIdentity`, not `sectionKey` -- two occurrences with the same
  // identity are always the same folder and belong in the same section, even on the rare occasion
  // two distinct folders happen to share a `sectionKey` display text (see `resolveSectionIdentity`
  // above); `sectionKey`/`sectionLabel` on the group are carried through unchanged (whichever
  // occurrence created the group first) for icon/preset matching and existing consumers.
  const sectionMap = new Map();
  sectionEntries.forEach((item, index) => {
    const existing = sectionMap.get(item.sectionIdentity) || {
      sectionKey: item.sectionKey,
      sectionLabel: item.sectionLabel,
      sectionIdentity: item.sectionIdentity,
      sortOrder: item.categorySortOrder,
      items: [],
      firstSeenIndex: index
    };
    existing.items.push(item);
    sectionMap.set(item.sectionIdentity, existing);
  });

  const menuSections = [...sectionMap.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.firstSeenIndex - right.firstSeenIndex)
    .map((section) => ({
      ...section,
      visualMeta: section.items[0]?.sectionVisualMeta || resolveSectionVisualMeta(section.sectionLabel),
      items: [...section.items].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || '')))
    }));

  const beverageCount = menuItems.filter((item) => item.productKind === 'Beverage').length;
  const dessertCount = menuItems.filter((item) => item.productKind === 'Dessert').length;
  const readyNowCount = menuItems.filter((item) => item.availabilityMeta?.tone === 'ready').length;
  const prices = menuItems
    .filter((item) => {
      if (item.is_available === false) return false;
      const status = normalizeKey(item.availability_status);
      if (status === 'out_of_stock' || status === 'unavailable') return false;

      if (item.is_addon === true || item.is_modifier === true) return false;

      const pType = String(item.product_type || '').toLowerCase();
      const cat = String(item.category || '').toLowerCase();
      const mCat = String(item.menu_category || '').toLowerCase();
      const iGrp = String(item.item_group || '').toLowerCase();
      const name = String(item.name || '').toLowerCase();

      const addonKeywords = ['add-on', 'addon', 'modifier', 'extra', 'topping'];
      const hasAddonKeyword = (str) => addonKeywords.some(keyword => str.includes(keyword));

      if (hasAddonKeyword(pType) || hasAddonKeyword(cat) || hasAddonKeyword(mCat) || hasAddonKeyword(iGrp) || hasAddonKeyword(name)) {
        return false;
      }

      return true;
    })
    .map((item) => Number(item?.default_sale_price))
    .filter((value) => Number.isFinite(value) && value > 0);

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
