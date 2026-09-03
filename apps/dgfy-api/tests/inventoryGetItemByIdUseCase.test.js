import { jest } from '@jest/globals';
import { buildGetItemByIdUseCase } from '../src/modules/inventory/usecases/getItemByIdUseCase.js';

// #1495 Part A: mirrors inventoryGetItemsUseCase.test.js's include_inactive permission-gate
// coverage -- getItemById needs the exact same gate, since it's the lookup the "view details"
// action on a restore-list item goes through.
describe('getItemByIdUseCase include_inactive permission gate (#1495 Part A)', () => {
  const DELETE_ITEMS_USER = { user_id: 9, permissions: ['items:delete'] };
  const STAFF_USER = { user_id: 10, permissions: [] };

  it('honors include_inactive when the requesting user holds DELETE_ITEMS', async () => {
    const getItemById = jest.fn().mockResolvedValue({ item_id: 1, status: 'inactive' });
    const useCase = buildGetItemByIdUseCase({ itemRepository: { getItemById } });

    await useCase({ itemId: 1, query: { include_inactive: 'true' }, user: DELETE_ITEMS_USER });

    expect(getItemById).toHaveBeenCalledWith(1, { include_inactive: true });
  });

  it('silently ignores include_inactive for a user without DELETE_ITEMS (no 403, just unhonored)', async () => {
    const getItemById = jest.fn().mockResolvedValue({ item_id: 1, status: 'active' });
    const useCase = buildGetItemByIdUseCase({ itemRepository: { getItemById } });

    await useCase({ itemId: 1, query: { include_inactive: 'true' }, user: STAFF_USER });

    expect(getItemById).toHaveBeenCalledWith(1, { include_inactive: false });
  });

  it('defaults query/user to empty when omitted (backward-compatible call shape)', async () => {
    const getItemById = jest.fn().mockResolvedValue({ item_id: 1 });
    const useCase = buildGetItemByIdUseCase({ itemRepository: { getItemById } });

    await useCase({ itemId: 1 });

    expect(getItemById).toHaveBeenCalledWith(1, { include_inactive: false });
  });
});
