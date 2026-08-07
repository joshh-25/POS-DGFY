import { jest } from '@jest/globals';
import logger from '../src/config/logger.js';
import { errorHandler, shouldLogStackToConsole } from '../src/middleware/errorHandler.js';

const createMockResponse = () => {
  const res = {
    locals: {},
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('errorHandler stack logging policy', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ERROR_LOG_STACKS;

  beforeEach(() => {
    delete process.env.ERROR_LOG_STACKS;
    process.env.NODE_ENV = 'test';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ERROR_LOG_STACKS = originalFlag;
  });

  test('shouldLogStackToConsole defaults to false in test', () => {
    expect(shouldLogStackToConsole()).toBe(false);
  });

  test('shouldLogStackToConsole defaults to true in development', () => {
    process.env.NODE_ENV = 'development';
    expect(shouldLogStackToConsole()).toBe(true);
  });

  test('shouldLogStackToConsole honors explicit env override', () => {
    process.env.NODE_ENV = 'production';
    process.env.ERROR_LOG_STACKS = 'true';
    expect(shouldLogStackToConsole()).toBe(true);

    process.env.ERROR_LOG_STACKS = 'false';
    expect(shouldLogStackToConsole()).toBe(false);
  });

  test('errorHandler should not emit console stack trace when disabled', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const req = { method: 'GET', path: '/api/v1/test', ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
    const res = createMockResponse();
    const err = new Error('boom');
    err.statusCode = 500;

    errorHandler(err, req, res, () => {});

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('errorHandler should emit console stack trace when explicitly enabled', () => {
    process.env.ERROR_LOG_STACKS = 'true';

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = { method: 'GET', path: '/api/v1/test', ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
    const res = createMockResponse();
    const err = new Error('boom');
    err.statusCode = 500;

    errorHandler(err, req, res, () => {});

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('maps oversized upload errors to a client-visible 413 response', () => {
    const loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const req = { method: 'POST', path: '/api/v1/items/1/storefront-images', ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
    const res = createMockResponse();
    const err = new Error('File too large');
    err.name = 'MulterError';
    err.code = 'LIMIT_FILE_SIZE';

    errorHandler(err, req, res, () => {});

    expect(loggerWarnSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Uploaded file is too large for this upload type.',
      error_code: 'LIMIT_FILE_SIZE'
    }));
  });

  test('maps unexpected upload fields to a client-visible 400 response', () => {
    const loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const req = { method: 'POST', path: '/api/v1/items/1/storefront-images', ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
    const res = createMockResponse();
    const err = new Error('Unexpected field');
    err.name = 'MulterError';
    err.code = 'LIMIT_UNEXPECTED_FILE';

    errorHandler(err, req, res, () => {});

    expect(loggerWarnSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'The uploaded file field is not accepted for this request.',
      error_code: 'LIMIT_UNEXPECTED_FILE'
    }));
  });
});
