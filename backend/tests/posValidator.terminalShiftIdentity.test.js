import { jest } from '@jest/globals';
import {
  validateOpenTerminalShift,
  validateSwitchTerminalShiftLocation
} from '../src/validators/posValidator.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('POS open shift validator terminal identity', () => {
  it('requires terminal_id in open shift payload', () => {
    const req = { body: { opening_float_amount: 100 } };
    const res = createRes();
    const next = jest.fn();

    validateOpenTerminalShift(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('accepts valid terminal_id in open shift payload', () => {
    const req = {
      body: {
        terminal_id: 'COUNTER-01',
        opening_float_amount: 200
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateOpenTerminalShift(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.terminal_id).toBe('COUNTER-01');
  });

  it('requires target location and reason for shift location switch payload', () => {
    const req = { body: { target_location_id: null, reason: 'short' } };
    const res = createRes();
    const next = jest.fn();

    validateSwitchTerminalShiftLocation(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('accepts valid shift location switch payload', () => {
    const req = {
      body: {
        idempotency_key: 'switch-2026-04-21-001',
        target_location_id: 3,
        reason: 'Relieving teammate for lunch coverage'
      }
    };
    const res = createRes();
    const next = jest.fn();

    validateSwitchTerminalShiftLocation(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.validatedData.target_location_id).toBe(3);
  });
});
