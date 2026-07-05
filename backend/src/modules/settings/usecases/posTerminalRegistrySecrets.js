import crypto from 'crypto';
import {
    sanitizePosSettingsAccessPinForRead,
    sanitizePosSettingsAccessPinSingleSettingForRead
} from './posSettingsAccessPinPolicy.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const sanitizeTerminalId = (value) => String(value || '').trim().toUpperCase();

const normalizeRegistryEntry = (entry = {}) => ({
    terminal_id: sanitizeTerminalId(entry.terminal_id),
    label: String(entry.label || '').trim(),
    location_id: parsePositiveInt(entry.location_id),
    cashier_email: String(entry.cashier_email || '').trim().toLowerCase(),
    is_active: entry.is_active !== false,
    is_default: entry.is_default === true,
    pairing_version: String(entry.pairing_version || '').trim(),
    terminal_password_hash: String(entry.terminal_password_hash || '').trim()
});

export const hashTerminalRegistrySecrets = async ({ incomingEntries = [], currentEntries = [] } = {}) => {
    const currentById = new Map(
        (Array.isArray(currentEntries) ? currentEntries : [])
            .map(normalizeRegistryEntry)
            .filter((entry) => entry.terminal_id)
            .map((entry) => [entry.terminal_id, entry])
    );

    const merged = [];
    for (const rawEntry of Array.isArray(incomingEntries) ? incomingEntries : []) {
        const entry = normalizeRegistryEntry(rawEntry);
        if (!entry.terminal_id) continue;

        const current = currentById.get(entry.terminal_id);
        const bindingChanged = current && (
            Number(current.location_id || 0) !== Number(entry.location_id || 0)
            || current.is_active !== entry.is_active
        );
        entry.pairing_version = !current?.pairing_version || bindingChanged || rawEntry.rotate_pairing === true
            ? crypto.randomUUID()
            : current.pairing_version;
        entry.terminal_password_hash = '';
        merged.push(entry);
    }

    return merged;
};

export const sanitizeTerminalRegistryForRead = (entries = []) => (
    (Array.isArray(entries) ? entries : []).map((entry) => {
        const normalized = normalizeRegistryEntry(entry);
        return {
            terminal_id: normalized.terminal_id,
            label: normalized.label,
            location_id: normalized.location_id,
            cashier_email: normalized.cashier_email,
            is_active: normalized.is_active,
            is_default: normalized.is_default,
            pairing_version: normalized.pairing_version,
            paired_device_ready: Boolean(normalized.pairing_version || normalized.terminal_password_hash)
        };
    })
);

export const sanitizeSettingsPayloadForRead = (settings = {}) => {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
    const sanitized = sanitizePosSettingsAccessPinForRead(settings);
    const registry = settings.pos_terminal_registry;
    if (registry && typeof registry === 'object') {
        sanitized.pos_terminal_registry = {
            ...registry,
            value: sanitizeTerminalRegistryForRead(registry.value)
        };
    }
    return sanitized;
};

export const sanitizeSingleSettingForRead = ({ key, setting }) => {
    if (key === 'pos_settings_access_pin_hash') {
        return sanitizePosSettingsAccessPinSingleSettingForRead({ key, setting });
    }
    if (key !== 'pos_terminal_registry' || !setting || typeof setting !== 'object') return setting;
    return {
        ...setting,
        value: sanitizeTerminalRegistryForRead(setting.value)
    };
};
