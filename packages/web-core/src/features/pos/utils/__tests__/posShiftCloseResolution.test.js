import { describe, expect, it, vi } from 'vitest';
import { loadShiftCloseResolution } from '../posShiftCloseResolution.js';

const baseInput = {
  shiftId: 12,
  offlineScope: { tenantId: 'tenant-1', terminalId: 'COUNTER-01', locationId: 4 },
  isOnline: true,
  locationId: 4,
  listQueueEntries: vi.fn(async () => []),
  fetchParkedSales: vi.fn(async () => ({
    parked_sales: [
      { pos_parked_sale_id: 1, status: 'parked' },
      { pos_parked_sale_id: 2, status: 'claimed', shift_id: 12 },
      { pos_parked_sale_id: 4, status: 'claimed', shift_id: 99 },
      { pos_parked_sale_id: 3, status: 'completed' }
    ]
  }))
};

describe('POS shift-close parked-sale resolution', () => {
  it('counts only claimed server carts as shift-close blockers', async () => {
    await expect(loadShiftCloseResolution(baseInput)).resolves.toEqual({
      claimedParkedSaleCount: 1,
      pendingParkedSaleCount: 0
    });
  });

  it('continues blocking close for pending offline parked-sale syncs while offline', async () => {
    const result = await loadShiftCloseResolution({
      ...baseInput,
      isOnline: false,
      fetchParkedSales: vi.fn(),
      listQueueEntries: vi.fn(async () => [
        { operation: 'parked_sale', shift_id: 12, status: 'pending' },
        { operation: 'shift_close', shift_id: 12, status: 'pending' }
      ])
    });

    expect(result).toEqual({ claimedParkedSaleCount: 0, pendingParkedSaleCount: 1 });
  });
});
