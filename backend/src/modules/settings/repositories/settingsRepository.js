import { Op } from 'sequelize';
import { StorefrontDiscoveryIndex, StorefrontHandleReservation } from '../../../models/index.js';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertSettingsRepositoryContract } from '../contracts/settingsRepository.contract.js';
import logger from '../../../config/logger.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import {
    normalizeCustomerAccessMode,
    normalizeInventoryDisplayMode,
    normalizeLowStockDisplayThreshold
} from '../../shared/utils/customerAccessPolicy.js';
import {
    normalizeStorefrontAssetPath,
    normalizeStorefrontAssetUrl
} from '../../shared/utils/storefrontAssetPolicy.js';
import { normalizeStorefrontBusinessHours } from '../../shared/utils/storefrontBusinessHours.js';

const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery', 'online', 'appointment'];
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const ORDER_METHOD_DEFAULT_LABELS = {
    dine_in: 'Dine In Fee',
    takeout: 'Takeout Fee',
    pickup: 'Pickup Fee',
    delivery: 'Delivery Fee',
    online: 'Online Fee',
    appointment: 'Appointment Fee'
};
const LOW_CONFIDENCE_BACKFILL_SOURCES = new Set(['active_location_fallback', 'no_resolution']);

const createStorefrontHandleConflictError = (handle) => {
    const error = new Error('Store tenant slug is already used by another company.');
    error.statusCode = 409;
    error.details = { reason_code: 'STOREFRONT_HANDLE_NOT_UNIQUE', handle };
    return error;
};

const isMissingTableError = (error, tableName) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    const message = String(error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes(tableName);
};

const createDefaultOrderMethodFees = () => ORDER_METHODS.reduce((acc, method) => {
    acc[method] = {
        enabled: false,
        amount: 0,
        label: ORDER_METHOD_DEFAULT_LABELS[method]
    };
    return acc;
}, {});

const parseBooleanLike = (value) => value === true || value === 'true' || value === 1 || value === '1';
const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const parseJsonLoosely = (raw) => {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;

    if (typeof raw !== 'string') return null;

    const parseOnce = (value) => {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    };

    const first = parseOnce(raw);
    if (first == null) return null;

    if (typeof first === 'string') {
        const second = parseOnce(first);
        if (second != null) return second;
    }

    return first;
};

const normalizeDiscountProfiles = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    if (!Array.isArray(parsed)) return [];

    const seenNames = new Set();
    const normalized = [];
    for (const profile of parsed) {
        const name = String(profile?.name || '').trim();
        if (!name) continue;

        const normalizedName = name.toLowerCase();
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);

        const numericPercentage = Number(profile?.percentage ?? 0);
        const percentage = Number.isFinite(numericPercentage)
            ? Math.min(100, Math.max(0, numericPercentage))
            : 0;

        normalized.push({
            name,
            percentage,
            active: profile?.active !== false
        });
    }

    return normalized.slice(0, 20);
};

const normalizeOrderMethodFees = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    const normalized = createDefaultOrderMethodFees();

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return normalized;
    }

    ORDER_METHODS.forEach((method) => {
        const entry = parsed?.[method];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;

        const amount = Number(entry.amount);
        normalized[method] = {
            enabled: parseBooleanLike(entry.enabled),
            amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
            label: String(entry.label || '').trim() || ORDER_METHOD_DEFAULT_LABELS[method]
        };
    });

    return normalized;
};

const normalizeStringListValue = (rawValue, maxItems = 8, maxLen = 120) => {
    const parsed = parseJsonLoosely(rawValue);
    const source = Array.isArray(parsed) ? parsed : (Array.isArray(rawValue) ? rawValue : []);
    return source
        .map((entry) => String(entry || '').trim().slice(0, maxLen))
        .filter(Boolean)
        .slice(0, maxItems);
};

const normalizeStorefrontGalleryUrlValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const internal = normalizeStorefrontAssetUrl(raw);
    if (internal) return internal;
    try {
        const parsed = new URL(raw);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
        return '';
    }
};

const normalizeExternalHttpUrl = (value, maxLen = 255) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, maxLen) : '';
    } catch {
        return '';
    }
};

const normalizeStorefrontGalleryImages = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    const source = Array.isArray(parsed) ? parsed : [];
    const normalized = source
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
            const url = normalizeStorefrontGalleryUrlValue(entry.url).slice(0, 500);
            const path = normalizeStorefrontAssetPath(entry.path).slice(0, 500);
            if (!url && !path) return null;
            return {
                url,
                path,
                caption: String(entry.caption || '').trim().slice(0, 140),
                alt: String(entry.alt || '').trim().slice(0, 140),
                sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
            };
        })
        .filter(Boolean)
        .slice(0, 24);
    return normalized.sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
};

const normalizeStorefrontDeliveryPartners = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    const source = Array.isArray(parsed) ? parsed : [];
    const normalized = [];
    source.forEach((entry) => {
        if (typeof entry === 'string') {
            const partner = String(entry || '').trim().toLowerCase();
            if (!partner) return;
            if (!['grab', 'foodpanda', 'lalamove'].includes(partner)) return;
            normalized.push({ partner, label: '', url: '' });
            return;
        }
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        const partner = String(entry.partner || '').trim().toLowerCase();
        if (!['grab', 'foodpanda', 'lalamove', 'custom'].includes(partner)) return;
        normalized.push({
            partner,
            label: String(entry.label || '').trim().slice(0, 60),
            url: normalizeExternalHttpUrl(entry.url, 255)
        });
    });

    const deduped = [];
    const seen = new Set();
    normalized.forEach((entry) => {
        const key = `${entry.partner}:${entry.partner === 'custom' ? String(entry.label || '').toLowerCase() : ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(entry);
    });
    return deduped.slice(0, 8);
};

const normalizeStorefrontReviewSummary = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const score = Number(parsed.score);
    const totalCount = Number(parsed.total_count);
    const summary = {
        score: Number.isFinite(score) ? Math.min(5, Math.max(0, score)) : null,
        total_count: Number.isInteger(totalCount) && totalCount >= 0 ? totalCount : null
    };
    const rawDistribution = parsed.star_distribution;
    if (rawDistribution && typeof rawDistribution === 'object' && !Array.isArray(rawDistribution)) {
        const distribution = {};
        [1, 2, 3, 4, 5].forEach((star) => {
            const value = Number(rawDistribution[star]);
            if (Number.isInteger(value) && value >= 0) {
                distribution[star] = value;
            }
        });
        if (Object.keys(distribution).length > 0) {
            summary.star_distribution = distribution;
        }
    }
    return summary;
};

const normalizeTerminalRegistry = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    if (!Array.isArray(parsed)) return [];

    const seenTerminalIds = new Set();
    const normalized = [];

    for (const entry of parsed) {
        const terminalId = String(entry?.terminal_id || '')
            .trim()
            .toUpperCase();
        if (!terminalId || !TERMINAL_ID_PATTERN.test(terminalId)) continue;
        if (seenTerminalIds.has(terminalId)) continue;
        seenTerminalIds.add(terminalId);

        const isActive = parseBooleanLike(entry?.is_active !== false);
        normalized.push({
            terminal_id: terminalId,
            label: String(entry?.label || '').trim(),
            location_id: parsePositiveInt(entry?.location_id),
            cashier_email: String(entry?.cashier_email || '').trim().toLowerCase(),
            is_active: isActive,
            is_default: isActive && parseBooleanLike(entry?.is_default),
            terminal_password_hash: String(entry?.terminal_password_hash || '').trim()
        });
    }

    const activeEntries = normalized.filter((entry) => entry.is_active);
    if (activeEntries.length === 0) {
        return [];
    }

    const firstDefaultIndex = normalized.findIndex((entry) => entry.is_default === true);
    if (firstDefaultIndex >= 0) {
        normalized.forEach((entry, index) => {
            if (index !== firstDefaultIndex) {
                entry.is_default = false;
            }
        });
    } else {
        const firstActiveIndex = normalized.findIndex((entry) => entry.is_active);
        if (firstActiveIndex >= 0) {
            normalized[firstActiveIndex].is_default = true;
        }
    }

    return normalized.slice(0, 40);
};

const toPublicTerminalRegistry = (entries = []) => (
    (Array.isArray(entries) ? entries : []).map((entry) => ({
        terminal_id: String(entry?.terminal_id || '').trim().toUpperCase(),
        label: String(entry?.label || '').trim(),
        location_id: parsePositiveInt(entry?.location_id),
        cashier_email: String(entry?.cashier_email || '').trim().toLowerCase(),
        is_active: entry?.is_active !== false,
        is_default: entry?.is_default === true,
        has_password: Boolean(String(entry?.terminal_password_hash || '').trim())
    }))
);

const normalizeValueForSettingKey = (settingKey, value) => {
    if (settingKey === 'pos_discount_profiles') {
        return normalizeDiscountProfiles(value);
    }
    if (settingKey === 'pos_order_method_fees') {
        return normalizeOrderMethodFees(value);
    }
    if (settingKey === 'pos_terminal_registry') {
        return normalizeTerminalRegistry(value);
    }
    if (settingKey === 'ops_workflow_mode') {
        return normalizeWorkflowMode(value);
    }
    if (settingKey === 'customer_access_mode') {
        return normalizeCustomerAccessMode(value);
    }
    if (settingKey === 'inventory_display_mode') {
        return normalizeInventoryDisplayMode(value);
    }
    if (settingKey === 'inventory_low_stock_display_threshold') {
        return normalizeLowStockDisplayThreshold(value);
    }
    if (settingKey === 'storefront_cover_image_url' || settingKey === 'storefront_profile_image_url') {
        return normalizeStorefrontAssetUrl(value);
    }
    if (settingKey === 'storefront_cover_image_path' || settingKey === 'storefront_profile_image_path') {
        return normalizeStorefrontAssetPath(value);
    }
    if (settingKey === 'storefront_categories') {
        return normalizeStringListValue(value, 12, 60);
    }
    if (settingKey === 'storefront_gallery_images') {
        return normalizeStorefrontGalleryImages(value);
    }
    if (settingKey === 'storefront_delivery_partners') {
        return normalizeStorefrontDeliveryPartners(value);
    }
    if (settingKey === 'storefront_review_summary') {
        return normalizeStorefrontReviewSummary(value);
    }
    if (settingKey === 'storefront_hours') {
        return normalizeStorefrontBusinessHours(value);
    }
    return value;
};

const POS_JSON_SETTING_KEYS = new Set([
    'pos_discount_profiles',
    'pos_order_method_fees',
    'pos_terminal_registry',
    'storefront_categories',
    'storefront_gallery_images',
    'storefront_delivery_partners',
    'storefront_promo',
    'storefront_review_summary',
    'storefront_hours'
]);
const STOREFRONT_ASSET_SETTING_KEYS = new Set([
    'storefront_cover_image_url',
    'storefront_profile_image_url',
    'storefront_cover_image_path',
    'storefront_profile_image_path'
]);

const shouldRepairNormalizedSetting = (setting, parsedValue) => {
    if (POS_JSON_SETTING_KEYS.has(setting.setting_key)) {
        if (setting.data_type !== 'json') return true;
        const expectedSerialized = JSON.stringify(normalizeValueForSettingKey(setting.setting_key, parsedValue));
        return setting.setting_value !== expectedSerialized;
    }
    if (STOREFRONT_ASSET_SETTING_KEYS.has(setting.setting_key)) {
        if (setting.data_type !== 'string') return true;
        const expectedValue = String(normalizeValueForSettingKey(setting.setting_key, parsedValue) || '');
        return String(setting.setting_value || '') !== expectedValue;
    }
    return false;
};

const parseSettingValue = (setting) => {
    let value = setting.setting_value;

    if (setting.data_type === 'number') {
        value = parseFloat(value);
    } else if (setting.data_type === 'boolean') {
        value = value === 'true' || value === '1';
    } else if (setting.data_type === 'json') {
        value = parseJsonLoosely(value);
    }

    return normalizeValueForSettingKey(setting.setting_key, value);
};

const serializeSettingValue = (setting, value) => {
    if (setting.data_type === 'json') {
        return JSON.stringify(value);
    }
    if (setting.data_type === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (setting.data_type === 'number') {
        return String(value);
    }
    return String(value);
};

const inferDataType = (value) => {
    if (typeof value === 'boolean') {
        return 'boolean';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return 'number';
    }
    if (value !== null && typeof value === 'object') {
        return 'json';
    }
    return 'string';
};

const normalizeSettingForWrite = (setting, value) => {
    const nextDataType = inferDataType(value);
    return {
        data_type: nextDataType,
        setting_value: serializeSettingValue({ data_type: nextDataType }, value)
    };
};

const applyThresholdSettingsInternal = async () => {
    const Item = dbStore.get('Item');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    const settings = await settingsRepository.getAllSettings();
    const autoCalc = settings.enable_auto_reorder?.value ?? true;
    const minPercent = (settings.min_stock_threshold_percent?.value || 40) / 100;
    const allowancePercent = (settings.purchase_allowance_percent?.value || 20) / 100;

    if (autoCalc) {
        const [affectedRows] = await Item.update(
            {
                min_threshold: sequelize.literal(`ROUND(max_capacity * ${minPercent})`),
                purchase_allowance: sequelize.literal(`ROUND(max_capacity * ${allowancePercent})`)
            },
            {
                where: buildVisibleWhere({
                    status: 'active',
                    max_capacity: { [Op.gt]: 0 }
                })
            }
        );
        return { updated: affectedRows, autoCalc: true };
    }

    const [affectedRows] = await Item.update(
        { min_threshold: null, purchase_allowance: null },
        { where: buildVisibleWhere({ status: 'active' }) }
    );
    return { updated: affectedRows, autoCalc: false };
};

export const settingsRepository = {
    async getAllSettings() {
        const SystemSetting = dbStore.get('SystemSetting');
        const settings = await SystemSetting.findAll({
            attributes: ['setting_id', 'setting_key', 'setting_value', 'data_type', 'description', 'updated_at']
        });

        const settingsObject = {};
        const repairPromises = [];
        settings.forEach((setting) => {
            const parsedValue = parseSettingValue(setting);
            settingsObject[setting.setting_key] = {
                value: setting.setting_key === 'pos_terminal_registry'
                    ? toPublicTerminalRegistry(parsedValue)
                    : parsedValue,
                data_type: setting.data_type,
                description: setting.description,
                updated_at: setting.updated_at
            };

            if (shouldRepairNormalizedSetting(setting, parsedValue)) {
                const normalizedValue = normalizeValueForSettingKey(setting.setting_key, parsedValue);
                const isJsonSetting = POS_JSON_SETTING_KEYS.has(setting.setting_key);
                if (STOREFRONT_ASSET_SETTING_KEYS.has(setting.setting_key)) {
                    logger.warn('[SettingsRepository] Sanitized storefront asset setting to canonical safe value', {
                        event_type: 'security_signal',
                        signal_code: 'storefront_asset_setting_sanitized',
                        setting_key: setting.setting_key
                    });
                }
                repairPromises.push(
                    setting.update({
                        data_type: isJsonSetting ? 'json' : 'string',
                        setting_value: isJsonSetting ? JSON.stringify(normalizedValue) : String(normalizedValue || '')
                    }).catch((error) => {
                        logger.warn(`[SettingsRepository] Failed to repair malformed setting ${setting.setting_key}: ${error.message}`);
                    })
                );
            }
        });

        if (repairPromises.length > 0) {
            await Promise.all(repairPromises);
        }

        return settingsObject;
    },
    async getSettingByKey(key) {
        const SystemSetting = dbStore.get('SystemSetting');
        const setting = await SystemSetting.findOne({
            where: { setting_key: key }
        });

        if (!setting) {
            throw new Error(`Setting '${key}' not found`);
        }

        const parsedValue = parseSettingValue(setting);

        let repaired = false;
        if (shouldRepairNormalizedSetting(setting, parsedValue)) {
            try {
                const normalizedValue = normalizeValueForSettingKey(setting.setting_key, parsedValue);
                const isJsonSetting = POS_JSON_SETTING_KEYS.has(setting.setting_key);
                if (STOREFRONT_ASSET_SETTING_KEYS.has(setting.setting_key)) {
                    logger.warn('[SettingsRepository] Sanitized storefront asset setting to canonical safe value', {
                        event_type: 'security_signal',
                        signal_code: 'storefront_asset_setting_sanitized',
                        setting_key: setting.setting_key
                    });
                }
                await setting.update({
                    data_type: isJsonSetting ? 'json' : 'string',
                    setting_value: isJsonSetting ? JSON.stringify(normalizedValue) : String(normalizedValue || '')
                });
                repaired = true;
            } catch (error) {
                logger.warn(`[SettingsRepository] Failed to repair malformed setting ${setting.setting_key}: ${error.message}`);
            }
        }

        return {
            setting_id: setting.setting_id,
            setting_key: setting.setting_key,
            value: setting.setting_key === 'pos_terminal_registry'
                ? toPublicTerminalRegistry(parsedValue)
                : parsedValue,
            data_type: repaired
                ? (POS_JSON_SETTING_KEYS.has(setting.setting_key) ? 'json' : 'string')
                : setting.data_type,
            description: setting.description,
            updated_at: setting.updated_at
        };
    },
    async getSettingsByKeys(keys = []) {
        const normalizedKeys = Array.isArray(keys)
            ? keys.map((key) => String(key || '').trim()).filter(Boolean)
            : [];
        if (normalizedKeys.length === 0) return {};

        const SystemSetting = dbStore.get('SystemSetting');
        const rows = await SystemSetting.findAll({
            where: {
                setting_key: { [Op.in]: normalizedKeys }
            }
        });

        const result = {};
        rows.forEach((row) => {
            const parsedValue = parseSettingValue(row);
            result[row.setting_key] = {
                setting_id: row.setting_id,
                setting_key: row.setting_key,
                value: parsedValue,
                data_type: row.data_type,
                description: row.description,
                updated_at: row.updated_at
            };
        });
        return result;
    },
    async updateSettings(settingsData) {
        const SystemSetting = dbStore.get('SystemSetting');
        const updatePromises = [];
        const errors = [];

        const thresholdKeys = ['enable_auto_reorder', 'min_stock_threshold_percent', 'purchase_allowance_percent'];
        const thresholdSettingsChanged = Object.keys(settingsData).some((key) => thresholdKeys.includes(key));

        for (const [key, value] of Object.entries(settingsData)) {
            try {
                const normalizedValue = normalizeValueForSettingKey(key, value);
                let setting = await SystemSetting.findOne({
                    where: { setting_key: key }
                });

                if (!setting) {
                    const data_type = inferDataType(normalizedValue);
                    setting = await SystemSetting.create({
                        setting_key: key,
                        setting_value: serializeSettingValue({ data_type }, normalizedValue),
                        data_type,
                        description: `Auto-created by settings update flow for key '${key}'`
                    });
                } else {
                    const normalizedUpdate = normalizeSettingForWrite(setting, normalizedValue);
                    updatePromises.push(
                        setting.update(normalizedUpdate)
                    );
                }
            } catch (error) {
                errors.push(`Failed to update '${key}': ${error.message}`);
            }
        }

        await Promise.all(updatePromises);

        if (errors.length > 0) {
            throw new Error(`Some settings failed to update: ${errors.join(', ')}`);
        }

        let thresholdResult = null;
        if (thresholdSettingsChanged) {
            thresholdResult = await applyThresholdSettingsInternal();
        }

        return {
            message: 'Settings updated successfully',
            updated: Object.keys(settingsData).length,
            thresholdResult
        };
    },
    async updateSettingByKey(key, value) {
        const SystemSetting = dbStore.get('SystemSetting');
        const normalizedValue = normalizeValueForSettingKey(key, value);
        let setting = await SystemSetting.findOne({
            where: { setting_key: key }
        });

        if (!setting) {
            const data_type = inferDataType(normalizedValue);
            setting = await SystemSetting.create({
                setting_key: key,
                setting_value: serializeSettingValue({ data_type }, normalizedValue),
                data_type,
                description: `Auto-created by settings update flow for key '${key}'`
            });
        } else {
            const normalizedUpdate = normalizeSettingForWrite(setting, normalizedValue);
            await setting.update(normalizedUpdate);
        }

        return {
            setting_id: setting.setting_id,
            setting_key: setting.setting_key,
            value: key === 'pos_terminal_registry'
                ? toPublicTerminalRegistry(normalizedValue)
                : normalizedValue,
            data_type: setting.data_type,
            description: setting.description,
            updated_at: setting.updated_at
        };
    },
    async resetSettingsToDefault() {
        const SystemSetting = dbStore.get('SystemSetting');
        const defaultSettings = {
            low_stock_threshold: '20',
            critical_stock_threshold: '10',
            enable_email_alerts: 'true',
            enable_low_stock_alerts: 'true',
            enable_expiry_alerts: 'true',
            alert_frequency_hours: '24',
            quality_check_frequency_days: '30',
            supplier_rating_threshold: '3.0',
            enable_auto_reorder: 'false',
            reorder_safety_margin: '1.2'
        };

        const updatePromises = Object.entries(defaultSettings).map(async ([key, value]) => {
            const setting = await SystemSetting.findOne({
                where: { setting_key: key }
            });

            if (setting) {
                return setting.update({ setting_value: value });
            }

            return null;
        });

        await Promise.all(updatePromises);
        return { message: 'Settings reset to default values' };
    },
    async applyThresholdSettings() {
        return applyThresholdSettingsInternal();
    },
    async getActivePrimaryTenantLocation(options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        if (!TenantLocation) return null;

        const row = await TenantLocation.findOne({
            where: {
                is_active: true,
                is_primary_storefront: true
            },
            attributes: ['location_id', 'name', 'is_active', 'is_primary_storefront'],
            transaction: options.transaction,
            lock: options.lock && options.transaction
                ? options.transaction.LOCK.UPDATE
                : undefined
        });
        return row && typeof row.toJSON === 'function' ? row.toJSON() : row;
    },
    async findPublicStorefrontHandleOwner(handle, options = {}) {
        const normalized = String(handle || '').trim().toLowerCase();
        if (!normalized) return null;

        if (typeof StorefrontHandleReservation?.findOne === 'function') {
            try {
                const reservation = await StorefrontHandleReservation.findOne({
                    where: { handle: normalized },
                    attributes: ['tenant_id', 'handle'],
                    transaction: options.transaction
                });
                if (reservation) {
                    const payload = reservation && typeof reservation.toJSON === 'function' ? reservation.toJSON() : reservation;
                    return { tenant_id: payload.tenant_id, slug: payload.handle };
                }
            } catch (error) {
                if (!isMissingTableError(error, 'storefront_handle_reservations')) {
                    throw error;
                }
            }
        }

        if (typeof StorefrontDiscoveryIndex?.findOne !== 'function') return null;

        const row = await StorefrontDiscoveryIndex.findOne({
            where: { slug: normalized },
            attributes: ['tenant_id', 'slug'],
            transaction: options.transaction
        });
        return row && typeof row.toJSON === 'function' ? row.toJSON() : row;
    },
    async reservePublicStorefrontHandle(handle, options = {}) {
        const normalized = String(handle || '').trim().toLowerCase();
        if (!normalized || typeof StorefrontHandleReservation?.findOne !== 'function') return null;

        const tenantId = dbStore.getStore()?.tenantId || null;
        if (!tenantId || tenantId === 'default') return null;

        try {
            const existingByHandle = await StorefrontHandleReservation.findOne({
                where: { handle: normalized },
                transaction: options.transaction,
                lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
            });
            if (existingByHandle) {
                const payload = existingByHandle && typeof existingByHandle.toJSON === 'function'
                    ? existingByHandle.toJSON()
                    : existingByHandle;
                if (String(payload?.tenant_id || '') !== String(tenantId)) {
                    throw createStorefrontHandleConflictError(normalized);
                }
                return payload;
            }

            const existingByTenant = await StorefrontHandleReservation.findOne({
                where: { tenant_id: tenantId },
                transaction: options.transaction,
                lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
            });

            if (existingByTenant) {
                await existingByTenant.update({
                    handle: normalized,
                    source: options.source || 'settings'
                }, { transaction: options.transaction });
                return existingByTenant && typeof existingByTenant.toJSON === 'function'
                    ? existingByTenant.toJSON()
                    : existingByTenant;
            }

            const created = await StorefrontHandleReservation.create({
                tenant_id: tenantId,
                handle: normalized,
                source: options.source || 'settings'
            }, { transaction: options.transaction });
            return created && typeof created.toJSON === 'function' ? created.toJSON() : created;
        } catch (error) {
            if (isMissingTableError(error, 'storefront_handle_reservations')) return null;
            if (
                error?.name === 'SequelizeUniqueConstraintError'
                || String(error?.original?.code || error?.parent?.code || '').includes('ER_DUP_ENTRY')
            ) {
                throw createStorefrontHandleConflictError(normalized);
            }
            throw error;
        }
    },
    async getPosLocationBindingReadinessSummary(options = {}) {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        if (!sequelize) {
            return {
                total_shifts: 0,
                unresolved_count: 0,
                low_confidence_count: 0,
                source_counts: {},
                ready_for_strict_mode: true
            };
        }
        try {
            const [latestMigrationTagRows] = await sequelize.query(`
            SELECT migration_tag
            FROM pos_shift_location_backfill_audit
            ORDER BY pos_shift_location_backfill_audit_id DESC
            LIMIT 1
        `, { transaction: options.transaction });
            const latestMigrationTag = latestMigrationTagRows?.[0]?.migration_tag || null;

            if (!latestMigrationTag) {
                const [fallbackCountsRows] = await sequelize.query(`
                SELECT
                    COUNT(*) AS total_shifts,
                    SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) AS unresolved_count
                FROM pos_terminal_shifts
            `, { transaction: options.transaction });
                const totalShifts = Number.parseInt(fallbackCountsRows?.[0]?.total_shifts || 0, 10) || 0;
                const unresolvedCount = Number.parseInt(fallbackCountsRows?.[0]?.unresolved_count || 0, 10) || 0;
                return {
                    total_shifts: totalShifts,
                    unresolved_count: unresolvedCount,
                    low_confidence_count: unresolvedCount,
                    source_counts: {},
                    ready_for_strict_mode: unresolvedCount === 0
                };
            }

            const [summaryRows] = await sequelize.query(`
            SELECT
                COUNT(*) AS total_shifts,
                SUM(CASE WHEN s.location_id IS NULL THEN 1 ELSE 0 END) AS unresolved_count,
                SUM(CASE WHEN a.resolution_source IN ('active_location_fallback', 'no_resolution') THEN 1 ELSE 0 END) AS low_confidence_count
            FROM pos_terminal_shifts s
            LEFT JOIN (
                SELECT audit.*
                FROM pos_shift_location_backfill_audit audit
                INNER JOIN (
                    SELECT shift_id, MAX(pos_shift_location_backfill_audit_id) AS latest_id
                    FROM pos_shift_location_backfill_audit
                    WHERE migration_tag = :migrationTag
                    GROUP BY shift_id
                ) latest ON latest.latest_id = audit.pos_shift_location_backfill_audit_id
            ) a ON a.shift_id = s.pos_terminal_shift_id
        `, {
            replacements: { migrationTag: latestMigrationTag },
            transaction: options.transaction
        });

            const [sourceRows] = await sequelize.query(`
            SELECT
                a.resolution_source AS resolution_source,
                COUNT(*) AS count
            FROM (
                SELECT audit.*
                FROM pos_shift_location_backfill_audit audit
                INNER JOIN (
                    SELECT shift_id, MAX(pos_shift_location_backfill_audit_id) AS latest_id
                    FROM pos_shift_location_backfill_audit
                    WHERE migration_tag = :migrationTag
                    GROUP BY shift_id
                ) latest ON latest.latest_id = audit.pos_shift_location_backfill_audit_id
            ) a
            GROUP BY a.resolution_source
        `, {
            replacements: { migrationTag: latestMigrationTag },
            transaction: options.transaction
        });

            const sourceCounts = {};
            sourceRows.forEach((row) => {
                const source = String(row?.resolution_source || '').trim();
                if (!source) return;
                sourceCounts[source] = Number.parseInt(row?.count || 0, 10) || 0;
            });

            const totalShifts = Number.parseInt(summaryRows?.[0]?.total_shifts || 0, 10) || 0;
            const unresolvedCount = Number.parseInt(summaryRows?.[0]?.unresolved_count || 0, 10) || 0;
            const lowConfidenceCount = Number.parseInt(summaryRows?.[0]?.low_confidence_count || 0, 10) || 0;
            const lowConfidenceFromSources = Array.from(LOW_CONFIDENCE_BACKFILL_SOURCES).reduce(
                (acc, source) => acc + (sourceCounts[source] || 0),
                0
            );
            const normalizedLowConfidenceCount = Math.max(lowConfidenceCount, lowConfidenceFromSources);

            return {
                migration_tag: latestMigrationTag,
                total_shifts: totalShifts,
                unresolved_count: unresolvedCount,
                low_confidence_count: normalizedLowConfidenceCount,
                source_counts: sourceCounts,
                ready_for_strict_mode: unresolvedCount === 0 && normalizedLowConfidenceCount === 0
            };
        } catch (error) {
            logger.warn(`[SettingsRepository] Failed to compute POS location binding readiness summary: ${error.message}`);
            return {
                total_shifts: 0,
                unresolved_count: 0,
                low_confidence_count: 0,
                source_counts: {},
                ready_for_strict_mode: false,
                error: 'READINESS_SUMMARY_UNAVAILABLE'
            };
        }
    }
};

assertSettingsRepositoryContract(settingsRepository);
