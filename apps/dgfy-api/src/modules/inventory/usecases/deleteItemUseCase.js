export const buildDeleteItemUseCase = ({ itemRepository }) => {
    return async ({ itemId, userId, expectedServerVersion = null }) => itemRepository.deleteItem(
        itemId,
        userId,
        { expectedServerVersion }
    );
};
