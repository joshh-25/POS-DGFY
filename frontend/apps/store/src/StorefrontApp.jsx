import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import maplibregl from 'maplibre-gl';
import { toast } from 'sonner';
import dgfyHeaderLogo from '../../../public/dgfy-logo.png';
import dgfySymbolLogo from '../../../public/dgfy-symbologo.png';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  ClipboardList,
  Fish,
  HeartHandshake,
  Mail,
  MapPin,
  MessageCircle,
  MousePointer2,
  Phone,
  Plus,
  Pizza,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Shirt,
  Snowflake,
  Scissors,
  SprayCan,
  Droplets,
  Wrench,
  CupSoda,
  Coffee,
  Sandwich,
  Drumstick,
  Soup,
  UtensilsCrossed,
  ChevronDown,
  Share2,
  Trash2,
  X
} from 'lucide-react';
import { canCheckout, getCheckoutBlockReason } from './checkoutRules.js';
import { filterCatalogItems } from './catalogSearch.js';
import {
  getDiscoveryEmptyStateMessage,
  getDiscoveryMatchBadges,
  getPreferredDiscoveryLocationId,
  selectDiscoveryPinLocations
} from './discoveryPresentation.js';
import {
  classifyStoreCatalogError,
  normalizeStorefrontErrorMessage
} from './storefrontErrorMessages.js';
import {
  canUseBooking,
  canUseCheckout,
  canUseProductCart,
  canViewCatalog,
  getAccessCapabilities,
  getInventoryDisplayLabel
} from './customerAccess.js';
import { getFoodBeverageStorefrontViewModel } from './fnbStorefrontViewModel.js';
import { renderBusinessModePinSvg } from './businessModePins.js';
import { buildMarkerDisplayOffsets, createStoreMarkerPreviewNode } from './storefrontMarkerPreview.js';
import { normalizeStorefrontPageModel } from './normalizeStorefrontPageModel.js';
import 'maplibre-gl/dist/maplibre-gl.css';

const FnbReservationPanel = lazy(() => import('./FnbReservationPanel.jsx'));

const DEFAULT_CENTER = { latitude: 10.7202, longitude: 122.5621 };
const TILE_BASE = import.meta.env.VITE_TILE_BASE || 'https://tiles.openfreemap.org';

const TILING_SERVER = import.meta.env.DEV
  ? '/openfreemap/styles/liberty'
  : `${TILE_BASE}/styles/liberty`;

const tileTransformRequest = import.meta.env.DEV
  ? (url) => {
    if (url.startsWith(TILE_BASE)) {
      return { url: url.replace(TILE_BASE, `${window.location.origin}/openfreemap`) };
    }
    return { url };
  }
  : undefined;

const ORDER_METHOD_OPTIONS = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeout', label: 'Takeout' }
];
const SERVICE_CATEGORY_ICON_MAP = Object.freeze({
  aircon: Snowflake,
  laundry: Shirt,
  pressing: Scissors,
  addon: Sparkles,
  repair: Wrench,
  cleaning: SprayCan,
  consultation: ClipboardList,
  grooming: HeartHandshake,
  wellness: Droplets,
  service: Sparkles
});
const DGFY_BRAND_NAME = 'DGFY';
const DGFY_ACRONYM = 'Discover Goods For You';
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
const DGFY_CONVENIENCE_FEE_RATE = 0.01;
const DISCOVERY_BADGE_TONE_STYLES = {
  teal: { color: '#0f766e', background: '#ecfeff', borderColor: '#99f6e4' },
  blue: { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' },
  slate: { color: '#334155', background: '#f8fafc', borderColor: '#cbd5e1' },
  emerald: { color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' },
  amber: { color: '#92400e', background: '#fff7ed', borderColor: '#fed7aa' }
};

const money = (v) => `PHP ${Number(v || 0).toFixed(2)}`;
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toSlug = (v) => String(v || '').trim().toLowerCase();
const normalizeServiceFormFields = (schema) => {
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
const shouldBookingFieldSpanFullWidth = (field) => {
  const label = String(field?.label || '').trim().toLowerCase();
  const type = String(field?.type || '').trim().toLowerCase();
  if (type === 'textarea' || type === 'date' || type === 'checkbox') return true;
  return ['address', 'location', 'schedule', 'instruction', 'instructions', 'notes', 'message', 'details'].some((token) => label.includes(token));
};
const buildServicePaymentOptions = (servicePaymentPolicy) => {
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
const buildServiceBookingFieldPlan = ({ fields, serviceItem }) => {
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
const isBookingFieldComplete = (field, value) => {
  if (!field?.required) return true;
  return field.type === 'checkbox' ? value === true : String(value || '').trim().length > 0;
};
const formatBookingReviewValue = (field, value) => {
  if (field?.type === 'checkbox') return value === true ? 'Confirmed' : 'Not confirmed';
  return String(value || '').trim() || 'Not provided';
};
const BOOKING_FIELD_STYLE = {
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
const DROPDOWN_MENU_BASE_STYLE = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: 0,
  right: 0,
  zIndex: 2400,
  border: '1px solid #dbe5ee',
  borderRadius: 18,
  background: '#ffffff',
  boxShadow: '0 20px 48px rgba(15,23,42,0.14)',
  padding: 8,
  display: 'grid',
  gap: 6,
  maxHeight: 280,
  overflowY: 'auto'
};
function StorefrontDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select',
  disabled = false,
  label = '',
  leading = null,
  trailingMeta = null,
  triggerStyle = {},
  containerStyle = {},
  menuStyle = {},
  optionStyle = {},
  selectedLabelStyle = {},
  labelStyle = {},
  compactLabel = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: 0, ...containerStyle }}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) return;
          setIsOpen((previous) => !previous);
        }}
        style={{
          width: '100%',
          minHeight: 44,
          borderRadius: 18,
          border: '1px solid #dbe5ee',
          background: disabled ? '#f8fafc' : '#ffffff',
          color: disabled ? '#94a3b8' : '#0f172a',
          padding: compactLabel ? '10px 52px 10px 16px' : '11px 52px 11px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          position: 'relative',
          outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
          ...triggerStyle
        }}
      >
        {leading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
            {leading}
          </span>
        ) : null}
        {!leading && selectedOption?.icon ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
            {React.createElement(selectedOption.icon, { size: 16 })}
          </span>
        ) : null}
        <span style={{ display: 'grid', gap: label ? 3 : 0, minWidth: 0, flex: 1 }}>
          {label ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1.1,
                ...labelStyle
              }}
            >
              {label}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: disabled ? '#94a3b8' : '#0f172a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.25,
              ...selectedLabelStyle
            }}
          >
            {selectedOption?.label || placeholder}
          </span>
        </span>
        {trailingMeta ? (
          <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', flexShrink: 0 }}>
            {trailingMeta}
          </span>
        ) : null}
        <ChevronDown
          size={18}
          color={disabled ? '#cbd5e1' : '#475569'}
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: `translateY(-50%) rotate(${isOpen ? 180 : 0}deg)`,
            transition: 'transform 0.2s',
            pointerEvents: 'none'
          }}
        />
      </button>

      {isOpen && !disabled ? (
        <div role="listbox" style={{ ...DROPDOWN_MENU_BASE_STYLE, ...menuStyle }}>
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}`}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: isSelected ? '1px solid #fed7aa' : '1px solid transparent',
                  background: isSelected ? '#fff7ed' : '#ffffff',
                  color: '#0f172a',
                  padding: option.description ? '10px 14px' : '11px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'grid',
                  gap: option.description ? 4 : 0,
                  boxSizing: 'border-box',
                  ...optionStyle
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {option.icon ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? '#c2410c' : '#64748b', flexShrink: 0 }}>
                      {React.createElement(option.icon, { size: 16 })}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: isSelected ? 800 : 700, lineHeight: 1.3, minWidth: 0 }}>
                    {option.label}
                  </span>
                </span>
                {option.description ? (
                  <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.35 }}>
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
const formatServiceAppointmentSummary = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (!raw) return 'Schedule needed';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return 'Schedule needed';
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};
const SERVICE_FALLBACK_TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEY_ALIASES = {
  0: ['0', 'sun', 'sunday'],
  1: ['1', 'mon', 'monday'],
  2: ['2', 'tue', 'tues', 'tuesday'],
  3: ['3', 'wed', 'wednesday'],
  4: ['4', 'thu', 'thur', 'thurs', 'thursday'],
  5: ['5', 'fri', 'friday'],
  6: ['6', 'sat', 'saturday']
};
const pad2 = (value) => String(value).padStart(2, '0');
const formatLocalDateInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const formatLongDateLabel = (dateString) => {
  if (!dateString) return 'Pick a date';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Pick a date';
  return parsed.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};
const formatShortDateLabel = (dateString) => {
  if (!dateString) return 'Pick a date';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Pick a date';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};
const formatTimeSlotLabel = (timeString) => {
  if (!timeString) return 'Pick a time';
  const [hourRaw, minuteRaw = '00'] = String(timeString).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'Pick a time';
  const normalized = new Date(2000, 0, 1, hour, minute, 0, 0);
  return normalized.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};
const getDatePartFromAppointment = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  return raw.includes('T') ? raw.split('T')[0] : '';
};
const getTimePartFromAppointment = (appointmentAt) => {
  const raw = String(appointmentAt || '').trim();
  if (!raw.includes('T')) return '';
  const timePart = raw.split('T')[1] || '';
  return timePart.slice(0, 5);
};
const combineDateAndTimeParts = (datePart, timePart) => {
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart}`;
};
const combineDateWithEmptyTime = (datePart) => (datePart ? `${datePart}T` : '');
const formatLocalDateTimeInputValue = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${formatLocalDateInputValue(parsed)}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
};
const normalizeSlotClockValue = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${pad2(hour)}:${pad2(minute)}`;
};
const toMinutesFromClock = (clockValue) => {
  const normalized = normalizeSlotClockValue(clockValue);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return (hour * 60) + minute;
};
const parseWeeklyAvailabilitySlot = (entry) => {
  if (typeof entry === 'string') {
    const [startRaw, endRaw] = entry.split('-');
    const start = normalizeSlotClockValue(startRaw);
    const end = normalizeSlotClockValue(endRaw);
    return start && end ? { start, end } : null;
  }
  if (entry && typeof entry === 'object') {
    const start = normalizeSlotClockValue(entry.start || entry.from || entry.open);
    const end = normalizeSlotClockValue(entry.end || entry.to || entry.close);
    return start && end ? { start, end } : null;
  }
  return null;
};
const getServiceWeeklyAvailability = (serviceItem) => (
  serviceItem?.service_resources?.weekly_availability
  || serviceItem?.service_detail?.service_resources?.weekly_availability
  || serviceItem?.service_detail?.weekly_availability
  || null
);
const getServiceDurationMinutes = (serviceItem) => {
  const duration = Number(serviceItem?.service_detail?.duration_minutes || serviceItem?.duration_minutes || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 120;
};
const getNormalizedWeeklyAvailabilityByDay = (serviceItem) => {
  const raw = getServiceWeeklyAvailability(serviceItem);
  const resolved = {};
  for (let dayIndex = 0; dayIndex <= 6; dayIndex += 1) {
    let dayValue = null;
    const aliases = DAY_KEY_ALIASES[dayIndex] || [];
    for (const alias of aliases) {
      if (raw && Object.prototype.hasOwnProperty.call(raw, alias)) {
        dayValue = raw[alias];
        break;
      }
    }
    const normalizedEntries = (Array.isArray(dayValue) ? dayValue : dayValue != null ? [dayValue] : [])
      .map(parseWeeklyAvailabilitySlot)
      .filter(Boolean);
    resolved[dayIndex] = normalizedEntries;
  }
  return resolved;
};
const buildServiceDateOptions = (serviceItem, maxOptions = 7) => {
  const dayMap = getNormalizedWeeklyAvailabilityByDay(serviceItem);
  const hasAvailabilityRules = Object.values(dayMap).some((entries) => entries.length > 0);
  const leadTimeMinutes = Math.max(0, Number(serviceItem?.service_detail?.lead_time_minutes || 0));
  const firstAllowed = new Date(Date.now() + (leadTimeMinutes * 60 * 1000));
  const options = [];
  for (let offset = 0; offset < 30 && options.length < maxOptions; offset += 1) {
    const candidate = new Date(firstAllowed);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + offset);
    const daySlots = dayMap[candidate.getDay()] || [];
    if (hasAvailabilityRules && daySlots.length === 0) continue;
    options.push({
      value: formatLocalDateInputValue(candidate),
      label: formatShortDateLabel(formatLocalDateInputValue(candidate)),
      weekday: DAY_LABELS[candidate.getDay()],
      hasAvailability: daySlots.length > 0
    });
  }
  return options;
};
const buildServiceTimeSlotOptions = (serviceItem, dateString) => {
  if (!dateString) return [];
  const selectedDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return [];
  const dayMap = getNormalizedWeeklyAvailabilityByDay(serviceItem);
  const daySlots = dayMap[selectedDate.getDay()] || [];
  if (daySlots.length === 0) {
    return SERVICE_FALLBACK_TIME_SLOTS.map((value) => ({ value, label: formatTimeSlotLabel(value), source: 'fallback' }));
  }
  const intervalMinutes = Math.max(60, Math.min(120, getServiceDurationMinutes(serviceItem)));
  const values = [];
  daySlots.forEach((slot) => {
    const startMinutes = toMinutesFromClock(slot.start);
    const endMinutes = toMinutesFromClock(slot.end);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return;
    for (let minute = startMinutes; minute < endMinutes; minute += intervalMinutes) {
      const clockValue = `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
      values.push(clockValue);
    }
  });
  return [...new Set(values)].map((value) => ({ value, label: formatTimeSlotLabel(value), source: 'availability' }));
};
const buildServiceAvailabilitySlotOptions = (slots = []) => (
  (Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const appointmentAt = formatLocalDateTimeInputValue(slot?.start_at);
      const value = getTimePartFromAppointment(appointmentAt);
      if (!appointmentAt || !value) return null;
      const availableCapacity = Number(slot?.available_capacity || 0);
      const resourceLabel = slot?.resource_name ? ` - ${slot.resource_name}` : '';
      const capacityLabel = availableCapacity > 1 ? ` (${availableCapacity} units left)` : ' (1 unit left)';
      return {
        value,
        label: `${formatTimeSlotLabel(value)}${capacityLabel}${resourceLabel}`,
        source: 'availability_api',
        appointmentAt,
        availableCapacity
      };
    })
    .filter(Boolean)
);
const SERVICE_AVAILABILITY_REASON_LABELS = {
  requested_quantity_exceeds_capacity_anchor: 'This quantity needs a service resource with more capacity.',
  overlapping_booking_capacity_full: 'Matching service capacity is already booked for those slots.',
  resource_blackout_date: 'The selected service resource is blocked out for that date.',
  outside_weekly_availability: 'The selected date is outside the service schedule.',
  outside_weekly_availability_or_lead_time: 'The selected date has no slots after lead-time and schedule rules.',
  no_matching_capacity_anchor: 'No matching service resource or provider is available for this selection.',
  positive_sale_price_required: 'This service needs a sale price before online booking.',
  service_not_bookable: 'This service is not currently bookable.'
};
const serviceAvailabilityMessage = ({ loading, error, matches, unavailableReason, diagnostics, slots }) => {
  if (loading) return 'Checking live availability';
  if (error) return error;
  if (!matches) return 'Checking store schedule';
  if (Array.isArray(slots) && slots.length > 0) return 'Live capacity checked';
  const guidance = String(diagnostics?.guidance || diagnostics?.setup_warnings?.[0] || '').trim();
  if (guidance) return guidance;
  return SERVICE_AVAILABILITY_REASON_LABELS[unavailableReason] || 'No available slots for this date and quantity';
};
const getPreferredBookingTimeForDate = (serviceItem, dateString, currentTime = '') => {
  const availableSlots = buildServiceTimeSlotOptions(serviceItem, dateString);
  if (currentTime && availableSlots.some((slot) => slot.value === currentTime)) return currentTime;
  return availableSlots[0]?.value || '09:00';
};
const TENANT_STORE_BASE_PATH = '/tenant-store';
const STORE_BOOKING_SUBPAGE = 'book';
const STORE_ORDER_SUBPAGE = 'order';
const STORE_SERVICE_SUBPAGE = 'service';
const storePath = (slug, subpage = null, query = '') => `${TENANT_STORE_BASE_PATH}/${encodeURIComponent(toSlug(slug))}${subpage ? `/${subpage}` : ''}${query || ''}`;
const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => value * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + (Math.sin(dLon / 2) ** 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const readRouteSlug = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  const patterns = [
    /^\/tenant-store\/([^/]+)(?:\/[^/]+)?$/i,
    /^\/store\/([^/]+)(?:\/[^/]+)?$/i
  ];
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  const hashPatterns = [
    /^#\/tenant-store\/([^/]+)(?:\/[^/]+)?$/i,
    /^#\/store\/([^/]+)(?:\/[^/]+)?$/i
  ];
  for (const pattern of hashPatterns) {
    const match = (window.location.hash || '').match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  return null;
};
const readStoreSubpage = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  const patterns = [
    /^\/tenant-store\/[^/]+\/([^/]+)$/i,
    /^\/store\/[^/]+\/([^/]+)$/i
  ];
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  const hashPatterns = [
    /^#\/tenant-store\/[^/]+\/([^/]+)$/i,
    /^#\/store\/[^/]+\/([^/]+)$/i
  ];
  for (const pattern of hashPatterns) {
    const match = (window.location.hash || '').match(pattern);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  return null;
};
const readStoreServiceItemId = () => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search || '');
  const raw = String(params.get('service') || '').trim();
  return raw || null;
};

const buildRequestError = (message, meta = {}) => {
  const error = new Error(message);
  Object.assign(error, meta);
  return error;
};

const inferRuntimeApiOrigin = () => {
  if (typeof window === 'undefined') return '';
  const { hostname, port, protocol } = window.location;
  const numericPort = Number(port);
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isLikelyViteStorePort = Number.isInteger(numericPort) && (
    (numericPort >= 5173 && numericPort <= 5185)
    || (numericPort >= 4173 && numericPort <= 4185)
  );
  if (!isLocalHost || !isLikelyViteStorePort) return '';
  return `${protocol}//${hostname}:5000`;
};

const resolveConfiguredOrigin = (rawValue = '') => {
  const raw = String(rawValue || '').trim();
  if (!raw || raw.startsWith('/')) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.protocol.startsWith('http') ? parsed.origin : '';
  } catch {
    return '';
  }
};

const configuredApiOrigin = resolveConfiguredOrigin(import.meta.env.VITE_API_BASE_URL);
const apiOrigin = configuredApiOrigin || inferRuntimeApiOrigin();
const configuredAssetOrigin = resolveConfiguredOrigin(import.meta.env.VITE_ASSET_BASE_URL);
const assetOrigin = configuredAssetOrigin || apiOrigin;
const configuredPublicStorefrontOrigin = resolveConfiguredOrigin(import.meta.env.VITE_PUBLIC_STOREFRONT_ORIGIN);
const publicStorefrontOrigin = configuredPublicStorefrontOrigin || 'https://dgfy.ph';
const buildStamp = String(import.meta.env.VITE_BUILD_STAMP || '').trim();
const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;
const withApiOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('/')) return url;
  return apiOrigin ? `${apiOrigin}${url}` : url;
};

const withAssetOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.startsWith('storefront-assets/')) {
    const normalized = `/uploads/${trimmed}`;
    return assetOrigin ? `${assetOrigin}${normalized}` : normalized;
  }
  if (trimmed.startsWith('/')) {
    return assetOrigin ? `${assetOrigin}${trimmed}` : trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};
const buildPublicStorefrontUrl = (slug) => {
  const normalizedSlug = toSlug(slug);
  if (!normalizedSlug) return '';
  return `${publicStorefrontOrigin}${storePath(normalizedSlug)}`;
};

const parseOptionalArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseOptionalObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseBooleanFlag = (value, fallback = false) => {
  if (value === true || value === false) return value;
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const buildAccessPolicyStorePatch = (accessPolicy = null) => {
  if (!accessPolicy || typeof accessPolicy !== 'object') return null;
  return {
    customer_access_mode: accessPolicy.customer_access_mode,
    effective_customer_access_mode: accessPolicy.effective_customer_access_mode,
    max_customer_access_mode: accessPolicy.max_customer_access_mode,
    inventory_display_mode: accessPolicy.inventory_display_mode,
    inventory_low_stock_display_threshold: accessPolicy.inventory_low_stock_display_threshold,
    access_capabilities: accessPolicy.access_capabilities,
    access_limitation_reason: accessPolicy.limitation_reason || accessPolicy.access_limitation_reason || null,
    customer_access_modes_enabled: accessPolicy.customer_access_modes_enabled
  };
};

export const findCanonicalStorefrontSlug = (requestedSlug, stores = []) => {
  const normalizedRequestedSlug = toSlug(requestedSlug);
  if (!normalizedRequestedSlug) return '';

  const candidates = Array.isArray(stores) ? stores : [];
  const exactSlugMatch = candidates.find((store) => toSlug(store?.slug) === normalizedRequestedSlug);
  if (exactSlugMatch?.slug) return toSlug(exactSlugMatch.slug);

  const slugPrefixMatch = candidates.find((store) => toSlug(store?.slug).startsWith(`${normalizedRequestedSlug}-`));
  if (slugPrefixMatch?.slug) return toSlug(slugPrefixMatch.slug);

  const tenantNameMatch = candidates.find((store) => toSlug(store?.tenant_name) === normalizedRequestedSlug);
  if (tenantNameMatch?.slug) return toSlug(tenantNameMatch.slug);

  return '';
};

const normalizeStorefrontCategories = (value) => parseOptionalArray(value)
  .map((entry) => String(entry || '').trim())
  .filter(Boolean)
  .slice(0, 12);

const normalizeStorefrontGallery = (value) => parseOptionalArray(value)
  .map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const url = String(entry.url || '').trim();
    const path = String(entry.path || '').trim();
    if (!url && !path) return null;
    return {
      url: withAssetOrigin(url) || '',
      path: withAssetOrigin(path) || '',
      caption: String(entry.caption || '').trim(),
      alt: String(entry.alt || '').trim(),
      sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
    };
  })
  .filter(Boolean)
  .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
  .slice(0, 24);

const normalizeStorefrontDeliveryPartners = (value) => parseOptionalArray(value)
  .map((entry) => {
    if (typeof entry === 'string') {
      const partner = String(entry || '').trim().toLowerCase();
      if (!partner) return null;
      return { partner, label: partner, url: '' };
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const partner = String(entry.partner || '').trim().toLowerCase();
    if (!partner) return null;
    return {
      partner,
      label: String(entry.label || '').trim() || partner,
      url: sanitizeExternalLink(entry.url)
    };
  })
  .filter(Boolean)
  .slice(0, 8);

const normalizeStorefrontReviewSummary = (value) => {
  const raw = parseOptionalObject(value);
  if (!raw) return null;
  const score = Number(raw.score);
  const totalCount = Number(raw.total_count);
  const starDistributionRaw = raw.star_distribution && typeof raw.star_distribution === 'object' ? raw.star_distribution : {};
  const starDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: Number.isInteger(Number(starDistributionRaw[star])) ? Number(starDistributionRaw[star]) : 0
  }));
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : null,
    total_count: Number.isInteger(totalCount) && totalCount >= 0 ? totalCount : null,
    star_distribution: starDistribution
  };
};

const sanitizeExternalLink = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const createStorePopupNode = (store = {}) => {
  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gap = '4px';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '8px';

  const profileImageUrl = withAssetOrigin(store?.storefront_profile_image_url);
  if (profileImageUrl) {
    const img = document.createElement('img');
    img.setAttribute('src', profileImageUrl);
    img.setAttribute('alt', '');
    img.style.width = '28px';
    img.style.height = '28px';
    img.style.borderRadius = '999px';
    img.style.objectFit = 'cover';
    img.style.border = '1px solid #d1d5db';
    img.onerror = () => {
      img.remove();
    };
    row.appendChild(img);
  }

  const title = document.createElement('strong');
  title.textContent = String(store?.location_name || store?.tenant_name || 'Store');
  row.appendChild(title);
  container.appendChild(row);

  const address = document.createElement('div');
  address.textContent = String(store?.address_line || '');
  container.appendChild(address);

  return container;
};

const normalizeProfileLocations = (profile = {}) => (
  (Array.isArray(profile?.active_location_snapshot) ? profile.active_location_snapshot : [])
    .map((location) => ({
      location_id: location.location_id ?? null,
      name: location.name || profile.location_name || 'Main Branch',
      address_line: location.address_line || profile.address_line || '',
      latitude: location.latitude ?? profile.latitude ?? null,
      longitude: location.longitude ?? profile.longitude ?? null,
      is_open: location.is_open !== false,
      is_active: location.is_active !== false,
      is_primary_storefront: location.is_primary_storefront === true,
      supports_delivery: location.supports_delivery !== false,
      supports_pickup: location.supports_pickup !== false,
      supports_dine_in: location.supports_dine_in !== false
    }))
    .filter((location) => location.location_id != null)
);

const locationsMatchProfileSnapshot = (locations = [], profile = {}) => {
  const profileLocations = normalizeProfileLocations(profile);
  if (!profileLocations.length) return true;
  const profilePrimary = profileLocations.find((location) => location.is_primary_storefront) || profileLocations[0];
  const returnedPrimary = (Array.isArray(locations) ? locations : [])
    .find((location) => Number(location.location_id) === Number(profilePrimary.location_id));
  if (!returnedPrimary) return false;
  return String(returnedPrimary.name || '').trim() === String(profilePrimary.name || '').trim()
    && String(returnedPrimary.address_line || '').trim() === String(profilePrimary.address_line || '').trim();
};

const readStoreAuthToken = () => {
  if (typeof window === 'undefined') return '';
  const keys = ['dgfy_store_customer_token', 'store_customer_token', 'store_token'];
  for (const key of keys) {
    const token = String(window.localStorage.getItem(key) || '').trim();
    if (token) return token;
  }
  return '';
};

const requestJson = async (url, { method = 'GET', body, storeSlug, authToken = '', signal } = {}) => {
  let response;
  try {
    const token = String(authToken || '').trim();
    response = await fetch(withApiOrigin(url), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(storeSlug ? { 'x-store-slug': storeSlug } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    if (networkError?.name === 'AbortError') {
      throw networkError;
    }
    throw buildRequestError('Request failed before reaching API. Check server/proxy/CORS connectivity.', {
      isNetworkError: true,
      cause: networkError
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw buildRequestError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      errorCode: payload?.error_code || null,
      details: payload?.errors || payload?.details || null,
      requestId: payload?.request_id || null,
      payload
    });
  }
  return payload?.data ?? payload;
};

const createStorefrontIdempotencyKey = (prefix = 'store') => {
  const generated = window.crypto?.randomUUID?.();
  return generated || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const SERVICE_HOLD_REFRESH_BUFFER_MS = 45 * 1000;
const hasFreshServiceHold = (line) => {
  const token = String(line?.service_hold_token || '').trim();
  const expiresAt = line?.service_hold_expires_at ? new Date(line.service_hold_expires_at).getTime() : Number.NaN;
  return Boolean(token) && Number.isFinite(expiresAt) && expiresAt > Date.now() + SERVICE_HOLD_REFRESH_BUFFER_MS;
};

const serviceBatchFailureMessage = (error, serviceCartLines = []) => {
  const index = Number(error?.details?.booking_index);
  const baseMessage = normalizeStorefrontErrorMessage(error, 'Unable to complete checkout.');
  if (!Number.isInteger(index) || index < 0) return baseMessage;
  const line = serviceCartLines[index];
  const label = line?.variantName || line?.name || `booking ${index + 1}`;
  const schedule = line?.service_schedule_at ? ` at ${formatServiceAppointmentSummary(line.service_schedule_at)}` : '';
  return `${baseMessage} Affected draft: ${label}${schedule}.`;
};

const extractStockViolation = (error) => {
  const details = error?.details;
  if (!details) return null;

  if (details?.stock_violation && typeof details.stock_violation === 'object') {
    return details.stock_violation;
  }

  if (Array.isArray(details?.stock_violations) && details.stock_violations.length > 0) {
    return details.stock_violations[0];
  }

  if (Array.isArray(details)) {
    return details.find((entry) => entry && typeof entry === 'object' && Number.isFinite(Number(entry.available_stock)) && Number.isFinite(Number(entry.requested_qty))) || null;
  }

  return null;
};

const buildStockExceededMessage = (violation = {}) => {
  const itemName = violation.item_name || 'item';
  return `${itemName} is currently unavailable at the selected location.`;
};

const formatStorefrontAddress = (source = {}) => {
  if (!source || typeof source !== 'object') return '';
  const firstLine = [
    source.barangay,
    source.street_address || source.streetAddress,
    source.subdivision
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
  const secondLine = [
    source.city,
    source.state,
    source.province
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
  const formatted = [firstLine, secondLine].filter(Boolean).join(', ');
  if (formatted) return formatted;
  return String(source.address_line || source.addressLine || '').trim();
};

const isItemAvailable = (item = {}) => {
  if (item?.is_available === true) return true;
  if (item?.is_available === false) return false;
  const status = String(item?.availability_status || '').toLowerCase();
  return status === 'in_stock' || status === 'bookable';
};

const isServiceCatalogItem = (item = {}) => String(item?.category || '').trim().toLowerCase() === 'service';
const getDefaultFnbLineModifiers = (item = {}) => (
  (Array.isArray(item.fnb_modifier_groups) ? item.fnb_modifier_groups : []).flatMap((group) => {
    const options = Array.isArray(group.options) ? group.options : [];
    const selected = options.filter((option) => option.is_default === true);
    return selected.map((option) => ({
      modifier_group_id: group.modifier_group_id,
      group_name: group.display_name || group.name,
      modifier_option_id: option.modifier_option_id,
      option_name: option.name,
      price_delta: Number(option.price_delta || 0)
    }));
  })
);
const getFnbLineModifierDelta = (modifiers = []) => (
  round4((Array.isArray(modifiers) ? modifiers : []).reduce((sum, modifier) => sum + Number(modifier.price_delta || 0), 0))
);

const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const buildTicketImage = async ({ result = {}, storeName = '', cartLines = [], totals = {} } = {}) => {
  const booking = result.booking || null;
  const reference = booking?.public_reference || result.tracking_pin || result.order?.tracking_pin || 'PENDING';
  const typeLabel = booking ? 'SERVICE TICKET' : 'ORDER RECEIPT';
  const paymentStatus = booking?.payment_status || result.order?.payment_status || result.payment_status || 'unpaid';
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1250;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 42px Arial';
  ctx.fillText(typeLabel, 64, 88);
  ctx.font = '700 26px Arial';
  ctx.fillText(storeName || DGFY_BRAND_NAME, 64, 132);
  ctx.font = '400 22px Arial';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Reference: ${reference}`, 64, 182);
  ctx.fillText(`Payment: ${paymentStatus}`, 64, 218);
  if (booking?.start_at) ctx.fillText(`Appointment: ${formatTicketDate(booking.start_at)}`, 64, 254);
  if (booking?.service?.name || booking?.service_name) ctx.fillText(`Service: ${booking.service?.name || booking.service_name}`, 64, 290);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(64, 330);
  ctx.lineTo(836, 330);
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 24px Arial';
  ctx.fillText('Line Items', 64, 382);
  ctx.font = '400 22px Arial';
  let y = 426;
  cartLines.slice(0, 10).forEach((line) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${Number(line.quantity || 1)} x ${line.name}`, 64, y);
    ctx.fillStyle = '#475569';
    ctx.fillText(money(Number(line.quantity || 1) * Number(line.price || 0)), 650, y);
    y += 38;
  });
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(64, y + 8);
  ctx.lineTo(836, y + 8);
  ctx.stroke();
  y += 58;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 28px Arial';
  ctx.fillText('Total', 64, y);
  ctx.fillText(money(totals.total_amount || booking?.total_amount || result.order?.total_amount || 0), 650, y);
  y += 56;
  ctx.font = '400 20px Arial';
  ctx.fillStyle = '#64748b';
  ctx.fillText(booking ? 'Booking ticket - not a fiscal receipt unless marked paid.' : 'Digital order receipt/ticket. Keep this image for your records.', 64, y);
  const qrPayload = JSON.stringify({ type: booking ? 'service_booking' : 'store_order', reference, store: storeName || '' });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 });
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, 340, 900, 220, 220);
  ctx.font = '700 22px Arial';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.fillText(reference, 450, 1156);
  ctx.textAlign = 'left';
  return canvas.toDataURL('image/png');
};

const formatTicketDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STOREFRONT_VISITOR_ID_STORAGE_KEY = 'dgfy_storefront_visitor_id';
const getOrCreateStorefrontVisitorId = () => {
  if (typeof window === 'undefined') return '';
  const existing = String(window.localStorage.getItem(STOREFRONT_VISITOR_ID_STORAGE_KEY) || '').trim();
  if (existing && existing.length >= 16) return existing;
  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(36).slice(2, 18)}`;
  window.localStorage.setItem(STOREFRONT_VISITOR_ID_STORAGE_KEY, generated);
  return generated;
};

const makePinElement = (mode, selected = false) => {
  const el = document.createElement('div');
  el.style.cssText = `width:${selected ? 38 : 34}px;height:${selected ? 48 : 44}px;display:flex;align-items:center;justify-content:center;cursor:pointer;`;
  el.innerHTML = renderBusinessModePinSvg(mode, selected);
  return el;
};

const makeUserLocationElement = () => {
  const el = document.createElement('div');
  el.style.cssText = 'width:20px;height:20px;border-radius:999px;background:#1d4ed8;border:3px solid #fff;box-shadow:0 6px 14px rgba(15,23,42,.35);';
  return el;
};

function StoresMap({ stores, selectedKey, onSelectStore, onPreviewAction = null, userLocation = null }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const activePopupRef = useRef(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: TILING_SERVER,
      transformRequest: tileTransformRequest,
      center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
      zoom: 11,
    });
    mapRef.current = map;

    map.on('error', (e) => console.error('[MapLibre error]', e));
    map.on('style.load', () => console.log('[MapLibre] style loaded'));
    map.on('sourcedata', (e) => console.log('[MapLibre] sourcedata', e.sourceId, e.isSourceLoaded));
    map.on('tileerror', (e) => console.error('[MapLibre] tile error', e));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const rows = Array.isArray(stores) ? stores : [];
    const bounds = [];
    const markerDisplayOffsets = buildMarkerDisplayOffsets(rows);

    rows.forEach((store, storeIndex) => {
      if (!store) return;
      const lat = Number(store?.latitude);
      const lng = Number(store?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const markerKey = String(store.marker_key || store.slug || store.location_id || `${lat}:${lng}`);
      const markerIdentityKey = String(store.marker_key || store.slug || store.location_id || storeIndex);
      const markerOffset = markerDisplayOffsets.get(markerIdentityKey) || [0, 0];
      const highlighted = selectedKey
        ? markerKey === String(selectedKey)
        : store.is_primary_storefront === true;
      const el = makePinElement(store.workflow_mode || store.business_mode, highlighted);
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Preview ${store?.tenant_name || 'storefront'} at ${store?.location_name || store?.branch_label || 'location'}`);
      let closeTimer = null;
      let pointerInsidePopup = false;
      let focusInsidePopup = false;
      const popup = new maplibregl.Popup({
        anchor: 'bottom',
        offset: 18,
        closeButton: true,
        closeOnClick: true,
        maxWidth: '220px'
      });
      const clearCloseTimer = () => {
        if (closeTimer) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const closePopup = ({ restoreFocus = false } = {}) => {
        clearCloseTimer();
        pointerInsidePopup = false;
        focusInsidePopup = false;
        popup.remove();
        if (activePopupRef.current === popup) activePopupRef.current = null;
        if (restoreFocus && document.activeElement !== el) el.focus();
      };
      const popupNode = createStoreMarkerPreviewNode(store, {
        resolveAssetUrl: withAssetOrigin,
        onAction: typeof onPreviewAction === 'function'
          ? (selectedStore) => {
            closePopup();
            onPreviewAction(selectedStore);
          }
          : null
      });
      const isInsidePreviewSurface = (target) => target === el || el.contains(target) || popupNode.contains(target);
      popupNode.addEventListener('pointerenter', () => {
        pointerInsidePopup = true;
        clearCloseTimer();
      });
      popupNode.addEventListener('pointerleave', () => {
        pointerInsidePopup = false;
        if (!focusInsidePopup) {
          closeTimer = window.setTimeout(() => {
            if (!pointerInsidePopup && !focusInsidePopup) closePopup();
          }, 180);
        }
      });
      popupNode.addEventListener('focusin', () => {
        focusInsidePopup = true;
        clearCloseTimer();
      });
      popupNode.addEventListener('focusout', (event) => {
        focusInsidePopup = false;
        if (isInsidePreviewSurface(event.relatedTarget)) return;
        closeTimer = window.setTimeout(() => {
          if (!pointerInsidePopup && !focusInsidePopup) closePopup();
        }, 180);
      });
      popupNode.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closePopup({ restoreFocus: true });
        }
      });
      popup.setDOMContent(popupNode);
      if (typeof popup.on === 'function') {
        popup.on('close', () => {
          clearCloseTimer();
          if (activePopupRef.current === popup) activePopupRef.current = null;
        });
      }
      const openPopup = () => {
        clearCloseTimer();
        if (activePopupRef.current && activePopupRef.current !== popup) {
          activePopupRef.current.remove();
        }
        activePopupRef.current = popup;
        popup.setLngLat([lng, lat]).addTo(map);
      };
      const scheduleClose = (event) => {
        if (isInsidePreviewSurface(event?.relatedTarget)) {
          focusInsidePopup = popupNode.contains(event.relatedTarget);
          clearCloseTimer();
          return;
        }
        clearCloseTimer();
        closeTimer = window.setTimeout(() => {
          if (!pointerInsidePopup && !focusInsidePopup) closePopup();
        }, 180);
      };
      el.addEventListener('pointerenter', () => openPopup());
      el.addEventListener('pointerleave', scheduleClose);
      el.addEventListener('focus', () => openPopup());
      el.addEventListener('blur', scheduleClose);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPopup();
        }
        if (event.key === 'Escape') {
          closePopup();
        }
      });
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof onPreviewAction === 'function') {
          openPopup();
          return;
        }
        if (typeof onSelectStore === 'function') onSelectStore(store);
        openPopup();
      });
      const marker = new maplibregl.Marker({ element: el, offset: markerOffset })
        .setLngLat([lng, lat])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.push([lng, lat]);
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      const uLat = Number(userLocation.latitude);
      const uLng = Number(userLocation.longitude);
      if (Number.isFinite(uLat) && Number.isFinite(uLng)) {
        const el = makeUserLocationElement();
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([uLng, uLat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<strong>Your location</strong>'))
          .addTo(map);
        bounds.push([uLng, uLat]);
      }
    }

    if (bounds.length === 1) map.flyTo({ center: bounds[0], zoom: 15 });
    if (bounds.length > 1) {
      const lngs = bounds.map((b) => b[0]);
      const lats = bounds.map((b) => b[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 24, maxZoom: 14 }
      );
    }

    const closeActivePopupOnOutsideClick = (event) => {
      const target = event?.originalEvent?.target;
      const activePopup = activePopupRef.current;
      if (!activePopup || !target) return;
      const popupElement = typeof activePopup.getElement === 'function' ? activePopup.getElement() : null;
      const clickedPopup = popupElement?.contains(target);
      const clickedMarker = markersRef.current.some((marker) => {
        const markerElement = typeof marker.getElement === 'function' ? marker.getElement() : null;
        return markerElement?.contains(target);
      });
      if (!clickedPopup && !clickedMarker) {
        activePopup.remove();
        activePopupRef.current = null;
      }
    };

    map.on('click', closeActivePopupOnOutsideClick);

    return () => {
      map.off('click', closeActivePopupOnOutsideClick);
    };
  }, [stores, selectedKey, onSelectStore, userLocation]);

  return <div ref={ref} style={{ height: 360, border: '1px solid #d6e2e8', borderRadius: 14 }} />;
}

function DeliveryPinMap({ pin = null, onPinChange, disabled = false }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // useEffect(() => {
  //   if (!ref.current || mapRef.current) return;
  //   const map = new maplibregl.Map({
  //     container: ref.current,
  //     style: TILING_SERVER,
  //     transformRequest: tileTransformRequest,
  //     center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
  //     zoom: 13,
  //   });
  //   map.getCanvas().style.zIndex = '0';
  //   mapRef.current = map;
  //   return () => {
  //     map.remove();
  //     mapRef.current = null;
  //   };
  // }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (pin?.latitude != null && pin?.longitude != null) {
      const lat = Number(pin.latitude);
      const lng = Number(pin.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const el = makeUserLocationElement();
        markerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) });
      }
    }
  }, [pin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (disabled) return undefined;

    const handleClick = (event) => {
      const lat = Number(event?.lngLat?.lat);
      const lng = Number(event?.lngLat?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onPinChange?.({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6))
      });
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [disabled, onPinChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.resize(), 120);
    return () => clearTimeout(timer);
  }, [disabled]);

  return (
    <div style={{ position: 'relative', marginBottom: 10, width: '100%', maxWidth: 420, aspectRatio: '1 / 1', overflow: 'hidden', border: '1px solid #cbd5e1', borderRadius: 10, isolation: 'isolate', zIndex: 0 }}>
      <div ref={ref} style={{ height: '100%', width: '100%' }} />
      {disabled && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(255,255,255,.6)' }} />
      )}
    </div>
  );
}

function StoreCatalogEmptyState({ mode = 'setup_pending', searchQuery = '', onRefreshTenantPage }) {
  const normalizedMode = String(mode || 'setup_pending').trim().toLowerCase();
  const title = normalizedMode === 'search_on_empty'
    ? 'No items are available to search yet'
    : 'Storefront items are not set up yet';
  const description = normalizedMode === 'search_on_empty'
    ? `No catalog is published for this tenant yet, so search for "${searchQuery}" cannot return results.`
    : 'This tenant has not configured any storefront-visible items yet. Ask the tenant admin to enable items for storefront selling.';

  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid #cbd5e1',
        borderRadius: 14,
        background: 'linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)',
        padding: 16
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</div>
      <p style={{ margin: '8px 0 0 0', color: '#475569', fontSize: 14 }}>{description}</p>
      <div style={{ marginTop: 10, fontSize: 13, color: '#0f766e', fontWeight: 700 }}>
        Customer checkout will be available once at least one storefront item is enabled.
      </div>
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={onRefreshTenantPage}
          style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700 }}
        >
          Check Again
        </button>
      </div>
    </div>
  );
}

const STYLES = {
  colors: {
    brand: '#ea580c',
    brandDark: '#c2410c',
    brandLight: '#fff7ed',
    teal: '#0f766e',
    tealLight: '#ecfeff',
    amber: '#f59e0b',
    dark: '#0f172a',
    text: '#334155',
    muted: '#64748b',
    border: '#e2e8f0',
    bg: '#f8fafc'
  },
  radius: { card: '24px', input: '14px', button: '12px' },
  shadow: { sm: '0 4px 12px rgba(15,23,42,0.04)', md: '0 12px 34px rgba(15,23,42,0.08)', lg: '0 24px 58px rgba(15,23,42,0.12)' },
  fonts: {
    body: '"Open Sans", "Segoe UI", system-ui, sans-serif',
    heading: '"Inter", "Open Sans", "Segoe UI", system-ui, sans-serif',
    main: '"Open Sans", "Segoe UI", system-ui, sans-serif'
  }
};

const Badge = ({ children, background, color, border, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '6px 12px',
    borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
    textTransform: 'uppercase', background: background || STYLES.colors.tealLight,
    color: color || STYLES.colors.teal, border: `1px solid ${border || 'transparent'}`,
    ...style
  }}>
    {children}
  </span>
);

const PrimaryButton = ({ children, onClick, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: disabled ? STYLES.colors.border : `linear-gradient(135deg, ${STYLES.colors.brand}, ${STYLES.colors.brandDark})`,
      color: '#fff', border: 'none', borderRadius: STYLES.radius.button,
      padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 10px 24px rgba(234,88,12,0.2)', transition: 'all 0.2s ease',
      ...style
    }}
  >
    {children}
  </button>
);

const GhostButton = ({ children, onClick, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: '#fff', color: STYLES.colors.dark, border: `1px solid ${STYLES.colors.border}`,
      borderRadius: STYLES.radius.button, padding: '12px 24px', fontSize: 14, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease',
      ...style
    }}
  >
    {children}
  </button>
);

const HERO_CANVAS_MAX_WIDTH = 1320;
const DGFY_HEADER_LOGO_URL = dgfyHeaderLogo;
const DGFY_LOGO_ICON_URL = dgfySymbolLogo;

const StorefrontHeroShell = ({
  fullBleed = false,
  sectionStyle = {},
  backgroundChildren = null,
  children,
  outerStyle = {}
}) => (
  <div
    style={{
      position: 'relative',
      ...(fullBleed
        ? { width: '100vw', marginLeft: 'calc(50% - 50vw)' }
        : { width: '100%' }),
      ...outerStyle
    }}
  >
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...sectionStyle
      }}
    >
      {backgroundChildren}
      {children}
    </section>
  </div>
);

const StorefrontShareQr = ({
  storeUrl,
  isMobileViewport,
  accentColor = '#f97316'
}) => {
  const [qrImageUrl, setQrImageUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (!storeUrl) {
      setQrImageUrl('');
      return undefined;
    }
    QRCode.toDataURL(storeUrl, {
      margin: 1,
      width: isMobileViewport ? 88 : 112,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((url) => {
        if (active) setQrImageUrl(url);
      })
      .catch(() => {
        if (active) setQrImageUrl('');
      });
    return () => {
      active = false;
    };
  }, [isMobileViewport, storeUrl]);

  const copyStoreUrl = useCallback(async () => {
    if (!storeUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(storeUrl);
        toast.success('Storefront link copied.');
        return;
      }
      throw new Error('Clipboard unavailable');
    } catch {
      toast.info(storeUrl);
    }
  }, [storeUrl]);

  const shareStoreUrl = useCallback(async () => {
    if (!storeUrl) return;
    const payload = {
      title: 'Storefront',
      text: 'Open this storefront',
      url: storeUrl
    };
    try {
      if (navigator?.share) {
        await navigator.share(payload);
        return;
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(storeUrl);
        toast.success('Storefront link copied.');
        return;
      }
      throw new Error('Share unavailable');
    } catch {
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(storeUrl);
          toast.success('Storefront link copied.');
          return;
        } catch {
          // Fall through.
        }
      }
      toast.info(storeUrl);
    }
  }, [storeUrl]);

  if (!qrImageUrl) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobileViewport ? 48 : 22,
        left: isMobileViewport ? '50%' : 'auto',
        right: isMobileViewport ? 'auto' : `max(41px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 41px))`,
        transform: isMobileViewport ? 'translateX(-50%)' : 'none',
        zIndex: 14,
        display: 'grid',
        gap: 8
      }}
    >
      <button
        type="button"
        onClick={copyStoreUrl}
        style={{
          position: 'relative',
          width: isMobileViewport ? 90 : 116,
          height: isMobileViewport ? 90 : 116,
          borderRadius: 22,
          border: '1px solid rgba(255,255,255,0.24)',
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 18px 42px rgba(15, 23, 42, 0.18)',
          backdropFilter: 'blur(10px)',
          padding: 10,
          cursor: 'pointer'
        }}
        aria-label="Copy storefront link"
        title="Copy storefront link"
      >
        <img
          src={qrImageUrl}
          alt="Storefront QR code"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 14 }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              width: isMobileViewport ? 24 : 30,
              height: isMobileViewport ? 24 : 30,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(15,23,42,0.08)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 8px 16px rgba(15, 23, 42, 0.12)'
            }}
          >
            <img
              src={DGFY_LOGO_ICON_URL}
              alt=""
              style={{ width: isMobileViewport ? 16 : 20, height: isMobileViewport ? 16 : 20, objectFit: 'contain', opacity: 0.96 }}
            />
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={shareStoreUrl}
        style={{
          position: 'absolute',
          right: -6,
          bottom: -6,
          width: isMobileViewport ? 32 : 36,
          height: isMobileViewport ? 32 : 36,
          borderRadius: 999,
          border: 'none',
          background: accentColor,
          color: '#ffffff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.24)',
          cursor: 'pointer'
        }}
        aria-label="Share storefront"
        title="Share storefront"
      >
        <Share2 size={16} />
      </button>
    </div>
  );
};

const DefaultStorefrontHero = ({
  modeAdapter,
  selectedStore,
  isMobileViewport,
  handleShareAction,
  setIsCheckoutOpen
}) => {
  const heroTheme = modeAdapter.heroTheme || {};
  return (
    <StorefrontHeroShell
      sectionStyle={{
        background: STYLES.colors.dark,
        borderRadius: STYLES.radius.card,
        padding: isMobileViewport ? 24 : 48,
        marginBottom: 24,
        color: '#fff',
        boxShadow: STYLES.shadow.lg
      }}
      backgroundChildren={<div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', background: `linear-gradient(225deg, ${STYLES.colors.brand}22, transparent)`, pointerEvents: 'none' }} />}
    >
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 800 }}>
        <Badge style={{ marginBottom: 16 }}>{modeAdapter.heroEyebrow}</Badge>
        <h1 style={{ margin: 0, fontSize: isMobileViewport ? 32 : 56, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.04em', fontFamily: heroTheme.displayFont }}>{selectedStore?.tenant_name || 'Loading Storefront...'}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          {withAssetOrigin(selectedStore?.storefront_profile_image_url) && (
            <img src={withAssetOrigin(selectedStore.storefront_profile_image_url)} alt={`${selectedStore?.tenant_name || 'Storefront'} profile`} style={{ width: 44, height: 44, borderRadius: 999, objectFit: 'cover', border: '2px solid rgba(255,255,255,.8)' }} />
          )}
          {withAssetOrigin(selectedStore?.storefront_cover_image_url) && (
            <img src={withAssetOrigin(selectedStore.storefront_cover_image_url)} alt={`${selectedStore?.tenant_name || 'Storefront'} cover`} style={{ width: 96, height: 44, borderRadius: 12, objectFit: 'cover', border: '2px solid rgba(255,255,255,.45)' }} />
          )}
        </div>
        <p style={{ margin: '16px 0 0 0', fontSize: isMobileViewport ? 16 : 20, opacity: 0.8, lineHeight: 1.5, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
        <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <PrimaryButton onClick={() => setIsCheckoutOpen(true)}>{modeAdapter.primaryActionLabel}</PrimaryButton>
          <GhostButton style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }} onClick={handleShareAction}>Share Storefront</GhostButton>
        </div>
      </div>
    </StorefrontHeroShell>
  );
};

const buildFnbFallbackReasons = ({ fnbViewModel = null, categories = [] } = {}) => {
  const reasons = [];
  if (Array.isArray(categories) && categories.length > 0) {
    reasons.push(...categories.slice(0, 2));
  }
  const menuSections = Array.isArray(fnbViewModel?.menuSections) ? fnbViewModel.menuSections : [];
  menuSections.slice(0, 2).forEach((section) => {
    const count = Number(section?.items?.length || 0);
    if (count > 0) {
      reasons.push(`${section.sectionLabel || 'Menu'} favorites (${count})`);
    }
  });
  const beverageCount = Number(fnbViewModel?.beverageCount || 0);
  if (beverageCount > 0) {
    reasons.push(`${beverageCount} drinks ready to serve`);
  }
  const readyNowCount = Number(fnbViewModel?.readyNowCount || 0);
  if (readyNowCount > 0) {
    reasons.push(`${readyNowCount} items available now`);
  }
  return [...new Set(reasons.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, 4);
};

const FnbHero = ({
  modeAdapter,
  heroSectionModel,
  fnbViewModel,
  selectedStore,
  isMobileViewport,
  cartCount,
  setIsCheckoutOpen,
  goDiscovery,
  hasMultipleStoreBranches,
  hasSelectedBranchFromMenu,
  selectedLocationId,
  handleBranchMenuSelection,
  storeLocations,
  catalogSearch,
  setCatalogSearch,
  isBrandingImageBlocked,
  markBrandingImageError,
  selectedLocation,
  openStorefrontActionLink,
  openTrackPanel,
  openAccountPanel
}) => {
  const heroTheme = modeAdapter.heroTheme || {};
  const addressText = String(heroSectionModel.addressLine || heroSectionModel.locationLabel || '').trim();
  const galleryImages = Array.isArray(heroSectionModel.galleryPreview) ? heroSectionModel.galleryPreview.filter(Boolean) : [];
  const aboutText = String(heroSectionModel.aboutText || '').trim();
  const hasAboutToggle = aboutText.length > 180;
  const hasAddress = Boolean(addressText);
  const hasMapData = Number.isFinite(Number(selectedLocation?.latitude ?? selectedStore?.latitude))
    && Number.isFinite(Number(selectedLocation?.longitude ?? selectedStore?.longitude));
  const whyChooseUs = Array.isArray(heroSectionModel.whyChooseUs) && heroSectionModel.whyChooseUs.length > 0
    ? heroSectionModel.whyChooseUs
    : buildFnbFallbackReasons({
        fnbViewModel,
        categories: [heroSectionModel.primaryCategoryLabel, heroSectionModel.locationSummary]
      });
  const hasWhyChooseUs = whyChooseUs.length > 0;
  const hasContactRows = heroSectionModel.contactRows.length > 0
    || Boolean(heroSectionModel.facebookLink)
    || Boolean(heroSectionModel.hours)
    || hasAddress;
  const desktopColumns = hasWhyChooseUs ? '1fr 1.45fr 1fr' : '1fr 1.45fr';
  const searchPlaceholder = modeAdapter.catalogSearchPlaceholder || 'Search meals, drinks, desserts, or combo items...';
  const orderLabel = cartCount > 0 ? 'Open Cart' : (heroSectionModel.actions?.orderLabel || 'Browse Menu');
  const profileImageKey = `hero-profile:${selectedStore.slug}`;
  const mapStores = storeLocations.length > 0
    ? storeLocations.map((location) => ({
        ...location,
        tenant_name: selectedStore?.tenant_name
      }))
    : [selectedStore];
  const mapSelectedKey = selectedLocationId != null ? `loc-${selectedLocationId}` : `tenant-${selectedStore?.tenant_id || selectedStore?.slug || 'store'}`;
  const storefrontShareUrl = useMemo(() => {
    if (!selectedStore?.slug) return '';
    return buildPublicStorefrontUrl(selectedStore.slug);
  }, [selectedStore?.slug]);

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 0,
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 6px 18px rgba(15,23,42,.05)',
        marginBottom: 0,
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)'
      }}>
        <div style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          padding: isMobileViewport ? '12px 16px' : '14px 24px',
          display: 'flex',
          alignItems: isMobileViewport ? 'stretch' : 'center',
          gap: 16,
          flexDirection: isMobileViewport ? 'column' : 'row'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: isMobileViewport ? '0 0 auto' : '0 1 180px' }}>
            <button type="button" onClick={goDiscovery} style={{ border: 'none', background: '#f8fafc', color: STYLES.colors.dark, width: 44, height: 44, borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img
                src={DGFY_HEADER_LOGO_URL}
                alt="DGFY logo"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #dbe5ee', borderRadius: 999, background: '#f8fafc', padding: isMobileViewport ? '0 10px 0 16px' : '0 10px 0 14px', minHeight: isMobileViewport ? 46 : 40, width: '100%', maxWidth: isMobileViewport ? '100%' : 420, flex: isMobileViewport ? '0 0 auto' : '0 1 420px', minWidth: isMobileViewport ? 0 : 260, margin: isMobileViewport ? 0 : '0 auto' }}>
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={searchPlaceholder}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: STYLES.colors.text, fontFamily: heroTheme.bodyFont }}
            />
            <span style={{ width: isMobileViewport ? 32 : 28, height: isMobileViewport ? 32 : 28, borderRadius: 999, background: heroTheme.accent || STYLES.colors.brand, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Search size={16} />
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', alignItems: 'center', gap: 18, flexWrap: 'nowrap', minWidth: 0, whiteSpace: 'nowrap', marginLeft: isMobileViewport ? 0 : 'auto', flex: '0 1 auto' }}>
            {hasMultipleStoreBranches && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: hasSelectedBranchFromMenu ? 6 : 8, color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: heroTheme.bodyFont, minWidth: 0, maxWidth: isMobileViewport ? 196 : 236, flex: '0 1 236px' }}>
                <MapPin size={16} />
                {!hasSelectedBranchFromMenu && <span>Branch:</span>}
                <StorefrontDropdown
                  value={selectedLocationId ?? ''}
                  onChange={handleBranchMenuSelection}
                  options={storeLocations.map((location) => ({
                    value: location.location_id,
                    label: location.name || location.address_line || `Branch ${location.location_id}`
                  }))}
                  triggerStyle={{
                    minHeight: 34,
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    padding: '4px 34px 4px 2px',
                    fontFamily: heroTheme.bodyFont
                  }}
                  containerStyle={{ minWidth: 0, flex: '1 1 auto' }}
                  menuStyle={{ minWidth: 240 }}
                  selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: heroTheme.bodyFont }}
            >
              <ShoppingBag size={16} />
              Shop
            </button>
            <button
              type="button"
              onClick={openTrackPanel}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: heroTheme.bodyFont }}
            >
              <FileText size={16} />
              Track
            </button>
            <button
              type="button"
              onClick={openAccountPanel}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: heroTheme.bodyFont }}
            >
              <HeartHandshake size={16} />
              Account
            </button>
          </div>
        </div>
      </div>

      <StorefrontHeroShell
        fullBleed
        sectionStyle={{
          minHeight: isMobileViewport ? 290 : 316,
          borderRadius: 0,
          overflow: 'visible',
          background: heroSectionModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
            ? `url(${heroSectionModel.coverImageUrl}) center/cover`
            : `linear-gradient(135deg, ${heroTheme.surface || '#172033'} 0%, #22324b 50%, #40516c 100%)`,
          boxShadow: STYLES.shadow.lg
        }}
        backgroundChildren={
          <>
            {heroSectionModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`) && (
              <img
                src={heroSectionModel.coverImageUrl}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => markBrandingImageError(`hero-cover:${selectedStore.slug}`)}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.72) 76%, rgba(15,23,42,0.92) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,18,0.68) 0%, rgba(6,10,18,0.36) 46%, rgba(6,10,18,0.1) 100%)' }} />
          </>
        }
      >
        <StorefrontShareQr
          storeUrl={storefrontShareUrl}
          isMobileViewport={isMobileViewport}
          accentColor={heroTheme.accent || '#f97316'}
        />
        <div style={{
          position: 'absolute',
          left: isMobileViewport ? 20 : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          right: isMobileViewport ? 20 : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? -45 : -25,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: isMobileViewport ? 16 : 28,
          paddingLeft: isMobileViewport ? 126 : 218
        }}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 700, minWidth: 0, flex: 1, marginBottom: isMobileViewport ? 8 : 35 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff" style={{ fontFamily: heroTheme.bodyFont }}>{heroSectionModel.statusLabel}</Badge>
              {Number.isFinite(Number(fnbViewModel.startingPrice)) && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: heroTheme.bodyFont }}>
                  Starts at {money(fnbViewModel.startingPrice)}
                </span>
              )}
              {heroSectionModel.hours && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', fontFamily: heroTheme.bodyFont }}>{heroSectionModel.hours}</span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
              <h1 style={{ margin: 0, color: '#fff', fontSize: isMobileViewport ? 38 : 50, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: heroTheme.displayFont }}>{heroSectionModel.name}</h1>
              {heroSectionModel.tagline ? (
                <p style={{ margin: 0, color: '#fbbf24', fontSize: isMobileViewport ? 18 : 20, fontWeight: 700, lineHeight: 1.3, fontFamily: heroTheme.bodyFont }}>{heroSectionModel.tagline}</p>
              ) : (
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95, marginBottom: 6, fontFamily: heroTheme.bodyFont }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={16} fill="#fbbf24" color="#fbbf24" />{heroSectionModel.ratingLabel || 'Fresh menu'}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span>{heroSectionModel.modeLabel}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={16} />{heroSectionModel.locationLabel}</span>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexDirection: isMobileViewport ? 'column' : 'row',
            flexShrink: 0,
            marginLeft: 'auto',
            marginBottom: isMobileViewport ? 8 : 35
          }}>
            {heroSectionModel.actions?.canCall && (
              <GhostButton onClick={() => openStorefrontActionLink(heroSectionModel.actions.callHref)} style={{ minWidth: isMobileViewport ? '100%' : 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: heroTheme.bodyFont }}>
                <Phone size={18} />
                Call
              </GhostButton>
            )}
            <PrimaryButton onClick={() => {
              if (cartCount > 0) {
                setIsCheckoutOpen(true);
                return;
              }
              document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }} style={{ minWidth: isMobileViewport ? '100%' : 150, background: heroTheme.accent || '#f97316', color: '#000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: '0 10px 25px rgba(249,115,22,0.3)', border: 'none', fontWeight: 900, fontFamily: heroTheme.bodyFont }}>
              <MousePointer2 size={18} />
              {orderLabel}
            </PrimaryButton>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          left: isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? '-45px' : '-25px',
          width: isMobileViewport ? 110 : 190,
          height: isMobileViewport ? 110 : 190,
          borderRadius: '50%',
          background: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {heroSectionModel.profileImageUrl && !isBrandingImageBlocked(profileImageKey) ? (
            <img
              src={heroSectionModel.profileImageUrl}
              alt={`${heroSectionModel.name} profile`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => markBrandingImageError(profileImageKey)}
            />
          ) : (
            <div style={{ fontSize: isMobileViewport ? 52 : 66, fontWeight: 900, color: heroTheme.accentDark || STYLES.colors.brandDark, fontFamily: heroTheme.displayFont }}>{heroSectionModel.name.charAt(0)}</div>
          )}
        </div>
      </StorefrontHeroShell>

      <div style={{
        maxWidth: 1180,
        margin: isMobileViewport ? '40px 16px 32px' : '70px auto 40px',
        padding: isMobileViewport ? 18 : 24,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 18,
        boxShadow: '0 14px 35px rgba(15, 23, 42, 0.08)',
        display: 'grid',
        gridTemplateColumns: isMobileViewport ? '1fr' : desktopColumns,
        gap: isMobileViewport ? 24 : 24
      }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: heroTheme.bodyFont }}>Overview</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: '#111827',
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: hasAboutToggle ? 3 : 'unset',
              WebkitBoxOrient: 'vertical',
              overflow: hasAboutToggle ? 'hidden' : 'visible',
              fontFamily: heroTheme.bodyFont
            }}>
              {aboutText || 'This menu storefront is connected to live SKUpervisor product data and the food and beverage backend.'}
            </p>
          </div>

          {galleryImages.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: isMobileViewport ? 'flex' : 'grid', gridTemplateColumns: isMobileViewport ? undefined : 'repeat(4, 1fr)', gap: 8, marginTop: 2, overflowX: isMobileViewport ? 'auto' : 'visible', paddingBottom: isMobileViewport ? 4 : 0 }}>
                {galleryImages.slice(0, 4).map((url, index) => (
                  <div key={`${url}-${index}`} style={{ width: isMobileViewport ? 84 : '100%', minWidth: isMobileViewport ? 84 : 0, height: 56, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#e2e8f0', flexShrink: 0 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, paddingLeft: isMobileViewport ? 0 : 24, borderLeft: isMobileViewport ? 'none' : '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: heroTheme.bodyFont }}>Contact & Location</div>
          <div style={{ display: 'grid', gridTemplateColumns: hasMapData && !isMobileViewport ? '0.9fr 1.1fr' : '1fr', gap: 18, alignItems: 'start' }}>
            {hasContactRows && (
              <div style={{ display: 'grid', gap: 10 }}>
                {heroSectionModel.contactRows.map((row) => {
                  const icon = row.label === 'Call' || row.label === 'Phone'
                    ? <Phone size={16} />
                    : row.label === 'Message'
                      ? <MessageCircle size={16} />
                      : row.label === 'Facebook'
                        ? <MessageCircle size={16} />
                        : row.label === 'Email'
                          ? <Mail size={16} />
                          : <Clock3 size={16} />;
                  const content = (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827', fontFamily: heroTheme.bodyFont }}>
                      <div style={{ color: heroTheme.accentDark || STYLES.colors.brandDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{row.value}</div>
                      </div>
                    </div>
                  );
                  return row.href ? (
                    <button key={row.label} type="button" onClick={() => openStorefrontActionLink(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      {content}
                    </button>
                  ) : (
                    <div key={row.label}>{content}</div>
                  );
                })}

                {heroSectionModel.hours && !heroSectionModel.contactRows.some((row) => row.label === 'Hours') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827', fontFamily: heroTheme.bodyFont }}>
                    <div style={{ color: STYLES.colors.teal, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock3 size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{heroSectionModel.hours}</div>
                    </div>
                  </div>
                )}

                {hasAddress && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#111827', fontFamily: heroTheme.bodyFont }}>
                      <div style={{ color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{addressText}</div>
                      </div>
                    </div>
                    {selectedStore?.latitude && selectedStore?.longitude && (
                      <button type="button" onClick={() => openStorefrontActionLink(buildGoogleMapsDirectionsUrl({ latitude: selectedLocation?.latitude ?? selectedStore?.latitude, longitude: selectedLocation?.longitude ?? selectedStore?.longitude, addressLine: addressText }))} style={{ padding: 0, border: 'none', background: 'transparent', color: heroTheme.accent || STYLES.colors.brand, fontSize: 12, fontWeight: 800, cursor: 'pointer', justifySelf: 'start', fontFamily: heroTheme.bodyFont }}>
                        Get directions
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasMapData && (
              <div style={{ width: '100%', height: 150, borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
                <StoresMap stores={mapStores} selectedKey={mapSelectedKey} onSelectStore={() => { }} />
              </div>
            )}
          </div>
        </div>

        {hasWhyChooseUs && (
          <div style={{ display: 'grid', gap: 12, paddingLeft: isMobileViewport ? 0 : 24, borderLeft: isMobileViewport ? 'none' : '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: heroTheme.bodyFont }}>Why Choose Us</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {whyChooseUs.map((item, index) => (
                <div key={`${item}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#111827', lineHeight: 1.4, fontFamily: heroTheme.bodyFont }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: heroTheme.accentSoft || '#fff7ed', color: heroTheme.accent || '#f97316', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={14} />
                  </div>
                  <div>{item}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const FnbProductCard = ({
  item,
  imageUrl,
  available,
  modeAdapter,
  addToCart,
  isMobileViewport
}) => {
  const heroTheme = modeAdapter.heroTheme || {};
  const sectionVisualMeta = item.sectionVisualMeta || {};
  const accent = heroTheme.accent || '#c96a2b';
  const accentSoft = sectionVisualMeta.accentSoft || heroTheme.accentSoft || '#fff7ed';
  const accentDeep = heroTheme.accentDark || '#7c2d12';
  const cardSurface = '#ffffff';
  const cardSurfaceInset = heroTheme.surfaceMuted || '#fff8f0';
  const cardBorder = heroTheme.borderSoft || '#edd4bc';
  const cardTextPrimary = heroTheme.textPrimary || '#2f1f16';
  const cardTextMuted = heroTheme.textMuted || '#7c6757';
  const buttonTextOnAccent = heroTheme.buttonTextOnAccent || '#fffdf9';
  const CategoryIcon = FNB_CATEGORY_ICON_MAP[sectionVisualMeta.iconToken] || Sparkles;
  const [isHovered, setIsHovered] = useState(false);
  const [isDetailsHovered, setIsDetailsHovered] = useState(false);
  const [isCartHovered, setIsCartHovered] = useState(false);
  const detailsCopy = item.descriptionPreview || 'Menu item available in this storefront.';
  const cardUiFont = heroTheme.bodyFont || "'Trebuchet MS', 'Segoe UI', sans-serif";
  const cardTitleFont = heroTheme.menuTitleFont || heroTheme.displayFont || "'Palatino Linotype', 'Book Antiqua', Palatino, serif";
  const cardTitleFontSize = isMobileViewport ? 19 : 22;
  const imageHeight = isMobileViewport ? 190 : 214;
  const actionHeight = isMobileViewport ? 44 : 46;
  const cartButtonWidth = isMobileViewport ? 62 : 70;
  const availabilityTone = item.availabilityMeta?.tone || (available ? 'ready' : 'sold_out');
  const availabilityColor = availabilityTone === 'sold_out' ? '#be123c' : availabilityTone === 'limited' ? '#b45309' : '#047857';
  const descriptionLineClamp = isMobileViewport ? 2 : 3;

  return (
    <article
      style={{
        background: cardSurface,
        borderRadius: 28,
        padding: 0,
        boxShadow: isHovered ? '0 22px 44px rgba(73, 38, 20, 0.14)' : '0 14px 32px rgba(73, 38, 20, 0.09)',
        border: `1px solid ${cardBorder}`,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        transform: isHovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ position: 'relative', width: '100%', height: imageHeight, overflow: 'hidden', borderRadius: '0 0 22px 22px' }}>
        {imageUrl ? (
          <img src={imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            color: accentDeep,
            fontWeight: 800,
            fontFamily: cardUiFont,
            background: `radial-gradient(circle at top, ${accentSoft} 0%, ${cardSurfaceInset} 58%, #f8e3cf 100%)`
          }}>
            <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background: '#ffffffd9',
                color: accent,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 24px rgba(73,38,20,0.08)'
              }}>
                <CategoryIcon size={28} />
              </div>
              <div style={{ fontSize: 14, letterSpacing: '-0.01em' }}>{item.sectionLabel || item.productKind || 'Menu Item'}</div>
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(35,23,18,0.02) 0%, rgba(35,23,18,0.08) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0) 44%, rgba(32,20,15,0.18) 100%)', pointerEvents: 'none' }} />
        <div style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          background: accent,
          color: buttonTextOnAccent,
          padding: isMobileViewport ? '8px 14px' : '9px 16px',
          borderRadius: 999,
          fontSize: isMobileViewport ? 14 : 15,
          fontWeight: 900,
          boxShadow: isHovered ? '0 12px 26px rgba(217,119,6,0.32)' : '0 10px 22px rgba(217,119,6,0.24)',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.2s ease',
          fontFamily: cardUiFont,
          lineHeight: 1
        }}>
          {money(item.default_sale_price ?? 0).replace('PHP ', '?')}
        </div>
      </div>
      <div style={{ padding: isMobileViewport ? '15px 14px 14px' : '18px 18px 16px', flex: 1, display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: cardTitleFontSize, fontWeight: 800, lineHeight: 1.1, color: cardTextPrimary, fontFamily: cardTitleFont, letterSpacing: '-0.025em' }}>{item.name}</h4>
          <p style={{
            margin: 0,
            fontSize: isMobileViewport ? 13 : 14,
            lineHeight: 1.5,
            color: cardTextMuted,
            fontFamily: cardUiFont,
            display: '-webkit-box',
            WebkitLineClamp: descriptionLineClamp,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {detailsCopy}
          </p>
          {Array.isArray(item.allergens) && item.allergens.length > 0 && (
            <div style={{ fontSize: 12, color: cardTextMuted, fontWeight: 700, fontFamily: cardUiFont }}>
              Allergens: {item.allergens.join(', ')}
            </div>
          )}
        </div>
        <div style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 12,
          alignItems: 'center'
        }}>
          <button
            type="button"
            onClick={() => toast('Product details page is the next F&B storefront step.')}
            onMouseEnter={() => setIsDetailsHovered(true)}
            onMouseLeave={() => setIsDetailsHovered(false)}
            style={{
              minHeight: actionHeight,
              height: actionHeight,
              borderRadius: 18,
              border: `1px solid ${cardBorder}`,
              background: cardSurfaceInset,
              fontSize: isMobileViewport ? 14 : 15,
              fontWeight: 700,
              color: cardTextMuted,
              cursor: 'pointer',
              fontFamily: cardUiFont,
              transform: isDetailsHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 0.2s ease',
              padding: '0 18px',
              boxShadow: isDetailsHovered ? '0 10px 22px rgba(73,38,20,0.08)' : 'none'
            }}
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => addToCart(item)}
            disabled={!available}
            onMouseEnter={() => available && setIsCartHovered(true)}
            onMouseLeave={() => setIsCartHovered(false)}
            style={{
              width: cartButtonWidth,
              minHeight: actionHeight,
              height: actionHeight,
              borderRadius: 18,
              border: 'none',
              background: available ? accent : '#e5e7eb',
              color: buttonTextOnAccent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: available ? 'pointer' : 'not-allowed',
              boxShadow: available ? (isCartHovered ? '0 12px 26px rgba(217,119,6,0.28)' : '0 10px 20px rgba(217,119,6,0.22)') : 'none',
              transform: available && isCartHovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'all 0.2s ease',
              padding: '0 14px',
              fontFamily: cardUiFont,
              fontSize: 14,
              fontWeight: 800
            }}
          >
            <span style={{ position: 'relative', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCart size={20} strokeWidth={2.2} />
              <span style={{
                position: 'absolute',
                top: -3,
                right: -4,
                width: 14,
                height: 14,
                borderRadius: 999,
                background: '#ffffff',
                color: available ? '#f59e0b' : '#94a3b8',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: available ? '0 2px 8px rgba(255,255,255,0.45)' : 'none'
              }}>
                <Plus size={10} strokeWidth={3} />
              </span>
            </span>
          </button>
        </div>
        {!available && (
          <div style={{ fontSize: 12, fontWeight: 700, color: '#be123c', fontFamily: cardUiFont }}>
            {item.availabilityMeta?.label || 'Currently unavailable'}
          </div>
        )}
      </div>
    </article>
  );
};

const SimpleProductCard = ({
  item,
  imageUrl,
  available,
  modeAdapter,
  addToCart
}) => {
  const heroTheme = modeAdapter.heroTheme || {};
  const accentDark = heroTheme.accentDark || '#134e4a';
  const accentSoft = heroTheme.accentSoft || '#ecfeff';
  const categoryLabel = item.folder_name || item.category || 'Product';
  const availabilityLabel = item?.inventory_display?.label || (available ? 'Available' : 'Not available');

  return (
    <article style={{
      background: '#fff',
      borderRadius: 18,
      border: '1px solid #dbe5ee',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 12px 26px rgba(15, 23, 42, 0.06)'
    }}>
      <div style={{ width: '100%', height: 184, background: '#f8fafc', position: 'relative', overflow: 'hidden' }}>
        {imageUrl ? (
          <img src={imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 13, fontWeight: 700 }}>
            No image yet
          </div>
        )}
        <div style={{ position: 'absolute', top: 10, left: 10 }}>
          <Badge background={accentSoft} color={accentDark} border="#bfe8e4">{categoryLabel}</Badge>
        </div>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 10, flex: 1 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: '#0f172a' }}>{item.name}</h4>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#475569', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description || 'Simple mode product ready for quick ordering.'}
          </p>
        </div>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <strong style={{ fontSize: 19, color: accentDark }}>{money(item.default_sale_price ?? 0)}</strong>
            <span style={{ fontSize: 12, fontWeight: 700, color: available ? '#047857' : '#be123c' }}>{availabilityLabel}</span>
          </div>
          <PrimaryButton
            style={{ minHeight: 40, padding: '8px 12px' }}
            onClick={() => addToCart(item)}
            disabled={!available}
          >
            {available ? 'Add to Order' : 'Unavailable'}
          </PrimaryButton>
        </div>
      </div>
    </article>
  );
};

const FNB_CATEGORY_ICON_MAP = Object.freeze({
  coffee: Coffee,
  drink: CupSoda,
  dessert: Sparkles,
  burger: Sandwich,
  chicken: Drumstick,
  pizza: Pizza,
  seafood: Fish,
  meal: UtensilsCrossed,
  snack: Soup,
  menu: Sparkles
});

const ServicesHero = ({
  serviceHeroModel,
  selectedStore,
  isMobileViewport,
  hasMultipleStoreBranches,
  hasSelectedBranchFromMenu,
  selectedLocationId,
  handleBranchMenuSelection,
  storeLocations,
  catalogSearch,
  setCatalogSearch,
  goDiscovery,
  hasServiceCart,
  goStoreBookingPage,
  cartCount,
  modeAdapter,
  isBrandingImageBlocked,
  markBrandingImageError,
  selectedLocation,
  isAboutExpanded,
  setIsAboutExpanded,
  isServiceGalleryExpanded,
  setIsServiceGalleryExpanded,
  openStorefrontActionLink
}) => {
  const addressText = String(serviceHeroModel.addressLine || serviceHeroModel.locationLabel || '').trim();
  const galleryImages = Array.isArray(serviceHeroModel.galleryImages) ? serviceHeroModel.galleryImages.filter(Boolean) : [];
  const previewImages = isServiceGalleryExpanded ? galleryImages : galleryImages.slice(0, 4);
  const aboutText = String(serviceHeroModel.aboutText || '').trim();
  const hasAboutToggle = aboutText.length > 180;
  const hasAddress = Boolean(addressText);
  const hasMapData = Number.isFinite(Number(selectedLocation?.latitude ?? selectedStore?.latitude))
    && Number.isFinite(Number(selectedLocation?.longitude ?? selectedStore?.longitude));
  const hasWhyChooseUs = Array.isArray(serviceHeroModel.whyChooseUs) && serviceHeroModel.whyChooseUs.length > 0;
  const hasContactRows = serviceHeroModel.contactRows.length > 0
    || Boolean(serviceHeroModel.facebookLink)
    || Boolean(serviceHeroModel.hours)
    || hasAddress;
  const desktopColumns = hasWhyChooseUs ? '1fr 1.45fr 1fr' : '1fr 1.45fr';
  const servicesPrimary = modeAdapter?.heroTheme?.accent || '#0f766e';
  const servicesPrimaryDark = modeAdapter?.heroTheme?.accentDark || '#134e4a';
  const servicesPrimarySoft = modeAdapter?.heroTheme?.accentSoft || '#ecfeff';
  const servicesBodyFont = modeAdapter?.heroTheme?.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const servicesDisplayFont = modeAdapter?.heroTheme?.displayFont || servicesBodyFont;
  const servicesHighlight = '#f59e0b';
  const servicesPrimaryShadow = 'rgba(15,118,110,0.24)';
  const storefrontShareUrl = useMemo(() => {
    if (!selectedStore?.slug) return '';
    return buildPublicStorefrontUrl(selectedStore.slug);
  }, [selectedStore?.slug]);

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 0,
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 6px 18px rgba(15,23,42,.05)',
        marginBottom: 0,
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)'
      }}>
        <div style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          padding: isMobileViewport ? '12px 16px' : '14px 24px',
          display: 'flex',
          alignItems: isMobileViewport ? 'stretch' : 'center',
          gap: 16,
          flexDirection: isMobileViewport ? 'column' : 'row'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: isMobileViewport ? '0 0 auto' : '0 1 180px' }}>
            <button type="button" onClick={goDiscovery} style={{ border: 'none', background: '#f8fafc', color: STYLES.colors.dark, width: 44, height: 44, borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img
                src={DGFY_HEADER_LOGO_URL}
                alt="DGFY logo"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #dbe5ee', borderRadius: 999, background: '#f8fafc', padding: isMobileViewport ? '0 10px 0 16px' : '0 10px 0 14px', minHeight: isMobileViewport ? 46 : 40, width: '100%', maxWidth: isMobileViewport ? '100%' : 420, flex: isMobileViewport ? '0 0 auto' : '0 1 420px', minWidth: isMobileViewport ? 0 : 260, margin: isMobileViewport ? 0 : '0 auto' }}>
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Search Products or Services"
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: STYLES.colors.text }}
            />
            <span style={{ width: isMobileViewport ? 32 : 28, height: isMobileViewport ? 32 : 28, borderRadius: 999, background: STYLES.colors.brand, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Search size={16} />
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', alignItems: 'center', gap: 18, flexWrap: 'nowrap', minWidth: 0, whiteSpace: 'nowrap', marginLeft: isMobileViewport ? 0 : 'auto', flex: '0 1 auto' }}>
            {hasMultipleStoreBranches && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: hasSelectedBranchFromMenu ? 6 : 8, color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', minWidth: 0, maxWidth: isMobileViewport ? 196 : 236, flex: '0 1 236px' }}>
                <MapPin size={16} />
                {!hasSelectedBranchFromMenu && <span>Branch:</span>}
                <StorefrontDropdown
                  value={selectedLocationId ?? ''}
                  onChange={handleBranchMenuSelection}
                  options={storeLocations.map((location) => ({
                    value: location.location_id,
                    label: location.name || location.address_line || `Branch ${location.location_id}`
                  }))}
                  triggerStyle={{
                    minHeight: 34,
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    padding: '4px 34px 4px 2px'
                  }}
                  containerStyle={{ minWidth: 0, flex: '1 1 auto' }}
                  menuStyle={{ minWidth: 240 }}
                  selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ShoppingBag size={16} />
              Shop
            </button>
          </div>
        </div>
      </div>

      <StorefrontHeroShell
        fullBleed
        sectionStyle={{
          minHeight: isMobileViewport ? 290 : 316,
          borderRadius: 0,
          overflow: 'visible',
          background: serviceHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
            ? `url(${serviceHeroModel.coverImageUrl}) center/cover`
            : 'linear-gradient(135deg,#172033 0%,#22324b 50%,#40516c 100%)',
          boxShadow: STYLES.shadow.lg
        }}
        backgroundChildren={
          <>
            {serviceHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`) && (
              <img
                src={serviceHeroModel.coverImageUrl}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => markBrandingImageError(`hero-cover:${selectedStore.slug}`)}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.72) 76%, rgba(15,23,42,0.92) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,18,0.68) 0%, rgba(6,10,18,0.36) 46%, rgba(6,10,18,0.1) 100%)' }} />
          </>
        }
      >
        <StorefrontShareQr
          storeUrl={storefrontShareUrl}
          isMobileViewport={isMobileViewport}
          accentColor={servicesPrimary}
        />
        <div style={{
          position: 'absolute',
          left: isMobileViewport ? 20 : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          right: isMobileViewport ? 20 : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? -45 : -25,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: isMobileViewport ? 16 : 28,
          paddingLeft: isMobileViewport ? 126 : 218
        }}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 700, minWidth: 0, flex: 1, marginBottom: isMobileViewport ? 8 : 35 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff">{serviceHeroModel.statusLabel}</Badge>
              {serviceHeroModel.hours && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>{serviceHeroModel.hours}</span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
              <h1 style={{ margin: 0, color: '#fff', fontSize: isMobileViewport ? 38 : 50, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: servicesDisplayFont }}>{serviceHeroModel.name}</h1>
              {serviceHeroModel.tagline ? (
                <p style={{ margin: 0, color: '#ccfbf1', fontSize: isMobileViewport ? 18 : 20, fontWeight: 700, lineHeight: 1.3, fontFamily: servicesBodyFont }}>{serviceHeroModel.tagline}</p>
              ) : (
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: servicesBodyFont }}>{modeAdapter.heroDescription}</p>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95, marginBottom: 6, fontFamily: servicesBodyFont }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={16} fill={servicesHighlight} color={servicesHighlight} />{serviceHeroModel.ratingLabel}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span>{serviceHeroModel.modeLabel}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={16} />{serviceHeroModel.locationLabel}</span>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexDirection: isMobileViewport ? 'column' : 'row',
            flexShrink: 0,
            marginLeft: 'auto',
            marginBottom: isMobileViewport ? 8 : 35
          }}>
            {serviceHeroModel.actions.canCall && (
              <GhostButton onClick={() => openStorefrontActionLink(serviceHeroModel.actions.callHref)} style={{ minWidth: isMobileViewport ? '100%' : 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: servicesBodyFont }}>
                <Phone size={18} />
                Call
              </GhostButton>
            )}
            <PrimaryButton onClick={() => {
              if (hasServiceCart) {
                goStoreBookingPage();
                return;
              }
              document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }} style={{ minWidth: isMobileViewport ? '100%' : 150, background: servicesPrimary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: `0 10px 25px ${servicesPrimaryShadow}`, border: 'none', fontWeight: 900, fontFamily: servicesBodyFont }}>
              <MousePointer2 size={18} />
              {hasServiceCart ? 'Continue Booking' : 'Order Now'}
            </PrimaryButton>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          left: isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? '-45px' : '-25px',
          width: isMobileViewport ? 110 : 190,
          height: isMobileViewport ? 110 : 190,
          borderRadius: '50%',
          background: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {serviceHeroModel.profileImageUrl && !isBrandingImageBlocked(`hero-profile:${selectedStore.slug}`) ? (
            <img
              src={serviceHeroModel.profileImageUrl}
              alt={`${serviceHeroModel.name} profile`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => markBrandingImageError(`hero-profile:${selectedStore.slug}`)}
            />
          ) : (
            <div style={{ fontSize: isMobileViewport ? 52 : 66, fontWeight: 900, color: servicesPrimaryDark, fontFamily: servicesDisplayFont }}>{serviceHeroModel.name.charAt(0)}</div>
          )}
        </div>
      </StorefrontHeroShell>

      <div style={{
        maxWidth: 1180,
        margin: isMobileViewport ? '40px 16px 32px' : '70px auto 40px',
        padding: isMobileViewport ? 18 : 24,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 18,
        boxShadow: '0 14px 35px rgba(15, 23, 42, 0.08)',
        display: 'grid',
        gridTemplateColumns: isMobileViewport ? '1fr' : desktopColumns,
        gap: isMobileViewport ? 24 : 24
      }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overview</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: '#111827',
              margin: 0,
              display: isAboutExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: isAboutExpanded ? 'unset' : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {aboutText || 'Business details will appear soon.'}
            </p>
            {hasAboutToggle && (
              <button type="button" onClick={() => setIsAboutExpanded((previous) => !previous)} style={{ border: 'none', background: 'transparent', color: servicesPrimary, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, justifySelf: 'start', fontFamily: servicesBodyFont }}>
                {isAboutExpanded ? 'See less' : 'See more'}
              </button>
            )}
          </div>

          {galleryImages.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: isMobileViewport ? 'flex' : 'grid', gridTemplateColumns: isMobileViewport ? undefined : 'repeat(4, 1fr)', gap: 8, marginTop: 2, overflowX: isMobileViewport ? 'auto' : 'visible', paddingBottom: isMobileViewport ? 4 : 0 }}>
                {previewImages.map((url, index) => (
                  <div key={`${url}-${index}`} style={{ width: isMobileViewport ? 84 : '100%', minWidth: isMobileViewport ? 84 : 0, height: 56, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#e2e8f0', flexShrink: 0 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              {galleryImages.length > 4 && (
                <button type="button" onClick={() => setIsServiceGalleryExpanded((previous) => !previous)} style={{ border: 'none', background: 'transparent', color: servicesPrimary, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, justifySelf: 'start', fontFamily: servicesBodyFont }}>
                  {isServiceGalleryExpanded ? 'Show fewer photos' : 'View all photos'}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, paddingLeft: isMobileViewport ? 0 : 24, borderLeft: isMobileViewport ? 'none' : '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact & Location</div>
          <div style={{ display: 'grid', gridTemplateColumns: hasMapData && !isMobileViewport ? '0.9fr 1.1fr' : '1fr', gap: 18, alignItems: 'start' }}>
            {hasContactRows && (
              <div style={{ display: 'grid', gap: 10 }}>
                {serviceHeroModel.contactRows.map((row) => {
                  const icon = row.label === 'Call' || row.label === 'Phone'
                    ? <Phone size={16} />
                    : row.label === 'Message'
                      ? <MessageCircle size={16} />
                      : row.label === 'Facebook'
                        ? <MessageCircle size={16} />
                        : row.label === 'Email'
                          ? <Mail size={16} />
                          : <Clock3 size={16} />;
                  const content = (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827' }}>
                      <div style={{ color: servicesPrimaryDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{row.value}</div>
                      </div>
                    </div>
                  );
                  return row.href ? (
                    <button key={row.label} type="button" onClick={() => openStorefrontActionLink(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      {content}
                    </button>
                  ) : (
                    <div key={row.label}>{content}</div>
                  );
                })}

                {serviceHeroModel.hours && !serviceHeroModel.contactRows.some((row) => row.label === 'Hours') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827' }}>
                    <div style={{ color: STYLES.colors.teal, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock3 size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{serviceHeroModel.hours}</div>
                    </div>
                  </div>
                )}

                {hasAddress && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#111827' }}>
                      <div style={{ color: servicesPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{addressText}</div>
                      </div>
                    </div>
                    {serviceHeroModel.directionsUrl && (
                      <button type="button" onClick={() => openStorefrontActionLink(serviceHeroModel.directionsUrl)} style={{ padding: 0, border: 'none', background: 'transparent', color: servicesPrimary, fontSize: 12, fontWeight: 800, cursor: 'pointer', justifySelf: 'start', fontFamily: servicesBodyFont }}>
                        Get directions
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasMapData && (
              <div style={{ width: '100%', height: 150, borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
                <StoresMap stores={serviceHeroModel.mapStores} selectedKey={serviceHeroModel.mapSelectedKey} onSelectStore={() => { }} />
              </div>
            )}
          </div>
        </div>

        {hasWhyChooseUs && (
          <div style={{ display: 'grid', gap: 12, paddingLeft: isMobileViewport ? 0 : 24, borderLeft: isMobileViewport ? 'none' : '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Why Choose Us</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {serviceHeroModel.whyChooseUs.map((item, index) => (
                <div key={`${item}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#111827', lineHeight: 1.4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: servicesPrimarySoft, color: servicesPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={14} />
                  </div>
                  <div>{item}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const buildGoogleMapsDirectionsUrl = ({ latitude, longitude, addressLine }) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }
  const address = String(addressLine || '').trim();
  if (!address) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

const openStorefrontActionLink = (href) => {
  const target = String(href || '').trim();
  if (!target || typeof window === 'undefined') return;
  if (target.startsWith('tel:') || target.startsWith('mailto:')) {
    window.location.href = target;
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
};

const formatRatingSummary = (reviewSummary = null) => {
  const score = Number(reviewSummary?.score);
  if (!Number.isFinite(score) || score <= 0) return 'New storefront';
  const count = Number(reviewSummary?.total_count ?? reviewSummary?.totalCount);
  return Number.isFinite(count) && count > 0
    ? `${score.toFixed(1)} (${count})`
    : score.toFixed(1);
};

const getPreferredSocialContact = ({ messengerLink = '', facebookLink = '' } = {}) => {
  const normalizedMessengerLink = String(messengerLink || '').trim();
  const normalizedFacebookLink = String(facebookLink || '').trim();
  if (normalizedMessengerLink) {
    return { label: 'Messenger', value: 'Messenger', href: normalizedMessengerLink };
  }
  if (normalizedFacebookLink) {
    return { label: 'Facebook', value: 'Facebook', href: normalizedFacebookLink };
  }
  return null;
};

const maskReviewerName = (value) => {
  const name = String(value || '').trim();
  if (!name) return 'Anonymous';
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .map((word) => {
      if (word.length <= 2) return `${word.charAt(0)}*`;
      return `${word.slice(0, 2)}${'*'.repeat(Math.max(2, word.length - 2))}`;
    })
    .join(' ');
};

const deriveStorefrontRegistrationYear = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return String(date.getFullYear());
};

const FooterSocialIcon = ({ label }) => {
  const iconColor = '#e2e8f0';
  if (label === 'Facebook') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M13.5 22V13.2H16.4L16.9 9.8H13.5V7.64C13.5 6.66 13.78 5.98 15.18 5.98H17V2.94C16.11 2.84 15.22 2.79 14.32 2.8C11.66 2.8 9.84 4.42 9.84 7.4V9.8H7V13.2H9.84V22H13.5Z" fill={iconColor} />
      </svg>
    );
  }
  if (label === 'Instagram') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke={iconColor} strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.1" stroke={iconColor} strokeWidth="1.8" />
        <circle cx="17.3" cy="6.8" r="1.2" fill={iconColor} />
      </svg>
    );
  }
  if (label === 'Messenger') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5C7.03 3.5 3 7.24 3 11.86C3 14.5 4.32 16.86 6.39 18.41V21l2.51-1.39c.95.26 1.99.4 3.1.4 4.97 0 9-3.74 9-8.35S16.97 3.5 12 3.5Z" stroke={iconColor} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8.35 13.33l2.6-2.76 2.15 1.74 2.56-2.76-2.56 3.88-2.2-1.74-2.55 1.64Z" fill={iconColor} />
      </svg>
    );
  }
  return null;
};

const STOREFRONT_FOOTER_SOCIAL_LABELS = ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'];
const STOREFRONT_FOOTER_CONTACT_LABELS = ['Call', 'Email'];

const getStorefrontSocialFooterLinks = (links = []) => (
  (Array.isArray(links) ? links : []).filter((link) => STOREFRONT_FOOTER_SOCIAL_LABELS.includes(link?.label))
);

const getStorefrontContactFooterLinks = (links = []) => (
  (Array.isArray(links) ? links : []).filter((link) => STOREFRONT_FOOTER_CONTACT_LABELS.includes(link?.label))
);

const buildSimpleFallbackReasons = ({ categories = [], catalog = [] } = {}) => {
  const reasons = [];
  if (Array.isArray(categories) && categories.length > 0) {
    reasons.push(...categories.slice(0, 2));
  }
  const normalizedCatalog = Array.isArray(catalog) ? catalog : [];
  const productCount = normalizedCatalog.length;
  if (productCount > 0) {
    reasons.push(`${productCount} products currently available`);
  }
  const uniqueGroups = [...new Set(normalizedCatalog
    .map((item) => String(item?.categoryMeta?.label || item?.category_name || item?.category || '').trim())
    .filter(Boolean))];
  if (uniqueGroups.length > 0) {
    reasons.push(...uniqueGroups.slice(0, 2).map((label) => `${label} selections ready`));
  }
  return [...new Set(reasons.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, 4);
};

const buildServiceFallbackReasons = ({ serviceGroups = [], servicesViewModel = null, categories = [] } = {}) => {
  const reasons = [];
  if (Array.isArray(categories) && categories.length > 0) {
    reasons.push(...categories.slice(0, 2));
  }
  if (Array.isArray(serviceGroups) && serviceGroups.length > 0) {
    serviceGroups.slice(0, 2).forEach((group) => {
      const count = Number(group?.items?.length || 0);
      if (count > 0) {
        reasons.push(`${group.categoryMeta?.label || 'Service'} options (${count})`);
      }
    });
  }
  const totalServices = Number(servicesViewModel?.totalServices || 0);
  if (totalServices > 0) {
    reasons.push(`${totalServices} services currently listed`);
  }
  return [...new Set(reasons.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, 4);
};

const SimpleHero = ({
  simpleHeroModel,
  selectedStore,
  isMobileViewport,
  hasMultipleStoreBranches,
  hasSelectedBranchFromMenu,
  selectedLocationId,
  handleBranchMenuSelection,
  storeLocations,
  catalogSearch,
  setCatalogSearch,
  goDiscovery,
  cartCount,
  setIsCheckoutOpen,
  modeAdapter,
  isBrandingImageBlocked,
  markBrandingImageError,
  selectedLocation,
  openStorefrontActionLink,
  openTrackPanel,
  openAccountPanel
}) => {
  const heroTheme = modeAdapter.heroTheme || {};
  const addressText = String(simpleHeroModel.addressLine || simpleHeroModel.locationLabel || '').trim();
  const aboutText = String(simpleHeroModel.aboutText || '').trim();
  const hasAboutToggle = aboutText.length > 180;
  const hasAddress = Boolean(addressText);
  const hasMapData = Number.isFinite(Number(selectedLocation?.latitude ?? selectedStore?.latitude))
    && Number.isFinite(Number(selectedLocation?.longitude ?? selectedStore?.longitude));
  const hasWhyChooseUs = Array.isArray(simpleHeroModel.whyChooseUs) && simpleHeroModel.whyChooseUs.length > 0;
  const hasContactRows = simpleHeroModel.contactRows.length > 0 || Boolean(simpleHeroModel.hours) || hasAddress;
  const desktopColumns = hasWhyChooseUs ? '1fr 1.45fr 1fr' : '1fr 1.45fr';
  const storefrontShareUrl = useMemo(() => {
    if (!selectedStore?.slug) return '';
    return buildPublicStorefrontUrl(selectedStore.slug);
  }, [selectedStore?.slug]);

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 0,
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 6px 18px rgba(15,23,42,.05)',
        marginBottom: 0,
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)'
      }}>
        <div style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          padding: isMobileViewport ? '12px 16px' : '14px 24px',
          display: 'flex',
          alignItems: isMobileViewport ? 'stretch' : 'center',
          gap: 16,
          flexDirection: isMobileViewport ? 'column' : 'row'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: isMobileViewport ? '0 0 auto' : '0 1 180px' }}>
            <button type="button" onClick={goDiscovery} style={{ border: 'none', background: '#f8fafc', color: STYLES.colors.dark, width: 44, height: 44, borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img
                src={DGFY_HEADER_LOGO_URL}
                alt="DGFY logo"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #dbe5ee', borderRadius: 999, background: '#f8fafc', padding: isMobileViewport ? '0 10px 0 16px' : '0 10px 0 14px', minHeight: isMobileViewport ? 46 : 40, width: '100%', maxWidth: isMobileViewport ? '100%' : 420, flex: isMobileViewport ? '0 0 auto' : '0 1 420px', minWidth: isMobileViewport ? 0 : 260, margin: isMobileViewport ? 0 : '0 auto' }}>
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={modeAdapter.catalogSearchPlaceholder || 'Search products in this store'}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: STYLES.colors.text, fontFamily: heroTheme.bodyFont }}
            />
            <span style={{ width: isMobileViewport ? 32 : 28, height: isMobileViewport ? 32 : 28, borderRadius: 999, background: heroTheme.accent || STYLES.colors.brand, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Search size={16} />
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', alignItems: 'center', gap: 18, flexWrap: 'nowrap', minWidth: 0, whiteSpace: 'nowrap', marginLeft: isMobileViewport ? 0 : 'auto', flex: '0 1 auto' }}>
            {hasMultipleStoreBranches && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: hasSelectedBranchFromMenu ? 6 : 8, color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: heroTheme.bodyFont, minWidth: 0, maxWidth: isMobileViewport ? 196 : 236, flex: '0 1 236px' }}>
                <MapPin size={16} />
                {!hasSelectedBranchFromMenu && <span>Branch:</span>}
                <StorefrontDropdown
                  value={selectedLocationId ?? ''}
                  onChange={handleBranchMenuSelection}
                  options={storeLocations.map((location) => ({
                    value: location.location_id,
                    label: location.name || location.address_line || `Branch ${location.location_id}`
                  }))}
                  triggerStyle={{
                    minHeight: 34,
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    padding: '4px 34px 4px 2px',
                    fontFamily: heroTheme.bodyFont
                  }}
                  containerStyle={{ minWidth: 0, flex: '1 1 auto' }}
                  menuStyle={{ minWidth: 240 }}
                  selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: heroTheme.bodyFont }}
            >
              <ShoppingBag size={16} />
              Shop
            </button>
            <button
              type="button"
              onClick={openTrackPanel}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: heroTheme.bodyFont }}
            >
              <FileText size={16} />
              Track
            </button>
            <button
              type="button"
              onClick={openAccountPanel}
              style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: heroTheme.bodyFont }}
            >
              <HeartHandshake size={16} />
              Account
            </button>
          </div>
        </div>
      </div>

      <StorefrontHeroShell
        fullBleed
        sectionStyle={{
          minHeight: isMobileViewport ? 290 : 316,
          borderRadius: 0,
          overflow: 'visible',
          background: simpleHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
            ? `url(${simpleHeroModel.coverImageUrl}) center/cover`
            : `linear-gradient(135deg, ${heroTheme.surface || '#0f172a'} 0%, ${heroTheme.accentDark || '#134e4a'} 52%, ${heroTheme.accent || '#0f766e'} 100%)`,
          boxShadow: STYLES.shadow.lg
        }}
        backgroundChildren={
          <>
            {simpleHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`) && (
              <img
                src={simpleHeroModel.coverImageUrl}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => markBrandingImageError(`hero-cover:${selectedStore.slug}`)}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.72) 76%, rgba(15,23,42,0.92) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,18,0.68) 0%, rgba(6,10,18,0.36) 46%, rgba(6,10,18,0.1) 100%)' }} />
          </>
        }
      >
        <StorefrontShareQr
          storeUrl={storefrontShareUrl}
          isMobileViewport={isMobileViewport}
          accentColor={heroTheme.accent || '#0f766e'}
        />
        <div style={{
          position: 'absolute',
          left: isMobileViewport ? 20 : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          right: isMobileViewport ? 20 : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? -45 : -25,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: isMobileViewport ? 16 : 28,
          paddingLeft: isMobileViewport ? 126 : 218
        }}>
          <div style={{ display: 'grid', gap: 12, maxWidth: 700, minWidth: 0, flex: 1, marginBottom: isMobileViewport ? 8 : 35 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff" style={{ fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.statusLabel}</Badge>
              {simpleHeroModel.hours && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.hours}</span>
              )}
            </div>
            <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
              <h1 style={{ margin: 0, color: '#fff', fontSize: isMobileViewport ? 38 : 50, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: heroTheme.displayFont }}>{simpleHeroModel.name}</h1>
              {simpleHeroModel.tagline ? (
                <p style={{ margin: 0, color: '#ccfbf1', fontSize: isMobileViewport ? 18 : 20, fontWeight: 700, lineHeight: 1.3, fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.tagline}</p>
              ) : (
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95, marginBottom: 6, fontFamily: heroTheme.bodyFont }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={16} fill="#5eead4" color="#5eead4" />{simpleHeroModel.ratingLabel}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span>{simpleHeroModel.modeLabel}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={16} />{simpleHeroModel.locationLabel}</span>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexDirection: isMobileViewport ? 'column' : 'row',
            flexShrink: 0,
            marginLeft: 'auto',
            marginBottom: isMobileViewport ? 8 : 35
          }}>
            {simpleHeroModel.actions.canCall && (
              <GhostButton onClick={() => openStorefrontActionLink(simpleHeroModel.actions.callHref)} style={{ minWidth: isMobileViewport ? '100%' : 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: heroTheme.bodyFont }}>
                <Phone size={18} />
                Call
              </GhostButton>
            )}
            <PrimaryButton onClick={() => {
              if (cartCount > 0) {
                setIsCheckoutOpen(true);
                return;
              }
              document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }} style={{ minWidth: isMobileViewport ? '100%' : 150, background: heroTheme.accent || '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: '0 10px 25px rgba(15,118,110,0.28)', border: 'none', fontWeight: 900, fontFamily: heroTheme.bodyFont }}>
              <MousePointer2 size={18} />
              {cartCount > 0 ? 'Open Cart' : (modeAdapter.primaryActionLabel || 'Start Ordering')}
            </PrimaryButton>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          left: isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? '-45px' : '-25px',
          width: isMobileViewport ? 110 : 190,
          height: isMobileViewport ? 110 : 190,
          borderRadius: '50%',
          background: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {simpleHeroModel.profileImageUrl && !isBrandingImageBlocked(`hero-profile:${selectedStore.slug}`) ? (
            <img
              src={simpleHeroModel.profileImageUrl}
              alt={`${simpleHeroModel.name} profile`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => markBrandingImageError(`hero-profile:${selectedStore.slug}`)}
            />
          ) : (
            <div style={{ fontSize: isMobileViewport ? 52 : 66, fontWeight: 900, color: heroTheme.accentDark || '#134e4a', fontFamily: heroTheme.displayFont }}>{simpleHeroModel.name.charAt(0)}</div>
          )}
        </div>
      </StorefrontHeroShell>

      <div style={{
        maxWidth: 1180,
        margin: isMobileViewport ? '40px 16px 32px' : '70px auto 40px',
        padding: isMobileViewport ? 18 : 24,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 18,
        boxShadow: '0 14px 35px rgba(15, 23, 42, 0.08)',
        display: 'grid',
        gridTemplateColumns: isMobileViewport ? '1fr' : desktopColumns,
        gap: isMobileViewport ? 24 : 24
      }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overview</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: '#111827',
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: hasAboutToggle ? 3 : 'unset',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {aboutText || 'Business details will appear soon.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, paddingLeft: isMobileViewport ? 0 : 24, borderLeft: isMobileViewport ? 'none' : '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact & Location</div>
          <div style={{ display: 'grid', gridTemplateColumns: hasMapData && !isMobileViewport ? '0.9fr 1.1fr' : '1fr', gap: 18, alignItems: 'start' }}>
            {hasContactRows && (
              <div style={{ display: 'grid', gap: 10 }}>
                {simpleHeroModel.contactRows.map((row) => {
                  const icon = row.label === 'Call' || row.label === 'Phone'
                    ? <Phone size={16} />
                    : row.label === 'Message'
                      ? <MessageCircle size={16} />
                      : row.label === 'Facebook'
                        ? <MessageCircle size={16} />
                        : row.label === 'Email'
                          ? <Mail size={16} />
                          : <Clock3 size={16} />;
                  const content = (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827' }}>
                      <div style={{ color: heroTheme.accentDark || STYLES.colors.brandDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{row.value}</div>
                      </div>
                    </div>
                  );
                  return row.href ? (
                    <button key={row.label} type="button" onClick={() => openStorefrontActionLink(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      {content}
                    </button>
                  ) : (
                    <div key={row.label}>{content}</div>
                  );
                })}

                {simpleHeroModel.hours && !simpleHeroModel.contactRows.some((row) => row.label === 'Hours') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#111827' }}>
                    <div style={{ color: heroTheme.accent || STYLES.colors.teal, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock3 size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{simpleHeroModel.hours}</div>
                    </div>
                  </div>
                )}

                {hasAddress && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#111827' }}>
                      <div style={{ color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{addressText}</div>
                      </div>
                    </div>
                    {simpleHeroModel.directionsUrl && (
                      <button type="button" onClick={() => openStorefrontActionLink(simpleHeroModel.directionsUrl)} style={{ padding: 0, border: 'none', background: 'transparent', color: heroTheme.accent || STYLES.colors.brand, fontSize: 12, fontWeight: 800, cursor: 'pointer', justifySelf: 'start' }}>
                        Get directions
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasMapData && (
              <div style={{ width: '100%', height: 150, borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
                <StoresMap stores={simpleHeroModel.mapStores} selectedKey={simpleHeroModel.mapSelectedKey} onSelectStore={() => { }} />
              </div>
            )}
          </div>
        </div>

        {hasWhyChooseUs && (
          <div style={{ display: 'grid', gap: 12, paddingLeft: isMobileViewport ? 0 : 24, borderLeft: isMobileViewport ? 'none' : '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Why Shop Here</div>
            <div style={{ display: 'grid', gap: 12 }}>
              {simpleHeroModel.whyChooseUs.map((item, index) => (
                <div key={`${item}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#111827', lineHeight: 1.4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: '#ecfeff', color: heroTheme.accent || '#0f766e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={14} />
                  </div>
                  <div>{item}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default function StorefrontApp() {
  const [routeSlug, setRouteSlug] = useState(() => readRouteSlug());
  const [routeSubpage, setRouteSubpage] = useState(() => readStoreSubpage());
  const [routeServiceItemId, setRouteServiceItemId] = useState(() => readStoreServiceItemId());
  const previousRouteSlugRef = useRef(routeSlug);
  const bookingPreferredDateInputRef = useRef(null);

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedDiscoverySearch, setDebouncedDiscoverySearch] = useState('');
  const searchRef = useRef(search);
  const [discoveryResultMode, setDiscoveryResultMode] = useState('union');
  const [discoveryStockFilter, setDiscoveryStockFilter] = useState('in_stock_only');
  const [discoveryPinScope, setDiscoveryPinScope] = useState('tenant_primary');
  const [discoveryIncludeMatchMeta, setDiscoveryIncludeMatchMeta] = useState(true);
  const [discoveryAppliedFilters, setDiscoveryAppliedFilters] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [highlightedStoreSlug, setHighlightedStoreSlug] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const isStorePage = Boolean(routeSlug);
  const isBookingSubpage = routeSubpage === STORE_BOOKING_SUBPAGE;
  const isOrderSubpage = routeSubpage === STORE_ORDER_SUBPAGE;
  const isServiceDetailsSubpage = routeSubpage === STORE_SERVICE_SUBPAGE;

  const [selectedServiceDetail, setSelectedServiceDetail] = useState(null);
  const [serviceDraftQuantity, setServiceDraftQuantity] = useState(1);
  const [serviceDraftNotes, setServiceDraftNotes] = useState('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({
    name: '',
    anonymous: false,
    rating: 0,
    message: ''
  });
  const openServiceDetail = (service) => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    const serviceItemId = String(service?.item_id || '').trim();
    if (!normalized || !serviceItemId || typeof window === 'undefined') return;
    const target = storePath(normalized, STORE_SERVICE_SUBPAGE, `?service=${encodeURIComponent(serviceItemId)}`);
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.pushState({ storeSlug: normalized, storeSubpage: STORE_SERVICE_SUBPAGE, serviceItemId }, '', target);
    }
    setSelectedServiceDetail(service);
    setRouteSlug(normalized);
    setRouteSubpage(STORE_SERVICE_SUBPAGE);
    setRouteServiceItemId(serviceItemId);
  };
  const closeServiceDetail = () => {
    setSelectedServiceDetail(null);
    setRouteServiceItemId(null);
    goStoreCatalogPage();
  };
  const [activeServiceTab, setActiveServiceTab] = useState(null);
  const [serviceSortOption, setServiceSortOption] = useState('recommended');
  const [isServiceFilterOpen, setIsServiceFilterOpen] = useState(false);
  const [serviceAvailabilityFilter, setServiceAvailabilityFilter] = useState('all');
  const [serviceAreaFilter, setServiceAreaFilter] = useState('all');
  const [serviceDurationFilter, setServiceDurationFilter] = useState('all');
  const [serviceBookingStep, setServiceBookingStep] = useState(1);
  const [servicePage, setServicePage] = useState(1);
  const [servicePageSize, setServicePageSize] = useState(8);
  const [fnbPage, setFnbPage] = useState(1);
  const [fnbPageSize, setFnbPageSize] = useState(8);
  const [fnbSortOption, setFnbSortOption] = useState('name_asc');
  const [fnbOrderStep, setFnbOrderStep] = useState(1);
  const [fnbPaymentType, setFnbPaymentType] = useState('cash');
  const [fnbScheduledFor, setFnbScheduledFor] = useState('');
  const [fnbSpecialInstructions, setFnbSpecialInstructions] = useState('');
  const [fnbReservationForm, setFnbReservationForm] = useState({ customer_name: '', phone: '', party_size: 2, preferred_at: '', notes: '' });
  const [fnbReservationLoading, setFnbReservationLoading] = useState(false);
  const [fnbReservationError, setFnbReservationError] = useState('');
  const [fnbReservationResult, setFnbReservationResult] = useState(null);
  const [isFnbCategoryDropdownOpen, setIsFnbCategoryDropdownOpen] = useState(false);
  const [isAboutExpanded, setIsAboutExpanded] = useState(false);
  const [isServiceGalleryExpanded, setIsServiceGalleryExpanded] = useState(false);
  const [discoveryCoords, setDiscoveryCoords] = useState(null);
  const discoveryCoordsRef = useRef(discoveryCoords);
  const [discoveryLocationMap, setDiscoveryLocationMap] = useState({});
  const [loadingDiscoveryLocations, setLoadingDiscoveryLocations] = useState(false);
  const [highlightedDiscoveryMarkerKey, setHighlightedDiscoveryMarkerKey] = useState('');
  const [storeLocations, setStoreLocations] = useState([]);
  const [primaryLocationId, setPrimaryLocationId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [hasSelectedBranchFromMenu, setHasSelectedBranchFromMenu] = useState(false);
  const fnbCategoryDropdownRef = useRef(null);
  const [preferredStoreLocationSelection, setPreferredStoreLocationSelection] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogErrorGuidance, setCatalogErrorGuidance] = useState('');

  const [orderMethod, setOrderMethod] = useState('delivery');
  const [cart, setCart] = useState([]);
  const [catalogImageErrors, setCatalogImageErrors] = useState(() => new Set());
  const [cartImageErrors, setCartImageErrors] = useState(() => new Set());
  const [brandingImageErrors, setBrandingImageErrors] = useState(() => new Set());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [serviceUnitType, setServiceUnitType] = useState('');
  const [customerPin, setCustomerPin] = useState(null);
  const [serviceAppointmentAt, setServiceAppointmentAt] = useState('');
  const [servicePaymentTiming, setServicePaymentTiming] = useState('postpaid');
  const [servicePaymentPreviewMethod, setServicePaymentPreviewMethod] = useState('qr');
  const [servicePaymentPreviewCard, setServicePaymentPreviewCard] = useState({
    cardholder: '',
    cardNumber: '',
    expiry: '',
    cvv: ''
  });
  const [servicePaymentPreviewReceiptName, setServicePaymentPreviewReceiptName] = useState('');
  const [serviceIntakeResponses, setServiceIntakeResponses] = useState({});
  const [serviceAvailabilityState, setServiceAvailabilityState] = useState({
    serviceItemId: null,
    date: '',
    quantity: 1,
    loading: false,
    error: '',
    unavailableReason: null,
    diagnostics: null,
    slots: []
  });
  const bookingFieldRefs = useRef({});
  const [pendingBookingFocusKey, setPendingBookingFocusKey] = useState('');
  const [pinLocationLoading, setPinLocationLoading] = useState(false);
  const [pinLocationError, setPinLocationError] = useState('');
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteNeedsRefresh, setQuoteNeedsRefresh] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [trackingPinInput, setTrackingPinInput] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [accountPanel, setAccountPanel] = useState({ loading: false, error: '', me: null, orders: [], bookings: [] });

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState('checkout');
  const [followState, setFollowState] = useState({
    loading: false,
    isFollowing: false,
    followersCount: 0,
    error: ''
  });
  const storefrontVisitorId = useMemo(() => getOrCreateStorefrontVisitorId(), []);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1280 : window.innerWidth
  ));
  const isMobileViewport = viewportWidth < 840;
  const isDesktopViewport = viewportWidth >= 1024;
  const discoveryRequestSequenceRef = useRef(0);
  const lastImmediateDiscoveryRequestRef = useRef({ search: '', at: 0 });
  const markBrandingImageError = useCallback((key) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    setBrandingImageErrors((previous) => {
      if (previous.has(normalizedKey)) return previous;
      const next = new Set(previous);
      next.add(normalizedKey);
      return next;
    });
  }, []);
  const isBrandingImageBlocked = useCallback((key) => brandingImageErrors.has(String(key || '').trim()), [brandingImageErrors]);

  const pageModel = useMemo(() => (
    normalizeStorefrontPageModel({
      selectedStore,
      catalog
    })
  ), [selectedStore, catalog]);
  const {
    isServicesMode,
    isFnbMode,
    isSimpleMode,
    modeAdapter,
    servicesViewModel,
    fnbViewModel,
    servicesLayoutMode,
    hero: heroSectionModel,
    overview: overviewSectionModel,
    supporting: supportingSectionModel
  } = pageModel;
  const isFnbOrderSubpage = isFnbMode && isOrderSubpage;
  const promoSectionModel = useMemo(() => {
    const rawPromo = supportingSectionModel?.promo && typeof supportingSectionModel.promo === 'object'
      ? supportingSectionModel.promo
      : null;
    const normalizePromoEntry = (entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const title = String(entry.title || '').trim();
      const subtitle = String(entry.subtitle || '').trim();
      const badge = String(entry.badge || '').trim();
      const validityText = String(entry.validity_text || entry.validityText || '').trim();
      const headline = String(entry.headline || entry.primary_text || '').trim();
      const supportingText = String(entry.supporting_text || entry.secondary_text || '').trim();
      if (!title && !subtitle && !badge && !validityText && !headline && !supportingText) return null;
      return {
        title,
        subtitle,
        badge,
        validityText,
        headline,
        supportingText
      };
    };

    let promoItems = [];
    if (rawPromo?.active === true) {
      const rawItems = Array.isArray(rawPromo.items) ? rawPromo.items : [];
      promoItems = rawItems.map(normalizePromoEntry).filter(Boolean);
      if (promoItems.length === 0) {
        const normalizedSingle = normalizePromoEntry(rawPromo);
        if (normalizedSingle) promoItems = [normalizedSingle];
      }
    }
    return promoItems.slice(0, 3);
  }, [supportingSectionModel?.promo]);
  const servicesPrimary = modeAdapter?.heroTheme?.accent || '#0f766e';
  const servicesPrimaryDark = modeAdapter?.heroTheme?.accentDark || '#134e4a';
  const servicesPrimarySoft = modeAdapter?.heroTheme?.accentSoft || '#ecfeff';
  const servicesBodyFont = modeAdapter?.heroTheme?.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const servicesDisplayFont = modeAdapter?.heroTheme?.displayFont || servicesBodyFont;
  const servicesPrimaryBorder = `${servicesPrimary}33`;
  const servicesPrimaryShadow = 'rgba(15,118,110,0.24)';
  const servicesPrimaryShadowStrong = 'rgba(15,118,110,0.32)';
  const servicesHighlight = '#f59e0b';
  const servicesHighlightSoft = '#fffbeb';


  const loadStores = useCallback(async (coords = undefined, options = {}) => {
    const useImmediateSearch = options?.useImmediateSearch === true;
    const requestSearch = useImmediateSearch ? String(searchRef.current || '').trim() : debouncedDiscoverySearch.trim();
    if (useImmediateSearch) {
      lastImmediateDiscoveryRequestRef.current = { search: requestSearch, at: Date.now() };
    }
    const requestSequence = discoveryRequestSequenceRef.current + 1;
    discoveryRequestSequenceRef.current = requestSequence;
    setLoadingStores(true);
    setStoresError('');
    try {
      const resolvedCoords = coords === undefined ? discoveryCoordsRef.current : coords;
      const q = new URLSearchParams();
      if (requestSearch) q.set('search', requestSearch);
      q.set('result_mode', discoveryResultMode);
      q.set('stock_filter', discoveryStockFilter);
      q.set('pin_scope', discoveryPinScope);
      q.set('include_match_meta', discoveryIncludeMatchMeta ? 'true' : 'false');
      if (resolvedCoords?.latitude && resolvedCoords?.longitude) {
        q.set('latitude', String(resolvedCoords.latitude));
        q.set('longitude', String(resolvedCoords.longitude));
        const nextCoords = {
          latitude: Number(resolvedCoords.latitude),
          longitude: Number(resolvedCoords.longitude)
        };
        discoveryCoordsRef.current = nextCoords;
        setDiscoveryCoords((previous) => {
          if (
            previous
            && Number(previous.latitude) === Number(nextCoords.latitude)
            && Number(previous.longitude) === Number(nextCoords.longitude)
          ) {
            return previous;
          }
          return nextCoords;
        });
      } else {
        discoveryCoordsRef.current = null;
        setDiscoveryCoords(null);
      }
      q.set('limit', '100');
      const data = await requestJson(`/api/v1/storefront/discovery?${q.toString()}`);
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setStores(Array.isArray(data?.stores) ? data.stores : []);
        setDiscoveryAppliedFilters(data?.applied_filters || null);
      }
    } catch (error) {
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setStores([]);
        setDiscoveryAppliedFilters(null);
        setStoresError(error.message || 'Failed to load discovery stores.');
      }
    } finally {
      if (requestSequence === discoveryRequestSequenceRef.current) {
        setLoadingStores(false);
      }
    }
  }, [debouncedDiscoverySearch, discoveryResultMode, discoveryStockFilter, discoveryPinScope, discoveryIncludeMatchMeta]);

  const openStoreBySlug = useCallback(async (slug) => {
    const normalized = toSlug(slug);
    if (!normalized) return;

    setLoadingCatalog(true);
    setCatalogError('');
    setCatalogErrorGuidance('');
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    try {
      let profile;
      try {
        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(normalized)}`);
      } catch (profileError) {
        if (Number(profileError?.status) !== 404) throw profileError;

        const discoveryFallback = await requestJson(`/api/v1/storefront/discovery?search=${encodeURIComponent(normalized)}&limit=20&result_mode=union&stock_filter=in_stock_only&pin_scope=tenant_primary&include_match_meta=true`);
        const fallbackStores = Array.isArray(discoveryFallback?.stores) ? discoveryFallback.stores : [];
        const canonicalSlug = findCanonicalStorefrontSlug(normalized, fallbackStores);
        if (!canonicalSlug) throw profileError;

        profile = await requestJson(`/api/v1/storefront/discovery/${encodeURIComponent(canonicalSlug)}`);
      }

      if (profile?.slug && toSlug(profile.slug) !== normalized && typeof window !== 'undefined') {
        const canonicalPath = routeSubpage === STORE_BOOKING_SUBPAGE
          ? storePath(profile.slug, STORE_BOOKING_SUBPAGE)
          : routeSubpage === STORE_ORDER_SUBPAGE
            ? storePath(profile.slug, STORE_ORDER_SUBPAGE)
          : routeSubpage === STORE_SERVICE_SUBPAGE && routeServiceItemId
            ? storePath(profile.slug, STORE_SERVICE_SUBPAGE, `?service=${encodeURIComponent(routeServiceItemId)}`)
            : storePath(profile.slug);
        if (`${window.location.pathname}${window.location.search}` !== canonicalPath) {
          window.history.replaceState({ storeSlug: profile.slug, storeSubpage: routeSubpage }, '', canonicalPath);
        }
        setRouteSlug(toSlug(profile.slug));
      }
      setSelectedStore(profile);
      let resolvedCatalogLocationId = null;
      const profileLocations = normalizeProfileLocations(profile);

      try {
        const locationsData = await requestJson('/api/v1/store/locations', { storeSlug: profile.slug });
        const apiLocations = Array.isArray(locationsData?.locations) ? locationsData.locations : [];
        const useProfileSnapshot = !locationsMatchProfileSnapshot(apiLocations, profile);
        const locations = useProfileSnapshot ? profileLocations : apiLocations;
        const nextPrimaryLocationId = useProfileSnapshot
          ? (profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null)
          : (locationsData?.primary_location_id ?? null);
        setStoreLocations(locations);
        setPrimaryLocationId(nextPrimaryLocationId);
        if (locations.length > 0) {
          const preferredLocationId = (
            preferredStoreLocationSelection?.slug
            && toSlug(preferredStoreLocationSelection.slug) === toSlug(profile.slug)
          )
            ? preferredStoreLocationSelection.locationId
            : null;
          const preferredLocation = preferredLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(preferredLocationId)) || null);
          const primaryLocation = nextPrimaryLocationId == null
            ? null
            : (locations.find((location) => Number(location.location_id) === Number(nextPrimaryLocationId)) || null);
          const firstOpenLocation = locations.find((location) => location?.is_open !== false) || null;
          const fallbackLocationId = (
            preferredLocation?.location_id
            ?? firstOpenLocation?.location_id
            ?? primaryLocation?.location_id
            ?? locations[0]?.location_id
            ?? null
          );
          resolvedCatalogLocationId = fallbackLocationId;
          setSelectedLocationId(fallbackLocationId);
        } else {
          resolvedCatalogLocationId = null;
          setSelectedLocationId(null);
        }
      } catch {
        const fallbackPrimaryLocationId = profileLocations.find((location) => location.is_primary_storefront)?.location_id ?? profile.location_id ?? null;
        setStoreLocations(profileLocations);
        setPrimaryLocationId(fallbackPrimaryLocationId);
        resolvedCatalogLocationId = fallbackPrimaryLocationId;
        setSelectedLocationId(fallbackPrimaryLocationId);
      }

      const catalogQuery = resolvedCatalogLocationId == null
        ? '/api/v1/store/catalog?limit=120'
        : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(resolvedCatalogLocationId)}`;
      const catalogData = await requestJson(catalogQuery, { storeSlug: profile.slug });
      const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
      if (accessPatch) {
        setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
      }
      setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
    } catch (error) {
      const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant storefront page.');
      setSelectedStore(null);
      setStoreLocations([]);
      setCatalog([]);
      setCatalogError(normalizedError.message);
      setCatalogErrorGuidance(normalizedError.guidance);
    } finally {
      setLoadingCatalog(false);
    }
  }, [preferredStoreLocationSelection, routeServiceItemId, routeSubpage]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedDiscoverySearch(search);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    const lastImmediate = lastImmediateDiscoveryRequestRef.current;
    const debouncedSearch = debouncedDiscoverySearch.trim();
    if (
      debouncedSearch
      && lastImmediate?.search === debouncedSearch
      && Date.now() - Number(lastImmediate.at || 0) < 400
    ) {
      return;
    }
    loadStores();
  }, [loadStores, debouncedDiscoverySearch]);

  useEffect(() => {
    discoveryCoordsRef.current = discoveryCoords;
  }, [discoveryCoords]);

  useEffect(() => {
    if (!routeSlug) return;
    openStoreBySlug(routeSlug);
  }, [routeSlug, openStoreBySlug]);

  useEffect(() => {
    if (isStorePage) return;
    setCatalogSearch('');
  }, [isStorePage]);

  useEffect(() => {
    const previousRouteSlug = previousRouteSlugRef.current;
    const currentRouteSlug = routeSlug;
    if (previousRouteSlug && currentRouteSlug && previousRouteSlug !== currentRouteSlug) {
      setCatalogSearch('');
      setActiveServiceTab(null);
      setServiceSortOption('recommended');
      setServiceAvailabilityFilter('all');
      setServiceAreaFilter('all');
      setServiceDurationFilter('all');
      setServicePage(1);
      setIsServiceFilterOpen(false);
      setFnbSortOption('name_asc');
      setFnbPage(1);
    }
    previousRouteSlugRef.current = currentRouteSlug;
  }, [routeSlug]);

  useEffect(() => {
    let cancelled = false;
    const loadLocationAwareCatalog = async () => {
      if (!isStorePage || !selectedStore?.slug) return;
      setLoadingCatalog(true);
      setCatalogError('');
      setCatalogErrorGuidance('');
      try {
        const catalogQuery = selectedLocationId == null
          ? '/api/v1/store/catalog?limit=120'
          : `/api/v1/store/catalog?limit=120&location_id=${encodeURIComponent(selectedLocationId)}`;
        const catalogData = await requestJson(catalogQuery, { storeSlug: selectedStore.slug });
        if (cancelled) return;
        const accessPatch = buildAccessPolicyStorePatch(catalogData?.access_policy);
        if (accessPatch) {
          setSelectedStore((prev) => (prev ? { ...prev, ...accessPatch } : prev));
        }
        setCatalog(Array.isArray(catalogData?.items) ? catalogData.items : []);
      } catch (error) {
        if (cancelled) return;
        const normalizedError = classifyStoreCatalogError(error, 'Failed to load tenant catalog for selected location.');
        setCatalog([]);
        setCatalogError(normalizedError.message);
        setCatalogErrorGuidance(normalizedError.guidance);
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    loadLocationAwareCatalog();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, selectedStore?.slug, selectedLocationId]);

  useEffect(() => {
    setCatalogImageErrors(new Set());
  }, [catalog]);

  useEffect(() => {
    let cancelled = false;

    const loadDiscoveryLocations = async () => {
      if (!Array.isArray(stores) || stores.length === 0) {
        setDiscoveryLocationMap({});
        return;
      }

      setLoadingDiscoveryLocations(true);
      try {
        const locationPairs = await Promise.all(
          stores.map(async (store) => {
            const slug = toSlug(store?.slug);
            if (!slug) return [slug, { locations: [], primary_location_id: null }];
            try {
              const data = await requestJson('/api/v1/store/locations', { storeSlug: slug });
              const locations = Array.isArray(data?.locations) ? data.locations : [];
              return [slug, { locations, primary_location_id: data?.primary_location_id ?? null }];
            } catch {
              return [slug, { locations: [], primary_location_id: null }];
            }
          })
        );
        if (cancelled) return;
        setDiscoveryLocationMap(Object.fromEntries(locationPairs.filter(([slug]) => Boolean(slug))));
      } finally {
        if (!cancelled) setLoadingDiscoveryLocations(false);
      }
    };

    loadDiscoveryLocations();
    return () => {
      cancelled = true;
    };
  }, [stores]);

  useEffect(() => {
    const onPopState = () => {
      setRouteSlug(readRouteSlug());
      setRouteSubpage(readStoreSubpage());
      setRouteServiceItemId(readStoreServiceItemId());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    if (!isFnbOrderSubpage) return;
    setCheckoutTab('checkout');
    setIsCheckoutOpen(false);
  }, [isFnbOrderSubpage]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { });
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((k) => k.startsWith('sku-store-shell-') || k.startsWith('sku-store-runtime-'))
              .map((k) => caches.delete(k))
          ))
          .catch(() => { });
      }
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
        const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
        const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
        if (!probe.ok || !scriptLike) {
          console.warn('[StorefrontPWA] Skipping service worker registration due to invalid script response', {
            status: probe.status,
            contentType
          });
          return;
        }
        await navigator.serviceWorker.register(serviceWorkerUrl, { scope: appBasePath === '/' ? '/' : `${appBasePath}/` });
      } catch (error) {
        console.warn('[StorefrontPWA] Service worker registration failed', {
          error: error?.message || 'unknown_error'
        });
      }
    };

    registerServiceWorker();
  }, []);

  const goStore = (slug, locationId = null) => {
    const normalized = toSlug(slug);
    if (!normalized) return;
    setPreferredStoreLocationSelection(locationId == null ? null : {
      slug: normalized,
      locationId: Number(locationId)
    });
    const target = storePath(normalized);
    if (window.location.pathname !== target) {
      window.history.pushState({ storeSlug: normalized, storeSubpage: null }, '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
  };
  const goStoreBookingPage = ({ preserveSelectedService = false } = {}) => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const target = storePath(normalized, STORE_BOOKING_SUBPAGE);
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.pushState({ storeSlug: normalized, storeSubpage: STORE_BOOKING_SUBPAGE }, '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(STORE_BOOKING_SUBPAGE);
    setRouteServiceItemId(null);
    if (!preserveSelectedService) {
      setSelectedServiceDetail(null);
    }
    setIsCheckoutOpen(false);
  };
  const goStoreOrderPage = () => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const target = storePath(normalized, STORE_ORDER_SUBPAGE);
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.pushState({ storeSlug: normalized, storeSubpage: STORE_ORDER_SUBPAGE }, '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(STORE_ORDER_SUBPAGE);
    setRouteServiceItemId(null);
    setFnbOrderStep(checkoutResult ? 4 : 1);
    setCheckoutTab('checkout');
    setIsCheckoutOpen(false);
  };
  const goStoreCatalogPage = () => {
    const normalized = toSlug(selectedStore?.slug || routeSlug);
    if (!normalized || typeof window === 'undefined') return;
    const target = storePath(normalized);
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.pushState({ storeSlug: normalized, storeSubpage: null }, '', target);
    }
    setRouteSlug(normalized);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
    setFnbOrderStep(1);
  };

  const goDiscovery = () => {
    if (window.location.pathname !== TENANT_STORE_BASE_PATH) window.history.pushState({}, '', TENANT_STORE_BASE_PATH);
    setRouteSlug(null);
    setRouteSubpage(null);
    setRouteServiceItemId(null);
    setSelectedStore(null);
    setStoreLocations([]);
    setPrimaryLocationId(null);
    setSelectedLocationId(null);
    setHasSelectedBranchFromMenu(false);
    setPreferredStoreLocationSelection(null);
    setCatalog([]);
    setCatalogError('');
    setCatalogErrorGuidance('');
    setDiscoveryAppliedFilters(null);
    setIsCheckoutOpen(false);
  };

  const handleBranchMenuSelection = useCallback((nextValue) => {
    const nextLocationId = nextValue ? Number(nextValue) : null;
    setSelectedLocationId(nextLocationId);
    setHasSelectedBranchFromMenu(true);
  }, []);

  const cartTotal = useMemo(() => cart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.price)), 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [cart]);
  const storesWithNearestBranch = useMemo(() => {
    const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
    const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
    const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
    return (Array.isArray(stores) ? stores : [])
      .map((store) => {
        const slug = toSlug(store?.slug);
        const locationBundle = discoveryLocationMap[slug] || {};
        const allLocations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
        const activeLocations = allLocations.filter((location) => location?.is_active !== false);
        const pins = activeLocations
          .map((location) => ({
            ...location,
            latitude: toNumberOrNull(location?.latitude),
            longitude: toNumberOrNull(location?.longitude)
          }))
          .filter((location) => location.latitude != null && location.longitude != null);
        const matchingLocationIds = Array.isArray(store?.matching_location_ids)
          ? store.matching_location_ids
            .map((locationId) => Number(locationId))
            .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
          : [];
        const nearestMatchingLocationId = Number(store?.nearest_matching_location_id);
        const nearestMatchingLocation = Number.isInteger(nearestMatchingLocationId)
          ? (pins.find((location) => Number(location.location_id) === nearestMatchingLocationId) || null)
          : null;
        const primaryLocation = pins.find((location) => Number(location.location_id) === Number(locationBundle.primary_location_id))
          || pins.find((location) => location?.is_primary_storefront === true)
          || null;
        const fallbackLocation = nearestMatchingLocation || primaryLocation || pins[0] || null;
        const fallbackLat = toNumberOrNull(store?.latitude);
        const fallbackLng = toNumberOrNull(store?.longitude);
        const anchorLatitude = fallbackLocation?.latitude ?? fallbackLat ?? DEFAULT_CENTER.latitude;
        const anchorLongitude = fallbackLocation?.longitude ?? fallbackLng ?? DEFAULT_CENTER.longitude;
        const nearestPinWithDistance = hasDiscoveryLocation
          ? pins
            .map((location) => ({
              location,
              distance_km: haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
            }))
            .sort((a, b) => a.distance_km - b.distance_km)[0] || null
          : null;
        const nearestDistanceKm = nearestPinWithDistance?.distance_km
          ?? (Number.isFinite(Number(store?.distance_km)) ? Number(store.distance_km) : null);
        const nearestLocation = nearestPinWithDistance?.location || fallbackLocation;
        return {
          ...store,
          latitude: anchorLatitude,
          longitude: anchorLongitude,
          active_location_count: activeLocations.length,
          nearest_distance_km: nearestDistanceKm,
          nearest_location_name: nearestLocation?.name || null,
          nearest_location_id: nearestLocation?.location_id ?? null,
          nearest_is_primary: nearestLocation?.is_primary_storefront === true,
          match_reasons: Array.isArray(store?.match_reasons) ? store.match_reasons : [],
          matching_item_count: Number(store?.matching_item_count || 0),
          matching_item_sample: Array.isArray(store?.matching_item_sample) ? store.matching_item_sample : [],
          has_in_stock_match: store?.has_in_stock_match === true,
          matching_location_ids: matchingLocationIds,
          nearest_matching_location_id: Number.isInteger(nearestMatchingLocationId) ? nearestMatchingLocationId : null
        };
      })
      .sort((a, b) => {
        const left = Number.isFinite(a.nearest_distance_km) ? a.nearest_distance_km : Number.POSITIVE_INFINITY;
        const right = Number.isFinite(b.nearest_distance_km) ? b.nearest_distance_km : Number.POSITIVE_INFINITY;
        if (left !== right) return left - right;
        return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
      });
  }, [stores, discoveryCoords, discoveryLocationMap]);
  const discoveryMapPins = useMemo(() => {
    const discoveryLat = toNumberOrNull(discoveryCoords?.latitude);
    const discoveryLng = toNumberOrNull(discoveryCoords?.longitude);
    const hasDiscoveryLocation = discoveryLat != null && discoveryLng != null;
    const hasSearchQuery = search.trim().length > 0;
    const pins = [];
    storesWithNearestBranch.forEach((store) => {
      const slug = toSlug(store?.slug);
      const locationBundle = discoveryLocationMap[slug] || {};
      const locations = Array.isArray(locationBundle.locations) ? locationBundle.locations : [];
      const activeWithCoords = locations
        .filter((location) => location?.is_active !== false)
        .map((location) => ({
          ...location,
          latitude: toNumberOrNull(location?.latitude),
          longitude: toNumberOrNull(location?.longitude)
        }))
        .filter((location) => location.latitude != null && location.longitude != null);
      const matchingLocationIds = Array.isArray(store?.matching_location_ids)
        ? store.matching_location_ids
          .map((locationId) => Number(locationId))
          .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
        : [];
      const nearestMatchingLocationId = Number(store?.nearest_matching_location_id);
      const nearestMatchingLocation = Number.isInteger(nearestMatchingLocationId)
        ? (activeWithCoords.find((location) => Number(location.location_id) === nearestMatchingLocationId) || null)
        : null;
      if (activeWithCoords.length === 0) {
        const lat = toNumberOrNull(store?.latitude);
        const lng = toNumberOrNull(store?.longitude);
        if (lat == null || lng == null) return;
        pins.push({
          ...store,
          marker_key: `${slug}:fallback`,
          latitude: lat,
          longitude: lng,
          location_id: store?.location_id ?? null,
          location_name: store?.nearest_location_name || store?.tenant_name,
          branch_label: 'Storefront pin',
          distance_km: Number.isFinite(Number(store?.nearest_distance_km)) ? Number(store.nearest_distance_km) : null
        });
        return;
      }

      const scopedLocations = selectDiscoveryPinLocations({
        activeLocations: activeWithCoords,
        hasSearchQuery,
        pinScope: discoveryPinScope,
        matchingLocationIds,
        nearestMatchingLocationId: nearestMatchingLocation?.location_id ?? null
      });

      scopedLocations.forEach((location) => {
        pins.push({
          ...store,
          marker_key: `${slug}:${location.location_id}`,
          location_id: location.location_id,
          location_name: location.name || store?.tenant_name,
          address_line: location.address_line || store?.address_line || '',
          latitude: location.latitude,
          longitude: location.longitude,
          is_primary_storefront: location.is_primary_storefront === true,
          branch_label: location.is_primary_storefront ? 'Primary branch' : 'Branch',
          distance_km: hasDiscoveryLocation
            ? haversineDistanceKm(discoveryLat, discoveryLng, location.latitude, location.longitude)
            : null
        });
      });
    });
    return pins.sort((a, b) => {
      const left = Number.isFinite(Number(a.distance_km)) ? Number(a.distance_km) : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(Number(b.distance_km)) ? Number(b.distance_km) : Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return String(a?.tenant_name || '').localeCompare(String(b?.tenant_name || ''));
    });
  }, [storesWithNearestBranch, discoveryLocationMap, discoveryCoords, discoveryPinScope, search]);
  const discoveryPinsBySlug = useMemo(() => {
    const map = {};
    discoveryMapPins.forEach((pin) => {
      const slug = toSlug(pin?.slug);
      if (!slug) return;
      if (!Array.isArray(map[slug])) {
        map[slug] = [];
      }
      map[slug].push(pin);
    });
    return map;
  }, [discoveryMapPins]);
  const discoverySummary = useMemo(() => {
    const totalStores = storesWithNearestBranch.length;
    const openStores = storesWithNearestBranch.filter((store) => store.storefront_open).length;
    const totalCatalogItems = storesWithNearestBranch.reduce((sum, store) => sum + Number(store.catalog_count || 0), 0);
    const waitTotals = storesWithNearestBranch.reduce((sum, store) => sum + Number(store.estimated_wait_minutes || 0), 0);
    const avgWait = totalStores > 0 ? Math.round(waitTotals / totalStores) : 0;
    return {
      totalStores,
      openStores,
      totalCatalogItems,
      avgWait
    };
  }, [storesWithNearestBranch]);
  const nearestDistanceKm = useMemo(() => {
    const withDistance = storesWithNearestBranch
      .map((store) => Number(store?.nearest_distance_km))
      .filter((distance) => Number.isFinite(distance));
    if (withDistance.length === 0) return null;
    return Math.min(...withDistance);
  }, [storesWithNearestBranch]);
  const highlightedStore = useMemo(() => {
    if (!storesWithNearestBranch.length) return null;
    if (!highlightedStoreSlug) return storesWithNearestBranch[0];
    return storesWithNearestBranch.find((store) => store.slug === highlightedStoreSlug) || storesWithNearestBranch[0];
  }, [storesWithNearestBranch, highlightedStoreSlug]);
  const selectedLocation = useMemo(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) return null;
    if (selectedLocationId == null) return null;
    return storeLocations.find((location) => Number(location.location_id) === Number(selectedLocationId)) || null;
  }, [storeLocations, selectedLocationId]);
  const hasMultipleStoreBranches = Array.isArray(storeLocations) && storeLocations.length > 1;
  const accessCapabilities = useMemo(() => getAccessCapabilities(selectedStore), [selectedStore]);
  const catalogPermitted = canViewCatalog(selectedStore);
  const productCartPermitted = canUseProductCart(selectedStore);
  const checkoutPermitted = canUseCheckout(selectedStore);
  const bookingPermitted = canUseBooking(selectedStore);
  const serviceHeroModel = useMemo(() => {
    if (!selectedStore || !isServicesMode) return null;
    const mapStores = storeLocations.length > 0
      ? storeLocations.map((location) => ({ ...location, tenant_name: selectedStore?.tenant_name }))
      : [selectedStore];
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const galleryPreview = Array.isArray(supportingSectionModel?.galleryImages)
      ? supportingSectionModel.galleryImages.slice(0, 4).map((entry) => withAssetOrigin(entry.url || entry.path)).filter(Boolean)
      : [];
    const reviewSummary = supportingSectionModel?.reviewSummary || null;
    const serviceGroups = Array.isArray(servicesViewModel?.serviceGroups) ? servicesViewModel.serviceGroups : [];
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const preferredSocialContact = getPreferredSocialContact({ messengerLink, facebookLink });
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = String(heroSectionModel?.hours || selectedStore?.storefront_hours || '').trim();
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const directionsUrl = buildGoogleMapsDirectionsUrl({
      latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
      longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
      addressLine
    });
    const servicePreviewImages = serviceGroups
      .flatMap((group) => (Array.isArray(group?.items) ? group.items : []))
      .map((item) => withAssetOrigin(item?.image_url))
      .filter(Boolean);
    const mergedGalleryImages = [...new Set([...galleryPreview, ...servicePreviewImages])];
    const mergedGalleryPreview = mergedGalleryImages.slice(0, 4);
    const whyChooseUs = Array.isArray(overviewSectionModel?.whyChooseUs) && overviewSectionModel.whyChooseUs.length > 0
      ? overviewSectionModel.whyChooseUs.slice(0, 4)
      : buildServiceFallbackReasons({
        serviceGroups,
        servicesViewModel,
        categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories : []
      });
    const ratingLabel = formatRatingSummary(reviewSummary);
    const reviewCount = Number((reviewSummary?.total_count ?? reviewSummary?.totalCount) || 0);
    const serviceCounts = {
      total: Number(servicesViewModel?.totalServices || 0),
      families: Number(servicesViewModel?.serviceFamilyCount || 0),
      onSite: Number(servicesViewModel?.onSiteCount || 0)
    };
    const quickStats = [
      serviceCounts.total > 0 ? { label: 'Services', value: String(serviceCounts.total) } : null,
      serviceCounts.families > 0 ? { label: 'Categories', value: String(serviceCounts.families) } : null,
      reviewCount > 0 ? { label: 'Reviews', value: String(reviewCount) } : null
    ].filter(Boolean);

    return {
      coverImageUrl: withAssetOrigin(heroSectionModel?.coverImageUrl),
      profileImageUrl: withAssetOrigin(heroSectionModel?.profileImageUrl),
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      statusLabel: heroSectionModel?.statusLabel || (selectedStore?.storefront_open ? 'Open' : 'Closed'),
      ratingLabel,
      modeLabel: heroSectionModel?.primaryCategoryLabel || modeAdapter.heroEyebrow,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      aboutText: heroSectionModel?.aboutText || modeAdapter.heroDescription,
      categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories.slice(0, 3) : [],
      whyChooseUs,
      galleryImages: mergedGalleryImages,
      galleryPreview: mergedGalleryPreview,
      galleryOverflowCount: Math.max(0, (Array.isArray(supportingSectionModel?.galleryImages) ? supportingSectionModel.galleryImages.length : mergedGalleryPreview.length) - mergedGalleryPreview.length),
      reviewSummary,
      reviewHighlights: Array.isArray(supportingSectionModel?.reviewHighlights) ? supportingSectionModel.reviewHighlights : [],
      reviewCount,
      quickStats,
      serviceCounts,
      servicesLayoutMode,
      servicesWithRequiredIntakeCount: Number(servicesViewModel?.servicesWithRequiredIntakeCount || 0),
      servicesWithAvailabilityCount: Number(servicesViewModel?.servicesWithAvailabilityCount || 0),
      servicesWithStructuredScheduleCount: Number(servicesViewModel?.servicesWithStructuredScheduleCount || 0),
      prepaidServiceCount: Number(servicesViewModel?.prepaidServiceCount || 0),
      postpaidServiceCount: Number(servicesViewModel?.postpaidServiceCount || 0),
      hours,
      contactRows: [
        phone ? { icon: null, label: 'Call', value: phone, href: `tel:${phone}` } : null,
        preferredSocialContact ? { icon: null, label: preferredSocialContact.label, value: preferredSocialContact.value, href: preferredSocialContact.href } : null,
        email ? { icon: null, label: 'Email', value: email, href: `mailto:${email}` } : null
      ].filter(Boolean),
      actions: {
        canCall: Boolean(phone),
        callHref: phone ? `tel:${phone}` : '',
        canMessage: Boolean(messengerLink || email),
        messageHref: messengerLink || (email ? `mailto:${email}` : ''),
        canOrder: bookingPermitted || checkoutPermitted,
        orderLabel: modeAdapter.primaryActionLabel || 'Order Now'
      },
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean),
      mapStores,
      mapSelectedKey: selectedLocation?.location_id != null ? `loc-${selectedLocation.location_id}` : null,
      addressLine,
      facebookLink,
      directionsUrl,
      serviceGroups,
      registrationYear
    };
  }, [
    selectedStore,
    isServicesMode,
    storeLocations,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    servicesViewModel,
    servicesLayoutMode,
    heroSectionModel,
    modeAdapter.heroDescription,
    modeAdapter.heroEyebrow,
    modeAdapter.primaryActionLabel,
    bookingPermitted,
    checkoutPermitted
  ]);
  useEffect(() => {
    setIsAboutExpanded(false);
    setIsServiceGalleryExpanded(false);
  }, [selectedStore?.slug, selectedLocationId]);
  useEffect(() => {
    setIsReviewModalOpen(false);
    resetReviewDraft();
  }, [selectedStore?.slug]);
  useEffect(() => {
    setHasSelectedBranchFromMenu(false);
  }, [selectedStore?.slug]);
  const filteredCatalog = useMemo(() => filterCatalogItems(catalog, catalogSearch), [catalog, catalogSearch]);
  const baseFilteredFnbViewModel = useMemo(() => getFoodBeverageStorefrontViewModel(filteredCatalog), [filteredCatalog]);
  const filteredFnbCatalog = useMemo(() => (
    Array.isArray(baseFilteredFnbViewModel?.menuItems) ? baseFilteredFnbViewModel.menuItems : []
  ), [baseFilteredFnbViewModel]);
  const filteredFnbViewModel = useMemo(() => getFoodBeverageStorefrontViewModel(filteredFnbCatalog), [filteredFnbCatalog]);
  const fnbCommunityModel = useMemo(() => {
    if (!selectedStore) return null;
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = String(heroSectionModel?.hours || selectedStore?.storefront_hours || '').trim();
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const rawReviewSummary = supportingSectionModel?.reviewSummary || parseOptionalObject(selectedStore?.storefront_review_summary) || null;
    const reviewSummary = normalizeStorefrontReviewSummary(rawReviewSummary);
    const reviewHighlights = Array.isArray(supportingSectionModel?.reviewHighlights)
      ? supportingSectionModel.reviewHighlights.filter(Boolean)
      : [];
    const menuCategories = Array.isArray(filteredFnbViewModel?.menuSections)
      ? filteredFnbViewModel.menuSections.map((section) => ({
        key: section.sectionKey,
        label: section.sectionLabel,
        count: Number(section?.items?.length || 0)
      }))
      : [];
    return {
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      aboutText: heroSectionModel?.aboutText || modeAdapter.heroDescription,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      hours,
      reviewSummary,
      reviewHighlights,
      menuCategories,
      registrationYear,
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean)
    };
  }, [
    selectedStore,
    heroSectionModel,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    filteredFnbViewModel,
    modeAdapter.heroDescription
  ]);
  const simpleStorefrontModel = useMemo(() => {
    if (!selectedStore || !isSimpleMode) return null;
    const socialLinks = parseOptionalObject(selectedStore?.storefront_social_links) || {};
    const facebookLink = String(socialLinks.facebook || '').trim();
    const instagramLink = String(socialLinks.instagram || '').trim();
    const tiktokLink = String(socialLinks.tiktok || '').trim();
    const websiteLink = String(socialLinks.website || socialLinks.web || '').trim();
    const messengerLink = String(heroSectionModel?.messengerLink || socialLinks.messenger || '').trim();
    const preferredSocialContact = getPreferredSocialContact({ messengerLink, facebookLink });
    const email = String(heroSectionModel?.email || '').trim();
    const phone = String(heroSectionModel?.phone || '').trim();
    const hours = String(heroSectionModel?.hours || selectedStore?.storefront_hours || '').trim();
    const locationName = String(selectedLocation?.name || overviewSectionModel?.location?.label || selectedStore?.location_name || '').trim();
    const addressLine = formatStorefrontAddress(selectedLocation || overviewSectionModel?.location || selectedStore || {});
    const reviewSummary = supportingSectionModel?.reviewSummary || parseOptionalObject(selectedStore?.storefront_review_summary) || null;
    const reviewHighlights = Array.isArray(supportingSectionModel?.reviewHighlights)
      ? supportingSectionModel.reviewHighlights.filter(Boolean)
      : [];
    const productGroups = [...new Set(
      (Array.isArray(catalog) ? catalog : [])
        .map((item) => String(item?.categoryMeta?.label || item?.category_name || item?.category || '').trim())
        .filter(Boolean)
    )].slice(0, 5);
    const registrationYear = deriveStorefrontRegistrationYear(
      selectedStore?.business_registered_at
      || selectedStore?.registered_at
      || selectedStore?.tenant_created_at
      || selectedStore?.created_at
    );
    const mapStores = storeLocations.length > 0
      ? storeLocations.map((location) => ({ ...location, tenant_name: selectedStore?.tenant_name }))
      : [selectedStore];
    const whyChooseUs = Array.isArray(overviewSectionModel?.whyChooseUs) && overviewSectionModel.whyChooseUs.length > 0
      ? overviewSectionModel.whyChooseUs.slice(0, 4)
      : buildSimpleFallbackReasons({
          categories: Array.isArray(overviewSectionModel?.categories) ? overviewSectionModel.categories : [],
          catalog
        });
    const directionsUrl = buildGoogleMapsDirectionsUrl({
      latitude: selectedLocation?.latitude ?? selectedStore?.latitude,
      longitude: selectedLocation?.longitude ?? selectedStore?.longitude,
      addressLine
    });
    return {
      coverImageUrl: withAssetOrigin(heroSectionModel?.coverImageUrl),
      profileImageUrl: withAssetOrigin(heroSectionModel?.profileImageUrl),
      name: heroSectionModel?.storeName || selectedStore?.tenant_name || 'Storefront',
      tagline: heroSectionModel?.tagline || '',
      statusLabel: heroSectionModel?.statusLabel || (selectedStore?.storefront_open ? 'Open' : 'Closed'),
      ratingLabel: formatRatingSummary(reviewSummary),
      modeLabel: heroSectionModel?.primaryCategoryLabel || modeAdapter.heroEyebrow,
      locationLabel: addressLine || locationName || 'Location details coming soon',
      addressLine,
      aboutText: heroSectionModel?.aboutText || modeAdapter.heroDescription,
      whyChooseUs,
      hours,
      reviewSummary,
      reviewHighlights,
      productGroups,
      registrationYear,
      directionsUrl,
      footerLinks: [
        websiteLink ? { label: 'Website', href: websiteLink } : null,
        facebookLink ? { label: 'Facebook', href: facebookLink } : null,
        instagramLink ? { label: 'Instagram', href: instagramLink } : null,
        tiktokLink ? { label: 'TikTok', href: tiktokLink } : null,
        messengerLink ? { label: 'Messenger', href: messengerLink } : null,
        phone ? { label: 'Call', href: `tel:${phone}` } : null,
        email ? { label: 'Email', href: `mailto:${email}` } : null
      ].filter(Boolean),
      contactRows: [
        phone ? { icon: null, label: 'Call', value: phone, href: `tel:${phone}` } : null,
        preferredSocialContact ? { icon: null, label: preferredSocialContact.label, value: preferredSocialContact.value, href: preferredSocialContact.href } : null,
        email ? { icon: null, label: 'Email', value: email, href: `mailto:${email}` } : null
      ].filter(Boolean),
      actions: {
        canCall: Boolean(phone),
        callHref: phone ? `tel:${phone}` : '',
        canOrder: checkoutPermitted || productCartPermitted,
        orderLabel: modeAdapter.primaryActionLabel || 'Start Ordering'
      },
      mapStores,
      mapSelectedKey: selectedLocation?.location_id != null ? `loc-${selectedLocation.location_id}` : null
    };
  }, [
    selectedStore,
    isSimpleMode,
    heroSectionModel,
    selectedLocation,
    overviewSectionModel,
    supportingSectionModel,
    catalog,
    storeLocations,
    modeAdapter.heroDescription,
    modeAdapter.heroEyebrow,
    modeAdapter.primaryActionLabel,
    checkoutPermitted,
    productCartPermitted
  ]);
  const hasCatalogSearchQuery = catalogSearch.trim().length > 0;
  const catalogState = useMemo(() => {
    if (loadingCatalog) return 'loading';
    if (catalogError) return 'error';
    if (catalog.length === 0 && hasCatalogSearchQuery) return 'empty_search_on_zero';
    if (catalog.length === 0) return 'empty_setup';
    if (hasCatalogSearchQuery && filteredCatalog.length === 0) return 'empty_no_match';
    return 'ready';
  }, [loadingCatalog, catalogError, catalog.length, hasCatalogSearchQuery, filteredCatalog.length]);
  const isDeliveryOrder = orderMethod === 'delivery';
  const serviceCartLines = useMemo(() => cart.filter((line) => line.category === 'service'), [cart]);
  const productCartLines = useMemo(() => cart.filter((line) => line.category !== 'service'), [cart]);
  const serviceCartCount = useMemo(() => serviceCartLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [serviceCartLines]);
  const serviceCartTotal = useMemo(() => serviceCartLines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.price || 0)), 0), [serviceCartLines]);
  const hasServiceCart = serviceCartLines.length > 0;
  const hasMixedServiceCart = hasServiceCart && serviceCartLines.length !== cart.length;
  const firstServiceLine = serviceCartLines[0] || null;
  const isServicesCartDrawerMode = isServicesMode && !isBookingSubpage;
  const servicePaymentPolicy = firstServiceLine?.service_detail?.payment_policy || 'customer_choice';
  const selectedServicePaymentPolicy = selectedServiceDetail?.service_detail?.payment_policy || 'customer_choice';
  const serviceIntakeFields = useMemo(() => {
    return normalizeServiceFormFields(firstServiceLine?.service_detail?.intake_form_schema);
  }, [firstServiceLine]);
  const selectedServiceIntakeFields = useMemo(() => (
    normalizeServiceFormFields(selectedServiceDetail?.service_detail?.intake_form_schema)
  ), [selectedServiceDetail]);
  const missingRequiredIntake = useMemo(() => (
    serviceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [serviceIntakeFields, serviceIntakeResponses]);
  const serviceCartValidationIssues = missingRequiredIntake;
  const missingRequiredSelectedServiceIntake = useMemo(() => (
    selectedServiceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [selectedServiceIntakeFields, serviceIntakeResponses]);
  const servicePaymentOptions = useMemo(() => {
    return buildServicePaymentOptions(servicePaymentPolicy);
  }, [servicePaymentPolicy]);
  const selectedServicePaymentOptions = useMemo(() => (
    buildServicePaymentOptions(selectedServicePaymentPolicy)
  ), [selectedServicePaymentPolicy]);
  const hasStockViolation = useMemo(() => (
    cart.some((line) => Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY))
  ), [cart]);
  const totalsForDisplay = useMemo(() => {
    const subtotal = quoteResult?.subtotal_amount != null ? Number(quoteResult.subtotal_amount) : cartTotal;
    const serviceFee = quoteResult?.service_fee_amount != null
      ? Number(quoteResult.service_fee_amount)
      : round4(Math.max(0, subtotal) * DGFY_CONVENIENCE_FEE_RATE);
    const deliveryFee = quoteResult?.delivery_fee != null ? Number(quoteResult.delivery_fee) : 0;
    const totalAmount = quoteResult?.total_amount != null ? Number(quoteResult.total_amount) : subtotal + deliveryFee + serviceFee;
    return {
      subtotal_amount: subtotal,
      service_fee_amount: serviceFee,
      service_fee_label: quoteResult?.service_fee_label || DGFY_CONVENIENCE_FEE_LABEL,
      delivery_fee: deliveryFee,
      vatable_sales: quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount
    };
  }, [quoteResult, cartTotal]);
  const activeOrderMethodLabel = ORDER_METHOD_OPTIONS.find((option) => option.value === orderMethod)?.label || 'Checkout';
  const isDesktopCheckout = isDesktopViewport;
  const isStorefrontV2 = parseBooleanFlag(selectedStore?.storefront_ui_v2_enabled, false);
  const followEnabledForStore = parseBooleanFlag(selectedStore?.storefront_follow_enabled, false);
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh
  });
  const checkoutAllowed = canCheckout({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh
  }) && !hasMixedServiceCart && (!hasServiceCart || (Boolean(serviceAppointmentAt) && missingRequiredIntake.length === 0));
  const fnbCartStatusLabel = useMemo(() => {
    if (cartCount === 0) return 'Browse menu';
    if (hasStockViolation) return 'Update quantities';
    if (!quoteResult) return 'Quote required';
    if (quoteNeedsRefresh) return 'Refresh quote';
    if (checkoutAllowed) return 'Ready to checkout';
    return 'Review order';
  }, [cartCount, hasStockViolation, quoteResult, quoteNeedsRefresh, checkoutAllowed]);
  const fnbCartActionLabel = useMemo(() => {
    if (cartCount === 0) return 'Browse menu';
    if (isCheckoutOpen) return 'Close cart';
    if (hasStockViolation) return 'Review cart';
    if (!quoteResult || quoteNeedsRefresh) return 'Review and quote';
    return isMobileViewport ? 'Checkout' : 'View cart and checkout';
  }, [cartCount, hasStockViolation, isCheckoutOpen, isMobileViewport, quoteResult, quoteNeedsRefresh]);
  const fnbDrawerSupportLabel = useMemo(() => {
    if (cartCount === 0) return 'Add menu items to start an order.';
    if (hasStockViolation) return 'Adjust quantities that exceed available stock before checkout.';
    if (!quoteResult) return 'Review the cart, then request a fresh quote before checkout.';
    if (quoteNeedsRefresh) return 'Cart changed. Refresh the quote to sync totals and enable checkout.';
    return 'Everything is synced. You can continue through checkout.';
  }, [cartCount, hasStockViolation, quoteResult, quoteNeedsRefresh]);
  const activeBookingService = firstServiceLine || selectedServiceDetail || null;
  const bookingPageIntakeFields = hasServiceCart ? serviceIntakeFields : selectedServiceIntakeFields;
  const bookingPageMissingRequiredIntake = hasServiceCart ? missingRequiredIntake : missingRequiredSelectedServiceIntake;
  const bookingPagePaymentOptions = hasServiceCart ? servicePaymentOptions : selectedServicePaymentOptions;
  const bookingFieldPlan = useMemo(() => (
    buildServiceBookingFieldPlan({
      fields: bookingPageIntakeFields,
      serviceItem: activeBookingService
    })
  ), [bookingPageIntakeFields, activeBookingService]);
  const bookingStepOneAdditionalFields = useMemo(() => (
    [bookingFieldPlan.instructionField, ...bookingFieldPlan.remainingFields].filter(Boolean)
  ), [bookingFieldPlan.instructionField, bookingFieldPlan.remainingFields]);
  const selectedServiceDatePart = getDatePartFromAppointment(serviceAppointmentAt);
  const selectedServiceTimePart = getTimePartFromAppointment(serviceAppointmentAt);
  const bookingDateOptions = useMemo(() => buildServiceDateOptions(activeBookingService), [activeBookingService]);
  const bookingFallbackTimeSlotOptions = useMemo(() => buildServiceTimeSlotOptions(activeBookingService, selectedServiceDatePart), [activeBookingService, selectedServiceDatePart]);
  const bookingAvailabilitySlotOptions = useMemo(
    () => buildServiceAvailabilitySlotOptions(serviceAvailabilityState.slots),
    [serviceAvailabilityState.slots]
  );
  const bookingAvailabilityMatches = Number(serviceAvailabilityState.serviceItemId) === Number(activeBookingService?.item_id || 0)
    && serviceAvailabilityState.date === selectedServiceDatePart
    && Number(serviceAvailabilityState.quantity || 1) === Math.max(1, Number(serviceDraftQuantity || 1));
  const bookingAvailabilityMessage = serviceAvailabilityMessage({
    loading: serviceAvailabilityState.loading,
    error: serviceAvailabilityState.error,
    matches: bookingAvailabilityMatches,
    unavailableReason: serviceAvailabilityState.unavailableReason,
    diagnostics: serviceAvailabilityState.diagnostics,
    slots: bookingAvailabilitySlotOptions
  });
  const bookingTimeSlotOptions = useMemo(() => {
    if (!selectedServiceDatePart) return [];
    if (bookingAvailabilityMatches) {
      return serviceAvailabilityState.loading || serviceAvailabilityState.error
        ? []
        : bookingAvailabilitySlotOptions;
    }
    return bookingFallbackTimeSlotOptions;
  }, [
    selectedServiceDatePart,
    bookingAvailabilityMatches,
    serviceAvailabilityState.loading,
    serviceAvailabilityState.error,
    bookingAvailabilitySlotOptions,
    bookingFallbackTimeSlotOptions
  ]);
  const missingStepOneAdditionalFields = useMemo(() => (
    bookingStepOneAdditionalFields.filter((field) => !isBookingFieldComplete(field, serviceIntakeResponses[field.id]))
  ), [bookingStepOneAdditionalFields, serviceIntakeResponses]);
  const isAddressRequired = bookingFieldPlan.addressField?.required === true || bookingFieldPlan.requiresAddress;
  const missingCustomerInformation = useMemo(() => {
    const missing = [];
    if (!String(customerName || '').trim()) missing.push('Customer Name');
    if (!String(customerPhone || '').trim()) missing.push('Contact Number');
    if (bookingFieldPlan.emailField?.required && !String(customerEmail || '').trim()) missing.push('Email');
    if (isAddressRequired && !String(customerAddress || '').trim()) missing.push('Full Address');
    return missing;
  }, [bookingFieldPlan.emailField?.required, customerAddress, customerEmail, customerName, customerPhone, isAddressRequired]);
  const missingScheduleAndServiceInfo = useMemo(() => {
    const missing = [];
    if (!selectedServiceDatePart) missing.push('Preferred Date');
    if (!selectedServiceTimePart) missing.push('Preferred Time Slot');
    if (bookingFieldPlan.unitTypeField && bookingFieldPlan.unitTypeField.required && !String(serviceUnitType || '').trim()) {
      missing.push(bookingFieldPlan.unitTypeField.label);
    }
    if (bookingFieldPlan.unitCountField && bookingFieldPlan.unitCountField.required && !(Number(serviceDraftQuantity || 0) > 0)) {
      missing.push(bookingFieldPlan.unitCountField.label);
    }
    return missing;
  }, [bookingFieldPlan.unitCountField, bookingFieldPlan.unitTypeField, selectedServiceDatePart, selectedServiceTimePart, serviceDraftQuantity, serviceUnitType]);
  const stepOneComplete = missingCustomerInformation.length === 0
    && missingScheduleAndServiceInfo.length === 0
    && missingStepOneAdditionalFields.length === 0;
  const paymentStepComplete = Boolean(servicePaymentTiming);
  const reviewStepReady = stepOneComplete && paymentStepComplete;
  const serviceBookingSummaryTitle = activeBookingService?.variantName || activeBookingService?.name || 'Service booking';
  const serviceBookingSummarySchedule = formatServiceAppointmentSummary(serviceAppointmentAt);
  const bookingSummaryUnitPrice = hasServiceCart
    ? (Number(firstServiceLine?.price ?? 0) || 0)
    : (Number(activeBookingService?.default_sale_price ?? 0) || 0);
  const bookingSummaryQuantity = Math.max(1, Number(serviceDraftQuantity || 1));
  const bookingSummaryAmount = bookingSummaryUnitPrice * bookingSummaryQuantity;
  const openPreferredBookingDatePicker = useCallback(() => {
    const input = bookingPreferredDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall through to focus/click for browsers that block showPicker.
      }
    }
    input.focus();
    input.click();
  }, []);
  const registerBookingFieldRef = useCallback((key) => (node) => {
    if (!key) return;
    if (node) {
      bookingFieldRefs.current[key] = node;
    } else {
      delete bookingFieldRefs.current[key];
    }
  }, []);
  const jumpToBookingField = useCallback((step, fieldKey) => {
    setServiceBookingStep(step);
    setPendingBookingFocusKey(fieldKey);
  }, []);

  useEffect(() => {
    if (productCartPermitted && checkoutPermitted && bookingPermitted) return;
    if (cart.length === 0 && !quoteResult && !isCheckoutOpen) return;
    setCart([]);
    setQuoteResult(null);
    setQuoteNeedsRefresh(true);
    setIsCheckoutOpen(false);
  }, [productCartPermitted, checkoutPermitted, bookingPermitted, cart.length, quoteResult, isCheckoutOpen]);
  useEffect(() => {
    if (!isBookingSubpage) return;
    setIsCheckoutOpen(false);
  }, [isBookingSubpage]);

  useEffect(() => {
    if (!storesWithNearestBranch.length) {
      setHighlightedStoreSlug('');
      setHighlightedDiscoveryMarkerKey('');
      return;
    }
    if (!highlightedStoreSlug || !storesWithNearestBranch.some((store) => store.slug === highlightedStoreSlug)) {
      setHighlightedStoreSlug(storesWithNearestBranch[0].slug);
    }
    if (!highlightedDiscoveryMarkerKey || !discoveryMapPins.some((pin) => pin.marker_key === highlightedDiscoveryMarkerKey)) {
      setHighlightedDiscoveryMarkerKey(discoveryMapPins[0]?.marker_key || '');
    }
  }, [storesWithNearestBranch, highlightedStoreSlug, discoveryMapPins, highlightedDiscoveryMarkerKey]);
  useEffect(() => {
    if (!isStorePage) return;
    setQuoteNeedsRefresh(true);
  }, [cart, orderMethod, selectedLocationId, customerPin, serviceAppointmentAt, servicePaymentTiming, isStorePage]);
  useEffect(() => {
    const shouldCheckAvailability = (isBookingSubpage || isServiceDetailsSubpage)
      && activeBookingService?.item_id
      && selectedServiceDatePart
      && selectedStore?.slug;
    const quantity = Math.max(1, Number(serviceDraftQuantity || 1));
    if (!shouldCheckAvailability) {
      setServiceAvailabilityState((previous) => ({
        ...previous,
        serviceItemId: activeBookingService?.item_id || null,
        date: selectedServiceDatePart || '',
        quantity,
        loading: false,
        error: '',
        unavailableReason: null,
        diagnostics: null,
        slots: []
      }));
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      service_item_id: String(activeBookingService.item_id),
      date: selectedServiceDatePart,
      quantity: String(quantity),
      slot_interval_minutes: '30'
    });
    const resolvedLocationId = selectedLocationId ?? selectedStore?.location_id;
    if (resolvedLocationId) params.set('location_id', String(resolvedLocationId));
    if (activeBookingService.resource_id || activeBookingService.service_detail?.resource_id) {
      params.set('resource_id', String(activeBookingService.resource_id || activeBookingService.service_detail.resource_id));
    }

    setServiceAvailabilityState({
      serviceItemId: activeBookingService.item_id,
      date: selectedServiceDatePart,
      quantity,
      loading: true,
      error: '',
      unavailableReason: null,
      diagnostics: null,
      slots: []
    });
    requestJson(`/api/v1/store/services/availability?${params.toString()}`, {
      storeSlug: selectedStore.slug,
      signal: controller.signal
    })
      .then((data) => {
        setServiceAvailabilityState({
          serviceItemId: activeBookingService.item_id,
          date: selectedServiceDatePart,
          quantity,
          loading: false,
          error: '',
          unavailableReason: data?.unavailable_reason || null,
          diagnostics: data?.diagnostics || null,
          slots: Array.isArray(data?.slots) ? data.slots : []
        });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setServiceAvailabilityState({
          serviceItemId: activeBookingService.item_id,
          date: selectedServiceDatePart,
          quantity,
          loading: false,
          error: normalizeStorefrontErrorMessage(error, 'Unable to load service availability.'),
          unavailableReason: null,
          diagnostics: null,
          slots: []
        });
      });
    return () => controller.abort();
  }, [
    isBookingSubpage,
    isServiceDetailsSubpage,
    activeBookingService?.item_id,
    activeBookingService?.resource_id,
    activeBookingService?.service_detail?.resource_id,
    selectedServiceDatePart,
    serviceDraftQuantity,
    selectedLocationId,
    selectedStore?.location_id,
    selectedStore?.slug
  ]);
  useEffect(() => {
    if (!selectedServiceDatePart || !selectedServiceTimePart) return;
    if (!bookingAvailabilityMatches || serviceAvailabilityState.loading) return;
    if (serviceAvailabilityState.error) return;
    const selectedSlot = bookingAvailabilitySlotOptions.find((slot) => slot.value === selectedServiceTimePart);
    if (selectedSlot) return;
    setServiceAppointmentAt(combineDateWithEmptyTime(selectedServiceDatePart));
  }, [
    selectedServiceDatePart,
    selectedServiceTimePart,
    bookingAvailabilityMatches,
    serviceAvailabilityState.loading,
    serviceAvailabilityState.error,
    bookingAvailabilitySlotOptions
  ]);
  useEffect(() => {
    setServicePage(1);
  }, [catalogSearch, activeServiceTab, serviceSortOption, serviceAvailabilityFilter, serviceAreaFilter, serviceDurationFilter, servicePageSize, routeSlug, selectedLocationId]);
  useEffect(() => {
    setFnbPage(1);
  }, [catalogSearch, activeServiceTab, fnbPageSize, routeSlug, selectedLocationId, fnbSortOption]);
  useEffect(() => {
    setIsFnbCategoryDropdownOpen(false);
  }, [catalogSearch, activeServiceTab, routeSlug, selectedLocationId, fnbSortOption]);
  useEffect(() => {
    if (!isFnbCategoryDropdownOpen) return undefined;
    const handlePointerDown = (event) => {
      if (fnbCategoryDropdownRef.current && !fnbCategoryDropdownRef.current.contains(event.target)) {
        setIsFnbCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isFnbCategoryDropdownOpen]);
  useEffect(() => {
    if (!hasServiceCart) return;
    if (!servicePaymentOptions.some((option) => option.value === servicePaymentTiming)) {
      setServicePaymentTiming(servicePaymentOptions[0]?.value || 'postpaid');
    }
  }, [hasServiceCart, servicePaymentOptions, servicePaymentTiming]);
  useEffect(() => {
    if (!selectedServiceDetail) return;
    if (!selectedServicePaymentOptions.some((option) => option.value === servicePaymentTiming)) {
      setServicePaymentTiming(selectedServicePaymentOptions[0]?.value || 'postpaid');
    }
  }, [selectedServiceDetail, selectedServicePaymentOptions, servicePaymentTiming]);
  useEffect(() => {
    if (!selectedServiceDetail) return;
    const matchesCurrentService = Number(selectedServiceDetail.item_id) === Number(firstServiceLine?.item_id);
    setServiceDraftQuantity(matchesCurrentService ? Math.max(1, Number(firstServiceLine?.quantity || 1)) : 1);
    setServiceDraftNotes(matchesCurrentService ? String(firstServiceLine?.service_notes || '') : '');
    if (!matchesCurrentService) {
      setServiceAppointmentAt('');
      setServiceIntakeResponses({});
      setServiceUnitType('');
    }
  }, [selectedServiceDetail, firstServiceLine]);
  useEffect(() => {
    setServiceIntakeResponses({});
    setServiceUnitType('');
    setServicePaymentPreviewMethod('qr');
    setServicePaymentPreviewCard({ cardholder: '', cardNumber: '', expiry: '', cvv: '' });
    setServicePaymentPreviewReceiptName('');
  }, [firstServiceLine?.item_id]);
  useEffect(() => {
    if (!hasServiceCart || !firstServiceLine) {
      setServiceDraftQuantity(1);
      setServiceDraftNotes('');
      if (!selectedServiceDetail) {
        setServiceAppointmentAt('');
        setServiceIntakeResponses({});
      }
      return;
    }
    setServiceDraftQuantity(Math.max(1, Number(firstServiceLine.quantity || 1)));
    setServiceDraftNotes(String(firstServiceLine.service_notes || ''));
  }, [hasServiceCart, firstServiceLine, selectedServiceDetail]);
  useEffect(() => {
    if (!isBookingSubpage) return;
    if (activeBookingService) {
      setServiceBookingStep(1);
    }
  }, [isBookingSubpage, hasServiceCart, activeBookingService?.item_id]);
  useEffect(() => {
    if (bookingFieldPlan.customerNameField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.customerNameField.id] === customerName
          ? previous
          : { ...previous, [bookingFieldPlan.customerNameField.id]: customerName }
      ));
    }
    if (bookingFieldPlan.contactNumberField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.contactNumberField.id] === customerPhone
          ? previous
          : { ...previous, [bookingFieldPlan.contactNumberField.id]: customerPhone }
      ));
    }
    if (bookingFieldPlan.emailField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.emailField.id] === customerEmail
          ? previous
          : { ...previous, [bookingFieldPlan.emailField.id]: customerEmail }
      ));
    }
    if (bookingFieldPlan.addressField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.addressField.id] === customerAddress
          ? previous
          : { ...previous, [bookingFieldPlan.addressField.id]: customerAddress }
      ));
    }
    if (bookingFieldPlan.preferredDateField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.preferredDateField.id] === selectedServiceDatePart
          ? previous
          : { ...previous, [bookingFieldPlan.preferredDateField.id]: selectedServiceDatePart }
      ));
    }
    if (bookingFieldPlan.preferredTimeField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.preferredTimeField.id] === selectedServiceTimePart
          ? previous
          : { ...previous, [bookingFieldPlan.preferredTimeField.id]: selectedServiceTimePart }
      ));
    }
    if (bookingFieldPlan.unitTypeField?.id) {
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.unitTypeField.id] === serviceUnitType
          ? previous
          : { ...previous, [bookingFieldPlan.unitTypeField.id]: serviceUnitType }
      ));
    }
    if (bookingFieldPlan.unitCountField?.id) {
      const nextQuantity = String(Math.max(1, Number(serviceDraftQuantity || 1)));
      setServiceIntakeResponses((previous) => (
        previous[bookingFieldPlan.unitCountField.id] === nextQuantity
          ? previous
          : { ...previous, [bookingFieldPlan.unitCountField.id]: nextQuantity }
      ));
    }
  }, [
    bookingFieldPlan.addressField?.id,
    bookingFieldPlan.contactNumberField?.id,
    bookingFieldPlan.customerNameField?.id,
    bookingFieldPlan.emailField?.id,
    bookingFieldPlan.preferredDateField?.id,
    bookingFieldPlan.preferredTimeField?.id,
    bookingFieldPlan.unitCountField?.id,
    bookingFieldPlan.unitTypeField?.id,
    customerAddress,
    customerEmail,
    customerName,
    customerPhone,
    selectedServiceDatePart,
    selectedServiceTimePart,
    serviceDraftQuantity,
    serviceUnitType
  ]);
  useEffect(() => {
    if (!pendingBookingFocusKey) return;
    const node = bookingFieldRefs.current[pendingBookingFocusKey];
    if (!node) return;
    const timer = window.requestAnimationFrame(() => {
      const focusTarget = typeof node.focus === 'function'
        ? node
        : node.querySelector?.('input, textarea, button, [tabindex]:not([tabindex="-1"])');
      node.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      focusTarget?.focus?.();
      setPendingBookingFocusKey('');
    });
    return () => window.cancelAnimationFrame(timer);
  }, [pendingBookingFocusKey, serviceBookingStep]);
  useEffect(() => {
    if (!isBookingSubpage || !activeBookingService || selectedServiceDatePart) return;
    const firstDate = bookingDateOptions[0]?.value || '';
    if (!firstDate) return;
    setServiceAppointmentAt(combineDateAndTimeParts(firstDate, getPreferredBookingTimeForDate(activeBookingService, firstDate, selectedServiceTimePart)));
  }, [isBookingSubpage, activeBookingService, bookingDateOptions, selectedServiceDatePart, selectedServiceTimePart]);
  useEffect(() => {
    if (!isServiceDetailsSubpage) return;
    if (!routeServiceItemId) {
      setSelectedServiceDetail(null);
      return;
    }
    const matchedService = (Array.isArray(catalog) ? catalog : []).find((item) => String(item?.item_id) === String(routeServiceItemId));
    if (matchedService) {
      setSelectedServiceDetail((previous) => (String(previous?.item_id) === String(matchedService.item_id) ? previous : matchedService));
    } else if (!loadingCatalog) {
      setSelectedServiceDetail(null);
    }
  }, [catalog, isServiceDetailsSubpage, loadingCatalog, routeServiceItemId]);
  useEffect(() => {
    if (!Array.isArray(storeLocations) || storeLocations.length === 0) {
      if (selectedLocationId != null) setSelectedLocationId(null);
      return;
    }
    const exists = storeLocations.some((location) => Number(location.location_id) === Number(selectedLocationId));
    if (!exists) {
      const primaryLocation = primaryLocationId == null
        ? null
        : (storeLocations.find((location) => Number(location.location_id) === Number(primaryLocationId)) || null);
      const firstOpenLocation = storeLocations.find((location) => location?.is_open !== false) || null;
      const fallbackLocationId = (firstOpenLocation?.location_id ?? primaryLocation?.location_id ?? storeLocations[0]?.location_id ?? null);
      setSelectedLocationId(fallbackLocationId);
    }
  }, [storeLocations, selectedLocationId, primaryLocationId]);

  const playCartAddedSound = () => {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const audioContext = new AudioContextCtor();
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.connect(audioContext.destination);

      const notes = [
        { frequency: 523.25, start: 0, duration: 0.09 },
        { frequency: 659.25, start: 0.1, duration: 0.12 }
      ];

      notes.forEach((note) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, audioContext.currentTime + note.start);
        oscillator.connect(gainNode);
        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime + note.start);
        gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + note.start + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + note.start + note.duration);
        oscillator.start(audioContext.currentTime + note.start);
        oscillator.stop(audioContext.currentTime + note.start + note.duration);
      });

      window.setTimeout(() => {
        try {
          audioContext.close();
        } catch {
          // Ignore close failures.
        }
      }, 320);
    } catch {
      // Ignore sound failures and keep cart interaction silent.
    }
  };

  const addToCart = (item) => {
    if (isServiceCatalogItem(item) ? !bookingPermitted : !productCartPermitted) {
      toast.error('This storefront is not accepting online checkout right now.');
      return;
    }
    let stockWarning = '';
    const normalizedItemId = Number(item?.item_id);
    if (Number.isFinite(normalizedItemId)) {
      setCartImageErrors((prev) => {
        if (!prev.has(normalizedItemId)) return prev;
        const next = new Set(prev);
        next.delete(normalizedItemId);
        return next;
      });
    }
    setCart((prev) => {
      const isServiceItem = isServiceCatalogItem(item);
      const found = isServiceItem ? null : prev.find((l) => Number(l.item_id) === Number(item.item_id));
      const price = Number(item.default_sale_price ?? 0);
      const maxStock = isItemAvailable(item) ? Number.POSITIVE_INFINITY : 0;
      const lineModifiers = isServiceItem ? [] : getDefaultFnbLineModifiers(item);
      const baseLine = {
        item_id: item.item_id,
        name: item.name,
        variantName: item.variantName || '',
        category: isServiceItem ? 'service' : String(item.category || '').trim().toLowerCase(),
        service_detail: item.service_detail || null,
        quantity: 1,
        price: price + getFnbLineModifierDelta(lineModifiers),
        image_url: withAssetOrigin(item.image_url) || null,
        unit_of_measure: item.unit_of_measure || '',
        max_stock: maxStock,
        serviceAreaLabel: item.serviceAreaLabel || '',
        durationLabel: item.durationLabel || '',
        cart_line_id: isServiceItem ? `svc-${item.item_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : `item-${item.item_id}`,
        line_modifiers: lineModifiers
      };
      if (found) {
        const requestedQty = Number(found.quantity) + 1;
        const safeQty = Math.max(0, Math.min(requestedQty, maxStock));
        if (requestedQty > maxStock) {
          stockWarning = buildStockExceededMessage({
            item_name: item.name,
            requested_qty: requestedQty,
            available_stock: maxStock,
            unit_of_measure: item.unit_of_measure || ''
          });
        }
        return prev.map((line) => Number(line.item_id) === Number(item.item_id)
          ? { ...line, quantity: safeQty, max_stock: maxStock }
          : line);
      }
      if (isServiceItem) {
        const nextServiceLines = prev.filter((line) => line.category === 'service');
        if (nextServiceLines.length !== prev.length) {
          stockWarning = 'Book each service draft separately from product orders.';
        }
        return [...nextServiceLines, baseLine];
      }
      return [...prev, {
        ...baseLine,
        quantity: maxStock > 0 ? 1 : 0
      }];
    });
    setCheckoutTab(isFnbMode ? 'cart' : 'review');
    setIsCheckoutOpen(true);
    playCartAddedSound();
    toast.success(`${item?.variantName || item?.name || 'Item'} added successfully!`);
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };
  const handleServicesCartCheckout = () => {
    if (cart.length === 0) {
      toast.error('Your cart is empty.');
      return;
    }
    if (hasMixedServiceCart) {
      toast.error('Book services separately from regular product orders.');
      return;
    }
    if (!hasServiceCart || !firstServiceLine) {
      toast.error('Add a service to your cart first.');
      return;
    }
    setIsCheckoutOpen(false);
    goStoreBookingPage();
  };
  const openServiceBookingPanel = (nextTab = 'review') => {
    setCheckoutTab(nextTab);
    setIsCheckoutOpen(true);
  };
  const openTrackPanel = () => {
    setCheckoutTab('track');
    setIsCheckoutOpen(true);
  };
  const openAccountPanel = () => {
    setCheckoutTab('account');
    setIsCheckoutOpen(true);
    handleLoadAccountPanel();
  };
  const beginServiceBooking = (serviceItem) => {
    if (!serviceItem) return;
    setSelectedServiceDetail(serviceItem);
    setCheckoutError('');
    setQuoteError('');
    setCheckoutResult(null);
    if (isServicesMode) {
      goStoreBookingPage({ preserveSelectedService: true });
      return;
    }
    openServiceBookingPanel('review');
  };
  const saveServiceBookingDraft = (serviceItem = selectedServiceDetail, nextTab = 'review') => {
    if (!serviceItem) return;
    if (!bookingPermitted || accessCapabilities.booking === false) {
      const message = 'This storefront is not accepting service bookings right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (cart.some((line) => line.category !== 'service')) {
      const message = 'Book services separately from regular product orders.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!serviceAppointmentAt) {
      const message = 'Choose a preferred appointment date and time before adding this booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (missingRequiredSelectedServiceIntake.length > 0) {
      const message = `Complete required intake question: ${missingRequiredSelectedServiceIntake[0].label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    const editingCartLineId = serviceItem.cart_line_id || null;
    const nextServiceLine = {
      item_id: serviceItem.item_id,
      name: serviceItem.name,
      variantName: serviceItem.variantName || '',
      category: 'service',
      service_detail: serviceItem.service_detail || null,
      cart_line_id: editingCartLineId || `svc-${serviceItem.item_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
      price: Number(serviceItem.default_sale_price ?? 0),
      image_url: withAssetOrigin(serviceItem.image_url) || null,
      unit_of_measure: serviceItem.unit_of_measure || '',
      max_stock: Number.POSITIVE_INFINITY,
      service_notes: String(serviceDraftNotes || '').trim(),
      service_schedule_at: serviceAppointmentAt,
      payment_timing: servicePaymentTiming,
      intake_responses: selectedServiceIntakeFields.length > 0 ? serviceIntakeResponses : null
    };
    setCart((previous) => {
      const serviceLines = previous.filter((line) => line.category === 'service');
      if (editingCartLineId) {
        return serviceLines.map((line) => line.cart_line_id === editingCartLineId ? nextServiceLine : line);
      }
      return [...serviceLines, nextServiceLine];
    });
    setCheckoutError('');
    setQuoteError('');
    setQuoteResult(null);
    setQuoteNeedsRefresh(true);
    setSelectedServiceDetail(null);
    if (isServicesMode) {
      goStoreBookingPage();
    } else {
      openServiceBookingPanel(nextTab);
    }
    toast.success(editingCartLineId ? 'Booking summary updated.' : 'Service added to your booking summary.');
  };
  const openServiceCartEditor = (line = firstServiceLine) => {
    if (!line) return;
    setSelectedServiceDetail(line);
  };

  const removeCartItem = (lineKey) => {
    setCart((prev) => prev.filter((line) => String(line.cart_line_id || line.item_id) !== String(lineKey)));
  };

  const updateQty = (lineKey, qty) => {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      setCart((prev) => prev.filter((line) => String(line.cart_line_id || line.item_id) !== String(lineKey)));
      return;
    }
    let stockWarning = '';
    setCart((prev) => prev.map((line) => {
      if (String(line.cart_line_id || line.item_id) !== String(lineKey)) return line;
      const maxStock = Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock) : Number.POSITIVE_INFINITY;
      const safeQty = Math.min(parsed, maxStock);
      if (parsed > maxStock) {
        stockWarning = buildStockExceededMessage({
          item_name: line.name,
          requested_qty: parsed,
          available_stock: maxStock,
          unit_of_measure: line.unit_of_measure || ''
        });
      }
      return { ...line, quantity: safeQty };
    }));
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

  const checkoutPayload = () => ({
    location_id: selectedLocationId ?? selectedStore?.location_id,
    order_method: orderMethod,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    delivery_address: isDeliveryOrder ? customerAddress : '',
    delivery_latitude: isDeliveryOrder ? toNumberOrNull(customerPin?.latitude) : null,
    delivery_longitude: isDeliveryOrder ? toNumberOrNull(customerPin?.longitude) : null,
    scheduled_for: fnbScheduledFor ? new Date(fnbScheduledFor).toISOString() : null,
    special_instructions: String(fnbSpecialInstructions || '').trim(),
    lines: cart.map((line) => ({
      item_id: Number(line.item_id),
      quantity: Number(line.quantity),
      ...(Array.isArray(line.line_modifiers) && line.line_modifiers.length > 0 ? { line_modifiers: line.line_modifiers } : {})
    }))
  });

  const handlePinMyLocation = () => {
    if (!navigator?.geolocation) {
      setPinLocationError('Geolocation is not supported on this device/browser.');
      return;
    }
    setPinLocationError('');
    setPinLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerPin({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        });
        setPinLocationLoading(false);
      },
      () => {
        setPinLocationError('Unable to get your current location.');
        setPinLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  useEffect(() => {
    const slug = String(selectedStore?.slug || '').trim().toLowerCase();
    if (!isStorePage || !isStorefrontV2 || !followEnabledForStore || !slug || !storefrontVisitorId) {
      setFollowState({ loading: false, isFollowing: false, followersCount: 0 });
      return;
    }
    let cancelled = false;
    const loadFollowStatus = async () => {
      setFollowState((prev) => ({ ...prev, loading: true }));
      try {
        const token = readStoreAuthToken();
        const status = await requestJson(`/api/v1/store/follow/status?storefront_slug=${encodeURIComponent(slug)}&visitor_id=${encodeURIComponent(storefrontVisitorId)}`, {
          method: 'GET',
          storeSlug: slug,
          authToken: token
        });
        if (cancelled) return;
        setFollowState({
          loading: false,
          isFollowing: status?.is_following === true,
          followersCount: Number(status?.followers_count || 0),
          error: ''
        });
      } catch {
        if (cancelled) return;
        setFollowState({ loading: false, isFollowing: false, followersCount: 0, error: 'Follow status unavailable.' });
      }
    };
    loadFollowStatus();
    return () => {
      cancelled = true;
    };
  }, [isStorePage, isStorefrontV2, followEnabledForStore, selectedStore?.slug, storefrontVisitorId]);

  const handleFollowAction = async () => {
    const slug = String(selectedStore?.slug || '').trim().toLowerCase();
    if (!slug || !storefrontVisitorId || followState.loading) return;
    const nextIsFollowing = !followState.isFollowing;
    setFollowState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const token = readStoreAuthToken();
      const response = await requestJson('/api/v1/store/follow', {
        method: nextIsFollowing ? 'POST' : 'DELETE',
        storeSlug: slug,
        authToken: token,
        body: {
          storefront_slug: slug,
          visitor_id: storefrontVisitorId
        }
      });
      setFollowState({
        loading: false,
        isFollowing: response?.is_following === true,
        followersCount: Number(response?.followers_count || 0),
        error: ''
      });
      toast.success(response?.is_following ? 'Storefront followed.' : 'Storefront unfollowed.');
    } catch (error) {
      let followError = normalizeStorefrontErrorMessage(error, 'Unable to update follow status.');
      if (Number(error?.status) === 404) {
        followError = 'Storefront is unavailable for follow.';
      } else if (Number(error?.status) === 429) {
        followError = 'Too many follow requests. Please wait and retry.';
      }
      setFollowState((prev) => ({ ...prev, loading: false, error: followError }));
      toast.error(followError);
    }
  };

  const handleShareAction = async () => {
    const targetUrl = typeof window !== 'undefined' ? window.location.href : '';
    const sharePayload = {
      title: selectedStore?.tenant_name || 'Storefront',
      text: selectedStore?.storefront_tagline || `${DGFY_BRAND_NAME} tenant storefront`,
      url: targetUrl
    };
    try {
      if (navigator?.share) {
        await navigator.share(sharePayload);
        return;
      }
      if (navigator?.clipboard?.writeText && targetUrl) {
        await navigator.clipboard.writeText(targetUrl);
        toast.success('Storefront link copied.');
        return;
      }
    } catch {
      // fallback to toast below
    }
    toast.info('Sharing is unavailable in this browser.');
  };

  const resetReviewDraft = () => {
    setReviewDraft({
      name: '',
      anonymous: false,
      rating: 0,
      message: ''
    });
  };

  const handleReviewDraftSubmit = () => {
    if (!String(reviewDraft.name || '').trim()) {
      toast.error('Enter your name before sending a review.');
      return;
    }
    if (!Number(reviewDraft.rating)) {
      toast.error('Choose a star rating before sending a review.');
      return;
    }
    if (!String(reviewDraft.message || '').trim()) {
      toast.error('Write a short review message before sending.');
      return;
    }
    toast.info('Review submission UI is ready. Backend publishing will be connected later.');
    setIsReviewModalOpen(false);
    resetReviewDraft();
  };

  const handleFnbReservationRequest = async (event) => {
    event?.preventDefault?.();
    if (!selectedStore?.slug) return;
    setFnbReservationLoading(true);
    setFnbReservationError('');
    setFnbReservationResult(null);
    try {
      const data = await requestJson('/api/v1/store/fnb/reservations', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        body: {
          ...fnbReservationForm,
          location_id: selectedLocationId ?? selectedStore?.location_id
        }
      });
      setFnbReservationResult(data);
      toast.success('Reservation request sent.');
    } catch (error) {
      const message = normalizeStorefrontErrorMessage(error, 'Unable to send reservation request.');
      setFnbReservationError(message);
      toast.error(message);
    } finally {
      setFnbReservationLoading(false);
    }
  };

  const handleQuote = async () => {
    if (!selectedStore) return;
    setQuoteError('');
    if (!checkoutPermitted || accessCapabilities.quote === false) {
      const message = 'This storefront is not accepting online checkout right now.';
      setQuoteError(message);
      toast.error(message);
      return;
    }
    try {
      const data = await requestJson('/api/v1/store/cart/quote', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken: readStoreAuthToken(),
        body: checkoutPayload()
      });
      setQuoteResult(data);
      setQuoteNeedsRefresh(false);
      toast.success('Quote updated.');
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      const message = normalizeStorefrontErrorMessage(error, 'Unable to compute quote.');
      setQuoteError(message);
      toast.error(message);
    }
  };

  const ensureServiceBookingHold = async (serviceLine) => {
    if (hasFreshServiceHold(serviceLine)) return serviceLine;
    const appointmentAt = serviceLine?.service_schedule_at || serviceAppointmentAt;
    if (!selectedStore?.slug || !appointmentAt) return serviceLine;
    const hold = await requestJson('/api/v1/store/services/holds', {
      method: 'POST',
      storeSlug: selectedStore.slug,
      authToken: readStoreAuthToken(),
      body: {
        service_item_id: Number(serviceLine.item_id),
        location_id: selectedLocationId ?? selectedStore?.location_id,
        start_at: new Date(appointmentAt).toISOString(),
        quantity: Math.max(1, Number(serviceLine.quantity || 1)),
        replace_hold_token: serviceLine.service_hold_token || null
      }
    });
    const nextLine = {
      ...serviceLine,
      service_hold_token: hold?.hold_token || hold?.service_hold_token || '',
      service_hold_expires_at: hold?.expires_at || hold?.service_hold_expires_at || null
    };
    setCart((previous) => previous.map((line) => (
      String(line.cart_line_id || line.item_id) === String(serviceLine.cart_line_id || serviceLine.item_id) ? nextLine : line
    )));
    return nextLine;
  };

  const handleCheckout = async () => {
    if (!selectedStore) return;
    setCheckoutError('');
    setCheckoutResult(null);
    const serviceBookingLine = hasServiceCart
      ? firstServiceLine
      : (isServicesMode && activeBookingService
        ? {
          item_id: activeBookingService.item_id,
          name: activeBookingService.name,
          variantName: activeBookingService.variantName || '',
          category: 'service',
          service_detail: activeBookingService.service_detail || null,
          quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
          price: Number(activeBookingService.default_sale_price ?? 0),
          image_url: withAssetOrigin(activeBookingService.image_url) || null,
          unit_of_measure: activeBookingService.unit_of_measure || '',
          max_stock: Number.POSITIVE_INFINITY,
          service_notes: '',
          service_schedule_at: serviceAppointmentAt,
          payment_timing: servicePaymentTiming,
          intake_responses: bookingPageIntakeFields.length > 0 ? serviceIntakeResponses : null
        }
        : null);
    if (checkoutBlockReason === 'stock_violation') {
      const message = 'Cannot checkout: one or more items exceed current stock.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'access_mode') {
      const message = 'This storefront is not accepting online checkout right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && checkoutBlockReason === 'missing_quote') {
      const message = 'Please click Quote first before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && checkoutBlockReason === 'stale_quote') {
      const message = 'Your cart changed. Please refresh Quote before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (hasMixedServiceCart) {
      const message = 'Book services separately from regular product orders.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if ((hasServiceCart || (isServicesMode && activeBookingService)) && !serviceAppointmentAt) {
      const message = 'Choose an appointment date and time before booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if ((hasServiceCart && missingRequiredIntake.length > 0) || (!hasServiceCart && isServicesMode && bookingPageMissingRequiredIntake.length > 0)) {
      const firstMissingField = hasServiceCart ? missingRequiredIntake[0] : bookingPageMissingRequiredIntake[0];
      const message = `Complete required intake question: ${firstMissingField.label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    const cartSnapshot = cart.map((line) => ({ ...line }));
    setCheckoutLoading(true);
    try {
      const authToken = readStoreAuthToken();
      const heldServiceCartLines = hasServiceCart
        ? await Promise.all(serviceCartLines.map(async (draftLine) => {
          const line = {
            ...draftLine,
            service_schedule_at: draftLine.service_schedule_at || serviceAppointmentAt,
            payment_timing: draftLine.payment_timing || servicePaymentTiming
          };
          return ensureServiceBookingHold(line);
        }))
        : (isServicesMode && serviceBookingLine ? [await ensureServiceBookingHold(serviceBookingLine)] : []);
      const data = (hasServiceCart || (isServicesMode && serviceBookingLine))
        ? await requestJson('/api/v1/store/services/bookings/batch', {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: {
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            location_id: selectedLocationId ?? selectedStore?.location_id,
            idempotency_key: createStorefrontIdempotencyKey('service-batch'),
            bookings: heldServiceCartLines.map((line) => ({
              service_item_id: Number(line.item_id),
              start_at: new Date(line.service_schedule_at || serviceAppointmentAt).toISOString(),
              quantity: Math.max(1, Number(line.quantity || 1)),
              payment_timing: line.payment_timing || servicePaymentTiming,
              intake_responses: line?.intake_responses || {},
              service_hold_token: line.service_hold_token || null,
              notes: [
                Number(line.quantity || 1) > 1 ? `Service quantity/package count: ${line.quantity}` : '',
                !bookingFieldPlan.addressField && String(customerAddress || '').trim()
                  ? `Service address: ${String(customerAddress || '').trim()}`
                  : '',
                String(line.service_notes || '').trim()
              ].filter(Boolean).join('\n')
            }))
          }
        })
        : await requestJson('/api/v1/store/checkout', {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: {
            ...checkoutPayload(),
            idempotency_key: createStorefrontIdempotencyKey('store'),
            payment_type: fnbPaymentType
          }
        });
      setCheckoutResult({
        ...data,
        cart_lines: hasServiceCart
          ? heldServiceCartLines
          : cartSnapshot,
        totals: totalsForDisplay
      });
      if (data?.tracking_pin) {
        setTrackingPinInput(data.tracking_pin);
        setCheckoutTab('track');
      }
      if (data?.booking?.public_reference) {
        setTrackingPinInput(data.booking.public_reference);
      }
      if (hasServiceCart || (isServicesMode && serviceBookingLine)) {
        setCart((prev) => prev.filter((line) => line.category !== 'service'));
      } else {
        setCart([]);
      }
      setQuoteResult(null);
      setQuoteNeedsRefresh(true);
      setServiceAppointmentAt('');
      setServiceDraftQuantity(1);
      setServiceDraftNotes('');
      setServiceIntakeResponses({});
      setServicePaymentPreviewMethod('qr');
      setServicePaymentPreviewCard({ cardholder: '', cardNumber: '', expiry: '', cvv: '' });
      setServicePaymentPreviewReceiptName('');
      setFnbOrderStep(4);
      toast.success(hasServiceCart ? 'Booking created.' : 'Checkout completed.');
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setCheckoutError(message);
        toast.error(message);
        return;
      }
      const message = hasServiceCart
        ? serviceBatchFailureMessage(error, serviceCartLines)
        : normalizeStorefrontErrorMessage(error, 'Unable to complete checkout.');
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDownloadCheckoutImage = async () => {
    if (!checkoutResult) return;
    try {
      const reference = checkoutResult.booking?.public_reference || checkoutResult.tracking_pin || checkoutResult.order?.tracking_pin || 'ticket';
      const dataUrl = await buildTicketImage({
        result: checkoutResult,
        storeName: selectedStore?.tenant_name || routeSlug || DGFY_BRAND_NAME,
        cartLines: Array.isArray(checkoutResult.cart_lines) ? checkoutResult.cart_lines : cart,
        totals: checkoutResult.totals || totalsForDisplay
      });
      downloadDataUrl(dataUrl, `${String(reference).toLowerCase()}-ticket.png`);
    } catch {
      toast.error('Unable to generate ticket image.');
    }
  };

  const handleTrack = async () => {
    setTrackingError('');
    setTrackingResult(null);
    try {
      const pin = trackingPinInput.trim().toUpperCase();
      if (!pin || !selectedStore?.slug) throw new Error('Select a storefront and enter a valid tracking pin.');
      const data = await requestJson(`/api/v1/store/track/${encodeURIComponent(pin)}`, { storeSlug: selectedStore.slug });
      setTrackingResult(data);
    } catch (error) {
      setTrackingError(normalizeStorefrontErrorMessage(error, 'Tracking failed.'));
    }
  };

  const handleLoadAccountPanel = async () => {
    if (!selectedStore?.slug) return;
    const authToken = readStoreAuthToken();
    if (!authToken) {
      setAccountPanel({ loading: false, error: 'Sign in to view saved bookings, orders, tickets, and receipts.', me: null, orders: [], bookings: [] });
      return;
    }
    setAccountPanel((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const [me, ordersData, bookingsData] = await Promise.all([
        requestJson('/api/v1/store/auth/me', { storeSlug: selectedStore.slug, authToken }),
        requestJson('/api/v1/store/orders?limit=25', { storeSlug: selectedStore.slug, authToken }),
        requestJson('/api/v1/store/services/bookings?limit=25', { storeSlug: selectedStore.slug, authToken }).catch(() => ({ bookings: [] }))
      ]);
      setAccountPanel({
        loading: false,
        error: '',
        me: me?.customer || me || null,
        orders: Array.isArray(ordersData?.orders) ? ordersData.orders : [],
        bookings: Array.isArray(bookingsData?.bookings) ? bookingsData.bookings : []
      });
    } catch (error) {
      setAccountPanel({ loading: false, error: normalizeStorefrontErrorMessage(error, 'Unable to load account.'), me: null, orders: [], bookings: [] });
    }
  };

  const handleNearMe = () => {
    if (!navigator?.geolocation) {
      loadStores(undefined, { useImmediateSearch: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDiscoveryPinScope((current) => (current === 'tenant_primary' ? 'nearest_matching_branch' : current));
        loadStores({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }, { useImmediateSearch: true });
      },
      () => {
        loadStores(undefined, { useImmediateSearch: true });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  };
  const fnbHasCustomerName = String(customerName || '').trim().length > 0;
  const fnbHasPrimaryContact = String(customerPhone || '').trim().length > 0 || String(customerEmail || '').trim().length > 0;
  const fnbHasDeliveryAddress = !isDeliveryOrder || String(customerAddress || '').trim().length > 0;
  const fnbCustomerStepComplete = fnbHasCustomerName && fnbHasPrimaryContact && fnbHasDeliveryAddress;

  return (
    <main style={{ fontFamily: isFnbMode ? "'Trebuchet MS', 'Segoe UI', sans-serif" : (isServicesMode ? servicesBodyFont : STYLES.fonts.body), background: 'radial-gradient(circle at 20% 0%, #fff7ed 0%, #f8fafc 40%, #eef2f7 100%)', minHeight: '100vh', color: '#0f172a', overflowX: isStorePage && (isFnbMode || isServicesMode) ? 'clip' : 'visible' }}>
      <div style={{
        maxWidth: 1320,
        margin: '0 auto',
        paddingTop: isStorePage && (isServicesMode || isFnbMode) ? 0 : (isMobileViewport ? 12 : 20),
        paddingRight: isStorePage && (isServicesMode || isFnbMode) ? 0 : (isMobileViewport ? 12 : 20),
        paddingLeft: isStorePage && (isServicesMode || isFnbMode) ? 0 : (isMobileViewport ? 12 : 20),
        paddingBottom: isStorePage ? ((isServicesMode || isFnbMode) ? 0 : (isMobileViewport ? 96 : 120)) : 24
      }}>
        {!isStorePage && (
          <>
            <h1 style={{ margin: '0 0 10px 0', fontSize: isMobileViewport ? 30 : 44, letterSpacing: '-0.02em' }}>{DGFY_BRAND_NAME} General Store</h1>
            <p style={{ margin: '0 0 14px 0', color: '#475569', fontSize: isMobileViewport ? 15 : 20 }}>Discover nearby stores, browse menus, and place online orders.</p>

            <section style={{ background: '#fff', border: '1px solid #d6e2e8', borderRadius: 18, padding: isMobileViewport ? 12 : 16, boxShadow: '0 12px 28px rgba(15,23,42,.06)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search store, slug, address, or item..." style={{ flex: '1 1 360px', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px' }} />
                <button type="button" onClick={() => loadStores(undefined, { useImmediateSearch: true })} style={{ borderRadius: 12, border: '1px solid #c2410c', color: '#fff', background: 'linear-gradient(135deg,#ea580c,#f97316)', padding: '10px 14px', fontWeight: 800 }}>Search</button>
                <button type="button" onClick={handleNearMe} style={{ borderRadius: 12, border: '1px solid #fb923c', color: '#c2410c', background: '#fff7ed', padding: '10px 14px', fontWeight: 700 }}>Near Me</button>
                {['list', 'grid', 'map'].map((mode) => (
                  <button key={mode} type="button" onClick={() => setViewMode(mode)} style={{ borderRadius: 10, border: `1px solid ${viewMode === mode ? '#1d9a8a' : '#cbd5e1'}`, background: viewMode === mode ? '#e6fffb' : '#fff', padding: '10px 14px', fontWeight: 700, textTransform: 'capitalize' }}>{mode}</button>
                ))}
              </div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#475569' }}>
                  Result Mode
                  <select value={discoveryResultMode} onChange={(e) => setDiscoveryResultMode(e.target.value)} style={{ width: '100%', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
                    <option value="union">Union (store + item)</option>
                    <option value="item_only">Item matches only</option>
                    <option value="store_only">Store matches only</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                  Stock Filter
                  <select value={discoveryStockFilter} onChange={(e) => setDiscoveryStockFilter(e.target.value)} style={{ width: '100%', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
                    <option value="in_stock_only">In-stock matches only</option>
                    <option value="include_out_of_stock">Include out-of-stock matches</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#475569' }}>
                  Pin Scope
                  <select value={discoveryPinScope} onChange={(e) => setDiscoveryPinScope(e.target.value)} style={{ width: '100%', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
                    <option value="nearest_matching_branch">Nearest matching branch</option>
                    <option value="all_matching_branches">All matching branches</option>
                    <option value="tenant_primary">Tenant primary branch</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', marginTop: 18 }}>
                  <input type="checkbox" checked={discoveryIncludeMatchMeta} onChange={(e) => setDiscoveryIncludeMatchMeta(e.target.checked)} />
                  Include match metadata
                </label>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                {discoveryCoords
                  ? `Near Me is active (${discoveryCoords.latitude.toFixed(4)}, ${discoveryCoords.longitude.toFixed(4)}). Results are sorted by nearest active storefront branch${nearestDistanceKm != null ? ` - nearest: ${nearestDistanceKm.toFixed(2)} km` : ''}.`
                  : 'Tip: Near Me uses your browser location to sort stores by nearest active storefront branch.'}
                {loadingDiscoveryLocations ? ' Syncing branch pins...' : ''}
                {discoveryAppliedFilters
                  ? ` Applied: mode=${discoveryAppliedFilters.result_mode}, stock=${discoveryAppliedFilters.stock_filter}, pins=${discoveryAppliedFilters.pin_scope}.`
                  : ''}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <article style={{ background: 'linear-gradient(135deg,#ecfeff,#f0fdfa)', border: '1px solid #bff3ec', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>DISCOVERABLE STORES</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.totalStores}</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#eff6ff,#f8fafc)', border: '1px solid #dbeafe', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>OPEN RIGHT NOW</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.openStores}</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#fff7ed,#fffaf0)', border: '1px solid #ffedd5', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>AVG WAIT TIME</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.avgWait} min</div>
                </article>
                <article style={{ background: 'linear-gradient(135deg,#f5f3ff,#faf5ff)', border: '1px solid #e9d5ff', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#6d28d9', fontWeight: 700 }}>VISIBLE CATALOG</div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{discoverySummary.totalCatalogItems}</div>
                </article>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 12 }}>
                <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc', padding: 12, minHeight: 420 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 16, letterSpacing: '-0.01em' }}>Discovery Results</strong>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Select any store to open its tenant page</span>
                  </div>

                  {loadingStores && <div style={{ color: '#475569' }}>Loading stores...</div>}
                  {!loadingStores && storesError && <div style={{ color: '#b91c1c' }}>{storesError}</div>}
                  {!loadingStores && !storesError && storesWithNearestBranch.length === 0 && (
                    <div style={{ color: '#64748b' }}>
                      {getDiscoveryEmptyStateMessage(search)}
                    </div>
                  )}

                  {!loadingStores && !storesError && discoveryMapPins.length > 0 && viewMode === 'map' && (
                    <StoresMap
                      stores={discoveryMapPins}
                      selectedKey={highlightedDiscoveryMarkerKey || null}
                      userLocation={discoveryCoords}
                      onSelectStore={(pin) => {
                        setHighlightedStoreSlug(pin.slug);
                        setHighlightedDiscoveryMarkerKey(pin.marker_key || '');
                        goStore(pin.slug, pin.location_id ?? null);
                      }}
                      onPreviewAction={(pin) => goStore(pin.slug, pin.location_id ?? null)}
                    />
                  )}

                  {!loadingStores && !storesError && storesWithNearestBranch.length > 0 && viewMode !== 'map' && (
                    <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'list' ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {storesWithNearestBranch.map((store) => {
                        const storeSlug = toSlug(store?.slug);
                        const storeCoverImageUrl = withAssetOrigin(store?.storefront_cover_image_url);
                        const storeCoverImageKey = `discovery-cover:${storeSlug}:${storeCoverImageUrl}`;
                        const storeProfileImageUrl = withAssetOrigin(store?.storefront_profile_image_url);
                        const storeProfileImageKey = `discovery-profile:${storeSlug}:${storeProfileImageUrl}`;
                        const storePins = Array.isArray(discoveryPinsBySlug[storeSlug]) ? discoveryPinsBySlug[storeSlug] : [];
                        const preferredLocationId = getPreferredDiscoveryLocationId({ store, storePins });
                        const highlightedPin = storePins[0] || null;
                        const badges = getDiscoveryMatchBadges(store, search.trim().length > 0);
                        const storeV2Enabled = parseBooleanFlag(store?.storefront_ui_v2_enabled, false);
                        const storeCategories = normalizeStorefrontCategories(store?.storefront_categories);
                        const storeReviewSummary = normalizeStorefrontReviewSummary(store?.storefront_review_summary);
                        return (
                          <button
                            key={store.slug}
                            type="button"
                            aria-label={`Open tenant storefront for ${store.tenant_name}`}
                            onMouseEnter={() => {
                              setHighlightedStoreSlug(store.slug);
                              if (highlightedPin) setHighlightedDiscoveryMarkerKey(highlightedPin.marker_key);
                            }}
                            onClick={() => goStore(store.slug, preferredLocationId)}
                            style={{ textAlign: 'left', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, cursor: 'pointer', boxShadow: '0 8px 24px rgba(15,23,42,.05)' }}
                          >
                            {storeV2Enabled && (
                              <div style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid #dbe5ee', background: '#f8fafc', position: 'relative', minHeight: 120 }}>
                                {storeCoverImageUrl && !isBrandingImageBlocked(storeCoverImageKey) ? (
                                  <img
                                    src={storeCoverImageUrl}
                                    alt={`${store.tenant_name} cover`}
                                    style={{ width: '100%', height: 120, objectFit: 'cover' }}
                                    onError={() => markBrandingImageError(storeCoverImageKey)}
                                  />
                                ) : (
                                  <div style={{ width: '100%', height: 120, background: 'linear-gradient(135deg,#dbeafe,#ecfeff 70%,#f8fafc)' }} />
                                )}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(15,23,42,0.05),rgba(15,23,42,0.45))' }} />
                                <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: store.storefront_open ? '#16a34a' : '#b45309', borderRadius: 999, padding: '3px 8px' }}>
                                    {store.storefront_open ? 'Open' : 'Closed'}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                                    {store.estimated_wait_minutes} min
                                  </span>
                                </div>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 999, overflow: 'hidden', border: '1px solid #d1d5db', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {storeProfileImageUrl && !isBrandingImageBlocked(storeProfileImageKey) ? (
                                    <img
                                      src={storeProfileImageUrl}
                                      alt={`${store.tenant_name} profile`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      onError={() => markBrandingImageError(storeProfileImageKey)}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>ICON</span>
                                  )}
                                </div>
                                <strong style={{ fontSize: 18 }}>{store.tenant_name}</strong>
                              </div>
                              {!storeV2Enabled && <span style={{ fontSize: 12, color: store.storefront_open ? '#0f766e' : '#b45309', fontWeight: 700 }}>{store.storefront_open ? 'Open' : 'Closed'}</span>}
                            </div>
                            {badges.length > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {badges.map((badge) => {
                                  const tone = DISCOVERY_BADGE_TONE_STYLES[badge.tone] || DISCOVERY_BADGE_TONE_STYLES.slate;
                                  return (
                                    <span
                                      key={`${store.slug}:${badge.key}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        borderRadius: 999,
                                        border: `1px solid ${tone.borderColor}`,
                                        background: tone.background,
                                        color: tone.color,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '3px 8px'
                                      }}
                                    >
                                      {badge.label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ marginTop: 8, color: '#425466', fontSize: 13 }}>{store.address_line || 'Address unavailable'}</div>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#4f46e5', fontWeight: 700 }}>{store.catalog_count} storefront item(s) - Wait {store.estimated_wait_minutes} min</div>
                            {storeV2Enabled && (
                              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {storeReviewSummary?.score != null && (
                                  <span style={{ fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                                    {storeReviewSummary.score.toFixed(1)}? ({storeReviewSummary.total_count ?? 0})
                                  </span>
                                )}
                                {storeCategories.slice(0, 2).map((category, index) => (
                                  <span key={`${store.slug}:category:${index}`} style={{ fontSize: 11, color: '#334155', borderRadius: 999, border: '1px solid #cbd5e1', padding: '2px 7px', background: '#f8fafc' }}>
                                    {category}
                                  </span>
                                ))}
                              </div>
                            )}
                            {Number(store.matching_item_count) > 0 && search.trim() && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#334155' }}>
                                {store.matching_item_count} matching item(s)
                                {Array.isArray(store.matching_item_sample) && store.matching_item_sample.length > 0
                                  ? ` - e.g. ${store.matching_item_sample.join(', ')}`
                                  : ''}
                              </div>
                            )}
                            {Number.isFinite(Number(store.nearest_distance_km)) && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                                {Number(store.nearest_distance_km).toFixed(2)} km from your location
                              </div>
                            )}
                            {store.nearest_location_name && (
                              <div style={{ marginTop: 4, fontSize: 12, color: '#334155' }}>
                                Nearest branch: <strong>{store.nearest_location_name}</strong> {store.nearest_is_primary ? '(Primary)' : ''}
                              </div>
                            )}
                            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 12, color: '#0f766e', textDecoration: 'underline' }}>Open tenant storefront page</span>
                              {storeV2Enabled && getAccessCapabilities(store).checkout === true && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 999, padding: '3px 8px', background: '#fff7ed' }}>
                                  Order now
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>Live Storefront Map</strong>
                  {!loadingStores && !storesError && discoveryMapPins.length > 0 ? (
                    <StoresMap
                      stores={discoveryMapPins}
                      selectedKey={highlightedDiscoveryMarkerKey || null}
                      userLocation={discoveryCoords}
                      onSelectStore={(pin) => {
                        setHighlightedStoreSlug(pin.slug);
                        setHighlightedDiscoveryMarkerKey(pin.marker_key || '');
                        goStore(pin.slug, pin.location_id ?? null);
                      }}
                      onPreviewAction={(pin) => goStore(pin.slug, pin.location_id ?? null)}
                    />
                  ) : (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 12, color: '#64748b' }}>Map will appear once storefront data is available.</div>
                  )}

                  {selectedServiceDetail && !isBookingSubpage && !isServiceDetailsSubpage && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 2200, display: 'grid', placeItems: isMobileViewport ? 'end stretch' : 'center', padding: isMobileViewport ? 0 : 24 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Close service detail"
                        onClick={closeServiceDetail}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') closeServiceDetail();
                        }}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.58)', backdropFilter: 'blur(8px)' }}
                      />
                      <section
                        style={{
                          position: 'relative',
                          zIndex: 2201,
                          width: isMobileViewport ? '100%' : 'min(980px, calc(100vw - 48px))',
                          maxHeight: isMobileViewport ? '92vh' : 'calc(100vh - 48px)',
                          overflow: 'hidden',
                          borderRadius: isMobileViewport ? '24px 24px 0 0' : 28,
                          background: '#ffffff',
                          border: '1px solid #dbe5ee',
                          boxShadow: '0 30px 90px rgba(15,23,42,.24)',
                          display: 'grid',
                          gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)'
                        }}
                      >
                        <div style={{ position: 'relative', minHeight: isMobileViewport ? 220 : '100%', background: '#f8fafc' }}>
                          {withAssetOrigin(selectedServiceDetail.image_url) ? (
                            <img
                              src={withAssetOrigin(selectedServiceDetail.image_url)}
                              alt={selectedServiceDetail.variantName || selectedServiceDetail.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: STYLES.colors.muted, fontSize: 14 }}>
                              No image
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,.04) 0%, rgba(15,23,42,.26) 100%)' }} />
                          <button
                            type="button"
                            onClick={closeServiceDetail}
                            style={{
                              position: 'absolute',
                              top: 16,
                              right: 16,
                              width: 40,
                              height: 40,
                              borderRadius: 999,
                              border: '1px solid rgba(255,255,255,.55)',
                              background: 'rgba(15,23,42,.55)',
                              color: '#fff',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <X size={18} />
                          </button>
                          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              <Badge background="rgba(255,255,255,.92)" color={STYLES.colors.brand} border="rgba(255,255,255,.92)">
                                {selectedServiceDetail.categoryMeta?.label || 'Service'}
                              </Badge>
                              <Badge background="rgba(15,23,42,.72)" color="#fff" border="rgba(255,255,255,.14)">
                                {selectedServiceDetail.serviceAreaLabel}
                              </Badge>
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, color: '#fff' }}>
                              {selectedServiceDetail.variantName || selectedServiceDetail.name}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: 'rgba(255,255,255,.92)', fontSize: 13, fontWeight: 700 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Clock3 size={14} />
                                {selectedServiceDetail.durationLabel}
                              </span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <MousePointer2 size={14} />
                                {selectedServicePaymentOptions.map((option) => option.label).join(' / ')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
                          <div style={{ padding: isMobileViewport ? '18px 18px 12px' : '24px 28px 16px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: 28, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.05 }}>
                                  {money(selectedServiceDetail.default_sale_price ?? 0)}
                                </div>
                                <div style={{ fontSize: 14, color: STYLES.colors.text, lineHeight: 1.6, maxWidth: 540 }}>
                                  {selectedServiceDetail.description || 'Service details are synced from SKUpervisor. Select your preferred schedule and booking requirements below.'}
                                </div>
                              </div>
                              {!isMobileViewport && (
                                <div style={{ minWidth: 180, borderRadius: 18, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 14, display: 'grid', gap: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking notes</div>
                                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                                    SKUpervisor validates lead time, conflicts, and booking rules when you submit.
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ overflowY: 'auto', padding: isMobileViewport ? '16px 18px' : '20px 28px', display: 'grid', gap: 18 }}>
                            <section style={{ display: 'grid', gap: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CalendarDays size={18} color="#f97316" />
                                <div>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Preferred Schedule</div>
                                  <div style={{ fontSize: 12, color: STYLES.colors.muted }}>Choose the requested appointment time. Final availability is confirmed by SKUpervisor.</div>
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr 160px', gap: 12 }}>
                                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                  Preferred date and time
                                  <input
                                    type="datetime-local"
                                    value={serviceAppointmentAt}
                                    onChange={(event) => setServiceAppointmentAt(event.target.value)}
                                    style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                  />
                                </label>
                                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                  Payment timing
                                  <select
                                    value={servicePaymentTiming}
                                    onChange={(event) => setServicePaymentTiming(event.target.value)}
                                    style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                  >
                                    {selectedServicePaymentOptions.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                  Units / count
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={serviceDraftQuantity}
                                    onChange={(event) => setServiceDraftQuantity(Math.max(1, Number(event.target.value || 1)))}
                                    style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                  />
                                </label>
                              </div>
                            </section>

                            <section style={{ display: 'grid', gap: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FileText size={18} color="#f97316" />
                                <div>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Service instructions</div>
                                  <div style={{ fontSize: 12, color: STYLES.colors.muted }}>Add any practical notes that will help the service team prepare.</div>
                                </div>
                              </div>
                              <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                Special instructions
                                <textarea
                                  value={serviceDraftNotes}
                                  onChange={(event) => setServiceDraftNotes(event.target.value)}
                                  placeholder="Access notes, unit details, pickup preferences, or anything the service team should know."
                                  style={{ width: '100%', minHeight: 92, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff', resize: 'vertical' }}
                                />
                              </label>
                            </section>

                            {selectedServiceIntakeFields.length > 0 && (
                              <section style={{ display: 'grid', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <CheckCircle2 size={18} color="#f97316" />
                                  <div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Booking requirements</div>
                                    <div style={{ fontSize: 12, color: STYLES.colors.muted }}>These fields come from the service intake form configured in SKUpervisor.</div>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
                                  {selectedServiceIntakeFields.map((field) => (
                                    <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                      {field.label}{field.required ? ' *' : ''}
                                      {field.type === 'textarea' ? (
                                        <textarea
                                          value={serviceIntakeResponses[field.id] || ''}
                                          onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                                          style={{ width: '100%', minHeight: 92, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff', resize: 'vertical' }}
                                        />
                                      ) : field.type === 'select' ? (
                                        <select
                                          value={serviceIntakeResponses[field.id] || ''}
                                          onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                        >
                                          <option value="">Select</option>
                                          {field.options.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>
                                      ) : field.type === 'checkbox' ? (
                                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                                          <input
                                            type="checkbox"
                                            checked={serviceIntakeResponses[field.id] === true}
                                            onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.checked }))}
                                          />
                                          <span style={{ fontSize: 13, color: STYLES.colors.text }}>Confirm</span>
                                        </div>
                                      ) : (
                                        <input
                                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                          value={serviceIntakeResponses[field.id] || ''}
                                          onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                        />
                                      )}
                                    </label>
                                  ))}
                                </div>
                              </section>
                            )}
                          </div>

                          <div style={{ padding: isMobileViewport ? '14px 18px 18px' : '18px 28px 24px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 12 }}>
                            {checkoutError && (
                              <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px' }}>
                                {checkoutError}
                              </div>
                            )}
                            {missingRequiredSelectedServiceIntake.length > 0 && (
                              <div style={{ fontSize: 13, color: '#b45309', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 14, padding: '10px 12px' }}>
                                Complete the required booking details before adding this service to your booking summary.
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column-reverse' : 'row', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', gap: 12 }}>
                              <div style={{ display: 'grid', gap: 4 }}>
                                <div style={{ fontSize: 13, color: STYLES.colors.muted }}>Current estimate</div>
                                <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark }}>
                                  {money((Number(selectedServiceDetail.default_sale_price ?? 0) || 0) * Math.max(1, Number(serviceDraftQuantity || 1)))}
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 10 }}>
                                <GhostButton style={{ minHeight: 46, minWidth: 150 }} onClick={closeServiceDetail}>
                                  Cancel
                                </GhostButton>
                                <PrimaryButton style={{ minHeight: 46, minWidth: 190 }} onClick={() => saveServiceBookingDraft(selectedServiceDetail, 'review')}>
                                  Add to Booking
                                </PrimaryButton>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {highlightedStore && (
                    <article style={{ border: '1px solid #dbeafe', borderRadius: 12, background: '#eff6ff', padding: 10 }}>
                      {false && selectedServiceDetail && !isBookingSubpage && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 2200, display: 'grid', placeItems: isMobileViewport ? 'end stretch' : 'center', padding: isMobileViewport ? 0 : 24 }}>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label="Close service detail"
                            onClick={closeServiceDetail}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') closeServiceDetail();
                            }}
                            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.58)', backdropFilter: 'blur(8px)' }}
                          />
                          <section
                            style={{
                              position: 'relative',
                              zIndex: 2201,
                              width: isMobileViewport ? '100%' : 'min(980px, calc(100vw - 48px))',
                              maxHeight: isMobileViewport ? '92vh' : 'calc(100vh - 48px)',
                              overflow: 'hidden',
                              borderRadius: isMobileViewport ? '24px 24px 0 0' : 28,
                              background: '#ffffff',
                              border: '1px solid #dbe5ee',
                              boxShadow: '0 30px 90px rgba(15,23,42,.24)',
                              display: 'grid',
                              gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)'
                            }}
                          >
                            <div style={{ position: 'relative', minHeight: isMobileViewport ? 220 : '100%', background: '#f8fafc' }}>
                              {withAssetOrigin(selectedServiceDetail.image_url) ? (
                                <img
                                  src={withAssetOrigin(selectedServiceDetail.image_url)}
                                  alt={selectedServiceDetail.variantName || selectedServiceDetail.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: STYLES.colors.muted, fontSize: 14 }}>
                                  No image
                                </div>
                              )}
                              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,.04) 0%, rgba(15,23,42,.26) 100%)' }} />
                              <button
                                type="button"
                                onClick={closeServiceDetail}
                                style={{
                                  position: 'absolute',
                                  top: 16,
                                  right: 16,
                                  width: 40,
                                  height: 40,
                                  borderRadius: 999,
                                  border: '1px solid rgba(255,255,255,.55)',
                                  background: 'rgba(15,23,42,.55)',
                                  color: '#fff',
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer'
                                }}
                              >
                                <X size={18} />
                              </button>
                              <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  <Badge background="rgba(255,255,255,.92)" color={STYLES.colors.brand} border="rgba(255,255,255,.92)">
                                    {selectedServiceDetail.categoryMeta?.label || 'Service'}
                                  </Badge>
                                  <Badge background="rgba(15,23,42,.72)" color="#fff" border="rgba(255,255,255,.14)">
                                    {selectedServiceDetail.serviceAreaLabel}
                                  </Badge>
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, color: '#fff' }}>
                                  {selectedServiceDetail.variantName || selectedServiceDetail.name}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: 'rgba(255,255,255,.92)', fontSize: 13, fontWeight: 700 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Clock3 size={14} />
                                    {selectedServiceDetail.durationLabel}
                                  </span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <MousePointer2 size={14} />
                                    {selectedServicePaymentOptions.map((option) => option.label).join(' / ')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
                              <div style={{ padding: isMobileViewport ? '18px 18px 12px' : '24px 28px 16px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.05 }}>
                                      {money(selectedServiceDetail.default_sale_price ?? 0)}
                                    </div>
                                    <div style={{ fontSize: 14, color: STYLES.colors.text, lineHeight: 1.6, maxWidth: 540 }}>
                                      {selectedServiceDetail.description || 'Service details are synced from SKUpervisor. Select your preferred schedule and booking requirements below.'}
                                    </div>
                                  </div>
                                  {!isMobileViewport && (
                                    <div style={{ minWidth: 180, borderRadius: 18, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 14, display: 'grid', gap: 8 }}>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking notes</div>
                                      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                                        SKUpervisor validates lead time, conflicts, and booking rules when you submit.
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div style={{ overflowY: 'auto', padding: isMobileViewport ? '16px 18px' : '20px 28px', display: 'grid', gap: 18 }}>
                                <section style={{ display: 'grid', gap: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <CalendarDays size={18} color="#f97316" />
                                    <div>
                                      <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Preferred Schedule</div>
                                      <div style={{ fontSize: 12, color: STYLES.colors.muted }}>Choose the requested appointment time. Final availability is confirmed by SKUpervisor.</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr 160px', gap: 12 }}>
                                    <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                      Preferred date and time
                                      <input
                                        type="datetime-local"
                                        value={serviceAppointmentAt}
                                        onChange={(event) => setServiceAppointmentAt(event.target.value)}
                                        style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                      />
                                    </label>
                                    <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                      Payment timing
                                      <select
                                        value={servicePaymentTiming}
                                        onChange={(event) => setServicePaymentTiming(event.target.value)}
                                        style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                      >
                                        {selectedServicePaymentOptions.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                      Units / count
                                      <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={serviceDraftQuantity}
                                        onChange={(event) => setServiceDraftQuantity(Math.max(1, Number(event.target.value || 1)))}
                                        style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                      />
                                    </label>
                                  </div>
                                </section>

                                <section style={{ display: 'grid', gap: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <FileText size={18} color="#f97316" />
                                    <div>
                                      <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Service instructions</div>
                                      <div style={{ fontSize: 12, color: STYLES.colors.muted }}>Add any practical notes that will help the service team prepare.</div>
                                    </div>
                                  </div>
                                  <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                    Special instructions
                                    <textarea
                                      value={serviceDraftNotes}
                                      onChange={(event) => setServiceDraftNotes(event.target.value)}
                                      placeholder="Access notes, unit details, pickup preferences, or anything the service team should know."
                                      style={{ width: '100%', minHeight: 92, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff', resize: 'vertical' }}
                                    />
                                  </label>
                                </section>

                                {selectedServiceIntakeFields.length > 0 && (
                                  <section style={{ display: 'grid', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <CheckCircle2 size={18} color="#f97316" />
                                      <div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: STYLES.colors.dark }}>Booking requirements</div>
                                        <div style={{ fontSize: 12, color: STYLES.colors.muted }}>These fields come from the service intake form configured in SKUpervisor.</div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
                                      {selectedServiceIntakeFields.map((field) => (
                                        <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                          {field.label}{field.required ? ' *' : ''}
                                          {field.type === 'textarea' ? (
                                            <textarea
                                              value={serviceIntakeResponses[field.id] || ''}
                                              onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                                              style={{ width: '100%', minHeight: 92, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff', resize: 'vertical' }}
                                            />
                                          ) : field.type === 'select' ? (
                                            <select
                                              value={serviceIntakeResponses[field.id] || ''}
                                              onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                                              style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                            >
                                              <option value="">Select</option>
                                              {field.options.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>
                                          ) : field.type === 'checkbox' ? (
                                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                                              <input
                                                type="checkbox"
                                                checked={serviceIntakeResponses[field.id] === true}
                                                onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.checked }))}
                                              />
                                              <span style={{ fontSize: 13, color: STYLES.colors.text }}>Confirm</span>
                                            </div>
                                          ) : (
                                            <input
                                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                              value={serviceIntakeResponses[field.id] || ''}
                                              onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))}
                                              style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 14, padding: '12px 13px', background: '#fff' }}
                                            />
                                          )}
                                        </label>
                                      ))}
                                    </div>
                                  </section>
                                )}
                              </div>

                              <div style={{ padding: isMobileViewport ? '14px 18px 18px' : '18px 28px 24px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 12 }}>
                                {checkoutError && (
                                  <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px' }}>
                                    {checkoutError}
                                  </div>
                                )}
                                {missingRequiredSelectedServiceIntake.length > 0 && (
                                  <div style={{ fontSize: 13, color: '#b45309', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 14, padding: '10px 12px' }}>
                                    Complete the required booking details before adding this service to your booking summary.
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column-reverse' : 'row', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', gap: 12 }}>
                                  <div style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 13, color: STYLES.colors.muted }}>Current estimate</div>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark }}>
                                      {money((Number(selectedServiceDetail.default_sale_price ?? 0) || 0) * Math.max(1, Number(serviceDraftQuantity || 1)))}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 10 }}>
                                    <GhostButton style={{ minHeight: 46, minWidth: 150 }} onClick={closeServiceDetail}>
                                      Cancel
                                    </GhostButton>
                                    <PrimaryButton style={{ minHeight: 46, minWidth: 190 }} onClick={() => saveServiceBookingDraft(selectedServiceDetail, 'review')}>
                                      Add to Booking
                                    </PrimaryButton>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </section>
                        </div>
                      )}

                      {(() => {
                        const highlightedSlug = toSlug(highlightedStore?.slug);
                        const highlightedProfileImageUrl = withAssetOrigin(highlightedStore?.storefront_profile_image_url);
                        const highlightedProfileImageKey = `highlighted-profile:${highlightedSlug}:${highlightedProfileImageUrl}`;
                        const highlightedPins = Array.isArray(discoveryPinsBySlug[highlightedSlug]) ? discoveryPinsBySlug[highlightedSlug] : [];
                        const highlightedBadges = getDiscoveryMatchBadges(highlightedStore, search.trim().length > 0);
                        const highlightedPreferredLocationId = getPreferredDiscoveryLocationId({
                          store: highlightedStore,
                          storePins: highlightedPins
                        });
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 30, height: 30, borderRadius: 999, overflow: 'hidden', border: '1px solid #d1d5db', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {highlightedProfileImageUrl && !isBrandingImageBlocked(highlightedProfileImageKey) ? (
                                    <img
                                      src={highlightedProfileImageUrl}
                                      alt={`${highlightedStore.tenant_name} profile`}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      onError={() => markBrandingImageError(highlightedProfileImageKey)}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>ICON</span>
                                  )}
                                </div>
                                <strong>{highlightedStore.tenant_name}</strong>
                              </div>
                              <span style={{ color: highlightedStore.storefront_open ? '#0f766e' : '#b45309', fontWeight: 700, fontSize: 12 }}>
                                {highlightedStore.storefront_open ? 'Open' : 'Closed'}
                              </span>
                            </div>
                            {highlightedBadges.length > 0 && (
                              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {highlightedBadges.map((badge) => {
                                  const tone = DISCOVERY_BADGE_TONE_STYLES[badge.tone] || DISCOVERY_BADGE_TONE_STYLES.slate;
                                  return (
                                    <span
                                      key={`highlighted:${badge.key}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        borderRadius: 999,
                                        border: `1px solid ${tone.borderColor}`,
                                        background: tone.background,
                                        color: tone.color,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '3px 8px'
                                      }}
                                    >
                                      {badge.label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ fontSize: 13, marginTop: 6, color: '#334155' }}>{highlightedStore.address_line || 'Address unavailable'}</div>
                            {Number.isFinite(Number(highlightedStore.nearest_distance_km)) && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                                {Number(highlightedStore.nearest_distance_km).toFixed(2)} km from your location
                              </div>
                            )}
                            {highlightedStore.nearest_location_name && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
                                Closest active branch: <strong>{highlightedStore.nearest_location_name}</strong> {highlightedStore.nearest_is_primary ? '(Primary)' : ''}
                              </div>
                            )}
                            <button type="button" onClick={() => goStore(highlightedStore.slug, highlightedPreferredLocationId)} style={{ marginTop: 10, width: '100%', borderRadius: 9, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 10px', fontWeight: 700 }}>
                              Open This Tenant Storefront
                            </button>
                          </>
                        );
                      })()}
                    </article>
                  )}

                  <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: 10 }}>
                    <strong style={{ fontSize: 14 }}>Quick Flow</strong>
                    <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#64748b' }}>Search a store, open its tenant page, add items, then checkout using the bottom cart popout.</p>
                  </article>
                </section>
              </div>
            </section>
          </>
        )}

        {isStorePage && (
          <>
            {isServicesMode && !isBookingSubpage && !isServiceDetailsSubpage && selectedStore && serviceHeroModel && (
              <ServicesHero
                serviceHeroModel={serviceHeroModel}
                selectedStore={selectedStore}
                isMobileViewport={isMobileViewport}
                hasMultipleStoreBranches={hasMultipleStoreBranches}
                hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
                selectedLocationId={selectedLocationId}
                handleBranchMenuSelection={handleBranchMenuSelection}
                storeLocations={storeLocations}
                catalogSearch={catalogSearch}
                setCatalogSearch={setCatalogSearch}
                goDiscovery={goDiscovery}
                hasServiceCart={hasServiceCart}
                goStoreBookingPage={goStoreBookingPage}
                cartCount={cartCount}
                modeAdapter={modeAdapter}
                isBrandingImageBlocked={isBrandingImageBlocked}
                markBrandingImageError={markBrandingImageError}
                selectedLocation={selectedLocation}
                isAboutExpanded={isAboutExpanded}
                setIsAboutExpanded={setIsAboutExpanded}
                isServiceGalleryExpanded={isServiceGalleryExpanded}
                setIsServiceGalleryExpanded={setIsServiceGalleryExpanded}
                openStorefrontActionLink={openStorefrontActionLink}
              />
            )}
            {false && isServicesMode && selectedStore && serviceHeroModel && (
              <section style={{ marginBottom: 40 }}>
                {/* Modernized Header/Nav */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport ? '1fr' : 'auto minmax(240px, 1fr) auto',
                  alignItems: 'center',
                  gap: 14,
                  padding: isMobileViewport ? '14px 16px' : '14px 24px',
                  background: '#fff',
                  borderRadius: 20,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 14px 34px rgba(15,23,42,.05)',
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <button type="button" onClick={goDiscovery} style={{ border: 'none', background: '#f8fafc', color: STYLES.colors.dark, width: 42, height: 42, borderRadius: 999, cursor: 'pointer', fontSize: 20, fontWeight: 700 }}>
                      {'<'}
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: STYLES.colors.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{serviceHeroModel.name}</div>
                      <div style={{ fontSize: 12, color: STYLES.colors.muted }}>{routeSlug || 'service storefront'}</div>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #dbe5ee', borderRadius: 999, background: '#f8fafc', padding: '0 14px', minHeight: 48 }}>
                    <input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="Search items in this store catalog..."
                      style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: 14, color: STYLES.colors.text }}
                    />
                    <span style={{ width: 28, height: 28, borderRadius: 999, background: STYLES.colors.brand, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>S</span>
                  </label>
                  <div style={{ display: 'flex', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Shop
                    </button>
                    {!isServicesMode && (
                      <button
                        type="button"
                        onClick={() => {
                          if (hasServiceCart) {
                            goStoreBookingPage();
                            return;
                          }
                          document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        style={{ border: 'none', background: 'transparent', color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Cart ({cartCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Hero Section with Overlapping Avatar */}
                <div style={{ position: 'relative' }}>
                  <section style={{
                    position: 'relative',
                    minHeight: isMobileViewport ? 300 : 340,
                    borderRadius: '28px 28px 0 0',
                    overflow: 'hidden',
                    background: serviceHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
                      ? `url(${serviceHeroModel.coverImageUrl}) center/cover`
                      : 'linear-gradient(120deg,#1e293b 0%,#334155 100%)',
                    boxShadow: STYLES.shadow.lg
                  }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)' }} />
                    <div style={{ position: 'relative', zIndex: 1, padding: isMobileViewport ? '40px 20px' : '60px 40px 60px 280px', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <Badge background={selectedStore?.storefront_open ? '#16a34a' : '#b45309'} color="#fff">{serviceHeroModel.statusLabel}</Badge>
                        <Badge background="rgba(15,23,42,0.6)" color="#fff">Closes 10:00 PM</Badge>
                      </div>
                      <h1 style={{ margin: 0, color: '#fff', fontSize: isMobileViewport ? 36 : 52, fontWeight: 900, lineHeight: 1.1 }}>{serviceHeroModel.name}</h1>
                      {serviceHeroModel.tagline && (
                        <p style={{ margin: '8px 0 0 0', color: '#fbbf24', fontSize: isMobileViewport ? 18 : 24, fontWeight: 700 }}>{serviceHeroModel.tagline}</p>
                      )}
                      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, color: '#fff', fontSize: 14, fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Star size={14} fill="#fbbf24" color="#fbbf24" />{serviceHeroModel.ratingLabel}</span>
                        <span>| {serviceHeroModel.modeLabel}</span>
                        <span><MapPin size={14} style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: 4 }} />{serviceHeroModel.locationLabel}</span>
                      </div>
                      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                        <GhostButton onClick={() => openStorefrontActionLink(serviceHeroModel.actions.callHref)} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', minWidth: 100 }}>
                          Call
                        </GhostButton>
                        <PrimaryButton onClick={() => {
                          if (hasServiceCart) {
                            goStoreBookingPage();
                            return;
                          }
                          document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }} style={{ minWidth: 140 }}>
                          {serviceHeroModel.actions.orderLabel}
                        </PrimaryButton>
                      </div>
                    </div>
                  </section>

                  {/* Overlapping Avatar */}
                  <div style={{
                    position: 'absolute',
                    left: isMobileViewport ? '50%' : '40px',
                    bottom: '-60px',
                    transform: isMobileViewport ? 'translateX(-50%)' : 'none',
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '8px solid #fff',
                    boxShadow: STYLES.shadow.lg,
                    overflow: 'hidden',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {serviceHeroModel.profileImageUrl && !isBrandingImageBlocked(`hero-profile:${selectedStore.slug}`) ? (
                      <img src={serviceHeroModel.profileImageUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ fontSize: 64, fontWeight: 900, color: STYLES.colors.brandDark }}>{serviceHeroModel.name.charAt(0)}</div>
                    )}
                  </div>
                </div>

                {/* Mission Control Info Panels */}
                <div style={{
                  background: '#fff',
                  borderRadius: '0 0 28px 28px',
                  padding: isMobileViewport ? '80px 20px 40px' : '40px 40px 40px 280px',
                  border: '1px solid #e2e8f0',
                  borderTop: 'none',
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr 1fr',
                  gap: 32,
                  boxShadow: STYLES.shadow.sm
                }}>
                  {/* Column 1: Contact & Location */}
                  <div style={{ display: 'grid', gap: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact & Location</h3>
                    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', height: 160 }}>
                      <StoresMap
                        stores={[{ ...selectedStore, location_id: selectedLocationId }]}
                        selectedKey={selectedLocationId}
                        onSelectStore={() => { }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 12 }}>
                      {serviceHeroModel.contactRows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: row.label === 'Call' ? STYLES.colors.brand : row.label === 'Facebook' ? '#2563eb' : STYLES.colors.teal, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{row.label === 'Call' ? <Phone size={16} /> : row.label === 'Facebook' ? <MessageCircle size={16} /> : <Clock3 size={16} />}</span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: STYLES.colors.dark }}>{row.value}</div>
                            {row.label === 'Hours' && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Open Now</div>}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: STYLES.colors.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><MapPin size={16} /></span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: STYLES.colors.dark }}>{serviceHeroModel.addressLine}</div>
                          <button style={{ border: 'none', background: 'transparent', color: STYLES.colors.brand, fontSize: 12, fontWeight: 800, padding: 0, cursor: 'pointer' }}>Get Directions</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Overview */}
                  <div style={{ display: 'grid', gap: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overview</h3>
                    <p style={{ margin: 0, fontSize: 14, color: STYLES.colors.text, lineHeight: 1.6 }}>
                      {serviceHeroModel.aboutText || "Professional services tailored to your needs."}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {serviceHeroModel.galleryPreview.map((url, i) => (
                        <div key={i} style={{ aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                          <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Gallery" />
                          {i === 3 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>+3</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column 3: Why Choose Us */}
                  <div style={{ display: 'grid', gap: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Why Choose Us</h3>
                    <div style={{ display: 'grid', gap: 14 }}>
                      {[
                        { icon: 'S', text: 'Laundry and aircon services in one place' },
                        { icon: 'H', text: 'Suitable for regular household and small business needs' },
                        { icon: 'M', text: 'Options for everyday garments, bulky laundry, and multiple aircon unit types' },
                        { icon: 'B', text: 'Simple booking-friendly service catalog for faster inquiries and checkout' }
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                          <span style={{ fontSize: 18, color: STYLES.colors.brand }}>{item.icon}</span>
                          <span style={{ fontSize: 14, color: STYLES.colors.text, lineHeight: 1.4 }}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
            {!isServicesMode && (
              <>
                {/* ZONE 1: Navigation & Header */}
                {!isFnbMode && (
                  <section style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <GhostButton onClick={goDiscovery} style={{ padding: '8px 16px', minHeight: 44, fontSize: 13 }}>
                      Back to Discovery
                    </GhostButton>
                    <div style={{ color: STYLES.colors.muted, fontSize: 13, fontWeight: 700 }}>
                      <span style={{ display: 'block' }}>Tenant page: {routeSlug}</span>
                      <span>{routeSlug} // {selectedStore?.tenant_name}</span>
                    </div>
                  </section>
                )}

                {/* ZONE 2: Hero Branding */}
                {isFnbMode && !isOrderSubpage ? (
                  <FnbHero
                    modeAdapter={modeAdapter}
                    heroSectionModel={heroSectionModel}
                    fnbViewModel={fnbViewModel}
                    selectedStore={selectedStore}
                    isMobileViewport={isMobileViewport}
                    cartCount={cartCount}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                    goDiscovery={goDiscovery}
                    hasMultipleStoreBranches={hasMultipleStoreBranches}
                    hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
                    selectedLocationId={selectedLocationId}
                    handleBranchMenuSelection={handleBranchMenuSelection}
                    storeLocations={storeLocations}
                    catalogSearch={catalogSearch}
                    setCatalogSearch={setCatalogSearch}
                  isBrandingImageBlocked={isBrandingImageBlocked}
                  markBrandingImageError={markBrandingImageError}
                  selectedLocation={selectedLocation}
                  openStorefrontActionLink={openStorefrontActionLink}
                  openTrackPanel={openTrackPanel}
                  openAccountPanel={openAccountPanel}
                />
                ) : isSimpleMode && simpleStorefrontModel ? (
                  <SimpleHero
                    simpleHeroModel={simpleStorefrontModel}
                    selectedStore={selectedStore}
                    isMobileViewport={isMobileViewport}
                    hasMultipleStoreBranches={hasMultipleStoreBranches}
                    hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
                    selectedLocationId={selectedLocationId}
                    handleBranchMenuSelection={handleBranchMenuSelection}
                    storeLocations={storeLocations}
                    catalogSearch={catalogSearch}
                    setCatalogSearch={setCatalogSearch}
                    goDiscovery={goDiscovery}
                    cartCount={cartCount}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                    modeAdapter={modeAdapter}
                    isBrandingImageBlocked={isBrandingImageBlocked}
                    markBrandingImageError={markBrandingImageError}
                    selectedLocation={selectedLocation}
                    openStorefrontActionLink={openStorefrontActionLink}
                    openTrackPanel={openTrackPanel}
                    openAccountPanel={openAccountPanel}
                  />
                ) : !isFnbMode ? (
                  <DefaultStorefrontHero
                    modeAdapter={modeAdapter}
                    selectedStore={selectedStore}
                    isMobileViewport={isMobileViewport}
                    handleShareAction={handleShareAction}
                    setIsCheckoutOpen={setIsCheckoutOpen}
                  />
                ) : null}
              </>
            )}

            {/* ZONE 3: Location Map Snapshot */}
            {!isServicesMode && !isFnbMode && !isSimpleMode && selectedStore && (
              <section style={{ background: '#fff', borderRadius: STYLES.radius.card, border: `1px solid ${STYLES.colors.border}`, padding: 16, marginBottom: 24, boxShadow: STYLES.shadow.sm }}>
                <StoresMap
                  stores={storeLocations.length > 0 ? storeLocations.map(l => ({ ...l, tenant_name: selectedStore?.tenant_name })) : [selectedStore]}
                  selectedKey={selectedLocationId != null ? `loc-${selectedLocationId}` : null}
                  onSelectStore={(l) => l?.location_id && setSelectedLocationId(l.location_id)}
                />
              </section>
            )}

            {/* ZONE 4: Catalog Grid with Sidebar */}
            {catalogPermitted && selectedStore && (() => {
              // --- Service Tab logic ---
              const isMultiGroup = isServicesMode && servicesViewModel.serviceGroups.length > 1;
              const resolvedTab = isMultiGroup
                ? (activeServiceTab && servicesViewModel.serviceGroups.some((g) => g.categoryKey === activeServiceTab)
                  ? activeServiceTab
                  : '')
                : '';
              const activeGroup = resolvedTab
                ? (servicesViewModel.serviceGroups.find((g) => g.categoryKey === resolvedTab) || null)
                : null;
              const fnbSections = isFnbMode ? filteredFnbViewModel.menuSections : [];
              const isMultiFnbSection = isFnbMode && fnbSections.length > 1;
              const resolvedFnbSection = isMultiFnbSection
                ? (activeServiceTab && fnbSections.some((section) => section.sectionKey === activeServiceTab)
                  ? activeServiceTab
                  : fnbSections[0]?.sectionKey)
                : null;
              const activeFnbSection = isMultiFnbSection
                ? (fnbSections.find((section) => section.sectionKey === resolvedFnbSection) || fnbSections[0])
                : null;
              const rawItemsToRender = isServicesMode
                ? (resolvedTab ? (activeGroup?.items || []) : servicesViewModel.allServices)
                : isFnbMode
                  ? (isMultiFnbSection ? (activeFnbSection?.items || []) : filteredFnbViewModel.menuItems)
                  : filteredCatalog;
              const itemsToRender = isFnbMode
                ? [...rawItemsToRender].sort((left, right) => {
                    if (fnbSortOption === 'price_asc') return Number(left?.default_sale_price || 0) - Number(right?.default_sale_price || 0);
                    if (fnbSortOption === 'price_desc') return Number(right?.default_sale_price || 0) - Number(left?.default_sale_price || 0);
                    if (fnbSortOption === 'name_asc') return String(left?.name || '').localeCompare(String(right?.name || ''));
                    return String(left?.name || '').localeCompare(String(right?.name || ''));
                  })
                : rawItemsToRender;
              const totalFnbPages = isFnbMode
                ? Math.max(1, Math.ceil(itemsToRender.length / Math.max(1, Number(fnbPageSize || 8))))
                : 1;
              const resolvedFnbPage = isFnbMode
                ? Math.min(Math.max(1, Number(fnbPage || 1)), totalFnbPages)
                : 1;
              const paginatedFnbItems = isFnbMode
                ? itemsToRender.slice((resolvedFnbPage - 1) * fnbPageSize, resolvedFnbPage * fnbPageSize)
                : itemsToRender;
              const fnbPageStart = !isFnbMode || itemsToRender.length === 0 ? 0 : ((resolvedFnbPage - 1) * fnbPageSize) + 1;
              const fnbPageEnd = !isFnbMode ? itemsToRender.length : Math.min(itemsToRender.length, resolvedFnbPage * fnbPageSize);
              const catalogItemsToRender = isFnbMode ? paginatedFnbItems : itemsToRender;
              const activeGroupMeta = activeGroup?.categoryMeta;
              const ActiveServiceGroupIcon = activeGroupMeta?.iconToken ? (SERVICE_CATEGORY_ICON_MAP[activeGroupMeta.iconToken] || Sparkles) : Sparkles;

              if (isServicesMode) {
                const searchFilteredServices = filterCatalogItems(itemsToRender, catalogSearch);
                const availabilityFilteredServices = searchFilteredServices.filter((item) => {
                  if (serviceAvailabilityFilter === 'available') return isItemAvailable(item);
                  if (serviceAvailabilityFilter === 'unavailable') return !isItemAvailable(item);
                  return true;
                });
                const areaFilteredServices = availabilityFilteredServices.filter((item) => {
                  const areaType = String(item?.service_detail?.service_area_type || '').trim().toLowerCase();
                  if (serviceAreaFilter === 'all') return true;
                  return areaType === serviceAreaFilter;
                });
                const durationFilteredServices = areaFilteredServices.filter((item) => {
                  const duration = Number(item?.service_detail?.duration_minutes || 0);
                  if (serviceDurationFilter === 'all') return true;
                  if (!Number.isFinite(duration) || duration <= 0) return false;
                  if (serviceDurationFilter === 'short') return duration < 60;
                  if (serviceDurationFilter === 'standard') return duration >= 60 && duration < 120;
                  if (serviceDurationFilter === 'extended') return duration >= 120;
                  return true;
                });
                const sortedServices = [...durationFilteredServices].sort((left, right) => {
                  if (serviceSortOption === 'price_asc') return Number(left?.default_sale_price || 0) - Number(right?.default_sale_price || 0);
                  if (serviceSortOption === 'price_desc') return Number(right?.default_sale_price || 0) - Number(left?.default_sale_price || 0);
                  return String(left?.variantName || left?.name || '').localeCompare(String(right?.variantName || right?.name || ''));
                });
                const totalServicePages = Math.max(1, Math.ceil(sortedServices.length / Math.max(1, Number(servicePageSize || 8))));
                const resolvedServicePage = Math.min(Math.max(1, Number(servicePage || 1)), totalServicePages);
                const paginatedServices = sortedServices.slice((resolvedServicePage - 1) * servicePageSize, resolvedServicePage * servicePageSize);
                const servicePageStart = sortedServices.length === 0 ? 0 : ((resolvedServicePage - 1) * servicePageSize) + 1;
                const servicePageEnd = Math.min(sortedServices.length, resolvedServicePage * servicePageSize);
                const hasActiveFilters = serviceAvailabilityFilter !== 'all' || serviceAreaFilter !== 'all' || serviceDurationFilter !== 'all';
                const hasSearchQuery = catalogSearch.trim().length > 0;
                const reviewHighlights = Array.isArray(serviceHeroModel?.reviewHighlights) ? serviceHeroModel.reviewHighlights.filter(Boolean) : [];
                const reviewSummary = serviceHeroModel?.reviewSummary || null;
                const reviewScore = Number(reviewSummary?.score);
                const reviewCount = Number(reviewSummary?.total_count ?? reviewSummary?.totalCount ?? reviewHighlights.length);
                const hasReviewSummary = Number.isFinite(reviewScore) && reviewScore > 0;
                const reviewGridColumns = isMobileViewport ? '1fr' : viewportWidth < 1024 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
                const resolvedServicesLayoutMode = String(serviceHeroModel?.servicesLayoutMode || servicesLayoutMode || 'directory').trim().toLowerCase();
                const isLeadGenLayout = resolvedServicesLayoutMode === 'lead_gen';
                const isBookingHeavyLayout = resolvedServicesLayoutMode === 'booking_heavy';
                const isDirectoryLayout = !isLeadGenLayout && !isBookingHeavyLayout;
                const controlRadius = 999;
                const serviceCategoryOptions = [
                  {
                    key: '',
                    label: 'All Services',
                    count: servicesViewModel.allServices.length,
                    icon: Sparkles
                  },
                  ...servicesViewModel.serviceGroups.map((group) => ({
                    key: group.categoryKey,
                    label: group.categoryMeta?.label || group.categoryKey,
                    count: group.items.length,
                    icon: SERVICE_CATEGORY_ICON_MAP[group.categoryMeta?.iconToken] || Sparkles
                  }))
                ];
                const detailPageServiceItem = selectedServiceDetail || (routeServiceItemId ? catalog.find((item) => String(item?.item_id) === String(routeServiceItemId)) || null : null);
                const detailPagePaymentOptions = buildServicePaymentOptions(detailPageServiceItem?.service_detail?.payment_policy || 'customer_choice');
                const detailPageIntakeFields = normalizeServiceFormFields(detailPageServiceItem?.service_detail?.intake_form_schema);
                const servicesSectionTitle = isLeadGenLayout
                  ? 'Service Highlights'
                  : isBookingHeavyLayout
                    ? 'Choose a Service'
                    : 'Services';
                const servicesSectionSubtitle = isLeadGenLayout
                  ? 'Start with the core services, then contact or book the team from the storefront.'
                  : isBookingHeavyLayout
                    ? 'Pick the service you need, review what to prepare, and continue to booking when you are ready.'
                    : 'Browse available services from this storefront.';
                const servicesGridColumns = isMobileViewport
                  ? '1fr'
                  : isLeadGenLayout
                    ? 'repeat(2, minmax(0, 1fr))'
                    : (viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))');
                if (isServiceDetailsSubpage) {
                  const supportHref = String(serviceHeroModel?.actions?.messageHref || serviceHeroModel?.actions?.callHref || '').trim();
                  return (
                    <section style={{ display: 'grid', gap: 0, paddingTop: 0 }}>
                      <div style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 100,
                        background: '#ffffff',
                        borderBottom: '1px solid #e5e7eb',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                        width: '100vw',
                        marginLeft: 'calc(50% - 50vw)'
                      }}>
                        <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? '10px 16px' : '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 12 : 24, minWidth: 0, flex: 1 }}>
                            <button type="button" onClick={goStoreCatalogPage} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: '#0f172a' }}>
                              <ArrowLeft size={22} strokeWidth={2.5} />
                            </button>
                            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 900, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Service details
                              </div>
                              <div style={{ fontSize: isMobileViewport ? 14 : 16, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Review the service before booking
                              </div>
                            </div>
                          </div>

                          {!isMobileViewport && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'center' }}>
                              {serviceHeroModel.profileImageUrl ? (
                                <img src={serviceHeroModel.profileImageUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0' }}>
                                  <ShoppingBag size={18} color="#f97316" />
                                </div>
                              )}
                              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em' }}>
                                {serviceHeroModel.name}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flex: 1 }}>
                            {supportHref ? (
                              <button type="button" onClick={() => openStorefrontActionLink(supportHref)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: isMobileViewport ? '0 12px' : '0 20px', borderRadius: 12, background: '#f97316', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)', whiteSpace: 'nowrap' }}>
                                <MessageCircle size={18} fill="currentColor" fillOpacity={0.2} />
                                {isMobileViewport ? 'Message' : 'Message Us'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', background: '#eef4fb', padding: isMobileViewport ? '24px 0 40px' : '32px 0 56px' }}>
                        <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? '0 16px' : '0 24px' }}>
                          {!detailPageServiceItem ? (
                            <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 28, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16, maxWidth: 760 }}>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark }}>No service details available</div>
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: STYLES.colors.muted }}>
                                  Go back to the services page and choose a service to view its details.
                                </p>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                <PrimaryButton onClick={goStoreCatalogPage} style={{ minHeight: 46 }}>Browse Services</PrimaryButton>
                              </div>
                            </section>
                          ) : (
                            <div style={{ display: 'grid', gap: 24 }}>
                              <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  <Badge background="#fff7ed" color={STYLES.colors.brand} border="#fdba74">
                                    {detailPageServiceItem.categoryMeta?.label || 'Service'}
                                  </Badge>
                                  <Badge background="#ffffff" color={STYLES.colors.dark} border="#dbe5ee">
                                    {detailPageServiceItem.serviceAreaLabel}
                                  </Badge>
                                </div>
                                <h1 style={{ margin: 0, fontSize: isMobileViewport ? 28 : 40, lineHeight: 1.05, fontWeight: 900, color: STYLES.colors.dark, letterSpacing: '-0.03em' }}>
                                  {detailPageServiceItem.variantName || detailPageServiceItem.name}
                                </h1>
                                <p style={{ margin: 0, maxWidth: 760, fontSize: 15, lineHeight: 1.7, color: STYLES.colors.muted }}>
                                  {detailPageServiceItem.description || 'Service details are synced from SKUpervisor. Review the service information below before continuing to booking.'}
                                </p>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(340px, 400px) minmax(0, 1fr)', gap: isMobileViewport ? 18 : 28, alignItems: 'start' }}>
                                <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', overflow: 'hidden', boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 0, position: isMobileViewport ? 'static' : 'sticky', top: isMobileViewport ? 'auto' : 96 }}>
                                  <div style={{ width: '100%', height: isMobileViewport ? 260 : 240, background: '#f8fafc' }}>
                                    {withAssetOrigin(detailPageServiceItem.image_url) ? (
                                      <img src={withAssetOrigin(detailPageServiceItem.image_url)} alt={detailPageServiceItem.variantName || detailPageServiceItem.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: STYLES.colors.muted, fontSize: 14 }}>
                                        No image
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ padding: isMobileViewport ? 18 : 22, display: 'grid', gap: 18 }}>
                                    <div style={{ display: 'grid', gap: 6, paddingTop: 2 }}>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        Starting at
                                      </div>
                                      <div style={{ fontSize: 30, fontWeight: 900, color: STYLES.colors.dark }}>
                                        {money(detailPageServiceItem.default_sale_price ?? 0)}
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
                                      <PrimaryButton style={{ minHeight: 46 }} onClick={() => addToCart(detailPageServiceItem)}>
                                        Add to Cart
                                      </PrimaryButton>
                                      <GhostButton style={{ minHeight: 46 }} onClick={goStoreCatalogPage}>
                                        Back to Services
                                      </GhostButton>
                                    </div>
                                  </div>
                                </section>

                                <div style={{ display: 'grid', gap: 18 }}>
                                  <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 24, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16 }}>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                      <div style={{ fontSize: 20, fontWeight: 900, color: STYLES.colors.dark }}>
                                        Service details
                                      </div>
                                      <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
                                        Core service information from SKUpervisor.
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                                      <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPageServiceItem.categoryMeta?.label || 'Service'}</div>
                                      </div>
                                      <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service area</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPageServiceItem.serviceAreaLabel}</div>
                                      </div>
                                      <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated duration</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPageServiceItem.durationLabel}</div>
                                      </div>
                                      <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff', minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Payment options</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark, lineHeight: 1.35 }}>{detailPagePaymentOptions.map((option) => option.label).join(' / ')}</div>
                                      </div>
                                    </div>
                                  </section>

                                  <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 24, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 10 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark }}>Description</div>
                                    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#334155' }}>
                                      {detailPageServiceItem.description || 'This service does not have a detailed description yet in SKUpervisor.'}
                                    </div>
                                  </section>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                }
                if (isBookingSubpage) {
                  const currentStep = serviceBookingStep;
                  const supportHref = String(serviceHeroModel?.actions?.messageHref || serviceHeroModel?.actions?.callHref || '').trim();
                  const bookingConfirmation = checkoutResult?.booking || null;
                  const confirmationLine = Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines[0] || null : null;
                  const confirmationReference = String(bookingConfirmation?.public_reference || checkoutResult?.tracking_pin || '').trim();
                  const confirmationServiceName = confirmationLine?.variantName || confirmationLine?.name || serviceBookingSummaryTitle;
                  const confirmationAmount = bookingConfirmation?.total_amount ?? ((Number(confirmationLine?.price ?? 0) || 0) * Math.max(1, Number(confirmationLine?.quantity || 1)));
                  const bookingSteps = [
                    { step: 1, label: 'Customer and service info', complete: stepOneComplete },
                    { step: 2, label: 'Payment information', complete: paymentStepComplete && serviceBookingStep > 2 },
                    { step: 3, label: 'Review and submit', complete: false }
                  ];
                  const reviewSections = [
                    {
                      title: 'Customer Information',
                      step: 1,
                      rows: [
                        { label: 'Customer Name', value: customerName || 'Not provided', fieldKey: 'customer_name' },
                        { label: 'Contact Number', value: customerPhone || 'Not provided', fieldKey: 'customer_phone' },
                        { label: 'Email', value: customerEmail || 'Not provided', fieldKey: 'customer_email' },
                        ...(bookingFieldPlan.requiresAddress ? [{ label: 'Full Address', value: customerAddress || 'Not provided', fieldKey: 'customer_address' }] : [])
                      ]
                    },
                    {
                      title: 'Schedule and Service Information',
                      step: 1,
                      rows: [
                        { label: 'Preferred Date', value: selectedServiceDatePart ? formatLongDateLabel(selectedServiceDatePart) : 'Not selected', fieldKey: 'preferred_date' },
                        { label: 'Preferred Time Slot', value: selectedServiceTimePart ? formatTimeSlotLabel(selectedServiceTimePart) : 'Not selected', fieldKey: 'preferred_time' },
                        ...(bookingFieldPlan.unitTypeField ? [{ label: bookingFieldPlan.unitTypeField.label, value: serviceUnitType || 'Not provided', fieldKey: 'unit_type' }] : []),
                        { label: bookingFieldPlan.unitCountField?.label || 'Number of Units', value: String(bookingSummaryQuantity), fieldKey: 'unit_count' }
                      ]
                    },
                    ...(bookingStepOneAdditionalFields.length > 0 ? [{
                      title: 'Additional Service Details',
                      step: 1,
                      rows: bookingStepOneAdditionalFields.map((field) => ({
                        label: field.label,
                        value: formatBookingReviewValue(field, serviceIntakeResponses[field.id]),
                        fieldKey: `intake_${field.id}`
                      }))
                    }] : []),
                    {
                      title: 'Payment Information',
                      step: 2,
                      rows: [
                        {
                          label: 'Payment Timing',
                          value: bookingPagePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Pending',
                          fieldKey: 'payment_timing'
                        }
                      ]
                    }
                  ];
                  return (
                    <section style={{ display: 'grid', gap: 0, paddingTop: 0 }}>
                      <div style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 100,
                        background: '#ffffff',
                        borderBottom: '1px solid #e5e7eb',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                        width: '100vw',
                        marginLeft: 'calc(50% - 50vw)',
                        backdropFilter: 'blur(8px)'
                      }}>
                        <div style={{
                          maxWidth: 1320,
                          margin: '0 auto',
                          padding: isMobileViewport ? '10px 16px' : '12px 24px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 16
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 12 : 16, minWidth: 0, flex: 1 }}>
                            <button
                              type="button"
                              onClick={goStoreCatalogPage}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: '#0f172a' }}
                            >
                              <ArrowLeft size={22} strokeWidth={2.5} />
                            </button>
                            {serviceHeroModel.profileImageUrl ? (
                              <img
                                src={serviceHeroModel.profileImageUrl}
                                alt=""
                                style={{ width: isMobileViewport ? 36 : 38, height: isMobileViewport ? 36 : 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                              />
                            ) : (
                              <div style={{ width: isMobileViewport ? 36 : 38, height: isMobileViewport ? 36 : 38, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0' }}>
                                <ShoppingBag size={18} color="#f97316" />
                              </div>
                            )}
                            <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {serviceHeroModel.name}
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', flex: 1 }}>
                            {supportHref ? (
                              <button
                                type="button"
                                onClick={() => openStorefrontActionLink(supportHref)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  height: 42,
                                  padding: isMobileViewport ? '0 12px' : '0 20px',
                                  borderRadius: 12,
                                  background: '#f97316',
                                  color: '#fff',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: 14,
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <MessageCircle size={18} fill="currentColor" fillOpacity={0.2} />
                                {isMobileViewport ? 'Message' : 'Message Us'}
                              </button>
                            ) : <div style={{ width: 40 }} />}
                          </div>
                        </div>
                      </div>

                      <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', background: '#eef4fb', padding: isMobileViewport ? '24px 0 40px' : '32px 0 56px' }}>
                        <div style={{ maxWidth: 1320, margin: '0 auto', padding: isMobileViewport ? '0 16px' : '0 24px' }}>
                          <div style={{ display: 'grid', gap: 18, marginBottom: 24 }}>
                            <h1 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, lineHeight: 1.08, fontWeight: 900, color: STYLES.colors.dark, letterSpacing: '-0.03em' }}>
                              Complete Your Service Booking
                            </h1>
                            <p style={{ margin: 0, maxWidth: 760, fontSize: isMobileViewport ? 15 : 17, lineHeight: 1.65, color: STYLES.colors.muted }}>
                              Share your details once, choose the schedule that works for you, review the booking, and submit it to the store team.
                            </p>
                          </div>

                          {bookingConfirmation ? (
                            <section
                              style={{
                                border: '1px solid #dbe5ee',
                                borderRadius: 28,
                                background: '#fff',
                                padding: isMobileViewport ? 20 : 28,
                                boxShadow: '0 22px 56px rgba(15, 23, 42, 0.08)',
                                display: 'grid',
                                gap: 20,
                                maxWidth: 860
                              }}
                            >
                              <div style={{ display: 'grid', gap: 10 }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content', padding: '8px 12px', borderRadius: 999, background: '#ecfdf5', color: '#15803d', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                  <CheckCircle2 size={16} />
                                  Booking confirmed
                                </div>
                                <div style={{ fontSize: isMobileViewport ? 28 : 36, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08 }}>
                                  Your service booking is confirmed
                                </div>
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: STYLES.colors.muted, maxWidth: 680 }}>
                                  The request has been sent to the store team. They will message you using the contact details you provided to confirm the schedule and assist with the next steps.
                                </p>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                                <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Reference</div>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{confirmationReference || 'Pending'}</div>
                                </div>
                                <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service</div>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{confirmationServiceName}</div>
                                </div>
                                <div style={{ display: 'grid', gap: 4, padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fcfdff' }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated total</div>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{money(confirmationAmount)}</div>
                                </div>
                              </div>
                              <div style={{ display: 'grid', gap: 8, fontSize: 14, color: '#334155', lineHeight: 1.65 }}>
                                <div>Keep your booking reference in case you need to follow up with the team.</div>
                                <div>You can return to the services page anytime to browse other services.</div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12, flexWrap: 'wrap' }}>
                                {checkoutResult?.payment?.checkout_url && (
                                  <a
                                    href={checkoutResult.payment.checkout_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minHeight: 46,
                                      borderRadius: 14,
                                      background: '#0f766e',
                                      color: '#fff',
                                      padding: '0 18px',
                                      fontWeight: 800,
                                      textDecoration: 'none'
                                    }}
                                  >
                                    Continue to Payment
                                  </a>
                                )}
                                <PrimaryButton
                                  onClick={() => {
                                    setCheckoutResult(null);
                                    goStoreCatalogPage();
                                  }}
                                  style={{ minHeight: 46 }}
                                >
                                  Back to Services
                                </PrimaryButton>
                              </div>
                            </section>
                          ) : !activeBookingService ? (
                            <section
                              style={{
                                border: '1px solid #dbe5ee',
                                borderRadius: 24,
                                background: '#fff',
                                padding: isMobileViewport ? 20 : 28,
                                boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)',
                                display: 'grid',
                                gap: 16,
                                maxWidth: 760
                              }}
                            >
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark }}>
                                  No service selected yet
                                </div>
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: STYLES.colors.muted }}>
                                  Choose a service first so we can load its booking details and requirements here.
                                </p>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                <PrimaryButton onClick={goStoreCatalogPage} style={{ minHeight: 46 }}>
                                  Browse Services
                                </PrimaryButton>
                              </div>
                            </section>
                          ) : (
                          <div style={{ display: 'grid', gap: 24, gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.18fr) minmax(340px, 390px)', alignItems: 'start' }}>
                            <div style={{ display: 'grid', gap: 18 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                                {bookingSteps.map((item) => (
                                  <button
                                    key={`booking-step-${item.step}`}
                                    type="button"
                                    onClick={() => setServiceBookingStep(item.step)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 12,
                                      padding: '14px 16px',
                                      borderRadius: 18,
                                      border: `1px solid ${serviceBookingStep === item.step ? servicesPrimaryBorder : '#e2e8f0'}`,
                                      background: serviceBookingStep === item.step ? servicesPrimarySoft : '#ffffff',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 30, height: 30, borderRadius: 999, background: item.complete ? '#16a34a' : serviceBookingStep === item.step ? servicesPrimary : '#e2e8f0', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 13 }}>
                                        {item.complete ? 'OK' : item.step}
                                      </div>
                                      <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{item.label}</div>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: item.complete ? '#15803d' : '#64748b' }}>
                                      {item.complete ? 'Complete' : item.step === serviceBookingStep ? 'In progress' : 'Pending'}
                                    </div>
                                  </button>
                                ))}
                              </div>

                              <section style={{ border: '1px solid #dbe5ee', borderRadius: 24, background: '#fff', padding: isMobileViewport ? 20 : 24, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 18 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected service</div>
                                    <div style={{ marginTop: 4, fontSize: 26, fontWeight: 900, color: STYLES.colors.dark }}>{activeBookingService?.variantName || activeBookingService?.name}</div>
                                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                                        {activeBookingService?.serviceAreaLabel || activeBookingService?.service_detail?.service_area_type || 'Service'}
                                      </span>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                                        {activeBookingService?.durationLabel || `${Number(activeBookingService?.service_detail?.duration_minutes || 0) || 0} min`}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {serviceBookingStep === 1 && (
                                  <div style={{ display: 'grid', gap: 20 }}>
                                    <div>
                                      <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark, fontFamily: servicesDisplayFont }}>Step 1: Customer and Service Information</div>
                                      <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
                                        Capture contact details once, then choose the preferred schedule and service specifics for this booking.
                                      </div>
                                    </div>

                                    <div style={{ display: 'grid', gap: 18 }}>
                                      <section style={{ display: 'grid', gap: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer Information</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                                          <label ref={registerBookingFieldRef('customer_name')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                            Customer Name *
                                            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Who is booking this service?" style={BOOKING_FIELD_STYLE} />
                                          </label>
                                          <label ref={registerBookingFieldRef('customer_phone')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                            Contact Number *
                                            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Mobile number" style={BOOKING_FIELD_STYLE} />
                                          </label>
                                          <label ref={registerBookingFieldRef('customer_email')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                            Email{bookingFieldPlan.emailField?.required ? ' *' : ''}
                                            <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="For confirmations or booking updates" style={BOOKING_FIELD_STYLE} />
                                          </label>
                                          {bookingFieldPlan.requiresAddress && (
                                            <label ref={registerBookingFieldRef('customer_address')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0, gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                                              Full Address{isAddressRequired ? ' *' : ''}
                                              <textarea
                                                value={customerAddress}
                                                onChange={(event) => setCustomerAddress(event.target.value)}
                                                placeholder="Barangay, street, subdivision, city, and other address details"
                                                style={{ ...BOOKING_FIELD_STYLE, minHeight: 92, resize: 'vertical' }}
                                              />
                                              {!bookingFieldPlan.addressField && (
                                                <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                                  This address will be included with the booking notes for the service team.
                                                </span>
                                              )}
                                            </label>
                                          )}
                                        </div>
                                      </section>

                                      <section style={{ display: 'grid', gap: 14 }}>
                                        <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Schedule and Service Information</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
                                          <label ref={registerBookingFieldRef('preferred_date')} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, color: '#475569' }}>Preferred Date *</div>
                                            <div style={{ position: 'relative', minWidth: 0 }}>
                                              <div
                                                role="button"
                                                tabIndex={0}
                                                onMouseDown={(event) => {
                                                  event.preventDefault();
                                                  openPreferredBookingDatePicker();
                                                }}
                                                onClick={openPreferredBookingDatePicker}
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    openPreferredBookingDatePicker();
                                                  }
                                                }}
                                                style={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: selectedServiceDatePart ? STYLES.colors.dark : '#94a3b8', fontWeight: selectedServiceDatePart ? 700 : 500, cursor: 'pointer' }}
                                              >
                                                <span>{selectedServiceDatePart ? formatLongDateLabel(selectedServiceDatePart) : 'Pick a preferred date'}</span>
                                                <CalendarDays size={18} color={servicesPrimary} />
                                              </div>
                                              <input
                                                ref={bookingPreferredDateInputRef}
                                                type="date"
                                                value={selectedServiceDatePart}
                                                min={bookingDateOptions[0]?.value || undefined}
                                                onChange={(event) => setServiceAppointmentAt(combineDateAndTimeParts(event.target.value, getPreferredBookingTimeForDate(activeBookingService, event.target.value, selectedServiceTimePart)))}
                                                aria-hidden="true"
                                                tabIndex={-1}
                                                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', inset: 'auto' }}
                                              />
                                            </div>
                                          </label>

                                          <label ref={registerBookingFieldRef('preferred_time')} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                              <div style={{ fontSize: 12, color: '#475569' }}>Preferred Time Slot *</div>
                                              {selectedServiceDatePart ? (
                                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                                  {bookingAvailabilityMessage}
                                                </div>
                                              ) : null}
                                            </div>
                                            <StorefrontDropdown
                                              value={selectedServiceTimePart}
                                              disabled={!selectedServiceDatePart || bookingTimeSlotOptions.length === 0}
                                              onChange={(nextValue) => setServiceAppointmentAt(combineDateAndTimeParts(selectedServiceDatePart, nextValue))}
                                              options={bookingTimeSlotOptions.map((slot) => ({
                                                value: slot.value,
                                                label: slot.label
                                              }))}
                                              placeholder={
                                                !selectedServiceDatePart
                                                  ? 'Choose a date first'
                                                  : bookingTimeSlotOptions.length === 0
                                                    ? 'No suggested time slots available'
                                                    : 'Select a time slot'
                                              }
                                              triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: 52, padding: '12px 48px 12px 13px' }}
                                              menuStyle={{ borderRadius: 18 }}
                                              selectedLabelStyle={{ fontWeight: selectedServiceDatePart && bookingTimeSlotOptions.length > 0 ? 700 : 500 }}
                                            />
                                          </label>

                                          {bookingFieldPlan.unitTypeField ? (
                                            <label ref={registerBookingFieldRef('unit_type')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                              {bookingFieldPlan.unitTypeField.label}{bookingFieldPlan.unitTypeField.required ? ' *' : ''}
                                              {bookingFieldPlan.unitTypeField.type === 'select' ? (
                                                <StorefrontDropdown
                                                  value={serviceUnitType}
                                                  onChange={setServiceUnitType}
                                                  options={bookingFieldPlan.unitTypeField.options.map((option) => ({ value: option, label: option }))}
                                                  placeholder="Select"
                                                  triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 6, padding: '12px 48px 12px 13px' }}
                                                  menuStyle={{ borderRadius: 18 }}
                                                />
                                              ) : (
                                                <input value={serviceUnitType} onChange={(event) => setServiceUnitType(event.target.value)} placeholder="Specify the unit type" style={BOOKING_FIELD_STYLE} />
                                              )}
                                            </label>
                                          ) : <div />}

                                          <label ref={registerBookingFieldRef('unit_count')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                            {bookingFieldPlan.unitCountField?.label || 'Number of Units'} *
                                            <input
                                              type="number"
                                              min="1"
                                              step="1"
                                              value={serviceDraftQuantity}
                                              onChange={(event) => setServiceDraftQuantity(Math.max(1, Number(event.target.value || 1)))}
                                              style={BOOKING_FIELD_STYLE}
                                            />
                                          </label>
                                        </div>
                                      </section>

                                      {bookingStepOneAdditionalFields.length > 0 && (
                                        <section style={{ display: 'grid', gap: 14 }}>
                                          <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Additional Service Details</div>
                                          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
                                            {bookingStepOneAdditionalFields.map((field) => (
                                              <label
                                                ref={registerBookingFieldRef(`intake_${field.id}`)}
                                                key={`booking-step-one-${field.id}`}
                                                style={{
                                                  display: 'block',
                                                  fontSize: 12,
                                                  color: '#475569',
                                                  minWidth: 0,
                                                  gridColumn: !isMobileViewport && shouldBookingFieldSpanFullWidth(field) ? '1 / -1' : 'auto'
                                                }}
                                              >
                                                {field.label}{field.required ? ' *' : ''}
                                                {field.type === 'textarea' ? (
                                                  <textarea value={serviceIntakeResponses[field.id] || ''} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))} style={{ ...BOOKING_FIELD_STYLE, minHeight: 92, resize: 'vertical' }} />
                                                ) : field.type === 'select' ? (
                                                  <StorefrontDropdown
                                                    value={serviceIntakeResponses[field.id] || ''}
                                                    onChange={(nextValue) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: nextValue }))}
                                                    options={field.options.map((option) => ({ value: option, label: option }))}
                                                    placeholder="Select"
                                                    triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 6, padding: '12px 48px 12px 13px' }}
                                                    menuStyle={{ borderRadius: 18 }}
                                                  />
                                                ) : field.type === 'checkbox' ? (
                                                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                                                    <input type="checkbox" checked={serviceIntakeResponses[field.id] === true} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.checked }))} />
                                                    <span style={{ fontSize: 13, color: STYLES.colors.text }}>Confirm</span>
                                                  </div>
                                                ) : (
                                                  <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={serviceIntakeResponses[field.id] || ''} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))} style={BOOKING_FIELD_STYLE} />
                                                )}
                                              </label>
                                            ))}
                                          </div>
                                        </section>
                                      )}
                                    </div>

                                    {(missingCustomerInformation.length > 0 || missingScheduleAndServiceInfo.length > 0 || missingStepOneAdditionalFields.length > 0) && (
                                      <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px', lineHeight: 1.6 }}>
                                        Complete the required customer, schedule, and service details before continuing.
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                      <PrimaryButton
                                        onClick={() => {
                                          const firstMissingField = missingCustomerInformation[0]
                                            || missingScheduleAndServiceInfo[0]
                                            || missingStepOneAdditionalFields[0]?.label
                                            || '';
                                          if (!stepOneComplete) {
                                            toast.error(firstMissingField ? `Complete "${firstMissingField}" before continuing.` : 'Complete the required booking details before continuing.');
                                            return;
                                          }
                                          setServiceBookingStep(2);
                                        }}
                                        style={{ minHeight: 46 }}
                                      >
                                        Continue to Payment
                                      </PrimaryButton>
                                    </div>
                                  </div>
                                )}

                                {serviceBookingStep === 2 && (
                                  <div style={{ display: 'grid', gap: 18 }}>
                                    <div>
                                      <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark, fontFamily: servicesDisplayFont }}>Step 2: Payment Information</div>
                                      <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
                                        Choose how the service will be paid. The booking itself is still submitted through the current services contract.
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gap: 16 }}>
                                      <label ref={registerBookingFieldRef('payment_timing')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0, maxWidth: isMobileViewport ? '100%' : 360 }}>
                                        Payment Timing
                                        <StorefrontDropdown
                                          value={servicePaymentTiming}
                                          onChange={setServicePaymentTiming}
                                          options={bookingPagePaymentOptions.map((option) => ({
                                            value: option.value,
                                            label: option.label
                                          }))}
                                          triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 6, padding: '12px 48px 12px 13px' }}
                                          menuStyle={{ borderRadius: 18 }}
                                        />
                                      </label>

                                      {servicePaymentTiming === 'prepaid' || servicePaymentTiming === 'deposit' ? (
                                        <div style={{ display: 'grid', gap: 16 }}>
                                          <div style={{ display: 'grid', gap: 10, padding: '16px 18px', borderRadius: 18, border: '1px solid #fed7aa', background: '#fff7ed' }}>
                                            <div style={{ fontSize: 14, fontWeight: 900, color: '#9a3412' }}>
                                              {servicePaymentTiming === 'deposit' ? 'Deposit payment preview' : 'Pay now preview'}
                                            </div>
                                            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#9a3412' }}>
                                              This is a temporary storefront payment UI. The current services backend still completes the actual payment handoff after the booking is submitted and returns a secure checkout link.
                                            </div>
                                          </div>

                                          <div style={{ display: 'grid', gap: 14, padding: isMobileViewport ? 16 : 18, borderRadius: 22, border: '1px solid #dbe5ee', background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', boxShadow: '0 14px 36px rgba(15, 23, 42, 0.06)' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                              {[
                                                { value: 'qr', label: 'QR Payment' },
                                                { value: 'card', label: 'Card Details' }
                                              ].map((option) => {
                                                const isActive = servicePaymentPreviewMethod === option.value;
                                                return (
                                                  <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => setServicePaymentPreviewMethod(option.value)}
                                                    style={{
                                                      minHeight: 40,
                                                      padding: '0 16px',
                                                      borderRadius: 999,
                                                      border: `1px solid ${isActive ? '#67e8f9' : '#dbe5ee'}`,
                                                      background: isActive ? '#ecfeff' : '#fff',
                                                      color: isActive ? '#155e75' : '#334155',
                                                      fontSize: 13,
                                                      fontWeight: 800,
                                                      cursor: 'pointer',
                                                      transition: 'all 0.2s ease'
                                                    }}
                                                  >
                                                    {option.label}
                                                  </button>
                                                );
                                              })}
                                            </div>

                                            {servicePaymentPreviewMethod === 'qr' && (
                                              <div style={{ display: 'grid', gap: 16 }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '220px minmax(0, 1fr)', gap: 16, alignItems: 'stretch' }}>
                                                  <div style={{ display: 'grid', placeItems: 'center', minHeight: 220, borderRadius: 22, background: 'radial-gradient(circle at top, #ecfeff 0%, #e0f2fe 52%, #ffffff 100%)', border: '1px dashed #67e8f9', padding: 18 }}>
                                                    <div style={{ width: 160, height: 160, borderRadius: 20, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'grid', placeItems: 'center', boxShadow: '0 18px 36px rgba(14, 165, 233, 0.18)' }}>
                                                      <div style={{ width: 112, height: 112, borderRadius: 12, background: 'repeating-linear-gradient(90deg, #ffffff 0 10px, #0f172a 10px 20px), repeating-linear-gradient(0deg, #ffffff 0 10px, #0f172a 10px 20px)', backgroundBlendMode: 'screen' }} />
                                                    </div>
                                                  </div>
                                                  <div style={{ display: 'grid', gap: 10 }}>
                                                    <div style={{ fontSize: 16, fontWeight: 900, color: STYLES.colors.dark }}>QR payment preview</div>
                                                    <div style={{ fontSize: 13, lineHeight: 1.7, color: '#475569' }}>
                                                      Use this area later for bank transfer, e-wallet, or generated QR payment instructions. For now, the final payment link still appears only after the booking is submitted.
                                                    </div>
                                                    <div style={{ display: 'grid', gap: 8 }}>
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Reference amount</span>
                                                        <strong style={{ fontSize: 14, color: STYLES.colors.dark }}>{money(bookingSummaryAmount)}</strong>
                                                      </div>
                                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0' }}>
                                                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Payment mode</span>
                                                        <strong style={{ fontSize: 14, color: STYLES.colors.dark }}>{servicePaymentTiming === 'deposit' ? 'Deposit' : 'Full payment'}</strong>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>

                                                <label style={{ display: 'grid', gap: 10, fontSize: 12, color: '#475569' }}>
                                                  Upload Receipt
                                                  <div style={{ display: 'grid', gap: 10, padding: '18px 16px', borderRadius: 20, border: '1px dashed #94a3b8', background: '#fff' }}>
                                                    <input
                                                      type="file"
                                                      accept="image/*,.pdf"
                                                      onChange={(event) => setServicePaymentPreviewReceiptName(event.target.files?.[0]?.name || '')}
                                                      style={{ fontSize: 13, color: '#334155' }}
                                                    />
                                                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                                                      {servicePaymentPreviewReceiptName
                                                        ? `Selected file: ${servicePaymentPreviewReceiptName}`
                                                        : 'Attach a screenshot or receipt file here for the future QR payment flow preview.'}
                                                    </div>
                                                  </div>
                                                </label>
                                                <div style={{ fontSize: 12, lineHeight: 1.7, color: '#64748b' }}>
                                                  This receipt upload is temporary UI only. The file is not sent anywhere in the current storefront booking contract.
                                                </div>
                                              </div>
                                            )}

                                            {servicePaymentPreviewMethod === 'card' && (
                                              <div style={{ display: 'grid', gap: 14 }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                                                  <label style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0, gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                                                    Cardholder Name
                                                    <input
                                                      value={servicePaymentPreviewCard.cardholder}
                                                      onChange={(event) => setServicePaymentPreviewCard((previous) => ({ ...previous, cardholder: event.target.value }))}
                                                      placeholder="Name on card"
                                                      style={BOOKING_FIELD_STYLE}
                                                    />
                                                  </label>
                                                  <label style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0, gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                                                    Card Number
                                                    <input
                                                      value={servicePaymentPreviewCard.cardNumber}
                                                      onChange={(event) => setServicePaymentPreviewCard((previous) => ({ ...previous, cardNumber: event.target.value }))}
                                                      placeholder="0000 0000 0000 0000"
                                                      style={BOOKING_FIELD_STYLE}
                                                    />
                                                  </label>
                                                  <label style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                                    Expiry
                                                    <input
                                                      value={servicePaymentPreviewCard.expiry}
                                                      onChange={(event) => setServicePaymentPreviewCard((previous) => ({ ...previous, expiry: event.target.value }))}
                                                      placeholder="MM/YY"
                                                      style={BOOKING_FIELD_STYLE}
                                                    />
                                                  </label>
                                                  <label style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0 }}>
                                                    CVV
                                                    <input
                                                      value={servicePaymentPreviewCard.cvv}
                                                      onChange={(event) => setServicePaymentPreviewCard((previous) => ({ ...previous, cvv: event.target.value }))}
                                                      placeholder="123"
                                                      style={BOOKING_FIELD_STYLE}
                                                    />
                                                  </label>
                                                </div>
                                                <div style={{ fontSize: 12, lineHeight: 1.7, color: '#64748b' }}>
                                                  Temporary preview only. These card fields are not submitted to the backend and are here to simulate the future pay-now experience.
                                                </div>
                                              </div>
                                            )}

                                          </div>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'grid', gap: 10, padding: '16px 18px', borderRadius: 18, border: '1px solid #dbeafe', background: '#eff6ff' }}>
                                          <div style={{ fontSize: 14, fontWeight: 900, color: '#1d4ed8' }}>
                                            Pay later selected
                                          </div>
                                          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>
                                            No advance payment details are needed here. The store team will assist you with the next payment step after they review the booking.
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                      <GhostButton onClick={() => setServiceBookingStep(1)} style={{ minHeight: 46 }}>Back</GhostButton>
                                      <PrimaryButton onClick={() => setServiceBookingStep(3)} style={{ minHeight: 46 }}>
                                        Continue to Review
                                      </PrimaryButton>
                                    </div>
                                  </div>
                                )}

                                {serviceBookingStep === 3 && (
                                  <div style={{ display: 'grid', gap: 18 }}>
                                    <div>
                                      <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark, fontFamily: servicesDisplayFont }}>Step 3: Review and Submit</div>
                                      <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
                                        Check the booking details before submitting. Use the edit actions to jump straight back to the relevant step.
                                      </div>
                                    </div>
                                    <div style={{ display: 'grid', gap: 16 }}>
                                      {reviewSections.map((section) => (
                                        <section key={section.title} style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fcfdff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: 15, fontWeight: 900, color: STYLES.colors.dark }}>{section.title}</div>
                                            <GhostButton onClick={() => jumpToBookingField(section.step, section.rows[0]?.fieldKey || '')} style={{ minHeight: 38, padding: '0 14px' }}>
                                              Edit section
                                            </GhostButton>
                                          </div>
                                          <div style={{ display: 'grid', gap: 10 }}>
                                            {section.rows.map((row) => (
                                              <div key={`${section.title}-${row.label}`} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(140px, 180px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</div>
                                                <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.55, wordBreak: 'break-word' }}>{row.value}</div>
                                                <button
                                                  type="button"
                                                  onClick={() => jumpToBookingField(section.step, row.fieldKey)}
                                                  style={{ border: 'none', background: 'transparent', color: servicesPrimary, fontWeight: 800, cursor: 'pointer', padding: 0, justifySelf: isMobileViewport ? 'start' : 'end' }}
                                                >
                                                  Edit
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        </section>
                                      ))}
                                    </div>
                                    {selectedLocation?.is_open === false && (
                                      <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                                        Selected location is closed and cannot accept bookings right now.
                                      </div>
                                    )}
                                    {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                      <GhostButton onClick={() => setServiceBookingStep(2)} style={{ minHeight: 46 }}>Back</GhostButton>
                                      <PrimaryButton
                                        onClick={() => {
                                          const firstMissingField = missingCustomerInformation[0]
                                            || missingScheduleAndServiceInfo[0]
                                            || missingStepOneAdditionalFields[0]?.label
                                            || '';
                                          if (!stepOneComplete) {
                                            toast.error(firstMissingField ? `Complete "${firstMissingField}" before submitting the booking.` : 'Complete the required booking details before submitting.');
                                            setServiceBookingStep(1);
                                            return;
                                          }
                                          if (!paymentStepComplete) {
                                            toast.error('Select a payment timing before submitting the booking.');
                                            setServiceBookingStep(2);
                                            return;
                                          }
                                          handleCheckout();
                                        }}
                                        style={{ minHeight: 46 }}
                                      >
                                        {checkoutLoading ? 'Submitting...' : 'Submit Booking'}
                                      </PrimaryButton>
                                    </div>
                                  </div>
                                )}
                              </section>
                            </div>

                            <aside style={{ display: 'grid', gap: 16, position: isMobileViewport ? 'static' : 'sticky', top: 100 }}>
                              <div style={{ border: '1px solid #dbe5ee', borderRadius: 28, background: '#fff', padding: 24, boxShadow: '0 22px 56px rgba(15, 23, 42, 0.12)', display: 'grid', gap: 16 }}>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking Summary</div>
                                  <div style={{ marginTop: 6, fontSize: 32, fontWeight: 900, color: STYLES.colors.dark }}>
                                    {money(bookingSummaryAmount)}
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gap: 10 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: '#334155' }}>
                                    <span>Service</span>
                                    <strong>{serviceBookingSummaryTitle}</strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: '#334155' }}>
                                    <span>Schedule</span>
                                    <strong>{serviceBookingSummarySchedule}</strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: '#334155' }}>
                                    <span>Units</span>
                                    <strong>{bookingSummaryQuantity}</strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: '#334155' }}>
                                    <span>Payment</span>
                                    <strong>{bookingPagePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Pending'}</strong>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gap: 8, paddingTop: 4 }}>
                                  {[{ label: 'Customer and service info ready', done: stepOneComplete }, { label: 'Payment choice selected', done: paymentStepComplete }, { label: 'Ready for final review', done: reviewStepReady }].map((item) => (
                                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: item.done ? '#15803d' : '#64748b' }}>
                                      <span style={{ width: 18, height: 18, borderRadius: 999, background: item.done ? '#16a34a' : '#e2e8f0', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>
                                        {item.done ? 'OK' : '-'}
                                      </span>
                                      {item.label}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </aside>
                          </div>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                }
                return (
                  <>
                    <section
                      id="storefront-catalog-section"
                      style={{
                        display: 'grid',
                        gap: 18,
                        background: '#ffffff',
                        borderRadius: 0,
                        padding: isMobileViewport ? '24px 0 44px' : '34px 0 64px',
                        marginLeft: 'calc(50% - 50vw)',
                        width: '100vw'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 1320,
                          width: '100%',
                          margin: '0 auto',
                          paddingLeft: isMobileViewport ? 16 : 24,
                          paddingRight: isMobileViewport ? 16 : 24,
                          display: 'grid',
                          gap: 18
                        }}
                      >
                        <div style={{ display: 'grid', gap: 6 }}>
                          <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>
                            {servicesSectionTitle}
                          </h2>
                          <p style={{ margin: 0, fontSize: 14, color: STYLES.colors.muted }}>{servicesSectionSubtitle}</p>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: isMobileViewport ? 'column' : 'row',
                            gap: 12,
                            alignItems: isMobileViewport ? 'stretch' : 'center',
                            width: '100%'
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              border: '1px solid #e5e7eb',
                              borderRadius: controlRadius,
                              background: '#f8fafc',
                              padding: '0 12px 0 14px',
                              minHeight: 44,
                              width: '100%',
                              flex: isMobileViewport ? '0 0 auto' : '1 1 0',
                              maxWidth: isMobileViewport ? '100%' : 620
                            }}
                          >
                            <Search size={16} color="#64748b" />
                            <input
                              value={catalogSearch}
                              onChange={(event) => setCatalogSearch(event.target.value)}
                              placeholder="Search services"
                              style={{
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                width: '100%',
                                minWidth: 0,
                                fontSize: 14,
                                color: STYLES.colors.text
                              }}
                            />
                          </label>

                          <div
                            style={{
                              display: 'flex',
                              flexDirection: isMobileViewport ? 'column' : 'row',
                              gap: 12,
                              alignItems: isMobileViewport ? 'stretch' : 'center',
                              marginLeft: isMobileViewport ? 0 : 'auto',
                              width: isMobileViewport ? '100%' : 'auto',
                              flexShrink: 0
                            }}
                          >
                            <StorefrontDropdown
                              value={resolvedTab}
                              onChange={setActiveServiceTab}
                              options={serviceCategoryOptions.map((option) => ({
                                value: option.key,
                                label: `${option.label} (${option.count})`,
                                icon: option.icon
                              }))}
                              triggerStyle={{
                                minHeight: 44,
                                borderRadius: controlRadius,
                                width: isMobileViewport ? '100%' : 240,
                                flexShrink: 0,
                                boxShadow: '0 10px 24px rgba(15,23,42,0.06)'
                              }}
                              containerStyle={{
                                width: isMobileViewport ? '100%' : 240,
                                flexShrink: 0
                              }}
                              menuStyle={{ borderRadius: 20 }}
                            />

                            <StorefrontDropdown
                              value={serviceSortOption}
                              onChange={setServiceSortOption}
                              options={[
                                { value: 'recommended', label: 'Recommended' },
                                { value: 'price_asc', label: 'Price: Low to High' },
                                { value: 'price_desc', label: 'Price: High to Low' }
                              ]}
                              triggerStyle={{
                                minHeight: 44,
                                borderRadius: controlRadius,
                                width: isMobileViewport ? '100%' : 240,
                                flexShrink: 0,
                                boxShadow: '0 10px 24px rgba(15,23,42,0.06)'
                              }}
                              containerStyle={{
                                width: isMobileViewport ? '100%' : 240,
                                flexShrink: 0
                              }}
                              menuStyle={{ borderRadius: 20 }}
                            />

                            <button
                              type="button"
                              onClick={() => setIsServiceFilterOpen((prev) => !prev)}
                              style={{
                                minHeight: 44,
                                borderRadius: controlRadius,
                                border: `1px solid ${servicesPrimary}`,
                                background: isServiceFilterOpen || hasActiveFilters ? servicesPrimaryDark : servicesPrimary,
                                color: '#ffffff',
                                padding: '0 18px',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                width: isMobileViewport ? '100%' : 'auto',
                                minWidth: isMobileViewport ? 0 : 128,
                                flexShrink: 0,
                                boxShadow:
                                  isServiceFilterOpen || hasActiveFilters
                                    ? `0 10px 24px ${servicesPrimaryShadowStrong}`
                                    : `0 8px 20px ${servicesPrimaryShadow}`
                              }}
                            >
                              <SlidersHorizontal size={16} />
                              Filters
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 12,
                            flexWrap: 'wrap'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: isMobileViewport ? 'flex-start' : 'flex-end',
                              gap: 12,
                              flexWrap: 'wrap',
                              marginLeft: isMobileViewport ? 0 : 'auto'
                            }}
                          >
                            <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
                              {sortedServices.length} service{sortedServices.length === 1 ? '' : 's'} shown
                            </div>
                            {sortedServices.length > 0 && (
                              <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
                                Showing {servicePageStart}-{servicePageEnd}
                              </div>
                            )}
                            {hasActiveFilters && (
                              <button
                                type="button"
                                onClick={() => {
                                  setServiceAvailabilityFilter('all');
                                  setServiceAreaFilter('all');
                                  setServiceDurationFilter('all');
                                }}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: servicesPrimary,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  padding: 0,
                                  cursor: 'pointer'
                                }}
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                        </div>

                        {isServiceFilterOpen && (
                          <div
                            style={{
                              position: 'fixed',
                              inset: 0,
                              zIndex: 2200,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: isMobileViewport ? 16 : 24
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(15,23,42,0.45)',
                                backdropFilter: 'blur(4px)'
                              }}
                            />
                            <div
                              style={{
                                position: 'relative',
                                zIndex: 1,
                                width: '100%',
                                maxWidth: 560,
                                background: '#ffffff',
                                borderRadius: 22,
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
                                padding: isMobileViewport ? 18 : 22,
                                display: 'grid',
                                gap: 16
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div>
                                  <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark }}>Filter Services</div>
                                  <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
                                    Applies services-mode filters using storefront availability, service area, and duration fields from SKUpervisor-backed catalog records.
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIsServiceFilterOpen(false)}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    border: '1px solid #e5e7eb',
                                    background: '#fff',
                                    color: STYLES.colors.dark,
                                    cursor: 'pointer',
                                    fontWeight: 800
                                  }}
                                >
                                  ×
                                </button>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
                                  Availability
                                  <StorefrontDropdown
                                    value={serviceAvailabilityFilter}
                                    onChange={setServiceAvailabilityFilter}
                                    options={[
                                      { value: 'all', label: 'All services' },
                                      { value: 'available', label: 'Available now' },
                                      { value: 'unavailable', label: 'Unavailable' }
                                    ]}
                                    triggerStyle={{ minHeight: 42, borderRadius: 14 }}
                                    menuStyle={{ borderRadius: 18 }}
                                  />
                                </label>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
                                  Service area
                                  <StorefrontDropdown
                                    value={serviceAreaFilter}
                                    onChange={setServiceAreaFilter}
                                    options={[
                                      { value: 'all', label: 'All areas' },
                                      { value: 'in_store', label: 'In-store' },
                                      { value: 'customer_location', label: 'Home / on-site' }
                                    ]}
                                    triggerStyle={{ minHeight: 42, borderRadius: 14 }}
                                    menuStyle={{ borderRadius: 18 }}
                                  />
                                </label>
                                <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
                                  Duration
                                  <StorefrontDropdown
                                    value={serviceDurationFilter}
                                    onChange={setServiceDurationFilter}
                                    options={[
                                      { value: 'all', label: 'Any duration' },
                                      { value: 'short', label: 'Short under 1 hr' },
                                      { value: 'standard', label: 'Standard 1-2 hrs' },
                                      { value: 'extended', label: 'Extended 2+ hrs' }
                                    ]}
                                    triggerStyle={{ minHeight: 42, borderRadius: 14 }}
                                    menuStyle={{ borderRadius: 18 }}
                                  />
                                </label>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                                <GhostButton
                                  style={{ minHeight: 42, fontSize: 13 }}
                                  onClick={() => {
                                    setServiceAvailabilityFilter('all');
                                    setServiceAreaFilter('all');
                                    setServiceDurationFilter('all');
                                  }}
                                >
                                  Clear filters
                                </GhostButton>
                                <PrimaryButton style={{ minHeight: 42, fontSize: 13 }} onClick={() => setIsServiceFilterOpen(false)}>
                                  Apply filters
                                </PrimaryButton>
                              </div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: servicesGridColumns, gap: 22 }}>
                          {paginatedServices.map((item) => {
                            const imageUrl = withAssetOrigin(item.image_url);
                            const available = isItemAvailable(item);
                            const ServiceCategoryIcon = SERVICE_CATEGORY_ICON_MAP[item.categoryMeta?.iconToken] || Sparkles;
                            return (
                              <div
                                key={item.item_id}
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 18,
                                  overflow: 'hidden',
                                  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  cursor: 'pointer'
                                }}
                                onClick={() => openServiceDetail(item)}
                              >
                                <div style={{ width: '100%', height: 184, minHeight: 184, maxHeight: 184, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
                                  {imageUrl ? (
                                    <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  ) : (
                                    <div
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        display: 'grid',
                                        placeItems: 'center',
                                        color: STYLES.colors.muted,
                                        fontSize: 13
                                      }}
                                    >
                                      No image
                                    </div>
                                  )}
                                  {!available && (
                                    <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                      <Badge background="#fff7ed" color="#c2410c" border="#fdba74">
                                        Unavailable
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                                <div style={{ padding: 16, display: 'grid', gap: 10, flex: 1 }}>
                                  <div>
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', marginBottom: 4 }}>
                                      <ServiceCategoryIcon size={13} />
                                      <span>{item.categoryMeta?.label || 'Service'}</span>
                                    </div>
                                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.25, color: STYLES.colors.dark }}>
                                      {item.variantName || item.name}
                                    </h4>
                                  </div>
                                  <p
                                    style={{
                                      margin: 0,
                                      fontSize: 12,
                                      color: STYLES.colors.text,
                                      lineHeight: 1.45,
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden'
                                    }}
                                  >
                                    {item.description || 'Professional service options synced from SKUpervisor.'}
                                  </p>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 999, padding: '4px 8px' }}>
                                      {item.serviceAreaLabel}
                                    </span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 999, padding: '4px 8px' }}>
                                      {item.durationLabel}
                                    </span>
                                  </div>
                                  <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
                                    <div style={{ fontSize: 13, color: STYLES.colors.muted }}>Starting at</div>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: servicesPrimaryDark }}>{money(item.default_sale_price ?? 0)}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 8 }}>
                                      <GhostButton style={{ minHeight: 38, fontSize: 13 }} onClick={(event) => { event.stopPropagation(); openServiceDetail(item); }}>
                                        View Details
                                      </GhostButton>
                                      <PrimaryButton style={{ minHeight: 38, fontSize: 13 }} onClick={(event) => { event.stopPropagation(); addToCart(item); }} disabled={!available}>
                                        Add to Cart
                                      </PrimaryButton>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {sortedServices.length === 0 && (
                            <div
                              style={{
                                gridColumn: '1 / -1',
                                textAlign: 'center',
                                padding: isMobileViewport ? 24 : 48,
                                color: STYLES.colors.muted,
                                border: '1px dashed #cbd5e1',
                                borderRadius: 18,
                                background: '#f8fafc'
                              }}
                            >
                              {hasSearchQuery ? 'No services found. Try another keyword.' : 'No services available in this category yet.'}
                            </div>
                          )}
                        </div>

                        {sortedServices.length > 0 && totalServicePages > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobileViewport ? 'center' : 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
                                Page {resolvedServicePage} of {totalServicePages}
                              </div>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
                                Per page
                                <StorefrontDropdown
                                  value={servicePageSize}
                                  onChange={(nextValue) => setServicePageSize(Number(nextValue) || 8)}
                                  options={[4, 8, 12, 16].map((size) => ({ value: size, label: String(size) }))}
                                  triggerStyle={{ minHeight: 36, borderRadius: 14, minWidth: 88, padding: '8px 42px 8px 12px' }}
                                  containerStyle={{ minWidth: 88 }}
                                  menuStyle={{ borderRadius: 16 }}
                                  selectedLabelStyle={{ fontSize: 13 }}
                                />
                              </label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <GhostButton
                                style={{ minHeight: 38, padding: '0 14px', opacity: resolvedServicePage === 1 ? 0.5 : 1 }}
                                onClick={() => setServicePage((previous) => Math.max(1, previous - 1))}
                                disabled={resolvedServicePage === 1}
                              >
                                Previous
                              </GhostButton>
                              {Array.from({ length: totalServicePages }, (_, index) => index + 1)
                                .slice(Math.max(0, resolvedServicePage - 3), Math.max(0, resolvedServicePage - 3) + 5)
                                .map((pageNumber) => (
                                  <button
                                    key={`service-page-${pageNumber}`}
                                    type="button"
                                    onClick={() => setServicePage(pageNumber)}
                                    style={{
                                      minWidth: 38,
                                      minHeight: 38,
                                      borderRadius: 10,
                                      border: `1px solid ${pageNumber === resolvedServicePage ? servicesPrimary : '#e5e7eb'}`,
                                      background: pageNumber === resolvedServicePage ? servicesPrimary : '#fff',
                                      color: pageNumber === resolvedServicePage ? '#fff' : STYLES.colors.dark,
                                      fontWeight: 800,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {pageNumber}
                                  </button>
                                ))}
                              <GhostButton
                                style={{ minHeight: 38, padding: '0 14px', opacity: resolvedServicePage === totalServicePages ? 0.5 : 1 }}
                                onClick={() => setServicePage((previous) => Math.min(totalServicePages, previous + 1))}
                                disabled={resolvedServicePage === totalServicePages}
                              >
                                Next
                              </GhostButton>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {Array.isArray(promoSectionModel) && promoSectionModel.length > 0 && (
                      <section
                        style={{
                          marginLeft: 'calc(50% - 50vw)',
                          width: '100vw',
                          marginTop: isMobileViewport ? 20 : 28,
                          padding: isMobileViewport ? '24px 0 20px' : '32px 0 26px',
                          background: 'linear-gradient(180deg, #f4fffd 0%, #ffffff 100%)',
                          borderTop: `1px solid ${servicesPrimaryBorder}`,
                          borderBottom: '1px solid #d8f3ef',
                          display: 'grid',
                          gap: 14
                        }}
                      >
                        <div
                          style={{
                            maxWidth: 1220,
                            width: '100%',
                            margin: '0 auto',
                            paddingLeft: isMobileViewport ? 16 : 24,
                            paddingRight: isMobileViewport ? 16 : 24,
                            display: 'grid',
                            gap: 14
                          }}
                        >
                          <div style={{ display: 'grid', gap: 4 }}>
                            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 22 : 26, fontWeight: 900, color: STYLES.colors.dark, fontFamily: servicesDisplayFont }}>
                              Current Promos
                            </h2>
                            <p style={{ margin: 0, fontSize: 13, color: STYLES.colors.muted }}>
                              Limited-time offers available from this storefront.
                            </p>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                              gap: 18
                            }}
                          >
                            {promoSectionModel.map((promoEntry, index) => (
                              <article
                                key={`promo-card-${index}`}
                                style={{
                                  position: 'relative',
                                  borderRadius: 26,
                                  border: `1px solid ${servicesPrimaryBorder}`,
                                  background: 'linear-gradient(135deg, #ffffff 0%, #f5fffd 58%, #ecfeff 100%)',
                                  boxShadow: '0 14px 28px rgba(15, 118, 110, 0.10)',
                                  padding: isMobileViewport ? '18px 16px' : '18px 20px',
                                  display: 'grid',
                                  gap: 14,
                                  overflow: 'hidden',
                                  transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
                                  animation: 'promoCardFloatIn 420ms ease both',
                                  animationDelay: `${index * 90}ms`
                                }}
                                onMouseEnter={(event) => {
                                  if (isMobileViewport) return;
                                  event.currentTarget.style.transform = 'translateY(-4px)';
                                  event.currentTarget.style.boxShadow = '0 22px 36px rgba(15, 118, 110, 0.16)';
                                  event.currentTarget.style.borderColor = servicesPrimary;
                                }}
                                onMouseLeave={(event) => {
                                  if (isMobileViewport) return;
                                  event.currentTarget.style.transform = 'translateY(0)';
                                  event.currentTarget.style.boxShadow = '0 14px 28px rgba(15, 118, 110, 0.10)';
                                  event.currentTarget.style.borderColor = servicesPrimaryBorder;
                                }}
                              >
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: '0 auto 0 0',
                                    width: 4,
                                    background: `linear-gradient(180deg, ${servicesPrimary} 0%, ${servicesPrimaryDark} 100%)`,
                                    boxShadow: '0 0 22px rgba(15, 118, 110, 0.22)'
                                  }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 999,
                                      border: `1px solid ${servicesPrimaryBorder}`,
                                      background: servicesPrimarySoft,
                                      color: servicesPrimary,
                                      display: 'grid',
                                      placeItems: 'center',
                                      flexShrink: 0
                                    }}
                                  >
                                    <Sparkles size={17} />
                                  </div>
                                  <div style={{ fontSize: isMobileViewport ? 14 : 16, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', lineHeight: 1.2 }}>
                                    {promoEntry.title || promoEntry.badge || 'Promo'}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(96px, 124px) minmax(0, 1fr)',
                                    gap: isMobileViewport ? 12 : 14,
                                    alignItems: 'stretch'
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'grid',
                                      alignContent: 'center',
                                      justifyItems: isMobileViewport ? 'start' : 'start',
                                      paddingRight: isMobileViewport ? 0 : 14,
                                      borderRight: isMobileViewport ? 'none' : '1px solid #d8f3ef'
                                    }}
                                  >
                                    <div style={{ fontSize: isMobileViewport ? 38 : 48, fontWeight: 900, lineHeight: 0.92, color: servicesPrimary, letterSpacing: '-0.04em' }}>
                                      {promoEntry.headline || promoEntry.badge || 'Promo'}
                                    </div>
                                  </div>

                                  <div style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0 }}>
                                    <div style={{ fontSize: isMobileViewport ? 18 : 20, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.15 }}>
                                      {promoEntry.subtitle || 'Storefront offer'}
                                    </div>
                                    {promoEntry.supportingText && (
                                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                                        {promoEntry.supportingText}
                                      </div>
                                    )}
                                    {promoEntry.validityText && (
                                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                                        {promoEntry.validityText}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}

                    <section
                      style={{
                        marginTop: 0,
                        marginLeft: 'calc(50% - 50vw)',
                        width: '100vw',
                        padding: isMobileViewport ? '36px 0 30px' : '72px 0 42px',
                        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                        borderTop: '1px solid #e2e8f0',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'grid',
                        gap: 18
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 1320,
                          width: '100%',
                          margin: '0 auto',
                          paddingLeft: isMobileViewport ? 16 : 24,
                          paddingRight: isMobileViewport ? 16 : 24,
                          display: 'grid',
                          gap: 18
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: isMobileViewport ? 'flex-start' : 'center',
                            justifyContent: 'space-between',
                            flexDirection: isMobileViewport ? 'column' : 'row',
                            gap: 16
                          }}
                        >
                          <div>
                            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>
                              Customer Reviews
                            </h2>
                            <p style={{ margin: '6px 0 0 0', fontSize: 14, color: STYLES.colors.muted }}>
                              See what customers say about this storefront
                            </p>
                          </div>
                          <div style={{ display: 'grid', gap: 10, justifyItems: isMobileViewport ? 'stretch' : 'end', width: isMobileViewport ? '100%' : 'auto' }}>
                            <PrimaryButton
                              onClick={() => setIsReviewModalOpen(true)}
                              style={{
                                minHeight: 46,
                                minWidth: isMobileViewport ? '100%' : 168,
                                justifyContent: 'center'
                              }}
                            >
                              Write a Review
                            </PrimaryButton>
                            {hasReviewSummary && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 12,
                                  padding: '10px 14px',
                                  border: '1px solid #dbe5ee',
                                  borderRadius: 16,
                                  background: '#fcfdff',
                                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)'
                                }}
                              >
                                <div style={{ fontSize: 24, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1 }}>
                                  {reviewScore.toFixed(1)}
                                </div>
                                <div style={{ display: 'grid', gap: 4 }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: STYLES.colors.amber, fontSize: 14, lineHeight: 1 }}>
                                    {Array.from({ length: 5 }, (_, index) => (
                                      <span key={`review-summary-star-${index}`} style={{ opacity: index < Math.round(reviewScore) ? 1 : 0.25 }}>
                                        *
                                      </span>
                                    ))}
                                  </div>
                                  <div style={{ fontSize: 12, color: STYLES.colors.muted }}>
                                    from {reviewCount} review{reviewCount === 1 ? '' : 's'}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {reviewHighlights.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: reviewGridColumns, gap: 18 }}>
                            {reviewHighlights.map((review, index) => {
                              const reviewerName = String(review?.reviewer_name || '').trim() || 'Customer';
                              const rating = Number(review?.rating);
                              const comment = String(review?.comment || '').trim();
                              return (
                                <article
                                  key={`customer-review-${index}`}
                                  style={{
                                    background: '#fcfdff',
                                    border: '1px solid #dbe5ee',
                                    borderRadius: 18,
                                    padding: 18,
                                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
                                    display: 'grid',
                                    gap: 12,
                                    alignContent: 'start'
                                  }}
                                >
                                  <div style={{ display: 'grid', gap: 6 }}>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{reviewerName}</div>
                                    {Number.isFinite(rating) && rating > 0 && (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: STYLES.colors.amber, fontSize: 14, lineHeight: 1 }}>
                                        {Array.from({ length: 5 }, (_, starIndex) => (
                                          <span key={`review-card-star-${index}-${starIndex}`} style={{ opacity: starIndex < Math.round(rating) ? 1 : 0.25 }}>
                                            *
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#334155' }}>{comment}</p>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            style={{
                              background: '#fcfdff',
                              border: '1px solid #dbe5ee',
                              borderRadius: 18,
                              padding: isMobileViewport ? 20 : 24,
                              boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
                              fontSize: 14,
                              color: STYLES.colors.muted
                            }}
                          >
                            {hasReviewSummary
                              ? 'Customer review highlights will appear here once detailed review entries are added in SKUpervisor.'
                              : 'Customer reviews will appear here once this storefront adds review data in SKUpervisor.'}
                          </div>
                        )}
                      </div>
                    </section>

                    {isReviewModalOpen && (
                      <div
                        style={{
                          position: 'fixed',
                          inset: 0,
                          zIndex: 2300,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: isMobileViewport ? 16 : 24
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(15,23,42,0.52)',
                            backdropFilter: 'blur(5px)'
                          }}
                        />
                        <section
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            maxWidth: 640,
                            maxHeight: 'min(90vh, 760px)',
                            overflowY: 'auto',
                            borderRadius: 28,
                            border: '1px solid #dbe5ee',
                            background: '#ffffff',
                            boxShadow: '0 28px 64px rgba(15,23,42,0.22)',
                            padding: isMobileViewport ? 20 : 28,
                            display: 'grid',
                            gap: 20
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Customer Review
                              </div>
                              <div style={{ fontSize: isMobileViewport ? 26 : 30, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08, fontFamily: servicesDisplayFont }}>
                                Share your experience
                              </div>
                              <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
                                Rate the storefront experience and leave a short message. Publishing will be connected once the review backend is ready.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsReviewModalOpen(false)}
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 999,
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                color: '#0f172a',
                                cursor: 'pointer',
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0
                              }}
                              aria-label="Close review modal"
                            >
                              <X size={18} />
                            </button>
                          </div>

                          <div style={{ display: 'grid', gap: 16 }}>
                            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
                              Your name
                              <input
                                value={reviewDraft.name}
                                onChange={(event) => setReviewDraft((previous) => ({ ...previous, name: event.target.value }))}
                                placeholder="How should we identify your review?"
                                style={BOOKING_FIELD_STYLE}
                              />
                            </label>

                            <div style={{ display: 'grid', gap: 10 }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', cursor: 'pointer', width: 'fit-content' }}>
                                <input
                                  type="checkbox"
                                  checked={reviewDraft.anonymous}
                                  onChange={(event) => setReviewDraft((previous) => ({ ...previous, anonymous: event.target.checked }))}
                                />
                                Post this review anonymously
                              </label>
                              <div style={{ fontSize: 12, color: '#64748b' }}>
                                Public name preview: <strong style={{ color: '#0f172a' }}>{reviewDraft.anonymous ? maskReviewerName(reviewDraft.name) : (String(reviewDraft.name || '').trim() || 'Your name')}</strong>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gap: 10 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Your rating</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                {Array.from({ length: 5 }, (_, index) => {
                                  const starValue = index + 1;
                                  const selected = reviewDraft.rating >= starValue;
                                  return (
                                    <button
                                      key={`review-rating-${starValue}`}
                                      type="button"
                                      onClick={() => setReviewDraft((previous) => ({ ...previous, rating: starValue }))}
                                      style={{
                                        width: 46,
                                        height: 46,
                                        borderRadius: 14,
                                        border: `1px solid ${selected ? '#f59e0b' : '#dbe5ee'}`,
                                        background: selected ? '#fff7ed' : '#ffffff',
                                        color: selected ? '#f59e0b' : '#94a3b8',
                                        cursor: 'pointer',
                                        display: 'grid',
                                        placeItems: 'center',
                                        boxShadow: selected ? '0 10px 20px rgba(245,158,11,0.16)' : 'none'
                                      }}
                                      aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}
                                    >
                                      <Star size={18} fill={selected ? '#f59e0b' : 'none'} color={selected ? '#f59e0b' : '#94a3b8'} />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
                              Your review
                              <textarea
                                value={reviewDraft.message}
                                onChange={(event) => setReviewDraft((previous) => ({ ...previous, message: event.target.value }))}
                                placeholder="Tell customers what stood out about the service, response time, or booking experience."
                                style={{ ...BOOKING_FIELD_STYLE, minHeight: 144, resize: 'vertical' }}
                              />
                            </label>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12 }}>
                            <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
                              Reviews are prepared on the storefront now. Submission and moderation will connect once backend review support is available.
                            </div>
                            <PrimaryButton
                              onClick={handleReviewDraftSubmit}
                              style={{ minHeight: 46, minWidth: isMobileViewport ? '100%' : 180, justifyContent: 'center' }}
                            >
                              Send Review
                            </PrimaryButton>
                          </div>
                        </section>
                      </div>
                    )}

                    <footer
                      style={{
                        marginLeft: 'calc(50% - 50vw)',
                        width: '100vw',
                        background: '#090b0f',
                        borderTop: '1px solid rgba(148, 163, 184, 0.18)'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 1320,
                          width: '100%',
                          margin: '0 auto',
                          padding: isMobileViewport ? '28px 16px 32px' : '48px 24px 36px',
                          display: 'grid',
                          gap: 28
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                            gap: isMobileViewport ? 24 : 36
                          }}
                        >
                          <div style={{ display: 'grid', gap: 18 }}>
                            <div style={{ display: 'grid', gap: 10 }}>
                              <div style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em' }}>{serviceHeroModel.name}</div>
                              <div style={{ maxWidth: 360, fontSize: 15, lineHeight: 1.7, color: '#94a3b8' }}>
                                {serviceHeroModel.tagline || serviceHeroModel.aboutText || 'Service storefront powered by SKUpervisor content.'}
                              </div>
                            </div>

                            {serviceHeroModel.footerLinks.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                {serviceHeroModel.footerLinks
                                  .filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label))
                                  .map((link) => (
                                    <a
                                      key={`footer-social-${link.label}`}
                                      href={link.href}
                                      target={String(link.href).startsWith('http') ? '_blank' : undefined}
                                      rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                                    style={{
                                        width: 42,
                                        height: 42,
                                        borderRadius: 12,
                                        border: '1px solid rgba(148, 163, 184, 0.18)',
                                        background: 'rgba(15, 23, 42, 0.55)',
                                        color: '#e2e8f0',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        display: 'grid',
                                        placeItems: 'center',
                                        textDecoration: 'none'
                                      }}
                                      title={link.label}
                                    >
                                      <FooterSocialIcon label={link.label} />
                                    </a>
                                  ))}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Services
                            </div>
                            <div style={{ display: 'grid', gap: 12 }}>
                              {(serviceHeroModel.serviceGroups || []).slice(0, 5).map((group) => (
                                <div key={`footer-group-${group.categoryKey}`} style={{ fontSize: 15, color: '#cbd5e1' }}>
                                  {group.categoryMeta?.label || group.categoryKey}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Socials
                            </div>
                            <div style={{ display: 'grid', gap: 12 }}>
                              {serviceHeroModel.footerLinks
                                .filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label))
                                .map((link) => (
                                  <a
                                    key={`footer-social-link-${link.label}`}
                                    href={link.href}
                                    target={String(link.href).startsWith('http') ? '_blank' : undefined}
                                    rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                                    style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}
                                  >
                                    {link.label}
                                  </a>
                                ))}
                              {serviceHeroModel.footerLinks.filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label)).length === 0 && (
                                <div style={{ fontSize: 15, color: '#64748b' }}>No social links yet.</div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Contact
                            </div>
                            <div style={{ display: 'grid', gap: 12 }}>
                              {serviceHeroModel.footerLinks
                                .filter((link) => ['Call', 'Email'].includes(link.label))
                                .map((link) => (
                                  <a key={`footer-contact-${link.label}`} href={link.href} style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}>
                                    {link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', '')}
                                  </a>
                                ))}
                              {serviceHeroModel.hours && <div style={{ fontSize: 15, color: '#cbd5e1' }}>{serviceHeroModel.hours}</div>}
                              <div style={{ fontSize: 15, color: '#cbd5e1' }}>{serviceHeroModel.locationLabel}</div>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            paddingTop: 18,
                            borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                            display: 'flex',
                            alignItems: isMobileViewport ? 'flex-start' : 'center',
                            justifyContent: 'space-between',
                            flexDirection: isMobileViewport ? 'column' : 'row',
                            gap: 10
                          }}
                        >
                          <div style={{ fontSize: 13, color: '#64748b' }}>
                            {serviceHeroModel.name}{serviceHeroModel.registrationYear ? ` ${serviceHeroModel.registrationYear}` : ''}
                          </div>
                          <div style={{ fontSize: 13, color: '#64748b' }}>Powered by SKUpervisor</div>
                        </div>
                      </div>
                    </footer>
                  </>
                );
              }

return (
  <>
    <style>{`
      @keyframes promoCardFloatIn {
        0% {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `}</style>
  <div style={{
    display: 'grid',
    gap: 24,
    gridTemplateColumns: (isServicesMode && !isMobileViewport) ? '1fr 340px' : '1fr'
  }}>
    <div style={{ display: 'grid', gap: 24 }}>
      <section id="storefront-catalog-section" style={{
        display: 'grid',
        gap: isFnbMode ? (isMobileViewport ? 18 : 24) : undefined,
        marginTop: isFnbMode ? (isMobileViewport ? 20 : 34) : undefined,
        background: '#fff',
        border: isFnbMode ? 'none' : `1px solid ${STYLES.colors.border}`,
        borderRadius: isFnbMode ? 0 : STYLES.radius.card,
        padding: isFnbMode ? (isMobileViewport ? '24px 0 56px' : '34px 0 64px') : (isMobileViewport ? 16 : 32),
        boxShadow: isFnbMode ? 'none' : STYLES.shadow.sm,
        marginLeft: isFnbMode ? 'calc(50% - 50vw)' : undefined,
        width: isFnbMode ? '100vw' : undefined
      }}>
        {isFnbMode && (
          <>
            <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%', padding: isMobileViewport ? '0 16px' : '0 24px', display: 'grid', gap: isMobileViewport ? 18 : 22 }}>
              <div style={{
                display: 'flex',
                alignItems: isMobileViewport ? 'flex-start' : 'flex-end',
                justifyContent: 'space-between',
                gap: 14,
                flexDirection: isMobileViewport ? 'column' : 'row'
              }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: modeAdapter.heroTheme?.accentDark || '#6f3415', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <span style={{ width: 30, height: 1, background: modeAdapter.heroTheme?.accent || '#c96a2b' }} />
                    Curated Menu
                  </div>
                  <h2 style={{ margin: 0, fontSize: isMobileViewport ? 26 : 36, fontWeight: 900, color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark, letterSpacing: '-0.03em', fontFamily: modeAdapter.heroTheme?.displayFont }}>{modeAdapter.catalogHeading}</h2>
                  <p style={{ margin: 0, color: modeAdapter.heroTheme?.textMuted || STYLES.colors.muted, fontSize: 15, maxWidth: 720 }}>{modeAdapter.catalogSubtitle}</p>
                </div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 999,
                  background: modeAdapter.heroTheme?.surfaceInset || '#fff3e8',
                  border: `1px solid ${modeAdapter.heroTheme?.borderSoft || '#edd4bc'}`,
                  color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark,
                  fontSize: 13,
                  fontWeight: 800
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: modeAdapter.heroTheme?.accent || '#c96a2b' }} />
                  {filteredFnbViewModel.totalItems || 0} menu item{Number(filteredFnbViewModel.totalItems || 0) === 1 ? '' : 's'} available
                </div>
              </div>

              {(() => {
                const fnbTheme = modeAdapter.heroTheme || {};
                const toolbarAccent = fnbTheme.accent || '#c96a2b';
                const toolbarAccentDark = fnbTheme.accentDark || '#6f3415';
                const toolbarAccentSoft = fnbTheme.accentSoft || '#fff0e2';
                const toolbarSurface = '#ffffff';
                const toolbarSurfaceInset = fnbTheme.surfaceInset || '#fff3e8';
                const toolbarBorder = fnbTheme.borderSoft || '#edd4bc';
                const toolbarTextPrimary = fnbTheme.textPrimary || '#2f1f16';
                const toolbarTextMuted = fnbTheme.textMuted || '#7c6757';
                const categoryOptions = [
                  {
                    key: '',
                    label: 'All',
                    count: filteredFnbViewModel.menuItems.length,
                    iconToken: 'menu',
                    glyph: 'A',
                    accent: toolbarAccent,
                    accentSoft: toolbarAccentSoft
                  },
                  ...fnbSections.map((section) => ({
                    key: section.sectionKey,
                    label: section.sectionLabel,
                    count: section.items.length,
                    iconToken: section.visualMeta?.iconToken || 'menu',
                    glyph: section.visualMeta?.glyph || String(section.sectionLabel || '').charAt(0).toUpperCase(),
                    accent: section.visualMeta?.accent || '#475569',
                    accentSoft: section.visualMeta?.accentSoft || '#f1f5f9'
                  }))
                ];
                const activeCategoryOption = categoryOptions.find((option) => option.key === (resolvedFnbSection || '')) || categoryOptions[0];
                const ActiveCategoryIcon = FNB_CATEGORY_ICON_MAP[activeCategoryOption.iconToken] || Sparkles;
                const controlHeight = isMobileViewport ? 54 : 56;
                const controlRadius = 999;

                return (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: isMobileViewport ? 'column' : 'row',
                      alignItems: isMobileViewport ? 'stretch' : 'center',
                      gap: 12,
                      flexWrap: 'wrap'
                    }}>
                      <label style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        border: `1px solid ${toolbarBorder}`,
                        borderRadius: controlRadius,
                        background: '#fff',
                        padding: '0 18px 0 42px',
                        minHeight: controlHeight,
                        flex: '1 1 320px',
                        minWidth: 0,
                        boxShadow: '0 14px 28px rgba(73,38,20,0.06)'
                      }}>
                        <span style={{
                          width: 2,
                          position: 'absolute',
                          left: 28,
                          top: 12,
                          bottom: 12,
                          borderRadius: 999,
                          background: toolbarAccent,
                          opacity: 0.65,
                          pointerEvents: 'none'
                        }} />
                        <input
                          value={catalogSearch}
                          onChange={(event) => setCatalogSearch(event.target.value)}
                          placeholder="Search items in this store catalog..."
                          style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: toolbarTextPrimary }}
                        />
                        <span style={{
                          width: 42,
                          height: 42,
                          borderRadius: 999,
                          background: toolbarAccent,
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 10px 20px rgba(201,106,43,0.24)',
                          flexShrink: 0
                        }}>
                          <Search size={20} />
                        </span>
                      </label>

                      <StorefrontDropdown
                        value={fnbSortOption}
                        onChange={(nextValue) => setFnbSortOption(String(nextValue))}
                        options={[
                          { value: 'name_asc', label: 'All Prices' },
                          { value: 'price_asc', label: 'Price: Low to High' },
                          { value: 'price_desc', label: 'Price: High to Low' }
                        ]}
                        leading={(
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: toolbarAccent }}>
                            <SlidersHorizontal size={18} />
                            <span style={{ width: 1, height: '60%', minHeight: 24, borderRadius: 999, background: 'rgba(201,106,43,0.18)' }} />
                          </span>
                        )}
                        containerStyle={{
                          minWidth: isMobileViewport ? '100%' : 240,
                          flex: isMobileViewport ? '1 1 100%' : '0 0 240px'
                        }}
                        triggerStyle={{
                          minHeight: controlHeight,
                          borderRadius: controlRadius,
                          border: `1px solid ${toolbarBorder}`,
                          background: '#fff',
                          boxShadow: '0 14px 28px rgba(73,38,20,0.06)',
                          padding: '0 44px 0 16px'
                        }}
                        selectedLabelStyle={{ color: toolbarTextPrimary, fontSize: 14, fontWeight: 700 }}
                      />

                      <div
                        ref={fnbCategoryDropdownRef}
                        style={{ position: 'relative', width: isMobileViewport ? '100%' : 290, flex: isMobileViewport ? '1 1 100%' : '0 0 290px' }}
                      >
                        <button
                          type="button"
                          onClick={() => setIsFnbCategoryDropdownOpen((previous) => !previous)}
                          style={{
                            position: 'relative',
                            width: '100%',
                            minHeight: controlHeight,
                            borderRadius: controlRadius,
                            border: `1px solid ${toolbarBorder}`,
                            background: '#fff',
                            padding: '0 18px 0 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            cursor: 'pointer',
                            boxShadow: '0 14px 28px rgba(73,38,20,0.06)'
                          }}
                        >
                          <span style={{
                            width: 38,
                            height: 38,
                            borderRadius: 14,
                            background: activeCategoryOption.accentSoft,
                            color: activeCategoryOption.accent,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            flexShrink: 0
                          }}>
                            {React.createElement(ActiveCategoryIcon, { size: 18 })}
                            <span style={{
                              position: 'absolute',
                              right: -4,
                              bottom: -4,
                              width: 18,
                              height: 18,
                              borderRadius: 999,
                              background: '#fff',
                              border: `1px solid ${toolbarBorder}`,
                              color: toolbarTextPrimary,
                              fontSize: 10,
                              fontWeight: 900,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {String(activeCategoryOption.glyph || 'A').slice(0, 1)}
                            </span>
                          </span>
                        <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: toolbarAccentDark, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Category</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: toolbarTextPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>
                              {activeCategoryOption.label}
                            </span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: toolbarTextMuted }}>{activeCategoryOption.count}</span>
                          <ChevronDown size={18} color={toolbarTextMuted} />
                        </button>

                        {isFnbCategoryDropdownOpen && (
                          <div style={{
                            position: 'absolute',
                            top: 'calc(100% + 10px)',
                            left: 0,
                            right: 0,
                            zIndex: 40,
                            padding: 10,
                            borderRadius: 18,
                            border: `1px solid ${toolbarBorder}`,
                            background: toolbarSurface,
                            boxShadow: '0 22px 48px rgba(15,23,42,0.14)',
                            display: 'grid',
                            gap: 8,
                            maxHeight: 360,
                            overflowY: 'auto'
                          }}>
                            {categoryOptions.map((option) => {
                              const isActive = option.key === (resolvedFnbSection || '');
                              const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
                              return (
                                <button
                                  key={`fnb-category-dropdown-${option.key || 'all'}`}
                                  type="button"
                                  onClick={() => {
                                    setActiveServiceTab(option.key);
                                    setIsFnbCategoryDropdownOpen(false);
                                  }}
                                  style={{
                                    width: '100%',
                                    borderRadius: 16,
                                    border: isActive ? '1px solid transparent' : `1px solid ${toolbarBorder}`,
                                    background: isActive ? toolbarAccent : toolbarSurface,
                                    color: isActive ? '#fff' : toolbarTextPrimary,
                                    padding: '10px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 14,
                                    background: isActive ? 'rgba(255,255,255,0.16)' : option.accentSoft,
                                    color: isActive ? '#fff' : option.accent,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    flexShrink: 0
                                  }}>
                                    {React.createElement(OptionIcon, { size: 18 })}
                                    <span style={{
                                      position: 'absolute',
                                      right: -4,
                                      bottom: -4,
                                      width: 18,
                                      height: 18,
                                      borderRadius: 999,
                                      background: '#fff',
                                      border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : toolbarBorder}`,
                                      color: toolbarTextPrimary,
                                      fontSize: 10,
                                      fontWeight: 900,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      {String(option.glyph || 'A').slice(0, 1)}
                                    </span>
                                  </span>
                                  <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                                    <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>{option.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, opacity: isActive ? 0.82 : 0.6 }}>
                                      {option.count} item{option.count === 1 ? '' : 's'}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* Section header */}
        {(!isFnbMode || isMultiGroup) && (
          <div style={{ marginBottom: isMultiGroup ? 20 : 32 }}>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>{modeAdapter.catalogHeading}</h2>
            <p style={{ margin: '4px 0 0 0', color: STYLES.colors.muted, fontSize: 15 }}>{modeAdapter.catalogSubtitle}</p>
          </div>
        )}

        {/* Service Family Tabs (only shown when multiple groups exist) */}
        {isMultiGroup && (
          <div style={{ marginBottom: 28 }}>
            {/* Tab scrollable strip */}
            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none'
            }}>
              {servicesViewModel.serviceGroups.map(group => {
                const isActive = resolvedTab === group.categoryKey;
                const meta = group.categoryMeta;
                const GroupIcon = SERVICE_CATEGORY_ICON_MAP[meta?.iconToken] || Sparkles;
                return (
                  <button
                    key={group.categoryKey}
                    type="button"
                    onClick={() => setActiveServiceTab(group.categoryKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      flexShrink: 0,
                      padding: isMobileViewport ? '10px 16px' : '12px 20px',
                      borderRadius: 14,
                      border: isActive ? `2px solid ${meta.accent}` : `1.5px solid ${STYLES.colors.border}`,
                      background: isActive ? meta.accentBg || '#f0fdfa' : '#fff',
                      color: isActive ? meta.accent : STYLES.colors.text,
                      fontWeight: isActive ? 800 : 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      boxShadow: isActive ? `0 4px 16px ${meta.accent}22` : 'none'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      <GroupIcon size={18} />
                    </span>
                    <span>{meta.label}</span>
                    <span style={{
                      marginLeft: 4, padding: '2px 8px', borderRadius: 99,
                      fontSize: 11, fontWeight: 800,
                      background: isActive ? meta.accent : STYLES.colors.bg,
                      color: isActive ? '#fff' : STYLES.colors.muted
                    }}>
                      {group.items.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active tab description bar */}
            {activeGroupMeta && (
              <div style={{
                marginTop: 14, padding: '14px 18px',
                borderRadius: 14, border: `1px solid ${activeGroupMeta.accent}33`,
                background: activeGroupMeta.accentBg || '#f0fdfa',
                display: 'flex', alignItems: 'center', gap: 14
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: activeGroupMeta.accent }}>
                  <ActiveServiceGroupIcon size={26} />
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: activeGroupMeta.accent }}>{activeGroupMeta.label}</div>
                  <div style={{ fontSize: 13, color: STYLES.colors.text, marginTop: 2 }}>{activeGroupMeta.description}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: STYLES.colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Area</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: activeGroupMeta.accent }}>{activeGroupMeta.areaLabel}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Catalog items grid */}
        {(catalogState === 'empty_setup' || catalogState === 'empty_search_on_zero') && (
          <div style={{ display: 'grid', gap: 14 }}>
            <input
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Search items in this store catalog..."
              style={{ width: '100%', maxWidth: 520, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
            />
            <StoreCatalogEmptyState
              mode={catalogState === 'empty_search_on_zero' ? 'search_on_empty' : 'setup_pending'}
              searchQuery={catalogSearch}
            />
          </div>
        )}
        {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
          <div style={isFnbMode ? {
            maxWidth: 1320,
            margin: `${isMobileViewport ? 18 : 24}px auto 0`,
            width: '100%',
            padding: isMobileViewport ? '0 16px' : '0 24px'
          } : undefined}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
              {catalogItemsToRender.map((item) => {
                const imageUrl = withAssetOrigin(item.image_url);
                const available = isItemAvailable(item);
                const ServiceCategoryIcon = SERVICE_CATEGORY_ICON_MAP[item.categoryMeta?.iconToken] || Sparkles;
                return (
                  isFnbMode ? (
                    <FnbProductCard
                      key={item.item_id}
                      item={item}
                      imageUrl={imageUrl}
                      available={available}
                      modeAdapter={modeAdapter}
                      addToCart={addToCart}
                      isMobileViewport={isMobileViewport}
                    />
                  ) : isSimpleMode ? (
                    <SimpleProductCard
                      key={item.item_id}
                      item={item}
                      imageUrl={imageUrl}
                      available={available}
                      modeAdapter={modeAdapter}
                      addToCart={addToCart}
                    />
                  ) : (
                    <div key={item.item_id} style={{
                      background: '#fff', borderRadius: 20, border: `1px solid ${STYLES.colors.border}`,
                      overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 0.2s ease',
                      boxShadow: STYLES.shadow.sm, cursor: 'pointer'
                    }} onClick={() => openServiceDetail(item)}>
                      <div style={{ width: '100%', height: 184, minHeight: 184, maxHeight: 184, background: STYLES.colors.bg, position: 'relative', overflow: 'hidden' }}>
                        {imageUrl ? (
                          <img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: STYLES.colors.muted }}>No image</div>
                        )}
                        <div style={{ position: 'absolute', top: 12, right: 12 }}>
                          <Badge background="rgba(255,255,255,0.9)" color={STYLES.colors.dark} border={STYLES.colors.border}>{item.service_detail?.service_area === 'onsite' ? 'Home Visit' : 'In-Store'}</Badge>
                        </div>
                      </div>
                      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', marginBottom: 4 }}>
                            <ServiceCategoryIcon size={13} />
                            <span>{item.categoryMeta?.label || 'General'}</span>
                          </div>
                          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.3, color: STYLES.colors.dark }}>{item.variantName || item.name}</h4>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: STYLES.colors.text, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.description || 'Expert service selection.'}
                        </p>
                        <div style={{ marginTop: 'auto' }}>
                          <div style={{ fontSize: 20, fontWeight: 900, color: servicesPrimaryDark, marginBottom: 12 }}>{money(item.default_sale_price ?? 0)}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <GhostButton style={{ padding: '8px', minHeight: 40, fontSize: 13 }} onClick={(e) => { e.stopPropagation(); openServiceDetail(item); }}>Details</GhostButton>
                            <PrimaryButton style={{ padding: '8px', minHeight: 40, fontSize: 13 }} onClick={(e) => { e.stopPropagation(); addToCart(item); }} disabled={!available}>Add</PrimaryButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                );
              })}
              {catalogItemsToRender.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: STYLES.colors.muted }}>
                  {isFnbMode
                    ? 'No menu items match the current search or section yet.'
                    : (isSimpleMode ? 'No simple-mode products match the current search yet.' : 'No products available in this category yet.')}
                </div>
              )}
            </div>

            {isFnbMode && itemsToRender.length > 0 && totalFnbPages > 1 && (
              <div style={{
                marginTop: isMobileViewport ? 24 : 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: isMobileViewport ? 'center' : 'space-between',
                gap: 14,
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: STYLES.colors.muted }}>
                    Showing {fnbPageStart}-{fnbPageEnd} of {itemsToRender.length} menu items
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
                    Per page
                    <StorefrontDropdown
                      value={fnbPageSize}
                      onChange={(nextValue) => setFnbPageSize(Number(nextValue) || 8)}
                      options={[4, 8, 12, 16].map((size) => ({ value: size, label: String(size) }))}
                      containerStyle={{ minWidth: 88 }}
                      triggerStyle={{ minHeight: 38, borderRadius: 12, minWidth: 88, padding: '8px 42px 8px 12px' }}
                      menuStyle={{ borderRadius: 14 }}
                      selectedLabelStyle={{ fontSize: 13 }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <GhostButton
                    style={{ minHeight: 38, padding: '0 14px', opacity: resolvedFnbPage === 1 ? 0.5 : 1 }}
                    onClick={() => setFnbPage((previous) => Math.max(1, previous - 1))}
                    disabled={resolvedFnbPage === 1}
                  >
                    Previous
                  </GhostButton>
                  {Array.from({ length: totalFnbPages }, (_, index) => index + 1)
                    .slice(Math.max(0, resolvedFnbPage - 3), Math.max(0, resolvedFnbPage - 3) + 5)
                    .map((pageNumber) => (
                      <button
                        key={`fnb-page-${pageNumber}`}
                        type="button"
                        onClick={() => setFnbPage(pageNumber)}
                        style={{
                          minWidth: 38,
                          minHeight: 38,
                          borderRadius: 12,
                          border: `1px solid ${pageNumber === resolvedFnbPage ? '#f59e0b' : '#e5e7eb'}`,
                          background: pageNumber === resolvedFnbPage ? '#f59e0b' : '#fff',
                          color: pageNumber === resolvedFnbPage ? '#fff' : STYLES.colors.dark,
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: pageNumber === resolvedFnbPage ? '0 8px 18px rgba(245,158,11,0.22)' : 'none'
                        }}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  <GhostButton
                    style={{ minHeight: 38, padding: '0 14px', opacity: resolvedFnbPage === totalFnbPages ? 0.5 : 1 }}
                    onClick={() => setFnbPage((previous) => Math.min(totalFnbPages, previous + 1))}
                    disabled={resolvedFnbPage === totalFnbPages}
                  >
                    Next
                  </GhostButton>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {isSimpleMode && !isOrderSubpage && simpleStorefrontModel && (
        <>
          {Array.isArray(promoSectionModel) && promoSectionModel.length > 0 && (
            <section
              style={{
                marginLeft: 'calc(50% - 50vw)',
                width: '100vw',
                marginTop: isMobileViewport ? 20 : 28,
                padding: isMobileViewport ? '24px 0 20px' : '32px 0 26px',
                background: 'linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)',
                borderTop: '1px solid #fed7aa',
                borderBottom: '1px solid #ffedd5',
                display: 'grid',
                gap: 14
              }}
            >
              <div
                style={{
                  maxWidth: 1220,
                  width: '100%',
                  margin: '0 auto',
                  paddingLeft: isMobileViewport ? 16 : 24,
                  paddingRight: isMobileViewport ? 16 : 24,
                  display: 'grid',
                  gap: 14
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <h2 style={{ margin: 0, fontSize: isMobileViewport ? 22 : 26, fontWeight: 900, color: STYLES.colors.dark }}>
                    Current Promos
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: STYLES.colors.muted }}>
                    Limited-time offers available from this storefront.
                  </p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                    gap: 18
                  }}
                >
                  {promoSectionModel.map((promoEntry, index) => (
                    <article
                      key={`simple-promo-card-${index}`}
                      style={{
                        position: 'relative',
                        borderRadius: 26,
                        border: '1px solid #fed7aa',
                        background: 'linear-gradient(135deg, #ffffff 0%, #fffaf5 58%, #fff7ed 100%)',
                        boxShadow: '0 14px 28px rgba(249, 115, 22, 0.10)',
                        padding: isMobileViewport ? '18px 16px' : '18px 20px',
                        display: 'grid',
                        gap: 14,
                        overflow: 'hidden',
                        transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
                        animation: 'promoCardFloatIn 420ms ease both',
                        animationDelay: `${index * 90}ms`
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: '0 auto 0 0',
                          width: 4,
                          background: 'linear-gradient(180deg, #fb923c 0%, #f97316 100%)',
                          boxShadow: '0 0 22px rgba(249, 115, 22, 0.25)'
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            border: '1px solid #fdba74',
                            background: '#fff7ed',
                            color: '#f97316',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0
                          }}
                        >
                          <Sparkles size={17} />
                        </div>
                        <div style={{ fontSize: isMobileViewport ? 14 : 16, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', lineHeight: 1.2 }}>
                          {promoEntry.title || promoEntry.badge || 'Promo'}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(96px, 124px) minmax(0, 1fr)',
                          gap: isMobileViewport ? 12 : 14,
                          alignItems: 'stretch'
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            alignContent: 'center',
                            justifyItems: 'start',
                            paddingRight: isMobileViewport ? 0 : 14,
                            borderRight: isMobileViewport ? 'none' : '1px solid #d4d4d8'
                          }}
                        >
                          <div style={{ fontSize: isMobileViewport ? 38 : 48, fontWeight: 900, lineHeight: 0.92, color: '#f97316', letterSpacing: '-0.04em' }}>
                            {promoEntry.headline || promoEntry.badge || 'Promo'}
                          </div>
                        </div>

                        <div style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0 }}>
                          <div style={{ fontSize: isMobileViewport ? 18 : 20, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.15 }}>
                            {promoEntry.subtitle || 'Storefront offer'}
                          </div>
                          {promoEntry.supportingText && (
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                              {promoEntry.supportingText}
                            </div>
                          )}
                          {promoEntry.validityText && (
                            <div style={{ fontSize: 13, color: '#6b7280' }}>
                              {promoEntry.validityText}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section
            style={{
              marginTop: 0,
              marginLeft: 'calc(50% - 50vw)',
              width: '100vw',
              padding: isMobileViewport ? '36px 0 30px' : '72px 0 42px',
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              borderTop: '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gap: 18
            }}
          >
            <div
              style={{
                maxWidth: 1320,
                width: '100%',
                margin: '0 auto',
                paddingLeft: isMobileViewport ? 16 : 24,
                paddingRight: isMobileViewport ? 16 : 24,
                display: 'grid',
                gap: 18
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: isMobileViewport ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  flexDirection: isMobileViewport ? 'column' : 'row',
                  gap: 16
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>
                    Customer Reviews
                  </h2>
                  <p style={{ margin: '6px 0 0 0', fontSize: 14, color: STYLES.colors.muted }}>
                    See what customers say about this storefront
                  </p>
                </div>
                <PrimaryButton
                  onClick={() => setIsReviewModalOpen(true)}
                  style={{
                    minHeight: 46,
                    minWidth: isMobileViewport ? '100%' : 168,
                    justifyContent: 'center'
                  }}
                >
                  Write a Review
                </PrimaryButton>
              </div>

              {simpleStorefrontModel.reviewHighlights.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1024 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
                  {simpleStorefrontModel.reviewHighlights.map((review, index) => {
                    const reviewerName = String(review?.reviewer_name || '').trim() || 'Customer';
                    const rating = Number(review?.rating);
                    const comment = String(review?.comment || '').trim();
                    return (
                      <article
                        key={`simple-customer-review-${index}`}
                        style={{
                          background: '#fcfdff',
                          border: '1px solid #dbe5ee',
                          borderRadius: 18,
                          padding: 18,
                          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
                          display: 'grid',
                          gap: 12,
                          alignContent: 'start'
                        }}
                      >
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{reviewerName}</div>
                          {Number.isFinite(rating) && rating > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: STYLES.colors.amber, fontSize: 14, lineHeight: 1 }}>
                              {Array.from({ length: 5 }, (_, starIndex) => (
                                <span key={`simple-review-card-star-${index}-${starIndex}`} style={{ opacity: starIndex < Math.round(rating) ? 1 : 0.25 }}>
                                  *
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#334155' }}>{comment || 'Review comment will appear here once available in SKUpervisor.'}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    background: '#fcfdff',
                    border: '1px solid #dbe5ee',
                    borderRadius: 18,
                    padding: isMobileViewport ? 20 : 24,
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
                    fontSize: 14,
                    color: STYLES.colors.muted
                  }}
                >
                  Customer reviews will appear here once this storefront adds review data in SKUpervisor.
                </div>
              )}
            </div>
          </section>

          <footer
            style={{
              marginLeft: 'calc(50% - 50vw)',
              width: '100vw',
              background: '#090b0f',
              borderTop: '1px solid rgba(148, 163, 184, 0.18)'
            }}
          >
            <div
              style={{
                maxWidth: 1320,
                width: '100%',
                margin: '0 auto',
                padding: isMobileViewport ? '28px 16px 32px' : '48px 24px 36px',
                display: 'grid',
                gap: 28
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                  gap: isMobileViewport ? 24 : 36
                }}
              >
                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em' }}>{simpleStorefrontModel.name}</div>
                    <div style={{ maxWidth: 360, fontSize: 15, lineHeight: 1.7, color: '#94a3b8' }}>
                      {simpleStorefrontModel.tagline || simpleStorefrontModel.aboutText || 'Simple storefront powered by SKUpervisor content.'}
                    </div>
                  </div>

                  {getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).map((link) => (
                        <a
                          key={`simple-footer-social-${link.label}`}
                          href={link.href}
                          target={String(link.href).startsWith('http') ? '_blank' : undefined}
                          rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 12,
                            border: '1px solid rgba(148, 163, 184, 0.18)',
                            background: 'rgba(15, 23, 42, 0.55)',
                            color: '#e2e8f0',
                            fontSize: 12,
                            fontWeight: 800,
                            display: 'grid',
                            placeItems: 'center',
                            textDecoration: 'none'
                          }}
                          title={link.label}
                        >
                          <FooterSocialIcon label={link.label} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Products
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {simpleStorefrontModel.productGroups.map((group) => (
                      <div key={`simple-footer-group-${group}`} style={{ fontSize: 15, color: '#cbd5e1' }}>
                        {group}
                      </div>
                    ))}
                    {simpleStorefrontModel.productGroups.length === 0 && (
                      <div style={{ fontSize: 15, color: '#64748b' }}>No product categories yet.</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Socials
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).map((link) => (
                      <a
                        key={`simple-footer-social-link-${link.label}`}
                        href={link.href}
                        target={String(link.href).startsWith('http') ? '_blank' : undefined}
                        rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                        style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}
                      >
                        {link.label}
                      </a>
                    ))}
                    {getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).length === 0 && (
                      <div style={{ fontSize: 15, color: '#64748b' }}>No social links yet.</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Contact
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {getStorefrontContactFooterLinks(simpleStorefrontModel.footerLinks).map((link) => (
                      <a key={`simple-footer-contact-${link.label}`} href={link.href} style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}>
                        {link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', '')}
                      </a>
                    ))}
                    {simpleStorefrontModel.hours && <div style={{ fontSize: 15, color: '#cbd5e1' }}>{simpleStorefrontModel.hours}</div>}
                    <div style={{ fontSize: 15, color: '#cbd5e1' }}>{simpleStorefrontModel.locationLabel}</div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  paddingTop: 18,
                  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                  display: 'flex',
                  alignItems: isMobileViewport ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  flexDirection: isMobileViewport ? 'column' : 'row',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {simpleStorefrontModel.name}{simpleStorefrontModel.registrationYear ? ` ${simpleStorefrontModel.registrationYear}` : ''}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Powered by SKUpervisor</div>
              </div>
            </div>
          </footer>
        </>
      )}

      {isFnbMode && !isOrderSubpage && fnbCommunityModel && (
        <>
          {Array.isArray(promoSectionModel) && promoSectionModel.length > 0 && (
            <section
              style={{
                marginLeft: 'calc(50% - 50vw)',
                width: '100vw',
                marginTop: isMobileViewport ? 12 : 18,
                padding: isMobileViewport ? '24px 0 20px' : '32px 0 26px',
                background: 'linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)',
                borderTop: '1px solid #fed7aa',
                borderBottom: '1px solid #ffedd5',
                display: 'grid',
                gap: 14
              }}
            >
              <div
                style={{
                  maxWidth: 1220,
                  width: '100%',
                  margin: '0 auto',
                  paddingLeft: isMobileViewport ? 16 : 24,
                  paddingRight: isMobileViewport ? 16 : 24,
                  display: 'grid',
                  gap: 14
                }}
              >
                <div style={{ display: 'grid', gap: 4 }}>
                  <h2 style={{ margin: 0, fontSize: isMobileViewport ? 22 : 26, fontWeight: 900, color: STYLES.colors.dark }}>
                    Current Promos
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: STYLES.colors.muted }}>
                    Limited-time offers available from this storefront.
                  </p>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                    gap: 18
                  }}
                >
                  {promoSectionModel.map((promoEntry, index) => (
                    <article
                      key={`fnb-promo-card-${index}`}
                      style={{
                        position: 'relative',
                        borderRadius: 26,
                        border: '1px solid #fed7aa',
                        background: 'linear-gradient(135deg, #ffffff 0%, #fffaf5 58%, #fff7ed 100%)',
                        boxShadow: '0 14px 28px rgba(249, 115, 22, 0.10)',
                        padding: isMobileViewport ? '18px 16px' : '18px 20px',
                        display: 'grid',
                        gap: 14
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#f97316', textTransform: 'uppercase' }}>
                        {promoEntry.title || promoEntry.badge || 'Promo'}
                      </div>
                      <div style={{ fontSize: isMobileViewport ? 34 : 42, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 0.95 }}>
                        {promoEntry.headline || promoEntry.badge || 'Promo'}
                      </div>
                      <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 800, color: '#111827' }}>
                        {promoEntry.subtitle || 'Storefront offer'}
                      </div>
                      {promoEntry.supportingText && (
                        <div style={{ fontSize: 14, color: '#374151' }}>{promoEntry.supportingText}</div>
                      )}
                      {promoEntry.validityText && (
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{promoEntry.validityText}</div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section
            style={{
              marginLeft: 'calc(50% - 50vw)',
              width: '100vw',
              padding: isMobileViewport ? '20px 0 24px' : '30px 0 34px',
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              borderTop: '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gap: 18
            }}
          >
            <div
              style={{
                maxWidth: 1320,
                width: '100%',
                margin: '0 auto',
                paddingLeft: isMobileViewport ? 16 : 24,
                paddingRight: isMobileViewport ? 16 : 24,
                display: 'grid',
                gap: 18
              }}
            >
              <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', flexDirection: isMobileViewport ? 'column' : 'row', gap: 14 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 30, fontWeight: 900, color: STYLES.colors.dark, fontFamily: modeAdapter.heroTheme?.displayFont }}>Customer Reviews</h2>
                  <p style={{ margin: 0, fontSize: 14, color: STYLES.colors.muted }}>See what diners are saying about this menu storefront.</p>
                </div>
                <PrimaryButton
                  style={{ minHeight: 44, minWidth: isMobileViewport ? '100%' : 170, justifyContent: 'center' }}
                  onClick={() => setIsReviewModalOpen(true)}
                >
                  Write Review
                </PrimaryButton>
              </div>

              {fnbCommunityModel.reviewHighlights.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1024 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
                  {fnbCommunityModel.reviewHighlights.map((review, index) => {
                    const reviewerName = String(review?.reviewer_name || '').trim() || 'Customer';
                    const rating = Number(review?.rating);
                    const comment = String(review?.comment || '').trim();
                    return (
                      <article
                        key={`fnb-customer-review-${index}`}
                        style={{
                          borderRadius: 20,
                          border: '1px solid #dbe5ee',
                          background: '#ffffff',
                          boxShadow: '0 14px 28px rgba(15,23,42,0.06)',
                          padding: isMobileViewport ? 16 : 18,
                          display: 'grid',
                          gap: 10
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 800, color: STYLES.colors.dark }}>{reviewerName}</div>
                        {Number.isFinite(rating) && rating > 0 && (
                          <div style={{ color: '#f59e0b', fontSize: 14 }}>
                            {Array.from({ length: 5 }, (_, starIndex) => (
                              <span key={`fnb-review-card-star-${index}-${starIndex}`} style={{ opacity: starIndex < Math.round(rating) ? 1 : 0.25 }}>
                                ?
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#334155' }}>
                          {comment || 'Review comment will appear here once available in SKUpervisor.'}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div style={{ borderRadius: 20, border: '1px dashed #cbd5e1', background: '#ffffff', padding: isMobileViewport ? 22 : 30, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                  Customer reviews will appear here once this storefront adds review data in SKUpervisor.
                </div>
              )}
            </div>
          </section>

          <footer
            style={{
              marginLeft: 'calc(50% - 50vw)',
              width: '100vw',
              background: '#090b0f',
              borderTop: '1px solid rgba(148, 163, 184, 0.18)'
            }}
          >
            <div
              style={{
                maxWidth: 1320,
                width: '100%',
                margin: '0 auto',
                padding: isMobileViewport ? '28px 16px 32px' : '48px 24px 36px',
                display: 'grid',
                gap: 28
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                  gap: isMobileViewport ? 24 : 36
                }}
              >
                <div style={{ display: 'grid', gap: 18 }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em', fontFamily: modeAdapter.heroTheme?.displayFont }}>{fnbCommunityModel.name}</div>
                    <div style={{ maxWidth: 360, fontSize: 15, lineHeight: 1.7, color: '#94a3b8' }}>
                      {fnbCommunityModel.tagline || fnbCommunityModel.aboutText || 'Food and beverage storefront powered by SKUpervisor content.'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Menu Categories
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {fnbCommunityModel.menuCategories.slice(0, 5).map((group) => (
                      <div key={`fnb-footer-group-${group.key}`} style={{ fontSize: 15, color: '#cbd5e1' }}>
                        {group.label}
                      </div>
                    ))}
                    {fnbCommunityModel.menuCategories.length === 0 && (
                      <div style={{ fontSize: 15, color: '#64748b' }}>No categories yet.</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Socials
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {fnbCommunityModel.footerLinks
                      .filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label))
                      .map((link) => (
                        <a
                          key={`fnb-footer-social-link-${link.label}`}
                          href={link.href}
                          target={String(link.href).startsWith('http') ? '_blank' : undefined}
                          rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                          style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}
                        >
                          {link.label}
                        </a>
                      ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Contact
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {fnbCommunityModel.footerLinks
                      .filter((link) => ['Call', 'Email'].includes(link.label))
                      .map((link) => (
                        <a key={`fnb-footer-contact-${link.label}`} href={link.href} style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}>
                          {link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', '')}
                        </a>
                      ))}
                    {fnbCommunityModel.hours && <div style={{ fontSize: 15, color: '#cbd5e1' }}>{fnbCommunityModel.hours}</div>}
                    <div style={{ fontSize: 15, color: '#cbd5e1' }}>{fnbCommunityModel.locationLabel}</div>
                  </div>
                </div>
              </div>
              <div
                style={{
                  paddingTop: 18,
                  borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                  display: 'flex',
                  alignItems: isMobileViewport ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  flexDirection: isMobileViewport ? 'column' : 'row',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {fnbCommunityModel.name}{fnbCommunityModel.registrationYear ? ` ${fnbCommunityModel.registrationYear}` : ''}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Powered by SKUpervisor</div>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>

    {/* ZONE 5: Sidebar (Desktop) */}
    {isServicesMode && !isMobileViewport && (
      <aside style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
        <div style={{ padding: 24, background: '#fff', borderRadius: STYLES.radius.card, border: `1px solid ${STYLES.colors.border}`, boxShadow: STYLES.shadow.sm }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: STYLES.colors.dark, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>Performance Summary</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: STYLES.colors.dark }}>{selectedStore.storefront_review_summary?.score?.toFixed(1) || '0.0'}</div>
            <div>
              <div style={{ color: STYLES.colors.amber, fontSize: 18 }}>*****</div>
              <div style={{ fontSize: 12, color: STYLES.colors.muted }}>from {selectedStore.storefront_review_summary?.total_count || 0} reviews</div>
            </div>
          </div>
          {isMultiGroup && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: STYLES.colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Service Families</div>
              {servicesViewModel.serviceGroups.map(group => {
                const GroupIcon = SERVICE_CATEGORY_ICON_MAP[group.categoryMeta?.iconToken] || Sparkles;
                return (
                  <button
                    key={group.categoryKey}
                    type="button"
                    onClick={() => setActiveServiceTab(group.categoryKey)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 12,
                      border: resolvedTab === group.categoryKey ? `1.5px solid ${group.categoryMeta.accent}` : `1px solid ${STYLES.colors.border}`,
                      background: resolvedTab === group.categoryKey ? group.categoryMeta.accentBg || '#f0fdfa' : '#fff',
                      color: resolvedTab === group.categoryKey ? group.categoryMeta.accent : STYLES.colors.text,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.16s ease'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <GroupIcon size={16} />
                      <span>{group.categoryMeta.label}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{group.items.length} services</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {(() => {
          const promo = parseOptionalObject(selectedStore.storefront_promo);
          if (!promo || !promo.active) return null;
          return (
            <div style={{
              padding: 24, borderRadius: STYLES.radius.card, background: `linear-gradient(135deg, ${STYLES.colors.brand}, ${STYLES.colors.brandDark})`,
              color: '#fff', boxShadow: STYLES.shadow.md
            }}>
              <Badge background="rgba(255,255,255,0.2)" color="#fff">{promo.badge || 'PROMO'}</Badge>
              <div style={{ marginTop: 16, fontSize: 24, fontWeight: 900 }}>{promo.title}</div>
              <p style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>{promo.subtitle}</p>
            </div>
          );
        })()}
      </aside>
    )}

    {isReviewModalOpen && isSimpleMode && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobileViewport ? 16 : 24
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,23,42,0.52)',
            backdropFilter: 'blur(5px)'
          }}
        />
        <section
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 640,
            maxHeight: 'min(90vh, 760px)',
            overflowY: 'auto',
            borderRadius: 28,
            border: '1px solid #dbe5ee',
            background: '#ffffff',
            boxShadow: '0 28px 64px rgba(15,23,42,0.22)',
            padding: isMobileViewport ? 20 : 28,
            display: 'grid',
            gap: 20
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: modeAdapter.heroTheme?.accent || '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Customer Review
              </div>
              <div style={{ fontSize: isMobileViewport ? 26 : 30, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08 }}>
                Share your experience
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
                Rate the storefront experience and leave a short message. Publishing will be connected once the review backend is ready.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#0f172a',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}
              aria-label="Close review modal"
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
              Your name
              <input
                value={reviewDraft.name}
                onChange={(event) => setReviewDraft((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="How should we identify your review?"
                style={BOOKING_FIELD_STYLE}
              />
            </label>

            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', cursor: 'pointer', width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={reviewDraft.anonymous}
                  onChange={(event) => setReviewDraft((previous) => ({ ...previous, anonymous: event.target.checked }))}
                />
                Post this review anonymously
              </label>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Public name preview: <strong style={{ color: '#0f172a' }}>{reviewDraft.anonymous ? maskReviewerName(reviewDraft.name) : (String(reviewDraft.name || '').trim() || 'Your name')}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Your rating</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {Array.from({ length: 5 }, (_, index) => {
                  const starValue = index + 1;
                  const selected = reviewDraft.rating >= starValue;
                  return (
                    <button
                      key={`simple-review-rating-${starValue}`}
                      type="button"
                      onClick={() => setReviewDraft((previous) => ({ ...previous, rating: starValue }))}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        border: `1px solid ${selected ? '#14b8a6' : '#dbe5ee'}`,
                        background: selected ? '#ecfeff' : '#ffffff',
                        color: selected ? '#14b8a6' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        boxShadow: selected ? '0 10px 20px rgba(20,184,166,0.16)' : 'none'
                      }}
                      aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}
                    >
                      <Star size={18} fill={selected ? '#14b8a6' : 'none'} color={selected ? '#14b8a6' : '#94a3b8'} />
                    </button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
              Your review
              <textarea
                value={reviewDraft.message}
                onChange={(event) => setReviewDraft((previous) => ({ ...previous, message: event.target.value }))}
                placeholder="Tell customers what stood out about the product selection, ordering, or pickup experience."
                style={{ ...BOOKING_FIELD_STYLE, minHeight: 144, resize: 'vertical' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12 }}>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
              Reviews are prepared on the storefront now. Submission and moderation will connect once backend review support is available.
            </div>
            <PrimaryButton
              onClick={handleReviewDraftSubmit}
              style={{ minHeight: 46, minWidth: isMobileViewport ? '100%' : 180, justifyContent: 'center' }}
            >
              Send Review
            </PrimaryButton>
          </div>
        </section>
      </div>
    )}

    {isReviewModalOpen && isFnbMode && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobileViewport ? 16 : 24
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,23,42,0.52)',
            backdropFilter: 'blur(5px)'
          }}
        />
        <section
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 640,
            maxHeight: 'min(90vh, 760px)',
            overflowY: 'auto',
            borderRadius: 28,
            border: '1px solid #dbe5ee',
            background: '#ffffff',
            boxShadow: '0 28px 64px rgba(15,23,42,0.22)',
            padding: isMobileViewport ? 20 : 28,
            display: 'grid',
            gap: 20
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Customer Review
              </div>
              <div style={{ fontSize: isMobileViewport ? 26 : 30, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08 }}>
                Share your dining experience
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
                Rate this menu storefront and leave a short message. Publishing connects once review backend submission is enabled.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#0f172a',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}
              aria-label="Close review modal"
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
              Your name
              <input
                value={reviewDraft.name}
                onChange={(event) => setReviewDraft((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="How should we identify your review?"
                style={BOOKING_FIELD_STYLE}
              />
            </label>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', cursor: 'pointer', width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={reviewDraft.anonymous}
                  onChange={(event) => setReviewDraft((previous) => ({ ...previous, anonymous: event.target.checked }))}
                />
                Post this review anonymously
              </label>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Public name preview: <strong style={{ color: '#0f172a' }}>{reviewDraft.anonymous ? maskReviewerName(reviewDraft.name) : (String(reviewDraft.name || '').trim() || 'Your name')}</strong>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Your rating</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {Array.from({ length: 5 }, (_, index) => {
                  const starValue = index + 1;
                  const selected = reviewDraft.rating >= starValue;
                  return (
                    <button
                      key={`fnb-review-rating-${starValue}`}
                      type="button"
                      onClick={() => setReviewDraft((previous) => ({ ...previous, rating: starValue }))}
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        border: `1px solid ${selected ? '#f59e0b' : '#dbe5ee'}`,
                        background: selected ? '#fff7ed' : '#ffffff',
                        color: selected ? '#f59e0b' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        boxShadow: selected ? '0 10px 20px rgba(245,158,11,0.16)' : 'none'
                      }}
                      aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}
                    >
                      <Star size={18} fill={selected ? '#f59e0b' : 'none'} color={selected ? '#f59e0b' : '#94a3b8'} />
                    </button>
                  );
                })}
              </div>
            </div>
            <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
              Your review
              <textarea
                value={reviewDraft.message}
                onChange={(event) => setReviewDraft((previous) => ({ ...previous, message: event.target.value }))}
                placeholder="Tell customers what stood out about the food, drinks, and overall order experience."
                style={{ ...BOOKING_FIELD_STYLE, minHeight: 144, resize: 'vertical' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12 }}>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
              Reviews are prepared on the storefront now. Submission and moderation will connect once backend review support is available.
            </div>
            <PrimaryButton
              onClick={handleReviewDraftSubmit}
              style={{ minHeight: 46, minWidth: isMobileViewport ? '100%' : 180, justifyContent: 'center' }}
            >
              Send Review
            </PrimaryButton>
          </div>
        </section>
      </div>
    )}
  </div>
  </>
);
            })()}
          </>
        )}

      </div>

  { isStorePage && (checkoutPermitted || bookingPermitted) && (
    <>
      {isStorefrontV2 && selectedStore && (() => {
        const followEnabled = parseBooleanFlag(selectedStore.storefront_follow_enabled, false);
        const shareEnabled = parseBooleanFlag(selectedStore.storefront_share_enabled, false);
        if (!followEnabled && !shareEnabled) return null;
        return (
          <div
            style={{
              position: 'fixed',
              zIndex: 2090,
              left: isMobileViewport ? 10 : 'auto',
              right: isMobileViewport ? 10 : 18,
              bottom: isMobileViewport ? 78 : 84,
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              flexWrap: 'wrap'
            }}
          >
            {followEnabled && (
              <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#334155', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>{followState.followersCount} follower(s)</span>
                <button type="button" aria-label="Follow this storefront" disabled={followState.loading} onClick={handleFollowAction} style={{ borderRadius: 10, border: '1px solid #cbd5e1', background: followState.isFollowing ? '#ecfeff' : '#fff', color: '#334155', padding: '8px 12px', minHeight: 44, minWidth: 96, fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,.12)', opacity: followState.loading ? 0.7 : 1, cursor: followState.loading ? 'not-allowed' : 'pointer' }}>
                  {followState.isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            )}
            {shareEnabled && (
              <button type="button" aria-label="Share this storefront" onClick={handleShareAction} style={{ borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '8px 12px', minHeight: 44, minWidth: 96, fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,.12)' }}>
                Share
              </button>
            )}
          </div>
        );
      })()}
      {isServicesCartDrawerMode && (
        <>
          <button
            type="button"
            onClick={() => setIsCheckoutOpen((previous) => !previous)}
            aria-label={isCheckoutOpen ? 'Close service cart' : 'Open service cart'}
            style={{
              position: 'fixed',
              right: isMobileViewport ? 16 : 24,
              bottom: isMobileViewport ? 16 : 24,
              zIndex: 2100,
              width: isMobileViewport ? 62 : 68,
              height: isMobileViewport ? 62 : 68,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'linear-gradient(135deg,#ea580c,#f97316)',
              color: '#fff',
              boxShadow: '0 18px 38px rgba(234,88,12,.34)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                minWidth: 22,
                height: 22,
                padding: '0 6px',
                borderRadius: 999,
                background: '#0f172a',
                color: '#fff',
                fontSize: 11,
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #fff'
              }}
            >
              {serviceCartCount}
            </span>
            <ShoppingCart size={24} strokeWidth={2.2} />
          </button>

          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2095,
              pointerEvents: isCheckoutOpen ? 'auto' : 'none'
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsCheckoutOpen(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  setIsCheckoutOpen(false);
                }
              }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15,23,42,.46)',
                backdropFilter: 'blur(4px)',
                opacity: isCheckoutOpen ? 1 : 0,
                transition: 'opacity 180ms ease'
              }}
            />
            <aside
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: isMobileViewport ? 'min(100vw, 100%)' : 'min(520px, calc(100vw - 40px))',
                background: '#ffffff',
                borderLeft: '1px solid #dbe5ee',
                boxShadow: '0 24px 60px rgba(15,23,42,.18)',
                display: 'flex',
                flexDirection: 'column',
                transform: isCheckoutOpen ? 'translateX(0)' : 'translateX(104%)',
                transition: 'transform 220ms ease'
              }}
            >
              <div style={{ padding: isMobileViewport ? '18px 16px 14px' : '22px 20px 16px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service Cart</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', fontFamily: servicesDisplayFont }}>Added services</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>Manage the service in cart, then continue to booking.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(false)}
                    style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 900, cursor: 'pointer' }}
                  >
                    x
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: 999, padding: '4px 10px' }}>
                    {serviceCartCount} item{serviceCartCount === 1 ? '' : 's'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    One service booking is submitted at a time.
                  </span>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 14 }}>
                {serviceCartLines.length === 0 ? (
                  <div style={{ border: '1px dashed #cbd5e1', borderRadius: 20, background: '#f8fafc', padding: '28px 20px', textAlign: 'center', display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>No service added yet</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                      Add a service from the catalog to continue to booking.
                    </div>
                  </div>
                ) : (
                  serviceCartLines.map((line) => (
                    <div key={`services-cart-line-${line.cart_line_id || line.item_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 22, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,.06)', padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
                        <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                            <img
                              src={withAssetOrigin(line.image_url)}
                              alt={line.variantName || line.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={() => {
                                const normalizedLineItemId = Number(line.item_id);
                                if (!Number.isFinite(normalizedLineItemId)) return;
                                setCartImageErrors((previous) => {
                                  const next = new Set(previous);
                                  next.add(normalizedLineItemId);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>No image</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'start', gap: 10 }}>
                              <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                                <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 900, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {line.variantName || line.name}
                                </div>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                                {money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}
                              </div>
                              <button
                                type="button"
                                aria-label={`Remove ${line.variantName || line.name}`}
                                onClick={() => removeCartItem(line.cart_line_id || line.item_id)}
                                style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {!!line.serviceAreaLabel && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
                                {line.serviceAreaLabel}
                              </span>
                            )}
                            {!!line.durationLabel && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
                                {line.durationLabel}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
                            <button
                              type="button"
                              onClick={() => updateQty(line.cart_line_id || line.item_id, Math.max(0, Number(line.quantity || 1) - 1))}
                              style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: 14, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                              {Math.max(1, Number(line.quantity || 1))}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(line.cart_line_id || line.item_id, Number(line.quantity || 1) + 1)}
                              style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => openServiceCartEditor(line)}
                            style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '8px 10px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {productCartLines.length > 0 && (
                  <div style={{ border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412', borderRadius: 16, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
                    Product items are not included in service booking. Continue with service booking only, or remove non-service items first.
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Current total</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{money(serviceCartTotal)}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>
                    {serviceCartCount} selected
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleServicesCartCheckout}
                  disabled={!hasServiceCart || hasMixedServiceCart}
                  style={{
                    minHeight: 50,
                    borderRadius: 16,
                    border: 'none',
                    background: !hasServiceCart || hasMixedServiceCart ? '#cbd5e1' : `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`,
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 900,
                    cursor: !hasServiceCart || hasMixedServiceCart ? 'not-allowed' : 'pointer',
                    boxShadow: !hasServiceCart || hasMixedServiceCart ? 'none' : `0 14px 30px ${servicesPrimaryShadowStrong}`
                  }}
                >
                  Order &amp; Purchase
                </button>
              </div>
            </aside>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          if (isServicesMode) {
            goStoreBookingPage();
            return;
          }
          setIsCheckoutOpen((prev) => {
            const next = !prev;
            if (next) setCheckoutTab(isServicesMode && hasServiceCart ? 'review' : (isFnbMode ? 'cart' : 'checkout'));
            return next;
          });
        }}
        style={{
          position: 'fixed',
          zIndex: 2100,
          border: isServicesMode && hasServiceCart
            ? '1px solid #dbe5ee'
            : (isFnbMode ? 'none' : 'none'),
          borderRadius: isFnbMode ? 999 : (isMobileViewport ? 16 : 22),
          background: isServicesMode && hasServiceCart
            ? '#ffffff'
            : (isFnbMode ? 'linear-gradient(135deg,#ea580c,#f97316)' : 'linear-gradient(135deg,#ea580c,#f97316)'),
          color: isServicesMode && hasServiceCart
            ? '#0f172a'
            : '#fff',
          boxShadow: isServicesMode && hasServiceCart
            ? '0 22px 48px rgba(15,23,42,.16)'
            : '0 14px 34px rgba(234,88,12,.38)',
          padding: isServicesMode && hasServiceCart ? (isMobileViewport ? '12px 14px' : '16px 18px') : (isFnbMode ? 0 : '12px 18px'),
          width: isFnbMode ? (isMobileViewport ? 62 : 68) : undefined,
          height: isFnbMode ? (isMobileViewport ? 62 : 68) : undefined,
          minWidth: isServicesMode && hasServiceCart ? (isMobileViewport ? 0 : 320) : (isFnbMode ? undefined : (isMobileViewport ? 0 : 255)),
          textAlign: 'left',
          cursor: 'pointer',
          right: isMobileViewport ? 10 : 18,
          left: isFnbMode ? 'auto' : (isMobileViewport ? 10 : 'auto'),
          bottom: isMobileViewport ? 10 : 18,
          display: isServicesCartDrawerMode
            ? 'none'
            : (
              isServicesMode && isDesktopViewport
                ? 'none'
                : (isFnbOrderSubpage ? 'none' : 'block')
            )
        }}
      >
        {isServicesMode && hasServiceCart ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Booking Summary</div>
                <div style={{ marginTop: 3, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{serviceBookingSummaryTitle}</div>
              </div>
              {!isMobileViewport && (
                <div style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: 999, padding: '4px 8px' }}>
                  {cartCount} service
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#475569' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CalendarDays size={14} color={servicesPrimary} />
                {serviceBookingSummarySchedule}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} color={servicesPrimary} />
                {servicePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Payment pending'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{money(cartTotal)}</div>
              <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 800 }}>
                {isCheckoutOpen ? 'Close booking' : (isMobileViewport ? 'View booking' : 'View cart and checkout')}
              </div>
            </div>
          </div>
        ) : isFnbMode ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={24} strokeWidth={2.2} />
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                minWidth: 22,
                height: 22,
                padding: '0 6px',
                borderRadius: 999,
                background: '#0f172a',
                color: '#fff',
                border: '2px solid #fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 900,
                lineHeight: 1
              }}
            >
              {cartCount}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, opacity: .95 }}>{cartCount} item(s) in cart</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{money(cartTotal)}</div>
            <div style={{ marginTop: 2, fontSize: 12, textDecoration: 'underline' }}>{isCheckoutOpen ? 'Close checkout' : 'View Cart'}</div>
          </>
        )}
      </button>

      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: isServicesCartDrawerMode ? 'none' : ((isCheckoutOpen || isFnbOrderSubpage) ? 'auto' : 'none'), display: isServicesCartDrawerMode ? 'none' : 'block' }}>
        {!isFnbOrderSubpage && (
          <div role="button" tabIndex={0} onClick={() => setIsCheckoutOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsCheckoutOpen(false); }} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.50)', backdropFilter: 'blur(6px)', opacity: isCheckoutOpen ? 1 : 0, transition: 'opacity 180ms ease' }} />
        )}
        <aside
          style={{
            position: 'absolute',
            zIndex: 2001,
            background: isFnbMode ? '#ffffff' : 'linear-gradient(180deg,#ffffff 0%,#f7fbfb 100%)',
            border: isFnbMode ? 'none' : '1px solid #d6e2e8',
            borderLeft: isDesktopCheckout && isFnbMode ? '1px solid #dbe5ee' : undefined,
            boxShadow: isDesktopCheckout
              ? (isFnbMode ? '0 24px 60px rgba(15,23,42,.18)' : '0 30px 80px rgba(15,23,42,.18)')
              : '0 -14px 34px rgba(15,23,42,.22)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 220ms ease, opacity 220ms ease',
            opacity: (isCheckoutOpen || isFnbOrderSubpage) ? 1 : 0,
            ...(isFnbOrderSubpage
              ? {
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                borderRadius: 0,
                transform: 'translateX(0)'
              }
              : (isDesktopCheckout
              ? {
                top: isFnbMode ? 0 : 24,
                right: 0,
                bottom: 0,
                width: isFnbMode ? 'min(520px, calc(100vw - 40px))' : 'min(1080px, calc(100vw - 48px))',
                borderRadius: isFnbMode ? 0 : 26,
                transform: isCheckoutOpen ? 'translateX(0)' : 'translateX(32px)'
              }
              : {
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: '92vh',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                transform: isCheckoutOpen ? 'translateY(0)' : 'translateY(105%)'
              }))
          }}
        >
          <div style={{ padding: isDesktopCheckout ? (isFnbMode ? '22px 20px 16px' : '16px 18px 12px 18px') : '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: isFnbMode ? '#ffffff' : 'rgba(255,255,255,.88)' }}>
            <div>
              {isFnbMode ? (
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Menu Cart</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Added items</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{fnbDrawerSupportLabel}</div>
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    {isServicesMode && hasServiceCart ? 'Booking Journey' : `${DGFY_BRAND_NAME} Checkout`}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedStore?.tenant_name || routeSlug || 'Tenant'}</div>
                </>
              )}
              {!(isFnbMode && !isFnbOrderSubpage) && (
                <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', background: '#e6fffb', border: '1px solid #99f6e4', borderRadius: 999, padding: '3px 8px' }}>
                    {cartCount} {isServicesMode && hasServiceCart ? 'service' : 'item'}{cartCount === 1 ? '' : 's'}
                  </span>
                  {(!isServicesMode || !hasServiceCart) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {activeOrderMethodLabel}
                    </span>
                  )}
                  {isFnbMode && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7c2d12', background: '#ffedd5', border: '1px solid #fdba74', borderRadius: 999, padding: '3px 8px' }}>
                      {fnbCartStatusLabel}
                    </span>
                  )}
                  {isServicesMode && hasServiceCart && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                      {serviceBookingSummarySchedule}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (isFnbOrderSubpage) {
                  goStoreCatalogPage();
                  return;
                }
                setIsCheckoutOpen(false);
              }}
              style={{ borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', width: 34, height: 34, fontWeight: 900, cursor: 'pointer' }}
            >
              {isFnbOrderSubpage ? '<' : 'x'}
            </button>
          </div>

          {!isFnbMode && (
            <div style={{ display: 'flex', gap: 8, padding: isDesktopCheckout ? '14px 18px 8px 18px' : '12px 14px 6px 14px', background: 'rgba(255,255,255,.72)' }}>
              {[
                ...(isServicesMode && hasServiceCart ? [{ id: 'review', label: 'Booking Summary' }] : []),
                { id: 'checkout', label: isServicesMode && hasServiceCart ? 'Customer Details' : 'Checkout' },
                ...(isFnbMode ? [{ id: 'reservation', label: 'Reservation' }] : []),
                ...(!isFnbMode ? [
                  { id: 'track', label: 'Track' },
                  { id: 'account', label: 'Account' }
                ] : [])
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCheckoutTab(tab.id);
                    if (tab.id === 'account') handleLoadAccountPanel();
                  }}
                  style={{ borderRadius: 999, border: `1px solid ${checkoutTab === tab.id ? '#0f766e' : '#cbd5e1'}`, background: checkoutTab === tab.id ? '#e6fffb' : '#fff', color: checkoutTab === tab.id ? '#0f766e' : '#334155', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ overflowY: 'auto', padding: isDesktopCheckout ? '12px 18px 18px 18px' : '8px 14px 16px 14px' }}>
            {isFnbOrderSubpage && isFnbMode && (
              <div style={{ display: 'grid', gap: 18, maxWidth: 980, margin: '0 auto', width: '100%', padding: isMobileViewport ? '4px 0 10px' : '6px 4px 14px' }}>
                <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order Page</div>
                  <div style={{ fontSize: isMobileViewport ? 24 : 28, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>Complete your order</div>
                  <div style={{ fontSize: 14, color: '#64748b' }}>Review cart, confirm delivery details, and submit payment in four quick steps.</div>
                </section>

                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    { step: 1, label: 'Cart' },
                    { step: 2, label: 'Fulfillment' },
                    { step: 3, label: 'Customer' },
                    { step: 4, label: 'Payment' }
                  ].map((item) => {
                    const isActive = fnbOrderStep === item.step;
                    const done = fnbOrderStep > item.step;
                    return (
                      <button
                        key={`fnb-order-step-${item.step}`}
                        type="button"
                        onClick={() => {
                          if (item.step === 1) {
                            setFnbOrderStep(1);
                            return;
                          }
                          if (item.step === 2 && cart.length > 0) {
                            setFnbOrderStep(2);
                            return;
                          }
                          if (item.step === 3 && cart.length > 0) {
                            setFnbOrderStep(3);
                            return;
                          }
                          if (item.step === 4 && cart.length > 0 && fnbCustomerStepComplete) {
                            setFnbOrderStep(4);
                          }
                        }}
                        style={{
                          borderRadius: 14,
                          border: `1px solid ${isActive ? '#ea580c' : '#e2e8f0'}`,
                          background: isActive ? '#fff7ed' : '#fff',
                          color: isActive ? '#9a3412' : '#334155',
                          minHeight: 42,
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {done ? `OK ${item.label}` : `${item.step}. ${item.label}`}
                      </button>
                    );
                  })}
                </div>

                {fnbOrderStep === 1 && (
                  <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Review Menu Cart</div>
                    {cart.length === 0 ? (
                      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 16, background: '#f8fafc', padding: '24px 16px', textAlign: 'center', color: '#64748b' }}>
                        Add menu items first to continue.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10, maxHeight: isMobileViewport ? 300 : 360, overflowY: 'auto', paddingRight: 2 }}>
                        {cart.map((line) => (
                          <div key={`fnb-order-line-${line.cart_line_id || line.item_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', padding: 12, display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{line.name}</div>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button type="button" onClick={() => updateQty(line.cart_line_id || line.item_id, Math.max(0, Number(line.quantity || 1) - 1))} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>-</button>
                              <span style={{ fontWeight: 800, minWidth: 14, textAlign: 'center' }}>{Math.max(1, Number(line.quantity || 1))}</span>
                              <button type="button" onClick={() => updateQty(line.cart_line_id || line.item_id, Number(line.quantity || 1) + 1)} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>+</button>
                              <button type="button" onClick={() => removeCartItem(line.cart_line_id || line.item_id)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 14, color: '#64748b' }}>Subtotal</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{money(cartTotal)}</div>
                    </div>
                    <button type="button" onClick={() => setFnbOrderStep(2)} disabled={cart.length === 0} style={{ minHeight: 46, borderRadius: 14, border: 'none', background: cart.length === 0 ? '#cbd5e1' : '#ea580c', color: '#fff', fontWeight: 800, cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}>
                      Continue
                    </button>
                  </section>
                )}

                {fnbOrderStep === 2 && (
                  <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Fulfillment</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <button type="button" onClick={() => setOrderMethod('delivery')} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${orderMethod === 'delivery' ? '#ea580c' : '#dbe5ee'}`, background: orderMethod === 'delivery' ? '#fff7ed' : '#fff', fontWeight: 800, cursor: 'pointer' }}>Delivery</button>
                      <button type="button" onClick={() => setOrderMethod('pickup')} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${orderMethod === 'pickup' ? '#ea580c' : '#dbe5ee'}`, background: orderMethod === 'pickup' ? '#fff7ed' : '#fff', fontWeight: 800, cursor: 'pointer' }}>Pickup</button>
                    </div>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
                      Schedule time (optional)
                      <input type="datetime-local" value={fnbScheduledFor} onChange={(event) => setFnbScheduledFor(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                    </label>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <button type="button" onClick={() => setFnbOrderStep(1)} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>Back</button>
                      <button type="button" onClick={() => setFnbOrderStep(3)} style={{ minHeight: 42, borderRadius: 12, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Continue</button>
                    </div>
                  </section>
                )}

                {fnbOrderStep === 3 && (
                  <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Customer Details</div>
                    <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Provide one contact method: mobile number or email.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
                        Customer Name *
                        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
                        Contact Number *
                        <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569', gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                        Email (optional)
                        <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      {isDeliveryOrder && (
                        <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569', gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                          Delivery Address *
                          <textarea value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} rows={3} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical' }} />
                        </label>
                      )}
                      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569', gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                        Special Instructions (optional)
                        <textarea value={fnbSpecialInstructions} onChange={(event) => setFnbSpecialInstructions(event.target.value)} rows={3} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical' }} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <button type="button" onClick={() => setFnbOrderStep(2)} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>Back</button>
                      <button type="button" onClick={() => setFnbOrderStep(4)} disabled={!fnbCustomerStepComplete} style={{ minHeight: 42, borderRadius: 12, border: 'none', background: fnbCustomerStepComplete ? '#ea580c' : '#cbd5e1', color: '#fff', fontWeight: 800, cursor: fnbCustomerStepComplete ? 'pointer' : 'not-allowed' }}>Continue</button>
                    </div>
                    {!fnbCustomerStepComplete && (
                      <div style={{ fontSize: 12, color: '#b45309' }}>
                        Complete required fields to continue.
                      </div>
                    )}
                  </section>
                )}

                {fnbOrderStep === 4 && !checkoutResult && (
                  <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Payment and Submit</div>
                    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
                      Payment Type
                      <StorefrontDropdown
                        value={fnbPaymentType}
                        onChange={(nextValue) => setFnbPaymentType(String(nextValue))}
                        options={[
                          { value: 'cash', label: 'Cash' },
                          { value: 'online', label: 'Online' }
                        ]}
                        triggerStyle={{ minHeight: 44, borderRadius: 12 }}
                      />
                    </label>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc', padding: 12, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155' }}><span>Items subtotal</span><strong>{money(totalsForDisplay.subtotal_amount)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155' }}><span>{totalsForDisplay.service_fee_label}</span><strong>{money(totalsForDisplay.service_fee_amount)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#334155' }}><span>Delivery fee</span><strong>{money(totalsForDisplay.delivery_fee)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #dbe5ee', fontSize: 15, color: '#0f172a' }}><span style={{ fontWeight: 800 }}>Total due</span><strong style={{ fontWeight: 900 }}>{money(totalsForDisplay.total_amount)}</strong></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button type="button" onClick={handleQuote} disabled={!selectedStore || cart.length === 0} style={{ minHeight: 44, borderRadius: 12, border: '1px solid #ea580c', background: '#fff', color: '#9a3412', fontWeight: 800, cursor: 'pointer' }}>Refresh Quote</button>
                      <button type="button" onClick={handleCheckout} disabled={!checkoutAllowed} style={{ minHeight: 44, borderRadius: 12, border: 'none', background: checkoutAllowed ? '#ea580c' : '#cbd5e1', color: '#fff', fontWeight: 800, cursor: checkoutAllowed ? 'pointer' : 'not-allowed' }}>{checkoutLoading ? 'Processing...' : 'Place Order'}</button>
                    </div>
                    {quoteError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
                    {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
                    <button type="button" onClick={() => setFnbOrderStep(3)} style={{ justifySelf: 'start', minHeight: 40, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>Back</button>
                  </section>
                )}

                {fnbOrderStep === 4 && checkoutResult && (
                  <section style={{ border: '1px solid #dbe5ee', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order Confirmation</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Order submitted successfully</div>
                    <div style={{ display: 'grid', gap: 6, fontSize: 14, color: '#334155' }}>
                      <div>Reference: <strong>{checkoutResult?.tracking_pin || 'Pending'}</strong></div>
                      <div>Payment: <strong>{String(fnbPaymentType || 'cash').toUpperCase()}</strong></div>
                      <div>Total: <strong>{money(checkoutResult?.totals?.total_amount ?? totalsForDisplay.total_amount)}</strong></div>
                    </div>
                    <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                      {(Array.isArray(checkoutResult?.cart_lines) ? checkoutResult.cart_lines : []).map((line) => (
                        <div key={`fnb-confirm-line-${line.item_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                          <span>{line.name} x {Math.max(1, Number(line.quantity || 1))}</span>
                          <strong>{money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}</strong>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {checkoutResult?.payment?.checkout_url && (
                        <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ minHeight: 42, borderRadius: 12, border: 'none', background: '#ea580c', color: '#fff', padding: '0 14px', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                          Continue to Payment
                        </a>
                      )}
                      <button type="button" onClick={handleDownloadCheckoutImage} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>Download Confirmation</button>
                      <button type="button" onClick={() => { setCheckoutResult(null); setFnbOrderStep(1); goStoreCatalogPage(); }} style={{ minHeight: 42, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 14px', fontWeight: 800, cursor: 'pointer' }}>Back to Menu</button>
                    </div>
                  </section>
                )}
              </div>
            )}

            {checkoutTab === 'cart' && isFnbMode && !isFnbOrderSubpage && (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: isDesktopCheckout ? 'calc(100vh - 126px)' : 'calc(92vh - 122px)' }}>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 14 }}>
                  {cart.length === 0 ? (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 20, background: '#f8fafc', padding: '28px 20px', minHeight: isMobileViewport ? 240 : 320, textAlign: 'center', display: 'grid', alignContent: 'center', gap: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>No menu item added yet</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                        Add food or beverage items from the catalog to continue to ordering.
                      </div>
                    </div>
                  ) : (
                    cart.map((line) => (
                      <div
                        key={`fnb-cart-line-${line.item_id}`}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          padding: isMobileViewport ? '10px 2px 8px' : '12px 4px 10px',
                          display: 'grid',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
                          <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                              <img
                                src={withAssetOrigin(line.image_url)}
                                alt={line.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={() => {
                                  const normalizedLineItemId = Number(line.item_id);
                                  if (!Number.isFinite(normalizedLineItemId)) return;
                                  setCartImageErrors((previous) => {
                                    const next = new Set(previous);
                                    next.add(normalizedLineItemId);
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>No image</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'start', gap: 10 }}>
                              <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                                <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>
                                  {line.name}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                  Unit: {money(line.price)} {line.unit_of_measure ? `- ${line.unit_of_measure}` : ''}
                                </div>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                                {money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}
                              </div>
                              <button
                                type="button"
                                aria-label={`Remove ${line.name}`}
                                onClick={() => removeCartItem(line.cart_line_id || line.item_id)}
                                style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
                                {activeOrderMethodLabel}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
                                Qty {Math.max(1, Number(line.quantity || 1))}
                              </span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
                              <button
                                type="button"
                                onClick={() => updateQty(line.cart_line_id || line.item_id, Math.max(0, Number(line.quantity || 1) - 1))}
                                style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                              >
                                -
                              </button>
                              <span style={{ minWidth: 14, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                                {Math.max(1, Number(line.quantity || 1))}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(line.cart_line_id || line.item_id, Number(line.quantity || 1) + 1)}
                                style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Current total</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{money(cartTotal)}</div>
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>
                      {cartCount} selected
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={goStoreOrderPage}
                    disabled={cart.length === 0}
                    style={{
                      minHeight: 50,
                      borderRadius: 16,
                      border: 'none',
                      background: cart.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg,#ea580c,#f97316)',
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 900,
                      cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                      boxShadow: cart.length === 0 ? 'none' : '0 14px 30px rgba(234,88,12,.24)'
                    }}
                  >
                    Order &amp; Purchase
                  </button>
                </div>
              </div>
            )}
            {checkoutTab === 'review' && hasServiceCart && (
              <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.25fr) minmax(280px, 360px)' : '1fr', gap: 16, alignItems: 'start' }}>
                <section style={{ display: 'grid', gap: 14 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 18, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Review Your Booking</div>
                        <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>Confirm the selected service, schedule, and booking instructions before you continue.</div>
                      </div>
                      <button
                        type="button"
                        onClick={openServiceCartEditor}
                        style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Edit service
                      </button>
                    </div>

                    <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 18, padding: 16, background: '#fcfdff', display: 'grid', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '88px 1fr auto', gap: 14, alignItems: 'center' }}>
                        <div style={{ width: 88, height: 88, borderRadius: 18, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                          {firstServiceLine?.image_url && !cartImageErrors.has(Number(firstServiceLine.item_id)) ? (
                            <img
                              src={withAssetOrigin(firstServiceLine.image_url)}
                              alt={firstServiceLine.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={() => {
                                const normalizedLineItemId = Number(firstServiceLine.item_id);
                                if (!Number.isFinite(normalizedLineItemId)) return;
                                setCartImageErrors((prev) => {
                                  const next = new Set(prev);
                                  next.add(normalizedLineItemId);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>No image</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              {firstServiceLine?.service_detail?.service_type || firstServiceLine?.category || 'Service'}
                            </div>
                            <div style={{ marginTop: 3, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>
                              {firstServiceLine?.variantName || firstServiceLine?.name}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                              {firstServiceLine?.service_detail?.service_area_type || firstServiceLine?.serviceAreaLabel || 'Service'}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                              Qty {firstServiceLine?.quantity || 1}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                              {servicePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Payment pending'}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', textAlign: isMobileViewport ? 'left' : 'right' }}>
                          {money((Number(firstServiceLine?.price || 0) || 0) * Math.max(1, Number(firstServiceLine?.quantity || 1)))}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preferred schedule</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{serviceBookingSummarySchedule}</div>
                        </div>
                        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking instructions</div>
                          <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                            {String(firstServiceLine?.service_notes || '').trim() || 'No special instructions yet.'}
                          </div>
                        </div>
                        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Validation note</div>
                          <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                            SKUpervisor confirms conflicts, lead time, and other booking rules when you submit.
                          </div>
                        </div>
                      </div>

                      {serviceIntakeFields.length > 0 && (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Service requirements</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {serviceIntakeFields.map((field) => (
                              <div key={`review-${field.id}`} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '180px 1fr', gap: 10, padding: '10px 0', borderTop: '1px solid #edf2f7' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{field.label}</div>
                                <div style={{ fontSize: 13, color: '#334155' }}>
                                  {field.type === 'checkbox'
                                    ? (serviceIntakeResponses[field.id] === true ? 'Confirmed' : 'Not confirmed')
                                    : (String(serviceIntakeResponses[field.id] || '').trim() || 'Not provided')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <aside style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 16, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)', display: 'grid', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Booking Summary</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Move to customer details when the service details look correct.</div>
                    </div>
                    <div style={{ borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, opacity: .95 }}>Service total</span>
                        <strong style={{ fontSize: 18 }}>{money(cartTotal)}</strong>
                      </div>
                      <div style={{ fontSize: 12, opacity: .95 }}>
                        {serviceBookingSummarySchedule}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setCheckoutTab('checkout')}
                        style={{ borderRadius: 14, border: '1px solid rgba(15,118,110,.15)', background: '#0f766e', color: '#fff', padding: '12px 14px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Continue to Checkout
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCartItem(firstServiceLine.cart_line_id || firstServiceLine.item_id)}
                        style={{ borderRadius: 14, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', padding: '12px 14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      >
                        <Trash2 size={16} />
                        Remove Service
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {checkoutTab === 'checkout' && (
              <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.5fr) minmax(340px, 420px)' : '1fr', gap: 16, alignItems: 'start' }}>
                <section style={{ display: 'grid', gap: 14 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{hasServiceCart ? 'Customer Details' : 'Delivery Details'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      {hasServiceCart
                        ? 'Finish the booking with the customer contact details required by the current storefront contract.'
                        : 'Group the must-fill fields together so checkout feels faster and calmer.'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                      {storeLocations.length > 0 && (
                        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                          Fulfillment Location
                          <select
                            value={selectedLocationId ?? ''}
                            onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          >
                            {storeLocations.map((location) => (
                              <option key={location.location_id} value={location.location_id} disabled={location.is_open === false || location.is_active === false}>
                                {location.name} {location.is_primary_storefront ? '(Primary)' : ''} {location.is_open === false ? '(Closed)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!hasServiceCart && (
                        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                          Order Method
                          <select
                            value={orderMethod}
                            onChange={(e) => {
                              setOrderMethod(e.target.value);
                              setPinLocationError('');
                            }}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          >
                            {ORDER_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </label>
                      )}
                      <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        Customer Name
                        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who is receiving this?" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        Phone Number
                        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Mobile number" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        Email
                        <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="For ticket or account linking" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                      </label>
                    </div>
                    {hasServiceCart && (
                      <>
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Appointment Date / Time
                            <input type="datetime-local" value={serviceAppointmentAt} onChange={(e) => setServiceAppointmentAt(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                          </label>
                          <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                            Payment Timing
                            <select value={servicePaymentTiming} onChange={(e) => setServicePaymentTiming(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}>
                              {servicePaymentOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {serviceIntakeFields.length > 0 && (
                          <section style={{ marginTop: 10, border: '1px solid #d9e4e8', borderRadius: 14, padding: 12, background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Service Intake</h3>
                            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                              {serviceIntakeFields.map((field) => (
                                <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                                  {field.label}{field.required ? ' *' : ''}
                                  {field.type === 'textarea' ? (
                                    <textarea
                                      value={serviceIntakeResponses[field.id] || ''}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                      style={{ width: '100%', minHeight: 72, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                    />
                                  ) : field.type === 'select' ? (
                                    <select
                                      value={serviceIntakeResponses[field.id] || ''}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                      style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                    >
                                      <option value="">Select</option>
                                      {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                  ) : field.type === 'checkbox' ? (
                                    <input
                                      type="checkbox"
                                      checked={serviceIntakeResponses[field.id] === true}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                                      style={{ marginTop: 10 }}
                                    />
                                  ) : (
                                    <input
                                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                      value={serviceIntakeResponses[field.id] || ''}
                                      onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                      style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                                    />
                                  )}
                                </label>
                              ))}
                            </div>
                          </section>
                        )}
                      </>
                    )}
                    {!hasServiceCart && (
                      <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10 }}>
                        Delivery Address
                        <input
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder={isDeliveryOrder ? 'House number, street, landmark' : 'Address is only needed for delivery'}
                          disabled={!isDeliveryOrder}
                          style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: isDeliveryOrder ? '#fff' : '#f1f5f9' }}
                        />
                      </label>
                    )}
                    {selectedLocation?.is_open === false && (
                      <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                        Selected location is closed and cannot accept orders right now.
                      </div>
                    )}
                  </div>

                  {!hasServiceCart && (
                    <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: 'linear-gradient(180deg,#f8fffe 0%,#ffffff 100%)', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Location Pin</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {isDeliveryOrder ? 'Add a precise drop-off pin to help fulfillment.' : 'Pinning is available for delivery orders.'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={handlePinMyLocation}
                            disabled={!isDeliveryOrder || pinLocationLoading}
                            style={{ borderRadius: 12, border: '1px solid #0f766e', background: isDeliveryOrder ? '#fff' : '#f8fafc', color: '#0f766e', padding: '9px 12px', fontWeight: 700, cursor: isDeliveryOrder ? 'pointer' : 'not-allowed' }}
                          >
                            {pinLocationLoading ? 'Pinning...' : 'Pin My Location'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerPin(null)}
                            disabled={!isDeliveryOrder || !customerPin}
                            style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700, cursor: (!isDeliveryOrder || !customerPin) ? 'not-allowed' : 'pointer' }}
                          >
                            Clear Pin
                          </button>
                        </div>
                      </div>
                      <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                        {isDeliveryOrder
                          ? (customerPin
                            ? `Pinned at ${Number(customerPin.latitude).toFixed(6)}, ${Number(customerPin.longitude).toFixed(6)}`
                            : 'No pin selected yet. Tap the map or use your current location.')
                          : 'Switch order method to Delivery if you want to save a location pin.'}
                      </div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        <DeliveryPinMap
                          pin={customerPin}
                          onPinChange={setCustomerPin}
                          disabled={!isDeliveryOrder}
                        />
                        {pinLocationError && <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</p>}
                      </div>
                    </div>
                  )}
                </section>

                <section style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
                  <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 14, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{isFnbMode ? 'Cart Summary' : 'Order Summary'}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {isFnbMode ? 'Update quantities, then refresh the quote before checkout.' : 'Keep the total visible while editing.'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ maxHeight: isDesktopCheckout ? 320 : 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 16, padding: 10, marginTop: 12, background: '#fbfeff' }}>
                      {cart.length === 0 && (
                        <p style={{ margin: 0, color: '#64748b' }}>
                          {isFnbMode ? 'Your menu cart is empty. Add items from Menu Highlights to start an order.' : 'Cart is empty.'}
                        </p>
                      )}
                      {cart.map((line) => (
                        <div key={line.cart_line_id || line.item_id} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 78px 96px', gap: 10, alignItems: 'center', marginBottom: 10, padding: 10, border: '1px solid #e6edf2', borderRadius: 14, background: '#fff' }}>
                          <div style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                              <img
                                src={withAssetOrigin(line.image_url)}
                                alt={line.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={() => {
                                  const normalizedLineItemId = Number(line.item_id);
                                  if (!Number.isFinite(normalizedLineItemId)) return;
                                  setCartImageErrors((prev) => {
                                    const next = new Set(prev);
                                    next.add(normalizedLineItemId);
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: 6 }}>No Image</span>
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              Unit: {money(line.price)} {line.unit_of_measure ? `- ${line.unit_of_measure}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#0f766e', fontWeight: 700 }}>
                              {line.category === 'service' ? 'Bookable appointment' : `${activeOrderMethodLabel} order item`}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCartItem(line.cart_line_id || line.item_id)}
                              style={{ marginTop: 6, border: 'none', background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Remove
                            </button>
                          </div>
                          <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateQty(line.cart_line_id || line.item_id, e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 10px', background: '#fff', fontWeight: 700 }} />
                          <span style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{money(line.quantity * line.price)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Items Subtotal</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.subtotal_amount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>{totalsForDisplay.service_fee_label} (1%)</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.service_fee_amount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Delivery Fee</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.delivery_fee)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Vatable Sales</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vatable_sales)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>VAT Amount</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_amount)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>VAT-Exempt Sales</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_exempt_sales)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, opacity: .95 }}>Zero-Rated Sales</span>
                          <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.zero_rated_sales)}</strong>
                        </div>
                        <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.24)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14, fontWeight: 800 }}>Total Amount Due</span>
                          <strong style={{ fontSize: 22 }}>{money(totalsForDisplay.total_amount)}</strong>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, opacity: .95 }}>
                        {hasServiceCart
                          ? 'Service booking totals are estimated from the selected service. Complete appointment details to book.'
                          : quoteResult
                            ? (quoteNeedsRefresh ? 'Displayed totals are stale. Click Quote again to re-sync and unlock checkout.' : 'Totals are synced from the latest quote and checkout is enabled.')
                            : 'No quote yet. Click Quote to unlock checkout.'}
                      </div>
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {!hasServiceCart && checkoutPermitted && accessCapabilities.quote !== false && (
                          <button type="button" onClick={handleQuote} disabled={!selectedStore || cart.length === 0} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.55)', background: '#ffffff', color: '#0f766e', padding: '11px 12px', fontWeight: 800 }}>{isFnbMode ? 'Refresh Quote' : 'Quote'}</button>
                        )}
                        <button type="button" onClick={handleCheckout} disabled={!checkoutAllowed} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.2)', background: '#0b3d3a', color: '#fff', padding: '11px 12px', fontWeight: 800 }}>{checkoutLoading ? (hasServiceCart ? 'Reserving...' : 'Processing...') : (hasServiceCart ? 'Submit Booking' : (isFnbMode ? 'Place Order' : 'Checkout'))}</button>
                      </div>
                    </div>
                    {hasStockViolation && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>
                        Cannot checkout: one or more lines exceed current stock.
                      </p>
                    )}
                    {!hasServiceCart && !quoteResult && cart.length > 0 && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Quote is required before checkout.
                      </p>
                    )}
                    {!hasServiceCart && quoteResult && quoteNeedsRefresh && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Cart changed after quote. Click Quote again to proceed.
                      </p>
                    )}
                    {hasMixedServiceCart && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Services must be booked separately from regular product orders.
                      </p>
                    )}
                    {hasServiceCart && !serviceAppointmentAt && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
                        Choose an appointment date and time before booking.
                      </p>
                    )}
                    {quoteError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
                    {!hasServiceCart && quoteResult && (
                      <p style={{ marginTop: 10, fontSize: 13, color: '#0f766e' }}>
                        Quote synced. Total due: {money(totalsForDisplay.total_amount)}
                      </p>
                    )}
                    {checkoutError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
                    {(checkoutResult?.tracking_pin || checkoutResult?.booking?.public_reference || (Array.isArray(checkoutResult?.bookings) && checkoutResult.bookings[0]?.public_reference)) && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8, border: '1px solid #99f6e4', background: '#ecfeff', borderRadius: 12, padding: '10px 12px' }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#0f766e' }}>
                          {checkoutResult?.booking || checkoutResult?.bookings ? `${Array.isArray(checkoutResult.bookings) && checkoutResult.bookings.length > 1 ? 'Bookings' : 'Booking'} created.` : 'Order placed.'}
                        </p>
                        {Array.isArray(checkoutResult.bookings) && checkoutResult.bookings.length > 1 ? (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <strong style={{ fontSize: 12, color: '#0f766e' }}>Booking references</strong>
                            {checkoutResult.bookings.map((booking, index) => (
                              <div key={booking.public_reference || booking.booking_id || index} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#0f766e' }}>
                                <span>{checkoutResult.cart_lines?.[index]?.variantName || checkoutResult.cart_lines?.[index]?.name || `Booking ${index + 1}`}</span>
                                <strong>{booking.public_reference}</strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: 13, color: '#0f766e' }}>
                            Reference: <strong>{checkoutResult.booking?.public_reference || checkoutResult.bookings?.[0]?.public_reference || checkoutResult.tracking_pin}</strong>
                          </p>
                        )}
                        {checkoutResult?.account_action?.show_signup === true && (
                          <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                            You can sign in or register to save this latest transaction to your account.
                          </p>
                        )}
                        {Array.isArray(checkoutResult?.payments) && checkoutResult.payments.some((payment) => payment.checkout_url) ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {checkoutResult.payments.filter((payment) => payment.checkout_url).map((payment, index) => (
                              <a key={payment.public_reference || payment.checkout_url} href={payment.checkout_url} target="_blank" rel="noreferrer" style={{ borderRadius: 10, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800, textDecoration: 'none', fontSize: 12 }}>
                                Pay {payment.public_reference || `Booking ${index + 1}`}
                              </a>
                            ))}
                          </div>
                        ) : checkoutResult?.payment?.checkout_url && (
                          <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800, textDecoration: 'none' }}>
                            Pay Now
                          </a>
                        )}
                        {checkoutResult?.account_action?.show_signup !== true && (
                          <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                            This ticket can be kept as an image for your gallery.
                          </p>
                        )}
                        <button type="button" onClick={handleDownloadCheckoutImage} style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 800 }}>
                          Download Image
                        </button>
                      </div>
                    )}
                    <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>{DGFY_ACRONYM}</p>
                  </div>
                </section>
              </div>
            )}

            {checkoutTab === 'reservation' && isFnbMode && (
              <Suspense fallback={<div style={{ color: '#64748b', fontSize: 13 }}>Loading reservation form...</div>}>
                <FnbReservationPanel
                  form={fnbReservationForm}
                  setForm={setFnbReservationForm}
                  loading={fnbReservationLoading}
                  selectedStore={selectedStore}
                  error={fnbReservationError}
                  result={fnbReservationResult}
                  isDesktopCheckout={isDesktopCheckout}
                  onSubmit={handleFnbReservationRequest}
                />
              </Suspense>
            )}

            {checkoutTab === 'track' && (
              <div style={{ maxWidth: 560, border: '1px solid #d9e4e8', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>Track Order</h3>
                <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>Enter a tracking PIN to check the latest status without leaving the sheet.</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={trackingPinInput} onChange={(e) => setTrackingPinInput(e.target.value.toUpperCase())} placeholder="SK-XXXXXX" style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px' }} />
                  <button type="button" onClick={handleTrack} disabled={!selectedStore} style={{ borderRadius: 12, border: '1px solid #334155', background: '#334155', color: '#fff', padding: '11px 16px', fontWeight: 700 }}>Track</button>
                </div>
                {trackingError && <p style={{ color: '#b91c1c', marginTop: 10 }}>{trackingError}</p>}
                {trackingResult && <div style={{ marginTop: 10, fontSize: 14, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>Status: <strong>{trackingResult.status_label || trackingResult.status}</strong></div>}
              </div>
            )}

            {checkoutTab === 'account' && (
              <div style={{ display: 'grid', gap: 14, maxWidth: 860 }}>
                <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>My Account</h3>
                      <p style={{ marginTop: 0, color: '#64748b', fontSize: 13 }}>Bookings, orders, tickets, receipts, and the latest linked transaction.</p>
                    </div>
                    <button type="button" onClick={handleLoadAccountPanel} style={{ borderRadius: 12, border: '1px solid #334155', background: '#334155', color: '#fff', padding: '10px 14px', fontWeight: 700 }}>Refresh</button>
                  </div>
                  {accountPanel.loading && <p style={{ color: '#64748b' }}>Loading account...</p>}
                  {accountPanel.error && <p style={{ color: '#b91c1c' }}>{accountPanel.error}</p>}
                  {accountPanel.me && (
                    <div style={{ marginTop: 8, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '10px 12px' }}>
                      <strong>{accountPanel.me.name || accountPanel.me.email || 'Customer'}</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{accountPanel.me.email || accountPanel.me.phone || 'Signed in'}</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 12 }}>
                  <section style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#fff' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>My Bookings</h4>
                    {accountPanel.bookings.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No saved bookings yet.</p>}
                    {accountPanel.bookings.map((booking) => (
                      <div key={booking.booking_id} style={{ borderTop: '1px solid #e2e8f0', padding: '9px 0', fontSize: 13 }}>
                        <strong>{booking.public_reference}</strong>
                        <div style={{ color: '#475569' }}>{booking.service_name || booking.service?.name || 'Service'} Â· {booking.status}</div>
                        <div style={{ color: '#64748b' }}>{booking.start_at ? formatTicketDate(booking.start_at) : 'Unscheduled'} Â· {booking.payment_status}</div>
                      </div>
                    ))}
                  </section>
                  <section style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#fff' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>My Orders & Tickets</h4>
                    {accountPanel.orders.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No saved orders yet.</p>}
                    {accountPanel.orders.map((order) => (
                      <div key={order.pos_transaction_id || order.tracking_pin} style={{ borderTop: '1px solid #e2e8f0', padding: '9px 0', fontSize: 13 }}>
                        <strong>{order.tracking_pin || order.receipt_number || 'Order'}</strong>
                        <div style={{ color: '#475569' }}>{order.status_label || order.status || 'Placed'} Â· {money(order.total_amount)}</div>
                        <div style={{ color: '#64748b' }}>{order.created_at ? formatTicketDate(order.created_at) : 'Recent transaction'}</div>
                      </div>
                    ))}
                  </section>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  )}
    </main >
  );
}
