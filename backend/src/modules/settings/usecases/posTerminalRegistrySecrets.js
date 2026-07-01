import bcrypt from 'bcryptjs';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const sanitizeTerminalId = (value) => String(value || '').trim().toUpperCase();

const normalizeRegistryEntry = (entry = {}) => ({
    terminal_id: sanitizeTerminalId(entry.terminal_id),
    label: String(entry.label || '').trim(),
    location_id: parsePositiveInt(entry.location_id),
    is_active: entry.is_active !== false,
    is_default: entry.is_default === true,
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
        const nextPassword = String(rawEntry.terminal_password || '');
        if (nextPassword) {
            entry.terminal_password_hash = await bcrypt.hash(nextPassword, 12);
        } else if (rawEntry.clear_terminal_password === true) {
            entry.terminal_password_hash = '';
        } else if (current?.terminal_password_hash) {
            entry.terminal_password_hash = current.terminal_password_hash;
        }
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
            is_active: normalized.is_active,
            is_default: normalized.is_default,
            has_terminal_password: Boolean(normalized.terminal_password_hash)
        };
    })
);

export const sanitizeSettingsPayloadForRead = (settings = {}) => {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
    const sanitized = { ...settings };
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
    if (key !== 'pos_terminal_registry' || !setting || typeof setting !== 'object') return setting;
    return {
        ...setting,
        value: sanitizeTerminalRegistryForRead(setting.value)
    };
};
