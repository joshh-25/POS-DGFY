export const buildGetItemByIdUseCase = ({ itemRepository }) => {
    return async ({ itemId, query }) => itemRepository.getItemById(itemId, query || {});
};
