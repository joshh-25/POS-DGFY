import bcrypt from 'bcryptjs';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const sanitizeTerminalId = (value) => String(value || '').trim().toUpperCase();

const normalizeRegistryEntryForMerge = (entry = {}) => ({
    terminal_id: sanitizeTerminalId(entry?.terminal_id),
    label: String(entry?.label || '').trim(),
    location_id: parsePositiveInt(entry?.location_id),
    is_active: entry?.is_active !== false,
    is_default: entry?.is_default === true,
    terminal_password_hash: String(entry?.terminal_password_hash || '').trim()
});

export const hashTerminalRegistrySecrets = async ({
    incomingEntries = [],
    currentEntries = []
} = {}) => {
    const currentLookup = new Map(
        (Array.isArray(currentEntries) ? currentEntries : [])
            .map((entry) => normalizeRegistryEntryForMerge(entry))
            .filter((entry) => entry.terminal_id)
            .map((entry) => [entry.terminal_id, entry])
    );

    const mergedEntries = [];
    for (const rawEntry of Array.isArray(incomingEntries) ? incomingEntries : []) {
        const entry = normalizeRegistryEntryForMerge(rawEntry);
        if (!entry.terminal_id) continue;

        const existingEntry = currentLookup.get(entry.terminal_id) || null;
        const nextPassword = String(rawEntry?.terminal_password || '').trim();
        const clearPassword = rawEntry?.clear_terminal_password === true;

        if (nextPassword) {
            entry.terminal_password_hash = await bcrypt.hash(nextPassword, 10);
        } else if (clearPassword) {
            entry.terminal_password_hash = '';
        } else if (existingEntry?.terminal_password_hash) {
            entry.terminal_password_hash = existingEntry.terminal_password_hash;
        }

        mergedEntries.push(entry);
    }

    return mergedEntries;
};

