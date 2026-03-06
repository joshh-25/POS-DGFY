export const buildFinalizeItemUseCase = ({ itemRepository }) => {
    return async ({ itemId, itemData, userId }) => itemRepository.finalizeItem(itemId, itemData, userId);
};

