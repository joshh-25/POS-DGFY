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
import { tenantRevenueSharingEnabled } from '../../../config/tenantRevenueFeature.js';
import {
    accruePendingForOnlineOrder,
    resolveActiveAffiliateEnrollmentById,
    resolveCommissionRateBps,
    // #448 (Phase 209) - the category-aware commission ladder, shared with the POS path so the two
    // channels can never diverge.
    loadApplicableCategoryRates,
    computeCategoryAwareCommission
} from '../../dgfy/utils/affiliateCommissionAccrual.js';
import { dgfyAffiliateRepository } from '../../dgfy/repositories/dgfyAffiliateRepository.js';
import { resolveAffiliateUnitPriceCentavos } from '../../shared/utils/affiliatePricingPolicy.js';
// Phase 140 (#821, ADR 0069/0070): server-authoritative downpayment resolution at quote/checkout.
// Unlike dgfyAffiliateRepository above, downpaymentSettingsRepository is NOT hard-imported here --
// every order needs this lookup (there is no per-request opt-out signal the way
// attribution_enrollment_id gates the affiliate lookup), so a hard import would make it an
// unconditional, unmockable live landlord-DB call on every existing store unit test. Instead it's
// threaded through as an optional constructor dependency, same pattern as tenantRevenueRepository
// (store/index.js wires the real one; a caller that omits it -- every existing unit test -- gets
// `undefined`, which the `?.` guards below treat as "no settings, full_payment").
import { resolveDownpaymentForTotal } from '../../shared/utils/downpaymentPolicy.js';
import {
    previewVoucherEligibilityUseCase,
    redeemVoucherUseCase,
    resolveVoucherDisplayPricesUseCase,
    VoucherReasonCode,
    // #1390: the checkout-side half of closing the redemption<->order link -- see the
    // attachRedemptionsToTransaction call site below, near the two VOUCHER_REDEMPTION_UNRECORDED
    // guards. cancelStoreOrderUseCase's own half is injected as an optional builder dependency
    // instead (store/index.js), not imported here -- see buildCancelStoreOrderUseCase's own comment.
    voucherRepository,
    // #1332 (Phase 244, epic #1321 decision 9): the auto-applied delivery-campaign selector's use
    // case -- one query plus the pure selector, see voucherAutoApplyUseCases.js.
    resolveAutoAppliedDeliveryCampaignUseCase
} from '../../vouchers/index.js';
// Phase 233 (#1324, epic #1321): fee-mode config schema. Phase 237 (#1329) wires the calculated-mode
// formula and fail-open-to-fixed branching into resolveStoreDeliveryFee below -- see
// deliveryPricing/domain/deliveryFeeConfig.js and deliveryFeePolicy.js.
import {
    resolveDeliveryFeeConfig,
    roadDistanceProvider as defaultRoadDistanceProvider,
    computeCalculatedDeliveryFeeCentavos,
    DeliveryFeePolicyError,
    DELIVERY_FEE_CALC_VERSION,
    DELIVERY_FEE_MODES
} from '../../deliveryPricing/index.js';
import {
    generateStoreCancelProof,
    generateStoreClaimToken,
    generateStoreToken,
    getStoreTokenConfig,
    normalizeTenantIdentifier,
    generateStoreGuestCheckoutProof,
    verifyStoreCancelProof,
    verifyStoreClaimToken
} from '../utils/storeJwtToken.js';
import { assertGuestCheckoutAllowed, assertGuestCheckoutProof } from '../utils/storeGuestCheckoutProof.js';
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
    isStockExemptServiceItem,
    resolveStockBearingDescriptor,
    resolveStockExemptReason
} from '../../shared/utils/stockBearingPolicy.js';
import { resolveWorkflowCapabilitySettings as resolveWorkflowCapabilitySettingsDefault } from '../../shared/utils/workflowCapabilitySettingsCache.js';
import {
    hasExplicitSalePrice,
    requireExplicitSalePrice,
    getExplicitSalePrice
} from '../../shared/utils/itemFinancialPolicy.js';
import { buildFnbRecipeConsumptionPlan } from '../../shared/utils/fnbRecipeConsumption.js';
import { buildOnlineInventoryEffects } from '../../shared/utils/onlineInventoryEffects.js';
import { recordDgfyOrderActivity } from '../../dgfy/utils/customerActivityRecorder.js';
import { issueReviewInvitesForOrder } from '../../dgfy/utils/reviewInviteIssuer.js';
import {
    isDateWithinStorefrontBusinessHours
} from '../../shared/utils/storefrontBusinessHours.js';
import {
    buildCommercialPromoUsageUpdate,
    normalizePromoCode,
    resolveCommercialPromoApplication
} from '../../shared/utils/commercialPromoPolicy.js';
import { resolvePaymentTiming } from '../../shared/utils/paymentTimingPolicy.js';
import { STOREFRONT_ORDER_METHODS, ORDER_METHOD_LOCATION_SUPPORT_KEYS } from '../../shared/constants/orderMethods.js';

const INVOICE_COUNTER_KEY = 'POS_OR';
const ORDER_METHODS = STOREFRONT_ORDER_METHODS;
const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'grab_pay', 'shopeepay'];
const ONLINE_PAYMENT_TYPES = new Set(['qrph', 'card', 'gcash', 'maya', 'grab_pay', 'shopeepay']);
const HOSTED_PAYMENT_METHOD_TYPES = Object.freeze({
    card: 'card',
    gcash: 'gcash',
    maya: 'paymaya',
    grab_pay: 'grab_pay',
    shopeepay: 'shopeepay'
});
const PAYMENT_METHOD_CAPABILITY_ALIASES = Object.freeze({
    card: Object.freeze(['card']),
    gcash: Object.freeze(['gcash']),
    maya: Object.freeze(['paymaya', 'maya']),
    grab_pay: Object.freeze(['grab_pay']),
    shopeepay: Object.freeze(['shopeepay', 'shopee_pay']),
    qrph: Object.freeze(['qrph'])
});

export const getHostedPaymentMethodType = (paymentType) => (
    HOSTED_PAYMENT_METHOD_TYPES[String(paymentType || '').trim().toLowerCase()] || null
);
const FNB_COURSES = new Set(['appetizer', 'main', 'dessert', 'drink', 'other']);
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
    'packed',
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
const toCentavos = (value) => Math.round(round4(value) * 100);
// The one conversion boundary named in ADR 0066 decision 2 -- the voucher domain speaks integer
// centavos, the storefront checkout speaks peso, and this is where the two meet.
const centavosToPeso = (value) => round4(Number(value || 0) / 100);
const normalizeVoucherCode = (value) => String(value || '').trim().toUpperCase().slice(0, 64);
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
                quantity: Math.min(99, Math.max(1, Number.parseInt(entry.quantity || 1, 10) || 1)),
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

const snapshotVerifiedStoreCustomer = (storeCustomer) => {
    if (!storeCustomer || typeof storeCustomer !== 'object') return null;
    const customerId = parsePositiveInt(storeCustomer.customer_id);
    const dgfyAccountId = String(storeCustomer.dgfy_account_id || '').trim() || null;
    if (!customerId && !dgfyAccountId) return null;
    return {
        customer_id: customerId,
        dgfy_account_id: dgfyAccountId,
        name: String(storeCustomer.name || '').trim(),
        email: String(storeCustomer.email || '').trim().toLowerCase(),
        phone: String(storeCustomer.phone || '').trim()
    };
};

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
    case 'packed': return 'Packed';
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
    // Phase 233 (#1324): read allowlist for the new fee-mode config keys -- consumed below by
    // resolveStoreDeliveryFee via deliveryPricing's resolveDeliveryFeeConfig, no behavior change yet.
    'store_delivery_fee_mode',
    'store_delivery_fee_calc',
    'pos_wait_time_minutes',
    'storefront_promo',
    'storefront_promos',
    'storefront_hours',
    ...CUSTOMER_ACCESS_SETTING_KEYS
]);
const STORE_HAS_NO_LOCATION_KEY = 'store_has_no_location';

// #1377 review, RF-3: `Number(null) === 0` and `Number('') === 0` are both finite, so a bare
// `Number(value)` coercion silently turned an explicit JSON `null` (or an empty string) coordinate
// into a fabricated `0`, not `null` -- indistinguishable downstream from a genuine (0, 0) coordinate.
// A delivery order with `delivery_latitude: null` (a realistic client shape -- e.g. a browser
// geolocation permission denial serialized as `null`) could therefore still pass the
// `Number.isFinite(deliveryDestLat)` provider-call guard below and price calculated mode off a
// garbage coordinate instead of correctly falling back to fixed. Explicit null/undefined/empty
// string all normalize to `null` (absent) before any numeric coercion is attempted.
const toNumberOrNull = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
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
        supports_dine_in: location.supports_dine_in,
        scheduling_enabled: location.scheduling_enabled,
        immediate_fulfillment_enabled: location.immediate_fulfillment_enabled,
        fulfillment_lead_time_min_days: location.fulfillment_lead_time_min_days ?? null,
        fulfillment_lead_time_max_days: location.fulfillment_lead_time_max_days ?? null
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
    payment_timing: order?.payment_timing,
    payment_status: order?.payment_status,
    // Phase 142 (#823): persisted since Phase 141 (resolveStorefrontPaymentSnapshot) but never
    // serialized -- null for every order that isn't 'partially_paid' (full_payment orders keep
    // returning null/null here, same additive-only guarantee as the session fields above).
    amount_paid: order?.amount_paid ?? null,
    balance_due: order?.balance_due ?? null,
    payment_reference: order?.payment_reference,
    payment_checkout_url: order?.payment_checkout_url,
    payment_provider: order?.payment_provider,
    payment_session_reference: order?.payment_session_reference,
    fulfillment_status: order?.fulfillment_status,
    status_label: toStatusLabel(order?.fulfillment_status),
    status: order?.fulfillment_status,
    // Phase 210 (#1179). Deliberately NOT rejected_by/rejected_at here -- staff identity is not
    // customer-facing PII to publish on a public, PIN-addressable tracking page.
    rejection_reason: order?.rejection_reason ?? null,
    subtotal_amount: order?.subtotal_amount,
    discount_amount: order?.discount_amount,
    discount_label_snapshot: order?.discount_label_snapshot,
    discount_rate_snapshot: order?.discount_rate_snapshot,
    service_fee_amount: order?.service_fee_amount,
    service_fee_label_snapshot: order?.service_fee_label_snapshot,
    service_fee_method_snapshot: order?.service_fee_method_snapshot,
    delivery_fee: order?.delivery_fee,
    // #1331 (Phase 240): additive, same posture Phase 237 already used for delivery_fee itself --
    // deliberately NOT delivery_fee_waiver_voucher_id, a raw internal id has no place on a public,
    // PIN-addressable tracking page (see serializeOrderBase's own rejected_by/rejected_at note
    // above). The label is the customer-facing fact.
    delivery_fee_waiver: order?.delivery_fee_waiver ?? null,
    delivery_fee_waiver_label_snapshot: order?.delivery_fee_waiver_label_snapshot ?? null,
    total_amount: order?.total_amount,
    discount: order?.discount || null,
    outside_radius_flag: order?.outside_radius_flag,
    scheduled_for: order?.scheduled_for,
    special_instructions: order?.special_instructions,
    created_at: order?.created_at,
    updated_at: order?.updated_at,
    location: serializeLocationSummary(order?.location),
    items: serializeOrderLines(order)
});

// #1492: the order's own voucher_redemptions rows (entry_type: 'redemption'), projected to the
// fields a staff-facing order view actually needs -- the internal ledger row id stays out of it,
// voucher_id is the only identifier exposed (an FK, not PII, unlike delivery_fee_waiver_voucher_id's
// own withholding reasoning below which is about a PUBLIC page specifically).
const serializeAppliedVoucher = (row) => ({
    voucher_id: row?.voucher_id ?? null,
    code: row?.code_snapshot ?? null,
    benefit_target: row?.benefit_config_snapshot?.benefit_target === 'delivery' ? 'delivery' : 'items',
    discount_amount: row?.discount_centavos != null ? round4(Number(row.discount_centavos) / 100) : null
});

const serializeOrderForCustomer = (order) => ({
    ...serializeOrderBase(order),
    customer_name: order?.customer_name,
    customer_phone: order?.customer_phone,
    customer_email: order?.customer_email,
    delivery_address: order?.delivery_address,
    delivery_latitude: order?.delivery_latitude,
    delivery_longitude: order?.delivery_longitude,
    // #1492: deliberately NOT added to serializeOrderBase, which serializeOrderForPublicTracking
    // also spreads -- an authenticated-surface-only field, same posture as this function's other
    // customer-account-only fields above (name/phone/email/address are also absent from the base).
    applied_vouchers: Array.isArray(order?.voucherRedemptions)
        ? order.voucherRedemptions.map(serializeAppliedVoucher)
        : []
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

    const orderMethod = String(payload.order_method || 'delivery').trim();
    const paymentType = String(payload.payment_type || 'cash').trim();

    return {
        idempotency_key: String(payload.idempotency_key || '').trim(),
        location_id: payload.location_id == null ? null : Number.parseInt(payload.location_id, 10),
        order_method: orderMethod,
        payment_type: paymentType,
        payment_timing: resolvePaymentTiming({ orderMethod, paymentType }),
        // Phase 150 (#866): the customer's pay-in-full-vs-downpayment election at a
        // payment_mode='customer_choice' store. Meaningless (and ignored, by
        // resolveDownpaymentForTotal) at any other store -- see storeValidator.js's own comment on
        // this same field.
        payment_election: String(payload.payment_election || 'full').trim().toLowerCase() === 'downpayment' ? 'downpayment' : 'full',
        promo_code: normalizePromoCode(payload.promo_code),
        voucher_code: normalizeVoucherCode(payload.voucher_code),
        // #1331 (Phase 240): a SECOND, independent code-entry field -- the item-voucher slot guard
        // (resolveCheckoutContext, below) only ever fires on `voucher_code`, never this one, which
        // is the whole point of the two-axis design (ADR 0066 Decision 8's 2026-09-02 amendment).
        delivery_voucher_code: normalizeVoucherCode(payload.delivery_voucher_code),
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

const resolveStorefrontPromoApplication = (args) => resolveCommercialPromoApplication(args);

export const resolveStorefrontPaymentSnapshot = ({ paymentType, payload = {}, capturedPayment = null }) => {
    // Phase 141 (#822): capturedPayment is populated ONLY by finalizePaidCommerceSession.js, after
    // PayMongo has actually reported the downpayment as paid -- it is a server-internal sibling
    // argument to storeCheckoutUseCase, never a payload field, so no HTTP client can set it (the
    // other caller, storeHandlers.js, never passes it). When present the order is a downpayment
    // capture: partially_paid (or paid, if the captured amount happens to equal the order total),
    // with amount_paid/balance_due derived from the session's own captured/order-total split. This
    // is the one conversion boundary named by ADR 0069 clause 4b (carried forward by ADR 0070) --
    // integer centavos in, peso DECIMAL(14,4) out, matching every other pos_transaction_* column.
    if (capturedPayment) {
        const amountPaid = centavosToPeso(capturedPayment.captured_centavos);
        const orderTotal = centavosToPeso(capturedPayment.order_total_centavos);
        const balanceDue = Math.max(0, round4(orderTotal - amountPaid));
        return {
            payment_status: balanceDue > 0 ? 'partially_paid' : 'paid',
            payment_reference: capturedPayment.provider_payment_id || null,
            payment_checkout_url: payload.payment_checkout_url || null,
            payment_provider: 'paymongo',
            payment_session_reference: capturedPayment.session_reference || null,
            amount_paid: amountPaid,
            balance_due: balanceDue
        };
    }

    const isVerifiedOnlinePayment = ONLINE_PAYMENT_TYPES.has(String(paymentType || '').trim().toLowerCase())
        && payload.payment_webhook_confirmed === true;
    return {
        payment_status: isVerifiedOnlinePayment ? 'paid' : 'unpaid',
        payment_reference: isVerifiedOnlinePayment ? (payload.payment_reference || null) : null,
        payment_checkout_url: isVerifiedOnlinePayment ? (payload.payment_checkout_url || null) : null,
        payment_provider: isVerifiedOnlinePayment ? 'paymongo' : null,
        payment_session_reference: isVerifiedOnlinePayment ? (payload.payment_session_reference || null) : null
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

// Phase 236 (#1328): the parsed flat store_delivery_fee value, extracted to its own helper so
// resolveStoreDeliveryFee can reuse it as the fixed-mode price AND as the fallback-mode price for
// calculated tenants (ADR 0078 Decision 2 [binding]) without duplicating the parse/guard logic.
// Byte-identical to the guard the pre-Phase-237 resolveStoreDeliveryFee applied inline.
const parseFixedDeliveryFee = (settings = {}) => {
    const rawFee = settings?.store_delivery_fee?.value;
    const parsed = Number(rawFee);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return round4(parsed);
};

// Phase 237 (#1329, epic #1321). Resolves the storefront delivery fee as a full breakdown object,
// not a bare scalar -- see the Phase 237 plan §2 for the exact field-by-field contract. `async`
// even though this function performs no `await` itself: the ticket mandates it (future-proofs #240
// waiver lookup and a real locationOverride source with no second signature break), and every call
// site below awaits it -- a forgotten `await` would coerce a Promise through round4() into NaN,
// which the fixed-mode byte-identity regression tests (deliveryFeeModeConfig.checkoutFallback.unit
// .test.js, storeCheckoutRoadDistanceCapture.unit.test.js) would catch immediately.
//
// distanceMeters/distanceSource are PASSED IN, never fetched here -- this function stays I/O-free
// and unit-testable standalone; resolveCheckoutContext (the only caller) remains the sole thing
// that talks to roadDistanceProvider, preserving ADR 0078 Decision 4's single-choke-point property.
const resolveStoreDeliveryFee = async ({
    settings = {},
    orderMethod,
    distanceMeters = null,
    distanceSource = 'none',
    // Hardwired null per ADR 0078 Decision 6 [binding] until a later phase resolves a real
    // per-location override (#1346 tracks the known wholesale-replace divergence -- zero live
    // impact today since this stays null; this phase must not be the first caller to pass non-null).
    locationOverride = null
} = {}) => {
    if (orderMethod !== 'delivery') {
        return Object.freeze({
            mode: 'fixed',
            baseFee: 0,
            waiverAmount: 0,
            overrideAmount: null,
            finalFee: 0,
            distanceMeters: null,
            distanceSource: 'none',
            fallbackApplied: false,
            outOfRange: false,
            calcVersion: DELIVERY_FEE_CALC_VERSION
        });
    }

    const feeConfig = resolveDeliveryFeeConfig({
        tenantSettings: {
            store_delivery_fee_mode: settings?.store_delivery_fee_mode?.value,
            store_delivery_fee_calc: settings?.store_delivery_fee_calc?.value
        },
        locationOverride
    });
    const fixedFee = parseFixedDeliveryFee(settings);

    let baseFee = 0;
    let fallbackApplied = false;
    let outOfRange = false;

    if (feeConfig.mode === 'free') {
        baseFee = 0;
    } else if (feeConfig.mode === 'fixed') {
        baseFee = fixedFee;
    } else {
        // mode === 'calculated'
        const distanceUsable = distanceSource === 'road'
            && Number.isFinite(distanceMeters)
            && distanceMeters >= 0;

        if (feeConfig.calc === null || !distanceUsable) {
            // ADR 0078 Decision 2 [binding]: absent/malformed calc config, OR the road-distance
            // provider didn't resolve a usable distance (down, timeout, non-2xx, unmapped area,
            // non-delivery, missing/unparseable coordinates -- roadDistanceProvider already
            // collapses all of these to source 'unavailable', which resolveCheckoutContext already
            // maps to distanceSource 'fallback'). Never invents/estimates/interpolates a distance.
            baseFee = fixedFee;
            fallbackApplied = true;
        } else {
            let calcResult;
            try {
                calcResult = computeCalculatedDeliveryFeeCentavos({
                    distanceMeters,
                    config: feeConfig.calc
                });
            } catch (error) {
                // Belt-and-suspenders: 3a/3b above make this unreachable in principle (normalizeCalcBlob
                // and this module's own validateConfig enforce the same invariants), but the pure
                // policy module THROWS by design (see deliveryFeePolicy.js), and a throw escaping this
                // choke point would violate Decision 2's "never blocks checkout on a provider/config
                // failure." Fail open to fixed, same as every other branch here.
                if (!(error instanceof DeliveryFeePolicyError)) throw error;
                logger.warn('[DeliveryFee] computeCalculatedDeliveryFeeCentavos threw; falling back to fixed rate', {
                    code: error.code,
                    message: error.message
                });
                baseFee = fixedFee;
                fallbackApplied = true;
                calcResult = null;
            }

            if (calcResult) {
                if (calcResult.outOfRange) {
                    // NOT a fallback -- ADR 0078 Decision 2 explicitly separates "out of range" from
                    // "unknown distance." The hard block is enforced one layer up, in
                    // resolveCheckoutContext (see enforceDeliveryRange).
                    baseFee = 0;
                    outOfRange = true;
                } else {
                    baseFee = centavosToPeso(calcResult.feeCentavos);
                }
            }
        }
    }

    // #1331 (Phase 240): still hardcoded HERE, deliberately. This function stays I/O-free (see its
    // own header) and a voucher lookup is not -- resolveCheckoutContext rebuilds `delivery` with the
    // resolved waiver AFTER this function returns (its own §5.3 in the Phase 240 plan), rather than
    // dragging a repository call into a function whose byte-identity regression tests depend on it
    // staying await-free.
    const waiverAmount = 0;
    const overrideAmount = null; // Hardcoded this phase -- #238 overrides the PERSISTED column post-hoc, not resolve-time.
    const finalFee = overrideAmount !== null ? overrideAmount : Math.max(0, round4(baseFee - waiverAmount));

    return Object.freeze({
        mode: feeConfig.mode,
        baseFee,
        waiverAmount,
        overrideAmount,
        finalFee,
        distanceMeters: distanceSource === 'road' ? distanceMeters : null,
        distanceSource,
        fallbackApplied,
        outOfRange,
        calcVersion: DELIVERY_FEE_CALC_VERSION
    });
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

const assertCheckoutLocationOperationalReadiness = ({ location, orderMethod, scheduledFor = null }) => {
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

    if (location.is_open === false) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Selected location is currently closed and cannot accept orders',
            { statusCode: 409 }
        );
    }

    const supportKey = ORDER_METHOD_LOCATION_SUPPORT_KEYS[orderMethod] || null;
    if (supportKey && location?.[supportKey] === false) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Selected location does not support ${orderMethod} orders`,
            { statusCode: 409 }
        );
    }
    if (scheduledFor && location?.scheduling_enabled === false) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Selected location does not accept scheduled orders',
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

const assertCheckoutTimeWithinStorefrontHours = ({ scheduledFor, settings }) => {
    const checkoutTime = scheduledFor || new Date();
    if (!isDateWithinStorefrontBusinessHours(checkoutTime, settings?.storefront_hours?.value)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            scheduledFor
                ? 'scheduled_for is outside store business hours'
                : 'Storefront is outside business hours and not accepting orders',
            {
                statusCode: 422,
                details: {
                    reason_code: 'OUTSIDE_STOREFRONT_BUSINESS_HOURS'
                }
            }
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

const findStorefrontModifierLocationOverride = (entry, locationId) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) return null;
    const rows = Array.isArray(entry?.locationAvailability) ? entry.locationAvailability : [];
    return rows.find((row) => Number(row?.location_id) === normalizedLocationId) || null;
};

const resolveStorefrontLineModifiers = ({ item, line, locationId }) => {
    const requested = Array.isArray(line.line_modifiers) ? line.line_modifiers : [];

    const groups = Array.isArray(item.fnb_modifier_groups)
        ? item.fnb_modifier_groups
        : (Array.isArray(item.fnbModifierGroups) ? item.fnbModifierGroups : []);
    const groupEntries = groups
        .filter((group) => group?.is_active !== false
            && group?.visible_in_storefront !== false
            && findStorefrontModifierLocationOverride(group, locationId)?.is_available !== false)
        .map((group) => ({
            ...group,
            assignment: group.FnbItemModifierGroup || group.fnbItemModifierGroup || {},
            options: (Array.isArray(group.options) ? group.options : [])
                .filter((option) => option?.is_active !== false
                    && option?.visible_in_storefront !== false
                    && option?.is_sold_out !== true
                    && findStorefrontModifierLocationOverride(option, locationId)?.is_available !== false
                    && findStorefrontModifierLocationOverride(option, locationId)?.is_sold_out !== true)
        }));
    const groupById = new Map(groupEntries.map((group) => [Number(group.modifier_group_id), group]));
    const groupByName = new Map(groupEntries.map((group) => [String(group.name || group.display_name || '').trim().toLowerCase(), group]));
    const selectedCounts = new Map();
    const snapshot = [];
    const requestedOptionIds = new Set(requested.map((entry) => Number(entry.modifier_option_id || entry.option_id)).filter((entry) => Number.isInteger(entry) && entry > 0));
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

        if (snapshot.some((entry) => Number(entry.modifier_option_id) === Number(option.modifier_option_id))) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Modifier option "${option.name}" was selected more than once`, { statusCode: 422 });
        }

        const count = Number(selectedCounts.get(group.modifier_group_id) || 0) + 1;
        selectedCounts.set(group.modifier_group_id, count);
        const selectedQuantity = Math.min(99, Math.max(1, Number.parseInt(modifier.quantity || 1, 10) || 1));
        priceDelta = round4(priceDelta + (round4(option.price_delta) * selectedQuantity));
        snapshot.push({
            modifier_group_id: group.modifier_group_id,
            group_name: group.display_name || group.name,
            group_kind: group.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
            parent_modifier_option_id: Number(group.parent_modifier_option_id) || null,
            modifier_option_id: option.modifier_option_id,
            option_name: option.name,
            price_delta: round4(option.price_delta),
            quantity: selectedQuantity,
            extended_price_delta: round4(option.price_delta * selectedQuantity),
            sku_item_id: Number(option.sku_item_id) || null,
            location_id: Number(locationId) || null,
            allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null
        });
    }

    for (const group of groupEntries) {
        const parentOptionId = Number(group.parent_modifier_option_id) || null;
        if (parentOptionId && !requestedOptionIds.has(parentOptionId)) {
            if (Number(selectedCounts.get(group.modifier_group_id) || 0) > 0) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Modifier group "${group.display_name || group.name}" requires its parent option`, { statusCode: 422 });
            continue;
        }
        const count = Number(selectedCounts.get(group.modifier_group_id) || 0);
        const required = group.assignment.is_required_override == null
            ? group.required === true
            : group.assignment.is_required_override === true;
        const minSelect = required ? Math.max(1, Number(group.min_select || 0)) : 0;
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

const assertModifierInventoryAvailability = async ({
    storeRepository,
    preparedLines = [],
    locationId = null,
    allowOutOfStockSales = false,
    options = {}
}) => {
    if (allowOutOfStockSales || typeof storeRepository?.getLocationStocksByItemIds !== 'function') return;
    const requestedByItemId = new Map();
    for (const line of preparedLines) {
        for (const modifier of (Array.isArray(line.fnb_modifiers_snapshot) ? line.fnb_modifiers_snapshot : [])) {
            const itemId = Number.parseInt(modifier?.sku_item_id, 10);
            if (!Number.isInteger(itemId) || itemId <= 0) continue;
            const quantity = Math.min(99, Math.max(1, Number.parseInt(modifier?.quantity || 1, 10) || 1));
            const requested = Number(line.quantity || 0) * quantity;
            requestedByItemId.set(itemId, round4((requestedByItemId.get(itemId) || 0) + requested));
        }
    }
    const itemIds = [...requestedByItemId.keys()];
    if (itemIds.length === 0) return;
    const rows = await storeRepository.getLocationStocksByItemIds(itemIds, locationId, options);
    const stockByItemId = new Map((Array.isArray(rows) ? rows : []).map((row) => [
        Number.parseInt(row?.item_id, 10),
        Math.max(0, Number(row?.quantity_on_hand || 0))
    ]));
    const violations = itemIds
        .map((itemId) => ({
            sku_item_id: itemId,
            available_stock: round4(stockByItemId.get(itemId) || 0),
            requested_qty: round4(requestedByItemId.get(itemId) || 0)
        }))
        .filter((entry) => entry.available_stock + 0.000001 < entry.requested_qty);
    if (violations.length > 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Insufficient stock for one or more selected F&B modifiers',
            {
                statusCode: 422,
                details: {
                    reason_code: 'FNB_MODIFIER_STOCK_SHORTFALL',
                    location_id: Number.parseInt(locationId, 10) || null,
                    stock_violations: violations
                }
            }
        );
    }
};

const prepareCheckoutLines = ({
    rawLines,
    itemMap,
    allowOutOfStockSales = false,
    recipeItemIds = new Set(),
    // Phase 1 affiliate pricing rule engine (see
    // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). Null means no active
    // attribution - every line then prices exactly as it did before this parameter existed.
    affiliateSellingPriceRule = null,
    locationId = null
}) => {
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'At least one checkout line is required',
            { statusCode: 400 }
        );
    }

    const preparedLines = [];
    let subtotalAmount = 0;
    // Catalog-price subtotal, pre-affiliate-rule - identical to subtotalAmount when no rule is
    // active. This is what decision A3's commission_base_mode = 'base_price_subtotal' accrues
    // against, kept alongside the buyer-facing subtotalAmount rather than replacing it (§7.3).
    let baseSubtotalAmount = 0;
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

        const descriptor = resolveStockBearingDescriptor(item);
        if (descriptor.is_toggle_available === false) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `"${item.name}" is currently marked unavailable`,
                { statusCode: 422 }
            );
        }

        const isStockExemptLine = !descriptor.tracks_quantity;
        const currentStock = Number(item.current_stock || 0);
        const requestedItemQuantity = isStockExemptLine || allowOutOfStockSales
            ? quantity
            : round4((requestedQuantityByItemId.get(item.item_id) || 0) + quantity);
        if (!isStockExemptLine && !allowOutOfStockSales) {
            requestedQuantityByItemId.set(item.item_id, requestedItemQuantity);
        }

        const hasRecipeConsumption = recipeItemIds.has(Number(item.item_id));
        if (descriptor.blocks_on_shortfall && !allowOutOfStockSales && !hasRecipeConsumption && currentStock + 0.000001 < requestedItemQuantity) {
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

        // Affiliate selling-price rule applies to the item's base price only - a modifier add-on
        // (e.g. "extra cheese +PHP20") costs the same regardless of any affiliate markup/discount,
        // so modifierResolution.priceDelta is added to both the affiliate-adjusted price and the
        // plain base price below, symmetrically.
        let affiliateUnitPrice = resolvedPrice;
        if (affiliateSellingPriceRule) {
            let affiliateUnitPriceCentavos;
            try {
                affiliateUnitPriceCentavos = resolveAffiliateUnitPriceCentavos({
                    basePriceCentavos: toCentavos(resolvedPrice),
                    rule: affiliateSellingPriceRule
                });
            } catch {
                // A13: pricing is pre-commit and blocking - an unresolvable affiliate rule fails
                // checkout rather than silently falling back to the catalog price.
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Unable to resolve the affiliate price for "${item.name}"`,
                    {
                        statusCode: 422,
                        details: { reason_code: 'AFFILIATE_PRICE_UNRESOLVED', item_id: item.item_id }
                    }
                );
            }
            if (affiliateUnitPriceCentavos < 0) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `The affiliate price for "${item.name}" would be negative`,
                    {
                        statusCode: 422,
                        details: { reason_code: 'AFFILIATE_NEGATIVE_PRICE', item_id: item.item_id }
                    }
                );
            }
            // Decision A9: refuse a sale that would go below the item's own cost. Enforced here
            // (per real item, at resolution time) rather than at rule-save time, because a Phase 1
            // rule is tenant/enrollment-wide and applies across every product a tenant sells - there
            // is no single representative cost to validate against when the owner configures it.
            if (descriptor.carries_cost && item.cost_per_unit != null) {
                const costPerUnitCentavos = toCentavos(item.cost_per_unit);
                if (affiliateUnitPriceCentavos < costPerUnitCentavos) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `The affiliate price for "${item.name}" would sell below its cost`,
                        {
                            statusCode: 422,
                            details: { reason_code: 'AFFILIATE_BELOW_COST_FLOOR', item_id: item.item_id }
                        }
                    );
                }
            }
            affiliateUnitPrice = affiliateUnitPriceCentavos / 100;
        }

        const modifierResolution = resolveStorefrontLineModifiers({ item, line, locationId });
        const effectiveUnitPrice = round4(affiliateUnitPrice + modifierResolution.priceDelta);
        const baseEffectiveUnitPrice = round4(resolvedPrice + modifierResolution.priceDelta);
        const lineSubtotal = round4(quantity * effectiveUnitPrice);
        const baseLineSubtotal = round4(quantity * baseEffectiveUnitPrice);
        subtotalAmount = round4(subtotalAmount + lineSubtotal);
        baseSubtotalAmount = round4(baseSubtotalAmount + baseLineSubtotal);

        preparedLines.push({
            item_id: item.item_id,
            // #448 (Phase 209) - snapshotted so post-commit affiliate accrual can resolve a
            // per-category commission rate without re-querying the item. Nullable: an
            // uncategorized item matches no category rate and falls to the tenant default.
            folder_id_snapshot: Number.isInteger(item.folder_id) ? item.folder_id : null,
            // Phase 209 weight source for commission_base_mode: 'base_price_subtotal' - the
            // per-line twin of the aggregate baseSubtotalAmount this function already returns.
            base_line_subtotal: baseLineSubtotal,
            item_name: item.name,
            item_name_snapshot: item.name || null,
            sku_snapshot: item.sku_code || null,
            quantity: round4(quantity),
            unit_of_measure: item.unit_of_measure || null,
            cost_snapshot: descriptor.carries_cost ? (item.cost_per_unit != null ? round4(item.cost_per_unit) : null) : null,
            stock_effect_type: isStockExemptLine ? 'stock_exempt' : 'inventory_issue',
            stock_exempt_reason: resolveStockExemptReason(item, descriptor),
            sale_price: effectiveUnitPrice,
            sale_price_overridden: Boolean(affiliateSellingPriceRule),
            price_override_reason: affiliateSellingPriceRule ? 'affiliate_program' : null,
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
        baseSubtotalAmount,
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

const getStorefrontModifierSelectionConfig = (group) => {
    const through = group.FnbItemModifierGroup || group.fnbItemModifierGroup || {};
    const required = through.is_required_override == null
        ? group.required === true
        : through.is_required_override === true;
    const minSelect = Number(group.min_select || 0);
    return {
        required,
        min_select: required ? Math.max(1, minSelect) : 0
    };
};

const serializeStorefrontModifierGroups = (value, locationId = null) => (
    Array.isArray(value)
        ? value
            .filter((group) => group?.is_active !== false
                && group?.visible_in_storefront !== false
                && findStorefrontModifierLocationOverride(group, locationId)?.is_available !== false)
            .map((group) => {
                const selectionConfig = getStorefrontModifierSelectionConfig(group);
                return {
                    modifier_group_id: group.modifier_group_id,
                    name: group.name,
                    display_name: group.display_name || group.name,
                    group_kind: group.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
                    parent_modifier_option_id: Number(group.parent_modifier_option_id) || null,
                    min_select: selectionConfig.min_select,
                    max_select: Number(group.max_select || 1),
                    required: selectionConfig.required,
                    options: (Array.isArray(group.options) ? group.options : [])
                        .filter((option) => option?.is_active !== false
                            && option?.visible_in_storefront !== false
                            && option?.is_sold_out !== true
                            && findStorefrontModifierLocationOverride(option, locationId)?.is_available !== false
                            && findStorefrontModifierLocationOverride(option, locationId)?.is_sold_out !== true)
                        .map((option) => ({
                            modifier_option_id: option.modifier_option_id,
                            name: option.name,
                            price_delta: round4(option.price_delta),
                            is_default: option.is_default === true,
                            allergen_notes: Array.isArray(option.allergen_notes) ? option.allergen_notes : null
                        }))
                };
            })
            .filter((group) => group.options.length > 0)
        : []
);

// Phase 1 affiliate pricing rule engine: applies affiliateSellingPriceRule (resolved once per
// request by the caller, see resolveAffiliateSellingPriceRuleForDisplay above) to the catalog price
// shown to a browsing buyer. Unlike checkout (decision A13, fails closed on an unresolvable rule),
// catalog display is best-effort - a misconfigured or unresolvable rule falls back to the plain
// catalog price rather than taking the whole listing offline, since browsing has not committed to
// anything yet and checkout re-validates and fails closed at the point that actually matters.
const applyAffiliateDisplayPrice = (item, affiliateSellingPriceRule) => {
    if (!affiliateSellingPriceRule) {
        return { price: item.default_sale_price, applied: false };
    }
    try {
        const catalogPrice = getExplicitSalePrice(item);
        if (catalogPrice === null) return { price: item.default_sale_price, applied: false };

        const affiliateUnitPriceCentavos = resolveAffiliateUnitPriceCentavos({
            basePriceCentavos: Math.round(catalogPrice * 100),
            rule: affiliateSellingPriceRule
        });
        if (affiliateUnitPriceCentavos < 0) {
            logger.warn('[StorefrontCatalog] Affiliate price rule resolved negative, showing catalog price instead', {
                item_id: item.item_id,
                rule_type: affiliateSellingPriceRule.type
            });
            return { price: item.default_sale_price, applied: false };
        }
        // Decision A9, display-time twin of the checkout floor guard: same reasoning, same
        // fail-open convention as the rest of this function.
        if (item.cost_per_unit != null) {
            const costPerUnitCentavos = Math.round(Number(item.cost_per_unit) * 100);
            if (affiliateUnitPriceCentavos < costPerUnitCentavos) {
                logger.warn('[StorefrontCatalog] Affiliate price rule would sell below cost, showing catalog price instead', {
                    item_id: item.item_id,
                    rule_type: affiliateSellingPriceRule.type
                });
                return { price: item.default_sale_price, applied: false };
            }
        }
        return { price: affiliateUnitPriceCentavos / 100, applied: true };
    } catch (error) {
        logger.warn('[StorefrontCatalog] Failed to resolve affiliate display price, showing catalog price instead', {
            item_id: item.item_id,
            error: error?.message
        });
        return { price: item.default_sale_price, applied: false };
    }
};

// #603: display-only, best-effort per item -- looks up this item's pre-resolved voucher price from
// the once-per-request batch result (see `resolveVoucherDisplayPricesUseCase`'s callers). Unlike
// `applyAffiliateDisplayPrice`, this does NOT overwrite `default_sale_price` in place -- #603 needs
// both the original and the discounted price on the wire simultaneously so the storefront can render
// a struck-through comparison, not a silent substitution.
const applyVoucherDisplayPrice = (item, voucherDisplay) => {
    if (!voucherDisplay || !voucherDisplay.applied) {
        return { voucherPriceApplied: false, voucherDisplayPrice: null, voucherBadgeOnly: false };
    }
    if (voucherDisplay.badgeOnly) {
        return { voucherPriceApplied: false, voucherDisplayPrice: null, voucherBadgeOnly: true };
    }
    const priced = voucherDisplay.pricesByItemId?.[Number(item.item_id)];
    if (!priced) {
        return { voucherPriceApplied: false, voucherDisplayPrice: null, voucherBadgeOnly: false };
    }
    return { voucherPriceApplied: true, voucherDisplayPrice: priced.voucher_price, voucherBadgeOnly: false };
};

const serializeStoreCatalogItem = (item = {}, accessPolicy = {}, affiliateSellingPriceRule = null, locationId = null, voucherDisplay = null) => {
    const availabilityStatus = normalizeAvailabilityStatus(item);
    const isAvailable = availabilityStatus === 'in_stock' || availabilityStatus === 'bookable';
    const imageUrl = item.image_url || null;
    const imageVariants = item.image_variants && typeof item.image_variants === 'object'
        ? item.image_variants
        : {};
    const serviceDetail = item.service_detail
        ? {
            ...item.service_detail,
            intake_form_schema: normalizeIntakeFormSchema(item.service_detail.intake_form_schema)
        }
        : null;
    const { price: displaySalePrice, applied: affiliatePriceApplied } = applyAffiliateDisplayPrice(item, affiliateSellingPriceRule);
    const { voucherPriceApplied, voucherDisplayPrice, voucherBadgeOnly } = applyVoucherDisplayPrice(item, voucherDisplay);
    return {
        item_id: item.item_id,
        name: item.name,
        description: item.description || null,
        category: item.category,
        product_type: item.product_type || null,
        folder_name: item.folder_name || item.product_folder || item?.folder?.name || null,
        unit_of_measure: item.unit_of_measure || null,
        default_sale_price: displaySalePrice,
        affiliate_price_applied: affiliatePriceApplied,
        voucher_price_applied: voucherPriceApplied,
        voucher_display_price: voucherDisplayPrice,
        voucher_badge_only: voucherBadgeOnly,
        vat_type: item.vat_type || 'vatable',
        image_url: imageUrl,
        image_variants: {
            ...imageVariants,
            thumbnail_url: imageVariants.thumbnail_url || imageUrl,
            medium_url: imageVariants.medium_url || imageUrl,
            large_url: imageVariants.large_url || imageUrl
        },
        image_gallery: Array.isArray(item.image_gallery) ? item.image_gallery : [],
        service_detail: serviceDetail,
        allergens: serializeStorefrontAllergens(item.allergens),
        nutrition: serializeStorefrontNutrition(item.nutrition),
        fnb_modifier_groups: serializeStorefrontModifierGroups(item.fnb_modifier_groups, locationId),
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

// Resolves everything needed to price and account for an affiliate-attributed storefront checkout:
// the enrollment itself, the selling-price rule to apply (or BASE_PRICE when none is configured),
// and the commission configuration to accrue against (including decision A3's commission_base_mode
// flag). Returns null when there is no active attribution at all - the caller then prices and
// accrues exactly as it did before Phase 1 of the affiliate pricing rule engine existed.
//
// Unlike the post-commit accrual write elsewhere in this file, this is NOT wrapped in try/catch by
// its caller (decision A13: pricing is pre-commit and blocking - if resolution genuinely errors,
// checkout must fail rather than risk silently charging the wrong price). A missing/invalid/revoked
// enrollment is not an error here, though: resolveActiveAffiliateEnrollmentById's established
// null-means-no-attribution contract just means no affiliate pricing applies, and this function
// returns null in that case too, same as if attribution_enrollment_id had never been sent.
const resolveAffiliatePricingForCheckout = async ({ tenantId, enrollmentId }) => {
    if (!tenantId || !enrollmentId) return null;

    const enrollment = await resolveActiveAffiliateEnrollmentById({ tenantId, enrollmentId });
    if (!enrollment) return null;

    // #448 (Phase 209): settings must be fetched BEFORE the Promise.all below, because
    // loadApplicableCategoryRates' category_rates_enabled / enrollment-override guard needs it to
    // decide whether the category-rate fetch runs at all. An unconditional fetch here would
    // violate A7's zero-added-query guarantee on every attributed storefront checkout.
    const settings = await dgfyAffiliateRepository.getSettings(tenantId);

    const [priceRule, categoryRates] = await Promise.all([
        dgfyAffiliateRepository.resolveActivePriceRule({
            tenantId,
            enrollmentId: enrollment.enrollment_id,
            itemId: 0
        }),
        loadApplicableCategoryRates({ tenantId, enrollment, settings })
    ]);

    const sellingPriceRule = priceRule
        ? { type: priceRule.rule_type, rateBps: priceRule.rate_bps, amountCentavos: priceRule.amount_centavos }
        : { type: 'BASE_PRICE' };

    // Same override-falls-back-to-tenant-default pattern already established for
    // commission_rate_bps.
    const commissionType = enrollment.commission_type || settings?.commission_type || 'PERCENTAGE_OF_BASE';
    const commissionRateBps = resolveCommissionRateBps(enrollment, settings);

    return {
        enrollment,
        priceRule,
        sellingPriceRule,
        // commissionRule.rateBps is now the FALLBACK rate only (correct: with no cart in hand
        // there is no per-line category to resolve against). The applied rate is resolved per-line
        // at accrual time by computeCategoryAwareCommission - do not mistake this for the applied
        // rate on a category-aware tenant.
        commissionRule: { type: commissionType, rateBps: commissionRateBps },
        settlementPolicy: settings?.settlement_policy || null,
        commissionBaseMode: settings?.commission_base_mode || 'discounted_subtotal',
        // #448 (Phase 209). Category rows applicable to this enrollment (both the enrollment's own
        // scope and the tenant-wide template scope, every folder) - [] when category_rates_enabled
        // is off, or when the enrollment override shadows it outright (loadApplicableCategoryRates'
        // own zero-query guard - see its comment). Precedence within this set is resolved per-line
        // at accrual time, not here.
        categoryRates,
        // Carried through separately so the accrual block (storeUseCases.js's else branch, §7.3)
        // doesn't need to re-derive the enrollment/tenant-default ladder itself - that would
        // duplicate resolveCommissionRateBps's own ladder in two places, the exact drift its header
        // comment warns against.
        fallbackRateBps: commissionRateBps
    };
};

// Cheaper, display-only twin of resolveAffiliatePricingForCheckout used by the two buyer-facing
// catalog display sites (§6: serializeStoreCatalogItem's callers). Skips the settings/commission
// fetch entirely - a browsing page never needs to know how commission is computed, only what price
// to show - so it's one fewer query per catalog list/QR-resolve request than the checkout path.
// Returns null on no/invalid attribution, same null-means-no-attribution contract as the rest of
// this file.
const resolveAffiliateSellingPriceRuleForDisplay = async ({ tenantId, enrollmentId }) => {
    if (!tenantId || !enrollmentId) return null;

    const enrollment = await resolveActiveAffiliateEnrollmentById({ tenantId, enrollmentId });
    if (!enrollment) return null;

    const priceRule = await dgfyAffiliateRepository.resolveActivePriceRule({
        tenantId,
        enrollmentId: enrollment.enrollment_id,
        itemId: 0
    });

    return priceRule
        ? { type: priceRule.rule_type, rateBps: priceRule.rate_bps, amountCentavos: priceRule.amount_centavos }
        : null;
};

// #667 Phase 110 (ADR 0033's 2026-08-17 amendment / ADR 0066 Decision 10): a voucher redemption
// must persist the same `pos_transaction_discounts` audit row a promo redemption already does.
// Builds that payload from a voucher's own (centavos-denominated) `lineAllocations`, converting to
// pesos here -- the single conversion boundary per channel ADR 0066 Decision 2 calls for, not
// scattered into the repository. Shape matches exactly what `createOnlineTransactionWithLines`
// already expects from the promo path (`eligible_quantity` / `gross_eligible_amount` /
// `discount_amount` / `final_line_amount`), so the repository needs no branching per source.
const buildVoucherDiscountRecord = (voucherApplication) => ({
    discount_type: 'voucher',
    // percent_off is the only benefit class expressed as a rate; amount_off and fixed_price are
    // absolute pesos. Reuses the same two-value vocabulary `pos_discount_rules.method` already
    // uses ('percentage' | 'fixed') rather than inventing a value per benefit class.
    discount_method: voucherApplication.benefitClass === 'percent_off' ? 'percentage' : 'fixed',
    discount_rate: voucherApplication.discountRate,
    discount_amount: voucherApplication.discountAmount,
    promo_code: voucherApplication.enteredVoucherCode,
    lines: voucherApplication.lineAllocations.map((allocation) => {
        const lineSubtotal = centavosToPeso(allocation.lineSubtotalCentavos);
        const lineDiscount = centavosToPeso(allocation.discountCentavos);
        return {
            eligible_quantity: allocation.eligible ? round4(allocation.quantity) : 0,
            gross_eligible_amount: allocation.eligible ? lineSubtotal : 0,
            discount_amount: lineDiscount,
            final_line_amount: round4(lineSubtotal - lineDiscount)
        };
    })
});

// #1331 (Phase 240 plan §3.2, epic #1321 decision 9): the delivery-fee waiver's resolved shape --
// deliberately NOT a voucherApplication, and deliberately field-disjoint from one (no
// benefitClass/discountRate/discountAmount/enteredVoucherCode/lineAllocations keys). This is
// Mechanism B of the four structural mechanisms that keep a delivery waiver out of
// pos_transaction_discounts (ADR 0066 Decision 8's 2026-09-02 amendment): routing this object
// through buildVoucherDiscountRecord throws a TypeError on `undefined.map(...)` at the first call
// rather than silently writing a structurally-invalid discount row. Do not add any of the five
// voucherApplication keys to this shape.
const DEFAULT_DELIVERY_WAIVER_APPLICATION = Object.freeze({
    applied: false,
    waiverAmount: 0,
    voucherId: null,
    labelSnapshot: null,
    redemptionId: null,
    idempotentReplay: false,
    enteredDeliveryVoucherCode: null,
    // #1332 (Phase 244): additive -- distinguishes a code-entered waiver from an auto-applied one.
    // No existing reader destructures this object exhaustively (same argument #1331 made for its own
    // additions).
    autoApplied: false
});

// Phase 237 (#1329, epic #1321, Wave 0 decision #2 / D2): advisory-only quoted-fee pin window.
// 60 minutes -- >= the PayMongo QRPh intent window (no legitimately-paid session is ever flagged),
// short enough that a genuinely stuck/redelivered webhook is visible in logs. ADVISORY ONLY: never
// used to invalidate the pin, only to log a warning past this age. A hard expiry would produce a
// paid-but-unfinalizable order (money already captured, no order can be written) or force a silent
// re-price to a different number than the customer paid -- both strictly worse than honoring a
// slightly-stale pin, and this repo has no rollback mechanism (#495 open) to lean on if either
// happened. Do not turn this into a hard-invalidation TTL without first building a reconciliation
// path for "re-resolved fee != captured amount" -- see the Phase 237 plan §7.3.
const DELIVERY_QUOTE_PIN_ADVISORY_TTL_MS = 60 * 60 * 1000;

// Validates a pin read back from commerce_payment_sessions.delivery_fee_breakdown (JSON from the
// DB -- could be null, truncated, or written by an older deploy). Full shape validation: every
// field the caller copies verbatim into the persisted order (see the `delivery = Object.freeze({...})`
// assignment below) is checked here, not just the three top-level invariants -- a partially-valid
// pin (right mode/finalFee/calcVersion, garbage everywhere else) would otherwise corrupt the
// money/provenance breakdown on webhook finalization (#1377 review, RF-2).
// Any failure here means "fall through to normal resolution," never a thrown error -- pinning must
// never be able to block a checkout that would otherwise succeed.
const PINNED_DISTANCE_SOURCES = Object.freeze(['road', 'fallback', 'none']);

// typeof-gated, not merely Number.isFinite -- Number.isFinite(Number("97")) is true, so checking
// finiteness alone would silently coerce and accept a stringified numeric value. Every numeric pin
// field must already BE a number, not just look like one (#1377 post-merge audit, RF-2).
const isFiniteNonNegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isValidPinnedDeliveryBreakdown = (pin) => {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) return false;
    if (!DELIVERY_FEE_MODES.includes(pin.mode)) return false;

    if (!isFiniteNonNegativeNumber(pin.finalFee)) return false;

    // A calcVersion mismatch means a formula change shipped between pin and finalize -- re-resolving
    // is more correct than honoring a fee priced under a since-superseded formula.
    if (pin.calcVersion !== DELIVERY_FEE_CALC_VERSION) return false;

    // baseFee/waiverAmount: always finite, nonnegative money values -- never null/absent in a
    // genuinely-produced breakdown (resolveStoreDeliveryFee always sets both to a number).
    if (!isFiniteNonNegativeNumber(pin.baseFee)) return false;
    if (!isFiniteNonNegativeNumber(pin.waiverAmount)) return false;

    // overrideAmount: null (the overwhelming common case this phase -- #238 hasn't shipped yet) or a
    // finite nonnegative number. Anything else (a string, a negative number, NaN) is malformed.
    if (pin.overrideAmount !== null && !isFiniteNonNegativeNumber(pin.overrideAmount)) return false;

    // distanceSource: closed enum, no coercion -- an unrecognized value is unconditionally malformed.
    if (!PINNED_DISTANCE_SOURCES.includes(pin.distanceSource)) return false;

    // distanceMeters: null (mirrors distanceSource !== 'road', see resolveStoreDeliveryFee's own
    // `distanceSource === 'road' ? distanceMeters : null`) or a finite nonnegative number.
    if (pin.distanceMeters !== null && !isFiniteNonNegativeNumber(pin.distanceMeters)) return false;

    // fallbackApplied/outOfRange: real booleans, not merely truthy -- a stray string/number here
    // would otherwise be copied verbatim into the persisted breakdown.
    if (typeof pin.fallbackApplied !== 'boolean') return false;
    if (typeof pin.outOfRange !== 'boolean') return false;

    // pinned_at: must be a string that actually parses -- the advisory-TTL check downstream
    // (Date.parse(pinnedDeliveryBreakdown.pinned_at)) already tolerates an unparseable value by
    // logging and honoring the pin anyway, but a missing/non-string pinned_at means this was never a
    // real pin from the write site (which always sets `new Date().toISOString()`) -- treat it as
    // shape-invalid rather than silently persisting a garbage timestamp.
    if (typeof pin.pinned_at !== 'string' || !Number.isFinite(Date.parse(pin.pinned_at))) return false;

    // #1332 (Phase 244, epic #1321 decision 9): which campaign (if any) auto-applied at pin time --
    // required so the webhook-finalized path redeems the SAME campaign that priced the order rather
    // than re-selecting whichever campaign happens to be winning at finalize time (potentially a
    // different one, minutes later). `undefined` is accepted as equivalent to `null` here
    // specifically -- an in-flight pin created before this deploy has no such key at all, and
    // treating that as shape-invalid would needlessly lose an otherwise-good pin (forcing a safe but
    // unnecessary re-resolution) for every session already in flight across this deploy window. Not
    // a DELIVERY_FEE_CALC_VERSION bump -- the fee formula itself is unchanged; only interpretation of
    // one new field is backward-compatible here.
    if (pin.autoAppliedVoucherId !== undefined && pin.autoAppliedVoucherId !== null
        && !Number.isInteger(pin.autoAppliedVoucherId)) return false;

    return true;
};

const resolveCheckoutContext = async ({
    storeRepository,
    payload,
    storeCustomer = null,
    options = {},
    validateRecipeAvailability = true,
    revenueSharingEnabled = tenantRevenueSharingEnabled,
    // #746: a cart-quote preview isn't placing an order -- it's answering "what would my total (and
    // voucher/promo discount) be right now." Neither the discount math (resolveStorefrontPromoApplication
    // / voucher resolution below, cart-content-only) nor deliveryFee (resolveStoreDeliveryFee, a flat
    // settings-based lookup keyed on orderMethod, never on the address string itself) actually reads
    // customer_name/phone/email/delivery_address. The ONLY thing that ever needed them here was this
    // gate. Requiring them anyway meant no shopper could see a voucher discount in the cart drawer
    // before reaching checkout and typing/selecting all four -- silently, since a 422 with no visible
    // error is indistinguishable from "the discount doesn't apply." buildStoreCartQuoteUseCase passes
    // `false`; every order-placing caller (buildStoreCheckoutUseCase, the QRPh payment-session path)
    // keeps the default `true` -- an order that will actually ship still needs a real contact and, for
    // delivery, a real address, unchanged from before this amendment.
    requireCheckoutContact = true,
    // Explicit tenantId for the Phase 1 affiliate pricing rule engine lookup, and (Phase 140,
    // #821) the downpayment settings lookup below -- both share this one param rather than each
    // growing their own. Optional and falls back to the ambient dbStore context
    // (currentTenantAccessContext()) when omitted, to preserve today's behavior for the two callers
    // (cart quote, QRPh payment session) that don't have an explicit tenantId in scope.
    // buildStoreCheckoutUseCase - the money-writing path - does have one and passes it explicitly,
    // so neither lookup there ever depends on ambient context being populated the same way the rest
    // of that function already trusts its own tenantId param.
    tenantId = null,
    // Phase 140 (#821): injected, no default -- see the import-site comment above for why this is
    // not a hard-imported module-level singleton the way dgfyAffiliateRepository is. `undefined`
    // (every existing caller that doesn't pass this) means "don't read, assume full_payment", via
    // the `?.` guard at the call site below.
    downpaymentSettingsRepository = null,
    // Phase 236 (#1328, epic #1321): injected the same way downpaymentSettingsRepository is, so
    // tests can supply a fake without touching the real routeCalculator/GraphHopper integration.
    // Defaults to the real singleton for every existing caller.
    roadDistanceProvider = defaultRoadDistanceProvider,
    // Phase 237 (#1329, epic #1321, ADR 0078 Decision 2 [binding]): mirrors requireCheckoutContact's
    // own DI shape exactly (#746). `true` for every order-placing caller (checkout, payment
    // session) -- an out-of-range delivery address hard-blocks the order. `false` ONLY for the cart
    // quote (buildStoreCartQuoteUseCase), which must never throw -- it returns the blocked state as
    // additive response fields instead (delivery_out_of_range / delivery_distance_meters) so a
    // shopper can still see their cart total. See resolveStoreDeliveryFee's `outOfRange` field.
    enforceDeliveryRange = true,
    // Phase 237 (#1329, epic #1321, Wave 0 decision #2): server-internal sibling argument, never a
    // payload field -- same precedent as capturedPayment (Phase 141, #822). Passed ONLY by
    // finalizePaidCommerceSession.js on a webhook replay, carrying the whole frozen breakdown
    // object captured at payment-session creation. When present and shape-valid, resolveCheckoutContext
    // skips resolveStoreDeliveryFee entirely and uses this verbatim -- this is what keeps the
    // finalized order's persisted fee identical to the amount PayMongo actually captured, even if
    // settings or GraphHopper state changed between session creation and webhook finalization.
    pinnedDeliveryBreakdown = null
}) => {
    const normalized = buildNormalizedCheckoutRequest(payload, storeCustomer);
    const orderMethod = normalized.order_method || 'delivery';
    const paymentType = normalized.payment_type || 'cash';
    validateOrderMethodAndPayment({ orderMethod, paymentType });
    if (requireCheckoutContact) {
        ensureRequiredCheckoutContact({
            customerName: normalized.customer_name,
            customerPhone: normalized.customer_phone,
            customerEmail: normalized.customer_email,
            orderMethod,
            deliveryAddress: normalized.delivery_address
        });
    }
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
        orderMethod,
        scheduledFor
    });
    assertCheckoutTimeWithinStorefrontHours({
        scheduledFor,
        settings
    });

    normalized.location_id = location.location_id;

    // Phase 236 (#1328, epic #1321): observation-only server-side road-distance capture. Fired
    // (not awaited) as soon as location + delivery coordinates are both resolved, so it runs
    // concurrently with the rest of this function's own I/O (voucher/promo resolution, etc.)
    // rather than adding to this function's serial latency in the common case -- same guard shape
    // resolveDeliveryRadiusFlag below already uses. Never feeds deliveryFee/totalAmount -- see
    // resolveStoreDeliveryFee (unchanged) and the mapping applied at this promise's await point
    // near the end of this function.
    const deliveryOriginLat = Number(location?.latitude);
    const deliveryOriginLng = Number(location?.longitude);
    // Phase 237 (#1329): FIXED a pre-existing correctness gap here -- normalized.delivery_latitude/
    // longitude are already toNumberOrNull()'d (a finite number or null; see
    // buildNormalizedCheckoutRequest above), so this guard deliberately checks finiteness on the
    // already-normalized value directly rather than re-wrapping it in a redundant `Number(...)`.
    // Harmless while this capture was observation-only (Phase 236), but Phase 237 makes
    // distanceSource feed calculated-mode fee pricing, so a delivery order with genuinely missing
    // coordinates must resolve distanceSource: 'none' (-> fallback to the fixed rate), not silently
    // query the provider with a fabricated coordinate.
    // #1377 review, RF-3: this guard alone was still insufficient -- toNumberOrNull() itself
    // normalized an explicit `null` (and empty-string) coordinate to `0`, which IS finite, so a
    // payload with `delivery_latitude: null` still passed this check with a fabricated (0, 0). Fixed
    // at the source (toNumberOrNull, above) rather than here, so every caller of
    // buildNormalizedCheckoutRequest benefits, not just this one guard.
    const deliveryDestLat = normalized.delivery_latitude;
    const deliveryDestLng = normalized.delivery_longitude;
    const roadDistancePromise = (
        orderMethod === 'delivery'
        && Number.isFinite(deliveryOriginLat) && Number.isFinite(deliveryOriginLng)
        && Number.isFinite(deliveryDestLat) && Number.isFinite(deliveryDestLng)
    )
        ? roadDistanceProvider.resolveRoadDistance({
            tenantId: tenantId || currentTenantAccessContext().tenantId,
            locationId: normalized.location_id,
            originLat: deliveryOriginLat,
            originLng: deliveryOriginLng,
            destLat: deliveryDestLat,
            destLng: deliveryDestLng
        })
        : null;

    const items = await storeRepository.findSellableItemsByIds(itemIds, {
        ...options,
        locationId: normalized.location_id
    });
    const estimatedWaitMinutes = resolveEstimatedWaitMinutes({
        settings,
        location
    });
    const storefrontOpen = location.is_open !== false
        && isDateWithinStorefrontBusinessHours(new Date(), settings?.storefront_hours?.value);

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
    // Phase 1 affiliate pricing rule engine. Sourced from the raw payload (not `normalized`) and
    // the ambient tenant context, mirroring the checkout controller's existing cookie bridge
    // (getAffiliateAttributionCookie / storeHandlers.js) - this function has no tenantId parameter
    // of its own, consistent with the rest of this shared context resolver relying on dbStore's
    // request-scoped tenant context (see currentTenantAccessContext() above).
    const attributionEnrollmentId = payload?.attribution_enrollment_id || null;
    const affiliatePricing = attributionEnrollmentId
        ? await resolveAffiliatePricingForCheckout({
            tenantId: tenantId || currentTenantAccessContext().tenantId,
            enrollmentId: attributionEnrollmentId
        })
        : null;

    const prepared = prepareCheckoutLines({
        rawLines: normalized.lines,
        itemMap,
        allowOutOfStockSales,
        recipeItemIds: recipePlan.recipeItemIds,
        affiliateSellingPriceRule: affiliatePricing?.sellingPriceRule || null,
        locationId: normalized.location_id
    });
    await assertModifierInventoryAvailability({
        storeRepository,
        preparedLines: prepared.preparedLines,
        locationId: normalized.location_id,
        allowOutOfStockSales,
        options
    });
    const promoApplication = resolveStorefrontPromoApplication({
        settings,
        promoCode: normalized.promo_code,
        prepared,
        channel: 'storefront',
        orderMethod,
        scheduledFor
    });

    // Storefront voucher redemption (Phase 105, #455 / ADR 0066). Symmetric to promoApplication
    // above: resolved here (for every caller of resolveCheckoutContext, quote or real checkout) so
    // its discount folds into totalAmount the same way. Gated on `options?.transaction`:
    //   - no transaction (the read-only quote/QRPh-session callers) -> preview only, no reservation.
    //   - transaction present (the real checkout path) -> the full atomic reserve+ledger path,
    //     reusing the already-open checkout transaction. This call is safe to run unconditionally
    //     on every resolveCheckoutContext invocation -- including a checkout retry that reaches
    //     here before buildStoreCheckoutUseCase's own idempotency-key short-circuit below -- because
    //     redeemVoucherUseCase's own idempotency-key pre-check (step 7-8 of the redemption
    //     sequence) finds the already-inserted ledger row on replay and moves nothing a second
    //     time.
    //
    // #667 / ADR 0066 decision 8 (2026-08-19 amendment): voucher and promo used to stack
    // unconditionally here, with no cap and no mutual-exclusivity check -- nothing in this storefront
    // checkout enforced a single discount slot the way decision 8 already does for POS. Fixed by
    // mirroring that same invariant rather than inventing a separate capped-stacking policy for the
    // same class of problem: a voucher code submitted alongside a promo code that already resolved
    // to an applied discount is rejected outright, the same way an incoming POS voucher yields to an
    // already-occupied discount slot. Checked here, before either quote/preview or the real
    // reservation runs, so a customer sees the same rejection at preview time that checkout would
    // enforce, and so an ineligible voucher attempt never burns a redemption slot for a request that
    // was always going to be rejected.
    if (promoApplication.applied && normalized.voucher_code) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'A voucher code cannot be combined with an already-applied promo code on this order.',
            {
                statusCode: 422,
                details: {
                    reason_code: VoucherReasonCode.VOUCHER_DISCOUNT_SLOT_OCCUPIED,
                    promo_code: normalized.promo_code || null
                }
            }
        );
    }

    // #788 (Phase 269): the authenticated buyer's landlord-side DGFY account id, or null.
    //
    // `storeCustomer.dgfy_account_id` is set by storeAuth.js on a DGFY-authenticated session and is
    // NULL for two distinct cases this feature has to keep distinguishable from an eligible buyer:
    // a pure guest (no `storeCustomer` at all, #622's guest-checkout path) and a native
    // store_customer who signed up with email/password and never linked a DGFY account. Both land
    // as null here, so both get VOUCHER_ACCOUNT_REQUIRED -- a clear, actionable 422 naming the
    // missing sign-in, never a silent failure or a generic "invalid code".
    //
    // Threaded onto the SHARED voucher context rather than passed only to the redeem call, because
    // the preview/quote path and the auto-apply selector both read this same object -- a buyer must
    // see the same answer at quote time that checkout will enforce.
    const dgfyAccountId = String(storeCustomer?.dgfy_account_id || '').trim() || null;
    const voucherContext = {
        channel: 'storefront',
        fulfillmentMethod: orderMethod,
        orderTiming: scheduledFor ? 'scheduled' : 'asap',
        subtotalCentavos: toCentavos(prepared.subtotalAmount),
        quantity: prepared.preparedLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        dgfyAccountId,
        affiliatePricing
    };
    const voucherLines = prepared.preparedLines.map((line) => ({
        item_id: line.item_id,
        quantity: line.quantity,
        sale_price: line.sale_price,
        line_subtotal: line.line_subtotal,
        // #697: below-cost guard input. Already computed above (line 950) for the affiliate guard --
        // no new query, just re-projected onto the voucher-facing line shape.
        cost_snapshot: line.cost_snapshot
    }));

    let voucherApplication = {
        applied: false,
        discountAmount: 0,
        discountLabel: null,
        discountRate: null,
        enteredVoucherCode: null,
        benefitClass: null,
        lineAllocations: [],
        redemptionId: null,
        idempotentReplay: false
    };
    if (normalized.voucher_code) {
        if (options?.transaction) {
            const redemption = await redeemVoucherUseCase({
                code: normalized.voucher_code,
                context: voucherContext,
                lines: voucherLines,
                idempotencyKey: normalized.idempotency_key,
                channel: 'storefront',
                storeCustomerId: storeCustomer?.customer_id || null,
                // #788: written to voucher_redemptions.dgfy_account_id -- the per-customer half of
                // #586's tracking model, populated for the first time by this phase.
                dgfyAccountId,
                locationId: normalized.location_id,
                transaction: options.transaction
            });
            // #1331 (Phase 240 plan §5.4): fail closed -- a delivery-targeted voucher entered in
            // THIS field (voucher_code) would otherwise reach calculateVoucherBenefit with
            // deliveryFeeCentavos: null and throw INVALID_DELIVERY_FEE_CENTAVOS, a 500-shaped
            // internal error instead of a clean 422 naming the actual mistake.
            if (redemption.applied && redemption.benefitTarget !== 'items') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'This code is a delivery-fee voucher and cannot be entered as an item voucher.',
                    {
                        statusCode: 422,
                        details: {
                            reason_code: VoucherReasonCode.VOUCHER_BENEFIT_TARGET_MISMATCH,
                            voucher_code: normalized.voucher_code
                        }
                    }
                );
            }
            voucherApplication = {
                applied: redemption.applied,
                discountAmount: centavosToPeso(redemption.discountCentavos),
                // #667 Phase 110: mirrors commercialPromoPolicy.js's own `badge || title || fallback`
                // label exactly. Uses the CANONICAL stored code (`redemption.code`), not the
                // user-entered `normalized.voucher_code` -- the former reflects the voucher's actual
                // stored casing, the same distinction `enteredPromoCode` makes on the promo side.
                discountLabel: redemption.applied
                    ? (redemption.badge || redemption.title || `Voucher (${redemption.code})`)
                    : null,
                // A rate snapshot is only meaningful for a percent-of-subtotal benefit -- amount_off
                // and fixed_price are absolute pesos, not a rate, so they snapshot null (same
                // reasoning `discount_rate_snapshot` already applies fleet-wide: nullable, readers
                // already null-guard it).
                discountRate: redemption.applied && redemption.benefitClass === 'percent_off'
                    ? round4(redemption.percentOffBps / 100)
                    : null,
                enteredVoucherCode: redemption.applied ? redemption.code : null,
                benefitClass: redemption.applied ? redemption.benefitClass : null,
                lineAllocations: redemption.lineAllocations,
                redemptionId: redemption.redemptionId,
                idempotentReplay: Boolean(redemption.idempotentReplay)
            };
        } else {
            const preview = await previewVoucherEligibilityUseCase({
                code: normalized.voucher_code,
                context: voucherContext,
                lines: voucherLines
            });
            // #1331 (Phase 240 plan §5.4): same axis-mismatch guard as the transactional branch
            // above, for the preview/quote path.
            if (preview.applied && preview.benefitTarget !== 'items') {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'This code is a delivery-fee voucher and cannot be entered as an item voucher.',
                    {
                        statusCode: 422,
                        details: {
                            reason_code: VoucherReasonCode.VOUCHER_BENEFIT_TARGET_MISMATCH,
                            voucher_code: normalized.voucher_code
                        }
                    }
                );
            }
            voucherApplication = {
                applied: preview.applied,
                discountAmount: centavosToPeso(preview.discountCentavos),
                discountLabel: preview.applied
                    ? (preview.badge || preview.title || `Voucher (${preview.code})`)
                    : null,
                discountRate: preview.applied && preview.benefitClass === 'percent_off'
                    ? round4(preview.percentOffBps / 100)
                    : null,
                enteredVoucherCode: preview.applied ? preview.code : null,
                benefitClass: preview.applied ? preview.benefitClass : null,
                lineAllocations: preview.lineAllocations,
                redemptionId: null,
                idempotentReplay: false
            };
        }
    }

    // Phase 236 (#1328): reconcile the adapter's own {distanceMeters, source: 'road'|'unavailable'}
    // vocabulary with the persisted road|fallback|none enum -- done ONLY here, never inside the
    // adapter itself (roadDistanceProvider has no notion of orderMethod or the fallback/none split).
    //
    // Phase 237 (#1329): MOVED UP from its original position (after the fee computation) to
    // immediately BEFORE it -- calculated mode requires the resolved distance before it can price.
    // Pure relocation, no logic change: the fire point at roadDistancePromise's own declaration
    // above is unchanged, and everything between that fire point and here (item lookup, promo
    // resolution, voucher resolution) was already-concurrent I/O, so this move costs no latency.
    let deliveryDistanceMeters = null;
    let deliveryDistanceSource = 'none';
    if (roadDistancePromise) {
        // Phase 237 (#1329): the distance await now sits directly upstream of fee pricing (not just
        // an observation-only capture, as it was under Phase 236), so this await is defensively
        // guarded too -- roadDistanceProvider is documented to never reject (routeCalculator's own
        // ApplicationResult contract, plus the adapter's own belt-and-suspenders try/catch), but ADR
        // 0078 Decision 2 [binding]'s "never blocks checkout on a provider failure" means this choke
        // point must not trust that contract blindly. A rejection is treated identically to an
        // 'unavailable' resolution.
        let roadDistanceResult;
        try {
            roadDistanceResult = await roadDistancePromise;
        } catch (error) {
            logger.warn('[DeliveryFee] roadDistanceProvider rejected unexpectedly; treating as unavailable', {
                message: error?.message || null
            });
            roadDistanceResult = { distanceMeters: null, source: 'unavailable' };
        }
        if (roadDistanceResult.source === 'road') {
            deliveryDistanceMeters = roadDistanceResult.distanceMeters;
            deliveryDistanceSource = 'road';
        } else {
            deliveryDistanceMeters = null;
            deliveryDistanceSource = 'fallback';
        }
    }

    // Phase 237 (#1329, Wave 0 decision #2 / D2): a webhook-replay finalization pins the whole
    // breakdown captured at payment-session creation, so the persisted order reflects EXACTLY the
    // amount PayMongo actually captured, not a fresh (possibly different) re-resolution. Advisory
    // TTL only -- see the module-level comment on DELIVERY_QUOTE_PIN_ADVISORY_TTL_MS: this NEVER
    // hard-invalidates the pin, because the money is already captured and this repo has no rollback
    // mechanism (#495 open). A shape/version-invalid pin falls through to normal resolution.
    let delivery;
    // #1331 (Phase 240 plan §5.5): tracks which branch below actually ran, so the delivery voucher
    // block further down knows whether to trust a freshly-recomputed waiver or clamp to the pin.
    let deliveryBreakdownWasPinned = false;
    if (pinnedDeliveryBreakdown !== null && isValidPinnedDeliveryBreakdown(pinnedDeliveryBreakdown)) {
        deliveryBreakdownWasPinned = true;
        const pinnedAtMs = Date.parse(pinnedDeliveryBreakdown.pinned_at);
        const pinAgeMs = Number.isFinite(pinnedAtMs) ? (Date.now() - pinnedAtMs) : null;
        if (pinAgeMs === null || pinAgeMs > DELIVERY_QUOTE_PIN_ADVISORY_TTL_MS) {
            logger.warn('[DeliveryFee] Quoted-fee pin past the advisory TTL (or has no parseable pinned_at) -- honoring it anyway, never hard-invalidated', {
                pin_age_ms: pinAgeMs,
                mode: pinnedDeliveryBreakdown.mode,
                final_fee: pinnedDeliveryBreakdown.finalFee
            });
        }
        delivery = Object.freeze({
            mode: pinnedDeliveryBreakdown.mode,
            baseFee: pinnedDeliveryBreakdown.baseFee,
            waiverAmount: pinnedDeliveryBreakdown.waiverAmount,
            overrideAmount: pinnedDeliveryBreakdown.overrideAmount,
            finalFee: pinnedDeliveryBreakdown.finalFee,
            distanceMeters: pinnedDeliveryBreakdown.distanceMeters,
            distanceSource: pinnedDeliveryBreakdown.distanceSource,
            fallbackApplied: pinnedDeliveryBreakdown.fallbackApplied,
            outOfRange: pinnedDeliveryBreakdown.outOfRange,
            calcVersion: pinnedDeliveryBreakdown.calcVersion,
            // #1332 (Phase 244): `?? null` covers the backward-compatibility case -- a pin written
            // before this deploy has no such key, and `undefined` must read as "no campaign auto-
            // applied at pin time" rather than as a distinct third state.
            autoAppliedVoucherId: pinnedDeliveryBreakdown.autoAppliedVoucherId ?? null
        });
    } else {
        if (pinnedDeliveryBreakdown !== null) {
            // Shape-invalid, or a calcVersion mismatch (a formula change shipped between pin and
            // finalize -- re-resolving is more correct than honoring a pin priced under an old
            // formula). Re-resolve exactly as if no pin had been passed at all.
            logger.warn('[DeliveryFee] pinnedDeliveryBreakdown failed shape/version validation -- re-resolving instead of honoring it', {
                pin_mode: pinnedDeliveryBreakdown?.mode ?? null,
                pin_calc_version: pinnedDeliveryBreakdown?.calcVersion ?? null,
                expected_calc_version: DELIVERY_FEE_CALC_VERSION
            });
        }
        delivery = await resolveStoreDeliveryFee({
            settings,
            orderMethod,
            distanceMeters: deliveryDistanceMeters,
            distanceSource: deliveryDistanceSource,
            locationOverride: null
        });
        // #1332 (Phase 244): resolveStoreDeliveryFee stays voucher-free by design (mirrors #1331's
        // own "this function stays I/O-free" note) -- the auto-apply resolution below (if any) sets
        // this field on the rebuilt `delivery`; every other path (pickup, or a delivery order with
        // neither an entered nor an auto-applied campaign) needs it explicitly `null` rather than
        // `undefined`, so the persisted/pinned breakdown always carries the key.
        delivery = Object.freeze({ ...delivery, autoAppliedVoucherId: null });

        // Risk #1 (Phase 237 plan §13): the road-distance provider's timeout is unmeasured, and a
        // calculated-mode fallback is otherwise invisible to the customer -- they just see the
        // fixed rate. Logged only on a FRESH resolution (never on a pin reuse, which would just be
        // re-logging an already-known historical event from session creation), so the rollout can
        // be measured rather than assumed.
        if (delivery.fallbackApplied) {
            logger.warn('[DeliveryFee] Calculated-mode fallback applied', {
                tenant_id: tenantId || currentTenantAccessContext().tenantId || null,
                location_id: normalized.location_id || null
            });
        }
    }

    // ADR 0078 Decision 2 [binding]: exceeding a known max distance is a deliberate hard block at
    // self-service checkout. Thrown here, before totalAmount is computed, so no total is ever built
    // from an out-of-range fee -- mirrors every other unshippable-order condition in this function
    // (assertCheckoutLocationOperationalReadiness, ensureRequiredCheckoutContact, the voucher slot
    // guard above), all of which already throw DomainError rather than return a status. D6: gated on
    // enforceDeliveryRange so the cart-quote preview (buildStoreCartQuoteUseCase) never throws --
    // see that use case's additive delivery_out_of_range/delivery_distance_meters response fields.
    if (enforceDeliveryRange && delivery.outOfRange) {
        // Read straight from the raw setting rather than threading feeConfig.calc out of
        // resolveStoreDeliveryFee: the pinned-replay branch above never resolves a fresh feeConfig
        // at all, so this detail-only value is looked up independently, the same raw source
        // resolveStoreDeliveryFee itself reads from.
        const rawMaxDistanceKm = Number(settings?.store_delivery_fee_calc?.value?.max_distance_km);
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'This delivery address is outside the store’s maximum delivery distance.',
            {
                statusCode: 422,
                details: {
                    reason_code: 'DELIVERY_DISTANCE_OUT_OF_RANGE',
                    distance_meters: delivery.distanceMeters,
                    max_distance_km: Number.isFinite(rawMaxDistanceKm) ? rawMaxDistanceKm : null
                }
            }
        );
    }

    // #1331 (Phase 240, epic #1321 decision 9): a SECOND, independent voucher resolution -- the
    // delivery-fee axis. Deliberately a NEW step here, not folded into the item-voucher block
    // above: it must run AFTER `delivery` is resolved (its benefit base, `delivery.baseFee`, does
    // not exist before this point -- Phase 240 plan §5.1/§13.3/§13.11) and AFTER the out-of-range
    // hard block above (an out-of-range order must not burn a redemption on a checkout that was
    // always going to 422 -- Phase 240 plan §5.1). ADR 0066 Decision 8's 2026-09-02 amendment is
    // what makes this a second, independent axis rather than something the slot guard above must
    // also police -- ONLY the item-axis guard (promoApplication.applied && normalized.voucher_code)
    // applies to voucher_code; this field is never slot-guarded.
    //
    // #1389 review fixup (RF-1): gated on `orderMethod === 'delivery'` ONLY -- NOT on
    // `delivery.baseFee > 0`. A pickup order has no delivery-fee axis at all and must still skip
    // this block entirely (never burn a redemption). But a delivery order with a zero base fee
    // (free-delivery mode, or any other legitimate zero -- Phase 239's own comment already treats
    // `0` and `null` as distinct) still has the axis; it just resolves to a zero waiver. The
    // original `delivery.baseFee > 0` guard skipped validation/mismatch-checking/redemption
    // entirely whenever baseFee was zero, which (a) let an item-targeted code entered in this
    // field pass through silently instead of failing closed with VOUCHER_BENEFIT_TARGET_MISMATCH,
    // and (b) skipped the required exactly-once redemption on the pinned QRPh/webhook replay path
    // for a validly-entered code that correctly resolves to a zero waiver. Phase 240 plan §13.12
    // called this out directly: the domain layer accepts `deliveryFeeCentavos: 0` as legal, so it's
    // this call site's job to still distinguish pickup (skip) from free-mode-delivery (still run,
    // let the math naturally produce a 0 waiver) -- do not special-case the zero amount.
    let deliveryWaiverApplication = DEFAULT_DELIVERY_WAIVER_APPLICATION;
    if (normalized.delivery_voucher_code && orderMethod === 'delivery') {
        const deliveryVoucherContext = { ...voucherContext, deliveryFeeCentavos: toCentavos(delivery.baseFee) };
        const deliveryResult = options?.transaction
            ? await redeemVoucherUseCase({
                code: normalized.delivery_voucher_code,
                context: deliveryVoucherContext,
                lines: voucherLines,
                // #1331 (Phase 240 plan §4/§13.5): distinct from the item voucher's bare key above
                // -- that key is unchanged, so every existing order's key stays byte-identical to
                // before this phase.
                idempotencyKey: `${normalized.idempotency_key}:delivery`,
                channel: 'storefront',
                storeCustomerId: storeCustomer?.customer_id || null,
                // #788: written to voucher_redemptions.dgfy_account_id -- the per-customer half of
                // #586's tracking model, populated for the first time by this phase.
                dgfyAccountId,
                locationId: normalized.location_id,
                transaction: options.transaction
            })
            : await previewVoucherEligibilityUseCase({
                code: normalized.delivery_voucher_code,
                context: deliveryVoucherContext,
                lines: voucherLines
            });

        // #1331 (Phase 240 plan §5.4): fail closed -- an item-targeted code entered in THIS field
        // would otherwise silently resolve against the delivery fee using the item math.
        if (deliveryResult.applied && deliveryResult.benefitTarget !== 'delivery') {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'This code is not a delivery-fee voucher.',
                {
                    statusCode: 422,
                    details: {
                        reason_code: VoucherReasonCode.VOUCHER_BENEFIT_TARGET_MISMATCH,
                        delivery_voucher_code: normalized.delivery_voucher_code
                    }
                }
            );
        }

        const resolvedWaiverAmount = centavosToPeso(deliveryResult.discountCentavos);
        const labelSnapshot = deliveryResult.applied
            ? (deliveryResult.badge || deliveryResult.title || `Voucher (${deliveryResult.code})`)
            : null;

        if (deliveryBreakdownWasPinned) {
            // Phase 240 plan §5.5: the pinned-breakdown replay path -- every QRPh/webhook-finalized
            // order takes this branch. The redemption above still has to happen exactly once, on
            // this transactional pass -- but the PERSISTED waiver amount comes from the pin
            // captured at payment-session creation, never from a fresh recomputation that could
            // disagree with the amount PayMongo actually captured. Never throws, never re-prices --
            // this repo has no rollback (#495).
            if (deliveryResult.applied && resolvedWaiverAmount !== pinnedDeliveryBreakdown.waiverAmount) {
                logger.warn('[DeliveryFee] Delivery voucher waiver recomputed differently from the pinned amount -- honoring the pin', {
                    pinned_waiver_amount: pinnedDeliveryBreakdown.waiverAmount,
                    resolved_waiver_amount: resolvedWaiverAmount
                });
            }
            deliveryWaiverApplication = Object.freeze({
                applied: deliveryResult.applied,
                waiverAmount: pinnedDeliveryBreakdown.waiverAmount,
                voucherId: deliveryResult.voucherId,
                labelSnapshot,
                redemptionId: deliveryResult.redemptionId ?? null,
                idempotentReplay: Boolean(deliveryResult.idempotentReplay),
                enteredDeliveryVoucherCode: deliveryResult.applied ? deliveryResult.code : null,
                // #1332: a typed code, never auto-applied -- this branch only runs when
                // normalized.delivery_voucher_code is present.
                autoApplied: false
            });
            // `delivery` stays exactly as the pin gave it -- do not rebuild it on this branch.
        } else {
            deliveryWaiverApplication = Object.freeze({
                applied: deliveryResult.applied,
                waiverAmount: resolvedWaiverAmount,
                voucherId: deliveryResult.voucherId,
                labelSnapshot,
                redemptionId: deliveryResult.redemptionId ?? null,
                idempotentReplay: Boolean(deliveryResult.idempotentReplay),
                enteredDeliveryVoucherCode: deliveryResult.applied ? deliveryResult.code : null,
                autoApplied: false
            });
            // ADR 0078: finalFee = max(0, baseFee - waiverAmount); overrideAmount (#1330, not built
            // yet) still wins when present -- the same precedence resolveStoreDeliveryFee's own
            // formula already encodes. overrideAmount is always null here today (#1330 hasn't
            // shipped), kept for when it does.
            const nextFinalFee = delivery.overrideAmount !== null
                ? delivery.overrideAmount
                : Math.max(0, round4(delivery.baseFee - deliveryWaiverApplication.waiverAmount));
            delivery = Object.freeze({
                ...delivery,
                waiverAmount: deliveryWaiverApplication.waiverAmount,
                finalFee: nextFinalFee,
                // #1332: a code-entered waiver is never an auto-applied one -- explicit null so the
                // pinned breakdown never carries a stale/wrong campaign id on this branch.
                autoAppliedVoucherId: null
            });
        }
    } else if (orderMethod === 'delivery') {
        // #1332 (Phase 244, epic #1321 decision 9): auto-apply. Mutually exclusive with the
        // code-entered branch above BY CONSTRUCTION (else-if on the same `deliveryWaiverApplication`
        // variable, gated on the same `orderMethod === 'delivery'` condition) -- D3: an explicitly
        // typed delivery code always beats an auto-applied campaign, and auto-apply is skipped
        // entirely whenever one was typed, so no budget is ever burned evaluating it. A pickup order
        // (orderMethod !== 'delivery') skips this branch entirely too, same as the code-entered one.
        //
        // Runs AFTER `delivery` is resolved (its benefit base, delivery.baseFee, doesn't exist
        // before this point) and AFTER the out-of-range hard block above (an out-of-range order must
        // never burn a redemption on a checkout that was always going to 422) -- same ordering
        // reasoning #1331's own block already established.
        if (deliveryBreakdownWasPinned) {
            // Webhook-finalize replay. `autoAppliedVoucherId == null` on the pin means no campaign
            // auto-applied at payment-session-creation time -- skip entirely rather than
            // opportunistically applying a campaign that appeared after the shopper already paid
            // (the captured amount would no longer match). `delivery` stays exactly as the pin gave
            // it either way; this branch only ever sets `deliveryWaiverApplication`.
            if (pinnedDeliveryBreakdown.autoAppliedVoucherId != null) {
                let pinnedCampaign = null;
                try {
                    pinnedCampaign = await voucherRepository.findById(
                        pinnedDeliveryBreakdown.autoAppliedVoucherId,
                        { transaction: options?.transaction }
                    );
                } catch (error) {
                    logger.warn('[AutoApplyDelivery] Failed to re-resolve the pinned auto-applied campaign by id', {
                        voucher_id: pinnedDeliveryBreakdown.autoAppliedVoucherId,
                        message: error?.message || null
                    });
                }

                if (pinnedCampaign) {
                    try {
                        const autoApplyResult = options?.transaction
                            ? await redeemVoucherUseCase({
                                code: pinnedCampaign.code,
                                context: { ...voucherContext, deliveryFeeCentavos: toCentavos(delivery.baseFee) },
                                lines: voucherLines,
                                // Distinct from both the item voucher's bare key and the code-entered
                                // delivery key above -- so a request that legitimately carries both a
                                // typed item code AND (on a DIFFERENT prior attempt) an auto-applied
                                // delivery campaign never collides in the idempotency ledger.
                                idempotencyKey: `${normalized.idempotency_key}:delivery-auto`,
                                channel: 'storefront',
                                storeCustomerId: storeCustomer?.customer_id || null,
                                // #788: written to voucher_redemptions.dgfy_account_id -- the per-customer half of
                                // #586's tracking model, populated for the first time by this phase.
                                dgfyAccountId,
                                locationId: normalized.location_id,
                                transaction: options.transaction
                            })
                            : null;

                        if (autoApplyResult?.applied) {
                            const labelSnapshot = autoApplyResult.badge || autoApplyResult.title || `Voucher (${autoApplyResult.code})`;
                            deliveryWaiverApplication = Object.freeze({
                                applied: true,
                                // PERSISTED amount comes from the pin, never a fresh recomputation --
                                // same posture as the code-entered pinned branch above (#1331):
                                // never throws, never re-prices, this repo has no rollback (#495).
                                waiverAmount: pinnedDeliveryBreakdown.waiverAmount,
                                voucherId: autoApplyResult.voucherId,
                                labelSnapshot,
                                redemptionId: autoApplyResult.redemptionId ?? null,
                                idempotentReplay: Boolean(autoApplyResult.idempotentReplay),
                                // Never the campaign's code -- `enteredDeliveryVoucherCode` signals
                                // "the shopper typed this," which is false for every auto-apply path
                                // (RF-1, PR #1397 review). The campaign's identity is still fully
                                // recoverable via `voucherId`/`autoAppliedVoucherId` + `labelSnapshot`.
                                enteredDeliveryVoucherCode: null,
                                autoApplied: true
                            });
                        }
                    } catch (error) {
                        // D2: fails open here too -- never blocks a webhook finalization (money is
                        // already captured) because the pinned campaign could not be re-redeemed.
                        logger.warn('[AutoApplyDelivery] Pinned auto-applied campaign failed to redeem on finalize -- fail open', {
                            voucher_id: pinnedDeliveryBreakdown.autoAppliedVoucherId,
                            message: error?.message || null,
                            reason_code: error?.details?.reason_code || null
                        });
                    }
                }
            }
            // `delivery` stays exactly as the pin gave it -- do not rebuild it on this branch.
        } else {
            // Fresh resolution: cart quote, direct (non-QRPh) checkout, or QRPh payment-session
            // creation -- the only pinned pass is the webhook-finalize replay handled above. One
            // explicit `now`, shared between the selector and the redemption call below, so a
            // campaign with a valid_time_end boundary can't select one way and redeem another within
            // the same request (Risk R2, Phase 244 plan).
            const autoApplyNow = new Date();
            let selection = { selected: null, waiverCentavos: 0 };
            try {
                selection = await resolveAutoAppliedDeliveryCampaignUseCase({
                    context: {
                        ...voucherContext,
                        deliveryFeeCentavos: toCentavos(delivery.baseFee),
                        now: autoApplyNow
                    },
                    transaction: options?.transaction ?? null
                });
            } catch (error) {
                // Fail open on the candidate READ itself, not just the redemption -- this is a
                // zero-side-effect query (`listAutoApplyDeliveryCampaigns` never writes), and every
                // other soft dependency `resolveCheckoutContext` calls (roadDistanceProvider, the
                // calculated-fee formula) already fails open to a safe default on its own error
                // rather than blocking checkout. A shopper should never see checkout fail because a
                // promotional-campaign lookup errored.
                logger.warn('[AutoApplyDelivery] Failed to resolve auto-apply candidates -- fail open, no campaign considered', {
                    message: error?.message || null
                });
            }

            if (selection.selected) {
                let autoApplyResult;
                if (options?.transaction) {
                    try {
                        autoApplyResult = await redeemVoucherUseCase({
                            code: selection.selected.code,
                            context: {
                                ...voucherContext,
                                deliveryFeeCentavos: toCentavos(delivery.baseFee),
                                now: autoApplyNow
                            },
                            lines: voucherLines,
                            idempotencyKey: `${normalized.idempotency_key}:delivery-auto`,
                            channel: 'storefront',
                            storeCustomerId: storeCustomer?.customer_id || null,
                            // #788: written to voucher_redemptions.dgfy_account_id -- the per-customer half of
                            // #586's tracking model, populated for the first time by this phase.
                            dgfyAccountId,
                            locationId: normalized.location_id,
                            transaction: options.transaction
                        });
                    } catch (error) {
                        // D2 (Phase 244 plan §4.5): auto-apply FAILS OPEN on a redemption failure --
                        // no waiver, checkout proceeds, no next-candidate retry. Consistent with ADR
                        // 0066 Decision 3's entered-vs-empty distinction
                        // (voucherRedemptionUseCases.js's own module docstring): the shopper entered
                        // nothing, so there is nothing to fail closed about. Blocking a paying
                        // customer's checkout because a promotional campaign hit its cap between the
                        // candidate read and the reserve is strictly worse than charging the normal
                        // delivery fee. No retry against the next candidate either -- see that
                        // section for why (lock-contention footgun, and the window this covers is
                        // vanishingly small: both reads happen inside the same open transaction).
                        logger.warn('[AutoApplyDelivery] Selected campaign failed to redeem -- fail open, checkout proceeds with no waiver', {
                            voucher_id: selection.selected.voucher_id,
                            code: selection.selected.code,
                            message: error?.message || null,
                            reason_code: error?.details?.reason_code || null
                        });
                        autoApplyResult = null;
                    }
                } else {
                    // Preview (quote, or QRPh payment-session creation): the selector has already
                    // computed eligibility and the exact waiver for the winner, purely -- take the
                    // numbers from `selection` directly rather than a second, redundant preview call
                    // that could theoretically disagree.
                    autoApplyResult = {
                        applied: true,
                        voucherId: selection.selected.voucher_id,
                        code: selection.selected.code,
                        title: selection.selected.title,
                        badge: selection.selected.badge,
                        discountCentavos: selection.waiverCentavos,
                        redemptionId: null,
                        idempotentReplay: false
                    };
                }

                if (autoApplyResult?.applied) {
                    const resolvedWaiverAmount = centavosToPeso(autoApplyResult.discountCentavos);
                    const labelSnapshot = autoApplyResult.badge || autoApplyResult.title || `Voucher (${autoApplyResult.code})`;
                    deliveryWaiverApplication = Object.freeze({
                        applied: true,
                        waiverAmount: resolvedWaiverAmount,
                        voucherId: autoApplyResult.voucherId,
                        labelSnapshot,
                        redemptionId: autoApplyResult.redemptionId ?? null,
                        idempotentReplay: Boolean(autoApplyResult.idempotentReplay),
                        // Same RF-1 fix as the pinned/webhook-finalize branch above -- never the
                        // campaign's code, this was never something the shopper entered.
                        enteredDeliveryVoucherCode: null,
                        autoApplied: true
                    });
                    const nextFinalFee = delivery.overrideAmount !== null
                        ? delivery.overrideAmount
                        : Math.max(0, round4(delivery.baseFee - deliveryWaiverApplication.waiverAmount));
                    delivery = Object.freeze({
                        ...delivery,
                        waiverAmount: deliveryWaiverApplication.waiverAmount,
                        finalFee: nextFinalFee,
                        autoAppliedVoucherId: deliveryWaiverApplication.voucherId
                    });
                }
            }
        }
    }

    // Kept as a scalar alongside the new `delivery` breakdown object (purely additive) -- every
    // existing read site (cart-quote response, checkout persistence/response, payment-session
    // persistence) keeps reading `resolved.deliveryFee` unchanged, which is what keeps this diff's
    // four money-adjacent call sites untouched (Phase 237 plan §4.1).
    const deliveryFee = delivery.finalFee;
    const serviceFeeAmount = revenueSharingEnabled
        ? 0
        : computeDgfyConvenienceFee(prepared.subtotalAmount);
    const serviceFeeLabel = getDgfyConvenienceFeeLabel();
    const totalAmount = round4(
        prepared.subtotalAmount - promoApplication.discountAmount - voucherApplication.discountAmount + deliveryFee + serviceFeeAmount
    );

    // Phase 140 (#821, ADR 0069/0070): resolve the downpayment split server-side, after the
    // promo/voucher fold above -- the downpayment is a share of the *discounted* total, never the
    // pre-discount subtotal. Computed for every caller of resolveCheckoutContext (quote and real
    // checkout alike), the same way promoApplication/voucherApplication are, so a shopper sees the
    // same split in the cart drawer that checkout will actually enforce. No ambient tenantId (the
    // ~30 existing store unit tests that build these use cases with a hand-rolled fake and no
    // dbStore.run context) resolves to `null` settings, which resolveDownpaymentForTotal treats as
    // full_payment -- so this addition needs no edits to any of those tests.
    const resolvedTenantIdForDownpayment = tenantId || currentTenantAccessContext().tenantId;
    const downpaymentSettings = resolvedTenantIdForDownpayment
        ? await downpaymentSettingsRepository?.getSettings?.(resolvedTenantIdForDownpayment)
        : null;
    const downpayment = resolveDownpaymentForTotal({
        settings: downpaymentSettings || null,
        totalAmount,
        // Phase 150 (#866): only consulted by resolveDownpaymentForTotal when the settings row is
        // 'customer_choice' -- a no-op for every existing 'full_payment'/'downpayment_required'
        // store, so this addition needs no edits to any test that doesn't exercise customer_choice.
        paymentElection: normalized.payment_election
    });

    const outsideRadiusFlag = resolveDeliveryRadiusFlag({
        orderMethod,
        location,
        deliveryLatitude: normalized.delivery_latitude,
        deliveryLongitude: normalized.delivery_longitude
    });

    return {
        normalized,
        settings,
        accessPolicy,
        location,
        storefront_open: storefrontOpen,
        estimated_wait_minutes: estimatedWaitMinutes,
        prepared,
        recipePlan,
        promoApplication,
        voucherApplication,
        // #1331 (Phase 240): the delivery-fee axis's own application object, deliberately separate
        // from voucherApplication above (ADR 0066 Decision 8's 2026-09-02 amendment -- two
        // independent axes, not one governed slot).
        deliveryWaiverApplication,
        deliveryFee,
        // Phase 237 (#1329): the full resolved breakdown, additive alongside the deliveryFee scalar
        // above (which stays === delivery.finalFee). See resolveStoreDeliveryFee's own doc comment
        // for the field-by-field contract.
        delivery,
        serviceFeeAmount,
        serviceFeeLabel,
        totalAmount,
        downpayment,
        // Phase 141 (#822): raw settings alongside the resolved split, so a caller can detect the
        // "tenant configured downpayment_required but the row itself is malformed" case -- the
        // resolved `downpayment.payment_mode` alone can't distinguish that from "tenant genuinely
        // configured full_payment", since resolveDownpaymentForTotal fails closed to the same
        // full_payment shape for both. See the payment-session use case's DOWNPAYMENT_POLICY_UNRESOLVED guard.
        downpaymentSettings: downpaymentSettings || null,
        outsideRadiusFlag,
        deliveryDistanceMeters,
        deliveryDistanceSource,
        scheduledFor,
        affiliatePricing
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

const resolveStorefrontPaymentCapabilities = async ({
    commercePaymentRepository,
    tenantRevenueRepository,
    paymongoService = null,
    commercePaymentsEnabled,
    commerceQrphEnabled,
    requireCommerceQrphConfig,
    requireCommercePaymentConfig = requireCommerceQrphConfig,
    paymongoMode,
    revenueSharingEnabled,
    // #926: when direct-only mode is required, the checkout use case (~line 3623) rejects
    // card/gcash/maya unless their own direct*Enabled flag is on -- but this function never
    // received these flags at all, so the catalog kept advertising those methods as available
    // even when checkout would reject them. Mirrors buildStoreCheckoutPaymentSessionUseCase's own
    // param shape so both use cases agree on the same four inputs.
    directPaymentRequired = false,
    directGcashEnabled = false,
    directMayaEnabled = false,
    directCardEnabled = false
}) => {
    const supportsHostedCapabilityLookup = typeof paymongoService?.getPaymentMethodCapabilities === 'function';
    const paymentTypes = supportsHostedCapabilityLookup
        ? ['card', 'gcash', 'maya', 'grab_pay', 'shopeepay', 'qrph']
        : ['qrph'];
    const disabled = (reasonCode) => Object.fromEntries(paymentTypes.map((paymentType) => [paymentType, {
            enabled: false,
            environment: paymongoMode,
            reason_code: reasonCode
        }]));

    try {
        if (!commercePaymentsEnabled) return disabled('FEATURE_DISABLED');
        if (requireCommercePaymentConfig().length > 0) return disabled('SERVER_CONFIGURATION_INCOMPLETE');

        const tenantId = normalizeTenantIdentifier((dbStore.getStore() || {}).tenantId);
        if (!tenantId || tenantId === 'default') return disabled('TENANT_CONTEXT_MISSING');

        if (revenueSharingEnabled) {
            const policy = await tenantRevenueRepository?.findEffectiveFeePolicy?.(tenantId, new Date());
            if (!policy || policy.settlement_status !== 'active' || !policy.payout_destination_masked) {
                return disabled('TENANT_REVENUE_POLICY_NOT_READY');
            }
        } else if (commerceQrphEnabled) {
            const account = await commercePaymentRepository?.findTenantPaymentAccount?.({ tenantId, provider: 'paymongo' });
            if (
                !account
                || account.onboarding_status !== 'active'
                || !account.qrph_enabled
                || !account.split_enabled
                || !account.charges_enabled
                || account.wallet_status !== 'enabled'
                || !account.wallet_verified_at
            ) {
                return disabled('PAYMONGO_ACCOUNT_NOT_READY');
            }
        } else {
            return disabled('TENANT_REVENUE_POLICY_NOT_READY');
        }

        const providerMethods = supportsHostedCapabilityLookup
            ? await paymongoService.getPaymentMethodCapabilities()
            : ['qrph'];
        const hasProviderMethod = (paymentType) => (
            (PAYMENT_METHOD_CAPABILITY_ALIASES[paymentType] || [getHostedPaymentMethodType(paymentType)])
                .some((method) => providerMethods.includes(method))
        );
        const capabilities = Object.fromEntries(paymentTypes.map((paymentType) => [paymentType, {
            enabled: false,
            environment: paymongoMode,
            reason_code: 'PAYMENT_METHOD_NOT_AVAILABLE'
        }]));

        for (const paymentType of supportsHostedCapabilityLookup ? Object.keys(HOSTED_PAYMENT_METHOD_TYPES) : []) {
            if (revenueSharingEnabled && hasProviderMethod(paymentType)) {
                capabilities[paymentType] = {
                    enabled: true,
                    environment: paymongoMode,
                    reason_code: null
                };
            }
        }

        if (commerceQrphEnabled && hasProviderMethod('qrph')) {
            capabilities.qrph = {
                enabled: true,
                environment: paymongoMode,
                reason_code: null
            };
        } else if (!commerceQrphEnabled) {
            capabilities.qrph = {
                enabled: false,
                environment: paymongoMode,
                reason_code: 'FEATURE_DISABLED'
            };
        }

        // #926: direct-only mode gate, applied last so it overrides whatever the provider-method
        // lookup above advertised -- matches the checkout use case's own directMethodUnavailable
        // check (same file, buildStoreCheckoutPaymentSessionUseCase) so advertise and enforce
        // agree. Only card/gcash/maya have a direct-payment path today; grab_pay/shopeepay/qrph
        // are untouched by this flag.
        if (directPaymentRequired) {
            if (!directGcashEnabled && capabilities.gcash) {
                capabilities.gcash = {
                    enabled: false,
                    environment: paymongoMode,
                    reason_code: 'DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE'
                };
            }
            if (!directMayaEnabled && capabilities.maya) {
                capabilities.maya = {
                    enabled: false,
                    environment: paymongoMode,
                    reason_code: 'DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE'
                };
            }
            if (!directCardEnabled && capabilities.card) {
                capabilities.card = {
                    enabled: false,
                    environment: paymongoMode,
                    reason_code: 'DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE'
                };
            }
        }

        return capabilities;
    } catch (error) {
        logger.warn('Storefront payment capability readiness check failed', {
            error: error?.message || String(error)
        });
        return disabled('READINESS_CHECK_FAILED');
    }

};

// Phase 142 (#823): the storefront needs to know a store's downpayment payment_mode BEFORE it
// ever quotes (Simple mode in particular never quotes without a discount code), so the storefront
// can hide the cash option and force a quote up front instead of discovering the requirement only
// at session-create time. Fails closed to 'full_payment' -- a settings-read error must never 500
// the public catalog, and the storefront's existing behavior for every store that doesn't set
// this must not change (same additive-only discipline as Phase 140's downpayment split on the
// quote response). This intentionally does NOT reuse resolveDownpaymentForTotal (that also
// downgrades a *malformed* downpayment_required row to full_payment) -- here we report the
// tenant's stored intent verbatim, so the UI hides cash and forces a quote even against a
// malformed row; the malformed case still 422s at session-create time
// (DOWNPAYMENT_POLICY_UNRESOLVED), never silently falls through to an un-gated cash order.
//
// Phase 150 (#866): 'customer_choice' now passes through verbatim too (previously flattened into
// 'full_payment' along with everything else that wasn't 'downpayment_required') -- the storefront
// needs to see it to render the pay-in-full-vs-downpayment election control at all.
const resolveStorefrontPaymentMode = async ({ downpaymentSettingsRepository, tenantId }) => {
    if (!tenantId || typeof downpaymentSettingsRepository?.getSettings !== 'function') {
        return 'full_payment';
    }
    try {
        const settings = await downpaymentSettingsRepository.getSettings(tenantId);
        if (settings?.payment_mode === 'downpayment_required' || settings?.payment_mode === 'customer_choice') {
            return settings.payment_mode;
        }
        return 'full_payment';
    } catch (error) {
        logger?.warn?.('Failed to resolve storefront payment_mode for catalog; defaulting to full_payment', {
            tenantId,
            error: error?.message || String(error)
        });
        return 'full_payment';
    }
};

export const buildListStoreCatalogUseCase = ({
    storeRepository,
    commercePaymentRepository = null,
    tenantRevenueRepository = null,
    paymongoService = null,
    commercePaymentsEnabled = false,
    commerceQrphEnabled = false,
    requireCommerceQrphConfig = () => [],
    requireCommercePaymentConfig = requireCommerceQrphConfig,
    paymongoMode = 'test',
    revenueSharingEnabled = tenantRevenueSharingEnabled,
    resolveWorkflowCapabilitySettings = resolveWorkflowCapabilitySettingsDefault,
    downpaymentSettingsRepository = null,
    // #926: threaded through to resolveStorefrontPaymentCapabilities so the catalog agrees with
    // what buildStoreCheckoutPaymentSessionUseCase will actually accept.
    directPaymentRequired = false,
    directGcashEnabled = false,
    directMayaEnabled = false,
    directCardEnabled = false
}) => {
    // tenantId/attributionEnrollmentId are optional and additive - a caller that omits them (or the
    // cookie/tenant simply isn't present) gets exactly today's catalog, unaffected. See
    // storeHandlers.js's listStoreCatalog controller for where these come from (mirrors the existing
    // checkout cookie bridge).
    return async ({ query = {}, tenantId = null, attributionEnrollmentId = null } = {}) => {
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

            const [accessPolicy, paymentCapabilities, paymentMode] = await Promise.all([
                resolveStorefrontAccessPolicy({ storeRepository }),
                resolveStorefrontPaymentCapabilities({
                    commercePaymentRepository,
                    tenantRevenueRepository,
                    paymongoService,
                    commercePaymentsEnabled,
                    commerceQrphEnabled,
                    requireCommerceQrphConfig,
                    requireCommercePaymentConfig,
                    paymongoMode,
                    revenueSharingEnabled,
                    directPaymentRequired,
                    directGcashEnabled,
                    directMayaEnabled,
                    directCardEnabled
                }),
                resolveStorefrontPaymentMode({
                    downpaymentSettingsRepository,
                    tenantId: tenantId || currentTenantAccessContext().tenantId
                })
            ]);
            // #626 (Phase 203): cash availability is orthogonal to PayMongo readiness -- a tenant
            // with no PayMongo account at all must still be able to take cash, so this is merged
            // at the call site rather than inside resolveStorefrontPaymentCapabilities (which has
            // six early `disabled(...)` returns for PayMongo-specific failure modes that must never
            // gate cash).
            const paymentCapabilitiesWithCash = {
                ...paymentCapabilities,
                cash: {
                    enabled: accessPolicy.cash_payment_enabled !== false,
                    environment: null,
                    reason_code: accessPolicy.cash_payment_enabled === false ? 'STORE_CASH_DISABLED' : null
                }
            };
            // Live (15s-cached) workflow mode + composed-capability overlay, so a
            // retail/fnb tenant with `services` enabled via ops_enabled_capabilities
            // can be recognized by the storefront even though its scalar
            // workflow_mode alone would say otherwise (see
            // app/runtime/modePresentationRegistry.js on the frontend).
            const { mode: workflowMode, enabledCapabilities } = await resolveWorkflowCapabilitySettings();
            if (isCustomerAccessEnabledForCurrentTenant() && accessPolicy.access_capabilities.catalog !== true) {
                return ok({
                    items: [],
                    pagination: {
                        limit: Number.isFinite(Number(query.limit))
                            ? Math.max(1, Math.min(200, Number(query.limit)))
                            : 60,
                        count: 0
                    },
                    access_policy: accessPolicy,
                    workflow_mode: workflowMode,
                    enabled_capabilities: enabledCapabilities,
                    payment_capabilities: paymentCapabilitiesWithCash,
                    payment_mode: paymentMode
                });
            }

            const voucherCode = String(query.voucher_code || '').trim();
            const [items, affiliateSellingPriceRule] = await Promise.all([
                storeRepository.listStoreCatalog({
                    search: query.search,
                    limit: query.limit,
                    location_id: requestedLocationId
                }),
                attributionEnrollmentId
                    ? resolveAffiliateSellingPriceRuleForDisplay({ tenantId, enrollmentId: attributionEnrollmentId })
                    : Promise.resolve(null)
            ]);
            // #603: resolved once per request, after the item fetch (needs each item's folder_id
            // for scope resolution), same batching discipline as the affiliate rule above -- a
            // 200-item catalog page still does exactly one voucher lookup, not one per item.
            const voucherDisplay = voucherCode
                ? await resolveVoucherDisplayPricesUseCase({
                    code: voucherCode,
                    items: (Array.isArray(items) ? items : []).map((item) => ({
                        item_id: item.item_id,
                        folder_id: item.folder_id,
                        default_sale_price: item.default_sale_price,
                        // #697: below-cost guard input, fail-open per item at display time.
                        cost_per_unit: item.cost_per_unit
                    })),
                    channel: 'storefront',
                    affiliatePricingActive: affiliateSellingPriceRule != null
                })
                : null;
            const serializedItems = (Array.isArray(items) ? items : [])
                .filter((item) => hasExplicitSalePrice(item))
                .map((item) => (
                    serializeStoreCatalogItem(item, accessPolicy, affiliateSellingPriceRule, requestedLocationId, voucherDisplay)
                ));

            return ok({
                items: serializedItems,
                pagination: {
                    limit: Number.isFinite(Number(query.limit))
                        ? Math.max(1, Math.min(200, Number(query.limit)))
                        : 60,
                    count: serializedItems.length
                },
                access_policy: accessPolicy,
                workflow_mode: workflowMode,
                enabled_capabilities: enabledCapabilities,
                payment_capabilities: paymentCapabilitiesWithCash,
                payment_mode: paymentMode
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
    // Same additive tenantId/attributionEnrollmentId contract as buildListStoreCatalogUseCase above.
    return async ({ query = {}, tenantId = null, attributionEnrollmentId = null } = {}) => {
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

            const affiliateSellingPriceRule = attributionEnrollmentId
                ? await resolveAffiliateSellingPriceRuleForDisplay({ tenantId, enrollmentId: attributionEnrollmentId })
                : null;
            const qrVoucherCode = String(query.voucher_code || '').trim();
            const voucherDisplay = qrVoucherCode
                ? await resolveVoucherDisplayPricesUseCase({
                    code: qrVoucherCode,
                    items: [{
                        item_id: result.item.item_id,
                        folder_id: result.item.folder_id,
                        default_sale_price: result.item.default_sale_price,
                        // #697: below-cost guard input, fail-open per item at display time.
                        cost_per_unit: result.item.cost_per_unit
                    }],
                    channel: 'storefront',
                    affiliatePricingActive: affiliateSellingPriceRule != null
                })
                : null;
            const item = serializeStoreCatalogItem(result.item, accessPolicy, affiliateSellingPriceRule, requestedLocationId, voucherDisplay);
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
            const settings = mapSettings(await storeRepository.getSettingsByKeys([STORE_HAS_NO_LOCATION_KEY]));
            const storeHasNoLocation = parseBooleanSetting(settings[STORE_HAS_NO_LOCATION_KEY]?.value, false);
            if (storeHasNoLocation) {
                return ok({
                    locations: [],
                    primary_location_id: null,
                    store_has_no_location: true,
                    map_publication_disabled: true
                });
            }

            const locations = await storeRepository.listActiveLocations();
            const serialized = (Array.isArray(locations) ? locations : []).map((location) => (
                serializeLocationSummary(location)
            ));
            const primary = serialized.find((location) => location?.is_primary_storefront === true) || null;

            return ok({
                locations: serialized,
                primary_location_id: primary?.location_id || null,
                store_has_no_location: false,
                map_publication_disabled: false
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

export const buildStoreCartQuoteUseCase = ({
    storeRepository,
    revenueSharingEnabled = tenantRevenueSharingEnabled,
    // Phase 140 (#821): see the resolveCheckoutContext-level comment. No default -- store/index.js
    // wires the real repository; every existing test that omits this gets `undefined`.
    downpaymentSettingsRepository,
    // Phase 236 (#1328): see the resolveCheckoutContext-level comment. Has its own default there,
    // so omitting this here (every pre-existing caller/test) still exercises the real singleton.
    roadDistanceProvider
}) => {
    return async ({ payload, storeCustomer = null }) => {
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const resolved = await resolveCheckoutContext({
                storeRepository,
                payload,
                storeCustomer,
                revenueSharingEnabled,
                downpaymentSettingsRepository,
                roadDistanceProvider,
                // #746: this is a preview -- see resolveCheckoutContext's own comment on the option.
                requireCheckoutContact: false,
                // Phase 237 (#1329, ADR 0078 Decision 2 [binding], D6): a cart quote must never
                // throw on an out-of-range address -- the shopper still needs to see their cart
                // total. The blocked state surfaces as delivery_out_of_range/delivery_distance_meters
                // below instead; the two order-placing use cases keep the default `true`.
                enforceDeliveryRange: false
            });
            return ok({
                subtotal_amount: resolved.prepared.subtotalAmount,
                discount_amount: resolved.promoApplication.discountAmount,
                discount_label: resolved.promoApplication.discountLabel,
                discount_rate: resolved.promoApplication.discountRate,
                voucher_discount_amount: resolved.voucherApplication.discountAmount,
                service_fee_amount: resolved.serviceFeeAmount,
                service_fee_label: resolved.serviceFeeLabel,
                delivery_fee: resolved.deliveryFee,
                // #1331 (Phase 240, epic #1321 decision 9): additive, alongside delivery_fee above
                // -- so a shopper sees the waiver applied at quote time, before reaching checkout.
                delivery_fee_waiver: resolved.deliveryWaiverApplication.waiverAmount,
                // Phase 237 (#1329, D6): additive. `delivery_out_of_range` mirrors
                // resolved.delivery.outOfRange; `delivery_distance_meters` mirrors
                // resolved.delivery.distanceMeters (populated only when distanceSource === 'road').
                // Never gates anything client-side by itself -- checkout/payment-session are the
                // actual enforcement points -- but lets the storefront disable submit / show the
                // out-of-range affordance before the shopper reaches checkout.
                delivery_out_of_range: resolved.delivery.outOfRange,
                delivery_distance_meters: resolved.delivery.distanceMeters,
                total_amount: resolved.totalAmount,
                // Phase 140 (#821, ADR 0069/0070): server-authoritative downpayment split.
                // downpayment_amount/balance_due_amount/downpayment_refundable are null when
                // payment_mode is 'full_payment' -- never 0 or the total -- so a frontend cannot
                // mistake "no downpayment" for "downpayment of zero".
                payment_mode: resolved.downpayment.payment_mode,
                downpayment_amount: resolved.downpayment.downpayment_amount,
                balance_due_amount: resolved.downpayment.balance_due_amount,
                downpayment_refundable: resolved.downpayment.downpayment_refundable,
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
                })),
                promo_feedback: resolved.promoApplication.applied
                    ? {
                        applied: true,
                        promo_code: resolved.promoApplication.enteredPromoCode,
                        message: resolved.promoApplication.message
                    }
                    : null,
                voucher_feedback: resolved.voucherApplication.applied
                    ? { applied: true, voucher_code: normalizeVoucherCode(payload.voucher_code) }
                    : null,
                // #1331 (Phase 240): sibling of voucher_feedback above, for the delivery-fee axis.
                // #1332 (Phase 244): the code is sourced from `deliveryWaiverApplication`'s own
                // resolved canonical code, not `payload.delivery_voucher_code` -- an auto-applied
                // campaign has NO payload code at all, so reading the request field would report a
                // waiver applied with no indication of what applied it. `enteredDeliveryVoucherCode`
                // is populated (non-null) ONLY on the code-entered path and stays null on both
                // auto-applied paths (RF-1, PR #1397 review) -- that field exists specifically to
                // signal "the shopper typed this," which auto-apply never is. Which campaign applied
                // is still recoverable via `voucherId`/`autoAppliedVoucherId` and the `auto_applied`/
                // `label` fields the storefront UI (#1391) uses to render an auto-applied campaign
                // differently from a typed one.
                delivery_voucher_feedback: resolved.deliveryWaiverApplication.applied
                    ? {
                        applied: true,
                        voucher_code: resolved.deliveryWaiverApplication.enteredDeliveryVoucherCode,
                        auto_applied: resolved.deliveryWaiverApplication.autoApplied,
                        label: resolved.deliveryWaiverApplication.labelSnapshot
                    }
                    : null
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to compute cart quote'));
        }
    };
};

export const buildRequestStoreGuestCheckoutOtpUseCase = ({ emailOtpService }) => {
    return async ({ tenantId, payload }) => {
        try {
            const normalizedTenantId = ensureTenantContext(tenantId);
            const email = String(payload?.email || '').trim().toLowerCase();
            const idempotencyKey = String(payload?.idempotency_key || '').trim();
            const delivery = await emailOtpService.requestEmailOtp({
                purpose: emailOtpService.EMAIL_OTP_PURPOSES.STOREFRONT_GUEST_CHECKOUT,
                email,
                tenantId: normalizedTenantId,
                metadata: { checkout_idempotency_key: idempotencyKey }
            });
            const deliveryStatus = String(delivery?.delivery_status || '').trim().toLowerCase();
            if (deliveryStatus !== 'sent') {
                throw new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    'Email verification code could not be delivered. Please try again later.',
                    { details: { delivery_status: deliveryStatus } }
                );
            }
            return ok({ email, idempotency_key: idempotencyKey, delivery_status: deliveryStatus });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to send guest checkout verification code'));
        }
    };
};

export const buildVerifyStoreGuestCheckoutOtpUseCase = ({ emailOtpService }) => {
    return async ({ tenantId, payload }) => {
        try {
            const normalizedTenantId = ensureTenantContext(tenantId);
            const email = String(payload?.email || '').trim().toLowerCase();
            const idempotencyKey = String(payload?.idempotency_key || '').trim();
            await emailOtpService.verifyEmailOtp({
                purpose: emailOtpService.EMAIL_OTP_PURPOSES.STOREFRONT_GUEST_CHECKOUT,
                email,
                code: payload?.code,
                tenantId: normalizedTenantId
            });
            return ok({
                email,
                idempotency_key: idempotencyKey,
                guest_checkout_proof: generateStoreGuestCheckoutProof({
                    tenantId: normalizedTenantId,
                    email,
                    idempotencyKey
                }),
                expires_in: getStoreTokenConfig().guestCheckoutProofExpiresIn
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to verify guest checkout code'));
        }
    };
};

export const buildStoreCheckoutUseCase = ({
    storeRepository,
    revenueSharingEnabled = tenantRevenueSharingEnabled,
    // Phase 140 (#821): see the resolveCheckoutContext-level comment. No default -- store/index.js
    // wires the real repository; every existing test that omits this gets `undefined`.
    downpaymentSettingsRepository,
    inventoryReservationService = null,
    // Phase 236 (#1328): see the resolveCheckoutContext-level comment. Has its own default there,
    // so omitting this here (every pre-existing caller/test) still exercises the real singleton.
    roadDistanceProvider
}) => {
    // Phase 141 (#822): capturedPayment is a server-internal sibling argument, never a payload
    // field -- passed ONLY by finalizePaidCommerceSession.js after the webhook has confirmed real
    // money was captured. storeHandlers.js (the direct HTTP path) never passes it, so it is
    // unreachable from any client request, which is what keeps this guard server-authoritative.
    // Phase 237 (#1329): pinnedDeliveryBreakdown is the same shape of sibling argument -- see
    // resolveCheckoutContext's own doc comment on the param.
    return async ({ tenantId, payload, storeCustomer = null, allowExpiredGuestCheckoutProof = false, capturedPayment = null, pinnedDeliveryBreakdown = null }) => {
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
                validateRecipeAvailability: !existing,
                tenantId: normalizedTenantId,
                revenueSharingEnabled,
                downpaymentSettingsRepository,
                roadDistanceProvider,
                pinnedDeliveryBreakdown
            });
            const { normalized } = resolved;

            const requestHash = hashPayload({
                location_id: normalized.location_id,
                order_method: normalized.order_method,
                payment_type: normalized.payment_type,
                payment_timing: normalized.payment_timing,
                promo_code: normalized.promo_code,
                voucher_code: normalized.voucher_code,
                // #1331 (Phase 240 plan §13.6): omitting this would let two carts differing only in
                // their delivery voucher share one idempotency key -- the second request would
                // silently return the first order.
                delivery_voucher_code: normalized.delivery_voucher_code,
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

            if (ONLINE_PAYMENT_TYPES.has(normalized.payment_type) && payload.payment_webhook_confirmed !== true) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Online checkout must be finalized by the payment webhook.',
                    { statusCode: 422 }
                );
            }

            // Phase 141 (#822, ADR 0070 clause 7 [binding]): this order-placing path is reached
            // two ways -- the webhook finalizer (finalizePaidCommerceSession.js, AFTER real money
            // was captured, which passes capturedPayment) and the direct HTTP handler
            // (storeHandlers.js, which never does -- the customer picking plain "cash" with no
            // downpayment paid at all). capturedPayment present -> proceed, the downpayment leg is
            // wired and done. Absent -> this flow collects nothing, so it must not honor the
            // downpayment config; fail closed. Kept CONDITIONAL, not deleted -- deleting it outright
            // is the failure mode this guard exists to prevent (an order claiming "downpayment
            // required" that collected nothing).
            if (resolved.downpayment.payment_mode === 'downpayment_required' && !capturedPayment) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'This store requires a downpayment. Pay the downpayment online to place this order -- the remaining balance is due on delivery.',
                    { statusCode: 422, details: { reason_code: 'DOWNPAYMENT_CAPTURE_NOT_AVAILABLE' } }
                );
            }

            // #626 (Phase 203): hiding the cash option in the UI alone is not enforcement -- a
            // hand-crafted POST with payment_type: 'cash' must also be rejected server-side. Same
            // placement and same `!== false` fail-open comparison as assertGuestCheckoutAllowed
            // below. Reached by both the direct handler and the webhook finalizer, same as that
            // guard (see the Phase 141 comment above).
            if (normalized.payment_type === 'cash' && resolved.accessPolicy?.cash_payment_enabled === false) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'This store does not accept cash on delivery/pickup. Please choose an online payment method.',
                    { statusCode: 422, details: { reason_code: 'STORE_CASH_DISABLED' } }
                );
            }

            assertGuestCheckoutAllowed({
                guestCheckoutEnabled: resolved.accessPolicy?.guest_checkout_enabled,
                storeCustomer: normalizedStoreCustomer
            });

            assertGuestCheckoutProof({
                tenantId: normalizedTenantId,
                email: normalized.customer_email,
                idempotencyKey,
                proof: payload.guest_checkout_proof,
                storeCustomer: normalizedStoreCustomer,
                // Phase 141 (#822): a downpayment capture forces normalized.payment_type to
                // 'cash' (COD for the balance -- see finalizePaidCommerceSession.js), so
                // ONLINE_PAYMENT_TYPES.has(normalized.payment_type) alone no longer identifies a
                // webhook-confirmed online payment for this case. capturedPayment is truthy on
                // exactly the same calls that used to satisfy that check for a downpayment order
                // (it's set by the very same finalizer, from the very same webhook), so it takes
                // over that half of the condition without weakening it for the non-downpayment case.
                allowExpired: allowExpiredGuestCheckoutProof === true
                    && (ONLINE_PAYMENT_TYPES.has(normalized.payment_type) || Boolean(capturedPayment))
                    && payload.payment_webhook_confirmed === true
                    && Boolean(String(payload.payment_session_reference || '').trim())
            });

            const trackingPin = await generateUniqueTrackingPin(storeRepository, {
                transaction,
                lock: true
            });
            const invoiceNumber = await storeRepository.nextInvoiceNumber(INVOICE_COUNTER_KEY, { transaction });
            const paymentSnapshot = resolveStorefrontPaymentSnapshot({
                paymentType: normalized.payment_type,
                payload,
                capturedPayment
            });

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
                    payment_timing: normalized.payment_timing,
                    ...paymentSnapshot,
                    fulfillment_status: 'placed',
                    subtotal_amount: resolved.prepared.subtotalAmount,
                    vatable_sales: resolved.prepared.vatableSales,
                    vat_amount: resolved.prepared.vatAmount,
                    vat_exempt_sales: resolved.prepared.vatExemptSales,
                    zero_rated_sales: resolved.prepared.zeroRatedSales,
                    // #667 Phase 110: the header's discount fields must reflect whichever source
                    // actually applied -- promo and voucher can never BOTH be applied on the same
                    // order (the slot guard above throws before voucherApplication is even resolved
                    // when a promo already applied), so this is a clean either/or, never a sum.
                    // ADR 0033's 2026-08-17 amendment / ADR 0066 Decision 10: a voucher redemption
                    // must persist the same fiscal audit trail a promo already does.
                    discount_amount: resolved.voucherApplication.applied
                        ? resolved.voucherApplication.discountAmount
                        : resolved.promoApplication.discountAmount,
                    discount_label_snapshot: resolved.voucherApplication.applied
                        ? resolved.voucherApplication.discountLabel
                        : resolved.promoApplication.discountLabel,
                    discount_rate_snapshot: resolved.voucherApplication.applied
                        ? resolved.voucherApplication.discountRate
                        : resolved.promoApplication.discountRate,
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
                    // Phase 236 (#1328, epic #1321): observation-only capture, never fed into
                    // delivery_fee/total_amount above.
                    delivery_distance_meters: resolved.deliveryDistanceMeters,
                    delivery_distance_source: resolved.deliveryDistanceSource,
                    // Phase 237 (#1329, epic #1321): money-provenance columns, additive siblings to
                    // delivery_fee above. `delivery_fee_base - delivery_fee_waiver === delivery_fee`
                    // reconciles whenever delivery_fee_override is null (§9.1's three-entry-point
                    // consistency test asserts this). fallbackApplied/outOfRange are deliberately NOT
                    // persisted -- fully derivable from these five columns plus
                    // delivery_distance_source, see the Phase 237 ADR 0012 amendment.
                    delivery_fee_mode: resolved.delivery.mode,
                    delivery_fee_base: resolved.delivery.baseFee,
                    delivery_fee_waiver: resolved.delivery.waiverAmount,
                    delivery_fee_override: resolved.delivery.overrideAmount,
                    delivery_fee_calc_version: resolved.delivery.calcVersion,
                    // #1331 (Phase 240, epic #1321): the two genuinely-new provenance columns --
                    // which voucher waived the fee, and what it was called at the time. Header
                    // fields, deliberately NOT on the `discount` argument below -- see
                    // buildVoucherDiscountRecord's own field-disjoint contract and ADR 0066 Decision
                    // 8's 2026-09-02 amendment (Mechanism A: a separate write path).
                    delivery_fee_waiver_voucher_id: resolved.deliveryWaiverApplication.voucherId,
                    delivery_fee_waiver_label_snapshot: resolved.deliveryWaiverApplication.labelSnapshot,
                    accepted_by: null,
                    accepted_at: null
                },
                lines: resolved.prepared.preparedLines,
                // #667 Phase 110: exactly one of these can be non-null -- the slot guard above
                // already rejects a request that would have both applied. `buildVoucherDiscountRecord`
                // handles the centavos->peso conversion and the benefit-class -> discount_method
                // mapping; kept as a helper so this call site stays a plain either/or.
                discount: resolved.promoApplication.applied
                    ? {
                        promo_code: resolved.promoApplication.enteredPromoCode,
                        discount_rate: resolved.promoApplication.discountRate,
                        discount_amount: resolved.promoApplication.discountAmount,
                        lines: resolved.promoApplication.lineAllocations
                    }
                    : (resolved.voucherApplication.applied
                        ? buildVoucherDiscountRecord(resolved.voucherApplication)
                        : null)
            }, { transaction });

            // Phase 141 (#822, ADR 0069 clause 4b [default], carried forward by ADR 0070): ledger
            // row 1 for a webhook-finalized downpayment order, written inside the SAME transaction
            // that just created the order -- there is no window where one exists without the other.
            // idempotency_key is the commerce payment session's own public_reference, which is
            // stable across a webhook retry, so a replay hits pos_order_payments' own
            // (pos_transaction_id, idempotency_key) unique index rather than double-inserting; the
            // order-level idempotency_key dedup above already short-circuits the whole use case
            // before reaching this point on replay, so this is a backstop, not the primary guard.
            if (capturedPayment) {
                await storeRepository.createOrderPaymentEntry({
                    posTransactionId: orderId,
                    kind: 'downpayment',
                    status: 'successful',
                    amount: centavosToPeso(capturedPayment.captured_centavos),
                    paymentMethod: capturedPayment.method,
                    paymentProvider: 'paymongo',
                    providerEventId: capturedPayment.provider_event_id || null,
                    paymentReference: capturedPayment.provider_payment_id || null,
                    idempotencyKey: capturedPayment.session_reference,
                    recordedBy: null
                }, { transaction });
            }

            if (inventoryReservationService?.reserveOnlineOrderInventory) {
                // Rebuild immutable effect references after the transaction identity exists so
                // reservation evidence points to the exact online order, not the quote-time
                // PENDING placeholder used by read-only checkout resolution.
                const reservationEffects = buildOnlineInventoryEffects({
                    lines: resolved.prepared.preparedLines,
                    recipePlan: resolved.recipePlan,
                    locationId: normalized.location_id,
                    orderId,
                    invoiceNumber,
                    trackingPin,
                    strict: true
                });
                await inventoryReservationService.reserveOnlineOrderInventory({
                    sourceId: orderId,
                    locationId: normalized.location_id,
                    effects: reservationEffects,
                    transaction
                });
            }

            if (resolved.promoApplication.applied && typeof storeRepository.updateSettingByKey === 'function') {
                const promoUsageUpdate = buildCommercialPromoUsageUpdate({
                    settings: resolved.settings,
                    promoApplication: resolved.promoApplication
                });
                if (promoUsageUpdate) {
                    await storeRepository.updateSettingByKey(
                        promoUsageUpdate.key,
                        promoUsageUpdate.value,
                        { transaction, lock: true }
                    );
                }
            }

            // Voucher redemption's sibling to the promo usage-update block above -- deliberately
            // NOT a blind-JSON-overwrite via updateSettingByKey (that pattern is exactly what ADR
            // 0066 decision 4 retires). Unlike promo, the voucher reservation + ledger insert
            // already happened above, inside resolveCheckoutContext's own call to
            // redeemVoucherUseCase (it needed to run there because totalAmount, computed in that
            // same function, has to reflect the ACTUAL reserved discount rather than a preview
            // number). Nothing further to do here; this comment exists so a reader following the
            // promo pattern down to this exact spot isn't left wondering where the voucher half is.

            if (resolved.voucherApplication.applied && !resolved.voucherApplication.redemptionId && !resolved.voucherApplication.idempotentReplay) {
                // Defensive only: redeemVoucherUseCase either returns a redemptionId or throws --
                // this should be unreachable, but a checkout must never silently claim a voucher
                // discount with no ledger row behind it.
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Voucher redemption could not be recorded for this order.',
                    { statusCode: 409, details: { reason_code: 'VOUCHER_REDEMPTION_UNRECORDED' } }
                );
            }
            // #667 Phase 110: a FRESH (non-replay), positively-discounted redemption must have at
            // least one line that actually carried the discount -- `lineAllocations` is now the
            // UNFILTERED per-input-line array (see voucherRedemptionUseCases.js), so a bare
            // length check would be vacuous (it always equals the cart's own line count). This
            // checks the thing that actually matters: the fiscal audit row just written above
            // claims a non-zero discount_amount, so at least one PosTransactionDiscountLine row
            // must carry a non-zero amount behind it. A replay is exempt for the same reason the
            // redemptionId check above is: its allocations are deliberately withheld when the
            // recomputed benefit disagrees with the ledger's own recorded amount.
            if (
                resolved.voucherApplication.applied
                && !resolved.voucherApplication.idempotentReplay
                && resolved.voucherApplication.discountAmount > 0
                && !resolved.voucherApplication.lineAllocations.some((line) => line.discountCentavos > 0)
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Voucher redemption produced no discounted line allocations for this order.',
                    { statusCode: 409, details: { reason_code: 'VOUCHER_REDEMPTION_UNRECORDED' } }
                );
            }

            // #1331 (Phase 240 plan §5.3): the delivery waiver's sibling to the redemptionId guard
            // above. Deliberately WITHOUT that guard's line-allocation half -- a delivery-targeted
            // benefit has no per-line component BY CONSTRUCTION (voucherBenefitPolicy.js's own
            // Direction A), so an all-zero lineAllocations here is correct, not a defect (Phase 240
            // plan §3.3/§13.2 -- routing this through the item guard would misfire on every single
            // delivery voucher redemption).
            if (
                resolved.deliveryWaiverApplication.applied
                && !resolved.deliveryWaiverApplication.redemptionId
                && !resolved.deliveryWaiverApplication.idempotentReplay
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Delivery voucher redemption could not be recorded for this order.',
                    { statusCode: 409, details: { reason_code: 'VOUCHER_REDEMPTION_UNRECORDED' } }
                );
            }

            // #1390: close the ledger<->order link. voucher_redemptions.pos_transaction_id has
            // existed (and been indexed) since #455 but was written by nothing -- the redemption
            // necessarily happens above, inside resolveCheckoutContext, before this transaction had
            // an orderId. Attaching it here, in the same transaction, is what lets
            // buildCancelStoreOrderUseCase find what to reverse on cancel without reconstructing a
            // composite idempotency key from string parts. Both redemption ids are already in
            // memory (including on an idempotent-replay branch -- voucherRedemptionUseCases.js
            // returns the existing row's id on replay too), so this is a single indexed UPDATE, no
            // lookup.
            const redemptionIdsToAttach = [
                resolved.voucherApplication.redemptionId,
                resolved.deliveryWaiverApplication.redemptionId
            ].filter((id) => parsePositiveInt(id));
            if (redemptionIdsToAttach.length > 0) {
                await voucherRepository.attachRedemptionsToTransaction(
                    redemptionIdsToAttach,
                    orderId,
                    { transaction }
                );
            }

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

            // Best-effort, post-commit: was dormant until a storefront visit set the attribution
            // cookie, now live via the Phase 1 affiliate pricing rule engine (see
            // docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). Writes a `pending`
            // commission - unlike the in-store sale, which is earned immediately - because the
            // online order's real outcome (completed vs cancelled/rejected) isn't known until the
            // fulfillment lifecycle hook settles it later. Must never fail the checkout that already
            // succeeded, mirroring recordDgfyOrderActivity's convention above.
            if (payload?.attribution_enrollment_id) {
                try {
                    // #450 decision D2 (Phase 206): re-verify the enrollment against the database
                    // at commit time rather than trusting resolveCheckoutContext's pricing-time
                    // object. `resolved.affiliatePricing.enrollment` is a snapshot taken before the
                    // order was written, and a checkout can span real work in between (F&B kitchen
                    // order creation, inventory movements, payment settlement) - if the affiliate
                    // was revoked/suspended, or the tenant's program disabled, inside that window,
                    // the cached object is stale. The previous `||` fallback only fired when that
                    // object was *missing*, never when it was *stale*, which is exactly the case
                    // D2 names. This is a plain, non-locking read on the default connection: the
                    // order's own transaction has already committed above, so it necessarily sees
                    // current committed state - no lock and no transaction handle are needed or
                    // wanted here (accrual is already idempotent on (tenant_id, order_reference)).
                    //
                    // affiliatePricing is still the source of the commission *math* (rule, rate,
                    // commission_base_mode) - deliberately unchanged. Only the enrollment used to
                    // decide whether, and to whom, commission accrues is re-resolved.
                    const affiliatePricing = resolved.affiliatePricing;
                    const affiliateEnrollment = await resolveActiveAffiliateEnrollmentById({
                        tenantId: normalizedTenantId,
                        enrollmentId: payload.attribution_enrollment_id
                    });
                    if (affiliateEnrollment) {
                        // baseSubtotalAmount is the catalog-price subtotal, pre-affiliate-rule;
                        // subtotalAmount is what the buyer actually paid. The two are identical
                        // when no selling-price rule is active (e.g. commission-only attribution).
                        const baseSubtotalCentavos = toCentavos(
                            resolved.prepared.baseSubtotalAmount ?? resolved.prepared.subtotalAmount
                        );
                        const buyerSubtotalCentavos = toCentavos(resolved.prepared.subtotalAmount);
                        const discountCentavos = toCentavos(resolved.promoApplication.discountAmount);

                        const commissionBaseMode = affiliatePricing?.commissionBaseMode || 'discounted_subtotal';
                        const commissionType = affiliatePricing?.commissionRule?.type || 'PERCENTAGE_OF_BASE';

                        // Decision A3, gated behind commission_base_mode: 'discounted_subtotal' (the
                        // default) is today's formula, generalized - it subtracts the promo discount
                        // from the buyer-paid subtotal, which is byte-identical to pre-Phase-1
                        // behavior whenever no affiliate price rule is active (buyerSubtotalCentavos
                        // === baseSubtotalCentavos in that case). 'base_price_subtotal' ignores any
                        // discount entirely - the commission is always computed on the catalog
                        // subtotal, per the recording's "affiliate earns the same whether or not a
                        // discount is running" example.
                        const commissionableBaseCentavos = commissionBaseMode === 'base_price_subtotal'
                            ? Math.max(0, baseSubtotalCentavos)
                            : Math.max(0, buyerSubtotalCentavos - discountCentavos);

                        // NONE and RESELLER_MARGIN don't fit the bps-of-base formula
                        // accruePendingForOnlineOrder falls back to internally, so both are resolved
                        // here using the real, already-computed line-level subtotals rather than a
                        // parallel single-item recalculation (which could drift from what the buyer
                        // was actually charged across a multi-line cart). PERCENTAGE_OF_BASE is
                        // resolved here too, using the exact rate already loaded onto
                        // affiliatePricing, so the same rate is guaranteed to be reflected in any
                        // buyer/owner-facing preview and in the accrued commission.
                        let resolvedCommission;
                        let resellerMarginCentavos = null;
                        if (commissionType === 'NONE') {
                            resolvedCommission = { rateBps: 0, amountCentavos: 0 };
                        } else if (commissionType === 'RESELLER_MARGIN') {
                            resellerMarginCentavos = Math.max(0, buyerSubtotalCentavos - baseSubtotalCentavos);
                            resolvedCommission = { rateBps: 0, amountCentavos: resellerMarginCentavos };
                        } else {
                            // #448 (Phase 209). Weights follow commission_base_mode, matching how
                            // commissionableBaseCentavos itself was derived ~20 lines up, so the
                            // split is always consistent with the total it is splitting. The
                            // enrollment-override tier has already been applied upstream (see
                            // resolveAffiliatePricingForCheckout's fallbackRateBps), so this passes
                            // fallbackRateBps rather than a raw enrollment/settings pair - re-deriving
                            // the override here would duplicate the ladder in two places.
                            const commissionLines = resolved.prepared.preparedLines.map((line) => ({
                                folderId: line.folder_id_snapshot ?? null,
                                weightCentavos: Math.max(0, toCentavos(
                                    commissionBaseMode === 'base_price_subtotal'
                                        ? line.base_line_subtotal
                                        : line.line_subtotal
                                ))
                            }));
                            const fallbackRateBps = Number.isInteger(affiliatePricing?.fallbackRateBps)
                                ? affiliatePricing.fallbackRateBps
                                : 500;
                            const computed = computeCategoryAwareCommission({
                                fallbackRateBps,
                                categoryRateRows: affiliatePricing?.categoryRates || [],
                                lines: commissionLines,
                                commissionableBaseCentavos
                            });
                            resolvedCommission = {
                                rateBps: computed.rateBpsSnapshot,
                                amountCentavos: computed.amountCentavos
                            };
                        }

                        await accruePendingForOnlineOrder({
                            tenantId: normalizedTenantId,
                            enrollment: affiliateEnrollment,
                            orderReference: String(orderId),
                            commissionableBaseCentavos,
                            resolvedCommission,
                            snapshot: {
                                baseSubtotalCentavos,
                                buyerSubtotalCentavos,
                                resellerMarginCentavos,
                                priceRuleTypeSnapshot: affiliatePricing?.priceRule?.rule_type || null,
                                settlementPolicySnapshot: affiliatePricing?.settlementPolicy || null
                            },
                            buyerDgfyAccountId: normalizedStoreCustomer?.dgfy_account_id || null,
                            storeSlug: String(payload.store_slug || '').trim().toLowerCase() || null
                        });
                    } else if (affiliatePricing?.enrollment) {
                        // In-flight attribution drop (#450 D2): this order *was* priced under an
                        // active enrollment, and that enrollment is no longer active at commit
                        // time. The order stands and the buyer sees nothing - only the commission
                        // is withheld. Logged (never thrown) so the drop is attributable later;
                        // this is the same non-blocking convention as the catch block below.
                        logger.warn('[StorefrontCheckout] Affiliate attribution dropped: enrollment inactive at commit', {
                            tenant_id: normalizedTenantId,
                            order_id: orderId,
                            enrollment_id: payload.attribution_enrollment_id
                        });
                    }
                } catch (accrualError) {
                    logger.warn('[StorefrontCheckout] Failed to accrue pending affiliate commission', {
                        tenant_id: normalizedTenantId,
                        order_id: orderId,
                        error: accrualError?.message
                    });
                }
            }

            return ok({
                idempotent_replay: false,
                tracking_pin: trackingPin,
                order: serializeOrderForCustomer(created),
                totals: {
                    subtotal_amount: resolved.prepared.subtotalAmount,
                    discount_amount: resolved.promoApplication.discountAmount,
                    discount_label: resolved.promoApplication.discountLabel,
                    discount_rate: resolved.promoApplication.discountRate,
                    voucher_discount_amount: resolved.voucherApplication.discountAmount,
                    service_fee_amount: resolved.serviceFeeAmount,
                    service_fee_label: resolved.serviceFeeLabel,
                    delivery_fee: resolved.deliveryFee,
                    total_amount: resolved.totalAmount,
                    // Phase 140 (#821, ADR 0069/0070). See the matching comment on the quote
                    // response above -- same shape, same null-vs-full_payment convention. In
                    // practice payment_mode here is always 'full_payment' today: the guard below
                    // rejects a downpayment_required order before this point is reached (Phase 141
                    // wires capture and removes that guard, at which point this becomes live).
                    payment_mode: resolved.downpayment.payment_mode,
                    downpayment_amount: resolved.downpayment.downpayment_amount,
                    balance_due_amount: resolved.downpayment.balance_due_amount,
                    downpayment_refundable: resolved.downpayment.downpayment_refundable
                },
                promo_feedback: resolved.promoApplication.applied
                    ? {
                        applied: true,
                        promo_code: resolved.promoApplication.enteredPromoCode,
                        message: resolved.promoApplication.message
                    }
                    : null,
                voucher_feedback: resolved.voucherApplication.applied
                    ? {
                        applied: true,
                        voucher_code: normalized.voucher_code,
                        redemption_id: resolved.voucherApplication.redemptionId
                    }
                    : null,
                // #1331 (Phase 240): sibling of voucher_feedback above, for the delivery-fee axis.
                // #1332 (Phase 244): sourced from `deliveryWaiverApplication`'s own resolved code,
                // not `normalized.delivery_voucher_code` -- see the cart-quote response's identical
                // fix above for why. `auto_applied`/`label` are additive.
                delivery_voucher_feedback: resolved.deliveryWaiverApplication.applied
                    ? {
                        applied: true,
                        voucher_code: resolved.deliveryWaiverApplication.enteredDeliveryVoucherCode,
                        redemption_id: resolved.deliveryWaiverApplication.redemptionId,
                        auto_applied: resolved.deliveryWaiverApplication.autoApplied,
                        label: resolved.deliveryWaiverApplication.labelSnapshot
                    }
                    : null,
                account_action: accountAction,
                cancel_proof: cancelProof,
                cancel_proof_expires_in: cancelProof ? getStoreTokenConfig().cancelProofExpiresIn : null
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            logger.error('[StorefrontCheckout] Failed to complete storefront checkout', {
                tenant_id: normalizedTenantId,
                error_name: error?.name || 'Error',
                error_message: error?.message || 'Unknown error',
                error_code: error?.code || null,
                error_details: error?.details || null,
                stack: error?.stack || null
            });
            console.error('[StorefrontCheckoutDebug]', {
                tenant_id: normalizedTenantId,
                error_name: error?.name || 'Error',
                error_message: error?.message || 'Unknown error',
                sql_message: error?.original?.sqlMessage || error?.parent?.sqlMessage || null,
                sql: error?.sql || error?.original?.sql || error?.parent?.sql || null,
                error_code: error?.original?.code || error?.parent?.code || error?.code || null,
                stack: error?.stack || null
            });
            return fail(mapStoreUseCaseError(error, 'Failed to complete storefront checkout'));
        }
    };
};

const parseObjectValue = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const getPaymentSessionType = (session = {}) => {
    const type = String(parseObjectValue(session.checkout_payload).payment_type || '').trim().toLowerCase();
    return ONLINE_PAYMENT_TYPES.has(type) ? type : 'qrph';
};

const appendPaymentSessionQuery = (baseUrl, params = {}) => {
    const raw = String(baseUrl || '').trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
        });
        return url.toString();
    } catch {
        return raw;
    }
};

export const resolveStorefrontPaymentReturnUrl = ({
    configuredReturnUrl = null,
    storeSlug = '',
    trustedReturnUrl = null
} = {}) => {
    const raw = String(trustedReturnUrl || configuredReturnUrl || '').trim();
    const normalizedStoreSlug = String(storeSlug || '').trim().toLowerCase();
    if (!raw || !normalizedStoreSlug) return null;

    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;

        url.pathname = trustedReturnUrl
            ? '/order'
            : `/tenant-store/${encodeURIComponent(normalizedStoreSlug)}/order`;
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
};

export const buildStorefrontPaymentCallbackUrl = ({
    paymentMethod,
    paymentSession,
    paymentStatus,
    returnUrl
} = {}) => appendPaymentSessionQuery(returnUrl, {
    payment_session: paymentSession,
    payment_status: paymentStatus,
    payment_method: paymentMethod
});

const getDirectWalletSessionDetails = (session = {}) => {
    const providerPayload = parseObjectValue(session.provider_payload);
    const paymentIntent = providerPayload.paymentIntent || providerPayload.payment_intent || {};
    const paymentIntentAttributes = paymentIntent.attributes || {};
    const paymentFlow = providerPayload.paymentFlow || providerPayload.payment_flow || null;
    const isDirectWallet = paymentFlow === 'direct_gcash'
        || paymentFlow === 'direct_maya'
        || paymentFlow === 'direct_card';

    return {
        payment_flow: isDirectWallet ? paymentFlow : (session.checkout_url ? 'hosted' : null),
        paymongo_public_key: isDirectWallet
            ? (providerPayload.publicKey || providerPayload.public_key || null)
            : null,
        paymongo_client_key: isDirectWallet
            ? (paymentIntentAttributes.client_key || paymentIntent.client_key || null)
            : null,
        paymongo_return_url: isDirectWallet
            ? (providerPayload.returnUrl || providerPayload.return_url || null)
            : null
    };
};

// Phase 142 (#823): capture_kind/order_total_amount/balance_due_amount/downpayment_refundable
// were persisted on the session row since Phase 141 (#822) but never reached the client -- the
// pending-payment panel and the confirmation screen have no way to say "this is your downpayment
// of X, Y is due on delivery" without them. Present-and-null for a 'full' capture, same
// convention as the quote response's own downpayment fields (never 0, never the total, so a
// frontend can't mistake "no downpayment" for "downpayment of zero").
const serializeDownpaymentSessionFields = (session = {}) => {
    const captureKind = session.capture_kind || 'full';
    if (captureKind !== 'downpayment') {
        return {
            capture_kind: captureKind,
            order_total_amount: null,
            balance_due_amount: null,
            downpayment_refundable: null
        };
    }
    const orderTotalCentavos = session.order_total_centavos;
    const capturedCentavos = session.total_amount_centavos;
    const balanceDueAmount = (orderTotalCentavos != null && capturedCentavos != null)
        ? centavosToPeso(Math.max(0, Number(orderTotalCentavos) - Number(capturedCentavos)))
        : null;
    return {
        capture_kind: captureKind,
        order_total_amount: orderTotalCentavos != null ? centavosToPeso(orderTotalCentavos) : null,
        balance_due_amount: balanceDueAmount,
        downpayment_refundable: session.downpayment_refundable ?? null
    };
};

const serializePaymentSession = (session = {}) => ({
    ...getDirectWalletSessionDetails(session),
    payment_session_id: session.public_reference,
    public_reference: session.public_reference,
    status: session.status,
    provider: session.provider,
    payment_method: getPaymentSessionType(session),
    provider_payment_intent_id: session.provider_payment_intent_id || null,
    qr_code_image_url: session.qr_code_image_url || null,
    checkout_url: session.checkout_url || null,
    expires_at: session.expires_at || null,
    subtotal_amount: session.subtotal_amount,
    delivery_fee: session.delivery_fee,
    service_fee_amount: session.service_fee_amount,
    service_fee_label: getDgfyConvenienceFeeLabel(),
    total_amount: session.total_amount,
    currency: session.currency || 'PHP',
    platform_fee_centavos: session.platform_fee_centavos,
    fee_policy: session.fee_policy || null,
    tenant_transfer_merchant_id: session.tenant_transfer_merchant_id || null,
    tracking_pin: session.tracking_pin || null,
    pos_transaction_id: session.pos_transaction_id || null,
    failure_code: session.failure_code || null,
    failure_reason: session.failure_reason || null,
    ...serializeDownpaymentSessionFields(session)
});

export const buildStoreCheckoutPaymentSessionUseCase = ({
    storeRepository,
    commercePaymentRepository,
    tenantRevenueRepository,
    paymongoService,
    commercePaymentsEnabled = false,
    commerceQrphEnabled = false,
    commercePaymongoSplitEnabled = false,
    directGcashEnabled = false,
    directGcashRequested = false,
    directMayaEnabled = false,
    directMayaRequested = false,
    directCardEnabled = false,
    directCardRequested = false,
    directPaymentRequired = false,
    requireCommerceQrphConfig = () => [],
    requireCommercePaymentConfig = requireCommerceQrphConfig,
    // Phase 140 (#821): see the resolveCheckoutContext-level comment. No default -- store/index.js
    // wires the real repository; every existing test that omits this gets `undefined`.
    downpaymentSettingsRepository,
    // Phase 237 (#1329): same injection Phase 236 already gave buildStoreCartQuoteUseCase and
    // buildStoreCheckoutUseCase, extended here so the out-of-range hard block (ADR 0078 Decision 2
    // [binding]) is testable at this entry point too, without depending on the real GraphHopper
    // singleton. Has its own default in resolveCheckoutContext, so omitting this (every pre-Phase-237
    // caller) still exercises the real singleton, unchanged.
    roadDistanceProvider
}) => {
    return async ({ payload, storeCustomer = null, trustedReturnUrl = null }) => {
        try {
            const requestedPaymentType = String(payload?.payment_type || 'qrph').trim().toLowerCase();
            if (!ONLINE_PAYMENT_TYPES.has(requestedPaymentType)) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only QR Ph, card, GCash, Maya, GrabPay, or ShopeePay can create an online payment session.',
                    { statusCode: 422 }
                );
            }
            if (!commercePaymentsEnabled || (requestedPaymentType === 'qrph' && !commerceQrphEnabled)) {
                throw new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    'The requested online payment method is not enabled for this storefront.',
                    { statusCode: 503 }
                );
            }

            if (!isPlainObject(payload)) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'payload must be an object', { statusCode: 400 });
            }

            const directGcashConfigRequired = requestedPaymentType === 'gcash' && directGcashRequested;
            const directMayaConfigRequired = requestedPaymentType === 'maya' && directMayaRequested;
            const directCardConfigRequired = requestedPaymentType === 'card' && directCardRequested;
            const directMethodUnavailable = directPaymentRequired && (
                (requestedPaymentType === 'gcash' && !directGcashEnabled)
                || (requestedPaymentType === 'maya' && !directMayaEnabled)
                || (requestedPaymentType === 'card' && !directCardEnabled)
            );
            if (directMethodUnavailable) {
                throw new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    'The selected online payment method is not configured for direct PayMongo authorization.',
                    // #1022: aligned with resolveStorefrontPaymentCapabilities's own
                    // 'DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE' reason_code (added for #926, same
                    // direct-payment-required family) instead of the stale, inconsistent
                    // 'DIRECT_PAYMENT_NOT_READY'; payment_type was previously missing from details
                    // entirely.
                    { statusCode: 503, details: { code: 'DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE', payment_type: requestedPaymentType } }
                );
            }
            const missingConfig = requestedPaymentType === 'qrph'
                ? requireCommerceQrphConfig()
                : requireCommercePaymentConfig({
                    requiresDirectGcash: directGcashConfigRequired,
                    requiresDirectMaya: directMayaConfigRequired,
                    requiresDirectCard: directCardConfigRequired
                });
            if (missingConfig.length > 0) {
                throw new DomainError(
                    DomainErrorCode.SERVICE_UNAVAILABLE,
                    `Online payments are missing server configuration: ${missingConfig.join(', ')}`,
                    { statusCode: 503 }
                );
            }

            const tenantContext = dbStore.getStore() || {};
            const tenantId = normalizeTenantIdentifier(tenantContext.tenantId);
            const storeSlug = String(payload.store_slug || tenantContext.tenantToken || '').trim().toLowerCase();
            if (!tenantId || tenantId === 'default') {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant context is required for online checkout', { statusCode: 403 });
            }

            const idempotencyKey = String(payload.idempotency_key || '').trim();
            if (idempotencyKey.length < 8) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required', { statusCode: 422 });
            }

            const account = tenantRevenueSharingEnabled || requestedPaymentType !== 'qrph'
                ? null
                : await commercePaymentRepository.findTenantPaymentAccount({ tenantId, provider: 'paymongo' });
            const revenuePolicy = tenantRevenueSharingEnabled
                ? await tenantRevenueRepository?.findEffectiveFeePolicy?.(tenantId, new Date())
                : null;
            if (tenantRevenueSharingEnabled && (
                !revenuePolicy
                || revenuePolicy.settlement_status !== 'active'
                || !revenuePolicy.payout_destination_masked
            )) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This storefront does not have an active tenant revenue and payout policy.',
                    {
                        statusCode: 409,
                        details: {
                            code: 'TENANT_REVENUE_POLICY_NOT_READY',
                            policy_status: revenuePolicy?.settlement_status || 'missing',
                            payout_destination_configured: Boolean(revenuePolicy?.payout_destination_masked)
                        }
                    }
                );
            }
            if (requestedPaymentType !== 'qrph' && !tenantRevenueSharingEnabled) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Card, GCash, Maya, GrabPay, and ShopeePay checkout requires the tenant revenue collection policy to be enabled.',
                    {
                        statusCode: 409,
                        details: { code: 'TENANT_REVENUE_POLICY_NOT_READY' }
                    }
                );
            }
            if (requestedPaymentType === 'qrph' && !tenantRevenueSharingEnabled && (!account || account.onboarding_status !== 'active' || !account.qrph_enabled || !account.split_enabled || !account.charges_enabled)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This storefront is not ready for PayMongo QR Ph split payments.',
                    {
                        statusCode: 409,
                        details: {
                            code: 'PAYMONGO_ACCOUNT_NOT_READY',
                            onboarding_status: account?.onboarding_status || 'missing',
                            wallet_status: account?.wallet_status || 'unknown',
                            qrph_enabled: Boolean(account?.qrph_enabled),
                            split_enabled: Boolean(account?.split_enabled),
                            charges_enabled: Boolean(account?.charges_enabled)
                        }
                    }
                );
            }
            if (requestedPaymentType === 'qrph' && !tenantRevenueSharingEnabled && (account.wallet_status !== 'enabled' || !account.wallet_verified_at)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This storefront does not have verified PayMongo enabled-wallet evidence.',
                    {
                        statusCode: 409,
                        details: {
                            code: 'PAYMONGO_WALLET_NOT_READY',
                            wallet_status: account.wallet_status || 'unknown',
                            wallet_verified_at: account.wallet_verified_at || null
                        }
                    }
                );
            }

            const normalizedPayload = {
                ...payload,
                payment_type: requestedPaymentType,
                _verified_store_customer: snapshotVerifiedStoreCustomer(storeCustomer)
            };
            const requestHash = crypto.createHash('sha256').update(stableStringify(normalizedPayload)).digest('hex');
            const existing = await commercePaymentRepository.findSessionByIdempotency({
                tenantId,
                targetType: 'store_checkout',
                idempotencyKey
            });
            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw new DomainError(DomainErrorCode.CONFLICT, 'idempotency_key already used for a different checkout payload', { statusCode: 409 });
                }
                return ok({ idempotent_replay: true, payment_session: serializePaymentSession(existing) });
            }

            const resolved = await resolveCheckoutContext({
                storeRepository,
                payload: normalizedPayload,
                storeCustomer,
                downpaymentSettingsRepository,
                roadDistanceProvider
            });

            // Phase 141 (#822, ADR 0069 clause 1b [binding] / ADR 0070 clause 7 [binding]): fail
            // closed if the tenant's stored payment_mode says downpayment_required but the settings
            // row itself is malformed (no downpayment_type, missing rate, etc.). resolveCheckoutContext
            // resolves that case to the same full_payment null-shape as a genuine full_payment tenant
            // -- downpaymentPolicy.js's own fail-closed design, correct in Phase 140's "nothing can
            // capture yet" world. Under this phase's COD-with-downpayment model that direction is
            // backwards: falling through to full_payment here would authorize the FULL order online
            // with no downpayment gate at all -- the exact bogus-order case the feature exists to
            // prevent. So this seam compares the raw stored setting against the resolved result
            // instead of trusting the resolved shape alone.
            // `resolved.totalAmount > 0` excludes the OTHER case resolveDownpaymentForTotal falls
            // back to full_payment for: a legitimate zero-total order (e.g. a 100%-off voucher on a
            // downpayment_required tenant) -- that's "nothing to capture," not a malformed settings
            // row, and it already 422s a few lines below on its own, more accurate reason
            // (`totalAmountCentavos <= 0`). Reviewer finding RF-2, PR #840.
            //
            // Phase 150 (#866): extended to 'customer_choice' + an actual 'downpayment' election.
            // A 'customer_choice' store with election='full' is NOT malformed -- resolved.downpayment
            // correctly reports 'full_payment' by design (requiresSplit is false), so that case must
            // never trip this guard. Only "customer asked for a split, and the row couldn't produce
            // one" is the malformed case this guard exists to catch.
            const requestedDownpaymentElection = String(normalizedPayload.payment_election || '').trim().toLowerCase() === 'downpayment';
            if (
                (
                    resolved.downpaymentSettings?.payment_mode === 'downpayment_required'
                    || (resolved.downpaymentSettings?.payment_mode === 'customer_choice' && requestedDownpaymentElection)
                )
                && resolved.downpayment.payment_mode !== 'downpayment_required'
                && resolved.totalAmount > 0
            ) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'This store requires a downpayment, but its downpayment configuration could not be resolved.',
                    { statusCode: 422, details: { reason_code: 'DOWNPAYMENT_POLICY_UNRESOLVED' } }
                );
            }

            assertGuestCheckoutAllowed({
                guestCheckoutEnabled: resolved.accessPolicy?.guest_checkout_enabled,
                storeCustomer
            });

            assertGuestCheckoutProof({
                tenantId,
                email: resolved.normalized.customer_email,
                idempotencyKey,
                proof: normalizedPayload.guest_checkout_proof,
                storeCustomer
            });

            // Phase 141 (#822, ADR 0069 clause 1b [binding]): capture the downpayment amount, not
            // the order total, for a downpayment_required tenant. orderTotalCentavos keeps the full
            // order's value (the session's own order_total_centavos column; the balance is the
            // difference, collected in person per ADR 0069 clause 2 [binding]). totalAmountCentavos
            // becomes the CAPTURED amount -- everything downstream of this point already keys off
            // it (platform_fee_centavos, the PayMongo amount, the webhook's exact-amount-equality
            // check, and the reject-refund path), so this one substitution is what makes all four
            // fall out correctly with no further code change (see the Phase 141 plan).
            const isDownpaymentCapture = resolved.downpayment.payment_mode === 'downpayment_required';
            const orderTotalCentavos = toCentavos(resolved.totalAmount);
            const capturedAmountPeso = isDownpaymentCapture ? resolved.downpayment.downpayment_amount : resolved.totalAmount;
            const totalAmountCentavos = isDownpaymentCapture
                ? toCentavos(resolved.downpayment.downpayment_amount)
                : orderTotalCentavos;
            const platformFeeCentavos = tenantRevenueSharingEnabled
                ? Math.round((totalAmountCentavos * Number(revenuePolicy.dgfy_rate_bps || 0)) / 10000)
                : toCentavos(resolved.serviceFeeAmount);
            if (
                totalAmountCentavos <= 0
                || platformFeeCentavos < 0
                || platformFeeCentavos >= totalAmountCentavos
                || (!tenantRevenueSharingEnabled && platformFeeCentavos <= 0)
            ) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    isDownpaymentCapture
                        ? 'This downpayment amount is too low to cover the platform fee.'
                        : (tenantRevenueSharingEnabled
                            ? 'Online checkout amount is invalid for tenant revenue settlement.'
                            : 'Online checkout amount is too low for fixed DGFY split settlement.'),
                    { statusCode: 422 }
                );
            }

            const publicReference = `CPS-${randomAlphaNumeric(10)}`;
            if (requestedPaymentType === 'qrph' && !tenantRevenueSharingEnabled && account.provider_merchant_id === process.env.PAYMONGO_DGFY_MERCHANT_ID) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Tenant PayMongo merchant ID must be different from the DGFY platform merchant ID.',
                    {
                        statusCode: 409,
                        details: { code: 'PAYMONGO_SPLIT_RECIPIENT_CONFLICT' }
                    }
                );
            }
            const splitPayload = requestedPaymentType === 'qrph' && !tenantRevenueSharingEnabled && commercePaymongoSplitEnabled ? {
                transfer_to: account.provider_merchant_id,
                recipients: [{
                    merchant_id: process.env.PAYMONGO_DGFY_MERCHANT_ID,
                    split_type: 'fixed',
                    value: platformFeeCentavos
                }]
            } : null;
            const feePolicy = tenantRevenueSharingEnabled
                ? {
                    collection_model: 'dgfy_collects_then_settles_tenant',
                    split_payment_used: false,
                    tenant_revenue_policy_id: revenuePolicy.policy_id,
                    tenant_revenue_policy_version: revenuePolicy.version,
                    dgfy_fee_basis: 'provider_gross',
                    dgfy_fee_rate_bps: revenuePolicy.dgfy_rate_bps,
                    dgfy_fee_charged_to: 'tenant',
                    provider_fee_shoulder: revenuePolicy.provider_fee_payer,
                    provider_fee_customer_passthrough: false,
                    settlement_cycle_days: Number(revenuePolicy.settlement_cycle_days)
                }
                : {
                    dgfy_fee_basis: 'subtotal',
                    dgfy_fee_rate: '0.01',
                    dgfy_fee_charged_to: 'customer',
                    provider_fee_shoulder: 'tenant_company',
                    provider_fee_customer_passthrough: false,
                    refund_policy: 'full_refund_reverses_dgfy_and_tenant_shares',
                    gross_sales_visibility: ['gross_sales', 'net_sales']
                };

            const session = await commercePaymentRepository.createSession({
                public_reference: publicReference,
                tenant_id: tenantId,
                store_slug: storeSlug || 'store',
                provider: 'paymongo',
                target_type: 'store_checkout',
                status: 'created',
                idempotency_key: idempotencyKey,
                request_hash: requestHash,
                checkout_payload: normalizedPayload,
                subtotal_amount: resolved.prepared.subtotalAmount,
                delivery_fee: resolved.deliveryFee,
                // Phase 237 (#1329, epic #1321, Wave 0 decision #2): pins the WHOLE resolved
                // breakdown, not just distance+fee -- a partial pin would let the persisted audit
                // row become internally inconsistent with what the customer actually paid. Read back
                // by finalizePaidCommerceSession.js on webhook finalization (resolved.deliveryFee
                // above is already delivery.finalFee, so "store the same finalFee" holds by
                // construction -- asserted, not assumed, by the three-entry-point consistency test).
                delivery_fee_breakdown: {
                    ...resolved.delivery,
                    pinned_at: new Date().toISOString()
                },
                service_fee_amount: resolved.serviceFeeAmount,
                total_amount: capturedAmountPeso,
                currency: 'PHP',
                total_amount_centavos: totalAmountCentavos,
                platform_fee_centavos: platformFeeCentavos,
                // Phase 141 (#822): total_amount/total_amount_centavos above are the CAPTURED
                // amount (unchanged meaning); order_total_centavos is the full order value so the
                // balance the customer still owes is always recoverable from this row alone.
                capture_kind: isDownpaymentCapture ? 'downpayment' : 'full',
                order_total_centavos: orderTotalCentavos,
                capture_payment_method: requestedPaymentType,
                downpayment_refundable: isDownpaymentCapture ? resolved.downpayment.downpayment_refundable : null,
                fee_policy: feePolicy,
                tenant_transfer_merchant_id: tenantRevenueSharingEnabled || requestedPaymentType !== 'qrph'
                    ? null
                    : account.provider_merchant_id,
                split_payload: splitPayload
            });

            let providerResult;
            try {
                const metadata = {
                    commerce_payment_session: publicReference,
                    tenant_id: String(tenantId),
                    store_slug: storeSlug,
                    payment_method: requestedPaymentType,
                    platform_fee_centavos: String(platformFeeCentavos),
                    dgfy_fee_basis: feePolicy.dgfy_fee_basis,
                    dgfy_fee_charged_to: feePolicy.dgfy_fee_charged_to,
                    provider_fee_shoulder: feePolicy.provider_fee_shoulder,
                    collection_model: feePolicy.collection_model || 'paymongo_split',
                    tenant_revenue_policy_version: String(feePolicy.tenant_revenue_policy_version || '')
                };
                const storefrontReturnUrl = resolveStorefrontPaymentReturnUrl({
                    configuredReturnUrl: process.env.STOREFRONT_PAYMENT_RETURN_URL || null,
                    storeSlug,
                    trustedReturnUrl
                });
                if (!storefrontReturnUrl) {
                    throw new DomainError(
                        DomainErrorCode.SERVICE_UNAVAILABLE,
                        'Online payment return URL is not configured.',
                        { statusCode: 503, details: { code: 'PAYMONGO_RETURN_URL_MISSING' } }
                    );
                }
                if (requestedPaymentType === 'qrph') {
                    providerResult = await paymongoService.createQrphPaymentIntent({
                        amount: totalAmountCentavos,
                        currency: 'PHP',
                        description: `DGFY storefront checkout ${publicReference}`,
                        billing: {
                            name: normalizedPayload.customer_name || 'Storefront Customer',
                            email: normalizedPayload.customer_email || undefined,
                            phone: normalizedPayload.customer_phone || undefined
                        },
                        metadata,
                        splitPayment: splitPayload,
                        returnUrl: storefrontReturnUrl
                    });
                } else if (requestedPaymentType === 'gcash' && directGcashEnabled) {
                    const directReturnUrl = buildStorefrontPaymentCallbackUrl({
                        paymentMethod: requestedPaymentType,
                        paymentSession: publicReference,
                        paymentStatus: 'return',
                        returnUrl: storefrontReturnUrl
                    });
                    providerResult = await paymongoService.createDirectGcashPaymentIntent({
                        amount: totalAmountCentavos,
                        currency: 'PHP',
                        description: `DGFY storefront checkout ${publicReference}`,
                        metadata,
                        returnUrl: directReturnUrl
                    });
                } else if (requestedPaymentType === 'maya' && directMayaEnabled) {
                    const directReturnUrl = buildStorefrontPaymentCallbackUrl({
                        paymentMethod: requestedPaymentType,
                        paymentSession: publicReference,
                        paymentStatus: 'return',
                        returnUrl: storefrontReturnUrl
                    });
                    providerResult = await paymongoService.createDirectMayaPaymentIntent({
                        amount: totalAmountCentavos,
                        currency: 'PHP',
                        description: `DGFY storefront checkout ${publicReference}`,
                        metadata,
                        returnUrl: directReturnUrl
                    });
                } else if (requestedPaymentType === 'card' && directCardEnabled) {
                    const directReturnUrl = buildStorefrontPaymentCallbackUrl({
                        paymentMethod: requestedPaymentType,
                        paymentSession: publicReference,
                        paymentStatus: 'return',
                        returnUrl: storefrontReturnUrl
                    });
                    providerResult = await paymongoService.createDirectCardPaymentIntent({
                        amount: totalAmountCentavos,
                        currency: 'PHP',
                        description: `DGFY storefront checkout ${publicReference}`,
                        metadata,
                        returnUrl: directReturnUrl
                    });
                } else {
                    const successUrl = buildStorefrontPaymentCallbackUrl({
                        paymentMethod: requestedPaymentType,
                        paymentSession: publicReference,
                        paymentStatus: 'success',
                        returnUrl: storefrontReturnUrl
                    });
                    const cancelUrl = buildStorefrontPaymentCallbackUrl({
                        paymentMethod: requestedPaymentType,
                        paymentSession: publicReference,
                        paymentStatus: 'cancelled',
                        returnUrl: storefrontReturnUrl
                    });
                    if (!successUrl || !cancelUrl) {
                        throw new DomainError(
                            DomainErrorCode.SERVICE_UNAVAILABLE,
                            'Hosted checkout return URL is not configured.',
                            { statusCode: 503, details: { code: 'PAYMONGO_RETURN_URL_MISSING' } }
                        );
                    }
                    providerResult = await paymongoService.createHostedCheckoutSession({
                        amount: totalAmountCentavos,
                        currency: 'PHP',
                        description: `DGFY storefront checkout ${publicReference}`,
                        lineItems: [{
                            name: `DGFY order ${publicReference}`,
                            amount: totalAmountCentavos,
                            currency: 'PHP',
                            quantity: 1
                        }],
                        paymentMethodTypes: [getHostedPaymentMethodType(requestedPaymentType)],
                        successUrl,
                        cancelUrl,
                        referenceNumber: publicReference,
                        metadata
                    });
                }
            } catch (error) {
                const failed = await commercePaymentRepository.updateSessionById(session.session_id, {
                    status: 'failed',
                    failure_code: 'PROVIDER_CREATE_FAILED',
                    failure_reason: error.response?.data?.errors?.[0]?.detail || error.message || 'PayMongo online payment creation failed'
                });
                return ok({ payment_session: serializePaymentSession(failed) });
            }

            const providerAttributes = providerResult?.attributes || {};
            const expiresAt = providerResult.expiresAt
                ? new Date(providerResult.expiresAt)
                : (requestedPaymentType === 'qrph'
                    ? new Date(Date.now() + 30 * 60 * 1000)
                    : ((requestedPaymentType === 'gcash' && directGcashEnabled)
                        || (requestedPaymentType === 'maya' && directMayaEnabled)
                        || (requestedPaymentType === 'card' && directCardEnabled)
                        ? new Date(Date.now() + 4 * 60 * 60 * 1000)
                        : null));
            const updated = await commercePaymentRepository.updateSessionById(session.session_id, {
                status: 'awaiting_payment',
                provider_payment_intent_id: providerResult.paymentIntent?.id || providerResult.attachedIntent?.id || null,
                provider_payment_method_id: providerResult.paymentMethod?.id || null,
                qr_code_image_url: providerResult.qrCodeImageUrl || null,
                checkout_url: providerResult.checkoutUrl || providerAttributes.checkout_url || null,
                expires_at: expiresAt,
                provider_payload: requestedPaymentType === 'qrph'
                    ? (providerResult.attachedIntent || providerResult.paymentIntent || null)
                    : providerResult
            });

            return ok({ idempotent_replay: false, payment_session: serializePaymentSession(updated) });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to create online payment session'));
        }
    };
};

export const buildGetStoreCheckoutPaymentSessionUseCase = ({ commercePaymentRepository }) => {
    return async ({ paymentSessionId }) => {
        try {
            const reference = String(paymentSessionId || '').trim().toUpperCase();
            if (!/^CPS-[A-Z0-9]{10}$/.test(reference)) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invalid payment session reference', { statusCode: 422 });
            }
            const tenantContext = dbStore.getStore() || {};
            const tenantId = normalizeTenantIdentifier(tenantContext.tenantId);
            const session = await commercePaymentRepository.findSessionByPublicReference(reference);
            if (!session || normalizeTenantIdentifier(session.tenant_id) !== tenantId) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
            }
            return ok({ payment_session: serializePaymentSession(session) });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to load QR Ph payment session'));
        }
    };
};

const isLoopbackAddress = (value) => {
    const address = String(value || '').trim().toLowerCase();
    return address === '127.0.0.1'
        || address === '::1'
        || address === '::ffff:127.0.0.1';
};

export const buildConfirmStoreCheckoutSandboxPaymentUseCase = ({
    commercePaymentRepository,
    paymongoService
}) => {
    return async ({ paymentSessionId, remoteAddress }) => {
        try {
            if (process.env.PAYMONGO_MODE !== 'test' || !isLoopbackAddress(remoteAddress)) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Sandbox payment confirmation is not available.',
                    { statusCode: 404 }
                );
            }

            const reference = String(paymentSessionId || '').trim().toUpperCase();
            if (!/^CPS-[A-Z0-9]{10}$/.test(reference)) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invalid payment session reference', { statusCode: 422 });
            }

            const tenantContext = dbStore.getStore() || {};
            const tenantId = normalizeTenantIdentifier(tenantContext.tenantId);
            const session = await commercePaymentRepository.findSessionByPublicReference(reference);
            if (!session || normalizeTenantIdentifier(session.tenant_id) !== tenantId) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
            }
            if (session.status === 'finalized') {
                return ok({
                    confirmation_requested: false,
                    idempotent_replay: true,
                    payment_session: serializePaymentSession(session)
                });
            }
            if (session.status !== 'awaiting_payment') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    `Payment session cannot be confirmed while ${String(session.status || 'unknown').replaceAll('_', ' ')}.`,
                    { statusCode: 409 }
                );
            }
            if (!session.provider_payment_intent_id) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Payment session has no PayMongo payment intent.', { statusCode: 409 });
            }
            if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'The PayMongo QR Ph payment has expired.', { statusCode: 409 });
            }

            const providerResult = await paymongoService.confirmSandboxQrphPayment({
                paymentIntentId: session.provider_payment_intent_id,
                expectedAmount: session.total_amount_centavos,
                expectedCurrency: session.currency || 'PHP'
            });
            const providerAttributes = providerResult.paymentIntent?.attributes || {};
            if (
                Number(providerAttributes.amount) !== Number(session.total_amount_centavos)
                || String(providerAttributes.currency || '').toUpperCase() !== String(session.currency || 'PHP').toUpperCase()
            ) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'PayMongo sandbox payment amount or currency does not match this checkout.',
                    { statusCode: 409 }
                );
            }

            return ok({
                confirmation_requested: true,
                idempotent_replay: false,
                payment_session: serializePaymentSession(session)
            });
        } catch (error) {
            return fail(mapStoreUseCaseError(error, 'Failed to confirm PayMongo sandbox payment'));
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
            // Phase 210 (#1179). Gated on `rejected` so a reason can never leak on a non-rejected
            // order (defensive: the column is only ever written on reject anyway).
            const rejectionReason = String(order?.rejection_reason || '').trim();
            const reviewInvites = order.fulfillment_status === 'completed'
                ? await issueReviewInvitesForOrder({
                    tenantId,
                    order,
                    trackingPin: normalizedTrackingPin,
                    deliveryChannel: 'tracking'
                }).catch(() => [])
                : [];

            return ok({
                tracking_pin: normalizedTrackingPin,
                status: order.fulfillment_status,
                status_label: toStatusLabel(order.fulfillment_status),
                is_trackable: !rejected && !cancelled,
                message: rejected
                    ? (rejectionReason
                        ? `This order was not accepted by the store: ${rejectionReason}`
                        : 'This order was not accepted by the store.')
                    : cancelled
                        ? 'This order was cancelled.'
                        : 'Tracking information loaded successfully.',
                rejection_reason: rejected ? (rejectionReason || null) : null,
                order: serializeOrderForPublicTracking(order),
                review_invites: reviewInvites
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

// #1390 (ADR 0066 Validation #3, closing Consequences #3's cancelled-order half): a cancelled
// order must return its voucher budget/usage, IN-TRANSACTION -- unlike the payment lifecycle below,
// this is a same-database write with no provider call, so ADR 0052's cross-database fail-open
// carve-out does not apply. A reversal failure throws and rolls the whole cancellation back; the
// customer sees a retryable error, never a silently-unreturned campaign budget. Kept out of
// buildCancelStoreOrderUseCase's own body so that function does not grow a fourth concern.
const reverseOrderVoucherRedemptions = async ({
    voucherRepository,
    reverseVoucherRedemptionUseCase,
    order,
    transaction,
    trackingPin
}) => {
    // Cheap in-memory gate FIRST: an order with neither axis touched costs zero queries, and every
    // existing cancel unit test (which wires no voucher repository at all) is unaffected.
    const hasDeliveryAxis = parsePositiveInt(order?.delivery_fee_waiver_voucher_id) !== null;
    const hasItemAxis = order?.discount?.discount_type === 'voucher';
    if (!hasDeliveryAxis && !hasItemAxis) {
        return { attempted: 0, reversed: 0, entries: [] };
    }
    if (!voucherRepository || typeof reverseVoucherRedemptionUseCase !== 'function') {
        return { attempted: 0, reversed: 0, entries: [], skipped_reason: 'unwired' };
    }

    const orderId = parsePositiveInt(order.pos_transaction_id);
    const rows = orderId ? await voucherRepository.listRedemptionsByTransactionId(orderId, { transaction }) : [];
    let candidates = rows.filter((row) => row.entry_type === 'redemption');

    // Legacy orders (placed before #1390) have pos_transaction_id NULL. The delivery axis is still
    // exactly reconstructable from the header's voucher id; the item axis is not -- a prefix scan
    // has a real collision hazard against client-supplied idempotency keys (see the PR's own plan,
    // section 3.2), so it is a documented gap, not silently dropped.
    if (candidates.length === 0 && hasDeliveryAxis && order.idempotency_key) {
        const legacyKey = `storefront:${order.idempotency_key}:delivery:${order.delivery_fee_waiver_voucher_id}`;
        const legacy = await voucherRepository.findRedemptionByIdempotencyKey(legacyKey, { transaction, lock: true });
        if (legacy && legacy.entry_type === 'redemption') {
            candidates = [legacy];
        }
    }
    // The item axis has no exact-key reconstruction (see the comment above) -- if it's present on
    // the order but no candidate row carries a 'items' benefit_target, it was silently unrecoverable
    // and stays that way. Named via a warn rather than silently dropped, per the plan's own gap.
    const itemAxisRecovered = candidates.some((row) => (row.benefit_config_snapshot?.benefit_target ?? 'items') === 'items');
    if (hasItemAxis && !itemAxisRecovered) {
        logger.warn('[StoreUseCases] Cancelled order has an item-axis voucher discount but no reversible redemption row -- likely a legacy order placed before #1390 (pos_transaction_id backfill), or a redemption id that was never attached', {
            tracking_pin: trackingPin
        });
    }

    const entries = [];
    for (const row of candidates) {
        const result = await reverseVoucherRedemptionUseCase({
            originalRedemptionId: row.voucher_redemption_id,
            reason: `Storefront order cancelled (${trackingPin})`,
            transaction
        });
        entries.push({
            voucher_id: row.voucher_id,
            original_redemption_id: row.voucher_redemption_id,
            reversal_id: result.reversalId,
            idempotent_replay: result.idempotentReplay,
            benefit_target: row.benefit_config_snapshot?.benefit_target ?? 'items'
        });
    }
    return { attempted: candidates.length, reversed: entries.length, entries };
};

export const buildCancelStoreOrderUseCase = ({
    storeRepository,
    inventoryReservationService = null,
    // Phase 144 (#824): injected, optional, and defaulting to null so every existing test that
    // builds this use case without it keeps its current behaviour verbatim.
    commerceOrderLifecycleUseCase = null,
    // #1390: injected, optional, defaulting to null -- same reasoning as commerceOrderLifecycleUseCase
    // above. Deliberately NOT the static `../../vouchers/index.js` import storeCheckoutUseCase uses
    // for its own (checkout-side) voucher call -- storeCancelDownpaymentLifecycle.unit.test.js and
    // others build this use case with a hand-built fake storeRepository and no voucher wiring at
    // all, and a hard static import would make every one of those tests exercise the real
    // repository against a live tenant connection. store/index.js wires the real ones.
    voucherRepository = null,
    reverseVoucherRedemptionUseCase = null
}) => {
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

            if (inventoryReservationService?.releaseOnlineOrderInventory) {
                await inventoryReservationService.releaseOnlineOrderInventory({
                    sourceId: existing.pos_transaction_id,
                    transaction,
                    reason: 'cancelled'
                });
            }

            // #1390: IN-TRANSACTION and BEFORE commit (ADR 0066 Validation #3) -- a failure here
            // throws and is caught below, rolling back the inventory release and the
            // fulfillment_status flip along with it. Fail-CLOSED, deliberately the opposite of the
            // payment-lifecycle block below: that one is cross-database/cross-provider (ADR 0052)
            // and genuinely cannot be rolled back; this one is same-database, same-transaction, so
            // a failure is atomically undoable and a retryable customer-facing error is strictly
            // better than a silently-unreturned campaign budget.
            const voucherReversal = await reverseOrderVoucherRedemptions({
                voucherRepository,
                reverseVoucherRedemptionUseCase,
                order: existing,
                transaction,
                trackingPin: normalizedTrackingPin
            });

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

            // Phase 144 (#824). Before this, a customer who paid a downpayment online could
            // self-cancel here and the money was neither refunded, forfeited, nor recorded
            // anywhere -- this path never touched payments at all. It is also the ONLY origin
            // that may forfeit a non-refundable downpayment (see commerceOrderLifecycleUseCase's
            // `initiatedBy`): a store-side cancel through POS always refunds.
            //
            // Post-commit, mirroring posUseCases.js's own online-order status path, and mandatory
            // rather than stylistic: ADR 0052's Architecture Boundaries section states this is a
            // cross-database workflow where a provider failure cannot roll back the tenant order
            // decision. The cancel has already succeeded; a payment failure here is surfaced, not
            // thrown.
            let paymentLifecycle = { tracked: false, payment_action: 'not_applicable' };
            if (commerceOrderLifecycleUseCase && parsePositiveInt(updated?.pos_transaction_id)) {
                const lifecycleResult = await commerceOrderLifecycleUseCase({
                    tenantId: normalizedTenantId,
                    posTransactionId: parsePositiveInt(updated.pos_transaction_id),
                    fulfillmentStatus: 'cancelled',
                    actor: normalizedStoreCustomerId
                        ? `store_customer:${normalizedStoreCustomerId}`
                        : 'store_guest',
                    initiatedBy: 'customer'
                }).catch((error) => fail(new DomainError(
                    DomainErrorCode.INTERNAL_ERROR,
                    error?.message || 'Commerce order payment lifecycle failed.'
                )));
                paymentLifecycle = lifecycleResult.success
                    ? lifecycleResult.data
                    : {
                        tracked: true,
                        payment_action: 'refund_failed',
                        failure_reason: lifecycleResult.error?.message
                            || 'The payment lifecycle action requires administrator review.'
                    };
                if (!lifecycleResult.success) {
                    logger.error('[StoreUseCases] Commerce payment lifecycle failed after customer cancellation', {
                        tenant_id: normalizedTenantId,
                        tracking_pin: normalizedTrackingPin,
                        error: lifecycleResult.error?.message
                    });
                }
            }

            return ok({
                tracking_pin: normalizedTrackingPin,
                status: 'cancelled',
                order: serializeOrderForPublicTracking(updated),
                payment_lifecycle: paymentLifecycle,
                // #1390: purely additive, always this stable shape (never null) so a consumer never
                // has to null-guard it. { attempted: 0, reversed: 0, entries: [] } for any order with
                // no voucher touched at all.
                voucher_reversal: voucherReversal
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

const resolveStorefrontSlugGuard = async ({ storeRepository, tenantId, resolveDiscoverySlug = async () => null }) => {
    const discoverySnapshot = await resolveDiscoverySlug({ tenantId }).catch(() => null);
    const indexedSlug = String(discoverySnapshot?.slug || '').trim().toLowerCase();
    const settingsRows = await storeRepository.getSettingsByKeys(['store_tenant_slug']);
    const configured = String(settingsRows?.store_tenant_slug?.value || '').trim().toLowerCase();
    if (!indexedSlug && !configured) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            'Storefront slug is not configured for this tenant',
            { statusCode: 404 }
        );
    }
    return {
        indexedSlug,
        configuredSlug: configured
    };
};

const normalizeStorefrontFollowInput = async ({ storeRepository, tenantId, payload = {}, storeCustomer = null, resolveDiscoverySlug = async () => null }) => {
    const normalizedTenantId = ensureTenantContext(tenantId);
    const allowedSlugConfig = await resolveStorefrontSlugGuard({ storeRepository, tenantId: normalizedTenantId, resolveDiscoverySlug });
    const storefrontSlug = String(payload?.storefront_slug || '').trim().toLowerCase();
    const visitorId = String(payload?.visitor_id || '').trim();

    if (!storefrontSlug || storefrontSlug.length > 120 || !/^[a-z0-9-]+$/.test(storefrontSlug)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'storefront_slug must contain lowercase letters, numbers, and hyphens',
            { statusCode: 422 }
        );
    }
    const allowedSlugs = new Set([
        String(allowedSlugConfig?.indexedSlug || '').trim().toLowerCase(),
        String(allowedSlugConfig?.configuredSlug || '').trim().toLowerCase()
    ].filter(Boolean));
    if (!allowedSlugs.has(storefrontSlug)) {
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

export const buildGetStorefrontFollowStatusUseCase = ({ storeRepository, resolveDiscoverySlug = async () => null }) => {
    return async ({ tenantId, payload = {}, storeCustomer = null }) => {
        try {
            const normalized = await normalizeStorefrontFollowInput({ storeRepository, tenantId, payload, storeCustomer, resolveDiscoverySlug });
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

export const buildFollowStorefrontUseCase = ({ storeRepository, resolveDiscoverySlug = async () => null }) => {
    return async ({ tenantId, payload = {}, storeCustomer = null }) => {
        try {
            const normalized = await normalizeStorefrontFollowInput({ storeRepository, tenantId, payload, storeCustomer, resolveDiscoverySlug });
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

export const buildUnfollowStorefrontUseCase = ({ storeRepository, resolveDiscoverySlug = async () => null }) => {
    return async ({ tenantId, payload = {}, storeCustomer = null }) => {
        try {
            const normalized = await normalizeStorefrontFollowInput({ storeRepository, tenantId, payload, storeCustomer, resolveDiscoverySlug });
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
