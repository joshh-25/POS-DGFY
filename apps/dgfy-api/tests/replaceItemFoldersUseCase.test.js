// Phase 268 (#1318 frontend follow-up). Unit tests for the atomicity fix on
// buildReplaceItemFoldersUseCase: itemRepository.replaceItemFolderMemberships
// takes an options.transaction, but the use case never opened or passed one,
// so a mid-failure between the destroy and the bulkCreate left an item with
// zero secondary memberships. Mirrors fnbMode.usecases.test.js's
// buildTransactionalRepository convention.

import { jest } from '@jest/globals';
import { buildReplaceItemFoldersUseCase } from '../src/modules/inventory/usecases/replaceItemFoldersUseCase.js';

const buildTransaction = () => ({
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue()
});

const buildTransactionalRepository = (overrides = {}) => {
  const transaction = buildTransaction();
  return {
    transaction,
    beginTransaction: jest.fn().mockResolvedValue(transaction),
    ...overrides
  };
};

describe('buildReplaceItemFoldersUseCase — transaction wiring (Phase 268)', () => {
  it('opens a transaction, passes it through to the repository, and commits on success', async () => {
    const memberships = [{ item_id: 5, folder_id: 20, sort_order: 0 }];
    const repository = buildTransactionalRepository({
      replaceItemFolderMemberships: jest.fn().mockResolvedValue(memberships)
    });
    const useCase = buildReplaceItemFoldersUseCase({ itemRepository: repository });

    const result = await useCase({ itemId: 5, folderIds: [20] });

    expect(repository.beginTransaction).toHaveBeenCalledTimes(1);
    expect(repository.replaceItemFolderMemberships).toHaveBeenCalledWith(
      5,
      [20],
      { transaction: repository.transaction }
    );
    expect(repository.transaction.commit).toHaveBeenCalledTimes(1);
    expect(repository.transaction.rollback).not.toHaveBeenCalled();
    expect(result).toEqual({ item_id: 5, memberships });
  });

  it('rolls back and rethrows when the repository call fails, without committing', async () => {
    const repositoryError = Object.assign(new Error('One or more categories are inactive or do not exist: 999'), {
      statusCode: 400,
      code: 'ITEM_FOLDER_MEMBERSHIPS_INVALID_FOLDER'
    });
    const repository = buildTransactionalRepository({
      replaceItemFolderMemberships: jest.fn().mockRejectedValue(repositoryError)
    });
    const useCase = buildReplaceItemFoldersUseCase({ itemRepository: repository });

    await expect(useCase({ itemId: 5, folderIds: [999] })).rejects.toBe(repositoryError);

    expect(repository.transaction.rollback).toHaveBeenCalledTimes(1);
    expect(repository.transaction.commit).not.toHaveBeenCalled();
  });
});
