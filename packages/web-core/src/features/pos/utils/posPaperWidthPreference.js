import { safeLocalStorageGet, safeLocalStorageSet } from './posTerminalStorage.js';

export const POS_PAPER_WIDTH_STORAGE_PREFIX = 'pos_paper_width_v1:';

const inMemoryPaperWidthPreferences = new Map();

export const normalizePosPaperWidth = (value, fallback = '80mm') => {
    const candidate = String(value || '').trim().toLowerCase();
    if (candidate === '57mm') return '57mm';
    if (candidate === '80mm') return '80mm';
    return String(fallback || '').trim().toLowerCase() === '57mm' ? '57mm' : '80mm';
};

const normalizeTerminalKey = (terminalId) => {
    const normalized = String(terminalId || '').trim().toUpperCase();
    return normalized.replace(/[^A-Z0-9_.-]/g, '_').slice(0, 64) || 'DEFAULT';
};

export const getPosPaperWidthPreferenceKey = (terminalId) => (
    `${POS_PAPER_WIDTH_STORAGE_PREFIX}${normalizeTerminalKey(terminalId)}`
);

export const readPosPaperWidthPreference = (terminalId, fallback = '80mm') => {
    const key = getPosPaperWidthPreferenceKey(terminalId);
    const remembered = inMemoryPaperWidthPreferences.get(key);
    if (remembered) return remembered;

    const stored = normalizePosPaperWidth(safeLocalStorageGet(key), fallback);
    inMemoryPaperWidthPreferences.set(key, stored);
    return stored;
};

export const writePosPaperWidthPreference = (terminalId, value) => {
    const key = getPosPaperWidthPreferenceKey(terminalId);
    const normalized = normalizePosPaperWidth(value);
    inMemoryPaperWidthPreferences.set(key, normalized);
    safeLocalStorageSet(key, normalized);
    return normalized;
};
