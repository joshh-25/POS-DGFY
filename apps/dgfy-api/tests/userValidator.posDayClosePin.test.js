import { describe, expect, it, jest } from '@jest/globals';
import {
  updatePosDayClosePinSchema,
  validateUpdatePosDayClosePin
} from '../src/validators/userValidator.js';

describe('POS Day Close PIN validator', () => {
  it('accepts a numeric PIN or the clear command', () => {
    expect(updatePosDayClosePinSchema.validate({ pin: '2468' }).error).toBeUndefined();
    expect(updatePosDayClosePinSchema.validate({ clear: true }).error).toBeUndefined();
  });

  it('rejects invalid PIN payloads', () => {
    expect(updatePosDayClosePinSchema.validate({ pin: 'abc' }).error).toBeDefined();
    expect(updatePosDayClosePinSchema.validate({ pin: '2468', clear: true }).error).toBeDefined();
    expect(updatePosDayClosePinSchema.validate({}).error).toBeDefined();
  });

  it('normalizes valid middleware input and returns validation errors for invalid input', () => {
    const next = jest.fn();
    const validRequest = { body: { pin: '2468' } };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    validateUpdatePosDayClosePin(validRequest, response, next);

    expect(validRequest.validatedData).toEqual({ pin: '2468' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();

    const invalidNext = jest.fn();
    const invalidRequest = { body: { pin: '12' } };
    validateUpdatePosDayClosePin(invalidRequest, response, invalidNext);

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Validation failed'
    }));
    expect(invalidNext).not.toHaveBeenCalled();
  });
});
