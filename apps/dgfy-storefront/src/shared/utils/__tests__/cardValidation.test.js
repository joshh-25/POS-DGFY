import { describe, expect, it, vi } from 'vitest';
import { startStorefrontDirectCardPayment } from '../../services/storefrontOnlinePaymentSession.js';
import {
  formatCardNumber,
  getCardFieldErrors,
  passesCardNumberChecksum,
  stripCardNumberFormatting,
  validateCardNumber
} from '../cardValidation.js';

describe('card number validation', () => {
  it('formats numeric input into readable groups and caps the field at 19 digits', () => {
    expect(formatCardNumber('4242abc4242 4242 4242 9999')).toBe('4242 4242 4242 4242 999');
  });

  it('accepts a valid PayMongo test card number', () => {
    expect(validateCardNumber('4242 4242 4242 4242')).toBe('');
    expect(passesCardNumberChecksum('4343434343434345')).toBe(true);
  });

  it.each([
    ['too short', '424242424242'],
    ['too long', '42424242424242424242'],
    ['bad checksum', '4242424242424243']
  ])('rejects %s card numbers', (_label, value) => {
    expect(validateCardNumber(value)).toMatch(/valid card number/i);
  });

  it('strips formatting before the PayMongo request', () => {
    expect(stripCardNumberFormatting('4242 4242 4242 4242')).toBe('4242424242424242');
  });

  it('returns field-specific errors for invalid card form input', () => {
    expect(getCardFieldErrors({
      cardholder: '',
      cardNumber: '4242 4242 4242 4243',
      expiration: '13/24',
      cvc: '12'
    }, new Date('2026-08-18T00:00:00Z'))).toEqual({
      cardNumber: 'Enter a valid card number.',
      expiration: 'Enter a valid card expiry month.',
      cvc: 'Enter a valid card security code.',
      cardholder: 'Enter the cardholder name.'
    });
  });

  it('returns no field errors for valid card form input', () => {
    expect(getCardFieldErrors({
      cardholder: 'Test Customer',
      cardNumber: '4242 4242 4242 4242',
      expiration: '12/30',
      cvc: '123'
    }, new Date('2026-08-18T00:00:00Z'))).toEqual({});
  });

  it('blocks an invalid number before contacting PayMongo', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    try {
      await expect(startStorefrontDirectCardPayment({
        cardDetails: {
          cardholder: 'Test Customer',
          cardNumber: '4242 4242 4242 4243',
          expiration: '12/30',
          cvc: '123'
        },
        paymentSession: {
          payment_flow: 'direct_card',
          payment_method: 'card'
        }
      })).rejects.toThrow('Enter a valid card number.');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
