import { afterAll, describe, expect, it, jest } from '@jest/globals';

const get = jest.fn();
const post = jest.fn();
const loggerError = jest.fn();
jest.unstable_mockModule('axios', () => ({ default: { get, post } }));
jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: loggerError }
}));

process.env.PAYMONGO_MODE = 'test';
process.env.PAYMONGO_API_BASE_URL = 'https://api.paymongo.com/v1';
process.env.PAYMONGO_SECRET_KEY = 'sk_test_secret_fixture';
const { PayMongoService } = await import('../src/services/paymongoService.js');

afterAll(() => {
  delete process.env.PAYMONGO_MODE;
  delete process.env.PAYMONGO_API_BASE_URL;
  delete process.env.PAYMONGO_SECRET_KEY;
});

describe('PayMongo refund service', () => {
  it('logs the HTTP status and provider detail without logging authorization data', async () => {
    const error = new Error('Request failed with status code 400');
    error.response = {
      status: 400,
      data: { errors: [{ code: 'refund_not_allowed', detail: 'Refund amount exceeds available payout amount.' }] }
    };
    post.mockRejectedValueOnce(error);
    const service = new PayMongoService();

    await expect(service.createRefund({ amount: 5000, paymentId: 'pay_1234567890' })).rejects.toBe(error);

    const logMessage = loggerError.mock.calls.at(-1)[0];
    expect(logMessage).toContain('HTTP 400');
    expect(logMessage).toContain('Refund amount exceeds available payout amount.');
    expect(logMessage).not.toContain('sk_test_secret_fixture');
    expect(logMessage).not.toContain(Buffer.from('sk_test_secret_fixture:').toString('base64'));
    expect(logMessage).not.toContain('Authorization');
  });

  it('retrieves refund resources from the API root and returns null on 404', async () => {
    get.mockResolvedValueOnce({ data: { data: { id: 'ref_123', attributes: { status: 'pending' } } } });
    get.mockRejectedValueOnce({ response: { status: 404 } });
    const service = new PayMongoService();

    await expect(service.retrieveRefund('ref_123')).resolves.toEqual({
      id: 'ref_123', attributes: { status: 'pending' }
    });
    await expect(service.retrieveRefund('ref_missing')).resolves.toBeNull();
    expect(get).toHaveBeenNthCalledWith(1, 'https://api.paymongo.com/refunds/ref_123', expect.anything());
    expect(get).toHaveBeenNthCalledWith(2, 'https://api.paymongo.com/refunds/ref_missing', expect.anything());
  });

  it('returns embedded payment refund resources in normalized form', async () => {
    get.mockResolvedValueOnce({ data: { data: {
      id: 'pay_1234567890',
      attributes: { refunds: { data: [{ data: { id: 'ref_123', attributes: { amount: 5000 } } }] } }
    } } });
    const service = new PayMongoService();

    await expect(service.listPaymentRefunds('pay_1234567890')).resolves.toEqual([
      { id: 'ref_123', attributes: { amount: 5000 } }
    ]);
    expect(get).toHaveBeenCalledWith('https://api.paymongo.com/v1/payments/pay_1234567890', expect.anything());
  });
});
