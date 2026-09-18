import { SERVICES_PALETTE } from '../../servicesPalette.js';

const CATEGORY_PRESETS = Object.freeze({
  laundry: Object.freeze({
    label: 'Laundry',
    iconToken: 'laundry',
    accent: SERVICES_PALETTE.primary,
    accentBg: SERVICES_PALETTE.primarySoft,
    howItWorks: [
      'Choose the laundry care type that matches the load.',
      'Share handling notes, garment count, or special fabric requests.',
      'Keep the booking reference ready for drop-off or pickup coordination.'
    ],
    preparationNotes: [
      'Separate delicate or specialty items in your notes.',
      'Mention stain treatment, bleach restrictions, or fragrance preferences.',
      'Bring bulky items directly to the branch for easier handling.'
    ]
  }),
  aircon_cleaning: Object.freeze({
    label: 'Aircon Cleaning',
    iconToken: 'aircon',
    accent: SERVICES_PALETTE.primaryDark,
    accentBg: SERVICES_PALETTE.primarySoft,
    howItWorks: [
      'Choose the correct unit type and service size.',
      'Share the address, number of units, and preferred schedule.',
      'Keep the area accessible so the team can start on arrival.'
    ],
    preparationNotes: [
      'Confirm parking, gate, or building access notes in advance.',
      'Tell the team how many units need cleaning and where they are installed.',
      'Make sure the space around the unit is easy to reach before the visit.'
    ]
  })
});

const CATEGORY_COLORS = Object.freeze([
  { accent: SERVICES_PALETTE.primary, accentBg: SERVICES_PALETTE.primarySoft },
  { accent: SERVICES_PALETTE.primaryDark, accentBg: SERVICES_PALETTE.primarySoft },
  { accent: SERVICES_PALETTE.primary, accentBg: SERVICES_PALETTE.primaryLight },
  { accent: SERVICES_PALETTE.primaryDark, accentBg: SERVICES_PALETTE.primarySoft },
  { accent: SERVICES_PALETTE.primary, accentBg: SERVICES_PALETTE.primaryLight },
  { accent: SERVICES_PALETTE.primaryDark, accentBg: SERVICES_PALETTE.primarySoft },
  { accent: SERVICES_PALETTE.primary, accentBg: SERVICES_PALETTE.primarySoft }
]);

const AREA_META = Object.freeze({
  customer_location: Object.freeze({
    eyebrow: 'On-site service',
    areaLabel: 'Home / on-site visit',
    description: 'Schedule a team visit at the customer location.'
  }),
  in_store: Object.freeze({
    eyebrow: 'In-store service',
    areaLabel: 'In-store drop-off',
    description: 'Bring the service request directly to the branch.'
  }),
  hybrid: Object.freeze({
    eyebrow: 'Flexible service',
    areaLabel: 'In-store or on-site',
    description: 'Choose the service setup that fits the request.'
  }),
  online: Object.freeze({
    eyebrow: 'Online service',
    areaLabel: 'Online service',
    description: 'Complete the service remotely without a branch visit.'
  })
});

const DEFAULT_CATEGORY_META = Object.freeze({
  label: 'Services',
  eyebrow: 'Bookable service',
  description: 'Bookable services available in this storefront.',
  areaLabel: 'Service',
  accent: SERVICES_PALETTE.primary,
  accentBg: SERVICES_PALETTE.primarySoft,
  icon: null,
  iconToken: 'service',
  howItWorks: [
    'Choose the service that matches the request.',
    'Share the required details during booking.',
    'Keep the booking reference for updates and follow-up.'
  ],
  preparationNotes: [
    'Review the service detail before finalizing the booking.',
    'Prepare any notes, access details, or special requests in advance.'
  ]
});

const normalizeCategoryKey = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'services';
};

const CATEGORY_ICON_KEYWORD_RULES = Object.freeze([
  { token: 'aircon', keywords: ['aircon', 'air-con', 'ac cleaning', 'ac service', 'cassette', 'split type', 'window type', 'floor mounted'] },
  { token: 'laundry', keywords: ['laundry', 'wash', 'wash & fold', 'wash and fold', 'bedsheet', 'blanket', 'comforter'] },
  { token: 'pressing', keywords: ['press', 'pressing', 'iron', 'ironing', 'steam'] },
  { token: 'addon', keywords: ['add-on', 'add ons', 'add ons', 'addon', 'extra'] },
  { token: 'repair', keywords: ['repair', 'fix', 'maintenance', 'tune up', 'troubleshoot'] },
  { token: 'cleaning', keywords: ['cleaning', 'general cleaning', 'deep clean', 'sanitize', 'sanitizing'] },
  { token: 'consultation', keywords: ['consultation', 'assessment', 'inspection', 'diagnostic'] },
  { token: 'grooming', keywords: ['grooming', 'pet'] },
  { token: 'wellness', keywords: ['wellness', 'massage', 'spa', 'nail', 'facial'] }
]);

const resolveServiceGroupingLabel = (item = {}) => {
  const folderName = String(item?.folder_name || '').trim();
  if (folderName) return folderName;

  const serviceCategory = String(item?.service_detail?.service_category || '').trim();
  if (serviceCategory) return serviceCategory;

  return 'services';
};

const normalizeAreaType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized in AREA_META) return normalized;
  return 'in_store';
};

const titleCase = (value) => String(value || '')
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getCategoryColor = (categoryKey) => {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const charTotal = [...normalizedKey].reduce((total, char) => total + char.charCodeAt(0), 0);
  return CATEGORY_COLORS[charTotal % CATEGORY_COLORS.length];
};

const resolveCategoryIconToken = (categoryKey, label = '') => {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const normalizedLabel = String(label || '').trim().toLowerCase();
  const combined = `${normalizedKey} ${normalizedLabel}`.trim();

  for (const rule of CATEGORY_ICON_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => combined.includes(keyword))) {
      return rule.token;
    }
  }

  return 'service';
};

const summarizeIntake = (schema) => {
  const fields = Array.isArray(schema?.fields)
    ? schema.fields
    : Array.isArray(schema?.questions)
      ? schema.questions
      : [];

  return fields
    .map((field, index) => ({
      id: String(field?.id || field?.key || field?.name || `field_${index}`),
      label: String(field?.label || field?.question || field?.name || '').trim(),
      required: field?.required === true
    }))
    .filter((field) => field.label);
};

const formatDurationLabel = (minutes) => {
  const totalMinutes = Number(minutes);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'Duration on request';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
};

const formatPaymentPolicyLabel = (policy) => {
  const normalized = String(policy || '').trim().toLowerCase();
  if (normalized === 'postpaid_only') return 'Pay later only';
  if (normalized === 'prepaid_required') return 'Pay now required';
  if (normalized === 'deposit_allowed') return 'Deposit available';
  return 'Pay now or later';
};

const formatServiceAreaLabel = (serviceAreaType) => AREA_META[normalizeAreaType(serviceAreaType)]?.areaLabel || DEFAULT_CATEGORY_META.areaLabel;

const hasWeeklyAvailability = (item = {}) => {
  const availability = item?.service_resources?.weekly_availability
    || item?.service_detail?.service_resources?.weekly_availability
    || item?.service_detail?.weekly_availability;
  return Boolean(availability && typeof availability === 'object' && Object.keys(availability).length > 0);
};

const buildDefaultDescription = (label, areaType, items = []) => {
  const areaDescription = AREA_META[normalizeAreaType(areaType)]?.description || DEFAULT_CATEGORY_META.description;
  const durationValues = items
    .map((item) => Number(item?.service_detail?.duration_minutes || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const shortestDuration = durationValues.length > 0 ? Math.min(...durationValues) : null;
  const durationNote = shortestDuration ? ` Typical bookings start at around ${formatDurationLabel(shortestDuration)}.` : '';
  return `${label} services available in this storefront. ${areaDescription}${durationNote}`;
};

const buildHowItWorks = (label, areaType, items = []) => {
  const normalizedAreaType = normalizeAreaType(areaType);
  const hasRequiredIntake = items.some((item) => item.requiredIntakeCount > 0);
  const areaStep = normalizedAreaType === 'customer_location'
    ? 'Choose a preferred visit date and share the service address.'
    : normalizedAreaType === 'online'
      ? 'Choose a preferred session date and share the service details needed online.'
      : normalizedAreaType === 'hybrid'
        ? 'Choose whether this booking will be handled in-store or at the customer location.'
        : 'Choose a preferred branch schedule and prepare the items or request for drop-off.';

  return [
    `Choose the ${label.toLowerCase()} service that matches the request.`,
    areaStep,
    hasRequiredIntake
      ? 'Complete the required booking details before submitting the appointment.'
      : 'Review the booking details, then keep the reference for follow-up.'
  ];
};

const buildPreparationNotes = (areaType, items = []) => {
  const normalizedAreaType = normalizeAreaType(areaType);
  const hasRequiredIntake = items.some((item) => item.requiredIntakeCount > 0);
  const baseNotes = normalizedAreaType === 'customer_location'
    ? [
        'Prepare access instructions, landmarks, or parking notes before confirming the booking.',
        'Keep the service area accessible so the team can start on arrival.'
      ]
    : normalizedAreaType === 'online'
      ? [
          'Prepare any files, photos, or details needed before the session starts.',
          'Keep your contact details updated so schedule changes are easy to confirm.'
        ]
      : [
          'Prepare any special handling notes, access details, or service reminders in advance.',
          'Review the service options carefully before finalizing the booking.'
        ];

  if (hasRequiredIntake) {
    baseNotes.push('Required booking fields must be completed before the appointment can be submitted.');
  }

  return baseNotes;
};

const stripServicePrefix = (name, categoryMeta) => {
  const rawName = String(name || '').trim();
  if (!rawName) return 'Service';

  const candidatePrefixes = [
    categoryMeta?.label,
    `${categoryMeta?.label} Service`,
    titleCase(categoryMeta?.label)
  ].filter(Boolean);

  for (const prefix of candidatePrefixes) {
    const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}\\s*-\\s*`, 'i');
    const stripped = rawName.replace(prefixPattern, '').trim();
    if (stripped && stripped !== rawName) return stripped;
  }

  return rawName;
};

const getPrimaryAreaType = (items = []) => {
  const counts = items.reduce((accumulator, item) => {
    const areaType = normalizeAreaType(item?.service_detail?.service_area_type);
    accumulator[areaType] = (accumulator[areaType] || 0) + 1;
    return accumulator;
  }, {});

  const areaTypes = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  return areaTypes[0]?.[0] || 'in_store';
};

export const getServiceCategoryMeta = (categoryKey, items = []) => {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const preset = CATEGORY_PRESETS[normalizedKey] || {};
  const derivedLabel = preset.label || titleCase(normalizedKey);
  const primaryAreaType = getPrimaryAreaType(items);
  const areaMeta = AREA_META[primaryAreaType] || AREA_META.in_store;
  const colorMeta = preset.accent && preset.accentBg
    ? { accent: preset.accent, accentBg: preset.accentBg }
    : getCategoryColor(normalizedKey);

  return {
    ...DEFAULT_CATEGORY_META,
    ...colorMeta,
    ...preset,
    label: derivedLabel,
    iconToken: preset.iconToken || resolveCategoryIconToken(normalizedKey, derivedLabel),
    eyebrow: preset.eyebrow || areaMeta.eyebrow || DEFAULT_CATEGORY_META.eyebrow,
    description: preset.description || buildDefaultDescription(derivedLabel, primaryAreaType, items),
    areaLabel: areaMeta.areaLabel || DEFAULT_CATEGORY_META.areaLabel,
    howItWorks: Array.isArray(preset.howItWorks) && preset.howItWorks.length > 0
      ? preset.howItWorks
      : buildHowItWorks(derivedLabel, primaryAreaType, items),
    preparationNotes: Array.isArray(preset.preparationNotes) && preset.preparationNotes.length > 0
      ? preset.preparationNotes
      : buildPreparationNotes(primaryAreaType, items)
  };
};

const resolveNumericFolderId = (folderId) => {
  if (folderId === null || folderId === undefined || folderId === '') return null;
  const numeric = Number(folderId);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

// RF-1 (PR #1583 review): grouping/dedup identity for one category occurrence, primary or
// secondary. Prefers the folder's own stable numeric `folder_id` -- always present on a
// `secondary_categories` row, and present on the primary occurrence whenever `items.folder_id` is
// non-null (ADR 0080 Decision 1's "the primary category and the single tiebreak") -- over the
// normalized display label. Two genuinely distinct folders whose *names* happen to normalize
// identically must never collapse into one group, and a real secondary membership must never be
// silently dropped just because its name matches the primary's. Public grouping callers only
// admit live numeric folder identities; heuristic service labels may describe an All-card but
// never create a Storefront category control.
// NOT the same field as `categoryKey`: that stays name-derived on purpose (`getServiceCategoryMeta`
// matches `CATEGORY_PRESETS` and derives icon/label off it, and existing tests assert its literal
// value) and is not guaranteed unique across two distinct folders sharing a display name -- this
// identity is what grouping, dedup, and the composite render key actually key on.
const resolveCategoryIdentity = (folderId, categoryKey) => {
  const numericFolderId = resolveNumericFolderId(folderId);
  return numericFolderId !== null ? `folder:${numericFolderId}` : `name:${categoryKey}`;
};

const hasValidPrimaryCategory = (item = {}) => (
  resolveNumericFolderId(item?.folder_id) !== null && String(item?.folder_name || '').trim().length > 0
);

// ADR 0080 Decision 5 opt-in (Phase 289, #1318): the distinct secondary categories a service also
// belongs to, beyond its primary `categoryKey` already resolved via `resolveServiceGroupingLabel`.
// `item.secondary_categories` is `[{ folder_id, folder_name }]`, ordered by sort_order (Decision
// 6) -- reads it, writes nothing. Deduped against the primary and against itself by
// `resolveCategoryIdentity` (folder_id-based, not the normalized label), so an accidental
// primary/secondary overlap (Decision 2) or a duplicate membership row never renders the same
// service twice under one category -- while two genuinely distinct folders that merely share a
// display name each still get their own occurrence.
const resolveSecondaryCategoryOccurrences = (item = {}, primaryCategoryIdentity) => {
  const secondaryCategories = Array.isArray(item?.secondary_categories) ? item.secondary_categories : [];
  if (secondaryCategories.length === 0) return [];

  const seenIdentities = new Set([primaryCategoryIdentity]);
  const occurrences = [];
  secondaryCategories.forEach((secondaryCategory) => {
    if (resolveNumericFolderId(secondaryCategory?.folder_id) === null) return;
    const rawLabel = String(secondaryCategory?.folder_name || '').trim();
    if (!rawLabel) return;
    const secondaryCategoryKey = normalizeCategoryKey(rawLabel);
    const secondaryIdentity = resolveCategoryIdentity(secondaryCategory?.folder_id, secondaryCategoryKey);
    if (seenIdentities.has(secondaryIdentity)) return;
    seenIdentities.add(secondaryIdentity);
    occurrences.push({ categoryKey: secondaryCategoryKey, categoryIdentity: secondaryIdentity, sortOrder: Number(secondaryCategory?.sort_order || 0) });
  });

  return occurrences;
};

export const getServicesStorefrontViewModel = (catalog = []) => {
  const services = (Array.isArray(catalog) ? catalog : [])
    .filter((item) => String(item?.category || '').trim().toLowerCase() === 'service')
    .map((item) => {
      const categoryKey = normalizeCategoryKey(resolveServiceGroupingLabel(item));
      const intakeFields = summarizeIntake(item?.service_detail?.intake_form_schema);
      const requiredIntakeCount = intakeFields.filter((field) => field.required).length;
      const hasAvailability = hasWeeklyAvailability(item);
      const paymentPolicy = String(item?.service_detail?.payment_policy || 'customer_choice').trim().toLowerCase();
      return {
        ...item,
        categoryKey,
        categorySortOrder: Number(item?.folder_sort_order || 0),
        intakeFields,
        requiredIntakeCount,
        hasAvailability,
        paymentPolicy,
        durationLabel: formatDurationLabel(item?.service_detail?.duration_minutes),
        paymentPolicyLabel: formatPaymentPolicyLabel(paymentPolicy),
        serviceAreaLabel: formatServiceAreaLabel(item?.service_detail?.service_area_type)
      };
    });

  // ADR 0080 Decision 5: the services storefront's category grouping renders a service once per
  // category it belongs to (primary + each distinct secondary category), keyed by a composite
  // `{categoryIdentity}:{itemId}` (RF-1: folder_id-based, not the normalized label -- see
  // `resolveCategoryIdentity`) so list-renderer keys stay unique AND two distinct folders never
  // collapse into one group. `services`/`allServices` below stay derived from the un-fanned
  // `services` array above -- one entry per service -- so the flat "all services" card grid and
  // every stat count (`totalServices`, `inStoreCount`, etc.) stay primary-only, matching Decision
  // 5's carve-out for single-label surfaces; only `serviceGroups[].items` opts into the union.
  const categoryEntries = [];
  services.forEach((item) => {
    const primaryIdentity = hasValidPrimaryCategory(item)
      ? resolveCategoryIdentity(item.folder_id, item.categoryKey)
      : null;
    if (primaryIdentity) {
      categoryEntries.push({ ...item, categoryIdentity: primaryIdentity, serviceItemKey: `${primaryIdentity}:${item.item_id}` });
    }
    resolveSecondaryCategoryOccurrences(item, primaryIdentity).forEach((occurrence) => {
      categoryEntries.push({
        ...item,
        categoryKey: occurrence.categoryKey,
        categoryIdentity: occurrence.categoryIdentity,
        categorySortOrder: occurrence.sortOrder,
        serviceItemKey: `${occurrence.categoryIdentity}:${item.item_id}`
      });
    });
  });

  // Grouped by the stable `categoryIdentity`, not `categoryKey` -- two occurrences with the same
  // identity are always the same folder and belong in the same group, even on the rare occasion two
  // distinct folders happen to share a `categoryKey` display text (see `resolveCategoryIdentity`
  // above); `categoryKey` on the group is carried through unchanged (whichever occurrence created
  // the group first) for `getServiceCategoryMeta`'s preset/icon matching and existing consumers.
  const grouped = new Map();
  categoryEntries.forEach((item) => {
    const existing = grouped.get(item.categoryIdentity) || {
      categoryKey: item.categoryKey,
      categoryIdentity: item.categoryIdentity,
      sortOrder: item.categorySortOrder,
      items: [],
      firstSeenIndex: grouped.size
    };
    existing.items.push(item);
    grouped.set(item.categoryIdentity, existing);
  });

  const serviceGroups = [...grouped.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.firstSeenIndex - right.firstSeenIndex)
    .map((group) => {
      const categoryMeta = getServiceCategoryMeta(group.categoryKey, group.items);
      const sortedItems = group.items
        .map((item) => ({
          ...item,
          categoryMeta,
          variantName: stripServicePrefix(item?.name, categoryMeta)
        }))
        .sort((left, right) => String(left.variantName || left.name || '').localeCompare(String(right.variantName || right.name || '')));

      return {
        categoryKey: group.categoryKey,
        categoryIdentity: group.categoryIdentity,
        categoryMeta,
        items: sortedItems
      };
    });

  // The flat, primary-only list: each service's occurrence in its own PRIMARY category group
  // (carrying that group's `categoryMeta`/`variantName`, same as pre-fan-out behavior), never its
  // secondary-category occurrences -- see the comment above `categoryEntries` for why. Matched by
  // `categoryIdentity` (RF-1), not `categoryKey` text -- a secondary occurrence whose `categoryKey`
  // happens to match the primary's display text (two distinct folders, colliding names) must never
  // be picked up here as if it were the primary.
  const primaryCategoryIdentityByItemId = new Map(
    services.map((item) => [item.item_id, resolveCategoryIdentity(item.folder_id, item.categoryKey)])
  );
  const groupedPrimaryServices = new Map(
    serviceGroups
      .flatMap((group) => group.items)
      .filter((item) => item.categoryIdentity === primaryCategoryIdentityByItemId.get(item.item_id))
      .map((item) => [item.item_id, item])
  );
  const normalizedServices = services.map((item) => {
    const groupedPrimary = groupedPrimaryServices.get(item.item_id);
    if (groupedPrimary) return groupedPrimary;
    const categoryMeta = getServiceCategoryMeta(item.categoryKey, [item]);
    return {
      ...item,
      categoryMeta,
      variantName: stripServicePrefix(item?.name, categoryMeta)
    };
  });
  const inStoreCount = normalizedServices.filter((item) => normalizeAreaType(item?.service_detail?.service_area_type) === 'in_store').length;
  const onSiteCount = normalizedServices.filter((item) => normalizeAreaType(item?.service_detail?.service_area_type) === 'customer_location').length;
  const servicesWithRequiredIntakeCount = normalizedServices.filter((item) => item.requiredIntakeCount > 0).length;
  const servicesWithAvailabilityCount = normalizedServices.filter((item) => item.hasAvailability === true).length;
  const servicesWithStructuredScheduleCount = normalizedServices.filter((item) => {
    const duration = Number(item?.service_detail?.duration_minutes || 0);
    return item.hasAvailability === true || (Number.isFinite(duration) && duration > 0);
  }).length;
  const prepaidServiceCount = normalizedServices.filter((item) => item.paymentPolicy === 'prepaid_required').length;
  const postpaidServiceCount = normalizedServices.filter((item) => item.paymentPolicy === 'postpaid_only').length;

  let servicesLayoutMode = 'directory';
  if (
    normalizedServices.length <= 3
    && serviceGroups.length <= 1
    && servicesWithRequiredIntakeCount === 0
    && servicesWithAvailabilityCount === 0
    && onSiteCount === 0
  ) {
    servicesLayoutMode = 'lead_gen';
  } else if (
    servicesWithRequiredIntakeCount >= Math.max(1, Math.ceil(normalizedServices.length / 2))
    || servicesWithAvailabilityCount > 0
    || onSiteCount >= Math.max(1, Math.ceil(normalizedServices.length / 2))
    || prepaidServiceCount > 0
  ) {
    servicesLayoutMode = 'booking_heavy';
  } else if (serviceGroups.length > 1 || normalizedServices.length >= 6) {
    servicesLayoutMode = 'directory';
  }

  return {
    services: normalizedServices,
    allServices: normalizedServices,
    serviceGroups,
    totalServices: normalizedServices.length,
    serviceFamilyCount: serviceGroups.length,
    inStoreCount,
    onSiteCount,
    servicesWithRequiredIntakeCount,
    servicesWithAvailabilityCount,
    servicesWithStructuredScheduleCount,
    prepaidServiceCount,
    postpaidServiceCount,
    servicesLayoutMode
  };
};
