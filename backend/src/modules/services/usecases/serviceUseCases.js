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

const BOOKING_STATUSES = Object.freeze(['requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show']);
const PAYMENT_POLICIES = Object.freeze(['customer_choice', 'prepaid_required', 'postpaid_only', 'deposit_allowed']);
const PAYMENT_TIMINGS = Object.freeze(['prepaid', 'postpaid', 'deposit']);
const WAITLIST_STATUSES = Object.freeze(['waiting', 'notified', 'booked', 'expired', 'cancelled']);
const REMINDER_STATUSES = Object.freeze(['pending', 'sent', 'failed', 'skipped']);
const CLAIM_TOKEN_TTL_MS = 30 * 60 * 1000;
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
const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

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
const resolveServiceAccessPolicy = async (serviceRepository, options = {}) => {
    if (typeof serviceRepository?.getSettingsByKeys !== 'function') {
        return resolveAccessPolicyFromSettings({}, { featureEnabled: isCustomerAccessEnabledForCurrentTenant() });
    }
    const rows = await serviceRepository.getSettingsByKeys(CUSTOMER_ACCESS_SETTING_KEYS, options);
    return resolveAccessPolicyFromSettings(mapSettingsRows(rows), { featureEnabled: isCustomerAccessEnabledForCurrentTenant() });
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

const bookingAmount = (row = {}) => round4(row?.serviceItem?.default_sale_price ?? row?.service?.default_sale_price ?? 0);

const bookingDurationMinutes = (row = {}, detail = null) => {
    const fromDetail = toPositiveInt(detail?.duration_minutes);
    if (fromDetail) return fromDetail;
    const start = new Date(row.start_at);
    const end = new Date(row.end_at);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
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
            limit: query.limit
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

export const buildCreateServiceBookingUseCase = ({ serviceRepository }) => async ({
    payload = {},
    source = 'admin',
    storeCustomer = null
} = {}) => {
    const transaction = await serviceRepository.beginTransaction();
    try {
        if (source === 'storefront') {
            const accessPolicy = await resolveServiceAccessPolicy(serviceRepository, { transaction });
            assertServiceStorefrontActionAllowed({
                action: 'service_booking',
                capability: 'booking',
                accessPolicy
            });
        }
        const serviceItemId = toPositiveInt(payload.service_item_id || payload.item_id);
        if (!serviceItemId) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'service_item_id is required', { statusCode: 422 });
        }
        const service = await serviceRepository.findServiceItemById(serviceItemId, {
            transaction,
            lock: true
        });
        if (!service) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Service is not available for booking', { statusCode: 404 });
        }
        const detail = service.serviceDetail || {};
        if (detail.bookable === false) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'Service is not bookable', { statusCode: 409 });
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
        const providerUserId = toPositiveInt(payload.provider_user_id);
        const resourceId = toPositiveInt(payload.resource_id);
        const locationId = toPositiveInt(payload.location_id);

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

        const conflicts = await serviceRepository.findConflictingBookings({
            providerUserId,
            resourceId,
            locationId,
            startAt: bufferStartAt,
            endAt: bufferEndAt
        }, { transaction, lock: true });
        const resourceCapacity = resource ? toPositiveInt(resource.capacity, 1) : 1;
        const providerConflictCount = providerUserId
            ? conflicts.filter((booking) => Number(booking.provider_user_id) === Number(providerUserId)).length
            : 0;
        const resourceConflictCount = resourceId
            ? conflicts.filter((booking) => Number(booking.resource_id) === Number(resourceId)).length
            : 0;
        const locationConflictCount = (!providerUserId && !resourceId && locationId) ? conflicts.length : 0;
        const hasCapacityConflict = providerConflictCount > 0 || resourceConflictCount >= resourceCapacity || locationConflictCount > 0;
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

        const customerName = trim(payload.customer_name || storeCustomer?.name, 255);
        const customerEmail = normalizeEmail(payload.customer_email || storeCustomer?.email);
        const customerPhone = trim(payload.customer_phone || storeCustomer?.phone, 50);
        if (!customerName) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'customer_name is required', { statusCode: 422 });
        }
        if (!customerEmail && !customerPhone) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'customer_email or customer_phone is required', { statusCode: 422 });
        }

        const accountResolution = await buildGuestAccountAction({
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
            amount: service.default_sale_price || 0
        });

        const booking = await serviceRepository.createBooking({
            public_reference: publicReference,
            service_item_id: service.item_id,
            service_detail_id: detail.service_detail_id || null,
            store_customer_id: accountResolution.storeCustomerId,
            customer_name: customerName,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
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
            notes: trim(payload.notes, 4000) || null,
            intake_responses: isPlainObject(payload.intake_responses) ? payload.intake_responses : null,
            ...(accountResolution.claimTokenPayload || {})
        }, { transaction });
        const hydrated = await serviceRepository.getBookingById(booking.booking_id, { transaction });
        await transaction.commit();
        return ok({
            booking: serializeBooking(hydrated),
            account_action: accountResolution.accountAction,
            payment: {
                payment_timing: paymentTiming,
                payment_status: paymentHandoff.payment_status,
                checkout_url: paymentHandoff.payment_checkout_url,
                provider: paymentTiming === 'postpaid' ? null : 'paymongo'
            }
        });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        return fail(mapError(error, 'Failed to create service booking'));
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
        const service = await serviceRepository.findServiceItemById(serviceItemId, { transaction });
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
                current.total_spend += Number(booking.serviceItem?.default_sale_price || 0);
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
