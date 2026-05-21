import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';
import { convertQuantity, areCompatible, normalizeUom } from '../../../utils/uomConverter.js';
import { isStockExemptServiceItem } from './stockBearingPolicy.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const toPositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const buildCompositionMap = (compositions = []) => {
    const map = new Map();
    for (const composition of Array.isArray(compositions) ? compositions : []) {
        const productId = toPositiveInt(composition?.product_id);
        if (!productId) continue;
        if (!map.has(productId)) map.set(productId, []);
        map.get(productId).push(composition);
    }
    return map;
};

const resolveRequiredIngredientQuantity = ({ composition, ingredient, item, lineQuantity }) => {
    const requiredPerUnit = Number(composition?.quantity_required || 0);
    if (!Number.isFinite(requiredPerUnit) || requiredPerUnit <= 0) return 0;

    const rawRequired = round4(requiredPerUnit * lineQuantity);
    const ingredientUom = normalizeUom(ingredient?.unit_of_measure || composition?.unit_of_measure || item?.unit_of_measure);
    const recipeUom = normalizeUom(composition?.unit_of_measure || ingredientUom);

    if (recipeUom && ingredientUom && recipeUom !== ingredientUom) {
        if (!areCompatible(recipeUom, ingredientUom)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Incompatible recipe units for "${item?.name || 'menu item'}": cannot convert ${recipeUom} to ${ingredientUom}`,
                {
                    statusCode: 422,
                    details: {
                        reason_code: 'FNB_RECIPE_UOM_INCOMPATIBLE',
                        product_item_id: toPositiveInt(item?.item_id),
                        product_name: item?.name || null,
                        ingredient_item_id: toPositiveInt(composition?.ingredient_id),
                        ingredient_name: ingredient?.name || null,
                        recipe_uom: recipeUom,
                        ingredient_uom: ingredientUom
                    }
                }
            );
        }
        return round4(convertQuantity(rawRequired, recipeUom, ingredientUom));
    }

    return rawRequired;
};

export const buildFnbRecipeConsumptionPlan = ({
    lines = [],
    itemMap = new Map(),
    compositions = [],
    locationId = null,
    validateAvailability = true
} = {}) => {
    const compositionMap = buildCompositionMap(compositions);
    const movementsByLineIndex = [];
    const recipeItemIds = new Set();
    const requiredByIngredient = new Map();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex] || {};
        const itemId = toPositiveInt(line.item_id);
        const item = itemMap.get(itemId);
        const lineMovements = [];
        movementsByLineIndex[lineIndex] = lineMovements;

        if (!item || isStockExemptServiceItem(item)) continue;

        const recipeCompositions = compositionMap.get(itemId) || [];
        if (recipeCompositions.length === 0) continue;

        recipeItemIds.add(itemId);
        const lineQuantity = Number(line.quantity);
        if (!Number.isFinite(lineQuantity) || lineQuantity <= 0) continue;

        for (const composition of recipeCompositions) {
            const ingredient = composition?.ingredient || {};
            const ingredientId = toPositiveInt(composition?.ingredient_id || ingredient?.item_id);
            if (!ingredientId) continue;

            const requiredQuantity = resolveRequiredIngredientQuantity({
                composition,
                ingredient,
                item,
                lineQuantity
            });
            if (requiredQuantity <= 0) continue;

            const movement = {
                product_item_id: itemId,
                product_name: item.name || null,
                ingredient_item_id: ingredientId,
                ingredient_name: ingredient.name || null,
                quantity: requiredQuantity,
                unit_of_measure: normalizeUom(ingredient.unit_of_measure || composition.unit_of_measure || null),
                location_id: toPositiveInt(locationId)
            };
            lineMovements.push(movement);

            const current = requiredByIngredient.get(ingredientId) || {
                ingredient_item_id: ingredientId,
                ingredient_name: ingredient.name || null,
                unit_of_measure: movement.unit_of_measure,
                available: Number(ingredient.current_stock || 0),
                requested: 0,
                products: []
            };
            current.available = Math.min(Number(current.available || 0), Number(ingredient.current_stock || 0));
            current.requested = round4(current.requested + requiredQuantity);
            current.products.push({
                product_item_id: itemId,
                product_name: item.name || null,
                requested: requiredQuantity
            });
            requiredByIngredient.set(ingredientId, current);
        }
    }

    for (const requirement of requiredByIngredient.values()) {
        if (validateAvailability && Number(requirement.available || 0) + 0.000001 < Number(requirement.requested || 0)) {
            const firstProduct = requirement.products[0] || {};
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Insufficient ingredient stock for "${firstProduct.product_name || 'menu item'}": ${requirement.ingredient_name || `item ${requirement.ingredient_item_id}`}. Available: ${round4(requirement.available)}, requested: ${round4(requirement.requested)}`,
                {
                    statusCode: 422,
                    details: {
                        reason_code: 'FNB_RECIPE_INGREDIENT_SHORTFALL',
                        product_item_id: firstProduct.product_item_id || null,
                        product_name: firstProduct.product_name || null,
                        ingredient_item_id: requirement.ingredient_item_id,
                        ingredient_name: requirement.ingredient_name || null,
                        available: round4(requirement.available),
                        requested: round4(requirement.requested),
                        unit_of_measure: requirement.unit_of_measure || null,
                        location_id: toPositiveInt(locationId),
                        products: requirement.products
                    }
                }
            );
        }
    }

    return {
        recipeItemIds,
        movementsByLineIndex,
        allMovements: movementsByLineIndex.flat()
    };
};
