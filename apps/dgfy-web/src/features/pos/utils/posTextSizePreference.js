export const POS_TEXT_SIZE_STORAGE_KEY = 'dgfy.pos.text-size.v1';

export const POS_TEXT_SIZE_LEVELS = Object.freeze({
    NORMAL: 'normal',
    LARGE: 'large',
    EXTRA_LARGE: 'extra-large'
});

export const DEFAULT_POS_TEXT_SIZE = POS_TEXT_SIZE_LEVELS.NORMAL;

export const POS_TEXT_SIZE_OPTIONS = Object.freeze([
    Object.freeze({
        value: POS_TEXT_SIZE_LEVELS.NORMAL,
        scale: 1
    }),
    Object.freeze({
        value: POS_TEXT_SIZE_LEVELS.LARGE,
        scale: 1.15
    }),
    Object.freeze({
        value: POS_TEXT_SIZE_LEVELS.EXTRA_LARGE,
        scale: 1.3
    })
]);

const POS_TEXT_SIZE_VALUES = new Set(
    POS_TEXT_SIZE_OPTIONS.map(({ value }) => value)
);

const resolveStorage = (storage) => {
    if (storage !== undefined) return storage;
    if (typeof window === 'undefined') return null;

    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

export const normalizePosTextSize = (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return POS_TEXT_SIZE_VALUES.has(normalized)
        ? normalized
        : DEFAULT_POS_TEXT_SIZE;
};

export const getPosTextSizeScale = (value) => {
    const normalized = normalizePosTextSize(value);
    return POS_TEXT_SIZE_OPTIONS.find(({ value: optionValue }) => optionValue === normalized)?.scale
        || POS_TEXT_SIZE_OPTIONS[0].scale;
};

export const readPosTextSizePreference = (storage) => {
    const resolvedStorage = resolveStorage(storage);
    if (!resolvedStorage || typeof resolvedStorage.getItem !== 'function') {
        return DEFAULT_POS_TEXT_SIZE;
    }

    try {
        return normalizePosTextSize(resolvedStorage.getItem(POS_TEXT_SIZE_STORAGE_KEY));
    } catch {
        // A storage failure must never prevent the POS from starting.
        return DEFAULT_POS_TEXT_SIZE;
    }
};

export const writePosTextSizePreference = (value, storage) => {
    const normalized = normalizePosTextSize(value);
    const resolvedStorage = resolveStorage(storage);

    if (!resolvedStorage || typeof resolvedStorage.setItem !== 'function') {
        return normalized;
    }

    try {
        resolvedStorage.setItem(POS_TEXT_SIZE_STORAGE_KEY, normalized);
    } catch {
        // The display preference is a convenience; POS operation remains authoritative.
    }

    return normalized;
};
