export const buildGetItemStockHistoryUseCase = ({ itemRepository }) => {
    return async ({ itemId, query }) => itemRepository.getItemStockHistory(itemId, query);
};

