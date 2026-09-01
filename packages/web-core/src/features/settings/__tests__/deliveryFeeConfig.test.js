import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DELIVERY_FEE_CALC,
  normalizeDeliveryFeeCalcSettings,
  normalizeDeliveryFeeMode,
  serializeDeliveryFeeCalcForSave
} from '../deliveryFeeConfig.js';

describe('normalizeDeliveryFeeMode', () => {
  it('accepts a known mode, case/whitespace-insensitive', () => {
    expect(normalizeDeliveryFeeMode(' Calculated ')).toBe('calculated');
    expect(normalizeDeliveryFeeMode('FREE')).toBe('free');
  });

  it('falls back to fixed for anything unknown, missing, or malformed', () => {
    expect(normalizeDeliveryFeeMode('provider_quoted')).toBe('fixed');
    expect(normalizeDeliveryFeeMode(undefined)).toBe('fixed');
    expect(normalizeDeliveryFeeMode(null)).toBe('fixed');
    expect(normalizeDeliveryFeeMode(42)).toBe('fixed');
  });
});

describe('normalizeDeliveryFeeCalcSettings', () => {
  it('returns the default blob for anything not a plain object', () => {
    expect(normalizeDeliveryFeeCalcSettings(null)).toEqual(DEFAULT_DELIVERY_FEE_CALC);
    expect(normalizeDeliveryFeeCalcSettings(undefined)).toEqual(DEFAULT_DELIVERY_FEE_CALC);
    expect(normalizeDeliveryFeeCalcSettings([1, 2, 3])).toEqual(DEFAULT_DELIVERY_FEE_CALC);
  });

  it('hydrates a well-formed blob into form-friendly strings', () => {
    expect(normalizeDeliveryFeeCalcSettings({
      min_fee: 50,
      included_km: 3,
      per_km_rate: 10,
      increment_km: 0.5,
      max_distance_km: 15
    })).toEqual({
      min_fee: '50',
      included_km: '3',
      per_km_rate: '10',
      increment_km: '0.5',
      max_distance_km: '15'
    });
  });

  it('hydrates field-by-field, not all-or-nothing, for a partially-filled blob', () => {
    expect(normalizeDeliveryFeeCalcSettings({ min_fee: 50, included_km: null })).toEqual({
      min_fee: '50',
      included_km: '',
      per_km_rate: '',
      increment_km: '',
      max_distance_km: ''
    });
  });
});

describe('serializeDeliveryFeeCalcForSave', () => {
  const validCalc = {
    min_fee: '50',
    included_km: '3',
    per_km_rate: '10',
    increment_km: '0.5',
    max_distance_km: '15'
  };

  it('serializes a fully-populated, valid formula to numbers', () => {
    expect(serializeDeliveryFeeCalcForSave(validCalc)).toEqual({
      min_fee: 50,
      included_km: 3,
      per_km_rate: 10,
      increment_km: 0.5,
      max_distance_km: 15
    });
  });

  it('returns undefined when any field is missing', () => {
    expect(serializeDeliveryFeeCalcForSave({ ...validCalc, per_km_rate: '' })).toBeUndefined();
  });

  it('returns undefined when increment_km or max_distance_km is zero (must be > 0)', () => {
    expect(serializeDeliveryFeeCalcForSave({ ...validCalc, increment_km: '0' })).toBeUndefined();
    expect(serializeDeliveryFeeCalcForSave({ ...validCalc, max_distance_km: '0' })).toBeUndefined();
  });

  it('returns undefined when max_distance_km is less than included_km', () => {
    expect(serializeDeliveryFeeCalcForSave({ ...validCalc, included_km: '20', max_distance_km: '15' })).toBeUndefined();
  });

  it('accepts max_distance_km equal to included_km', () => {
    expect(serializeDeliveryFeeCalcForSave({ ...validCalc, included_km: '15', max_distance_km: '15' }))
      .toEqual({ min_fee: 50, included_km: 15, per_km_rate: 10, increment_km: 0.5, max_distance_km: 15 });
  });

  it('returns undefined for a non-object', () => {
    expect(serializeDeliveryFeeCalcForSave(null)).toBeUndefined();
    expect(serializeDeliveryFeeCalcForSave('50')).toBeUndefined();
  });
});
