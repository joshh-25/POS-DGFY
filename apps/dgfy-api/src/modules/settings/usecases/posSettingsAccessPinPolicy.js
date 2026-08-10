import bcrypt from 'bcryptjs';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const POS_SETTINGS_ACCESS_PIN_HASH_KEY = 'pos_settings_access_pin_hash';
export const POS_SETTINGS_ACCESS_PIN_ENABLED_KEY = 'pos_settings_access_pin_enabled';
const POS_SETTINGS_ACCESS_PIN_PATTERN = /^[0-9]{4,12}$/;

const normalizePin = (value = '') => String(value || '').trim();

export const sanitizePosSettingsAccessPinForRead = (settings = {}) => {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
    const sanitized = { ...settings };
    const pinHashSetting = settings[POS_SETTINGS_ACCESS_PIN_HASH_KEY] || null;
    const pinHash = String(pinHashSetting?.value || pinHashSetting?.setting_value || '').trim();
    sanitized[POS_SETTINGS_ACCESS_PIN_ENABLED_KEY] = {
        value: Boolean(pinHash),
        data_type: 'boolean',
        description: 'Runtime indicator that a POS Settings access PIN is configured.',
        source: pinHashSetting ? 'tenant' : 'runtime',
        updated_at: pinHashSetting?.updated_at || null
    };
    delete sanitized[POS_SETTINGS_ACCESS_PIN_HASH_KEY];
    return sanitized;
};

export const sanitizePosSettingsAccessPinSingleSettingForRead = ({ key, setting }) => {
    if (key !== POS_SETTINGS_ACCESS_PIN_HASH_KEY) return setting;
    const pinHash = String(setting?.value || setting?.setting_value || '').trim();
    return {
        setting_key: POS_SETTINGS_ACCESS_PIN_ENABLED_KEY,
        value: Boolean(pinHash),
        data_type: 'boolean',
        description: 'Runtime indicator that a POS Settings access PIN is configured.',
        source: setting ? 'tenant' : 'runtime',
        updated_at: setting?.updated_at || null
    };
};

export const assertPosSettingsAccessPinAuthorization = ({ actorUser = null, settingsData = {} } = {}) => {
    const touchesPin = Object.prototype.hasOwnProperty.call(settingsData, 'pos_settings_access_pin')
        || Object.prototype.hasOwnProperty.call(settingsData, 'clear_pos_settings_access_pin')
        || Object.prototype.hasOwnProperty.call(settingsData, POS_SETTINGS_ACCESS_PIN_HASH_KEY);

    if (!touchesPin) return;
    if (actorUser?.is_master_admin === true) return;

    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'Only master admin can change the POS Settings access PIN.',
        { statusCode: 403 }
    );
};

export const resolvePosSettingsAccessPinPatch = async ({
    settingsData = {},
    currentHash = ''
} = {}) => {
    if (!settingsData || typeof settingsData !== 'object' || Array.isArray(settingsData)) return settingsData;

    const nextSettingsData = { ...settingsData };
    const nextPin = normalizePin(nextSettingsData.pos_settings_access_pin);
    const clearPin = nextSettingsData.clear_pos_settings_access_pin === true;

    delete nextSettingsData.pos_settings_access_pin;
    delete nextSettingsData.clear_pos_settings_access_pin;

    if (!nextPin && !clearPin && !Object.prototype.hasOwnProperty.call(nextSettingsData, POS_SETTINGS_ACCESS_PIN_HASH_KEY)) {
        return nextSettingsData;
    }

    if (nextPin) {
        if (!POS_SETTINGS_ACCESS_PIN_PATTERN.test(nextPin)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'POS Settings access PIN must be 4 to 12 digits.',
                { statusCode: 422 }
            );
        }
        nextSettingsData[POS_SETTINGS_ACCESS_PIN_HASH_KEY] = await bcrypt.hash(nextPin, 10);
        return nextSettingsData;
    }

    if (clearPin) {
        nextSettingsData[POS_SETTINGS_ACCESS_PIN_HASH_KEY] = '';
        return nextSettingsData;
    }

    nextSettingsData[POS_SETTINGS_ACCESS_PIN_HASH_KEY] = String(nextSettingsData[POS_SETTINGS_ACCESS_PIN_HASH_KEY] || currentHash || '').trim();
    return nextSettingsData;
};

export const verifyPosSettingsAccessPin = async ({ pin = '', currentHash = '' } = {}) => {
    const normalizedPin = normalizePin(pin);
    const normalizedHash = String(currentHash || '').trim();

    if (!normalizedHash) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'POS Settings access PIN is not configured.',
            { statusCode: 422 }
        );
    }
    if (!normalizedPin) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'POS Settings access PIN is required.',
            { statusCode: 422 }
        );
    }

    const matches = await bcrypt.compare(normalizedPin, normalizedHash);
    if (!matches) {
        throw new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'POS Settings access PIN is incorrect.',
            { statusCode: 401 }
        );
    }

    return true;
};
