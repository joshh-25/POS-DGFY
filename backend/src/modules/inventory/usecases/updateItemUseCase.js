export const buildUpdateItemUseCase = ({ itemRepository }) => {
    return async ({ itemId, itemData, userId }) => itemRepository.updateItem(itemId, itemData, userId);
};

