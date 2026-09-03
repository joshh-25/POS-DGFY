// #1495 Part B: the CSV-sync-import entry point to itemRepository.reactivateItem. Kept separate
// from restoreItemUseCase (#1495 Part A) because the two gate on different states -- see
// reactivateItem's own header comment in the repository for why one method cannot serve both.
export const buildReactivateItemUseCase = ({ itemRepository }) => {
    return async ({ itemId, userId }) => itemRepository.reactivateItem(itemId, userId);
};
