import { describe, expect, it } from 'vitest';
import { calculateCatalogGridCapacity } from '../utils/catalogGridCapacity.js';

describe('calculateCatalogGridCapacity', () => {
    it('fills every complete card slot in the measured viewport', () => {
        expect(calculateCatalogGridCapacity({
            width: 760,
            height: 544,
            minimumCardWidth: 176,
            cardHeight: 176,
            gap: 8
        })).toEqual({ columns: 4, rows: 3, pageSize: 12 });
    });

    it('adapts capacity when the available width or height changes', () => {
        expect(calculateCatalogGridCapacity({
            width: 560,
            height: 360,
            minimumCardWidth: 176,
            cardHeight: 176,
            gap: 8
        })).toEqual({ columns: 3, rows: 2, pageSize: 6 });
    });

    it('always leaves one usable slot for very small containers', () => {
        expect(calculateCatalogGridCapacity({
            width: 80,
            height: 80,
            minimumCardWidth: 176,
            cardHeight: 176,
            gap: 8
        })).toEqual({ columns: 1, rows: 1, pageSize: 1 });
    });
});
