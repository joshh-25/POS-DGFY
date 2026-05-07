const SERVICE_CATEGORY_META = Object.freeze({
  laundry: Object.freeze({
    label: 'Laundry',
    eyebrow: 'Drop-off service',
    icon: null,
    description: 'Everyday garment care, oversized loads, and specialty cleaning prepared for branch pickup.',
    areaLabel: 'In-store service',
    accent: '#0f766e',
    accentBg: '#f0fdfa',
    howItWorks: [
      'Choose the laundry care type that matches the load.',
      'Share handling notes, garment count, or special fabric requests.',
      'Drop off at the branch and keep the booking reference for pickup.'
    ],
    preparationNotes: [
      'Separate delicate or specialty items in your notes.',
      'Mention stain treatment, bleach restrictions, or fragrance preferences.',
      'Bring bulky items directly to the branch for easier handling.'
    ]
  }),
  aircon_cleaning: Object.freeze({
    label: 'Aircon Cleaning',
    eyebrow: 'On-site service',
    icon: null,
    description: 'Home or office cleaning visits for different air-conditioning unit types.',
    areaLabel: 'Customer location service',
    accent: '#0369a1',
    accentBg: '#f0f9ff',
    howItWorks: [
      'Choose the correct unit type and service size.',
      'Share the address, number of units, and preferred schedule.',
      'Keep the area accessible so the technician can begin on arrival.'
    ],
    preparationNotes: [
      'Confirm parking, gate, or building access notes in advance.',
      'Tell the team how many units need cleaning and where they are installed.',
      'Make sure the space around the unit is easy to reach before the visit.'
    ]
  })
});

const SERVICE_CATEGORY_ORDER = ['laundry', 'aircon_cleaning'];

const normalizeCategoryKey = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized in SERVICE_CATEGORY_META) return normalized;
  return normalized || 'services';
};

const titleCase = (value) => String(value || '')
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const stripServicePrefix = (name, categoryKey) => {
  const rawName = String(name || '').trim();
  if (!rawName) return 'Service';
  if (categoryKey === 'laundry') {
    return rawName.replace(/^Laundry Service\s*-\s*/i, '').trim() || rawName;
  }
  if (categoryKey === 'aircon_cleaning') {
    return rawName.replace(/^Aircon Cleaning\s*-\s*/i, '').trim() || rawName;
  }
  return rawName;
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

const formatServiceAreaLabel = (serviceAreaType) => {
  const normalized = String(serviceAreaType || '').trim().toLowerCase();
  if (normalized === 'customer_location') return 'Home / on-site visit';
  if (normalized === 'online') return 'Online service';
  if (normalized === 'hybrid') return 'In-store or on-site';
  return 'In-store drop-off';
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

const byCategoryOrder = (left, right) => {
  const leftIndex = SERVICE_CATEGORY_ORDER.indexOf(left);
  const rightIndex = SERVICE_CATEGORY_ORDER.indexOf(right);
  const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
  if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
  return String(left || '').localeCompare(String(right || ''));
};

export const getServiceCategoryMeta = (categoryKey) => {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  return SERVICE_CATEGORY_META[normalizedKey] || {
    label: titleCase(normalizedKey),
    eyebrow: 'Service family',
    description: 'Bookable services available in this storefront.',
    areaLabel: 'Service',
    accent: '#0f766e',
    icon: null,
    howItWorks: [
      'Choose the service type that matches the request.',
      'Share the required details during booking.',
      'Keep the booking reference for updates and follow-up.'
    ],
    preparationNotes: [
      'Review the service detail before finalizing the booking.',
      'Prepare any notes, access details, or special requests in advance.'
    ]
  };
};

export const getServicesStorefrontViewModel = (catalog = []) => {
  const services = (Array.isArray(catalog) ? catalog : [])
    .filter((item) => String(item?.category || '').trim().toLowerCase() === 'service')
    .map((item) => {
      const categoryKey = normalizeCategoryKey(item?.service_detail?.service_category);
      const intakeFields = summarizeIntake(item?.service_detail?.intake_form_schema);
      const requiredIntakeCount = intakeFields.filter((field) => field.required).length;
      return {
        ...item,
        categoryKey,
        categoryMeta: getServiceCategoryMeta(categoryKey),
        variantName: stripServicePrefix(item?.name, categoryKey),
        durationLabel: formatDurationLabel(item?.service_detail?.duration_minutes),
        paymentPolicyLabel: formatPaymentPolicyLabel(item?.service_detail?.payment_policy),
        serviceAreaLabel: formatServiceAreaLabel(item?.service_detail?.service_area_type),
        intakeFields,
        requiredIntakeCount
      };
    });

  const grouped = new Map();
  services.forEach((item) => {
    const existing = grouped.get(item.categoryKey) || {
      categoryKey: item.categoryKey,
      categoryMeta: item.categoryMeta,
      items: []
    };
    existing.items.push(item);
    grouped.set(item.categoryKey, existing);
  });

  const serviceGroups = [...grouped.values()]
    .sort((left, right) => byCategoryOrder(left.categoryKey, right.categoryKey))
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => String(left.variantName || '').localeCompare(String(right.variantName || '')))
    }));

  const inStoreCount = services.filter((item) => String(item?.service_detail?.service_area_type || '').trim().toLowerCase() === 'in_store').length;
  const onSiteCount = services.filter((item) => String(item?.service_detail?.service_area_type || '').trim().toLowerCase() === 'customer_location').length;

  return {
    services,
    allServices: services,
    serviceGroups,
    totalServices: services.length,
    serviceFamilyCount: serviceGroups.length,
    inStoreCount,
    onSiteCount
  };
};
