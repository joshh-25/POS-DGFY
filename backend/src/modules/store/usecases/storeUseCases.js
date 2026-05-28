import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapStoreUseCaseError } from './storeUseCaseError.js';
import logger from '../../../config/logger.js';
import dbStore from '../../../utils/dbStore.js';
import {
    computeDgfyConvenienceFee,
    getDgfyConvenienceFeeLabel
} from '../../shared/utils/dgfyConvenienceFee.js';
import {
    generateStoreCancelProof,
    generateStoreClaimToken,
    generateStoreToken,
    getStoreTokenConfig,
    normalizeTenantIdentifier,
    verifyStoreCancelProof,
    verifyStoreClaimToken
} from '../utils/storeJwtToken.js';
import { normalizeIntakeFormSchema } from '../../shared/utils/intakeFormSchema.js';
import {
    CUSTOMER_ACCESS_SETTING_KEYS,
    applyInventoryDisplayPolicy,
    buildCustomerAccessModeBlockedError,
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../../shared/utils/customerAccessPolicy.js';
import {
    normalizeBarcodeValue,
    parseBarcodeStructuredPayload
} from '../../shared/utils/barcodePolicy.js';
import {
    isStockExemptServiceItem
} from '../../shared/utils/stockBearingPolicy.js';
import {
    hasExplicitSalePrice,
    requireExplicitSalePrice
} from '../../shared/utils/itemFinancialPolicy.js';
import { buildFnbRecipeConsumptionPlan } from '../../shared/utils/fnbRecipeConsumption.js';
import { recordDgfyOrderActivity } from '../../dgfy/utils/customerActivityRecorder.js';

const INVOICE_COUNTER_KEY = 'POS_OR';
const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery'];
const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer'];
const FNB_COURSES = new Set(['appetizer', 'main', 'dessert', 'drink', 'other']);
const ORDER_METHOD_LOCATION_SUPPORT_MAP = Object.freeze({
    delivery: 'supports_delivery',
    pickup: 'supports_pickup',
    takeout: 'supports_pickup',
    dine_in: 'supports_dine_in'
});
const TRACKING_PIN_PREFIX = 'SK';
const TRACKING_PIN_PATTERN = /^SK-(?:[A-Z0-9]{4}|[A-Z0-9]{6})$/;
const TRACKING_PIN_RANDOM_LENGTH = 6;
const MAX_TRACKING_PIN_ATTEMPTS = 20;
const TRACKING_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const TRACKING_FAILURE_ALERT_THRESHOLD = Number.parseInt(process.env.STORE_TRACKING_ALERT_THRESHOLD, 10) || 5;
const VAT_RATE = 0.12;
const FULFILLMENT_STATUSES = [
    'placed',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'cancelled',
    'rejected'
];
const trackingFailureCounters = new Map();

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hashForLog = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
const hashStableFingerprint = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const normalizeFnbCourse = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return FNB_COURSES.has(normalized) ? normalized : null;
};

const normalizeRequestedLineModifiers = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => {
            if (!isPlainObject(entry)) return null;
            return {
                modifier_group_id: parsePositiveInt(entry.modifier_group_id),
                modifier_option_id: parsePositiveInt(entry.modifier_option_id || entry.option_id),
                group_name: String(entry.group_name || entry.group || '').trim(),
                option_name: String(entry.option_name || entry.name || '').trim()
            };
        })
        .filter((entry) => entry && (entry.modifier_option_id || entry.option_name))
        .slice(0, 30);
};

const pruneTrackingFailureCounters = (now = Date.now()) => {
    for (const [key, value] of trackingFailureCounters.entries()) {
        if (!value || value.expiresAt <= now) {
            trackingFailureCounters.delete(key);
        }
    }
};

const recordTrackingFailure = ({ action, tenantId, trackingPin, reason }) => {
    const now = Date.now();
    pruneTrackingFailureCounters(now);

    const normalizedTenantId = normalizeTenantIdentifier(tenantId) || 'unknown';
    const normalizedAction = String(action || 'unknown').trim() || 'unknown';
    const pinFingerprint = hashForLog(String(trackingPin || '').trim().toUpperCase() || 'missing');
    const key = `${normalizedAction}:${normalizedTenantId}:${pinFingerprint}`;

    const previous = trackingFailureCounters.get(key);
    const count = previous?.expiresAt > now
        ? Number(previous.count || 0) + 1
        : 1;

    trackingFailureCounters.set(key, {
        count,
        expiresAt: now + TRACKING_FAILURE_WINDOW_MS
    });

    if (count >= TRACKING_FAILURE_ALERT_THRESHOLD && count % TRACKING_FAILURE_ALERT_THRESHOLD === 0) {
        logger.warn('[StoreSecurity] Repeated invalid tracking attempt', {
            action: normalizedAction,
            reason: String(reason || 'unknown'),
            tenant_id: normalizedTenantId,
            tracking_pin_fingerprint: pinFingerprint,
            attempt_count: count,
            window_ms: TRACKING_FAILURE_WINDOW_MS
        });
    }
};

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const randomAlphaNumeric = (length) => {
    const bytes = crypto.randomBytes(length);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
        output += chars[bytes[i] % chars.length];
    }
    return output;
};

const generateTrackingPinCandidate = () => `${TRACKING_PIN_PREFIX}-${randomAlphaNumeric(TRACKING_PIN_RANDOM_LENGTH)}`;

const toStatusLabel = (status) => {
    switch (status) {
    case 'placed': return 'Order placed';
    case 'confirmed': return 'Confirmed by store';
    case 'preparing': return 'Preparing';
    case 'ready_for_pickup': return 'Ready for pickup';
    case 'out_for_delivery': return 'Out for delivery';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'rejected': return 'Rejected';
    default: return 'Unknown';
    }
};

const haversineDistanceKm = ({ lat1, lon1, lat2, lon2 }) => {
    const toRad = (value) => value * (Math.PI / 180);
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);

    const a = Math.sin(dLat / 2) ** 2
        + (Math.sin(dLon / 2) ** 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
};

const parseSettingValue = (rawValue, fallback = null) => {
    if (rawValue == null) return fallback;
    if (typeof rawValue !== 'string') return rawValue;
    try {
        return JSON.parse(rawValue);
    } catch {
        return rawValue;
    }
};

const parseBooleanSetting = (value, fallback = true) => {
    if (value == null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0' || normalized === '') return false;
    }
    return fallback;
};

const mapSettings = (rows = []) => {
    const result = {};
    for (const row of rows) {
        result[row.setting_key] = {
            ...row,
            value: parseSettingValue(row.setting_value)
        };
    }
    return result;
};
const CHECKOUT_SETTING_KEYS = Object.freeze([
    'store_delivery_fee',
    'pos_open_status',
    'pos_wait_time_minutes',
    'storefront_hours',
    ...CUSTOMER_ACCESS_SETTING_KEYS
]);

const toNumberOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const sanitizeCustomer = (customer) => {
    if (!customer) return null;
    return {
        customer_id: customer.customer_id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        is_active: customer.is_active,
        last_login: customer.last_login
    };
};

const serializeLocationSummary = (location) => {
    if (!location) return null;
    return {
        location_id: location.location_id,
        name: location.name,
        address_line: location.address_line,
        latitude: location.latitude ?? null,
        longitude: location.longitude ?? null,
        delivery_radius_km: location.delivery_radius_km,
        is_open: location.is_open,
        is_active: location.is_active,
        is_primary_storefront: location.is_primary_storefront === true,
        current_wait_time_minutes: location.current_wait_time_minutes,
        supports_delivery: location.supports_delivery,
        supports_pickup: location.supports_pickup,
        supports_dine_in: location.supports_dine_in
    };
};

const serializeOrderLines = (order) => {
    const lines = Array.isArray(order?.lines) ? order.lines : [];
    return lines.map((line) => ({
        line_id: line.line_id,
        item_id: line.item_id,
        item_name: line.item?.name || line.item_name || null,
        sku_code: line.item?.sku_code || null,
        category: line.item?.category || null,
        quantity: line.quantity,
        unit_of_measure: line.unit_of_measure,
        sale_price: line.sale_price,
        line_subtotal: line.line_subtotal
    }));
};

const serializeOrderBase = (order) => ({
    pos_transaction_id: order?.pos_transaction_id,
    tracking_pin: order?.tracking_pin,
    invoice_number: order?.invoice_number,
    order_source: order?.order_source,
    order_method: order?.order_method,
    payment_type: order?.payment_type,
    fulfillment_status: order?.fulfillment_status,
    status_label: toStatusLabel(order?.fulfillment_status),
    status: order?.fulfillment_status,
    subtotal_amount: order?.subtotal_amount,
    service_fee_amount: order?.service_fee_amount,
    service_fee_label_snapshot: order?.service_fee_label_snapshot,
    service_fee_method_snapshot: order?.service_fee_method_snapshot,
    delivery_fee: order?.delivery_fee,
    total_amount: order?.total_amount,
    outside_radius_flag: order?.outside_radius_flag,
    scheduled_for: order?.scheduled_for,
    special_instructions: order?.special_instructions,
    created_at: order?.created_at,
    updated_at: order?.updated_at,
    location: serializeLocationSummary(order?.location),
    items: serializeOrderLines(order)
});

const serializeOrderForCustomer = (order) => ({
    ...serializeOrderBase(order),
    customer_name: order?.customer_name,
    customer_phone: order?.customer_phone,
    customer_email: order?.customer_email,
    delivery_address: order?.delivery_address,
    delivery_latitude: order?.delivery_latitude,
    delivery_longitude: order?.delivery_longitude
});

const serializeOrderForPublicTracking = (order) => {
    return {
        ...serializeOrderBase(order),
        estimated_wait_minutes: order?.location?.current_wait_time_minutes ?? null
    };
};

const buildNormalizedCheckoutRequest = (payload = {}, storeCustomer = null) => {
    const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
    const lines = rawLines
        .map((line) => ({
            item_id: Number.parseInt(line.item_id, 10),
            quantity: round4(line.quantity),
            course: normalizeFnbCourse(line.course),
            line_modifiers: normalizeRequestedLineModifiers(line.line_modifiers || line.modifiers)
        }))
        .sort((a, b) => {
            if (a.item_id !== b.item_id) return a.item_id - b.item_id;
            return stableStringify(a.line_modifiers).localeCompare(stableStringify(b.line_modifiers));
        });

    return {
        idempotency_key: String(payload.idempotency_key || '').trim(),
        location_id: payload.location_id == null ? null : Number.parseInt(payload.location_id, 10),
        order_method: String(payload.order_method || 'delivery').trim(),
        payment_type: String(payload.payment_type || 'cash').trim(),
        customer_name: String(payload.customer_name || storeCustomer?.name || '').trim(),
        customer_phone: String(payload.customer_phone || storeCustomer?.phone || '').trim(),
        customer_email: String(payload.customer_email || storeCustomer?.email || '').trim().toLowerCase(),
        delivery_address: String(payload.delivery_address || '').trim(),
        delivery_latitude: toNumberOrNull(payload.delivery_latitude),
        delivery_longitude: toNumberOrNull(payload.delivery_longitude),
        scheduled_for: payload.scheduled_for ? new Date(payload.scheduled_for).toISOString() : null,
        special_instructions: String(payload.special_instructions || '').trim(),
        lines
    };
};

const resolveDeliveryRadiusFlag = ({ orderMethod, location, deliveryLatitude, deliveryLongitude }) => {
    if (orderMethod !== 'delivery') return false;
    if (!location) return false;
    if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return false;
    if (!Number.isFinite(Number(deliveryLatitude)) || !Number.isFinite(Number(deliveryLongitude))) return false;

    const distanceKm = haversineDistanceKm({
        lat1: Number(location.latitude),
        lon1: Number(location.longitude),
        lat2: Number(deliveryLatitude),
        lon2: Number(deliveryLongitude)
    });
    const radiusKm = Number(location.delivery_radius_km || 0);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) return false;
    return distanceKm > radiusKm;
};

const resolveStoreDeliveryFee = (settings = {}, orderMethod) => {
    if (orderMethod !== 'delivery') return 0;
    const rawFee = settings?.store_delivery_fee?.value;
    const parsed = Number(rawFee);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return round4(parsed);
};

const resolveEstimatedWaitMinutes = ({ settings = {}, location = null }) => {
    const configuredWaitMinutes = Number(settings?.pos_wait_time_minutes?.value);
    if (Number.isFinite(configuredWaitMinutes) && configuredWaitMinutes >= 0) {
        return Math.round(configuredWaitMinutes);
    }

    const locationWaitMinutes = Number(location?.current_wait_time_minutes);
    if (Number.isFinite(locationWaitMinutes) && locationWaitMinutes >= 0) {
        return Math.round(locationWaitMinutes);
    }

    return null;
};

const assertCheckoutLocationOperationalReadiness = ({ location, settings, orderMethod }) => {
    if (!location) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'No active tenant location is available for storefront checkout',
            { statusCode: 409 }
        );
    }

    if (location.is_active === false) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Selected location is inactive and cannot accept orders',
            { statusCode: 409 }
        );
    }

    const posOpenStatus = parseBooleanSetting(settings?.pos_open_status?.value, true);
    if (!posOpenStatus) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Storefront is currently closed and not accepting orders',
            { statusCode: 409 }
        );
    }

    if (location.is_open === false) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Selected location is currently closed and cannot accept orders',
            { statusCode: 409 }
        );
    }

    const supportKey = ORDER_METHOD_LOCATION_SUPPORT_MAP[orderMethod] || null;
    if (supportKey && location?.[supportKey] === false) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Selected location does not support ${orderMethod} orders`,
            { statusCode: 409 }
        );
    }
};

const ensureTenantContext = (tenantId) => {
    const normalizedTenantId = normalizeTenantIdentifier(tenantId);
    if (!normalizedTenantId) {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'Valid tenant context is required for store operations',
            { statusCode: 400 }
        );
    }
    return normalizedTenantId;
};

const ensureValidTrackingPin = (pin) => {
    const normalized = String(pin || '').trim().toUpperCase();
    if (!TRACKING_PIN_PATTERN.test(normalized)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'tracking_pin must use format SK-XXXXXX (legacy SK-XXXX is also accepted)',
            { statusCode: 422 }
        );
    }
    return normalized;
};

const validateOrderMethodAndPayment = ({ orderMethod, paymentType }) => {
    if (!ORDER_METHODS.includes(orderMethod)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Unsupported order method: ${orderMethod}`,
            { statusCode: 422 }
        );
    }
    if (!PAYMENT_TYPES.includes(paymentType)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Unsupported payment type: ${paymentType}`,
            { statusCode: 422 }
        );
    }
};

const validateScheduledFor = (scheduledFor) => {
    if (!scheduledFor) return null;
    const parsed = new Date(scheduledFor);
    if (!Number.isFinite(parsed.getTime())) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'scheduled_for must be a valid ISO date-time',
            { statusCode: 422 }
        );
    }
    return parsed;
};

const WEEKDAY_INDEX_BY_TOKEN = Object.freeze({
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
});

const toMinutesFrom12Hour = (hour, minute, meridiem) => {
    const safeHour = Number.parseInt(hour, 10);
    const safeMinute = Number.parseInt(minute, 10);
    const normalizedMeridiem = String(meridiem || '').trim().toUpperCase();
    if (!Number.isInteger(safeHour) || safeHour < 1 || safeHour > 12) return null;
    if (!Number.isInteger(safeMinute) || safeMinute < 0 || safeMinute > 59) return null;
    if (normalizedMeridiem !== 'AM' && normalizedMeridiem !== 'PM') return null;
    let hour24 = safeHour % 12;
    if (normalizedMeridiem === 'PM') hour24 += 12;
    return (hour24 * 60) + safeMinute;
};

const parseStorefrontHoursWindow = (rawHours) => {
    const text = String(rawHours || '').trim();
    if (!text) return null;

    const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(.*)$/i);
    if (!match) return null;

    const startMinutes = toMinutesFrom12Hour(match[1], match[2], match[3]);
    const endMinutes = toMinutesFrom12Hour(match[4], match[5], match[6]);
    if (startMinutes == null || endMinutes == null) return null;

    const dayPart = String(match[7] || '').trim().toLowerCase();
    let activeDays = new Set([0, 1, 2, 3, 4, 5, 6]);

    if (dayPart && dayPart !== 'daily' && dayPart !== 'everyday' && dayPart !== 'all days') {
        const tokens = dayPart
            .split(',')
            .map((entry) => entry.trim().replace(/\./g, '').toLowerCase())
            .filter(Boolean);
        if (tokens.length === 0) return null;
        activeDays = new Set();
        for (const token of tokens) {
            const dayIndex = WEEKDAY_INDEX_BY_TOKEN[token];
            if (dayIndex == null) return null;
            activeDays.add(dayIndex);
        }
        if (activeDays.size === 0) return null;
    }

    return { activeDays, startMinutes, endMinutes };
};

const isScheduledTimeWithinStorefrontHours = (scheduledFor, parsedHoursWindow) => {
    if (!scheduledFor || !parsedHoursWindow) return true;
    if (!parsedHoursWindow.activeDays.has(scheduledFor.getDay())) return false;

    const timeMinutes = (scheduledFor.getHours() * 60) + scheduledFor.getMinutes();
    const { startMinutes, endMinutes } = parsedHoursWindow;
    if (startMinutes === endMinutes) return true;
    if (endMinutes > startMinutes) return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
};

const assertScheduledForWithinStorefrontHours = ({ scheduledFor, settings }) => {
    if (!scheduledFor) return;
    const parsedHoursWindow = parseStorefrontHoursWindow(settings?.storefront_hours?.value);
    if (!parsedHoursWindow) return;

    if (!isScheduledTimeWithinStorefrontHours(scheduledFor, parsedHoursWindow)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'scheduled_for is outside store business hours',
            { statusCode: 422 }
        );
    }
};

const ensureRequiredCheckoutContact = ({ customerName, customerPhone, customerEmail, orderMethod, deliveryAddress }) => {
    if (!customerName) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'customer_name is required',
            { statusCode: 422 }
        );
    }

    if (!customerPhone && !customerEmail) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Either customer_phone or customer_email is required',
            { statusCode: 422 }
        );
    }

    if (orderMethod === 'delivery' && !deliveryAddress) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'delivery_address is required for delivery orders',
            { statusCode: 422 }
        );
    }
};

const resolveStorefrontLineModifiers = ({ item, line }) => {
    const requested = Array.isArray(line.line_modifiers) ? line.line_modifiers : [];
    if (requested.length === 0) {
        return { priceDelta: 0, snapshot: [] };
    }

    const groups = Array.isArray(item.fnb_modifier_groups)
        ? item.fnb_modifier_groups
        : (Array.isArray(item.fnbModifierGroups) ? item.fnbModifierGroups : []);
    const groupEntries = groups
        .filter((group) => group?.is_active !== false)
        .map((group) => ({
            ...group,
            options: (Array.isArray(group.options) ? group.options : [])
                .filter((option) => option?.is_active !== false)
        }));
    const groupById = new Map(groupEntries.map((group) => [Number(group.modifier_group_id), group]));
    const groupByName = new Map(groupEntries.map((group) => [String(group.name || group.display_name || '').trim().toLowerCase(), group]));
    const selectedCounts = new Map();
    const snapshot = [];
    let priceDelta = 0;

    for (const modifier of requested) {
        const group = modifier.modifier_group_id
            ? groupById.get(Number(modifier.modifier_group_id))
            : groupByName.get(String(modifier.group_name || '').trim().toLowerCase());
        if (!group) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier group is not available for "${item.name}"`,
                { statusCode: 422 }
            );
        }

        const option = modifier.modifier_option_id
            ? group.options.find((entry) => Number(entry.modifier_option_id) === Number(modifier.modifier_option_id))
            : group.options.find((entry) => String(entry.name || '').trim().toLowerCase() === String(modifier.option_name || '').trim().toLowerCase());
        if (!option) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier option is not available for "${item.name}"`,
                { statusCode: 422 }
            );
        }

        const count = Number(selectedCounts.get(group.modifier_group_id) || 0) + 1;
        selectedCounts.set(group.modifier_group_id, count);
        priceDelta = round4(priceDelta + round4(option.price_delta));
        snapshot.push({
            modifier_group_id: group.modifier_group_id,
            group_name: group.display_name || group.name,
            modifier_option_id: option.modifier_option_id,
            option_name: option.name,
            price_delta: round4(option.price_delta),
            allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null
        });
    }

    for (const [groupId, count] of selectedCounts.entries()) {
        const group = groupById.get(Number(groupId));
        if (!group) continue;
        const minSelect = Number(group.min_select || 0);
        const maxSelect = Number(group.max_select || 0);
        if (minSelect > 0 && count < minSelect) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier group "${group.display_name || group.name}" requires at least ${minSelect} option(s)`,
                { statusCode: 422 }
            );
        }
        if (maxSelect > 0 && count > maxSelect) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Modifier group "${group.display_name || group.name}" allows at most ${maxSelect} option(s)`,
                { statusCode: 422 }
            );
        }
    }

    return { priceDelta, snapshot };
};

const prepareCheckoutLines = ({ rawLines, itemMap, allowOutOfStockSales = false, recipeItemIds = new Set() }) => {
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'At least one checkout line is required',
            { statusCode: 400 }
        );
    }

    const preparedLines = [];
    let subtotalAmount = 0;
    const requestedQuantityByItemId = new Map();

    for (const line of rawLines) {
        const item = itemMap.get(line.item_id);
        if (!item) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                `Item not found for checkout: ${line.item_id}`,
                { statusCode: 404 }
            );
        }

        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Invalid quantity for item ${line.item_id}`,
                { statusCode: 422 }
            );
        }

        const isServiceItem = isStockExemptServiceItem(item);
        const currentStock = Number(item.current_stock || 0);
        const requestedItemQuantity = isServiceItem || allowOutOfStockSales
            ? quantity
            : round4((requestedQuantityByItemId.get(item.item_id) || 0) + quantity);
        if (!isServiceItem && !allowOutOfStockSales) {
            requestedQuantityByItemId.set(item.item_id, requestedItemQuantity);
        }

        const hasRecipeConsumption = recipeItemIds.has(Number(item.item_id));
        if (!isServiceItem && !allowOutOfStockSales && !hasRecipeConsumption && currentStock + 0.000001 < requestedItemQuantity) {
            const stockViolation = {
                item_id: item.item_id,
                item_name: item.name,
                available_stock: round4(currentStock),
                requested_qty: round4(requestedItemQuantity),
                unit_of_measure: item.unit_of_measure || null
            };
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${requestedItemQuantity}`,
                {
                    statusCode: 422,
                    details: {
                        stock_violation: stockViolation,
                        stock_violations: [stockViolation]
                    }
                }
            );
        }

        const resolvedPrice = requireExplicitSalePrice(item, 'Storefront checkout');

        const modifierResolution = resolveStorefrontLineModifiers({ item, line });
        const effectiveUnitPrice = round4(resolvedPrice + modifierResolution.priceDelta);
        const lineSubtotal = round4(quantity * effectiveUnitPrice);
        subtotalAmount = round4(subtotalAmount + lineSubtotal);

        preparedLines.push({
            item_id: item.item_id,
            item_name: item.name,
            quantity: round4(quantity),
            unit_of_measure: item.unit_of_measure || null,
            cost_snapshot: isServiceItem ? null : (item.cost_per_unit != null ? round4(item.cost_per_unit) : null),
            sale_price: effectiveUnitPrice,
            sale_price_overridden: false,
            price_override_reason: null,
            line_subtotal: lineSubtotal,
            vat_type_snapshot: item.vat_type || 'vatable',
            vat_rate_snapshot: round4(VAT_RATE),
            fnb_course_snapshot: normalizeFnbCourse(line.course),
            fnb_modifiers_snapshot: modifierResolution.snapshot.length > 0 ? modifierResolution.snapshot : null
        });
    }

    let vatableGross = 0;
    let vatExemptSales = 0;
    let zeroRatedSales = 0;
    for (const line of preparedLines) {
        if (line.vat_type_snapshot === 'vatable') {
            vatableGross = round4(vatableGross + line.line_subtotal);
        } else if (line.vat_type_snapshot === 'vat_exempt') {
            vatExemptSales = round4(vatExemptSales + line.line_subtotal);
        } else if (line.vat_type_snapshot === 'zero_rated') {
            zeroRatedSales = round4(zeroRatedSales + line.line_subtotal);
        }
    }

    const vatableSales = round4(vatableGross / (1 + VAT_RATE));
    const vatAmount = round4(vatableGross - vatableSales);

    return {
        preparedLines,
        subtotalAmount,
        vatableSales,
        vatAmount,
        vatExemptSales,
        zeroRatedSales
    };
};

const buildOrderHistoryResponse = (result = {}) => ({
    orders: (result.rows || []).map((row) => serializeOrderForCustomer(row)),
    pagination: result.pagination || {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
    }
});

const normalizeAvailabilityStatus = (item = {}) => {
    if (isStockExemptServiceItem(item)) {
        return 'bookable';
    }
    const rawStatus = String(item?.availability_status || '').trim().toLowerCase();
    if (rawStatus === 'bookable') return rawStatus;
    if (rawStatus === 'in_stock' || rawStatus === 'out_of_stock') {
        return rawStatus;
    }
    if (item?.is_available === true) return 'in_stock';
    if (item?.is_available === false) return 'out_of_stock';
    return 'out_of_stock';
};

const serializeStorefrontAllergens = (value) => (
    Array.isArray(value)
        ? value
            .map((entry) => ({
                allergen_name: String(entry?.allergen_name || '').trim(),
                is_cross_contamination: entry?.is_cross_contamination === true
            }))
            .filter((entry) => entry.allergen_name)
        : []
);

const serializeStorefrontNutrition = (value) => (
    value
        ? {
            serving_size: value.serving_size || null,
            calories: value.calories,
            total_fat: value.total_fat,
            saturated_fat: value.saturated_fat,
            cholesterol: value.cholesterol,
            sodium: value.sodium,
            total_carbohydrates: value.total_carbohydrates,
            dietary_fiber: value.dietary_fiber,
            sugars: value.sugars,
            protein: value.protein
        }
        : null
);

const serializeStorefrontModifierGroups = (value) => (
    Array.isArray(value)
        ? value
            .filter((group) => group?.is_active !== false)
            .map((group) => ({
                modifier_group_id: group.modifier_group_id,
                name: group.name,
                display_name: group.display_name || group.name,
                min_select: Number(group.min_select || 0),
                max_select: Number(group.max_select || 1),
                required: group.required === true || Number(group.min_select || 0) > 0,
                options: (Array.isArray(group.options) ? group.options : [])
                    .filter((option) => option?.is_active !== false)
                    .map((option) => ({
                        modifier_option_id: option.modifier_option_id,
                        name: option.name,
                        price_delta: round4(option.price_delta),
                        is_default: option.is_default === true,
                        allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null
                    }))
            }))
            .filter((group) => group.options.length > 0)
        : []
);

const serializeStoreCatalogItem = (item = {}, accessPolicy = {}) => {
    const availabilityStatus = normalizeAvailabilityStatus(item);
    const isAvailable = availabilityStatus === 'in_stock' || availabilityStatus === 'bookable';
    const serviceDetail = item.service_detail
        ? {
            ...item.service_detail,
            intake_form_schema: normalizeIntakeFormSchema(item.service_detail.intake_form_schema)
        }
        : null;
    return {
        item_id: item.item_id,
        name: item.name,
        category: item.category,
        product_type: item.product_type || null,
        description: item.description || null,
        folder_name: item.folder_name || item.product_folder || null,
        unit_of_measure: item.unit_of_measure || null,
        default_sale_price: item.default_sale_price,
        vat_type: item.vat_type || 'vatable',
        image_url: item.image_url || null,
        service_detail: serviceDetail,
        allergens: serializeStorefrontAllergens(item.allergens),
        nutrition: serializeStorefrontNutrition(item.nutrition),
        fnb_modifier_groups: serializeStorefrontModifierGroups(item.fnb_modifier_groups),
        is_available: isAvailable,
        availability_status: availabilityStatus,
        inventory_display: applyInventoryDisplayPolicy(
            { ...item, is_available: isAvailable, availability_status: availabilityStatus },
            accessPolicy
        )
    };
};

const buildStorefrontMissingPriceResult = ({ accessPolicy, barcode = null } = {}) => ({
    status: 'blocked',
    reason_code: 'STORE_CATALOG_PRICE_REQUIRED',
    access_policy: accessPolicy,
    item: null,
    barcode,
    cart_allowed: false,
    checkout_allowed: false
});

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

const resolveStorefrontAccessPolicy = async ({ storeRepository, options = {} } = {}) => {
    if (typeof storeRepository?.getSettingsByKeys !== 'function') {
        return resolveAccessPolicyFromSettings({}, {
            featureEnabled: isCustomerAccessEnabledForCurrentTenant()
        });
    }
    const rows = await storeRepository.getSettingsByKeys(CUSTOMER_ACCESS_SETTING_KEYS, options);
    return resolveAccessPolicyFromSettings(mapSettings(Array.isArray(rows) ? rows : []), {
        featureEnabled: isCustomerAccessEnabledForCurrentTenant()
    });
};

const assertStorefrontActionAllowed = ({ action, capability, accessPolicy }) => {
    if (!isCustomerAccessEnabledForCurrentTenant()) return;
    if (accessPolicy?.access_capabilities?.[capability] === true) return;
    throw buildCustomerAccessModeBlockedError({ action, accessPolicy });
};

const generateUniqueTrackingPin = async (storeRepository, options = {}) => {
    for (let attempt = 0; attempt < MAX_TRACKING_PIN_ATTEMPTS; attempt += 1) {
        const candidate = generateTrackingPinCandidate();
        const exists = await storeRepository.isTrackingPinTaken(candidate, options);
        if (!exists) return candidate;
    }

    throw new DomainError(
        DomainErrorCode.CONFLICT,
        'Unable to allocate unique tracking PIN. Please retry checkout.',
        { statusCode: 409 }
    );
};

const buildCancelProofForOrder = ({ order, tenantId }) => {
    const orderId = parsePositiveInt(order?.pos_transaction_id);
    const trackingPin = String(order?.tracking_pin || '').trim().toUpperCase();
    const storeCustomerId = parsePositiveInt(order?.store_customer_id);
    if (!orderId || !trackingPin || storeCustomerId) {
        return null;
    }

    try {
        return generateStoreCancelProof({
            trackingPin,
            tenantId,
            orderId,
            storeCustomerId: null
        });
    } catch (error) {
        logger.error('[StoreSecurity] Failed to generate cancellation proof token', {
            error: error.message,
            order_id: orderId
        });
        return null;
    }
};

const buildOrderAccountAction = async ({ storeRepository, order, tenantId, storeCustomer = null, options = {} }) => {
    const orderId = parsePositiveInt(order?.pos_transaction_id);
    const trackingPin = String(order?.tracking_pin || '').trim().toUpperCase();
    const authenticatedCustomerId = parsePositiveInt(storeCustomer?.customer_id);
    if (authenticatedCustomerId) {
        return {
            type: 'linked_authenticated',
            allow_image_download: true,
            show_signup: false,
            claim_token: null
        };
    }

    const email = String(order?.customer_email || '').trim().toLowerCase();
    if (!email || !orderId || !trackingPin) {
        return {
            type: 'download_only_guest_no_email',
            allow_image_download: true,
            show_signup: false,
            claim_token: null
        };
    }

    const existingCustomer = await storeRepository.findCustomerByEmail(email, options);
    if (existingCustomer?.customer_id) {
        return {
            type: 'existing_account_download_only',
            allow_image_download: true,
            show_signup: false,
            claim_token: null
        };
    }

    try {
        return {
            type: 'offer_signup',
            allow_image_download: true,
            show_signup: true,
            claim_token: generateStoreClaimToken({
                trackingPin,
                tenantId,
                orderId,
                email
            }),
            claim_token_expires_in: getStoreTokenConfig().claimTokenExpiresIn
        };
    } catch (error) {
        logger.error('[StoreSecurity] Failed to generate order claim token', {
            error: error.message,
            order_id: orderId
        });
        return {
            type: 'download_only_claim_unavailable',
            allow_image_download: true,
            show_signup: false,
            claim_token: null
        };
    }
};

const resolveCheckoutContext = async ({
    storeRepository,
    payload,
    storeCustomer = null,
    options = {},
    validateRecipeAvailability = true
}) => {
    const normalized = buildNormalizedCheckoutRequest(payload, storeCustomer);
    const orderMethod = normalized.order_method || 'delivery';
    const paymentType = normalized.payment_type || 'cash';
    validateOrderMethodAndPayment({ orderMethod, paymentType });
    ensureRequiredCheckoutContact({
        customerName: normalized.customer_name,
        customerPhone: normalized.customer_phone,
        customerEmail: normalized.customer_email,
        orderMethod,
        deliveryAddress: normalized.delivery_address
    });
    const scheduledFor = validateScheduledFor(normalized.scheduled_for);

    const itemIds = [...new Set(normalized.lines.map((line) => line.item_id).filter((id) => Number.isInteger(id) && id > 0))];
    if (itemIds.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'At least one checkout line is required',
            { statusCode: 400 }
        );
    }

    const [requestedLocation, fallbackLocation, settingsRows] = await Promise.all([
        normalized.location_id ? storeRepository.findLocationById(normalized.location_id, options) : Promise.resolve(null),
        normalized.location_id
            ? Promise.resolve(null)
            : (
                typeof storeRepository.findDefaultActiveLocation === 'function'
                    ? storeRepository.findDefaultActiveLocation(options)
                    : Promise.resolve(null)
            ),
        storeRepository.getSettingsByKeys(CHECKOUT_SETTING_KEYS, options)
    ]);

    if (normalized.location_id && !requestedLocation) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            `Location not found: ${normalized.location_id}`,
            { statusCode: 404 }
        );
    }

    const location = requestedLocation || fallbackLocation;

    const settings = mapSettings(settingsRows);
    const accessPolicy = resolveAccessPolicyFromSettings(settings, {
        featureEnabled: isCustomerAccessEnabledForCurrentTenant()
    });
    assertStorefrontActionAllowed({
        action: 'quote_checkout',
        capability: 'checkout',
        accessPolicy
    });
    assertCheckoutLocationOperationalReadiness({
        location,
        settings,
        orderMethod
    });
    assertScheduledForWithinStorefrontHours({
        scheduledFor,
        settings
    });

    normalized.location_id = location.location_id;

    const items = await storeRepository.findSellableItemsByIds(itemIds, {
        ...options,
        locationId: normalized.location_id
    });
    const estimatedWaitMinutes = resolveEstimatedWaitMinutes({
        settings,
        location
    });
    const storefrontOpen = parseBooleanSetting(settings?.pos_open_status?.value, true) && location.is_open !== false;

    const itemMap = new Map(items.map((item) => [item.item_id, item]));
    if (itemMap.size !== itemIds.length) {
        const missing = itemIds.filter((itemId) => !itemMap.has(itemId));
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            `Some items are not available for checkout: ${missing.join(', ')}`,
            {
                statusCode: 404,
                details: { missing_item_ids: missing }
            }
        );
    }

    const allowOutOfStockSales = Boolean(location?.allow_out_of_stock_sales);
    const recipeSourceItemIds = items
        .filter((item) => !isStockExemptServiceItem(item))
        .map((item) => Number.parseInt(item.item_id, 10))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0);
    const productCompositions = recipeSourceItemIds.length > 0
        && typeof storeRepository.listProductCompositionsForItems === 'function'
        ? await storeRepository.listProductCompositionsForItems(recipeSourceItemIds, {
            ...options,
            locationId: normalized.location_id
        })
        : [];
    const recipePlan = buildFnbRecipeConsumptionPlan({
        lines: normalized.lines,
        itemMap,
        compositions: productCompositions,
        locationId: normalized.location_id,
        validateAvailability: validateRecipeAvailability
    });
    const prepared = prepareCheckoutLines({
        rawLines: normalized.lines,
        itemMap,
        allowOutOfStockSales,
        recipeItemIds: recipePlan.recipeItemIds
    });

    const deliveryFee = resolveStoreDeliveryFee(settings, orderMethod);
    const serviceFeeAmount = computeDgfyConvenienceFee(prepared.subtotalAmount);
    const serviceFeeLabel = getDgfyConvenienceFeeLabel();
    const totalAmount = round4(prepared.subtotalAmount + deliveryFee + serviceFeeAmount);
    const outsideRadiusFlag = resolveDeliveryRadiusFlag({
        orderMethod,
        location,
        deliveryLatitude: normalized.delivery_latitude,
        deliveryLongitude: normalized.delivery_longitude
    });

    return {
        normalized,
        location,
        storefront_open: storefrontOpen,
        estimated_wait_minutes: estimatedWaitMinutes,
        prepared,
        recipePlan,
        deliveryFee,
        serviceFeeAmount,
        serviceFeeLabel,
        totalAmount,
        outsideRadiusFlag,
        scheduledFor
    };
};

export const buildRegisterStoreCustomerUseCase = ({ storeRepository }) => {
    return async ({ tenantId, payload }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const normalizedTenantId = ensureTenantContext(tenantId);
            const email = String(payload.email || '').trim().toLowerCase();
            const password = String(payload.password || '');
            const name = String(payload.name || '').trim();
            const phone = String(payload.phone || '').trim() || null;

            if (!email || !password || !name) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'name, email, and password are required',
                    { statusCode: 422 }
                );
            }
            if (password.length < 8) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'password must be at least 8 characters',
                    { statusCode: 422 }
                );
            }

            const existing = await storeRepository.findCustomerByEmail(email);
            if (existing) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A store customer account already exists for this email',
                    { statusCode: 409 }
                );
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const created = await storeRepository.createCustomer({
                email,
                password_hash: passwordHash,
                name,
                phone,
                is_active: true
            });

            const safeCustomer = sanitizeCustomer(created);
            const token = generateStoreToken({
                customer: safeCustomer,
                tenantId: normalizedTenantId
            });

            return ok({
                customer: safeCustomer,
                token,
                token_type: 'Bearer',
                expires_in: getStoreTokenConfig().expiresIn
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to register store customer'));
        }
    };
};

export const buildListStoreCatalogUseCase = ({ storeRepository }) => {
    return async ({ query = {} } = {}) => {
        if (!isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const requestedLocationId = query.location_id == null
                ? null
                : Number.parseInt(query.location_id, 10);
            if (query.location_id != null && (!Number.isInteger(requestedLocationId) || requestedLocationId <= 0)) {
                throw new DomainError(
                    DomainErrorCode.STORE_CATALOG_LOCATION_INVALID,
                    'location_id must be a positive integer when provided',
                    { statusCode: 422 }
                );
            }

            const accessPolicy = await resolveStorefrontAccessPolicy({ storeRepository });
            if (isCustomerAccessEnabledForCurrentTenant() && accessPolicy.access_capabilities.catalog !== true) {
                return ok({
                    items: [],
                    pagination: {
                        limit: Number.isFinite(Number(query.limit))
                            ? Math.max(1, Math.min(200, Number(query.limit)))
                            : 60,
                        count: 0
                    },
                    access_policy: accessPolicy
                });
            }

            const items = await storeRepository.listStoreCatalog({
                search: query.search,
                limit: query.limit,
                location_id: requestedLocationId
            });
            const serializedItems = (Array.isArray(items) ? items : [])
                .filter((item) => hasExplicitSalePrice(item))
                .map((item) => (
                    serializeStoreCatalogItem(item, accessPolicy)
                ));

            return ok({
                items: serializedItems,
                pagination: {
                    limit: Number.isFinite(Number(query.limit))
                        ? Math.max(1, Math.min(200, Number(query.limit)))
                        : 60,
                    count: serializedItems.length
                },
                access_policy: accessPolicy
            });
        } catch (error) {
            if (error instanceof DomainError) {
                return fail(error);
            }
            return fail(new DomainError(
                DomainErrorCode.STORE_CATALOG_RUNTIME_ERROR,
                'Failed to list storefront catalog',
                {
                    statusCode: 500,
                    details: {
                        catalog_error_type: 'runtime_failure'
                    }
                }
            ));
        }
    };
};

export const buildResolveStoreQrUseCase = ({ storeRepository }) => {
    return async ({ query = {} } = {}) => {
        if (!isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const code = String(query.code || '').trim();
            if (!code) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'code is required',
                    { statusCode: 422 }
                );
            }
            const requestedLocationId = query.location_id == null
                ? null
                : Number.parseInt(query.location_id, 10);
            if (query.location_id != null && (!Number.isInteger(requestedLocationId) || requestedLocationId <= 0)) {
                throw new DomainError(
                    DomainErrorCode.STORE_CATALOG_LOCATION_INVALID,
                    'location_id must be a positive integer when provided',
                    { statusCode: 422 }
                );
            }

            const accessPolicy = await resolveStorefrontAccessPolicy({ storeRepository });
            if (isCustomerAccessEnabledForCurrentTenant() && accessPolicy.access_capabilities.catalog !== true) {
                return ok({
                    status: 'blocked',
                    reason_code: 'CUSTOMER_ACCESS_MODE_BLOCKED',
                    access_policy: accessPolicy,
                    item: null,
                    barcode: null,
                    cart_allowed: false,
                    checkout_allowed: false
                });
            }

            const structuredPayload = parseBarcodeStructuredPayload(code);
            const structuredType = String(structuredPayload?.type || '').trim().toLowerCase();
            const structuredReference = String(structuredPayload?.reference || '').trim();
            if (structuredType === 'service_booking' && structuredReference) {
                const bookingResult = await storeRepository.resolvePublicServiceBookingReference(structuredReference);
                if (bookingResult.status !== 'resolved') {
                    return ok({
                        status: bookingResult.status,
                        kind: 'service_booking',
                        reason_code: bookingResult.reason_code || 'BOOKING_NOT_RESOLVED',
                        access_policy: accessPolicy,
                        booking: null,
                        item: null,
                        barcode: {
                            code,
                            normalized_code: normalizeBarcodeValue(code),
                            source: 'system_generated_reference',
                            scope: 'ticket',
                            symbology: 'qr',
                            packaging_level: 'ticket',
                            quantity_multiplier: 1
                        },
                        cart_allowed: false,
                        checkout_allowed: false
                    });
                }
                return ok({
                    status: 'resolved',
                    kind: 'service_booking',
                    reason_code: null,
                    access_policy: accessPolicy,
                    booking: bookingResult.booking,
                    item: null,
                    barcode: {
                        code,
                        normalized_code: normalizeBarcodeValue(code),
                        source: 'system_generated_reference',
                        scope: 'ticket',
                        symbology: 'qr',
                        packaging_level: 'ticket',
                        quantity_multiplier: 1
                    },
                    cart_allowed: false,
                    checkout_allowed: false
                });
            }

            const result = await storeRepository.resolvePublicBarcode({
                code,
                location_id: requestedLocationId
            });
            if (result.status !== 'resolved') {
                return ok({
                    status: result.status,
                    reason_code: result.reason_code || 'BARCODE_NOT_RESOLVED',
                    access_policy: accessPolicy,
                    item: null,
                    barcode: result.barcode || null,
                    cart_allowed: false,
                    checkout_allowed: false
                });
            }

            if (!hasExplicitSalePrice(result.item)) {
                return ok(buildStorefrontMissingPriceResult({
                    accessPolicy,
                    barcode: result.barcode || null
                }));
            }

            const item = serializeStoreCatalogItem(result.item, accessPolicy);
            return ok({
                status: 'resolved',
                reason_code: null,
                barcode: result.barcode,
                item,
                access_policy: accessPolicy,
                cart_allowed: accessPolicy?.access_capabilities?.cart === true,
                checkout_allowed: accessPolicy?.access_capabilities?.checkout === true
            });
        } catch (error) {
            if (error instanceof DomainError) {
                return fail(error);
            }
            return fail(mapStoreUseCaseError(error, 'Failed to resolve storefront QR'));
        }
    };
};

export const buildListStoreLocationsUseCase = ({ storeRepository }) => {
    return async () => {
        try {
            const locations = await storeRepository.listActiveLocations();
            const serialized = (Array.isArray(locations) ? locations : []).map((location) => (
                serializeLocationSummary(location)
            ));
            const primary = serialized.find((location) => location?.is_primary_storefront === true) || null;

            return ok({
                locations: serialized,
                primary_location_id: primary?.location_id || null
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to list storefront locations'));
        }
    };
};

export const buildLoginStoreCustomerUseCase = ({ storeRepository }) => {
    return async ({ tenantId, payload }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const normalizedTenantId = ensureTenantContext(tenantId);
            const email = String(payload.email || '').trim().toLowerCase();
            const password = String(payload.password || '');
            if (!email || !password) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'email and password are required',
                    { statusCode: 422 }
                );
            }

            const existing = await storeRepository.findCustomerByEmail(email);
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.AUTHENTICATION_FAILED,
                    'Invalid email or password',
                    { statusCode: 401 }
                );
            }
            if (existing.is_active === false) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Store customer account is inactive',
                    { statusCode: 403 }
                );
            }

            const passwordMatches = await bcrypt.compare(password, existing.password_hash);
            if (!passwordMatches) {
                throw new DomainError(
                    DomainErrorCode.AUTHENTICATION_FAILED,
                    'Invalid email or password',
                    { statusCode: 401 }
                );
            }

            await storeRepository.updateCustomerById(existing.customer_id, {
                last_login: new Date()
            });

            const safeCustomer = sanitizeCustomer(existing);
            const token = generateStoreToken({
                customer: safeCustomer,
                tenantId: normalizedTenantId
            });

            return ok({
                customer: safeCustomer,
                token,
                token_type: 'Bearer',
                expires_in: getStoreTokenConfig().expiresIn
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to login store customer'));
        }
    };
};

export const buildGetStoreCustomerMeUseCase = ({ storeRepository }) => {
    return async ({ customerId }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        if (!normalizedCustomerId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Store customer authentication required',
                { statusCode: 401 }
            ));
        }

        try {
            const customer = await storeRepository.findCustomerById(normalizedCustomerId);
            if (!customer) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Store customer account not found',
                    { statusCode: 404 }
                );
            }
            return ok({ customer: sanitizeCustomer(customer) });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to load store customer profile'));
        }
    };
};

export const buildListStoreCustomerAddressesUseCase = ({ storeRepository }) => {
    return async ({ customerId }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        if (!normalizedCustomerId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Store customer authentication required',
                { statusCode: 401 }
            ));
        }

        try {
            const addresses = await storeRepository.listCustomerAddresses(normalizedCustomerId);
            return ok({ addresses });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to list saved addresses'));
        }
    };
};

export const buildCreateStoreCustomerAddressUseCase = ({ storeRepository }) => {
    return async ({ customerId, payload }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        if (!normalizedCustomerId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Store customer authentication required',
                { statusCode: 401 }
            ));
        }
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const transaction = await storeRepository.beginTransaction();

        try {
            const label = String(payload.label || 'Address').trim() || 'Address';
            const addressLine = String(payload.address_line || '').trim();
            const latitude = toNumberOrNull(payload.latitude);
            const longitude = toNumberOrNull(payload.longitude);
            let isDefault = payload.is_default === true;

            if (!addressLine) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'address_line is required',
                    { statusCode: 422 }
                );
            }

            const existingAddresses = await storeRepository.listCustomerAddresses(normalizedCustomerId, { transaction });
            if (existingAddresses.length === 0) {
                isDefault = true;
            }

            if (isDefault) {
                await storeRepository.clearDefaultAddress(normalizedCustomerId, { transaction });
            }

            const created = await storeRepository.createAddress({
                customer_id: normalizedCustomerId,
                label,
                address_line: addressLine,
                latitude,
                longitude,
                is_default: isDefault
            }, { transaction });

            await transaction.commit();
            return ok({ address: created });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to create saved address'));
        }
    };
};

export const buildUpdateStoreCustomerAddressUseCase = ({ storeRepository }) => {
    return async ({ customerId, addressId, payload }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        const normalizedAddressId = parsePositiveInt(addressId);
        if (!normalizedCustomerId || !normalizedAddressId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid customer and address identifiers are required',
                { statusCode: 400 }
            ));
        }
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const transaction = await storeRepository.beginTransaction();

        try {
            const existing = await storeRepository.findAddressById(normalizedAddressId, {
                transaction,
                lock: true
            });
            if (!existing || Number(existing.customer_id) !== normalizedCustomerId) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Saved address not found',
                    { statusCode: 404 }
                );
            }

            const label = payload.label == null ? existing.label : String(payload.label || '').trim() || 'Address';
            const addressLine = payload.address_line == null ? existing.address_line : String(payload.address_line || '').trim();
            const latitude = payload.latitude == null ? toNumberOrNull(existing.latitude) : toNumberOrNull(payload.latitude);
            const longitude = payload.longitude == null ? toNumberOrNull(existing.longitude) : toNumberOrNull(payload.longitude);
            const isDefault = payload.is_default == null ? existing.is_default === true : payload.is_default === true;

            if (!addressLine) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'address_line is required',
                    { statusCode: 422 }
                );
            }

            if (isDefault) {
                await storeRepository.clearDefaultAddress(normalizedCustomerId, { transaction });
            }

            const updated = await storeRepository.updateAddressById(normalizedAddressId, {
                label,
                address_line: addressLine,
                latitude,
                longitude,
                is_default: isDefault
            }, { transaction });

            await transaction.commit();
            return ok({ address: updated });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to update saved address'));
        }
    };
};

export const buildSetDefaultStoreCustomerAddressUseCase = ({ storeRepository }) => {
    return async ({ customerId, addressId }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        const normalizedAddressId = parsePositiveInt(addressId);
        if (!normalizedCustomerId || !normalizedAddressId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid customer and address identifiers are required',
                { statusCode: 400 }
            ));
        }

        const transaction = await storeRepository.beginTransaction();

        try {
            const address = await storeRepository.findAddressById(normalizedAddressId, {
                transaction,
                lock: true
            });
            if (!address || Number(address.customer_id) !== normalizedCustomerId) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Saved address not found',
                    { statusCode: 404 }
                );
            }

            await storeRepository.clearDefaultAddress(normalizedCustomerId, { transaction });
            const updated = await storeRepository.updateAddressById(normalizedAddressId, {
                is_default: true
            }, { transaction });

            await transaction.commit();
            return ok({ address: updated });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to set default address'));
        }
    };
};

export const buildDeleteStoreCustomerAddressUseCase = ({ storeRepository }) => {
    return async ({ customerId, addressId }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        const normalizedAddressId = parsePositiveInt(addressId);
        if (!normalizedCustomerId || !normalizedAddressId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid customer and address identifiers are required',
                { statusCode: 400 }
            ));
        }

        const transaction = await storeRepository.beginTransaction();

        try {
            const existing = await storeRepository.findAddressById(normalizedAddressId, {
                transaction,
                lock: true
            });
            if (!existing || Number(existing.customer_id) !== normalizedCustomerId) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Saved address not found',
                    { statusCode: 404 }
                );
            }

            const wasDefault = existing.is_default === true;
            await storeRepository.deleteAddressById(normalizedAddressId, { transaction });

            if (wasDefault) {
                const remaining = await storeRepository.listCustomerAddresses(normalizedCustomerId, { transaction });
                if (remaining.length > 0) {
                    await storeRepository.updateAddressById(remaining[0].address_id, { is_default: true }, { transaction });
                }
            }

            await transaction.commit();
            return ok({ deleted: true, address_id: normalizedAddressId });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to delete saved address'));
        }
    };
};

export const buildStoreCartQuoteUseCase = ({ storeRepository }) => {
    return async ({ payload, storeCustomer = null }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const resolved = await resolveCheckoutContext({ storeRepository, payload, storeCustomer });
            return ok({
                subtotal_amount: resolved.prepared.subtotalAmount,
                service_fee_amount: resolved.serviceFeeAmount,
                service_fee_label: resolved.serviceFeeLabel,
                delivery_fee: resolved.deliveryFee,
                total_amount: resolved.totalAmount,
                vatable_sales: resolved.prepared.vatableSales,
                vat_amount: resolved.prepared.vatAmount,
                vat_exempt_sales: resolved.prepared.vatExemptSales,
                zero_rated_sales: resolved.prepared.zeroRatedSales,
                outside_radius_flag: resolved.outsideRadiusFlag,
                storefront_open: resolved.storefront_open,
                estimated_wait_minutes: resolved.estimated_wait_minutes,
                location: resolved.location ? {
                    location_id: resolved.location.location_id,
                    name: resolved.location.name,
                    address_line: resolved.location.address_line,
                    delivery_radius_km: resolved.location.delivery_radius_km,
                    is_open: resolved.location.is_open,
                    is_active: resolved.location.is_active,
                    supports_delivery: resolved.location.supports_delivery,
                    supports_pickup: resolved.location.supports_pickup,
                    supports_dine_in: resolved.location.supports_dine_in
                } : null,
                lines: resolved.prepared.preparedLines.map((line) => ({
                    item_id: line.item_id,
                    item_name: line.item_name,
                    quantity: line.quantity,
                    sale_price: line.sale_price,
                    line_subtotal: line.line_subtotal,
                    vat_type: line.vat_type_snapshot,
                    fnb_course_snapshot: line.fnb_course_snapshot || null,
                    fnb_modifiers_snapshot: line.fnb_modifiers_snapshot || null
                }))
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to compute cart quote'));
        }
    };
};

export const buildStoreCheckoutUseCase = ({ storeRepository }) => {
    return async ({ tenantId, payload, storeCustomer = null }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        let normalizedTenantId;
        try {
            normalizedTenantId = ensureTenantContext(tenantId);
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to complete storefront checkout'));
        }

        const normalizedStoreCustomerId = parsePositiveInt(storeCustomer?.customer_id);
        const normalizedStoreCustomer = normalizedStoreCustomerId
            ? {
                customer_id: normalizedStoreCustomerId,
                dgfy_account_id: String(storeCustomer?.dgfy_account_id || '').trim() || null,
                name: String(storeCustomer?.name || '').trim(),
                email: String(storeCustomer?.email || '').trim().toLowerCase(),
                phone: String(storeCustomer?.phone || '').trim()
            }
            : null;

        const transaction = await storeRepository.beginTransaction();

        try {
            const pendingNormalized = buildNormalizedCheckoutRequest(payload, normalizedStoreCustomer);
            const pendingIdempotencyKey = String(pendingNormalized.idempotency_key || '').trim();
            if (!pendingIdempotencyKey) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'idempotency_key is required',
                    { statusCode: 400 }
                );
            }
            const existing = await storeRepository.findTransactionByIdempotencyKey(pendingIdempotencyKey, {
                transaction,
                lock: true
            });
            const idempotencyKey = pendingIdempotencyKey;
            const resolved = await resolveCheckoutContext({
                storeRepository,
                payload,
                storeCustomer: normalizedStoreCustomer,
                options: { transaction, lock: true },
                validateRecipeAvailability: !existing
            });
            const { normalized } = resolved;

            const requestHash = hashPayload({
                location_id: normalized.location_id,
                order_method: normalized.order_method,
                payment_type: normalized.payment_type,
                customer_name: normalized.customer_name,
                customer_phone: normalized.customer_phone,
                customer_email: normalized.customer_email,
                delivery_address: normalized.delivery_address,
                delivery_latitude: normalized.delivery_latitude,
                delivery_longitude: normalized.delivery_longitude,
                scheduled_for: normalized.scheduled_for,
                special_instructions: normalized.special_instructions,
                lines: normalized.lines
            });

            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key was already used with a different payload',
                        { statusCode: 409 }
                    );
                }

                const cancelProof = buildCancelProofForOrder({
                    order: existing,
                    tenantId: normalizedTenantId
                });
                const accountAction = await buildOrderAccountAction({
                    storeRepository,
                    order: existing,
                    tenantId: normalizedTenantId,
                    storeCustomer: normalizedStoreCustomer,
                    options: { transaction }
                });

                await transaction.commit();
                await recordDgfyOrderActivity({
                    tenantId: normalizedTenantId,
                    order: existing,
                    storeCustomer: normalizedStoreCustomer
                }).catch((error) => logger.warn('[DGFYCustomer] Failed to sync idempotent order activity', {
                    error: error?.message,
                    tracking_pin: existing?.tracking_pin
                }));
                return ok({
                    idempotent_replay: true,
                    order: serializeOrderForCustomer(existing),
                    tracking_pin: existing.tracking_pin,
                    account_action: accountAction,
                    cancel_proof: cancelProof,
                    cancel_proof_expires_in: cancelProof ? getStoreTokenConfig().cancelProofExpiresIn : null
                });
            }

            const trackingPin = await generateUniqueTrackingPin(storeRepository, {
                transaction,
                lock: true
            });
            const invoiceNumber = await storeRepository.nextInvoiceNumber(INVOICE_COUNTER_KEY, { transaction });

            const orderId = await storeRepository.createOnlineTransactionWithLines({
                header: {
                    invoice_number: invoiceNumber,
                    idempotency_key: idempotencyKey,
                    request_hash: requestHash,
                    cashier_id: null,
                    shift_id: null,
                    terminal_id: 'ONLINE_STORE',
                    order_source: 'online_store',
                    order_method: normalized.order_method,
                    payment_type: normalized.payment_type,
                    fulfillment_status: 'placed',
                    subtotal_amount: resolved.prepared.subtotalAmount,
                    vatable_sales: resolved.prepared.vatableSales,
                    vat_amount: resolved.prepared.vatAmount,
                    vat_exempt_sales: resolved.prepared.vatExemptSales,
                    zero_rated_sales: resolved.prepared.zeroRatedSales,
                    discount_amount: 0,
                    discount_label_snapshot: null,
                    discount_rate_snapshot: null,
                    service_fee_amount: resolved.serviceFeeAmount,
                    service_fee_label_snapshot: resolved.serviceFeeLabel,
                    service_fee_method_snapshot: resolved.serviceFeeAmount > 0 ? normalized.order_method : null,
                    service_fee_overridden: false,
                    total_amount: resolved.totalAmount,
                    status: 'completed',
                    location_id: normalized.location_id,
                    tracking_pin: trackingPin,
                    customer_name: normalized.customer_name,
                    customer_phone: normalized.customer_phone || null,
                    customer_email: normalized.customer_email || null,
                    delivery_address: normalized.delivery_address || null,
                    delivery_latitude: normalized.delivery_latitude,
                    delivery_longitude: normalized.delivery_longitude,
                    scheduled_for: resolved.scheduledFor,
                    special_instructions: normalized.special_instructions || null,
                    delivery_fee: resolved.deliveryFee,
                    store_customer_id: normalizedStoreCustomer?.customer_id || null,
                    outside_radius_flag: resolved.outsideRadiusFlag,
                    accepted_by: null,
                    accepted_at: null
                },
                lines: resolved.prepared.preparedLines
            }, { transaction });

            const shouldCreateFnbKitchenOrder = (
                resolved.recipePlan.allMovements.length > 0
                || resolved.prepared.preparedLines.some((line) => line.fnb_course_snapshot || line.fnb_modifiers_snapshot)
            );
            if (shouldCreateFnbKitchenOrder) {
                if (typeof storeRepository.createFnbKitchenOrderForOnlineTransaction !== 'function') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'F&B kitchen order persistence is unavailable for storefront checkout',
                        {
                            statusCode: 409,
                            details: { reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE' }
                        }
                    );
                }
                const kitchenOrder = await storeRepository.createFnbKitchenOrderForOnlineTransaction({
                    pos_transaction_id: orderId,
                    order_method: normalized.order_method,
                    location_id: normalized.location_id,
                    customer_name: normalized.customer_name,
                    special_instructions: normalized.special_instructions,
                    lines: resolved.prepared.preparedLines,
                    recipe_movements: resolved.recipePlan.allMovements
                }, { transaction });
                if (!kitchenOrder) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'F&B kitchen order could not be created for storefront checkout',
                        {
                            statusCode: 409,
                            details: { reason_code: 'FNB_KITCHEN_ORDER_UNAVAILABLE' }
                        }
                    );
                }
            }

            const created = await storeRepository.getOrderById(orderId, { transaction });
            const cancelProof = buildCancelProofForOrder({
                order: created,
                tenantId: normalizedTenantId
            });
            const accountAction = await buildOrderAccountAction({
                storeRepository,
                order: created,
                tenantId: normalizedTenantId,
                storeCustomer: normalizedStoreCustomer,
                options: { transaction }
            });
            await transaction.commit();
            await recordDgfyOrderActivity({
                tenantId: normalizedTenantId,
                order: created,
                storeCustomer: normalizedStoreCustomer
            }).catch((error) => logger.warn('[DGFYCustomer] Failed to sync order activity', {
                error: error?.message,
                tracking_pin: created?.tracking_pin
            }));

            return ok({
                idempotent_replay: false,
                tracking_pin: trackingPin,
                order: serializeOrderForCustomer(created),
                account_action: accountAction,
                cancel_proof: cancelProof,
                cancel_proof_expires_in: cancelProof ? getStoreTokenConfig().cancelProofExpiresIn : null
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to complete storefront checkout'));
        }
    };
};

export const buildTrackStoreOrderUseCase = ({ storeRepository }) => {
    return async ({ trackingPin, tenantId }) => {
        let normalizedTrackingPin = null;
        try {
            ensureTenantContext(tenantId);
            normalizedTrackingPin = ensureValidTrackingPin(trackingPin);
            const order = await storeRepository.getOrderByTrackingPin(normalizedTrackingPin);
            if (!order) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Tracking PIN was not found',
                    { statusCode: 404 }
                );
            }
            if (!FULFILLMENT_STATUSES.includes(order.fulfillment_status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Order tracking state is invalid',
                    { statusCode: 409 }
                );
            }

            const rejected = order.fulfillment_status === 'rejected';
            const cancelled = order.fulfillment_status === 'cancelled';

            return ok({
                tracking_pin: normalizedTrackingPin,
                status: order.fulfillment_status,
                status_label: toStatusLabel(order.fulfillment_status),
                is_trackable: !rejected && !cancelled,
                message: rejected
                    ? 'This order was not accepted by the store.'
                    : cancelled
                        ? 'This order was cancelled.'
                        : 'Tracking information loaded successfully.',
                order: serializeOrderForPublicTracking(order)
            });
        } catch (error) {
            if (error?.code === DomainErrorCode.VALIDATION_FAILED || error?.code === DomainErrorCode.RESOURCE_NOT_FOUND) {
                recordTrackingFailure({
                    action: 'track',
                    tenantId,
                    trackingPin: normalizedTrackingPin || trackingPin,
                    reason: error.code
                });
            }
            return fail(mapStoreUseCaseError(error, 'Failed to track store order'));
        }
    };
};

export const buildClaimStoreOrderUseCase = ({ storeRepository }) => {
    return async ({ trackingPin, tenantId, storeCustomer = null, payload = {} }) => {
        const normalizedCustomerId = parsePositiveInt(storeCustomer?.customer_id);
        if (!normalizedCustomerId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Store customer authentication is required',
                { statusCode: 401 }
            ));
        }

        const transaction = await storeRepository.beginTransaction();
        try {
            const normalizedTenantId = ensureTenantContext(tenantId);
            const normalizedTrackingPin = ensureValidTrackingPin(trackingPin);
            const token = String(payload.claim_token || '').trim();
            if (!token) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'claim_token is required',
                    { statusCode: 422 }
                );
            }
            let proof;
            try {
                proof = verifyStoreClaimToken(token);
            } catch {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Claim token is invalid or expired',
                    { statusCode: 403 }
                );
            }

            const proofTenantId = normalizeTenantIdentifier(proof?.tenant_id);
            const proofOrderId = parsePositiveInt(proof?.order_id);
            const proofTrackingPin = String(proof?.tracking_pin || '').trim().toUpperCase();
            const proofEmail = String(proof?.email || '').trim().toLowerCase();
            const customerEmail = String(storeCustomer?.email || '').trim().toLowerCase();
            if (
                proof?.type !== 'store_order_claim'
                || proofTenantId !== normalizedTenantId
                || proofTrackingPin !== normalizedTrackingPin
                || !proofOrderId
                || !proofEmail
                || !customerEmail
                || proofEmail !== customerEmail
            ) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Claim token does not match this order or account',
                    { statusCode: 403 }
                );
            }

            const order = await storeRepository.getOrderById(proofOrderId, {
                transaction,
                lock: true
            });
            if (!order || String(order.tracking_pin || '').trim().toUpperCase() !== normalizedTrackingPin) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order not found', { statusCode: 404 });
            }
            if (order.store_customer_id) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Order is already linked to an account', { statusCode: 409 });
            }
            await storeRepository.updateOrderById(order.pos_transaction_id, {
                store_customer_id: normalizedCustomerId
            }, { transaction, lock: true });
            const updated = await storeRepository.getOrderById(order.pos_transaction_id, { transaction });
            await transaction.commit();
            await recordDgfyOrderActivity({
                tenantId: normalizedTenantId,
                order: updated,
                storeCustomer
            }).catch((error) => logger.warn('[DGFYCustomer] Failed to sync claimed order activity', {
                error: error?.message,
                tracking_pin: updated?.tracking_pin
            }));
            return ok({ order: serializeOrderForCustomer(updated) });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to claim order'));
        }
    };
};

export const buildCancelStoreOrderUseCase = ({ storeRepository }) => {
    return async ({ trackingPin, tenantId, storeCustomer = null, payload = {} }) => {
        let normalizedTrackingPin = null;
        const transaction = await storeRepository.beginTransaction();

        try {
            const normalizedTenantId = ensureTenantContext(tenantId);
            const normalizedStoreCustomerId = parsePositiveInt(storeCustomer?.customer_id);
            const cancelProofToken = String(payload?.cancel_proof || '').trim();

            normalizedTrackingPin = ensureValidTrackingPin(trackingPin);
            const existing = await storeRepository.getOrderByTrackingPin(normalizedTrackingPin, {
                transaction,
                lock: true
            });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Tracking PIN was not found',
                    { statusCode: 404 }
                );
            }

            const orderStoreCustomerId = parsePositiveInt(existing.store_customer_id);
            if (orderStoreCustomerId) {
                if (!normalizedStoreCustomerId || normalizedStoreCustomerId !== orderStoreCustomerId) {
                    throw new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'You are not allowed to cancel this order',
                        { statusCode: 403 }
                    );
                }
            } else {
                if (!cancelProofToken) {
                    throw new DomainError(
                        DomainErrorCode.AUTHENTICATION_FAILED,
                        'cancel_proof is required to cancel guest orders',
                        { statusCode: 401 }
                    );
                }

                let proof;
                try {
                    proof = verifyStoreCancelProof(cancelProofToken);
                } catch {
                    throw new DomainError(
                        DomainErrorCode.AUTHENTICATION_FAILED,
                        'Invalid or expired cancel_proof',
                        { statusCode: 401 }
                    );
                }

                const proofTenantId = normalizeTenantIdentifier(proof?.tenant_id);
                const proofOrderId = parsePositiveInt(proof?.order_id);
                const proofTrackingPin = String(proof?.tracking_pin || '').trim().toUpperCase();
                if (
                    proof?.type !== 'store_cancel_proof'
                    || !proofTenantId
                    || proofTenantId !== normalizedTenantId
                    || !proofOrderId
                    || proofOrderId !== parsePositiveInt(existing.pos_transaction_id)
                    || !proofTrackingPin
                    || proofTrackingPin !== normalizedTrackingPin
                ) {
                    throw new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'cancel_proof does not match this order',
                        { statusCode: 403 }
                    );
                }
            }

            if (!['placed', 'confirmed'].includes(existing.fulfillment_status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Order can only be cancelled before preparing.',
                    { statusCode: 409 }
                );
            }

            await storeRepository.updateOrderByTrackingPin(normalizedTrackingPin, {
                fulfillment_status: 'cancelled'
            }, { transaction });

            const updated = await storeRepository.getOrderByTrackingPin(normalizedTrackingPin, { transaction });
            await transaction.commit();
            await recordDgfyOrderActivity({
                tenantId: normalizedTenantId,
                order: updated,
                storeCustomer
            }).catch((error) => logger.warn('[DGFYCustomer] Failed to sync cancelled order activity', {
                error: error?.message,
                tracking_pin: normalizedTrackingPin
            }));

            return ok({
                tracking_pin: normalizedTrackingPin,
                status: 'cancelled',
                order: serializeOrderForPublicTracking(updated)
            });
        } catch (error) {
            if (error?.code === DomainErrorCode.VALIDATION_FAILED || error?.code === DomainErrorCode.RESOURCE_NOT_FOUND || error?.code === DomainErrorCode.AUTHENTICATION_FAILED || error?.code === DomainErrorCode.AUTHORIZATION_FAILED) {
                recordTrackingFailure({
                    action: 'cancel',
                    tenantId,
                    trackingPin: normalizedTrackingPin || trackingPin,
                    reason: error.code
                });
            }
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapStoreUseCaseError(error, 'Failed to cancel store order'));
        }
    };
};

export const buildListStoreCustomerOrdersUseCase = ({ storeRepository }) => {
    return async ({ customerId, query }) => {
        const normalizedCustomerId = parsePositiveInt(customerId);
        if (!normalizedCustomerId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Store customer authentication required',
                { statusCode: 401 }
            ));
        }
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const result = await storeRepository.listOrdersByCustomer(normalizedCustomerId, query || {});
            return ok(buildOrderHistoryResponse(result));
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to list store order history'));
        }
    };
};

const FOLLOW_VISITOR_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

const resolveStorefrontSlugGuard = async ({ storeRepository }) => {
    const settingsRows = await storeRepository.getSettingsByKeys(['store_tenant_slug']);
    const configured = String(settingsRows?.store_tenant_slug?.value || '').trim().toLowerCase();
    if (!configured) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            'Storefront slug is not configured for this tenant',
            { statusCode: 404 }
        );
    }
    return configured;
};

const normalizeStorefrontFollowInput = async ({ storeRepository, tenantId, payload = {}, storeCustomer = null }) => {
    const normalizedTenantId = ensureTenantContext(tenantId);
    const configuredTenantSlug = await resolveStorefrontSlugGuard({ storeRepository, tenantId: normalizedTenantId });
    const storefrontSlug = String(payload?.storefront_slug || '').trim().toLowerCase();
    const visitorId = String(payload?.visitor_id || '').trim();

    if (!storefrontSlug || storefrontSlug.length > 120 || !/^[a-z0-9-]+$/.test(storefrontSlug)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'storefront_slug must contain lowercase letters, numbers, and hyphens',
            { statusCode: 422 }
        );
    }
    if (storefrontSlug !== configuredTenantSlug) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            'Storefront slug was not found for this tenant',
            { statusCode: 404 }
        );
    }

    const customerId = parsePositiveInt(storeCustomer?.customer_id);
    const identityType = customerId ? 'customer' : 'guest';
    if (!customerId) {
        if (!FOLLOW_VISITOR_ID_PATTERN.test(visitorId)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'visitor_id is required and must be a stable 16-128 character token',
                { statusCode: 422 }
            );
        }
    }
    const identitySeed = customerId ? `customer:${customerId}` : `guest:${visitorId}`;

    return {
        tenantId: normalizedTenantId,
        storefrontSlug,
        identityType,
        visitorFingerprint: hashStableFingerprint(identitySeed)
    };
};

export const buildGetStorefrontFollowStatusUseCase = ({ storeRepository }) => {
    return async ({ tenantId, payload = {}, storeCustomer = null }) => {
        try {
            const normalized = await normalizeStorefrontFollowInput({ storeRepository, tenantId, payload, storeCustomer });
            const [existing, followersCount] = await Promise.all([
                storeRepository.findStorefrontFollow(normalized),
                storeRepository.countStorefrontFollowsBySlug(normalized)
            ]);
            return ok({
                storefront_slug: normalized.storefrontSlug,
                followers_count: followersCount,
                is_following: Boolean(existing)
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to get storefront follow status'));
        }
    };
};

export const buildFollowStorefrontUseCase = ({ storeRepository }) => {
    return async ({ tenantId, payload = {}, storeCustomer = null }) => {
        try {
            const normalized = await normalizeStorefrontFollowInput({ storeRepository, tenantId, payload, storeCustomer });
            await storeRepository.upsertStorefrontFollow(normalized);
            const followersCount = await storeRepository.countStorefrontFollowsBySlug(normalized);
            return ok({
                storefront_slug: normalized.storefrontSlug,
                followers_count: followersCount,
                is_following: true
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to follow storefront'));
        }
    };
};

export const buildUnfollowStorefrontUseCase = ({ storeRepository }) => {
    return async ({ tenantId, payload = {}, storeCustomer = null }) => {
        try {
            const normalized = await normalizeStorefrontFollowInput({ storeRepository, tenantId, payload, storeCustomer });
            await storeRepository.deleteStorefrontFollow(normalized);
            const followersCount = await storeRepository.countStorefrontFollowsBySlug(normalized);
            return ok({
                storefront_slug: normalized.storefrontSlug,
                followers_count: followersCount,
                is_following: false
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to unfollow storefront'));
        }
    };
};
