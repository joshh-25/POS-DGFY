import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';
import { normalizeStorefrontBusinessHours } from './storefrontBusinessHours.js';

export const STOREFRONT_PROMO_SETTING_KEY = 'storefront_promo';
export const STOREFRONT_PROMOS_SETTING_KEY = 'storefront_promos';
const DEFAULT_PROMO_TIMEZONE = 'Asia/Manila';
const PROMO_TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toPositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizePromoCode = (value) => String(value || '').trim().toUpperCase().slice(0, 40);

const extractSettingValue = (setting) => (
    setting && typeof setting === 'object' && Object.prototype.hasOwnProperty.call(setting, 'value')
        ? setting.value
        : setting
);

export const parseCommercialPromoConfig = (rawValue, meta = {}) => {
    const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
    const discountPercent = Number(value.discount_percent);
    const usageLimit = Number(value.usage_limit);
    const usedCount = Number(value.used_count);
    return {
        sourceKey: meta.sourceKey || STOREFRONT_PROMO_SETTING_KEY,
        sourceIndex: Number.isInteger(meta.sourceIndex) ? meta.sourceIndex : null,
        promoId: String(value.id || value.promo_id || meta.promoId || '').trim(),
        raw: value,
        active: value.active === true,
        title: String(value.title || '').trim(),
        badge: String(value.badge || '').trim(),
        promoCode: normalizePromoCode(value.promo_code),
        discountPercent: Number.isFinite(discountPercent) ? Math.max(0, Math.min(100, round4(discountPercent))) : 0,
        usageLimit: Number.isInteger(usageLimit) && usageLimit > 0 ? usageLimit : null,
        usedCount: Number.isInteger(usedCount) && usedCount >= 0 ? usedCount : 0,
        targetItemIds: [...new Set((Array.isArray(value.target_item_ids) ? value.target_item_ids : []).map(toPositiveInt).filter(Boolean))],
        validTimeStart: PROMO_TIME_24H_PATTERN.test(String(value.valid_time_start || '').trim()) ? String(value.valid_time_start).trim() : '',
        validTimeEnd: PROMO_TIME_24H_PATTERN.test(String(value.valid_time_end || '').trim()) ? String(value.valid_time_end).trim() : ''
    };
};

export const parseCommercialPromoConfigs = (settings = {}) => {
    const promosValue = extractSettingValue(settings?.[STOREFRONT_PROMOS_SETTING_KEY]);
    const legacyValue = extractSettingValue(settings?.[STOREFRONT_PROMO_SETTING_KEY]);
    const configs = Array.isArray(promosValue)
        ? promosValue
            .map((entry, index) => parseCommercialPromoConfig(entry, {
                sourceKey: STOREFRONT_PROMOS_SETTING_KEY,
                sourceIndex: index
            }))
            .filter((config) => config.raw && Object.keys(config.raw).length > 0)
        : [];

    const legacyConfig = parseCommercialPromoConfig(legacyValue, {
        sourceKey: STOREFRONT_PROMO_SETTING_KEY
    });
    if (legacyConfig.raw && Object.keys(legacyConfig.raw).length > 0) {
        const legacyCode = legacyConfig.promoCode;
        const duplicate = legacyCode && configs.some((config) => config.promoCode === legacyCode);
        if (!duplicate) configs.push(legacyConfig);
    }

    return configs;
};

const timeToMinutes = (value) => {
    const match = String(value || '').trim().match(PROMO_TIME_24H_PATTERN);
    return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
};

const zonedMinutes = (date, timezone) => {
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(date).map((part) => [part.type, part.value]));
        return (Number(parts.hour) * 60) + Number(parts.minute);
    } catch {
        return null;
    }
};

const isActiveTime = ({ now, start, end, timezone }) => {
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) return true;
    const current = zonedMinutes(now, timezone);
    if (current == null) return true;
    return startMinutes < endMinutes
        ? current >= startMinutes && current <= endMinutes
        : current >= startMinutes || current <= endMinutes;
};

const promoError = (message, reasonCode, details = {}) => {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, message, {
        statusCode: 422,
        details: { reason_code: reasonCode, ...details }
    });
};

export const resolveCommercialPromoApplication = ({ settings = {}, promoCode, prepared = {}, now = new Date() }) => {
    const enteredPromoCode = normalizePromoCode(promoCode);
    const configs = parseCommercialPromoConfigs(settings);
    const config = configs.find((entry) => entry.promoCode === enteredPromoCode)
        || configs[0]
        || parseCommercialPromoConfig(null);
    const preparedLines = Array.isArray(prepared.preparedLines) ? prepared.preparedLines : [];
    const subtotalAmount = round4(prepared.subtotalAmount || 0);
    if (!enteredPromoCode) return { config, enteredPromoCode: '', applied: false, discountAmount: 0, discountRate: 0, discountLabel: null, eligibleItemIds: [], lineAllocations: [], message: '' };
    if (!config.active || !config.promoCode || enteredPromoCode !== config.promoCode || config.discountPercent <= 0) {
        promoError('Invalid or inactive promo code.', 'INVALID_PROMO_CODE');
    }
    if (config.usageLimit != null && config.usedCount >= config.usageLimit) {
        promoError('Promo code has reached its usage limit.', 'PROMO_USAGE_LIMIT_REACHED', { usage_limit: config.usageLimit, used_count: config.usedCount });
    }
    const hours = normalizeStorefrontBusinessHours(settings?.storefront_hours?.value);
    const timezone = String(hours?.timezone || DEFAULT_PROMO_TIMEZONE).trim() || DEFAULT_PROMO_TIMEZONE;
    if (config.validTimeStart && config.validTimeEnd && !isActiveTime({ now, start: config.validTimeStart, end: config.validTimeEnd, timezone })) {
        promoError('Promo code is outside its valid time window.', 'PROMO_TIME_RANGE_BLOCKED');
    }
    const targets = new Set(config.targetItemIds);
    const eligibleLines = targets.size > 0 ? preparedLines.filter((line) => targets.has(toPositiveInt(line.item_id))) : preparedLines;
    if (targets.size > 0 && eligibleLines.length === 0) promoError('Promo code does not apply to the items in this order.', 'PROMO_ITEMS_NOT_IN_ORDER');
    const eligibleSubtotal = round4(eligibleLines.reduce((sum, line) => sum + round4(line.line_subtotal ?? (Number(line.quantity) * Number(line.sale_price))), 0));
    const base = targets.size > 0 ? eligibleSubtotal : subtotalAmount;
    const discountAmount = round4(base * (config.discountPercent / 100));
    const eligibleIndexes = preparedLines
        .map((line, index) => (eligibleLines.includes(line) ? index : null))
        .filter((index) => index != null);
    let allocatedDiscount = 0;
    const lineAllocations = preparedLines.map((line, index) => {
        const lineSubtotal = round4(line.line_subtotal ?? (Number(line.quantity) * Number(line.sale_price)));
        const isEligible = eligibleIndexes.includes(index);
        const isLastEligible = isEligible && index === eligibleIndexes[eligibleIndexes.length - 1];
        const lineDiscount = !isEligible
            ? 0
            : isLastEligible
                ? round4(discountAmount - allocatedDiscount)
                : round4(lineSubtotal * (config.discountPercent / 100));
        allocatedDiscount = round4(allocatedDiscount + lineDiscount);
        return {
            item_id: toPositiveInt(line.item_id),
            eligible_quantity: isEligible ? round4(line.quantity) : 0,
            gross_eligible_amount: isEligible ? lineSubtotal : 0,
            vat_removed: 0,
            vat_exempt_amount: 0,
            discount_amount: lineDiscount,
            final_line_amount: round4(lineSubtotal - lineDiscount)
        };
    });
    return {
        config,
        enteredPromoCode,
        applied: base > 0,
        discountAmount,
        discountRate: config.discountPercent,
        discountLabel: config.badge || config.title || `Promo Code (${enteredPromoCode})`,
        eligibleItemIds: [...new Set(eligibleLines.map((line) => toPositiveInt(line.item_id)).filter(Boolean))],
        lineAllocations,
        message: 'Promo code applied successfully.'
    };
};

export const buildCommercialPromoUsageUpdate = ({ settings = {}, promoApplication }) => {
    const config = promoApplication?.config;
    if (!promoApplication?.applied || !config?.sourceKey) return null;
    const nextUsedCount = Number(config.usedCount || 0) + 1;

    if (config.sourceKey === STOREFRONT_PROMOS_SETTING_KEY) {
        const currentPromos = extractSettingValue(settings?.[STOREFRONT_PROMOS_SETTING_KEY]);
        if (!Array.isArray(currentPromos)) return null;
        const sourceIndex = Number.isInteger(config.sourceIndex)
            ? config.sourceIndex
            : currentPromos.findIndex((entry) => normalizePromoCode(entry?.promo_code) === config.promoCode);
        if (sourceIndex < 0 || sourceIndex >= currentPromos.length) return null;
        return {
            key: STOREFRONT_PROMOS_SETTING_KEY,
            value: currentPromos.map((entry, index) => (
                index === sourceIndex
                    ? { ...(entry && typeof entry === 'object' ? entry : {}), used_count: nextUsedCount }
                    : entry
            ))
        };
    }

    return {
        key: STOREFRONT_PROMO_SETTING_KEY,
        value: {
            ...config.raw,
            used_count: nextUsedCount
        }
    };
};
