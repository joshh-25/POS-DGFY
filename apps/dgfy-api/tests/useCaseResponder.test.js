import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const captureExceptionMock = jest.fn();

jest.unstable_mockModule('@sentry/node', () => ({
  captureException: captureExceptionMock
}));

const isSentryInitializedMock = jest.fn();

jest.unstable_mockModule('../src/config/sentry.js', () => ({
  isSentryInitialized: isSentryInitializedMock
}));

const { ok, fail } = await import('../src/modules/shared/contracts/applicationResult.js');
const { DomainError, DomainErrorCode } = await import('../src/modules/shared/contracts/domainErrors.js');
const { resolveDomainFailure, sendUseCaseResult } = await import('../src/modules/shared/controllers/useCaseResponder.js');

const createMockRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('useCaseResponder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isSentryInitializedMock.mockReturnValue(true);
  });

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

  // This is the single choke point for the 265+ `return fail(...)` use case
  // sites that never throw into Express's error pipeline -- without capture
  // here, a real backend failure answers its caller with a 500 and leaves
  // zero trace in Sentry (see #298).
  describe('Sentry capture on 5xx failures', () => {
    it('captures a 500 domain failure', () => {
      const res = createMockRes();
      const result = fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to list storefront locations'));

      sendUseCaseResult(res, result);

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [capturedError, options] = captureExceptionMock.mock.calls[0];
      expect(capturedError.message).toBe('Failed to list storefront locations');
      expect(options.tags.domain_error_code).toBe(DomainErrorCode.INTERNAL_ERROR);
    });

    it('captures the original cause instead of the stackless DomainError wrapper', () => {
      const res = createMockRes();
      const infraError = new Error('SequelizeConnectionError: Too many connections');
      const result = fail(new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        'Failed to list storefront locations',
        { cause: infraError }
      ));

      sendUseCaseResult(res, result);

      expect(captureExceptionMock).toHaveBeenCalledWith(infraError, expect.anything());
    });

    it('does not capture a 4xx domain failure', () => {
      const res = createMockRes();
      const result = fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Missing field'));

      sendUseCaseResult(res, result);

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('does not capture a success result', () => {
      const res = createMockRes();

      sendUseCaseResult(res, ok({ id: 1 }));

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('does not capture when Sentry is not initialized', () => {
      isSentryInitializedMock.mockReturnValue(false);
      const res = createMockRes();
      const result = fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'boom'));

      sendUseCaseResult(res, result);

      expect(captureExceptionMock).not.toHaveBeenCalled();
    });
  });
});
