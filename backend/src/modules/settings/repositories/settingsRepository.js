import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertSettingsRepositoryContract } from '../contracts/settingsRepository.contract.js';
import logger from '../../../config/logger.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';

const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery', 'online'];
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const ORDER_METHOD_DEFAULT_LABELS = {
    dine_in: 'Dine In Fee',
    takeout: 'Takeout Fee',
    pickup: 'Pickup Fee',
    delivery: 'Delivery Fee',
    online: 'Online Fee'
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
            is_active: isActive,
            is_default: isActive && parseBooleanLike(entry?.is_default)
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
    return value;
};

const POS_JSON_SETTING_KEYS = new Set(['pos_discount_profiles', 'pos_order_method_fees', 'pos_terminal_registry']);

const shouldRepairPosJsonSetting = (setting, parsedValue) => {
    if (!POS_JSON_SETTING_KEYS.has(setting.setting_key)) return false;
    if (setting.data_type !== 'json') return true;

    const expectedSerialized = JSON.stringify(normalizeValueForSettingKey(setting.setting_key, parsedValue));
    return setting.setting_value !== expectedSerialized;
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
                value: parsedValue,
                data_type: setting.data_type,
                description: setting.description,
                updated_at: setting.updated_at
            };

            if (shouldRepairPosJsonSetting(setting, parsedValue)) {
                repairPromises.push(
                    setting.update({
                        data_type: 'json',
                        setting_value: JSON.stringify(normalizeValueForSettingKey(setting.setting_key, parsedValue))
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
        if (shouldRepairPosJsonSetting(setting, parsedValue)) {
            try {
                await setting.update({
                    data_type: 'json',
                    setting_value: JSON.stringify(normalizeValueForSettingKey(setting.setting_key, parsedValue))
                });
                repaired = true;
            } catch (error) {
                logger.warn(`[SettingsRepository] Failed to repair malformed setting ${setting.setting_key}: ${error.message}`);
            }
        }

        return {
            setting_id: setting.setting_id,
            setting_key: setting.setting_key,
            value: parsedValue,
            data_type: repaired ? 'json' : setting.data_type,
            description: setting.description,
            updated_at: setting.updated_at
        };
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
            value: normalizedValue,
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
    }
};

assertSettingsRepositoryContract(settingsRepository);
