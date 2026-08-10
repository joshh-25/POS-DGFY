import { validateCompositionUseCase } from '../index.js';

export const itemPolicyValidation = {
  validateComposition: async (productId, ingredientIds) => validateCompositionUseCase({
    productId,
    ingredientIds
  })
};
