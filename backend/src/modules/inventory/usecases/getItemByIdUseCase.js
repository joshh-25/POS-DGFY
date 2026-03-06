export const buildGetItemByIdUseCase = ({ itemRepository }) => {
    return async ({ itemId }) => itemRepository.getItemById(itemId);
};
