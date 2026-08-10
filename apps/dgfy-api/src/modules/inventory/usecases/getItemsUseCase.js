export const buildGetItemsUseCase = ({ itemRepository }) => {
    return async ({ query }) => itemRepository.getItems(query);
};
