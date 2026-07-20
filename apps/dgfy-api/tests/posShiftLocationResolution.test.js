import { describe, expect, it } from '@jest/globals';
import {
    resolveShiftLocationCandidate,
    shiftLocationResolution
} from '../src/modules/pos/utils/shiftLocationResolution.js';

describe('POS shift-location resolution policy', () => {
    it('prioritizes unique transaction location', () => {
        const result = resolveShiftLocationCandidate({
            txDistinctLocationCount: 1,
            txLocationId: 9,
            terminalHomeLocationId: 5,
            tenantPrimaryLocationId: 2,
            activeLocationFallbackId: 3
        });

        expect(result).toEqual({
            resolvedLocationId: 9,
            resolutionSource: 'transaction_unique_location',
            resolutionReason: 'TX_UNIQUE_LOCATION'
        });
    });

    it('falls back to terminal home when transaction location is ambiguous', () => {
        const result = resolveShiftLocationCandidate({
            txDistinctLocationCount: 2,
            txLocationId: 9,
            terminalHomeLocationId: 5,
            tenantPrimaryLocationId: 2
        });

        expect(result.resolvedLocationId).toBe(5);
        expect(result.resolutionSource).toBe('terminal_home_location');
    });

    it('falls back to tenant primary then active fallback', () => {
        const tenantPrimary = resolveShiftLocationCandidate({
            txDistinctLocationCount: 0,
            terminalHomeLocationId: null,
            tenantPrimaryLocationId: 2,
            activeLocationFallbackId: 3
        });
        const activeFallback = resolveShiftLocationCandidate({
            txDistinctLocationCount: 0,
            terminalHomeLocationId: null,
            tenantPrimaryLocationId: null,
            activeLocationFallbackId: 3
        });

        expect(tenantPrimary.resolutionSource).toBe('tenant_primary_location');
        expect(tenantPrimary.resolvedLocationId).toBe(2);
        expect(activeFallback.resolutionSource).toBe('active_location_fallback');
        expect(activeFallback.resolvedLocationId).toBe(3);
    });

    it('returns no_resolution when no candidate exists', () => {
        const result = resolveShiftLocationCandidate({});
        expect(result.resolutionSource).toBe('no_resolution');
        expect(result.resolvedLocationId).toBeNull();
        expect(shiftLocationResolution.LOW_CONFIDENCE_RESOLUTION_SOURCES.has(result.resolutionSource)).toBe(true);
    });
});
