import { describe, expect, it, vi } from 'vitest';
import {
  isChunkLoadError,
  reloadOnceForChunkFailure,
  clearChunkReloadMarker,
  importWithChunkRetry
} from '../chunkLoadRecovery.js';

describe('isChunkLoadError', () => {
  it('matches Chrome/Edge wording', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/y.js'))).toBe(true);
  });

  it('matches Firefox wording', () => {
    expect(isChunkLoadError(new Error('Error loading dynamically imported module'))).toBe(true);
  });

  it('matches Safari wording -- the DGFY-POS-1 title', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('matches MIME-type variants', () => {
    expect(isChunkLoadError(new Error('Disallowed MIME type ("text/html")'))).toBe(true);
    expect(isChunkLoadError(new Error('"text/html" is not a valid JavaScript MIME type.'))).toBe(true);
  });

  it('matches HTML-parsed-as-JS SyntaxError text', () => {
    expect(isChunkLoadError(new Error("Unexpected token '<'"))).toBe(true);
  });

  it('matches by name for legacy webpack ChunkLoadError', () => {
    const error = new Error('boom');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('does not match an unrelated TypeError', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'foo')"))).toBe(false);
  });

  it('matches the Safari #632 shape -- React.lazy reading _result.default on an undefined resolve', () => {
    expect(isChunkLoadError(new TypeError("undefined is not an object (evaluating 'e._result.default')"))).toBe(true);
  });

  it('matches the Chrome/V8 #632 shape', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
  });

  it('does not match a plain server error', () => {
    const error = new Error('Request failed with status code 500');
    expect(isChunkLoadError(error)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('reloadOnceForChunkFailure', () => {
  const makeStorage = () => {
    const store = {};
    return {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    };
  };

  it('reloads and sets the marker on first call', () => {
    const storage = makeStorage();
    const location = { reload: vi.fn() };
    const now = () => 1_000_000;

    const reloaded = reloadOnceForChunkFailure({ storage, location, now });

    expect(reloaded).toBe(true);
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem('dgfy:chunk-reload-attempt')).toBe('1000000');
  });

  it('does not reload again within the cooldown window', () => {
    const storage = makeStorage();
    const location = { reload: vi.fn() };
    let now = 1_000_000;

    reloadOnceForChunkFailure({ storage, location, now: () => now });
    now += 60_000; // 1 minute later, well within the 10-minute cooldown
    const reloadedAgain = reloadOnceForChunkFailure({ storage, location, now: () => now });

    expect(reloadedAgain).toBe(false);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the cooldown has elapsed', () => {
    const storage = makeStorage();
    const location = { reload: vi.fn() };
    let now = 1_000_000;

    reloadOnceForChunkFailure({ storage, location, now: () => now });
    now += 11 * 60_000; // past the 10-minute cooldown
    const reloadedAgain = reloadOnceForChunkFailure({ storage, location, now: () => now });

    expect(reloadedAgain).toBe(true);
    expect(location.reload).toHaveBeenCalledTimes(2);
  });

  it('reloads once even when storage throws (private mode)', () => {
    const throwingStorage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); }
    };
    const location = { reload: vi.fn() };

    const reloaded = reloadOnceForChunkFailure({ storage: throwingStorage, location, now: () => 1 });

    expect(reloaded).toBe(true);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('no-ops without a reloadable location', () => {
    expect(reloadOnceForChunkFailure({ storage: makeStorage(), location: null })).toBe(false);
  });

  it('clearChunkReloadMarker lets a fresh cooldown start immediately', () => {
    const storage = makeStorage();
    const location = { reload: vi.fn() };
    let now = 1_000_000;

    reloadOnceForChunkFailure({ storage, location, now: () => now });
    clearChunkReloadMarker({ storage });
    now += 1_000; // well within the cooldown, but the marker was cleared
    const reloadedAgain = reloadOnceForChunkFailure({ storage, location, now: () => now });

    expect(reloadedAgain).toBe(true);
    expect(location.reload).toHaveBeenCalledTimes(2);
  });
});

describe('importWithChunkRetry', () => {
  it('returns the module on first success', async () => {
    const mod = { default: () => 'ok' };
    const loadModule = vi.fn().mockResolvedValue(mod);

    const result = await importWithChunkRetry(loadModule);

    expect(result).toBe(mod);
    expect(loadModule).toHaveBeenCalledTimes(1);
  });

  it('retries once on a chunk-load error and succeeds on the second attempt', async () => {
    const mod = { default: () => 'ok' };
    const loadModule = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(mod);

    const result = await importWithChunkRetry(loadModule, { delayMs: 0 });

    expect(result).toBe(mod);
    expect(loadModule).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-chunk error -- rethrows immediately', async () => {
    const evalError = new TypeError('x is not a function');
    const loadModule = vi.fn().mockRejectedValue(evalError);

    await expect(importWithChunkRetry(loadModule, { delayMs: 0 })).rejects.toBe(evalError);
    expect(loadModule).toHaveBeenCalledTimes(1);
  });

  it('triggers a reload after exhausting retries on a persistent chunk error', async () => {
    const chunkError = new Error('Failed to fetch dynamically imported module');
    const loadModule = vi.fn().mockRejectedValue(chunkError);
    const originalWindow = globalThis.window;
    const location = { reload: vi.fn() };
    globalThis.window = { sessionStorage: { getItem: () => null, setItem: () => {} }, location };

    await expect(importWithChunkRetry(loadModule, { attempts: 2, delayMs: 0 })).rejects.toBe(chunkError);

    expect(loadModule).toHaveBeenCalledTimes(2);
    expect(location.reload).toHaveBeenCalledTimes(1);

    globalThis.window = originalWindow;
  });

  // #632: nginx served the SPA shell for a deleted chunk and the dynamic
  // import resolved instead of rejecting -- loadModule() never throws.
  it('retries when loadModule resolves to undefined instead of rejecting', async () => {
    const mod = { default: () => 'ok' };
    const loadModule = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(mod);

    const result = await importWithChunkRetry(loadModule, { delayMs: 0 });

    expect(result).toBe(mod);
    expect(loadModule).toHaveBeenCalledTimes(2);
  });

  it('retries when loadModule resolves to an empty object', async () => {
    const mod = { default: () => 'ok' };
    const loadModule = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(mod);

    const result = await importWithChunkRetry(loadModule, { delayMs: 0 });

    expect(result).toBe(mod);
    expect(loadModule).toHaveBeenCalledTimes(2);
  });

  it('accepts a resolved module with named exports but no default', async () => {
    const mod = { SomeNamedExport: () => 'ok' };
    const loadModule = vi.fn().mockResolvedValue(mod);

    const result = await importWithChunkRetry(loadModule);

    expect(result).toBe(mod);
    expect(loadModule).toHaveBeenCalledTimes(1);
  });

  it('triggers a reload after exhausting retries when loadModule keeps resolving to undefined', async () => {
    const loadModule = vi.fn().mockResolvedValue(undefined);
    const originalWindow = globalThis.window;
    const location = { reload: vi.fn() };
    globalThis.window = { sessionStorage: { getItem: () => null, setItem: () => {} }, location };

    await expect(importWithChunkRetry(loadModule, { attempts: 2, delayMs: 0 })).rejects.toThrow(
      /unusable module/i
    );

    expect(loadModule).toHaveBeenCalledTimes(2);
    expect(location.reload).toHaveBeenCalledTimes(1);

    globalThis.window = originalWindow;
  });
});
