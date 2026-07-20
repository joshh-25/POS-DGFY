export const buildValidateCompositionUseCase = ({ itemRepository }) => {
    return async ({ productId, ingredientIds }) => itemRepository.validateComposition(productId, ingredientIds);
};

