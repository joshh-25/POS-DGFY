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

import { posToast } from '../iminRuntimeFeedback.js';

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
});
