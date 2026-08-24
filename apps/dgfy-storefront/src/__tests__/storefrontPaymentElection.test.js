import { describe, expect, it } from 'vitest';
import {
  PAYMENT_ELECTION_DOWNPAYMENT,
  PAYMENT_ELECTION_FULL,
  PAYMENT_ELECTION_OPTIONS,
  resolvePaymentElection
} from '../shared/model/storefrontPaymentElection.js';

// Phase 150 (#866).
describe('resolvePaymentElection', () => {
  it('forces "downpayment" for a downpayment_required store, regardless of the elected value', () => {
    expect(resolvePaymentElection({ payment_mode: 'downpayment_required' }, 'full')).toBe(PAYMENT_ELECTION_DOWNPAYMENT);
    expect(resolvePaymentElection({ payment_mode: 'downpayment_required' }, undefined)).toBe(PAYMENT_ELECTION_DOWNPAYMENT);
  });

  it('forces "full" for a full_payment store, regardless of the elected value', () => {
    expect(resolvePaymentElection({ payment_mode: 'full_payment' }, 'downpayment')).toBe(PAYMENT_ELECTION_FULL);
    expect(resolvePaymentElection({ payment_mode: 'full_payment' }, undefined)).toBe(PAYMENT_ELECTION_FULL);
  });

  it('respects the elected value under customer_choice', () => {
    expect(resolvePaymentElection({ payment_mode: 'customer_choice' }, 'downpayment')).toBe(PAYMENT_ELECTION_DOWNPAYMENT);
    expect(resolvePaymentElection({ payment_mode: 'customer_choice' }, 'full')).toBe(PAYMENT_ELECTION_FULL);
  });

  it('defaults to "full" under customer_choice when nothing has been elected yet', () => {
    expect(resolvePaymentElection({ payment_mode: 'customer_choice' }, undefined)).toBe(PAYMENT_ELECTION_FULL);
    expect(resolvePaymentElection({ payment_mode: 'customer_choice' }, null)).toBe(PAYMENT_ELECTION_FULL);
  });

  it('defaults to "full" under customer_choice for a garbage elected value -- never guesses a split', () => {
    expect(resolvePaymentElection({ payment_mode: 'customer_choice' }, 'not_a_real_choice')).toBe(PAYMENT_ELECTION_FULL);
  });

  it('defaults to "full" when selectedStore is null/missing', () => {
    expect(resolvePaymentElection(null, 'downpayment')).toBe(PAYMENT_ELECTION_FULL);
    expect(resolvePaymentElection(undefined, 'downpayment')).toBe(PAYMENT_ELECTION_FULL);
  });
});

describe('PAYMENT_ELECTION_OPTIONS', () => {
  it('offers exactly the two options, full first', () => {
    expect(PAYMENT_ELECTION_OPTIONS.map((option) => option.value)).toEqual([PAYMENT_ELECTION_FULL, PAYMENT_ELECTION_DOWNPAYMENT]);
  });

  it('every option carries a label and description', () => {
    PAYMENT_ELECTION_OPTIONS.forEach((option) => {
      expect(typeof option.label).toBe('string');
      expect(option.label.length).toBeGreaterThan(0);
      expect(typeof option.description).toBe('string');
      expect(option.description.length).toBeGreaterThan(0);
    });
  });
});
