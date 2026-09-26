import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);
const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const decimal = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLocationIds = (value) => (Array.isArray(value)
    ? [...new Set(value.map((locationId) => positiveInt(locationId, null)).filter(Boolean))]
    : null);

const normalizeUom = (value) => String(value || '').trim().toLowerCase();
const isMissingLocationStockSchemaError = (error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    const message = String(error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || '');
    return code === 'ER_NO_SUCH_TABLE' && /item_location_stocks/i.test(message);
};

const buildAvailability = ({ compositions, stockByIngredient }) => {
    if (compositions.length === 0) return { status: 'not_configured', possible_units: 0, shortages: [] };

    let possibleUnits = Number.POSITIVE_INFINITY;
    const shortages = [];
    let hasUomReview = false;

    for (const composition of compositions) {
        const ingredient = composition.ingredient || {};
        const required = decimal(composition.quantity_required);
        const stock = stockByIngredient.get(Number(composition.ingredient_id));
        const ingredientUom = normalizeUom(ingredient.unit_of_measure);
        const recipeUom = normalizeUom(composition.unit_of_measure);
        const uomCompatible = !ingredientUom || !recipeUom || ingredientUom === recipeUom;
        if (!uomCompatible) hasUomReview = true;
        if (required > 0 && uomCompatible && stock != null) {
            possibleUnits = Math.min(possibleUnits, Math.floor(stock / required));
        }
        if (uomCompatible && stock != null && stock < required) {
            shortages.push({
                ingredient_id: Number(composition.ingredient_id),
                ingredient_name: ingredient.name || `Ingredient #${composition.ingredient_id}`,
                required_per_unit: required,
                quantity_on_hand: stock,
                shortage_quantity: required - stock,
                unit_of_measure: composition.unit_of_measure || ingredient.unit_of_measure || null
            });
        }
    }

    return {
        status: hasUomReview ? 'uom_review' : (shortages.length > 0 ? 'shortage' : 'available'),
        possible_units: Number.isFinite(possibleUnits) ? Math.max(0, possibleUnits) : null,
        shortages
    };
};

export const businessAdminRecipeRepository = {
    async listRecipes({ branchId = null, allowedLocationIds = null, page = 1, limit = 50, search = '' } = {}) {
        const Item = dbStore.get('Item');
        const ProductComposition = dbStore.get('ProductComposition');
        const ItemLocationStock = dbStore.get('ItemLocationStock');
        if (!Item || !ProductComposition) return { rows: [], pagination: { page, limit, total: 0, total_pages: 0 }, meta: { stock_source: 'unavailable' } };

        const normalizedPage = positiveInt(page, 1);
        const normalizedLimit = Math.min(200, positiveInt(limit, 50));
        const normalizedBranchId = positiveInt(branchId, null);
        const locationIds = normalizedBranchId ? [normalizedBranchId] : normalizeLocationIds(allowedLocationIds);
        const where = { category: 'product', status: 'active' };
        const cleanSearch = String(search || '').trim();
        if (cleanSearch) {
            where[Op.or] = [
                { name: { [Op.like]: `%${cleanSearch}%` } },
                { sku_code: { [Op.like]: `%${cleanSearch}%` } }
            ];
        }

        const { rows, count } = await Item.findAndCountAll({
            where,
            attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'default_sale_price', 'product_type'],
            include: [{
                model: ProductComposition,
                as: 'productCompositions',
                required: false,
                where: { composition_type: 'ingredient' },
                include: [{
                    model: Item,
                    as: 'ingredient',
                    required: false,
                    attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock', 'cost_per_unit', 'category']
                }]
            }],
            distinct: true,
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit,
            order: [['name', 'ASC'], ['item_id', 'ASC']]
        });

        const plainRows = rows.map(toPlain);
        const ingredientIds = [...new Set(plainRows.flatMap((row) => (row.productCompositions || [])
            .map((composition) => positiveInt(composition.ingredient_id, null))
            .filter(Boolean)))];
        const stockByIngredient = new Map();
        let stockSource = 'tenant_aggregate';

        if (ItemLocationStock?.findAll && ingredientIds.length > 0) {
            const stockWhere = { item_id: { [Op.in]: ingredientIds } };
            if (Array.isArray(locationIds)) stockWhere.location_id = { [Op.in]: locationIds };
            try {
                const stockRows = await ItemLocationStock.findAll({
                    where: stockWhere,
                    attributes: ['item_id', 'quantity_on_hand'],
                    raw: true
                });
                for (const stockRow of stockRows) {
                    const ingredientId = Number(stockRow.item_id);
                    stockByIngredient.set(ingredientId, (stockByIngredient.get(ingredientId) || 0) + decimal(stockRow.quantity_on_hand));
                }
                stockSource = Array.isArray(locationIds) ? 'location_stock_ledger' : 'tenant_location_stock_ledger';
            } catch (error) {
                if (!isMissingLocationStockSchemaError(error)) throw error;
                stockSource = 'catalog_aggregate_fallback';
            }
        }

        const normalizedRows = plainRows.map((row) => {
            const compositions = (row.productCompositions || []).map((composition) => ({
                composition_id: composition.composition_id,
                ingredient_id: Number(composition.ingredient_id),
                ingredient: composition.ingredient || null,
                quantity_required: decimal(composition.quantity_required),
                unit_of_measure: composition.unit_of_measure || composition.ingredient?.unit_of_measure || null
            }));
            for (const composition of compositions) {
                const ingredientId = Number(composition.ingredient_id);
                if (!stockByIngredient.has(ingredientId) && composition.ingredient?.current_stock != null) {
                    stockByIngredient.set(ingredientId, decimal(composition.ingredient.current_stock));
                    if (stockSource !== 'catalog_aggregate_fallback') stockSource = 'mixed_fallback';
                }
            }
            const availability = buildAvailability({ compositions, stockByIngredient });
            const recipeCost = compositions.reduce((total, composition) => (
                total + (composition.quantity_required * decimal(composition.ingredient?.cost_per_unit))
            ), 0);
            return {
                item_id: Number(row.item_id),
                name: row.name,
                sku_code: row.sku_code || null,
                product_type: row.product_type || null,
                unit_of_measure: row.unit_of_measure || null,
                default_sale_price: decimal(row.default_sale_price),
                recipe_cost: recipeCost,
                ingredients: compositions.map((composition) => ({
                    composition_id: composition.composition_id,
                    ingredient_id: composition.ingredient_id,
                    name: composition.ingredient?.name || `Ingredient #${composition.ingredient_id}`,
                    sku_code: composition.ingredient?.sku_code || null,
                    quantity_required: composition.quantity_required,
                    unit_of_measure: composition.unit_of_measure,
                    quantity_on_hand: stockByIngredient.get(composition.ingredient_id) ?? null,
                    cost_per_unit: decimal(composition.ingredient?.cost_per_unit),
                    category: composition.ingredient?.category || null
                })),
                availability
            };
        });

        return {
            rows: normalizedRows,
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                total: count,
                total_pages: Math.ceil(count / normalizedLimit)
            },
            meta: {
                branch_id: normalizedBranchId,
                scope_location_ids: locationIds,
                stock_source: stockSource,
                read_only: true
            }
        };
    }
};
