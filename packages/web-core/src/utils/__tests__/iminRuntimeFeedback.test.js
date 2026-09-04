import { beforeEach, describe, expect, it, vi } from 'vitest';

const { errorToast } = vi.hoisted(() => ({
  errorToast: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: errorToast,
    info: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}));

import {
  emitIminPosFeedback,
  IMIN_PERFORMANCE_CLASS,
  installIminPerformanceProfile,
  posToast
} from '../iminRuntimeFeedback.js';

describe('POS runtime feedback', () => {
  beforeEach(() => {
    errorToast.mockClear();
    vi.stubGlobal('window', {});
  });

  it('emits one browser toast for repeated equivalent API errors', () => {
    posToast.error('Authentication required. Please provide a valid token.');
    posToast.error('Authentication required. Please provide a valid token.');

    expect(errorToast).toHaveBeenCalledTimes(1);
  });

  it('leaves missing or zero APK feedback durations unset so the UI applies its default timeout', () => {
    const dispatchEvent = vi.fn();
    const bridgeWindow = {
      iMinBridge: { isIminWrapper: () => true },
      dispatchEvent
    };

    emitIminPosFeedback({ message: 'Saved.' }, bridgeWindow);
    emitIminPosFeedback({ message: 'Saved again.', duration: 0 }, bridgeWindow);

    expect(dispatchEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      detail: expect.objectContaining({ duration: null })
    }));
    expect(dispatchEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: expect.objectContaining({ duration: null })
    }));
  });

  it('installs the low-effects profile only for the iMin wrapper runtime', () => {
    const add = vi.fn();
    const bridgeWindow = {
      iMinBridge: { isIminWrapper: () => true },
      document: { documentElement: { classList: { add } } }
    };

    expect(installIminPerformanceProfile(bridgeWindow)).toBe(true);
    expect(add).toHaveBeenCalledWith(IMIN_PERFORMANCE_CLASS);

    add.mockClear();
    expect(installIminPerformanceProfile({
      document: { documentElement: { classList: { add } } }
    })).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });
});
