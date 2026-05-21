import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();

vi.mock('../api.js', () => ({
  default: {
    get: apiGet
  }
}));

describe('purchaseOrderService valuation location contracts', async () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards valuation_location_id query params on getPurchaseOrderById', async () => {
    apiGet.mockResolvedValueOnce({ data: { data: { po_id: 9 } } });
    const service = await import('../purchaseOrderService.js');

    await service.getPurchaseOrderById(9, { valuation_location_id: 3 });

    expect(apiGet).toHaveBeenCalledWith('/purchase-orders/9', {
      params: { valuation_location_id: 3 }
    });
  });

  it('sends empty params object when no valuation location is provided', async () => {
    apiGet.mockResolvedValueOnce({ data: { data: { po_id: 11 } } });
    const service = await import('../purchaseOrderService.js');

    await service.getPurchaseOrderById(11);

    expect(apiGet).toHaveBeenCalledWith('/purchase-orders/11', { params: {} });
  });
});
