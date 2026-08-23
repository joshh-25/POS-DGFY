import { jest } from '@jest/globals';
import { buildGetItemsUseCase } from '../src/modules/inventory/usecases/getItemsUseCase.js';

describe('getItemsUseCase (#682 branch-scoped stock)', () => {
  it('does not call resolveLocationScope when location_id is omitted (default = tenant-wide, no error)', async () => {
    const resolveLocationScope = jest.fn();
    const getItems = jest.fn().mockResolvedValue({ items: [], pagination: {}, location_scope: { location_id: null, resolved: true } });
    const useCase = buildGetItemsUseCase({ itemRepository: { getItems }, resolveLocationScope });

    const result = await useCase({ query: { page: 1 } });

    expect(resolveLocationScope).not.toHaveBeenCalled();
    expect(getItems).toHaveBeenCalledWith({ page: 1 });
    expect(result.location_scope).toEqual({ location_id: null, resolved: true });
  });

  it('resolves and grant-checks the location before querying when location_id is present', async () => {
    const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 2, name: 'Balabag Branch' });
    const getItems = jest.fn().mockResolvedValue({ items: [], pagination: {}, location_scope: { location_id: 2, resolved: true } });
    const useCase = buildGetItemsUseCase({ itemRepository: { getItems }, resolveLocationScope });

    await useCase({ query: { location_id: '2' }, user: { user_id: 7 } });

    expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({
      requestedLocationId: '2',
      userId: 7,
      operationLabel: 'Items list read'
    }));
    expect(getItems).toHaveBeenCalledWith({ location_id: '2' });
  });

  it('propagates a grant-denied rejection without calling the repository (fail closed, no silent fallback)', async () => {
    const deniedError = new Error('You do not have location access to perform Items list read at location 2.');
    deniedError.statusCode = 403;
    const resolveLocationScope = jest.fn().mockRejectedValue(deniedError);
    const getItems = jest.fn();
    const useCase = buildGetItemsUseCase({ itemRepository: { getItems }, resolveLocationScope });

    await expect(useCase({ query: { location_id: '2' }, user: { user_id: 7 } })).rejects.toThrow('location access');
    expect(getItems).not.toHaveBeenCalled();
  });

  it('is a no-op passthrough when resolveLocationScope is not injected', async () => {
    const getItems = jest.fn().mockResolvedValue({ items: [] });
    const useCase = buildGetItemsUseCase({ itemRepository: { getItems } });

    await useCase({ query: { location_id: '2' } });

    expect(getItems).toHaveBeenCalledWith({ location_id: '2' });
  });
});
