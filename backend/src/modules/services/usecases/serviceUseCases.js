import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import dbStore from '../../../utils/dbStore.js';
import { normalizeIntakeFormSchema } from '../../shared/utils/intakeFormSchema.js';
import {
    CUSTOMER_ACCESS_SETTING_KEYS,
    applyInventoryDisplayPolicy,
    buildCustomerAccessModeBlockedError,
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../../shared/utils/customerAccessPolicy.js';
import { isDateWithinStorefrontBusinessHours } from '../../shared/utils/storefrontBusinessHours.js';

const BOOKING_STATUSES = Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show']);
const PAYMENT_POLICIES = Object.freeze(['customer_choice', 'prepaid_required', 'postpaid_only', 'deposit_allowed']);
const PAYMENT_TIMINGS = Object.freeze(['prepaid', 'postpaid', 'deposit']);
const WAITLIST_STATUSES = Object.freeze(['waiting', 'notified', 'booked', 'expired', 'cancelled']);
const REMINDER_STATUSES = Object.freeze(['pending', 'sent', 'failed', 'skipped']);
const SERVICE_STOREFRONT_SETTING_KEYS = Object.freeze([
    ...CUSTOMER_ACCESS_SETTING_KEYS,
    'storefront_hours'
]);
const CLAIM_TOKEN_TTL_MS = 30 * 60 * 1000;
const BOOKING_HOLD_TTL_MS = 10 * 60 * 1000;
const MAX_REFERENCE_ATTEMPTS = 20;
const BOOKING_STATUS_TRANSITIONS = Object.freeze({
    requested: ['confirmed', 'cancelled', 'no_show'],
    confirmed: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['in_service', 'cancelled', 'no_show'],
    in_service: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    no_show: ['confirmed']
});

const toPositiveInt = (value, fallback = null) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const trim = (value, maxLength = 255) => String(value || '').trim().slice(0, maxLength);
const normalizeEmail = (value) => trim(value, 255).toLowerCase();
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalizeIdempotencyKey = (value) => {
    const normalized = trim(value, 120);
    return normalized.length >= 8 ? normalized : '';
};
const normalizeHoldToken = (value) => trim(value, 80);
const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashRequestPayload = (payload = {}) => crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');

const generateHoldToken = () => `hold_${crypto.randomBytes(24).toString('hex')}`;

const normalizeJsonValue = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }
    return value;
};

const mapError = (error, fallbackMessage) => (
    isDomainError(error)
        ? error
        : new DomainError(DomainErrorCode.INTERNAL_ERROR, error?.message || fallbackMessage, { statusCode: 500 })
);
const parseSettingValue = (rawValue, fallback = null) => {
    if (rawValue == null) return fallback;
    if (typeof rawValue !== 'string') return rawValue;
    try {
        return JSON.parse(rawValue);
    } catch {
        return rawValue;
    }
};
const mapSettingsRows = (rows = []) => {
    const result = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        result[row.setting_key] = {
            ...row,
            value: parseSettingValue(row.setting_value)
        };
    });
    return result;
};
const currentTenantAccessContext = () => {
    const store = dbStore.getStore?.() || {};
    return {
        tenantId: store.tenantId,
        tenantToken: store.tenantToken,
        tenantName: store.tenantName
    };
};
const isCustomerAccessEnabledForCurrentTenant = () => (
    isCustomerAccessModesEnabled(currentTenantAccessContext())
);
const loadServiceStorefrontSettings = async (serviceRepository, options = {}) => {
    if (typeof serviceRepository?.getSettingsByKeys !== 'function') {
        return {};
    }
    const rows = await serviceRepository.getSettingsByKeys(SERVICE_STOREFRONT_SETTING_KEYS, options);
    return mapSettingsRows(rows);
};
const resolveServiceAccessPolicy = async (serviceRepository, options = {}, settings = null) => {
    const resolvedSettings = settings || await loadServiceStorefrontSettings(serviceRepository, options);
    return resolveAccessPolicyFromSettings(resolvedSettings, { featureEnabled: isCustomerAccessEnabledForCurrentTenant() });
};
const assertServiceStorefrontActionAllowed = ({ action, capability, accessPolicy }) => {
    if (!isCustomerAccessEnabledForCurrentTenant()) return;
    if (accessPolicy?.access_capabilities?.[capability] === true) return;
    throw buildCustomerAccessModeBlockedError({ action, accessPolicy });
};

const parseDate = (value, fieldName) => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `${fieldName} must be a valid ISO date-time`,
            { statusCode: 422 }
        );
    }
    return parsed;
};

const setIfProvided = (target, payload, key, resolver, includeDefaults) => {
    if (includeDefaults || payload[key] !== undefined) {
        target[key] = resolver(payload[key]);
    }
};
const assertServiceBookingWithinStorefrontHours = ({ startAt, settings, action }) => {
    if (!(startAt instanceof Date) || !Number.isFinite(startAt.getTime())) return;
    if (isDateWithinStorefrontBusinessHours(startAt, settings?.storefront_hours?.value)) return;
    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Service booking is outside store business hours',
        {
            statusCode: 422,
            details: {
                reason_code: 'OUTSIDE_STOREFRONT_BUSINESS_HOURS',
                action
            }
        }
    );
};

const serviceDetailsPayload = (payload = {}, { includeDefaults = true } = {}) => {
    const details = {};
    if (includeDefaults || payload.service_category !== undefined || payload.category_label !== undefined) {
        details.service_category = trim(payload.service_category || payload.category_label, 120) || null;
    }
    setIfProvided(details, payload, 'duration_minutes', (value) => toPositiveInt(value, 60), includeDefaults);
    setIfProvided(details, payload, 'buffer_before_minutes', (value) => toNonNegativeInt(value, 0), includeDefaults);
    setIfProvided(details, payload, 'buffer_after_minutes', (value) => toNonNegativeInt(value, 0), includeDefaults);
    setIfProvided(details, payload, 'lead_time_minutes', (value) => toNonNegativeInt(value, 0), includeDefaults);
    setIfProvided(details, payload, 'cancellation_window_hours', (value) => toNonNegativeInt(value, 24), includeDefaults);
    setIfProvided(details, payload, 'bookable', (value) => value !== false, includeDefaults);
    setIfProvided(details, payload, 'visible_in_storefront', (value) => value !== false, includeDefaults);
    setIfProvided(details, payload, 'visible_in_pos', (value) => value !== false, includeDefaults);
    setIfProvided(details, payload, 'payment_policy', (value) => (
        PAYMENT_POLICIES.includes(String(value || '').trim()) ? String(value).trim() : 'customer_choice'
    ), includeDefaults);
    setIfProvided(details, payload, 'service_area_type', (value) => (
        ['in_store', 'customer_location', 'online', 'hybrid'].includes(String(value || '').trim()) ? String(value).trim() : 'in_store'
    ), includeDefaults);
    setIfProvided(details, payload, 'intake_form_schema', (value) => normalizeIntakeFormSchema(value), includeDefaults);
    setIfProvided(details, payload, 'client_notes_template', (value) => trim(value, 2000) || null, includeDefaults);
    return details;
};

const serializeCatalogItem = (row = {}, options = {}) => {
    const item = toPlain(row) || {};
    const detail = item.serviceDetail || item.service_detail || {};
    const payload = {
        item_id: item.item_id,
        sku_code: item.sku_code,
        name: item.name,
        description: item.description,
        category: 'service',
        unit_of_measure: item.unit_of_measure || 'service',
        default_sale_price: item.default_sale_price,
        vat_type: item.vat_type || 'vatable',
        status: item.status,
        is_available: detail.bookable !== false,
        availability_status: detail.bookable === false ? 'not_bookable' : 'bookable',
        inventory_display: applyInventoryDisplayPolicy(
            {
                category: 'service',
                is_available: detail.bookable !== false,
                availability_status: detail.bookable === false ? 'not_bookable' : 'bookable',
                current_stock: 0
            },
            options.accessPolicy || {}
        ),
        service_detail: {
            service_detail_id: detail.service_detail_id,
            service_category: detail.service_category || null,
            duration_minutes: toPositiveInt(detail.duration_minutes, 60),
            buffer_before_minutes: toNonNegativeInt(detail.buffer_before_minutes, 0),
            buffer_after_minutes: toNonNegativeInt(detail.buffer_after_minutes, 0),
            lead_time_minutes: toNonNegativeInt(detail.lead_time_minutes, 0),
            cancellation_window_hours: toNonNegativeInt(detail.cancellation_window_hours, 24),
            bookable: detail.bookable !== false,
            visible_in_storefront: detail.visible_in_storefront !== false,
            visible_in_pos: detail.visible_in_pos !== false,
            payment_policy: detail.payment_policy || 'customer_choice',
            service_area_type: detail.service_area_type || 'in_store',
            intake_form_schema: normalizeIntakeFormSchema(detail.intake_form_schema),
            client_notes_template: detail.client_notes_template || null
        }
    };
    if (options.publicSafe !== true) {
        payload.cost_per_unit = item.cost_per_unit;
    }
    return payload;
};

const bookingAmount = (row = {}) => round4(
    (row?.serviceItem?.default_sale_price ?? row?.service?.default_sale_price ?? 0)
    * Math.max(1, Number(row?.quantity || 1))
);

const bookingDurationMinutes = (row = {}, detail = null) => {
    const fromDetail = toPositiveInt(detail?.duration_minutes);
    if (fromDetail) return fromDetail;
    const start = new Date(row.start_at);
    const end = new Date(row.end_at);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
};

const serializeBookingHold = (hold = {}) => {
    const row = toPlain(hold) || {};
    return {
        hold_id: row.hold_id,
        hold_token: row.hold_token,
        service_item_id: row.service_item_id,
        provider_user_id: row.provider_user_id || null,
        resource_id: row.resource_id || null,
        location_id: row.location_id || null,
        quantity: Math.max(1, Number(row.quantity || 1)),
        start_at: row.start_at,
        end_at: row.end_at,
        expires_at: row.expires_at,
        status: row.status,
        source: row.source
    };
};

const serializeBooking = (booking = {}, { publicSafe = false } = {}) => {
    const row = toPlain(booking) || {};
    const item = row.serviceItem || null;
    const detail = row.serviceDetail || item?.serviceDetail || null;
    const payload = {
        booking_id: row.booking_id,
        public_reference: row.public_reference,
        service_item_id: row.service_item_id,
        service_name: item?.name || null,
        service_category: detail?.service_category || null,
        provider_user_id: row.provider_user_id || null,
        resource_id: row.resource_id || null,
        location_id: row.location_id || null,
        location: row.location || null,
        resource: row.resource || null,
        store_customer_id: row.store_customer_id || null,
        quantity: Math.max(1, Number(row.quantity || 1)),
        start_at: row.start_at,
        end_at: row.end_at,
        duration_minutes: bookingDurationMinutes(row, detail),
        status: row.status,
        payment_timing: row.payment_timing,
        payment_status: row.payment_status,
        payment_reference: row.payment_reference || null,
        payment_checkout_url: row.payment_checkout_url || null,
        pos_transaction_id: row.pos_transaction_id || null,
        total_amount: bookingAmount(row),
        source: row.source,
        notes: row.notes || null,
        intake_responses: normalizeJsonValue(row.intake_responses),
        cancellation_reason: row.cancellation_reason || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ticket: {
            type: 'booking_ticket',
            reference: row.public_reference,
            tracking_pin: row.public_reference,
            fiscal_label: row.payment_status === 'paid' ? 'Payment receipt available separately' : 'Booking ticket - not a fiscal receipt'
        },
        service: item ? {
            item_id: item.item_id,
            name: item.name,
            description: item.description || null,
            default_sale_price: item.default_sale_price,
            vat_type: item.vat_type || 'vatable',
            duration_minutes: detail?.duration_minutes || null
        } : null,
        pos_transaction: row.posTransaction || null
    };
    if (!publicSafe) {
        payload.customer_name = row.customer_name;
        payload.customer_email = row.customer_email || null;
        payload.customer_phone = row.customer_phone || null;
    }
    return payload;
};

const serializeAssignment = (assignment = {}) => {
    const row = toPlain(assignment) || {};
    return {
        assignment_id: row.assignment_id,
        item_id: row.item_id,
        user_id: row.user_id || null,
        resource_id: row.resource_id || null,
        location_id: row.location_id || null,
        is_active: row.is_active !== false,
        created_at: row.created_at,
        updated_at: row.updated_at,
        service: row.item ? {
            item_id: row.item.item_id,
            name: row.item.name,
            sku_code: row.item.sku_code || null
        } : null,
        provider: row.providerUser ? {
            user_id: row.providerUser.user_id,
            username: row.providerUser.username,
            email: row.providerUser.email
        } : null,
        resource: row.resource || null,
        location: row.location || null
    };
};

const serializeWaitlistEntry = (entry = {}) => {
    const row = toPlain(entry) || {};
    return {
        waitlist_entry_id: row.waitlist_entry_id,
        service_item_id: row.service_item_id,
        store_customer_id: row.store_customer_id || null,
        customer_name: row.customer_name,
        customer_email: row.customer_email || null,
        customer_phone: row.customer_phone || null,
        preferred_start_at: row.preferred_start_at || null,
        preferred_end_at: row.preferred_end_at || null,
        status: row.status,
        notes: row.notes || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        service: row.serviceItem ? {
            item_id: row.serviceItem.item_id,
            name: row.serviceItem.name,
            sku_code: row.serviceItem.sku_code || null,
            default_sale_price: row.serviceItem.default_sale_price
        } : null
    };
};

const serializeReminder = (reminder = {}) => {
    const row = toPlain(reminder) || {};
    const booking = row.booking || null;
    return {
        reminder_id: row.reminder_id,
        booking_id: row.booking_id,
        channel: row.channel,
        reminder_type: row.reminder_type,
        recipient: row.recipient,
        scheduled_for: row.scheduled_for,
        sent_at: row.sent_at || null,
        status: row.status,
        provider_message_id: row.provider_message_id || null,
        failure_reason: row.failure_reason || null,
        payload: row.payload || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        booking: booking ? serializeBooking(booking) : null
    };
};

const serializeClientSummary = (row = {}) => ({
    client_key: normalizeEmail(row.customer_email) || trim(row.customer_phone, 50) || trim(row.customer_name, 255),
    customer_name: row.customer_name,
    customer_email: row.customer_email || null,
    customer_phone: row.customer_phone || null,
    store_customer_id: row.store_customer_id || null,
    booking_count: row.booking_count,
    completed_count: row.completed_count,
    no_show_count: row.no_show_count,
    repeat_client: Number(row.booking_count || 0) > 1,
    no_show_rate: Number(row.booking_count || 0) > 0
        ? round4(Number(row.no_show_count || 0) / Number(row.booking_count || 1))
        : 0,
    last_booking_at: row.last_booking_at || null,
    last_service_name: row.last_service_name || null,
    total_spend: round4(row.total_spend)
});

const dateKey = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

const timeToMinutes = (value) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

const dayAvailabilityKeys = (date) => {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const day = date.getDay();
    return [String(day), names[day], names[day].slice(0, 3)];
};

const normalizeAvailabilitySlots = (rawSlots) => {
    if (!rawSlots) return [];
    const slots = Array.isArray(rawSlots) ? rawSlots : [rawSlots];
    return slots
        .map((slot) => {
            if (typeof slot === 'string') {
                const [start, end] = slot.split('-').map((part) => part.trim());
                return { start, end };
            }
            return slot;
        })
        .filter((slot) => slot && slot.closed !== true)
        .map((slot) => ({
            start: timeToMinutes(slot.start || slot.from || slot.open),
            end: timeToMinutes(slot.end || slot.to || slot.close)
        }))
        .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start);
};

const isWithinWeeklyAvailability = ({ startAt, endAt, weeklyAvailability }) => {
    if (!isPlainObject(weeklyAvailability) || Object.keys(weeklyAvailability).length === 0) return true;
    if (dateKey(startAt) !== dateKey(endAt)) return false;
    const rawSlots = dayAvailabilityKeys(startAt).map((key) => weeklyAvailability[key]).find((value) => value !== undefined);
    const slots = normalizeAvailabilitySlots(rawSlots);
    if (slots.length === 0) return false;
    const startMinutes = startAt.getHours() * 60 + startAt.getMinutes();
    const endMinutes = endAt.getHours() * 60 + endAt.getMinutes();
    return slots.some((slot) => startMinutes >= slot.start && endMinutes <= slot.end);
};

const isBlackedOut = ({ startAt, blackoutDates }) => {
    if (!Array.isArray(blackoutDates) || blackoutDates.length === 0) return false;
    const startKey = dateKey(startAt);
    return blackoutDates.some((entry) => dateKey(entry) === startKey || String(entry || '').trim().slice(0, 10) === startKey);
};

const generateReferenceCandidate = () => {
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `SV-${token}`;
};

const generateUniqueBookingReference = async (serviceRepository, options = {}) => {
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
        const candidate = generateReferenceCandidate();
        if (!(await serviceRepository.isBookingReferenceTaken(candidate, options))) {
            return candidate;
        }
    }
    throw new DomainError(
        DomainErrorCode.CONFLICT,
        'Unable to allocate booking reference. Please retry.',
        { statusCode: 409 }
    );
};

const hashClaimToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const buildGuestAccountAction = async ({
    serviceRepository,
    email,
    storeCustomer,
    options = {}
}) => {
    const authenticatedCustomerId = toPositiveInt(storeCustomer?.customer_id);
    if (authenticatedCustomerId) {
        return {
            storeCustomerId: authenticatedCustomerId,
            accountAction: {
                type: 'linked_authenticated',
                allow_image_download: true,
                show_signup: false,
                claim_token: null
            },
            claimTokenPayload: null
        };
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return {
            storeCustomerId: null,
            accountAction: {
                type: 'download_only_guest_no_email',
                allow_image_download: true,
                show_signup: false,
                claim_token: null
            },
            claimTokenPayload: null
        };
    }

    const existingCustomer = await serviceRepository.findStoreCustomerByEmail(normalizedEmail, options);
    if (existingCustomer?.customer_id) {
        return {
            storeCustomerId: null,
            accountAction: {
                type: 'existing_account_download_only',
                allow_image_download: true,
                show_signup: false,
                claim_token: null
            },
            claimTokenPayload: null
        };
    }

    const claimToken = crypto.randomBytes(24).toString('base64url');
    return {
        storeCustomerId: null,
        accountAction: {
            type: 'offer_signup',
            allow_image_download: true,
            show_signup: true,
            claim_token: claimToken,
            claim_token_expires_in_seconds: Math.floor(CLAIM_TOKEN_TTL_MS / 1000)
        },
        claimTokenPayload: {
            claim_token_hash: hashClaimToken(claimToken),
            claim_token_expires_at: new Date(Date.now() + CLAIM_TOKEN_TTL_MS)
        }
    };
};

const resolvePaymentTiming = ({ requestedTiming, paymentPolicy }) => {
    const requested = PAYMENT_TIMINGS.includes(String(requestedTiming || '').trim())
        ? String(requestedTiming).trim()
        : 'postpaid';
    if (paymentPolicy === 'prepaid_required') return 'prepaid';
    if (paymentPolicy === 'postpaid_only') return 'postpaid';
    if (paymentPolicy === 'deposit_allowed') {
        return requested === 'deposit' || requested === 'prepaid' ? requested : 'postpaid';
    }
    return requested;
};

const buildPaymentHandoff = ({ paymentTiming, bookingReference, amount }) => {
    if (paymentTiming === 'postpaid') {
        return {
            payment_status: 'unpaid',
            payment_reference: null,
            payment_checkout_url: null
        };
    }

    const configuredUrl = trim(process.env.PAYMONGO_SERVICE_CHECKOUT_URL || process.env.PAYMONGO_CHECKOUT_URL, 1000);
    const query = configuredUrl
        ? `?reference=${encodeURIComponent(bookingReference)}&amount=${encodeURIComponent(String(round4(amount)))}`
        : '';
    return {
        payment_status: paymentTiming === 'deposit' ? 'payment_pending' : 'payment_pending',
        payment_reference: `PAYMONGO:${bookingReference}`,
        payment_checkout_url: configuredUrl ? `${configuredUrl}${query}` : null
    };
};

const bookingPaymentResponse = (booking = {}, fallback = {}) => {
    const paymentTiming = booking.payment_timing || fallback.paymentTiming || 'postpaid';
    return {
        booking_id: booking.booking_id || null,
        public_reference: booking.public_reference || fallback.publicReference || null,
        payment_timing: paymentTiming,
        payment_status: booking.payment_status || fallback.paymentStatus || 'unpaid',
        checkout_url: booking.payment_checkout_url || fallback.checkoutUrl || null,
        provider: paymentTiming === 'postpaid' ? null : 'paymongo'
    };
};

const batchPaymentResponse = (bookings = [], payments = []) => {
    const paymentRows = payments.length > 0
        ? payments
        : bookings.map((booking) => bookingPaymentResponse(booking));
    const hasPayNow = paymentRows.some((payment) => payment.checkout_url);
    const hasPending = paymentRows.some((payment) => payment.payment_status === 'payment_pending');
    return {
        payment: {
            payment_timing: paymentRows.length === 1 ? paymentRows[0].payment_timing : 'multiple',
            payment_status: hasPending ? 'payment_pending' : 'unpaid',
            checkout_url: paymentRows.length === 1 ? paymentRows[0].checkout_url : null,
            provider: hasPayNow || hasPending ? 'paymongo' : null,
            payments_count: paymentRows.length
        },
        payments: paymentRows
    };
};

const bookingRequestHashPayload = ({ payload = {}, source = 'storefront', storeCustomer = null } = {}) => {
    const payloadWithoutIdempotency = { ...(payload || {}) };
    delete payloadWithoutIdempotency.idempotency_key;
    return {
        source,
        store_customer_id: storeCustomer?.customer_id || null,
        payload: payloadWithoutIdempotency
    };
};

const holdRequestHashPayload = ({ payload = {}, source = 'storefront', storeCustomer = null } = {}) => {
    const payloadWithoutIdempotency = { ...(payload || {}) };
    delete payloadWithoutIdempotency.idempotency_key;
    return {
        source,
        store_customer_id: storeCustomer?.customer_id || null,
        payload: payloadWithoutIdempotency
    };
};

const assertStorefrontIdempotency = ({ source, idempotencyKey }) => {
    if (source !== 'storefront') return;
    if (idempotencyKey) return;
    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'idempotency_key is required',
        { statusCode: 400 }
    );
};

const replayBookingsForIdempotency = async ({
    serviceRepository,
    idempotencyKey,
    requestHash,
    transaction
}) => {
    if (!idempotencyKey || typeof serviceRepository.findBookingsByIdempotencyKey !== 'function') return null;
    const existing = await serviceRepository.findBookingsByIdempotencyKey(idempotencyKey, {
        transaction,
        lock: true
    });
    if (existing.length === 0) return null;
    const existingHash = String(existing[0]?.request_hash || '');
    if (existingHash && existingHash === requestHash) {
        return existing;
    }
    throw new DomainError(
        DomainErrorCode.CONFLICT,
        'idempotency_key was already used with a different payload',
        { statusCode: 409 }
    );
};

export const buildListServiceCatalogUseCase = ({ serviceRepository }) => async ({ query = {}, storefrontOnly = false } = {}) => {
    try {
        const accessPolicy = storefrontOnly
            ? await resolveServiceAccessPolicy(serviceRepository)
            : null;
        if (storefrontOnly && isCustomerAccessEnabledForCurrentTenant() && accessPolicy.access_capabilities.catalog !== true) {
            return ok({
                services: [],
                access_policy: accessPolicy
            });
        }
        const rows = await serviceRepository.listServiceCatalog({
            search: query.search,
            storefrontOnly,
            posOnly: query.pos_only === true || query.pos_only === 'true',
            limit: query.limit,
            location_id: query.location_id
        });
        return ok({
            services: rows.map((row) => serializeCatalogItem(row, {
                publicSafe: storefrontOnly,
                accessPolicy: accessPolicy || {}
            })),
            ...(accessPolicy ? { access_policy: accessPolicy } : {})
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service catalog'));
    }
};

export const buildCreateServiceCatalogItemUseCase = ({ serviceRepository }) => async ({ payload = {} } = {}) => {
    if (!isPlainObject(payload)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'payload must be an object', { statusCode: 400 }));
    }

    const transaction = await serviceRepository.beginTransaction();
    try {
        const name = trim(payload.name, 255);
        if (!name) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'name is required', { statusCode: 422 });
        }
        const item = await serviceRepository.createServiceItem({
            sku_code: trim(payload.sku_code, 50) || null,
            name,
            category: 'service',
            product_type: null,
            product_folder: null,
            description: trim(payload.description, 4000) || null,
            current_stock: 0,
            max_capacity: toPositiveInt(payload.max_capacity, 1),
            unit_of_measure: trim(payload.unit_of_measure, 50) || 'service',
            cost_per_unit: payload.cost_per_unit == null ? null : round4(payload.cost_per_unit),
            default_sale_price: payload.default_sale_price == null ? 0 : round4(payload.default_sale_price),
            vat_type: ['vatable', 'vat_exempt', 'zero_rated'].includes(String(payload.vat_type || '').trim())
                ? String(payload.vat_type).trim()
                : 'vatable',
            fifo_enabled: false,
            status: 'active'
        }, { transaction });
        await serviceRepository.upsertServiceDetail(item.item_id, serviceDetailsPayload(payload), { transaction });
        const created = await serviceRepository.findServiceItemById(item.item_id, { transaction });
        await transaction.commit();
        return ok({ service: serializeCatalogItem(created) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service'));
    }
};

export const buildUpdateServiceCatalogItemUseCase = ({ serviceRepository }) => async ({ itemId, payload = {} } = {}) => {
    const normalizedItemId = toPositiveInt(itemId);
    if (!normalizedItemId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'item_id is required', { statusCode: 422 }));
    }

    const transaction = await serviceRepository.beginTransaction();
    try {
        const itemPayload = {};
        if (payload.name !== undefined) itemPayload.name = trim(payload.name, 255);
        if (payload.description !== undefined) itemPayload.description = trim(payload.description, 4000) || null;
        if (payload.sku_code !== undefined) itemPayload.sku_code = trim(payload.sku_code, 50) || null;
        if (payload.default_sale_price !== undefined) itemPayload.default_sale_price = round4(payload.default_sale_price);
        if (payload.cost_per_unit !== undefined) itemPayload.cost_per_unit = payload.cost_per_unit == null ? null : round4(payload.cost_per_unit);
        if (payload.vat_type !== undefined && ['vatable', 'vat_exempt', 'zero_rated'].includes(String(payload.vat_type).trim())) {
            itemPayload.vat_type = String(payload.vat_type).trim();
        }
        if (payload.status !== undefined && ['active', 'inactive'].includes(String(payload.status).trim())) {
            itemPayload.status = String(payload.status).trim();
        }
        itemPayload.category = 'service';
        itemPayload.product_type = null;
        itemPayload.current_stock = 0;
        itemPayload.fifo_enabled = false;

        const updated = await serviceRepository.updateServiceItem(normalizedItemId, itemPayload, { transaction, lock: true });
        if (!updated) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service item not found', { statusCode: 404 });
        }
        await serviceRepository.upsertServiceDetail(normalizedItemId, serviceDetailsPayload(payload, { includeDefaults: false }), { transaction, lock: true });
        const service = await serviceRepository.findServiceItemById(normalizedItemId, { transaction });
        await transaction.commit();
        return ok({ service: serializeCatalogItem(service) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to update service'));
    }
};

export const buildListServiceResourcesUseCase = ({ serviceRepository }) => async ({ query = {} } = {}) => {
    try {
        const resources = await serviceRepository.listResources({
            includeInactive: query.include_inactive === true || query.include_inactive === 'true'
        });
        return ok({ resources });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service resources'));
    }
};

export const buildCreateServiceResourceUseCase = ({ serviceRepository }) => async ({ payload = {} } = {}) => {
    try {
        const name = trim(payload.name, 255);
        if (!name) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'name is required', { statusCode: 422 });
        }
        const resource = await serviceRepository.createResource({
            name,
            resource_type: ['provider', 'room', 'equipment', 'vehicle', 'station'].includes(String(payload.resource_type || '').trim())
                ? String(payload.resource_type).trim()
                : 'provider',
            location_id: toPositiveInt(payload.location_id),
            capacity: toPositiveInt(payload.capacity, 1),
            is_active: payload.is_active !== false,
            weekly_availability: isPlainObject(payload.weekly_availability) ? payload.weekly_availability : null,
            blackout_dates: Array.isArray(payload.blackout_dates) ? payload.blackout_dates : null
        });
        return ok({ resource });
    } catch (error) {
        return fail(mapError(error, 'Failed to create service resource'));
    }
};

export const buildListServiceAssignmentsUseCase = ({ serviceRepository }) => async ({ query = {} } = {}) => {
    try {
        const assignments = await serviceRepository.listAssignments({
            includeInactive: query.include_inactive === true || query.include_inactive === 'true',
            itemId: toPositiveInt(query.item_id)
        });
        return ok({ assignments: assignments.map(serializeAssignment) });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service assignments'));
    }
};

export const buildCreateServiceAssignmentUseCase = ({ serviceRepository }) => async ({ payload = {} } = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        const itemId = toPositiveInt(payload.item_id || payload.service_item_id);
        if (!itemId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'item_id is required', { statusCode: 422 });
        }
        const service = await serviceRepository.findServiceItemById(itemId, { transaction });
        if (!service) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service item not found', { statusCode: 404 });
        }
        const resourceId = toPositiveInt(payload.resource_id);
        if (resourceId) {
            const resource = await serviceRepository.findResourceById(resourceId, { transaction });
            if (!resource || resource.is_active === false) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Selected service resource is not active or does not exist', { statusCode: 404 });
            }
        }
        const userId = toPositiveInt(payload.user_id);
        const locationId = toPositiveInt(payload.location_id);
        if (!userId && !resourceId && !locationId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'user_id, resource_id, or location_id is required', { statusCode: 422 });
        }
        const assignment = await serviceRepository.createAssignment({
            item_id: itemId,
            user_id: userId,
            resource_id: resourceId,
            location_id: locationId,
            is_active: payload.is_active !== false
        }, { transaction });
        await transaction.commit();
        const hydrated = await serviceRepository.listAssignments({ itemId, includeInactive: true });
        const created = hydrated.find((row) => Number(row.assignment_id) === Number(assignment.assignment_id)) || assignment;
        return ok({ assignment: serializeAssignment(created) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service assignment'));
    }
};

export const buildUpdateServiceAssignmentUseCase = ({ serviceRepository }) => async ({ assignmentId, payload = {} } = {}) => {
    const normalizedAssignmentId = toPositiveInt(assignmentId);
    if (!normalizedAssignmentId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'assignment_id is required', { statusCode: 422 }));
    }
    const transaction = await serviceRepository.beginTransaction();
    try {
        const updated = await serviceRepository.updateAssignmentById(normalizedAssignmentId, {
            is_active: payload.is_active !== false
        }, { transaction, lock: true });
        if (!updated) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service assignment not found', { statusCode: 404 });
        }
        await transaction.commit();
        return ok({ assignment: serializeAssignment(updated) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to update service assignment'));
    }
};

const intervalsOverlap = (leftStart, leftEnd, rightStart, rightEnd) => (
    leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime()
);

const bookingQuantity = (booking = {}) => Math.max(1, Number(booking.quantity || 1));
const bookingLineAmount = (booking = {}) => round4(Number(booking?.serviceItem?.default_sale_price || 0) * bookingQuantity(booking));

const pendingBookingConflicts = ({
    providerUserId,
    resourceId,
    locationId,
    startAt,
    endAt,
    pendingRequests = []
}) => pendingRequests.filter((booking) => {
    if (!intervalsOverlap(startAt, endAt, booking.startAt, booking.endAt)) return false;
    if (providerUserId && Number(booking.provider_user_id) === Number(providerUserId)) return true;
    if (resourceId && Number(booking.resource_id) === Number(resourceId)) return true;
    if (locationId && !providerUserId && !resourceId && Number(booking.location_id) === Number(locationId)) return true;
    return false;
});

const parseAvailabilityDate = (value) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'date must use YYYY-MM-DD format', { statusCode: 422 });
    }
    const parsed = new Date(`${raw}T00:00:00`);
    const parsedKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    if (!Number.isFinite(parsed.getTime()) || parsedKey !== raw) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'date must be a valid calendar date', { statusCode: 422 });
    }
    return parsed;
};

const formatLocalDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addMinutes = (date, minutes) => new Date(date.getTime() + (minutes * 60 * 1000));

const startOfDay = (date) => {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
};

const buildAvailabilityStartCandidates = ({
    date,
    durationMinutes,
    intervalMinutes,
    leadTimeMinutes,
    weeklyAvailability = null
}) => {
    const dayStart = startOfDay(date);
    const dayEnd = addMinutes(dayStart, 24 * 60);
    const earliest = new Date(Date.now() + (toNonNegativeInt(leadTimeMinutes, 0) * 60 * 1000));
    const hasAvailabilityRules = isPlainObject(weeklyAvailability) && Object.keys(weeklyAvailability).length > 0;
    const rawSlots = hasAvailabilityRules
        ? dayAvailabilityKeys(date).map((key) => weeklyAvailability[key]).find((value) => value !== undefined)
        : null;
    const availabilityRanges = hasAvailabilityRules
        ? normalizeAvailabilitySlots(rawSlots)
        : [{ start: 9 * 60, end: 17 * 60 }];
    const candidates = [];
    availabilityRanges.forEach((range) => {
        const rangeStart = addMinutes(dayStart, range.start);
        const rangeEnd = addMinutes(dayStart, range.end);
        for (let cursor = rangeStart; cursor.getTime() + (durationMinutes * 60 * 1000) <= rangeEnd.getTime(); cursor = addMinutes(cursor, intervalMinutes)) {
            if (cursor.getTime() < dayStart.getTime() || cursor.getTime() >= dayEnd.getTime()) continue;
            if (cursor.getTime() < earliest.getTime()) continue;
            candidates.push(new Date(cursor));
        }
    });
    if (candidates.length === 0 && !hasAvailabilityRules) {
        for (let cursor = addMinutes(dayStart, 9 * 60); cursor.getTime() + (durationMinutes * 60 * 1000) <= addMinutes(dayStart, 17 * 60).getTime(); cursor = addMinutes(cursor, intervalMinutes)) {
            if (cursor.getTime() >= earliest.getTime() && cursor.getTime() < dayEnd.getTime()) candidates.push(new Date(cursor));
        }
    }
    return candidates;
};

const uniqueCandidateKey = (candidate = {}) => [
    candidate.capacityAnchor,
    candidate.providerUserId || '',
    candidate.resourceId || '',
    candidate.locationId || ''
].join(':');

const buildCapacityCandidate = ({ assignment = {}, resource = null, requested = {} } = {}) => {
    const resourceId = toPositiveInt(resource?.resource_id || assignment.resource_id);
    const providerUserId = toPositiveInt(requested.providerUserId || assignment.user_id);
    const locationId = toPositiveInt(requested.locationId || resource?.location_id || assignment.location_id);
    if (resourceId) {
        return {
            capacityAnchor: 'resource',
            resourceId,
            resourceName: resource?.name || null,
            providerUserId: toPositiveInt(assignment.user_id),
            locationId,
            capacity: toPositiveInt(resource?.capacity, 1),
            weeklyAvailability: resource?.weekly_availability || null,
            blackoutDates: resource?.blackout_dates || []
        };
    }
    if (providerUserId) {
        return {
            capacityAnchor: 'provider',
            resourceId: null,
            resourceName: null,
            providerUserId,
            locationId,
            capacity: 1,
            weeklyAvailability: null,
            blackoutDates: []
        };
    }
    if (locationId) {
        return {
            capacityAnchor: 'location',
            resourceId: null,
            resourceName: null,
            providerUserId: null,
            locationId,
            capacity: 1,
            weeklyAvailability: null,
            blackoutDates: []
        };
    }
    return {
        capacityAnchor: 'unanchored',
        resourceId: null,
        resourceName: null,
        providerUserId: null,
        locationId: null,
        capacity: 1,
        weeklyAvailability: null,
        blackoutDates: []
    };
};

const loadAvailabilityCandidates = async ({
    serviceRepository,
    assignments = [],
    requestedResourceId,
    requestedProviderUserId,
    requestedLocationId
}) => {
    const requested = {
        providerUserId: requestedProviderUserId,
        locationId: requestedLocationId
    };
    if (requestedResourceId) {
        const resource = await serviceRepository.findResourceById(requestedResourceId);
        if (!resource || resource.is_active === false) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Selected service resource is not active or does not exist', { statusCode: 404 });
        }
        if (requestedLocationId && resource.location_id && Number(resource.location_id) !== Number(requestedLocationId)) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'Selected resource does not belong to the selected location', { statusCode: 409 });
        }
        return [buildCapacityCandidate({ resource, requested })];
    }

    const resourceAssignments = assignments.filter((assignment) => toPositiveInt(assignment.resource_id));
    if (resourceAssignments.length > 0) {
        const candidates = [];
        const seen = new Set();
        for (const assignment of resourceAssignments) {
            if (requestedProviderUserId && assignment.user_id && Number(assignment.user_id) !== Number(requestedProviderUserId)) continue;
            if (requestedLocationId && assignment.location_id && Number(assignment.location_id) !== Number(requestedLocationId)) continue;
            const resourceId = toPositiveInt(assignment.resource_id);
            const resource = await serviceRepository.findResourceById(resourceId);
            if (!resource || resource.is_active === false) continue;
            if (requestedLocationId && resource.location_id && Number(resource.location_id) !== Number(requestedLocationId)) continue;
            const candidate = buildCapacityCandidate({ assignment, resource, requested });
            const key = uniqueCandidateKey(candidate);
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push(candidate);
        }
        return candidates;
    }

    const providerAssignments = assignments.filter((assignment) => toPositiveInt(assignment.user_id));
    if (providerAssignments.length > 0) {
        const candidates = providerAssignments
            .filter((assignment) => !requestedProviderUserId || Number(assignment.user_id) === Number(requestedProviderUserId))
            .filter((assignment) => !requestedLocationId || !assignment.location_id || Number(assignment.location_id) === Number(requestedLocationId))
            .map((assignment) => buildCapacityCandidate({ assignment, requested }));
        return [...new Map(candidates.map((candidate) => [uniqueCandidateKey(candidate), candidate])).values()];
    }

    return [buildCapacityCandidate({ requested })];
};

const sumCapacityUsage = (bookings = [], candidate = {}) => bookings
    .filter((booking) => {
        if (candidate.resourceId) return Number(booking.resource_id) === Number(candidate.resourceId);
        if (candidate.providerUserId) return Number(booking.provider_user_id) === Number(candidate.providerUserId);
        if (candidate.locationId) return Number(booking.location_id) === Number(candidate.locationId);
        return false;
    })
    .reduce((sum, booking) => sum + bookingQuantity(booking), 0);

const incrementReason = (target, reason) => {
    if (!reason) return;
    target[reason] = (target[reason] || 0) + 1;
};

const bookingWindowOverlaps = (booking = {}, startAt, endAt) => {
    const bookingStartAt = parseDate(booking.start_at, 'booking.start_at');
    const bookingEndAt = parseDate(booking.end_at, 'booking.end_at');
    return intervalsOverlap(startAt, endAt, bookingStartAt, bookingEndAt);
};

const summarizeAvailabilityDiagnostics = ({ reasonCounts = {}, candidates = [], requestedQuantity = 1 } = {}) => {
    const candidateCount = candidates.length;
    const maxCapacity = candidates.reduce((max, candidate) => Math.max(max, toPositiveInt(candidate.capacity, 1)), 0);
    const setupWarnings = [];
    if (candidateCount === 0) {
        setupWarnings.push('No active provider/resource/location assignment matched this service selection.');
    }
    if (requestedQuantity > 1 && maxCapacity < requestedQuantity) {
        setupWarnings.push('Quantity above 1 requires an active assigned service resource with enough capacity.');
    }
    const dominantReason = Object.entries(reasonCounts)
        .sort((left, right) => right[1] - left[1])
        .map(([reason]) => reason)[0] || null;
    return {
        candidate_count: candidateCount,
        max_candidate_capacity: maxCapacity,
        blocked_counts: reasonCounts,
        dominant_blocker: dominantReason,
        setup_warnings: setupWarnings
    };
};

const serializeAvailabilitySlot = ({ startAt, endAt, candidate, availableCapacity }) => ({
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    resource_id: candidate.resourceId || null,
    resource_name: candidate.resourceName || null,
    provider_user_id: candidate.providerUserId || null,
    location_id: candidate.locationId || null,
    capacity_anchor: candidate.capacityAnchor,
    available_capacity: availableCapacity
});

export const buildGetServiceAvailabilityUseCase = ({ serviceRepository }) => async ({ query = {}, storefrontOnly = false } = {}) => {
    try {
        if (storefrontOnly) {
            const accessPolicy = await resolveServiceAccessPolicy(serviceRepository);
            assertServiceStorefrontActionAllowed({
                action: 'service_availability',
                capability: 'catalog',
                accessPolicy
            });
        }

        const serviceItemId = toPositiveInt(query.service_item_id || query.item_id);
        if (!serviceItemId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'service_item_id is required', { statusCode: 422 });
        }
        const date = parseAvailabilityDate(query.date);
        const requestedQuantity = toPositiveInt(query.quantity, 1);
        const requestedResourceId = toPositiveInt(query.resource_id);
        const requestedProviderUserId = toPositiveInt(query.provider_user_id);
        const requestedLocationId = toPositiveInt(query.location_id);
        const intervalMinutes = Math.max(5, Math.min(240, toPositiveInt(query.slot_interval_minutes, 30)));

        const service = await serviceRepository.findServiceItemById(serviceItemId, {
            storefrontLocationId: storefrontOnly ? requestedLocationId : null
        });
        if (!service) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service is not available for booking', { statusCode: 404 });
        }
        const detail = service.serviceDetail || {};
        const durationMinutes = toPositiveInt(detail.duration_minutes, 60);
        const baseResponse = {
            service_item_id: service.item_id,
            date: formatLocalDateKey(date),
            quantity: requestedQuantity,
            duration_minutes: durationMinutes,
            slot_interval_minutes: intervalMinutes,
            capacity_contract: {
                resource_capacity_allows_quantity: true,
                provider_capacity: 1,
                location_capacity: 1,
                final_booking_validation_is_authoritative: true
            }
        };

        if (detail.bookable === false || round4(service.default_sale_price) <= 0) {
            const unavailableReason = detail.bookable === false ? 'service_not_bookable' : 'positive_sale_price_required';
            return ok({
                ...baseResponse,
                available: false,
                unavailable_reason: unavailableReason,
                slots: [],
                diagnostics: {
                    candidate_count: 0,
                    max_candidate_capacity: 0,
                    blocked_counts: { [unavailableReason]: 1 },
                    dominant_blocker: unavailableReason,
                    setup_warnings: []
                }
            });
        }

        const assignments = await serviceRepository.listActiveAssignmentsForService(service.item_id);
        const candidates = await loadAvailabilityCandidates({
            serviceRepository,
            assignments,
            requestedResourceId,
            requestedProviderUserId,
            requestedLocationId
        });
        const slotMap = new Map();
        const reasonCounts = {};
        let checkedSlots = 0;
        const bufferBeforeMinutes = toNonNegativeInt(detail.buffer_before_minutes, 0);
        const bufferAfterMinutes = toNonNegativeInt(detail.buffer_after_minutes, 0);
        const dayWindowStart = addMinutes(startOfDay(date), -bufferBeforeMinutes);
        const dayWindowEnd = addMinutes(startOfDay(date), (24 * 60) + durationMinutes + bufferAfterMinutes);
        const availabilityConflicts = typeof serviceRepository.findAvailabilityConflicts === 'function'
            ? await serviceRepository.findAvailabilityConflicts({
                serviceItemId: service.item_id,
                providerUserIds: candidates.map((candidate) => candidate.providerUserId).filter(Boolean),
                resourceIds: candidates.map((candidate) => candidate.resourceId).filter(Boolean),
                locationIds: candidates.map((candidate) => candidate.locationId).filter(Boolean),
                startAt: dayWindowStart,
                endAt: dayWindowEnd
            })
            : null;
        const availabilityHoldConflicts = typeof serviceRepository.findAvailabilityHoldConflicts === 'function'
            ? await serviceRepository.findAvailabilityHoldConflicts({
                providerUserIds: candidates.map((candidate) => candidate.providerUserId).filter(Boolean),
                resourceIds: candidates.map((candidate) => candidate.resourceId).filter(Boolean),
                locationIds: candidates.map((candidate) => candidate.locationId).filter(Boolean),
                startAt: dayWindowStart,
                endAt: dayWindowEnd
            })
            : null;
        for (const candidate of candidates) {
            const startCandidates = buildAvailabilityStartCandidates({
                date,
                durationMinutes,
                intervalMinutes,
                leadTimeMinutes: detail.lead_time_minutes,
                weeklyAvailability: candidate.weeklyAvailability
            });
            if (startCandidates.length === 0) {
                incrementReason(reasonCounts, 'outside_weekly_availability_or_lead_time');
            }
            for (const startAt of startCandidates) {
                const endAt = addMinutes(startAt, durationMinutes);
                checkedSlots += 1;
                if (requestedQuantity > candidate.capacity) {
                    incrementReason(reasonCounts, 'requested_quantity_exceeds_capacity_anchor');
                    continue;
                }
                if (isBlackedOut({ startAt, blackoutDates: candidate.blackoutDates })) {
                    incrementReason(reasonCounts, 'resource_blackout_date');
                    continue;
                }
                if (!isWithinWeeklyAvailability({ startAt, endAt, weeklyAvailability: candidate.weeklyAvailability })) {
                    incrementReason(reasonCounts, 'outside_weekly_availability');
                    continue;
                }
                const bufferStartAt = addMinutes(startAt, -bufferBeforeMinutes);
                const bufferEndAt = addMinutes(endAt, bufferAfterMinutes);
                const conflicts = Array.isArray(availabilityConflicts)
                    ? availabilityConflicts.filter((booking) => bookingWindowOverlaps(booking, bufferStartAt, bufferEndAt))
                    : await serviceRepository.findConflictingBookings({
                        providerUserId: candidate.providerUserId,
                        resourceId: candidate.resourceId,
                        locationId: candidate.locationId,
                        startAt: bufferStartAt,
                        endAt: bufferEndAt
                    });
                const holdConflicts = Array.isArray(availabilityHoldConflicts)
                    ? availabilityHoldConflicts.filter((hold) => bookingWindowOverlaps(hold, bufferStartAt, bufferEndAt))
                    : [];
                const usedCapacity = sumCapacityUsage([...conflicts, ...holdConflicts], candidate);
                const availableCapacity = Math.max(0, candidate.capacity - usedCapacity);
                if (availableCapacity < requestedQuantity) {
                    incrementReason(reasonCounts, 'overlapping_booking_capacity_full');
                    continue;
                }
                const slot = serializeAvailabilitySlot({ startAt, endAt, candidate, availableCapacity });
                const existing = slotMap.get(slot.start_at);
                if (!existing || Number(existing.available_capacity || 0) < availableCapacity) {
                    slotMap.set(slot.start_at, slot);
                }
            }
        }
        const slots = [...slotMap.values()]
            .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())
            .slice(0, 48);
        if (candidates.length === 0) incrementReason(reasonCounts, 'no_matching_capacity_anchor');
        const diagnostics = {
            ...summarizeAvailabilityDiagnostics({ reasonCounts, candidates, requestedQuantity }),
            checked_slot_candidates: checkedSlots,
            conflict_query_strategy: Array.isArray(availabilityConflicts) ? 'window_prefetch' : 'per_slot_fallback',
            hold_conflicts_included: Array.isArray(availabilityHoldConflicts),
            guidance: null
        };
        diagnostics.guidance = diagnostics.setup_warnings[0]
            || (slots.length === 0 && diagnostics.dominant_blocker === 'overlapping_booking_capacity_full'
                ? 'All matching capacity is already booked for the generated slots.'
                : null);
        const unavailableReason = slots.length > 0
            ? null
            : diagnostics.dominant_blocker || 'no_capacity_for_date_or_quantity';

        return ok({
            ...baseResponse,
            available: slots.length > 0,
            unavailable_reason: unavailableReason,
            diagnostics,
            slots
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to load service availability'));
    }
};

const createServiceBookingRecord = async ({
    serviceRepository,
    payload = {},
    source = 'admin',
    storeCustomer = null,
    transaction,
    pendingRequests = [],
    accountResolution: providedAccountResolution = null,
    idempotencyKey = null,
    requestHash = null,
    holdOnly = false
}) => {
        const serviceItemId = toPositiveInt(payload.service_item_id || payload.item_id);
        if (!serviceItemId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'service_item_id is required', { statusCode: 422 });
        }
        let locationId = toPositiveInt(payload.location_id);
        const service = await serviceRepository.findServiceItemById(serviceItemId, {
            transaction,
            lock: true,
            storefrontLocationId: String(source || '').trim() === 'storefront' ? locationId : null
        });
        if (!service) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service is not available for booking', { statusCode: 404 });
        }
        const detail = service.serviceDetail || {};
        if (detail.bookable === false) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'Service is not bookable', { statusCode: 409 });
        }
        const salePrice = round4(service.default_sale_price);
        if (['storefront', 'pos'].includes(String(source || '').trim()) && salePrice <= 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Service requires a positive sale price before storefront booking',
                { statusCode: 422 }
            );
        }
        const startAt = parseDate(payload.start_at || payload.scheduled_for, 'start_at');
        const leadTimeMs = toNonNegativeInt(detail.lead_time_minutes, 0) * 60 * 1000;
        if (leadTimeMs > 0 && startAt.getTime() < Date.now() + leadTimeMs) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                `Service requires at least ${detail.lead_time_minutes} minutes lead time`,
                { statusCode: 409 }
            );
        }
        const durationMinutes = toPositiveInt(payload.duration_minutes, toPositiveInt(detail.duration_minutes, 60));
        const endAt = payload.end_at
            ? parseDate(payload.end_at, 'end_at')
            : new Date(startAt.getTime() + durationMinutes * 60 * 1000);
        if (endAt.getTime() <= startAt.getTime()) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'end_at must be after start_at', { statusCode: 422 });
        }
        const bufferStartAt = new Date(startAt.getTime() - toNonNegativeInt(detail.buffer_before_minutes, 0) * 60 * 1000);
        const bufferEndAt = new Date(endAt.getTime() + toNonNegativeInt(detail.buffer_after_minutes, 0) * 60 * 1000);
        let providerUserId = toPositiveInt(payload.provider_user_id);
        let resourceId = toPositiveInt(payload.resource_id);
        const quantity = toPositiveInt(payload.quantity, 1);
        const holdToken = normalizeHoldToken(payload.hold_token);
        let activeHold = null;
        let replacementHold = null;
        if (holdToken) {
            if (typeof serviceRepository.findActiveHoldByToken !== 'function') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold validation is not available', { statusCode: 409 });
            }
            activeHold = await serviceRepository.findActiveHoldByToken(holdToken, { transaction, lock: true });
            if (!activeHold) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold is expired or unavailable', { statusCode: 409 });
            }
            if (Number(activeHold.service_item_id) !== Number(service.item_id)) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold does not match the requested service', { statusCode: 409 });
            }
            const activeHoldSource = String(activeHold.source || source || '').trim();
            if (activeHoldSource && activeHoldSource !== String(source || '').trim()) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold source does not match the requested booking source', { statusCode: 409 });
            }
            const activeHoldCustomerId = toPositiveInt(activeHold.store_customer_id);
            const requestCustomerId = toPositiveInt(storeCustomer?.customer_id);
            if (activeHoldCustomerId && requestCustomerId && activeHoldCustomerId !== requestCustomerId) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold belongs to a different customer account', { statusCode: 409 });
            }
            if (bookingQuantity(activeHold) < quantity) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold quantity is lower than the requested quantity', { statusCode: 409 });
            }
            if (
                parseDate(activeHold.start_at, 'hold.start_at').getTime() !== startAt.getTime()
                || parseDate(activeHold.end_at, 'hold.end_at').getTime() !== endAt.getTime()
            ) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold schedule does not match the requested schedule', { statusCode: 409 });
            }
            providerUserId = providerUserId || toPositiveInt(activeHold.provider_user_id);
            resourceId = resourceId || toPositiveInt(activeHold.resource_id);
            locationId = locationId || toPositiveInt(activeHold.location_id);
        }
        const replacementHoldToken = holdOnly ? normalizeHoldToken(payload.replace_hold_token) : null;
        if (replacementHoldToken) {
            if (typeof serviceRepository.findActiveHoldByToken !== 'function') {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Service hold replacement is not available', { statusCode: 409 });
            }
            replacementHold = await serviceRepository.findActiveHoldByToken(replacementHoldToken, { transaction, lock: true });
            if (replacementHold) {
                if (Number(replacementHold.service_item_id) !== Number(service.item_id)) {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'Replacement hold does not match the requested service', { statusCode: 409 });
                }
                const replacementSource = String(replacementHold.source || source || '').trim();
                if (replacementSource && replacementSource !== String(source || '').trim()) {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'Replacement hold source does not match the requested hold source', { statusCode: 409 });
                }
                const replacementCustomerId = toPositiveInt(replacementHold.store_customer_id);
                const requestCustomerId = toPositiveInt(storeCustomer?.customer_id);
                if (replacementCustomerId && requestCustomerId && replacementCustomerId !== requestCustomerId) {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'Replacement hold belongs to a different customer account', { statusCode: 409 });
                }
            }
        }
        if (
            String(source || '').trim() === 'storefront'
            && locationId
            && typeof serviceRepository.isServiceItemAvailableForStorefrontLocation === 'function'
        ) {
            const storefrontLocationAvailable = await serviceRepository.isServiceItemAvailableForStorefrontLocation(
                service.item_id,
                locationId,
                { transaction }
            );
            if (!storefrontLocationAvailable) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Service is not available at the selected location',
                    { statusCode: 404 }
                );
            }
        }
        const excludedHoldId = activeHold?.hold_id || replacementHold?.hold_id || null;

        let resource = null;
        if (resourceId) {
            resource = await serviceRepository.findResourceById(resourceId, { transaction, lock: true });
            if (!resource || resource.is_active === false) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Selected service resource is not active or does not exist', { statusCode: 404 });
            }
            if (locationId && resource.location_id && Number(resource.location_id) !== Number(locationId)) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Selected resource does not belong to the selected location', { statusCode: 409 });
            }
            if (isBlackedOut({ startAt, blackoutDates: resource.blackout_dates })) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Selected resource is blacked out for that date', { statusCode: 409 });
            }
            if (!isWithinWeeklyAvailability({ startAt, endAt, weeklyAvailability: resource.weekly_availability })) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Selected resource is outside its weekly availability', { statusCode: 409 });
            }
        }

        const assignments = await serviceRepository.listActiveAssignmentsForService(service.item_id, { transaction, lock: true });
        if (assignments.length > 0) {
            const hasMatchingAssignment = assignments.some((assignment) => {
                const providerMatches = !providerUserId || !assignment.user_id || Number(assignment.user_id) === Number(providerUserId);
                const resourceMatches = !resourceId || !assignment.resource_id || Number(assignment.resource_id) === Number(resourceId);
                const locationMatches = !locationId || !assignment.location_id || Number(assignment.location_id) === Number(locationId);
                return providerMatches && resourceMatches && locationMatches;
            });
            if (!hasMatchingAssignment) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Selected provider, resource, or location is not assigned to this service', { statusCode: 409 });
            }
        }

        if (!providerUserId && !resourceId) {
            const resourceAssignments = assignments.filter((assignment) => {
                const assignmentResourceId = toPositiveInt(assignment.resource_id);
                if (!assignmentResourceId) return false;
                if (locationId && assignment.location_id && Number(assignment.location_id) !== Number(locationId)) return false;
                return true;
            });
            for (const assignment of resourceAssignments) {
                const candidateResourceId = toPositiveInt(assignment.resource_id);
                const candidateResource = await serviceRepository.findResourceById(candidateResourceId, { transaction, lock: true });
                if (!candidateResource || candidateResource.is_active === false) continue;
                if (locationId && candidateResource.location_id && Number(candidateResource.location_id) !== Number(locationId)) continue;
                if (isBlackedOut({ startAt, blackoutDates: candidateResource.blackout_dates })) continue;
                if (!isWithinWeeklyAvailability({ startAt, endAt, weeklyAvailability: candidateResource.weekly_availability })) continue;
                const candidatePersistedConflicts = await serviceRepository.findConflictingBookings({
                    resourceId: candidateResourceId,
                    startAt: bufferStartAt,
                    endAt: bufferEndAt
                }, { transaction, lock: true });
                const candidateHoldConflicts = typeof serviceRepository.findConflictingHolds === 'function'
                    ? await serviceRepository.findConflictingHolds({
                        resourceId: candidateResourceId,
                        startAt: bufferStartAt,
                        endAt: bufferEndAt,
                        excludeHoldId: excludedHoldId
                    }, { transaction, lock: true })
                    : [];
                const candidateConflicts = [
                    ...candidatePersistedConflicts,
                    ...candidateHoldConflicts,
                    ...pendingBookingConflicts({
                        resourceId: candidateResourceId,
                        startAt: bufferStartAt,
                        endAt: bufferEndAt,
                        pendingRequests
                    })
                ];
                const candidateConflictCount = candidateConflicts
                    .filter((booking) => Number(booking.resource_id) === Number(candidateResourceId))
                    .reduce((sum, booking) => sum + bookingQuantity(booking), 0);
                if (candidateConflictCount + quantity <= toPositiveInt(candidateResource.capacity, 1)) {
                    resourceId = candidateResourceId;
                    resource = candidateResource;
                    break;
                }
            }
            if (quantity > 1 && resourceAssignments.length > 0 && !resourceId) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'No assigned service resource has enough capacity for the requested quantity and schedule',
                    { statusCode: 409 }
                );
            }
        }

        const persistedConflicts = await serviceRepository.findConflictingBookings({
            providerUserId,
            resourceId,
            locationId,
            startAt: bufferStartAt,
            endAt: bufferEndAt
        }, { transaction, lock: true });
        const persistedHoldConflicts = typeof serviceRepository.findConflictingHolds === 'function'
            ? await serviceRepository.findConflictingHolds({
                providerUserId,
                resourceId,
                locationId,
                startAt: bufferStartAt,
                endAt: bufferEndAt,
                excludeHoldId: excludedHoldId
            }, { transaction, lock: true })
            : [];
        const conflicts = [
            ...persistedConflicts,
            ...persistedHoldConflicts,
            ...pendingBookingConflicts({
                providerUserId,
                resourceId,
                locationId,
                startAt: bufferStartAt,
                endAt: bufferEndAt,
                pendingRequests
            })
        ];
        const resourceCapacity = resource ? toPositiveInt(resource.capacity, 1) : 1;
        const providerConflictCount = providerUserId
            ? conflicts
                .filter((booking) => Number(booking.provider_user_id) === Number(providerUserId))
                .reduce((sum, booking) => sum + bookingQuantity(booking), 0)
            : 0;
        const resourceConflictCount = resourceId
            ? conflicts
                .filter((booking) => Number(booking.resource_id) === Number(resourceId))
                .reduce((sum, booking) => sum + bookingQuantity(booking), 0)
            : 0;
        const locationConflictCount = (!providerUserId && !resourceId && locationId)
            ? conflicts.reduce((sum, booking) => sum + bookingQuantity(booking), 0)
            : 0;
        const hasCapacityConflict = (providerUserId ? providerConflictCount + quantity > 1 : false)
            || (resourceId ? resourceConflictCount + quantity > resourceCapacity : false)
            || ((!providerUserId && !resourceId && locationId) ? locationConflictCount + quantity > 1 : false);
        if (hasCapacityConflict) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Selected provider, resource, or location is already booked for that time',
                {
                    statusCode: 409,
                    details: {
                        conflict_count: conflicts.length,
                        conflicts: conflicts.slice(0, 5).map(serializeBooking)
                    }
                }
            );
        }

        if (holdOnly) {
            return {
                service,
                detail,
                quantity,
                providerUserId,
                resourceId,
                locationId,
                startAt,
                endAt,
                replacementHoldId: replacementHold?.hold_id || null,
                capacityFootprint: {
                    provider_user_id: providerUserId,
                    resource_id: resourceId,
                    location_id: locationId,
                    startAt: bufferStartAt,
                    endAt: bufferEndAt,
                    quantity
                }
            };
        }

        const customerName = trim(payload.customer_name || storeCustomer?.name, 255);
        const customerEmail = normalizeEmail(payload.customer_email || storeCustomer?.email);
        const customerPhone = trim(payload.customer_phone || storeCustomer?.phone, 50);
        if (!customerName) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'customer_name is required', { statusCode: 422 });
        }
        if (!customerEmail && !customerPhone) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'customer_email or customer_phone is required', { statusCode: 422 });
        }

        const accountResolution = providedAccountResolution || await buildGuestAccountAction({
            serviceRepository,
            email: customerEmail,
            storeCustomer,
            options: { transaction, lock: true }
        });

        const publicReference = await generateUniqueBookingReference(serviceRepository, {
            transaction,
            lock: true
        });
        const paymentTiming = resolvePaymentTiming({
            requestedTiming: payload.payment_timing,
            paymentPolicy: detail.payment_policy || 'customer_choice'
        });
        const paymentHandoff = buildPaymentHandoff({
            paymentTiming,
            bookingReference: publicReference,
            amount: salePrice * quantity
        });

        const booking = await serviceRepository.createBooking({
            public_reference: publicReference,
            service_item_id: service.item_id,
            service_detail_id: detail.service_detail_id || null,
            store_customer_id: accountResolution.storeCustomerId,
            customer_name: customerName,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
            quantity,
            provider_user_id: providerUserId,
            resource_id: resourceId,
            location_id: locationId,
            start_at: startAt,
            end_at: endAt,
            status: source === 'storefront' ? 'requested' : (payload.status || 'confirmed'),
            payment_timing: paymentTiming,
            payment_status: paymentHandoff.payment_status,
            payment_reference: paymentHandoff.payment_reference,
            payment_checkout_url: paymentHandoff.payment_checkout_url,
            pos_transaction_id: toPositiveInt(payload.pos_transaction_id),
            source: ['storefront', 'pos', 'admin'].includes(String(source || '').trim()) ? String(source).trim() : 'admin',
            idempotency_key: idempotencyKey || null,
            request_hash: requestHash || null,
            notes: trim(payload.notes, 4000) || null,
            intake_responses: isPlainObject(payload.intake_responses) ? payload.intake_responses : null,
            ...(accountResolution.claimTokenPayload || {})
        }, { transaction });
        const hydrated = await serviceRepository.getBookingById(booking.booking_id, { transaction });
        if (activeHold && typeof serviceRepository.updateHoldById === 'function') {
            await serviceRepository.updateHoldById(activeHold.hold_id, { status: 'consumed' }, { transaction, lock: true });
        }
        return {
            booking: hydrated,
            accountResolution,
            paymentTiming,
            paymentHandoff,
            capacityFootprint: {
                provider_user_id: providerUserId,
                resource_id: resourceId,
                location_id: locationId,
                startAt: bufferStartAt,
                endAt: bufferEndAt,
                quantity
            }
        };
};

export const buildCreateServiceBookingUseCase = ({ serviceRepository }) => async ({
    payload = {},
    source = 'admin',
    storeCustomer = null
} = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        const idempotencyKey = normalizeIdempotencyKey(payload.idempotency_key);
        assertStorefrontIdempotency({ source, idempotencyKey });
        const requestHash = idempotencyKey
            ? hashRequestPayload(bookingRequestHashPayload({ payload, source, storeCustomer }))
            : null;
        let storefrontSettings = null;
        if (source === 'storefront') {
            storefrontSettings = await loadServiceStorefrontSettings(serviceRepository, { transaction });
            const accessPolicy = await resolveServiceAccessPolicy(serviceRepository, { transaction }, storefrontSettings);
            assertServiceStorefrontActionAllowed({
                action: 'service_booking',
                capability: 'booking',
                accessPolicy
            });
        }
        const replayBookings = await replayBookingsForIdempotency({
            serviceRepository,
            idempotencyKey,
            requestHash,
            transaction
        });
        if (replayBookings) {
            await transaction.commit();
            const booking = serializeBooking(replayBookings[0]);
            return ok({
                booking,
                bookings: [booking],
                account_action: null,
                payment: bookingPaymentResponse(replayBookings[0]),
                payments: [bookingPaymentResponse(replayBookings[0])],
                idempotency: {
                    outcome: 'idempotent_replay',
                    idempotent_replay: true
                }
            });
        }
        if (source === 'storefront') {
            assertServiceBookingWithinStorefrontHours({
                startAt: parseDate(payload.start_at || payload.scheduled_for, 'start_at'),
                settings: storefrontSettings,
                action: 'service_booking'
            });
        }
        const created = await createServiceBookingRecord({
            serviceRepository,
            payload,
            source,
            storeCustomer,
            transaction,
            idempotencyKey,
            requestHash
        });
        await transaction.commit();
        const payment = bookingPaymentResponse(created.booking, {
            paymentTiming: created.paymentTiming,
            paymentStatus: created.paymentHandoff.payment_status,
            checkoutUrl: created.paymentHandoff.payment_checkout_url
        });
        return ok({
            booking: serializeBooking(created.booking),
            bookings: [serializeBooking(created.booking)],
            account_action: created.accountResolution.accountAction,
            payment,
            payments: [payment]
        });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service booking'));
    }
};

export const buildCreateServiceBookingHoldUseCase = ({ serviceRepository }) => async ({
    payload = {},
    source = 'storefront',
    storeCustomer = null
} = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        const idempotencyKey = normalizeIdempotencyKey(payload.idempotency_key);
        assertStorefrontIdempotency({ source, idempotencyKey });
        const requestHash = idempotencyKey
            ? hashRequestPayload(holdRequestHashPayload({ payload, source, storeCustomer }))
            : null;
        let storefrontSettings = null;
        if (source === 'storefront') {
            storefrontSettings = await loadServiceStorefrontSettings(serviceRepository, { transaction });
            const accessPolicy = await resolveServiceAccessPolicy(serviceRepository, { transaction }, storefrontSettings);
            assertServiceStorefrontActionAllowed({
                action: 'service_booking_hold',
                capability: 'booking',
                accessPolicy
            });
        }
        if (idempotencyKey && typeof serviceRepository.findHoldsByIdempotencyKey === 'function') {
            const existing = await serviceRepository.findHoldsByIdempotencyKey(idempotencyKey, { transaction, lock: true });
            const active = existing.find((hold) => hold.status === 'active' && new Date(hold.expires_at).getTime() > Date.now());
            if (active) {
                if (String(active.request_hash || '') !== requestHash) {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'idempotency_key was already used with a different hold payload', { statusCode: 409 });
                }
                await transaction.commit();
                return ok({
                    hold: serializeBookingHold(active),
                    idempotency: {
                        outcome: 'idempotent_replay',
                        idempotent_replay: true
                    }
                });
            }
        }
        if (source === 'storefront') {
            assertServiceBookingWithinStorefrontHours({
                startAt: parseDate(payload.start_at || payload.scheduled_for, 'start_at'),
                settings: storefrontSettings,
                action: 'service_booking_hold'
            });
        }
        const validated = await createServiceBookingRecord({
            serviceRepository,
            payload,
            source,
            storeCustomer,
            transaction,
            idempotencyKey,
            requestHash,
            holdOnly: true
        });
        const hold = await serviceRepository.createBookingHold({
            hold_token: generateHoldToken(),
            service_item_id: validated.service.item_id,
            service_detail_id: validated.detail.service_detail_id || null,
            store_customer_id: toPositiveInt(storeCustomer?.customer_id),
            quantity: validated.quantity,
            provider_user_id: validated.providerUserId || null,
            resource_id: validated.resourceId || null,
            location_id: validated.locationId || null,
            start_at: validated.startAt,
            end_at: validated.endAt,
            expires_at: new Date(Date.now() + BOOKING_HOLD_TTL_MS),
            status: 'active',
            source,
            idempotency_key: idempotencyKey || null,
            request_hash: requestHash || null
        }, { transaction });
        if (validated.replacementHoldId && typeof serviceRepository.updateHoldById === 'function') {
            await serviceRepository.updateHoldById(validated.replacementHoldId, { status: 'cancelled' }, { transaction, lock: true });
        }
        await transaction.commit();
        return ok({ hold: serializeBookingHold(hold) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service booking hold'));
    }
};

export const buildCreateServiceBookingBatchUseCase = ({ serviceRepository }) => async ({
    payload = {},
    source = 'storefront',
    storeCustomer = null
} = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        const idempotencyKey = normalizeIdempotencyKey(payload.idempotency_key);
        assertStorefrontIdempotency({ source, idempotencyKey });
        const requestHash = idempotencyKey
            ? hashRequestPayload(bookingRequestHashPayload({ payload, source, storeCustomer }))
            : null;
        let storefrontSettings = null;
        if (source === 'storefront') {
            storefrontSettings = await loadServiceStorefrontSettings(serviceRepository, { transaction });
            const accessPolicy = await resolveServiceAccessPolicy(serviceRepository, { transaction }, storefrontSettings);
            assertServiceStorefrontActionAllowed({
                action: 'service_booking',
                capability: 'booking',
                accessPolicy
            });
        }
        const bookingDrafts = Array.isArray(payload.bookings) ? payload.bookings : [];
        if (bookingDrafts.length === 0) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'bookings must contain at least one booking draft', { statusCode: 422 });
        }
        const replayBookings = await replayBookingsForIdempotency({
            serviceRepository,
            idempotencyKey,
            requestHash,
            transaction
        });
        if (replayBookings) {
            await transaction.commit();
            const serializedBookings = replayBookings.map(serializeBooking);
            return ok({
                bookings: serializedBookings,
                booking: serializedBookings.length === 1 ? serializedBookings[0] : null,
                account_action: null,
                ...batchPaymentResponse(replayBookings),
                idempotency: {
                    outcome: 'idempotent_replay',
                    idempotent_replay: true
                }
            });
        }
        if (source === 'storefront') {
            bookingDrafts.forEach((draft, index) => {
                assertServiceBookingWithinStorefrontHours({
                    startAt: parseDate(draft?.start_at || draft?.scheduled_for, `bookings[${index}].start_at`),
                    settings: storefrontSettings,
                    action: 'service_booking'
                });
            });
        }
        const pendingRequests = [];
        const createdBookings = [];
        const paymentRows = [];
        let sharedAccountResolution = null;
        let accountAction = null;

        for (let index = 0; index < bookingDrafts.length; index += 1) {
            const draft = bookingDrafts[index] || {};
            try {
                const created = await createServiceBookingRecord({
                    serviceRepository,
                    payload: {
                        customer_name: payload.customer_name,
                        customer_email: payload.customer_email,
                        customer_phone: payload.customer_phone,
                        payment_timing: payload.payment_timing,
                        location_id: payload.location_id,
                        ...draft
                    },
                    source,
                    storeCustomer,
                    transaction,
                    pendingRequests,
                    accountResolution: sharedAccountResolution,
                    idempotencyKey,
                    requestHash
                });
                pendingRequests.push(created.capacityFootprint);
                createdBookings.push(created.booking);
                paymentRows.push(bookingPaymentResponse(created.booking, {
                    paymentTiming: created.paymentTiming,
                    paymentStatus: created.paymentHandoff.payment_status,
                    checkoutUrl: created.paymentHandoff.payment_checkout_url
                }));
                if (!sharedAccountResolution) sharedAccountResolution = created.accountResolution;
                if (!accountAction) accountAction = created.accountResolution.accountAction;
            } catch (error) {
                const mapped = mapError(error, 'Failed to create service booking');
                throw new DomainError(mapped.code, mapped.message, {
                    statusCode: mapped.statusCode,
                    details: {
                        ...(isPlainObject(mapped.details) ? mapped.details : {}),
                        booking_index: index
                    }
                });
            }
        }

        await transaction.commit();
        return ok({
            bookings: createdBookings.map(serializeBooking),
            booking: createdBookings.length === 1 ? serializeBooking(createdBookings[0]) : null,
            account_action: accountAction,
            ...batchPaymentResponse(createdBookings, paymentRows)
        });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service booking batch'));
    }
};

export const buildListServiceBookingsUseCase = ({ serviceRepository }) => async ({ query = {} } = {}) => {
    try {
        const rows = await serviceRepository.listBookings(query);
        return ok({ bookings: rows.map(serializeBooking) });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service bookings'));
    }
};

export const buildListServiceWaitlistUseCase = ({ serviceRepository }) => async ({ query = {} } = {}) => {
    try {
        const rows = await serviceRepository.listWaitlistEntries({
            status: query.status,
            limit: query.limit
        });
        return ok({ waitlist: rows.map(serializeWaitlistEntry) });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service waitlist'));
    }
};

export const buildCreateServiceWaitlistEntryUseCase = ({ serviceRepository }) => async ({ payload = {}, source = 'admin', storeCustomer = null } = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        if (source === 'storefront') {
            const accessPolicy = await resolveServiceAccessPolicy(serviceRepository, { transaction });
            assertServiceStorefrontActionAllowed({
                action: 'service_waitlist',
                capability: 'booking',
                accessPolicy
            });
        }
        const serviceItemId = toPositiveInt(payload.service_item_id || payload.item_id);
        if (!serviceItemId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'service_item_id is required', { statusCode: 422 });
        }
        const waitlistLocationId = toPositiveInt(payload.location_id);
        const service = await serviceRepository.findServiceItemById(serviceItemId, {
            transaction,
            storefrontLocationId: String(source || '').trim() === 'storefront' ? waitlistLocationId : null
        });
        if (!service) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service item not found', { statusCode: 404 });
        }
        const customerName = trim(payload.customer_name || storeCustomer?.name, 255);
        const customerEmail = normalizeEmail(payload.customer_email || storeCustomer?.email);
        const customerPhone = trim(payload.customer_phone || storeCustomer?.phone, 50);
        if (!customerName) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'customer_name is required', { statusCode: 422 });
        }
        if (!customerEmail && !customerPhone) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'customer_email or customer_phone is required', { statusCode: 422 });
        }
        const created = await serviceRepository.createWaitlistEntry({
            service_item_id: serviceItemId,
            store_customer_id: toPositiveInt(storeCustomer?.customer_id),
            customer_name: customerName,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
            preferred_start_at: payload.preferred_start_at ? parseDate(payload.preferred_start_at, 'preferred_start_at') : null,
            preferred_end_at: payload.preferred_end_at ? parseDate(payload.preferred_end_at, 'preferred_end_at') : null,
            status: 'waiting',
            notes: trim(payload.notes, 4000) || null
        }, { transaction });
        await transaction.commit();
        return ok({ waitlist_entry: serializeWaitlistEntry({ ...created, serviceItem: service }) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service waitlist entry'));
    }
};

export const buildUpdateServiceWaitlistStatusUseCase = ({ serviceRepository }) => async ({ waitlistEntryId, payload = {} } = {}) => {
    const normalizedEntryId = toPositiveInt(waitlistEntryId);
    const status = String(payload.status || '').trim();
    if (!normalizedEntryId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'waitlist_entry_id is required', { statusCode: 422 }));
    }
    if (!WAITLIST_STATUSES.includes(status)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported waitlist status', { statusCode: 422 }));
    }
    const transaction = await serviceRepository.beginTransaction();
    try {
        const updated = await serviceRepository.updateWaitlistEntryById(normalizedEntryId, { status }, { transaction, lock: true });
        if (!updated) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Waitlist entry not found', { statusCode: 404 });
        }
        await transaction.commit();
        return ok({ waitlist_entry: serializeWaitlistEntry(updated) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to update service waitlist entry'));
    }
};

export const buildListServiceRemindersUseCase = ({ serviceRepository }) => async ({ query = {} } = {}) => {
    try {
        const rows = await serviceRepository.listReminderOutbox({
            status: REMINDER_STATUSES.includes(String(query.status || '').trim()) ? String(query.status).trim() : '',
            limit: query.limit
        });
        return ok({ reminders: rows.map(serializeReminder) });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service reminders'));
    }
};

const reminderPayloadForBooking = (booking = {}) => ({
    public_reference: booking.public_reference,
    customer_name: booking.customer_name,
    service_name: booking.serviceItem?.name || booking.service?.name || 'Service',
    start_at: booking.start_at,
    end_at: booking.end_at,
    payment_status: booking.payment_status,
    payment_timing: booking.payment_timing
});

export const buildQueueDueServiceRemindersUseCase = ({ serviceRepository }) => async ({ payload = {} } = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        const now = new Date();
        const lookaheadHours = Math.min(toPositiveInt(payload.lookahead_hours, 24), 168);
        const to = new Date(now.getTime() + (lookaheadHours * 60 * 60 * 1000));
        const candidates = await serviceRepository.listReminderCandidateBookings({
            from: now,
            to,
            limit: payload.limit
        }, { transaction, lock: true });
        const queued = [];
        const skipped = [];

        for (const booking of candidates) {
            const recipient = normalizeEmail(booking.customer_email);
            if (!recipient) {
                skipped.push({ booking_id: booking.booking_id, reason: 'email_recipient_missing' });
                continue;
            }
            const existing = await serviceRepository.findReminderByBookingChannelType({
                bookingId: booking.booking_id,
                channel: 'email',
                reminderType: 'appointment_reminder'
            }, { transaction, lock: true });
            if (existing) {
                skipped.push({ booking_id: booking.booking_id, reason: 'already_queued' });
                continue;
            }
            const reminder = await serviceRepository.createReminder({
                booking_id: booking.booking_id,
                channel: 'email',
                reminder_type: 'appointment_reminder',
                recipient,
                scheduled_for: now,
                status: 'pending',
                payload: reminderPayloadForBooking(booking)
            }, { transaction });
            queued.push(reminder);
        }

        await transaction.commit();
        return ok({
            queued_count: queued.length,
            skipped_count: skipped.length,
            skipped,
            reminders: queued.map(serializeReminder)
        });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to queue service reminders'));
    }
};

const buildReminderEmail = (reminder = {}) => {
    const payload = reminder.payload || {};
    const serviceName = payload.service_name || reminder.booking?.serviceItem?.name || 'your appointment';
    const startAt = payload.start_at ? new Date(payload.start_at) : null;
    const schedule = startAt && Number.isFinite(startAt.getTime())
        ? startAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : 'your scheduled time';
    const reference = payload.public_reference || reminder.booking?.public_reference || '';
    const subject = `Reminder: ${serviceName} on ${schedule}`;
    const html = `
        <p>Hello ${payload.customer_name || 'there'},</p>
        <p>This is a reminder for <strong>${serviceName}</strong> on <strong>${schedule}</strong>.</p>
        <p>Booking reference: <strong>${reference}</strong></p>
        <p>If you need to reschedule or cancel, please contact the business before your appointment.</p>
    `;
    return { subject, html };
};

export const buildSendDueServiceRemindersUseCase = ({ serviceRepository, emailService }) => async ({ query = {} } = {}) => {
    try {
        const now = new Date();
        const pending = await serviceRepository.listReminderOutbox({
            status: 'pending',
            limit: query.limit
        });
        const due = pending.filter((reminder) => {
            const scheduledFor = new Date(reminder.scheduled_for);
            return Number.isFinite(scheduledFor.getTime()) && scheduledFor.getTime() <= now.getTime();
        });
        const sent = [];
        const failed = [];
        const skipped = [];

        for (const reminder of due) {
            if (reminder.channel !== 'email') {
                const updated = await serviceRepository.updateReminderById(reminder.reminder_id, {
                    status: 'skipped',
                    failure_reason: 'channel_not_configured'
                });
                skipped.push(updated);
                continue;
            }
            if (!emailService?.isEmailConfigured?.()) {
                const updated = await serviceRepository.updateReminderById(reminder.reminder_id, {
                    status: 'skipped',
                    failure_reason: 'email_not_configured'
                });
                skipped.push(updated);
                continue;
            }
            try {
                const email = buildReminderEmail(reminder);
                const result = await emailService.sendEmail({
                    to: reminder.recipient,
                    subject: email.subject,
                    html: email.html
                });
                const updated = await serviceRepository.updateReminderById(reminder.reminder_id, {
                    status: 'sent',
                    sent_at: new Date(),
                    provider_message_id: result?.messageId || null,
                    failure_reason: null
                });
                sent.push(updated);
            } catch (sendError) {
                const updated = await serviceRepository.updateReminderById(reminder.reminder_id, {
                    status: 'failed',
                    failure_reason: trim(sendError?.message || 'Failed to send reminder', 500)
                });
                failed.push(updated);
            }
        }

        return ok({
            due_count: due.length,
            sent_count: sent.length,
            failed_count: failed.length,
            skipped_count: skipped.length,
            reminders: [...sent, ...failed, ...skipped].map(serializeReminder)
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to send due service reminders'));
    }
};

export const buildListServiceClientsUseCase = ({ serviceRepository }) => async ({ query = {} } = {}) => {
    try {
        const rows = await serviceRepository.listClientHistory({ limit: query.limit });
        const clients = new Map();
        rows.forEach((booking) => {
            const key = normalizeEmail(booking.customer_email) || trim(booking.customer_phone, 50) || trim(booking.customer_name, 255);
            if (!key) return;
            const current = clients.get(key) || {
                customer_name: booking.customer_name,
                customer_email: booking.customer_email || null,
                customer_phone: booking.customer_phone || null,
                store_customer_id: booking.store_customer_id || null,
                booking_count: 0,
                completed_count: 0,
                no_show_count: 0,
                last_booking_at: null,
                last_service_name: null,
                total_spend: 0
            };
            current.booking_count += 1;
            if (booking.status === 'completed') current.completed_count += 1;
            if (booking.status === 'no_show') current.no_show_count += 1;
            if (!current.last_booking_at || new Date(booking.start_at).getTime() > new Date(current.last_booking_at).getTime()) {
                current.last_booking_at = booking.start_at;
                current.last_service_name = booking.serviceItem?.name || null;
            }
            if (booking.payment_status === 'paid' || booking.status === 'completed') {
                current.total_spend += bookingLineAmount(booking);
            }
            clients.set(key, current);
        });
        return ok({ clients: [...clients.values()].map(serializeClientSummary) });
    } catch (error) {
        return fail(mapError(error, 'Failed to list service clients'));
    }
};

export const buildUpdateServiceBookingStatusUseCase = ({ serviceRepository }) => async ({ bookingId, payload = {} } = {}) => {
    const normalizedBookingId = toPositiveInt(bookingId);
    if (!normalizedBookingId) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'booking_id is required', { statusCode: 422 }));
    }
    const status = String(payload.status || '').trim();
    if (!BOOKING_STATUSES.includes(status)) {
        return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported booking status', { statusCode: 422 }));
    }

    const transaction = await serviceRepository.beginTransaction();
    try {
        const existing = await serviceRepository.getBookingById(normalizedBookingId, { transaction, lock: true });
        if (!existing) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Booking not found', { statusCode: 404 });
        }
        const currentStatus = String(existing.status || '').trim();
        const allowedNextStatuses = BOOKING_STATUS_TRANSITIONS[currentStatus] || [];
        if (status !== currentStatus && !allowedNextStatuses.includes(status)) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                `Cannot move service booking from ${currentStatus || 'unknown'} to ${status}`,
                {
                    statusCode: 409,
                    details: {
                        current_status: currentStatus,
                        requested_status: status,
                        allowed_next_statuses: allowedNextStatuses
                    }
                }
            );
        }
        const updatePayload = {
            status,
            cancellation_reason: status === 'cancelled' ? trim(payload.cancellation_reason, 500) || null : null
        };
        const posTransactionId = toPositiveInt(payload.pos_transaction_id);
        if (posTransactionId) {
            updatePayload.pos_transaction_id = posTransactionId;
        }
        await serviceRepository.updateBookingById(normalizedBookingId, {
            ...updatePayload
        }, { transaction, lock: true });
        const booking = await serviceRepository.getBookingById(normalizedBookingId, { transaction });
        await transaction.commit();
        return ok({ booking: serializeBooking(booking) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to update service booking'));
    }
};

export const buildGetServiceBookingByReferenceUseCase = ({ serviceRepository }) => async ({ publicReference }) => {
    try {
        const booking = await serviceRepository.getBookingByReference(publicReference);
        if (!booking) {
            return fail(new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Booking not found', { statusCode: 404 }));
        }
        return ok({ booking: serializeBooking(booking, { publicSafe: true }) });
    } catch (error) {
        return fail(mapError(error, 'Failed to load service booking'));
    }
};

export const buildClaimServiceBookingUseCase = ({ serviceRepository }) => async ({
    publicReference,
    claimToken,
    storeCustomer = null
} = {}) => {
    const customerId = toPositiveInt(storeCustomer?.customer_id);
    if (!customerId) {
        return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Store customer authentication is required', { statusCode: 401 }));
    }

    const transaction = await serviceRepository.beginTransaction();
    try {
        const booking = await serviceRepository.getBookingByReference(publicReference, { transaction, lock: true });
        if (!booking) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Booking not found', { statusCode: 404 });
        }
        if (booking.store_customer_id) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'Booking is already linked to an account', { statusCode: 409 });
        }
        const normalizedClaimToken = trim(claimToken, 500);
        const expectedHash = String(booking.claim_token_hash || '');
        const expiresAt = booking.claim_token_expires_at ? new Date(booking.claim_token_expires_at) : null;
        if (!normalizedClaimToken || !expectedHash || !expiresAt || expiresAt.getTime() < Date.now()) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Claim token is invalid or expired', { statusCode: 403 });
        }
        if (hashClaimToken(normalizedClaimToken) !== expectedHash) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Claim token is invalid or expired', { statusCode: 403 });
        }
        const bookingEmail = normalizeEmail(booking.customer_email);
        const customerEmail = normalizeEmail(storeCustomer.email);
        if (bookingEmail && customerEmail && bookingEmail !== customerEmail) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Claim token email does not match this account', { statusCode: 403 });
        }
        await serviceRepository.updateBookingById(booking.booking_id, {
            store_customer_id: customerId,
            claim_token_hash: null,
            claim_token_expires_at: null
        }, { transaction, lock: true });
        const updated = await serviceRepository.getBookingById(booking.booking_id, { transaction });
        await transaction.commit();
        return ok({ booking: serializeBooking(updated) });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to claim service booking'));
    }
};

export const buildServiceDashboardUseCase = ({ serviceRepository }) => async () => {
    try {
        const [byStatus, metrics, waitlistByStatus] = await Promise.all([
            serviceRepository.countBookingsByStatus(),
            serviceRepository.getDashboardMetrics(),
            typeof serviceRepository.countWaitlistByStatus === 'function'
                ? serviceRepository.countWaitlistByStatus()
                : Promise.resolve([])
        ]);
        const counts = {};
        byStatus.forEach((row) => {
            counts[row.status] = Number(row.count || 0);
        });
        const waitlistCounts = {};
        waitlistByStatus.forEach((row) => {
            waitlistCounts[row.status] = Number(row.count || 0);
        });
        return ok({
            booking_counts: counts,
            booking_status_counts: counts,
            future_bookings: Number(metrics.future_bookings || 0),
            today_bookings: Number(metrics.today_bookings || 0),
            checked_in_count: Number(metrics.checked_in_count || 0),
            in_service_count: Number(metrics.in_service_count || 0),
            reminders_due: Number(metrics.reminders_due || 0),
            overdue_no_show_candidates: Number(metrics.overdue_no_show_candidates || 0),
            waitlist_counts: waitlistCounts,
            waiting_waitlist_count: Number(waitlistCounts.waiting || 0),
            expected_revenue: round4(metrics.expected_revenue),
            postpaid_aging_total: round4(metrics.postpaid_aging_total)
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to load service dashboard'));
    }
};

export const serviceSerializers = {
    serializeCatalogItem,
    serializeBooking
};
