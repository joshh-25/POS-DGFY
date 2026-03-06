export const buildCreateItemUseCase = ({ itemRepository }) => {
    return async ({ itemData, userId }) => itemRepository.createItem(itemData, userId);
};
