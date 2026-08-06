const normalizeBookingFieldText = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const getBookingFieldSearchText = (field) => normalizeBookingFieldText(`${field?.id || ''} ${field?.label || ''}`);

const bookingFieldMatchesAny = (field, tokens) => {
  const haystack = ` ${getBookingFieldSearchText(field)} `;
  return tokens.some((token) => haystack.includes(` ${normalizeBookingFieldText(token)} `));
};

const isServiceAreaOnSite = (serviceItem) => {
  const value = normalizeBookingFieldText(serviceItem?.serviceAreaLabel || serviceItem?.service_detail?.service_area_type || '');
  return value.includes('home') || value.includes('on site') || value.includes('onsite') || value.includes('customer location');
};

export const normalizeServiceFormFields = (schema) => {
  const fields = Array.isArray(schema?.fields) ? schema.fields : Array.isArray(schema?.questions) ? schema.questions : [];
  return fields
    .map((field, index) => ({
      id: String(field.id || field.key || field.name || `field_${index}`),
      label: String(field.label || field.question || field.name || `Question ${index + 1}`),
      type: ['textarea', 'select', 'checkbox', 'number', 'date', 'text'].includes(String(field.type || '').trim()) ? String(field.type).trim() : 'text',
      required: field.required === true,
      options: Array.isArray(field.options) ? field.options.map((option) => String(option)) : []
    }))
    .filter((field) => field.id && field.label);
};

export const shouldBookingFieldSpanFullWidth = (field) => {
  const label = String(field?.label || '').trim().toLowerCase();
  const type = String(field?.type || '').trim().toLowerCase();
  if (type === 'textarea' || type === 'date' || type === 'checkbox') return true;
  return ['address', 'location', 'schedule', 'instruction', 'instructions', 'notes', 'message', 'details'].some((token) => label.includes(token));
};

export const buildServicePaymentOptions = (servicePaymentPolicy) => {
  if (servicePaymentPolicy === 'prepaid_required') return [{ value: 'prepaid', label: 'Pay Now' }];
  if (servicePaymentPolicy === 'postpaid_only') return [{ value: 'postpaid', label: 'Pay Later' }];
  if (servicePaymentPolicy === 'deposit_allowed') {
    return [
      { value: 'postpaid', label: 'Pay Later' },
      { value: 'prepaid', label: 'Pay Now' },
      { value: 'deposit', label: 'Deposit' }
    ];
  }
  return [
    { value: 'postpaid', label: 'Pay Later' },
    { value: 'prepaid', label: 'Pay Now' }
  ];
};

export const buildServiceBookingFieldPlan = ({ fields, serviceItem }) => {
  const usedIds = new Set();
  const takeField = (predicate) => {
    const match = fields.find((field) => !usedIds.has(field.id) && predicate(field));
    if (match) usedIds.add(match.id);
    return match || null;
  };

  const customerNameField = takeField((field) => (
    bookingFieldMatchesAny(field, ['customer name', 'full name', 'client name', 'contact person', 'name'])
    && !bookingFieldMatchesAny(field, ['business name', 'branch name', 'service name'])
  ));
  const contactNumberField = takeField((field) => bookingFieldMatchesAny(field, ['contact number', 'phone number', 'mobile number', 'contact no', 'telephone', 'phone']));
  const emailField = takeField((field) => bookingFieldMatchesAny(field, ['email', 'email address']));
  const addressField = takeField((field) => bookingFieldMatchesAny(field, ['full service address', 'service address', 'full address', 'address', 'pickup address', 'location']));
  const preferredDateField = takeField((field) => (
    field.type === 'date'
    || bookingFieldMatchesAny(field, ['preferred schedule', 'schedule', 'appointment date', 'booking date', 'preferred date', 'service date', 'date'])
  ));
  const preferredTimeField = takeField((field) => bookingFieldMatchesAny(field, ['preferred time slot', 'time slot', 'preferred time', 'time window', 'appointment time', 'service time']));
  const unitTypeField = takeField((field) => bookingFieldMatchesAny(field, ['unit type', 'service type', 'appliance type', 'unit variant']));
  const unitCountField = takeField((field) => (
    field.type === 'number'
      ? bookingFieldMatchesAny(field, ['number of units', 'unit count', 'units', 'quantity', 'qty'])
      : bookingFieldMatchesAny(field, ['number of units', 'unit count', 'quantity', 'qty'])
  ));
  const instructionField = takeField((field) => bookingFieldMatchesAny(field, ['special instructions', 'special instruction', 'instructions', 'instruction', 'notes', 'message', 'additional details']));

  const remainingFields = fields.filter((field) => !usedIds.has(field.id));
  return {
    customerNameField,
    contactNumberField,
    emailField,
    addressField,
    preferredDateField,
    preferredTimeField,
    unitTypeField,
    unitCountField,
    instructionField,
    remainingFields,
    requiresAddress: Boolean(addressField) || isServiceAreaOnSite(serviceItem)
  };
};

export const isBookingFieldComplete = (field, value) => {
  if (!field?.required) return true;
  return field.type === 'checkbox' ? value === true : String(value || '').trim().length > 0;
};

export const formatBookingReviewValue = (field, value) => {
  if (field?.type === 'checkbox') return value === true ? 'Confirmed' : 'Not confirmed';
  return String(value || '').trim() || 'Not provided';
};

export const BOOKING_FIELD_STYLE = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  marginTop: 6,
  border: '1px solid #cbd5e1',
  borderRadius: 14,
  padding: '12px 13px',
  background: '#fff',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s'
};
