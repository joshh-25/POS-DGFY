export const buildGetItemBatchesUseCase = ({ itemRepository }) => {
    return async ({ itemId, locationId = null }) => itemRepository.getItemBatches(itemId, locationId);
};
