export const buildReplaceItemSuppliersUseCase = ({ itemRepository }) => {
    return async ({ itemId, suppliers }) => itemRepository.replaceItemSuppliers(itemId, suppliers);
};
