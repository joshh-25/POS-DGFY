import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe('paymentService when payments are disabled', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PAYMENTS_ENABLED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects billing history requests with PAYMENTS_DISABLED', async () => {
    const { getBillingHistory } = await import('../paymentService.js');

    await expect(getBillingHistory()).rejects.toMatchObject({
      response: {
        status: 503,
        data: {
          code: 'PAYMENTS_DISABLED'
        }
      }
    });
  });
});
