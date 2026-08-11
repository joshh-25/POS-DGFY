import { describe, expect, it, jest } from '@jest/globals';
import {
  updatePosDayClosePinSchema,
  validateUpdatePosDayClosePin
} from '../src/validators/userValidator.js';

describe('POS Day Close PIN validator', () => {
  it('accepts only the clear command for Master Admin recovery', () => {
    expect(updatePosDayClosePinSchema.validate({ clear: true }).error).toBeUndefined();
  });

  it('rejects PIN assignment and invalid reset payloads', () => {
    expect(updatePosDayClosePinSchema.validate({ pin: 'abc' }).error).toBeDefined();
    expect(updatePosDayClosePinSchema.validate({ pin: '2468' }).error).toBeDefined();
    expect(updatePosDayClosePinSchema.validate({ pin: '2468', clear: true }).error).toBeDefined();
    expect(updatePosDayClosePinSchema.validate({ clear: false }).error).toBeDefined();
    expect(updatePosDayClosePinSchema.validate({}).error).toBeDefined();
  });

  it('normalizes valid middleware input and returns validation errors for invalid input', () => {
    const next = jest.fn();
    const validRequest = { body: { clear: true } };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    validateUpdatePosDayClosePin(validRequest, response, next);

    expect(validRequest.validatedData).toEqual({ clear: true });
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();

    const invalidNext = jest.fn();
    const invalidRequest = { body: { pin: '2468' } };
    validateUpdatePosDayClosePin(invalidRequest, response, invalidNext);

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Validation failed'
    }));
    expect(invalidNext).not.toHaveBeenCalled();
  });
});
