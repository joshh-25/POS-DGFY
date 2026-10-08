import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const getOrderForProvider = jest.fn();
jest.unstable_mockModule('../src/modules/dgfyLaundryOrders/index.js', () => ({
  dgfyLaundryOrderUseCases: { getOrderForProvider }
}));

const { getDglaundryOrderForPartner } = await import('../src/modules/dgfyLaundryOrders/controllers/dgfyLaundryOrderHandlers.js');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

describe('DGLaundry partner order lookup scope', () => {
  beforeEach(() => {
    getOrderForProvider.mockReset();
    getOrderForProvider.mockResolvedValue({ externalOrderReference: 'order-1' });
  });

  test('uses the canonical signed snake_case query values', async () => {
    const res = response();
    const next = jest.fn();
    await getDglaundryOrderForPartner({
      query: { company_id: 'company-1', location_id: 'location-1' },
      headers: {},
      params: { externalOrderReference: 'order-1' }
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(getOrderForProvider).toHaveBeenCalledWith({
      companyId: 'company-1', locationId: 'location-1', externalOrderReference: 'order-1'
    });
  });

  test('accepts the query-only camelCase compatibility aliases because the target URI is signed', async () => {
    const res = response();
    const next = jest.fn();
    await getDglaundryOrderForPartner({
      query: { companyId: 'company-1', locationId: 'location-1' },
      headers: {},
      params: { externalOrderReference: 'order-1' }
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(getOrderForProvider).toHaveBeenCalledWith({
      companyId: 'company-1', locationId: 'location-1', externalOrderReference: 'order-1'
    });
  });

  test.each([
    ['company aliases', { company_id: 'company-1', companyId: 'company-2', location_id: 'location-1' }],
    ['location aliases', { company_id: 'company-1', location_id: 'location-1', locationId: 'location-2' }],
    ['repeated query values', { company_id: ['company-1', 'company-2'], location_id: 'location-1' }]
  ])('rejects %s before provider lookup', async (_label, query) => {
    const res = response();
    const next = jest.fn();
    await getDglaundryOrderForPartner({
      query,
      headers: {},
      params: { externalOrderReference: 'order-1' }
    }, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_FAILED' }));
    expect(getOrderForProvider).not.toHaveBeenCalled();
  });

  test('rejects unsigned header scope aliases instead of using them as authorization input', async () => {
    const res = response();
    const next = jest.fn();
    await getDglaundryOrderForPartner({
      query: {},
      headers: { 'x-dgfy-company-id': 'company-1', 'x-dgfy-location-id': 'location-1' },
      params: { externalOrderReference: 'order-1' }
    }, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_FAILED' }));
    expect(getOrderForProvider).not.toHaveBeenCalled();
  });
});
