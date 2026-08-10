import { describe, it, expect } from 'vitest';
import {
  isRetryableTransientFailure,
  isTransportFailure,
  isReplayableBody,
  readRetryAfterSeconds,
  computeTransientRetryDelayMs,
  RETRYABLE_STATUSES,
  IDEMPOTENT_METHODS
} from '../transientRetry.js';

describe('transientRetry policy', () => {
  describe('isRetryableTransientFailure', () => {
    it('retries 502/503/504 GET requests', () => {
      [502, 503, 504].forEach((status) => {
        const error = { response: { status } };
        expect(isRetryableTransientFailure(error, { method: 'get' })).toBe(true);
      });
    });

    it('does not retry 500 -- a bug, not a blip', () => {
      const error = { response: { status: 500 } };
      expect(isRetryableTransientFailure(error, { method: 'get' })).toBe(false);
    });

    it('does not retry 429 -- the caller already gets retryAfterSeconds instead', () => {
      const error = { response: { status: 429 } };
      expect(isRetryableTransientFailure(error, { method: 'get' })).toBe(false);
    });

    it('does not retry non-idempotent methods by default', () => {
      const error = { response: { status: 502 } };
      expect(isRetryableTransientFailure(error, { method: 'post' })).toBe(false);
      expect(isRetryableTransientFailure(error, { method: 'put' })).toBe(false);
      expect(isRetryableTransientFailure(error, { method: 'delete' })).toBe(false);
    });

    it('retries a non-idempotent method only via the explicit opt-in', () => {
      const error = { response: { status: 502 } };
      expect(isRetryableTransientFailure(error, { method: 'post', retryOnTransientFailure: true })).toBe(true);
    });

    it('does not retry a canceled request', () => {
      const error = { code: 'ERR_CANCELED' };
      expect(isRetryableTransientFailure(error, { method: 'get' })).toBe(false);
    });

    it('does not retry a timeout', () => {
      expect(isRetryableTransientFailure({ code: 'ECONNABORTED' }, { method: 'get' })).toBe(false);
      expect(isRetryableTransientFailure({ code: 'ETIMEDOUT' }, { method: 'get' })).toBe(false);
    });

    it('retries a bare network failure with no response and no code (axios-mock-adapter shape)', () => {
      const error = { message: 'Network Error' };
      expect(isRetryableTransientFailure(error, { method: 'get' })).toBe(true);
    });

    it('does not retry when the body is not replayable, even opted in', () => {
      const error = { response: { status: 502 } };
      // FormData is a global Web API since Node 18; this exercises the real
      // instanceof check rather than a stand-in shape.
      const formData = new FormData();
      expect(isRetryableTransientFailure(error, { method: 'post', retryOnTransientFailure: true, data: formData })).toBe(false);
    });
  });

  describe('isTransportFailure', () => {
    it('is true for a no-response error with no disqualifying code', () => {
      expect(isTransportFailure({})).toBe(true);
      expect(isTransportFailure({ code: undefined })).toBe(true);
    });

    it('is false when a response is present', () => {
      expect(isTransportFailure({ response: { status: 502 } })).toBe(false);
    });

    it('is false for canceled/timeout codes', () => {
      expect(isTransportFailure({ code: 'ERR_CANCELED' })).toBe(false);
      expect(isTransportFailure({ code: 'ECONNABORTED' })).toBe(false);
      expect(isTransportFailure({ code: 'ETIMEDOUT' })).toBe(false);
    });
  });

  describe('isReplayableBody', () => {
    it('is true for no body, plain objects and strings', () => {
      expect(isReplayableBody(undefined)).toBe(true);
      expect(isReplayableBody(null)).toBe(true);
      expect(isReplayableBody({ a: 1 })).toBe(true);
      expect(isReplayableBody('json-string')).toBe(true);
    });

    it('is false for a stream-shaped object', () => {
      expect(isReplayableBody({ pipe: () => {} })).toBe(false);
    });
  });

  describe('readRetryAfterSeconds', () => {
    it('reads from the response body', () => {
      const error = { response: { data: { retryAfterSeconds: 12 }, headers: {} } };
      expect(readRetryAfterSeconds(error)).toBe(12);
    });

    it('falls back to the Retry-After header, either casing', () => {
      expect(readRetryAfterSeconds({ response: { headers: { 'retry-after': '7' } } })).toBe(7);
      expect(readRetryAfterSeconds({ response: { headers: { 'Retry-After': '9' } } })).toBe(9);
    });

    it('returns null when neither source has a usable value', () => {
      expect(readRetryAfterSeconds({ response: { headers: {} } })).toBeNull();
      expect(readRetryAfterSeconds({})).toBeNull();
    });
  });

  describe('computeTransientRetryDelayMs', () => {
    it('produces increasing jittered backoff bounded by the max delay', () => {
      for (let i = 0; i < 20; i += 1) {
        const attempt1 = computeTransientRetryDelayMs({ attempt: 1 });
        const attempt2 = computeTransientRetryDelayMs({ attempt: 2 });
        expect(attempt1).toBeGreaterThanOrEqual(200);
        expect(attempt1).toBeLessThanOrEqual(400);
        expect(attempt2).toBeGreaterThanOrEqual(400);
        expect(attempt2).toBeLessThanOrEqual(800);
      }
    });

    it('caps backoff growth at the configured max regardless of attempt number', () => {
      const delay = computeTransientRetryDelayMs({ attempt: 10 });
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('honours a short Retry-After exactly, bypassing backoff', () => {
      expect(computeTransientRetryDelayMs({ attempt: 1, retryAfterSeconds: 3 })).toBe(3000);
    });

    it('refuses to retry when Retry-After exceeds the honoured ceiling', () => {
      expect(computeTransientRetryDelayMs({ attempt: 1, retryAfterSeconds: 30 })).toBeNull();
    });
  });

  it('exposes the documented retryable status and method sets', () => {
    expect([...RETRYABLE_STATUSES].sort()).toEqual([502, 503, 504]);
    expect([...IDEMPOTENT_METHODS].sort()).toEqual(['get', 'head', 'options']);
  });
});
