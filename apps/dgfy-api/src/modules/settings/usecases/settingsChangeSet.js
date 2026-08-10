const normalizeComparable = (value) => {
    if (value === undefined) return null;
    if (value === null) return null;
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeComparable(entry));
    }
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                acc[key] = normalizeComparable(value[key]);
                return acc;
            }, {});
    }
    return value;
};

const comparableToken = (value) => JSON.stringify(normalizeComparable(value));

const CREATE_DEFAULT_VALUES_BY_KEY = {
    pos_fiscal_buyer_details_required: false
};

const isBlankCreateValue = (key, value) => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (
        Object.prototype.hasOwnProperty.call(CREATE_DEFAULT_VALUES_BY_KEY, key)
        && comparableToken(CREATE_DEFAULT_VALUES_BY_KEY[key]) === comparableToken(value)
    ) {
        return true;
    }
    return false;
};

export const resolveChangedSettingKeys = async ({ settingsRepository, settingsData = {} }) => {
    const keys = Object.keys(settingsData || {});
    if (keys.length === 0 || typeof settingsRepository?.getSettingsByKeys !== 'function') {
        return keys;
    }

    const currentSettings = await settingsRepository.getSettingsByKeys(keys);
    return keys.filter((key) => {
        const current = currentSettings?.[key];
        const nextValue = settingsData[key];
        if (!current) {
            return !isBlankCreateValue(key, nextValue);
        }

        return comparableToken(current.value) !== comparableToken(nextValue);
    });
};
