import { unwrapApplicationResultOrThrow } from '../src/modules/shared/contracts/applicationResultHelpers.js';

describe('applicationResultHelpers', () => {
  it('returns data for successful application results', () => {
    const value = unwrapApplicationResultOrThrow({
      success: true,
      data: { ok: true }
    });

    expect(value).toEqual({ ok: true });
  });

  it('throws mapped domain error metadata for failure results', () => {
    expect(() => unwrapApplicationResultOrThrow({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Setting not found',
        details: { key: 'timezone' }
      }
    })).toThrow('Setting not found');

    try {
      unwrapApplicationResultOrThrow({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Setting not found',
          details: { key: 'timezone' }
        }
      });
    } catch (error) {
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('RESOURCE_NOT_FOUND');
      expect(error.details).toEqual({ key: 'timezone' });
    }
  });
});
