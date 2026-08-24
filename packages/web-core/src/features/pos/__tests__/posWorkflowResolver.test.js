import { describe, expect, it } from 'vitest';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';

describe('resolvePosWorkflow', () => {
  it('resolves fnb mode correctly', () => {
    const config = resolvePosWorkflow('fnb');
    expect(config.mode).toBe('fnb');
    expect(config.transactionRecord).toBe('order');
    expect(config.allowedMethods).toEqual(['dine_in', 'takeout', 'pickup', 'delivery']);
    expect(config.capabilities.tables).toBe(true);
    expect(config.capabilities.kitchen).toBe(true);
    expect(config.capabilities.bookings).toBe(false);
  });

  it('resolves services mode correctly', () => {
    const config = resolvePosWorkflow('services');
    expect(config.mode).toBe('services');
    expect(config.transactionRecord).toBe('booking');
    expect(config.allowedMethods).toEqual(['walk_in', 'appointment']);
    expect(config.capabilities.tables).toBe(false);
    expect(config.capabilities.kitchen).toBe(false);
    expect(config.capabilities.bookings).toBe(true);
    expect(config.capabilities.providers).toBe(true);
  });

  it('resolves counter-selling modes to the counter config without dine-in, tables, or kitchen', () => {
    ['retail', 'msme', 'food_manufacturing'].forEach((mode) => {
      const config = resolvePosWorkflow(mode);
      expect(config.mode).toBe('counter');
      expect(config.transactionRecord).toBe('order');
      expect(config.allowedMethods).toEqual(['walk_in', 'pickup', 'delivery']);
      expect(config.allowedMethods).not.toContain('dine_in');
      expect(config.capabilities.tables).toBe(false);
      expect(config.capabilities.kitchen).toBe(false);
      expect(config.capabilities.bookings).toBe(false);
    });
  });

  it('falls back safely for unknown or missing modes', () => {
    // Unknown strings normalize to the msme family, which sells over the counter.
    const configUnknown = resolvePosWorkflow('unknown_mode');
    expect(configUnknown.mode).toBe('counter');

    // An absent mode (still loading) keeps the pre-existing fnb-shaped default.
    const configNull = resolvePosWorkflow(null);
    expect(configNull.mode).toBe('fnb');
  });
});
