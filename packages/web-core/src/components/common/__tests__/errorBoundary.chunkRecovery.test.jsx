/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const captureRenderError = vi.fn();
vi.mock('../../../observability/sentryClient.js', () => ({
  captureRenderError: (...args) => captureRenderError(...args)
}));

const reloadOnceForChunkFailure = vi.fn();
const clearChunkReloadMarker = vi.fn();
const clearAppRuntimeCaches = vi.fn().mockResolvedValue();
vi.mock('../../../utils/chunkLoadRecovery.js', async () => {
  const actual = await vi.importActual('../../../utils/chunkLoadRecovery.js');
  return {
    ...actual,
    reloadOnceForChunkFailure: (...args) => reloadOnceForChunkFailure(...args),
    clearChunkReloadMarker: (...args) => clearChunkReloadMarker(...args),
    clearAppRuntimeCaches: (...args) => clearAppRuntimeCaches(...args)
  };
});

function Boom({ error }) {
  throw error;
}

describe('ErrorBoundary chunk-load recovery', () => {
  let ErrorBoundary;

  beforeAll(async () => {
    // Imported after the mocks above are registered.
    ({ default: ErrorBoundary } = await import('../ErrorBoundary.jsx'));
  });

  beforeEach(() => {
    captureRenderError.mockClear();
    reloadOnceForChunkFailure.mockClear();
    clearChunkReloadMarker.mockClear();
    clearAppRuntimeCaches.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reloads automatically on a chunk-load error and does not report it to Sentry', () => {
    reloadOnceForChunkFailure.mockReturnValue(true);
    const chunkError = new Error('Failed to fetch dynamically imported module: /assets/x.js');

    render(
      <ErrorBoundary>
        <Boom error={chunkError} />
      </ErrorBoundary>
    );

    expect(reloadOnceForChunkFailure).toHaveBeenCalledTimes(1);
    expect(captureRenderError).not.toHaveBeenCalled();
    expect(screen.getByText(/finishing an update/i)).toBeTruthy();
  });

  it('reports to Sentry and shows the chunk-specific fallback once the reload budget is spent', () => {
    reloadOnceForChunkFailure.mockReturnValue(false);
    const chunkError = new Error("Importing a module script failed.");

    render(
      <ErrorBoundary>
        <Boom error={chunkError} />
      </ErrorBoundary>
    );

    expect(reloadOnceForChunkFailure).toHaveBeenCalledTimes(1);
    expect(captureRenderError).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/couldn't load the latest update/i)).toBeTruthy();
    expect(screen.getByText(/reload page/i)).toBeTruthy();
  });

  it('shows the generic fallback and always reports a non-chunk render error', () => {
    const renderError = new TypeError("Cannot read properties of undefined (reading 'foo')");

    render(
      <ErrorBoundary>
        <Boom error={renderError} />
      </ErrorBoundary>
    );

    expect(reloadOnceForChunkFailure).not.toHaveBeenCalled();
    expect(captureRenderError).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });
});
