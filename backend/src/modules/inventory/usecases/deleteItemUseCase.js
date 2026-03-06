export const buildDeleteItemUseCase = ({ itemRepository }) => {
    return async ({ itemId, userId }) => itemRepository.deleteItem(itemId, userId);
};

