import { describe, expect, it } from 'vitest';
import {
  formatCustomerPhone,
  formatDeliveryCoordinates,
  parseDeliveryCoords
} from '../incomingQueueOrderFormatting.js';

describe('incoming queue delivery contact formatting', () => {
  it('preserves the saved pin at the database contract precision', () => {
    const coords = parseDeliveryCoords({ delivery_latitude: '10.7202', delivery_longitude: '122.5621' });

    expect(formatDeliveryCoordinates(coords)).toBe('10.72020000, 122.56210000');
  });

  it('uses an explicit fallback when the order has no exact pin', () => {
    expect(formatDeliveryCoordinates(parseDeliveryCoords({ delivery_latitude: null, delivery_longitude: null }))).toBe('Not provided');
  });

  it('trims a customer phone and avoids rendering an empty value', () => {
    expect(formatCustomerPhone(' 09171234567 ')).toBe('09171234567');
    expect(formatCustomerPhone('')).toBe('Not provided');
  });
});
