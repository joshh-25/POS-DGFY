import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapStoreUseCaseError } from './storeUseCaseError.js';
import logger from '../../../config/logger.js';
import {
    computeDgfyConvenienceFee,
    getDgfyConvenienceFeeLabel
} from '../../shared/utils/dgfyConvenienceFee.js';
import {
    generateStoreCancelProof,
    generateStoreToken,
    getStoreTokenConfig,
    normalizeTenantIdentifier,
    verifyStoreCancelProof
} from '../utils/storeJwtToken.js';

const INVOICE_COUNTER_KEY = 'POS_OR';
const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery'];
const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer'];
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
            quantity: round4(line.quantity)
        }))
        .sort((a, b) => a.item_id - b.item_id);

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

const prepareCheckoutLines = ({ rawLines, itemMap, allowOutOfStockSales = false }) => {
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'At least one checkout line is required',
            { statusCode: 400 }
        );
    }

    const preparedLines = [];
    let subtotalAmount = 0;

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

        const currentStock = Number(item.current_stock || 0);
        if (!allowOutOfStockSales && currentStock + 0.000001 < quantity) {
            const stockViolation = {
                item_id: item.item_id,
                item_name: item.name,
                available_stock: round4(currentStock),
                requested_qty: round4(quantity),
                unit_of_measure: item.unit_of_measure || null
            };
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${quantity}`,
                {
                    statusCode: 422,
                    details: {
                        stock_violation: stockViolation,
                        stock_violations: [stockViolation]
                    }
                }
            );
        }

        const resolvedPrice = item.default_sale_price != null
            ? Number(item.default_sale_price)
            : Number(item.cost_per_unit || 0);
        if (!Number.isFinite(resolvedPrice) || resolvedPrice < 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Invalid sale price for item ${line.item_id}`,
                { statusCode: 422 }
            );
        }

        const lineSubtotal = round4(quantity * resolvedPrice);
        subtotalAmount = round4(subtotalAmount + lineSubtotal);

        preparedLines.push({
            item_id: item.item_id,
            item_name: item.name,
            quantity: round4(quantity),
            unit_of_measure: item.unit_of_measure || null,
            cost_snapshot: item.cost_per_unit != null ? round4(item.cost_per_unit) : null,
            sale_price: round4(resolvedPrice),
            sale_price_overridden: false,
            price_override_reason: null,
            line_subtotal: lineSubtotal,
            vat_type_snapshot: item.vat_type || 'vatable',
            vat_rate_snapshot: round4(VAT_RATE)
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
    const rawStatus = String(item?.availability_status || '').trim().toLowerCase();
    if (rawStatus === 'in_stock' || rawStatus === 'out_of_stock') {
        return rawStatus;
    }
    if (item?.is_available === true) return 'in_stock';
    if (item?.is_available === false) return 'out_of_stock';
    return 'out_of_stock';
};

const serializeStoreCatalogItem = (item = {}) => {
    const availabilityStatus = normalizeAvailabilityStatus(item);
    const isAvailable = availabilityStatus === 'in_stock';
    return {
        item_id: item.item_id,
        name: item.name,
        category: item.category,
        product_type: item.product_type || null,
        unit_of_measure: item.unit_of_measure || null,
        default_sale_price: item.default_sale_price,
        vat_type: item.vat_type || 'vatable',
        image_url: item.image_url || null,
        is_available: isAvailable,
        availability_status: availabilityStatus
    };
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

const resolveCheckoutContext = async ({ storeRepository, payload, storeCustomer = null, options = {} }) => {
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
        storeRepository.getSettingsByKeys(['store_delivery_fee', 'pos_open_status', 'pos_wait_time_minutes'], options)
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
    assertCheckoutLocationOperationalReadiness({
        location,
        settings,
        orderMethod
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
    const prepared = prepareCheckoutLines({
        rawLines: normalized.lines,
        itemMap,
        allowOutOfStockSales
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

            const items = await storeRepository.listStoreCatalog({
                search: query.search,
                limit: query.limit,
                location_id: requestedLocationId
            });
            const serializedItems = (Array.isArray(items) ? items : []).map((item) => (
                serializeStoreCatalogItem(item)
            ));

            return ok({
                items: serializedItems,
                pagination: {
                    limit: Number.isFinite(Number(query.limit))
                        ? Math.max(1, Math.min(200, Number(query.limit)))
                        : 60,
                    count: serializedItems.length
                }
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
                    vat_type: line.vat_type_snapshot
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
                name: String(storeCustomer?.name || '').trim(),
                email: String(storeCustomer?.email || '').trim().toLowerCase(),
                phone: String(storeCustomer?.phone || '').trim()
            }
            : null;

        const transaction = await storeRepository.beginTransaction();

        try {
            const resolved = await resolveCheckoutContext({
                storeRepository,
                payload,
                storeCustomer: normalizedStoreCustomer,
                options: { transaction, lock: true }
            });
            const { normalized } = resolved;

            const idempotencyKey = String(normalized.idempotency_key || '').trim();
            if (!idempotencyKey) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'idempotency_key is required',
                    { statusCode: 400 }
                );
            }

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

            const existing = await storeRepository.findTransactionByIdempotencyKey(idempotencyKey, {
                transaction,
                lock: true
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

                await transaction.commit();
                return ok({
                    idempotent_replay: true,
                    order: serializeOrderForCustomer(existing),
                    tracking_pin: existing.tracking_pin,
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

            const created = await storeRepository.getOrderById(orderId, { transaction });
            const cancelProof = buildCancelProofForOrder({
                order: created,
                tenantId: normalizedTenantId
            });
            await transaction.commit();

            return ok({
                idempotent_replay: false,
                tracking_pin: trackingPin,
                order: serializeOrderForCustomer(created),
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

            if (existing.fulfillment_status !== 'placed') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This order has already been accepted and cannot be cancelled.',
                    { statusCode: 409 }
                );
            }

            await storeRepository.updateOrderByTrackingPin(normalizedTrackingPin, {
                fulfillment_status: 'cancelled'
            }, { transaction });

            const updated = await storeRepository.getOrderByTrackingPin(normalizedTrackingPin, { transaction });
            await transaction.commit();

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
