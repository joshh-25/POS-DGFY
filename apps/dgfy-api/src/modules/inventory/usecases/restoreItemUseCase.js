export const buildRestoreItemUseCase = ({ itemRepository }) => {
    return async ({ itemId, userId, expectedServerVersion = null }) => itemRepository.restoreItem(
        itemId,
        userId,
        { expectedServerVersion }
    );
};
