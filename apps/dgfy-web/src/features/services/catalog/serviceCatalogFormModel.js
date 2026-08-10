const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNonNegativeInteger = (value, fallback = 0) => (
  Math.max(0, Math.trunc(toFiniteNumber(value, fallback)))
);

const toPositiveInteger = (value, fallback = 1) => (
  Math.max(1, Math.trunc(toFiniteNumber(value, fallback)))
);

const firstIntakeField = (serviceDetail = {}) => {
  const schema = serviceDetail?.intake_form_schema;
  const fields = Array.isArray(schema?.fields)
    ? schema.fields
    : Array.isArray(schema)
      ? schema
      : [];
  return fields[0] || null;
};

export const SERVICE_CATALOG_FORM_DEFAULTS = Object.freeze({
  name: '',
  sku_code: '',
  description: '',
  service_category: '',
  unit_of_measure: 'service',
  duration_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  lead_time_minutes: 0,
  cancellation_window_hours: 24,
  default_sale_price: '',
  track_internal_cost: false,
  initial_track_internal_cost: false,
  cost_per_unit: '',
  vat_type: 'vatable',
  payment_policy: 'customer_choice',
  service_area_type: 'in_store',
  intake_question: '',
  intake_question_type: 'textarea',
  intake_question_required: false,
  client_notes_template: '',
  bookable: true,
  visible_in_pos: true,
  visible_in_storefront: true,
  addons_enabled: false,
  status: 'active'
});

export const createServiceCatalogFormValues = (service = null) => {
  if (!service) return { ...SERVICE_CATALOG_FORM_DEFAULTS };

  const detail = service.service_detail || service.serviceDetail || {};
  const intakeField = firstIntakeField(detail);
  const storedCost = service.cost_per_unit;

  return {
    ...SERVICE_CATALOG_FORM_DEFAULTS,
    name: String(service.name || ''),
    sku_code: String(service.sku_code || ''),
    description: String(service.description || ''),
    service_category: String(detail.service_category || ''),
    unit_of_measure: String(service.unit_of_measure || 'service'),
    duration_minutes: toPositiveInteger(detail.duration_minutes, 60),
    buffer_before_minutes: toNonNegativeInteger(detail.buffer_before_minutes),
    buffer_after_minutes: toNonNegativeInteger(detail.buffer_after_minutes),
    lead_time_minutes: toNonNegativeInteger(detail.lead_time_minutes),
    cancellation_window_hours: toNonNegativeInteger(detail.cancellation_window_hours, 24),
    default_sale_price: service.default_sale_price == null ? '' : String(service.default_sale_price),
    track_internal_cost: storedCost !== null && storedCost !== undefined && storedCost !== '',
    initial_track_internal_cost: storedCost !== null && storedCost !== undefined && storedCost !== '',
    cost_per_unit: storedCost == null ? '' : String(storedCost),
    vat_type: String(service.vat_type || 'vatable'),
    payment_policy: String(detail.payment_policy || 'customer_choice'),
    service_area_type: String(detail.service_area_type || 'in_store'),
    intake_question: String(intakeField?.label || ''),
    intake_question_type: String(intakeField?.type || 'textarea'),
    intake_question_required: intakeField?.required === true,
    client_notes_template: String(detail.client_notes_template || ''),
    bookable: detail.bookable !== false,
    visible_in_pos: detail.visible_in_pos !== false,
    visible_in_storefront: detail.visible_in_storefront !== false,
    addons_enabled: detail.addons_enabled === true,
    status: String(service.status || 'active')
  };
};

export const buildServiceCatalogPayload = (values = {}, { includeStatus = false } = {}) => {
  const intakeQuestion = String(values.intake_question || '').trim();
  const payload = {
    name: String(values.name || '').trim(),
    sku_code: String(values.sku_code || '').trim() || null,
    description: String(values.description || '').trim() || null,
    service_category: String(values.service_category || '').trim() || null,
    unit_of_measure: String(values.unit_of_measure || 'service').trim() || 'service',
    duration_minutes: toPositiveInteger(values.duration_minutes, 60),
    buffer_before_minutes: toNonNegativeInteger(values.buffer_before_minutes),
    buffer_after_minutes: toNonNegativeInteger(values.buffer_after_minutes),
    lead_time_minutes: toNonNegativeInteger(values.lead_time_minutes),
    cancellation_window_hours: toNonNegativeInteger(values.cancellation_window_hours, 24),
    default_sale_price: toFiniteNumber(values.default_sale_price),
    vat_type: String(values.vat_type || 'vatable').trim() || 'vatable',
    payment_policy: String(values.payment_policy || 'customer_choice').trim() || 'customer_choice',
    service_area_type: String(values.service_area_type || 'in_store').trim() || 'in_store',
    intake_form_schema: intakeQuestion ? {
      fields: [{
        id: 'intake_1',
        label: intakeQuestion,
        type: String(values.intake_question_type || 'textarea').trim() || 'textarea',
        required: values.intake_question_required === true
      }]
    } : null,
    client_notes_template: String(values.client_notes_template || '').trim() || null,
    bookable: values.bookable !== false,
    visible_in_pos: values.visible_in_pos !== false,
    visible_in_storefront: values.visible_in_storefront !== false,
    addons_enabled: values.addons_enabled === true
  };

  if (values.track_internal_cost === true) {
    payload.cost_per_unit = toFiniteNumber(values.cost_per_unit);
  } else if (values.initial_track_internal_cost === true) {
    payload.cost_per_unit = null;
  }
  if (includeStatus) {
    payload.status = String(values.status || 'active').trim() === 'inactive' ? 'inactive' : 'active';
  }

  return payload;
};
