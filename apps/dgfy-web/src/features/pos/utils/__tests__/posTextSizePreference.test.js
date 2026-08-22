import { describe, expect, it } from 'vitest';
import {
    DEFAULT_POS_TEXT_SIZE,
    POS_TEXT_SIZE_LEVELS,
    POS_TEXT_SIZE_OPTIONS,
    POS_TEXT_SIZE_STORAGE_KEY,
    getPosTextSizeScale,
    normalizePosTextSize,
    readPosTextSizePreference,
    writePosTextSizePreference
} from '../posTextSizePreference.js';

const createStorage = (initialValue = null) => {
    let value = initialValue;

    return {
        getItem: () => value,
        setItem: (_key, nextValue) => {
            value = nextValue;
        }
    };
};

describe('POS text-size preference', () => {
    it('exposes the three supported device-friendly levels and their scales', () => {
        expect(POS_TEXT_SIZE_OPTIONS).toEqual([
            { value: POS_TEXT_SIZE_LEVELS.NORMAL, scale: 1 },
            { value: POS_TEXT_SIZE_LEVELS.LARGE, scale: 1.15 },
            { value: POS_TEXT_SIZE_LEVELS.EXTRA_LARGE, scale: 1.3 }
        ]);
    });

    it('normalizes valid values and falls back safely for unknown values', () => {
        expect(normalizePosTextSize(' LARGE ')).toBe(POS_TEXT_SIZE_LEVELS.LARGE);
        expect(normalizePosTextSize(POS_TEXT_SIZE_LEVELS.EXTRA_LARGE)).toBe(
            POS_TEXT_SIZE_LEVELS.EXTRA_LARGE
        );
        expect(normalizePosTextSize('unsupported')).toBe(DEFAULT_POS_TEXT_SIZE);
        expect(normalizePosTextSize(null)).toBe(DEFAULT_POS_TEXT_SIZE);
    });

    it('resolves the stable display scale used by layout measurements', () => {
        expect(getPosTextSizeScale(POS_TEXT_SIZE_LEVELS.NORMAL)).toBe(1);
        expect(getPosTextSizeScale(POS_TEXT_SIZE_LEVELS.LARGE)).toBe(1.15);
        expect(getPosTextSizeScale(POS_TEXT_SIZE_LEVELS.EXTRA_LARGE)).toBe(1.3);
        expect(getPosTextSizeScale('unknown')).toBe(1);
    });

    it('reads and writes only the validated preference value', () => {
        const storage = createStorage();

        expect(readPosTextSizePreference(storage)).toBe(DEFAULT_POS_TEXT_SIZE);
        expect(writePosTextSizePreference('large', storage)).toBe(POS_TEXT_SIZE_LEVELS.LARGE);
        expect(readPosTextSizePreference(storage)).toBe(POS_TEXT_SIZE_LEVELS.LARGE);
        expect(writePosTextSizePreference('not-a-level', storage)).toBe(DEFAULT_POS_TEXT_SIZE);
        expect(readPosTextSizePreference(storage)).toBe(DEFAULT_POS_TEXT_SIZE);
    });

    it('uses the versioned POS key when persisting the preference', () => {
        const writes = [];
        const storage = {
            getItem: () => POS_TEXT_SIZE_LEVELS.NORMAL,
            setItem: (key, value) => writes.push([key, value])
        };

        writePosTextSizePreference(POS_TEXT_SIZE_LEVELS.EXTRA_LARGE, storage);

        expect(writes).toEqual([[POS_TEXT_SIZE_STORAGE_KEY, POS_TEXT_SIZE_LEVELS.EXTRA_LARGE]]);
    });

    it('falls back without throwing when browser storage is unavailable', () => {
        const storage = {
            getItem: () => {
                throw new Error('storage blocked');
            },
            setItem: () => {
                throw new Error('storage blocked');
            }
        };

        expect(readPosTextSizePreference(storage)).toBe(DEFAULT_POS_TEXT_SIZE);
        expect(writePosTextSizePreference(POS_TEXT_SIZE_LEVELS.LARGE, storage)).toBe(
            POS_TEXT_SIZE_LEVELS.LARGE
        );
    });
});
