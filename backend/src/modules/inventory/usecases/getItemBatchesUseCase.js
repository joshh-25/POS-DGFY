export const buildGetItemBatchesUseCase = ({ itemRepository }) => {
    return async ({ itemId }) => itemRepository.getItemBatches(itemId);
};

