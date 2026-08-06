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

  it('falls back safely for unknown or missing modes', () => {
    const configUnknown = resolvePosWorkflow('unknown_mode');
    expect(configUnknown.mode).toBe('fnb');

    const configNull = resolvePosWorkflow(null);
    expect(configNull.mode).toBe('fnb');
  });
});
