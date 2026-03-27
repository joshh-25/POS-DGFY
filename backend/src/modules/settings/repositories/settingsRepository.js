import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertSettingsRepositoryContract } from '../contracts/settingsRepository.contract.js';

const parseSettingValue = (setting) => {
    let value = setting.setting_value;

    if (setting.data_type === 'number') {
        value = parseFloat(value);
    } else if (setting.data_type === 'boolean') {
        value = value === 'true' || value === '1';
    } else if (setting.data_type === 'json') {
        try {
            value = JSON.parse(value);
        } catch {
            value = null;
        }
    }

    return value;
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
        settings.forEach((setting) => {
            settingsObject[setting.setting_key] = {
                value: parseSettingValue(setting),
                data_type: setting.data_type,
                description: setting.description,
                updated_at: setting.updated_at
            };
        });

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

        return {
            setting_id: setting.setting_id,
            setting_key: setting.setting_key,
            value: parseSettingValue(setting),
            data_type: setting.data_type,
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
                let setting = await SystemSetting.findOne({
                    where: { setting_key: key }
                });

                if (!setting) {
                    const data_type = inferDataType(value);
                    setting = await SystemSetting.create({
                        setting_key: key,
                        setting_value: serializeSettingValue({ data_type }, value),
                        data_type,
                        description: `Auto-created by settings update flow for key '${key}'`
                    });
                } else {
                    updatePromises.push(
                        setting.update({ setting_value: serializeSettingValue(setting, value) })
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
        let setting = await SystemSetting.findOne({
            where: { setting_key: key }
        });

        if (!setting) {
            const data_type = inferDataType(value);
            setting = await SystemSetting.create({
                setting_key: key,
                setting_value: serializeSettingValue({ data_type }, value),
                data_type,
                description: `Auto-created by settings update flow for key '${key}'`
            });
        } else {
            await setting.update({ setting_value: serializeSettingValue(setting, value) });
        }

        return {
            setting_id: setting.setting_id,
            setting_key: setting.setting_key,
            value,
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
