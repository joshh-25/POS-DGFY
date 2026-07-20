import { describe, expect, it, jest } from '@jest/globals';
import { ok, fail } from '../src/modules/shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { resolveDomainFailure, sendUseCaseResult } from '../src/modules/shared/controllers/useCaseResponder.js';

const createMockRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('useCaseResponder', () => {
  it('maps domain failures to consistent status/message payload', () => {
    const result = fail(new DomainError(
      DomainErrorCode.CONFLICT,
      'Duplicate record',
      { details: { field: 'email' } }
    ));

    const failure = resolveDomainFailure(result);
    expect(failure).toEqual({
      statusCode: 409,
      message: 'Duplicate record',
      details: { field: 'email' },
      code: DomainErrorCode.CONFLICT
    });
  });

  it('sends success responses with custom payload resolver', () => {
    const res = createMockRes();
    const result = ok({ id: 12 });

    sendUseCaseResult(res, result, {
      successPayloadResolver: () => ({
        success: true,
        data: result.data
      })
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 12 }
    });
  });

  it('sends mapped failure response payload by default', () => {
    const res = createMockRes();
    const result = fail(new DomainError(
      DomainErrorCode.AUTHENTICATION_FAILED,
      'Invalid token'
    ));

    sendUseCaseResult(res, result);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid token'
    });
  });
});

