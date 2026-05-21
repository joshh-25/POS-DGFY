export const buildGetItemMovementsUseCase = ({ itemRepository }) => {
    return async ({ itemId }) => itemRepository.getItemMovements(itemId);
};

