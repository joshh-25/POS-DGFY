export const parsePosCashierAttendanceFeatureValue = (setting) => {
    if (!setting) return null;
    const raw = setting.setting_value ?? setting.value ?? setting.get?.('setting_value') ?? setting;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'boolean') return { enabled: raw, location_ids: [] };
    const text = String(raw ?? '').trim();
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return parsed;
        if (typeof parsed === 'boolean') return { enabled: parsed, location_ids: [] };
    } catch {
        // Legacy/manual setting values may be plain boolean strings.
    }
    return { enabled: ['1', 'true', 'yes', 'on'].includes(text.toLowerCase()), location_ids: [] };
};

export const normalizePosCashierAttendanceLocationIds = (value) => (
    Array.isArray(value)
        ? value.map((entry) => Number.parseInt(entry, 10)).filter((entry) => Number.isInteger(entry) && entry > 0)
        : []
);
