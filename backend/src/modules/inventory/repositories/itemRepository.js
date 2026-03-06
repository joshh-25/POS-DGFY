import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import logger from '../../../config/logger.js';
import { validateComposition as validateCompositionDependency, invalidateDependencyGraphCache } from '../../../services/compositionValidationService.js';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { createStockMovement } from '../../../services/stockMovementService.js';
import { searchByMeaning, syncItemEmbedding } from '../../../services/embeddingService.js';
import { getVariations } from '../../../config/searchSynonyms.js';
import { buildVisibleWhere, notFoundError } from '../../../utils/softDeletePolicy.js';
import { assertItemRepositoryContract } from '../contracts/itemRepository.contract.js';

const settingsCache = new Map();
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;

export const inventoryRepositoryDependencies = {
    validateComposition: validateCompositionDependency,
    invalidateDependencyGraphCache,
    getAllSettings: async () => unwrapApplicationResultOrThrow(
        await getAllSettingsUseCase(),
        'Failed to retrieve settings'
    ),
    createStockMovement,
    syncItemEmbedding,
    searchByMeaning
};

const visibleItemWhere = (where = {}) => {
    return buildVisibleWhere(where, {
        statusField: 'status',
        excludeInactiveStatus: true
    });
};

const calculateThresholds = async (maxCapacity) => {
    const store = dbStore.getStore();
    const tenantKey = store?.tenantId ?? 'default';
    const cached = settingsCache.get(tenantKey);
    let settings;
    if (cached && cached.expiresAt > Date.now()) {
        settings = cached.settings;
    } else {
        settings = await inventoryRepositoryDependencies.getAllSettings();
        settingsCache.set(tenantKey, {
            settings,
            expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS
        });
    }

    const autoCalc = settings.enable_auto_reorder?.value ?? true;
    if (!autoCalc) {
        return { min_threshold: null, purchase_allowance: null };
    }
    if (!maxCapacity || maxCapacity <= 0) {
        return { min_threshold: null, purchase_allowance: null };
    }

    const minPercent = (settings.min_stock_threshold_percent?.value || 40) / 100;
    const allowancePercent = (settings.purchase_allowance_percent?.value || 20) / 100;
    return {
        min_threshold: Math.round(maxCapacity * minPercent),
        purchase_allowance: Math.round(maxCapacity * allowancePercent)
    };
};

const findVisibleItemById = async (Item, itemId, queryOptions = {}) => {
    const { where = {}, ...rest } = queryOptions;
    return Item.findOne({
        ...rest,
        where: visibleItemWhere({ ...where, item_id: itemId })
    });
};

const calculateRecipeCost = (productCompositions) => {
    if (!productCompositions || productCompositions.length === 0) {
        return 0;
    }

    return productCompositions.reduce((total, comp) => {
        const ingredientCost = parseFloat(comp.ingredient?.cost_per_unit || 0);
        const quantity = parseFloat(comp.quantity_required || 0);
        return total + (ingredientCost * quantity);
    }, 0);
};

const saveRelatedWizardData = async (itemId, wizardData, transaction) => {
    const ItemNutrition = dbStore.get('ItemNutrition');
    const ItemAllergen = dbStore.get('ItemAllergen');
    const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
    const ItemShelfLife = dbStore.get('ItemShelfLife');
    const ItemPackaging = dbStore.get('ItemPackaging');
    const ItemQualityControl = dbStore.get('ItemQualityControl');
    const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
    const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
    const ProductComposition = dbStore.get('ProductComposition');

    const promises = [];

    if (wizardData.nutritional_info && Object.keys(wizardData.nutritional_info).length > 0) {
        promises.push(
            ItemNutrition.upsert({
                item_id: itemId,
                ...wizardData.nutritional_info
            }, { transaction })
        );
    }

    if ((wizardData.allergens && wizardData.allergens.length > 0)
        || (wizardData.may_contain_allergens && wizardData.may_contain_allergens.length > 0)) {
        promises.push(
            ItemAllergen.destroy({ where: { item_id: itemId }, transaction })
        );

        const allergenRows = [];
        if (wizardData.allergens && wizardData.allergens.length > 0) {
            allergenRows.push(...wizardData.allergens.map((allergen) => ({
                item_id: itemId,
                allergen_name: allergen,
                is_cross_contamination: false
            })));
        }
        if (wizardData.may_contain_allergens && wizardData.may_contain_allergens.length > 0) {
            allergenRows.push(...wizardData.may_contain_allergens.map((allergen) => ({
                item_id: itemId,
                allergen_name: allergen,
                is_cross_contamination: true
            })));
        }
        if (allergenRows.length > 0) {
            promises.push(ItemAllergen.bulkCreate(allergenRows, { transaction }));
        }
    }

    if (wizardData.physical_properties && Object.keys(wizardData.physical_properties).length > 0) {
        promises.push(
            ItemPhysicalProperties.upsert({
                item_id: itemId,
                ...wizardData.physical_properties
            }, { transaction })
        );
    }

    if (wizardData.shelf_life && Object.keys(wizardData.shelf_life).length > 0) {
        promises.push(
            ItemShelfLife.upsert({
                item_id: itemId,
                ...wizardData.shelf_life
            }, { transaction })
        );
    }

    if (wizardData.packaging_info && Object.keys(wizardData.packaging_info).length > 0) {
        promises.push(
            ItemPackaging.upsert({
                item_id: itemId,
                ...wizardData.packaging_info
            }, { transaction })
        );
    }

    if (wizardData.quality_control && Object.keys(wizardData.quality_control).length > 0) {
        promises.push(
            ItemQualityControl.upsert({
                item_id: itemId,
                ...wizardData.quality_control
            }, { transaction })
        );
    }

    if (wizardData.regulatory_compliance && Object.keys(wizardData.regulatory_compliance).length > 0) {
        promises.push(
            ItemRegulatoryCompliance.upsert({
                item_id: itemId,
                ...wizardData.regulatory_compliance
            }, { transaction })
        );
    }

    const hasCostData = wizardData.labor_cost || wizardData.overhead_cost || wizardData.additional_packaging_cost;
    if (hasCostData) {
        promises.push(
            ItemCostBreakdown.upsert({
                item_id: itemId,
                labor_cost: wizardData.labor_cost || 0,
                overhead_cost: wizardData.overhead_cost || 0,
                additional_packaging_cost: wizardData.additional_packaging_cost || 0
            }, { transaction })
        );
    }

    if (wizardData.ingredients && wizardData.ingredients.length > 0) {
        const ingredientIds = wizardData.ingredients
            .filter((ingredient) => ingredient.item_id)
            .map((ingredient) => parseInt(ingredient.item_id, 10));

        if (ingredientIds.length > 0) {
            const validation = await inventoryRepositoryDependencies.validateComposition(itemId, ingredientIds);
            if (!validation.valid) {
                const error = new Error('Invalid product composition');
                error.statusCode = 400;
                error.details = validation.errors.map((validationError) => validationError.message);
                throw error;
            }

            const Item = dbStore.get('Item');
            await Item.update({
                nesting_level: validation.nestingLevel,
                max_child_depth: Math.max(0, validation.nestingLevel - 1)
            }, { where: buildVisibleWhere({ item_id: itemId }), transaction });
        }

        promises.push(
            ProductComposition.destroy({
                where: { product_id: itemId, composition_type: 'ingredient' },
                transaction
            })
        );

        const Item = dbStore.get('Item');
        const ingredientItems = await Item.findAll({
            where: visibleItemWhere({ item_id: ingredientIds }),
            attributes: ['item_id', 'category']
        });
        const ingredientCategoryMap = new Map(
            ingredientItems.map((ingredientItem) => [ingredientItem.item_id, ingredientItem.category])
        );

        const ingredientRows = wizardData.ingredients
            .filter((ingredient) => ingredient.item_id && ingredient.quantity)
            .map((ingredient) => ({
                product_id: itemId,
                ingredient_id: ingredient.item_id,
                composition_type: 'ingredient',
                quantity_required: ingredient.quantity,
                unit_of_measure: ingredient.unit_of_measure || null,
                is_subproduct: ingredientCategoryMap.get(parseInt(ingredient.item_id, 10)) === 'product'
            }));

        if (ingredientRows.length > 0) {
            promises.push(
                ProductComposition.bulkCreate(ingredientRows, { transaction })
            );
            promises.push(inventoryRepositoryDependencies.invalidateDependencyGraphCache());
        }
    }

    if (wizardData.packaging_items && wizardData.packaging_items.length > 0) {
        promises.push(
            ProductComposition.destroy({
                where: { product_id: itemId, composition_type: 'packaging' },
                transaction
            })
        );

        const packagingRows = wizardData.packaging_items
            .filter((packagingItem) => packagingItem.item_id && packagingItem.quantity)
            .map((packagingItem) => ({
                product_id: itemId,
                ingredient_id: packagingItem.item_id,
                composition_type: 'packaging',
                quantity_required: packagingItem.quantity,
                unit_of_measure: packagingItem.unit_of_measure || null
            }));

        if (packagingRows.length > 0) {
            promises.push(
                ProductComposition.bulkCreate(packagingRows, { transaction })
            );
        }
    }

    await Promise.all(promises);
};

export const itemRepository = {
    async getItems(queryParams = {}) {
        const Item = dbStore.get('Item');
        const ProductComposition = dbStore.get('ProductComposition');
        const ItemFolder = dbStore.get('ItemFolder');

        if (queryParams.fields === 'dropdown') {
            const { limit = 1000, category, status } = queryParams;
            const where = visibleItemWhere({});
            if (category) where.category = category;
            if (status) where.status = status;

            const rows = await Item.findAll({
                where,
                attributes: ['item_id', 'sku_code', 'name', 'unit_of_measure', 'category', 'product_type', 'status', 'current_stock'],
                order: [['name', 'ASC']],
                limit: parseInt(limit, 10)
            });

            const items = rows.map((item) => ({ ...item.toJSON(), id: item.item_id }));
            return {
                items,
                pagination: {
                    page: 1,
                    limit: parseInt(limit, 10),
                    total: items.length,
                    pages: 1
                }
            };
        }

        const {
            page = 1,
            limit = 20,
            category,
            search,
            sortBy = 'name',
            sortOrder = 'asc',
            status
        } = queryParams;

        const parsedPage = parseInt(page, 10);
        const parsedLimit = parseInt(limit, 10);
        const offset = (parsedPage - 1) * parsedLimit;
        const where = visibleItemWhere({});

        let semanticIds = [];

        if (search && search.length > 2) {
            try {
                const semanticResults = await inventoryRepositoryDependencies.searchByMeaning(search, 50, 0.4);
                if (semanticResults.length > 0) {
                    semanticIds = semanticResults.map((result) => result.item_id);
                }
            } catch (error) {
                console.error('Semantic search failed', error);
            }
        }

        if (category) {
            where.category = category;
        }

        if (status) {
            where.status = status;
        }

        if (queryParams.folder_id) {
            if (queryParams.folder_id === 'null' || queryParams.folder_id === 'none') {
                where.folder_id = null;
            } else {
                where.folder_id = queryParams.folder_id;
            }
        }

        if (search) {
            const cleanSearch = search.trim();
            const terms = cleanSearch.split(/\s+/).filter((term) => term.length > 0);

            if (terms.length > 0) {
                where[Op.and] = terms.map((term) => {
                    const variations = getVariations(term);
                    return {
                        [Op.or]: [
                            ...variations.map((variation) => ({ name: { [Op.like]: `%${variation}%` } })),
                            ...variations.map((variation) => ({ sku_code: { [Op.like]: `%${variation}%` } })),
                            ...variations.map((variation) => ({ description: { [Op.like]: `%${variation}%` } }))
                        ]
                    };
                });
            }

            if (semanticIds && semanticIds.length > 0) {
                if (where[Op.and]) {
                    const keywordLogic = where[Op.and];
                    delete where[Op.and];
                    where[Op.or] = [
                        { [Op.and]: keywordLogic },
                        { item_id: { [Op.in]: semanticIds } }
                    ];
                } else {
                    where.item_id = { [Op.in]: semanticIds };
                }
            }
        }

        const order = [[sortBy, sortOrder.toUpperCase()]];

        const { count, rows } = await Item.findAndCountAll({
            where,
            include: [
                {
                    model: ProductComposition,
                    as: 'productCompositions',
                    required: false,
                    include: [{
                        model: Item,
                        as: 'ingredient',
                        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock', 'cost_per_unit']
                    }]
                },
                {
                    model: ItemFolder,
                    as: 'folder',
                    attributes: ['folder_id', 'name']
                }
            ],
            limit: parsedLimit,
            offset: parseInt(offset, 10),
            order
        });

        const transformedItems = rows.map((item) => {
            const itemData = item.toJSON();
            const transformed = {
                ...itemData,
                id: itemData.item_id
            };

            if (itemData.category === 'product' && itemData.productCompositions && itemData.productCompositions.length > 0) {
                transformed.ingredients = itemData.productCompositions
                    .filter((comp) => comp.composition_type === 'ingredient')
                    .map((comp) => ({
                        item_id: comp.ingredient_id,
                        item_name: comp.ingredient?.name || '',
                        quantity: comp.quantity_required,
                        unit: comp.ingredient?.unit_of_measure || 'units'
                    }));

                delete transformed.productCompositions;
            } else {
                delete transformed.productCompositions;
            }

            if (itemData.category === 'product') {
                transformed.recipe_cost = calculateRecipeCost(itemData.productCompositions);
            }

            return transformed;
        });

        return {
            items: transformedItems,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: count,
                pages: Math.ceil(count / parsedLimit)
            }
        };
    },
    async getItemById(itemId) {
        const Item = dbStore.get('Item');
        const ItemNutrition = dbStore.get('ItemNutrition');
        const ItemAllergen = dbStore.get('ItemAllergen');
        const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
        const ItemShelfLife = dbStore.get('ItemShelfLife');
        const ItemPackaging = dbStore.get('ItemPackaging');
        const ItemQualityControl = dbStore.get('ItemQualityControl');
        const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
        const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
        const ProductComposition = dbStore.get('ProductComposition');
        const FIFOBatch = dbStore.get('FIFOBatch');
        const SupplierItem = dbStore.get('SupplierItem');
        const Supplier = dbStore.get('Supplier');
        const ItemFolder = dbStore.get('ItemFolder');

        const item = await findVisibleItemById(Item, itemId, {
            include: [
                { model: ItemNutrition, as: 'nutrition', required: false },
                { model: ItemAllergen, as: 'allergens', required: false },
                { model: ItemPhysicalProperties, as: 'physicalProperties', required: false },
                { model: ItemShelfLife, as: 'shelfLife', required: false },
                { model: ItemPackaging, as: 'packaging', required: false },
                { model: ItemQualityControl, as: 'qualityControl', required: false },
                { model: ItemRegulatoryCompliance, as: 'regulatoryCompliance', required: false },
                { model: ItemCostBreakdown, as: 'costBreakdown', required: false },
                {
                    model: ProductComposition,
                    as: 'productCompositions',
                    required: false,
                    include: [{ model: Item, as: 'ingredient', required: false }]
                },
                { model: FIFOBatch, as: 'fifoBatches', required: false },
                {
                    model: SupplierItem,
                    as: 'supplierItems',
                    required: false,
                    include: [
                        {
                            model: Supplier,
                            as: 'supplier',
                            required: false,
                            where: buildVisibleWhere({}, {
                                statusField: 'status',
                                excludeInactiveStatus: true
                            })
                        }
                    ]
                },
                { model: ItemFolder, as: 'folder', required: false }
            ]
        });

        if (!item) {
            throw notFoundError('Item not found');
        }

        const formattedItem = item.toJSON();

        formattedItem.suppliers = formattedItem.supplierItems?.map((supplierItem) => ({
            supplier_id: supplierItem.supplier.supplier_id,
            name: supplierItem.supplier.name,
            moq: supplierItem.moq,
            price_per_unit: supplierItem.price_per_unit
        })) || [];
        delete formattedItem.supplierItems;

        if (formattedItem.allergens && Array.isArray(formattedItem.allergens)) {
            const directAllergens = formattedItem.allergens
                .filter((allergen) => !allergen.is_cross_contamination)
                .map((allergen) => allergen.allergen_name);
            const mayContainAllergens = formattedItem.allergens
                .filter((allergen) => allergen.is_cross_contamination)
                .map((allergen) => allergen.allergen_name);

            formattedItem.allergens = directAllergens;
            formattedItem.may_contain_allergens = mayContainAllergens;
        }

        if (formattedItem.nutrition) {
            formattedItem.nutritional_info = formattedItem.nutrition;
            delete formattedItem.nutrition;
        }

        if (formattedItem.physicalProperties) {
            formattedItem.physical_properties = formattedItem.physicalProperties;
            delete formattedItem.physicalProperties;
        }

        if (formattedItem.shelfLife) {
            formattedItem.shelf_life = formattedItem.shelfLife;
            delete formattedItem.shelfLife;
        }

        if (formattedItem.packaging) {
            formattedItem.packaging_info = formattedItem.packaging;
            delete formattedItem.packaging;
        }

        if (formattedItem.qualityControl) {
            formattedItem.quality_control = formattedItem.qualityControl;
            delete formattedItem.qualityControl;
        }

        if (formattedItem.regulatoryCompliance) {
            formattedItem.regulatory_compliance = formattedItem.regulatoryCompliance;
            delete formattedItem.regulatoryCompliance;
        }

        if (formattedItem.costBreakdown) {
            formattedItem.labor_cost = formattedItem.costBreakdown.labor_cost;
            formattedItem.overhead_cost = formattedItem.costBreakdown.overhead_cost;
            formattedItem.additional_packaging_cost = formattedItem.costBreakdown.additional_packaging_cost;
            delete formattedItem.costBreakdown;
        }

        if (formattedItem.productCompositions) {
            formattedItem.ingredients = formattedItem.productCompositions
                .filter((comp) => comp.composition_type === 'ingredient')
                .map((comp) => ({
                    item_id: comp.ingredient_id,
                    item_name: comp.ingredient?.name,
                    quantity: comp.quantity_required,
                    unit_of_measure: comp.ingredient?.unit_of_measure
                }));

            formattedItem.packaging_items = formattedItem.productCompositions
                .filter((comp) => comp.composition_type === 'packaging')
                .map((comp) => ({
                    item_id: comp.ingredient_id,
                    item_name: comp.ingredient?.name,
                    quantity: comp.quantity_required,
                    unit_of_measure: comp.ingredient?.unit_of_measure
                }));

            delete formattedItem.productCompositions;
            formattedItem.recipe_cost = calculateRecipeCost(item.productCompositions);
        }

        if (formattedItem.fifoBatches) {
            formattedItem.fifo_batches = formattedItem.fifoBatches;
            delete formattedItem.fifoBatches;
        }

        return formattedItem;
    },
    async createItem(itemData, userId = null) {
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            if (itemData.status !== 'draft' && itemData.sku_code) {
                const existingItem = await Item.findOne({
                    where: {
                        sku_code: itemData.sku_code,
                        deleted_at: null,
                        status: { [Op.notIn]: ['draft', 'inactive'] }
                    }
                });

                if (existingItem) {
                    const error = new Error('Item with this SKU code already exists');
                    error.statusCode = 409;
                    throw error;
                }
            }

            const {
                labor_cost,
                overhead_cost,
                additional_packaging_cost,
                ingredients,
                packaging_items,
                nutritional_info,
                allergens,
                may_contain_allergens,
                physical_properties,
                shelf_life,
                packaging_info,
                quality_control,
                regulatory_compliance,
                ...dbFields
            } = itemData;

            if (itemData.status === 'draft') {
                dbFields.wizard_metadata = {
                    ...dbFields.wizard_metadata,
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };
            }

            if (dbFields.max_capacity) {
                const thresholds = await calculateThresholds(dbFields.max_capacity);
                dbFields.min_threshold = thresholds.min_threshold;
                dbFields.purchase_allowance = thresholds.purchase_allowance;
            }

            const dataToCreate = { ...dbFields };
            const initialStock = parseFloat(dbFields.current_stock || 0);
            if (dbFields.fifo_enabled && initialStock > 0) {
                dataToCreate.current_stock = 0;
            }

            const item = await Item.create(dataToCreate, { transaction });

            if (dbFields.fifo_enabled && initialStock > 0) {
                await inventoryRepositoryDependencies.createStockMovement({
                    item_id: item.item_id,
                    quantity: initialStock,
                    movement_type: 'adjustment',
                    notes: 'Initial stock entry from item creation',
                    reference_type: 'MANUAL'
                }, userId, transaction);
            }

            if (itemData.status === 'active' && itemData.category === 'product') {
                const wizardData = {
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };

                await saveRelatedWizardData(item.item_id, wizardData, transaction);
            }

            await transaction.commit();

            inventoryRepositoryDependencies.syncItemEmbedding(item).catch((error) => (
                console.error(`Embedding sync failed for new item ${item.item_id}:`, error.message)
            ));

            return itemRepository.getItemById(item.item_id);
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            throw error;
        }
    },
    async updateItem(itemId, itemData, userId = null) {
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const item = await findVisibleItemById(Item, itemId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!item) {
                throw notFoundError('Item not found');
            }

            if (itemData.sku_code && itemData.sku_code !== item.sku_code) {
                const existingItem = await Item.findOne({
                    where: {
                        sku_code: itemData.sku_code,
                        deleted_at: null,
                        status: { [Op.notIn]: ['draft', 'inactive'] },
                        item_id: { [Op.ne]: itemId }
                    }
                });

                if (existingItem) {
                    const error = new Error('Item with this SKU code already exists');
                    error.statusCode = 409;
                    throw error;
                }
            }

            const {
                labor_cost,
                overhead_cost,
                additional_packaging_cost,
                ingredients,
                packaging_items,
                nutritional_info,
                allergens,
                may_contain_allergens,
                physical_properties,
                shelf_life,
                packaging_info,
                quality_control,
                regulatory_compliance,
                ...dbFields
            } = itemData;

            if (itemData.status === 'draft' || item.status === 'draft') {
                dbFields.wizard_metadata = {
                    ...(item.wizard_metadata || {}),
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };
            }

            if (dbFields.max_capacity !== undefined) {
                const thresholds = await calculateThresholds(dbFields.max_capacity);
                dbFields.min_threshold = thresholds.min_threshold;
                dbFields.purchase_allowance = thresholds.purchase_allowance;
            }

            dbFields.updated_by = userId;

            const newStockValue = dbFields.current_stock !== undefined
                ? parseFloat(dbFields.current_stock || 0)
                : null;
            const oldStockValue = parseFloat(item.current_stock || 0);

            if (newStockValue !== null && newStockValue !== oldStockValue && item.fifo_enabled) {
                const delta = newStockValue - oldStockValue;
                delete dbFields.current_stock;

                await item.update(dbFields, { transaction });
                await inventoryRepositoryDependencies.createStockMovement({
                    item_id: itemId,
                    quantity: Math.abs(delta),
                    movement_type: delta > 0 ? 'adjustment' : 'calculated_loss',
                    notes: `Manual stock adjustment from item update form (Old: ${oldStockValue}, New: ${newStockValue})`,
                    reference_type: 'MANUAL'
                }, userId, transaction);
            } else {
                await item.update(dbFields, { transaction });
            }

            if (item.status === 'active' && item.category === 'product') {
                const wizardData = {
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };

                await saveRelatedWizardData(itemId, wizardData, transaction);
            }

            await transaction.commit();
            return itemRepository.getItemById(itemId);
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            throw error;
        }
    },
    async finalizeItem(itemId, itemData = {}, userId = null) {
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const item = await findVisibleItemById(Item, itemId, { transaction });
            if (!item) {
                throw notFoundError('Item not found');
            }

            if (item.status !== 'draft') {
                const error = new Error('Only draft items can be finalized');
                error.statusCode = 400;
                throw error;
            }

            const wizardData = item.wizard_metadata || {};
            const mergedData = {
                ...wizardData,
                sku_code: item.sku_code,
                name: item.name,
                category: item.category,
                description: item.description,
                product_folder: item.product_folder,
                max_capacity: item.max_capacity,
                min_threshold: item.min_threshold,
                purchase_allowance: item.purchase_allowance,
                unit_of_measure: item.unit_of_measure,
                cost_per_unit: item.cost_per_unit,
                current_stock: item.current_stock,
                fifo_enabled: item.fifo_enabled,
                batch_size: item.batch_size,
                yield_percentage: item.yield_percentage,
                processing_loss: item.processing_loss,
                production_notes: item.production_notes,
                ...itemData
            };

            if (!mergedData.sku_code) {
                const error = new Error('SKU code is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (!mergedData.category) {
                const error = new Error('Category is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (!mergedData.max_capacity) {
                const error = new Error('Max capacity is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (!mergedData.unit_of_measure) {
                const error = new Error('Unit of measure is required to finalize item');
                error.statusCode = 422;
                throw error;
            }

            const existingItem = await Item.findOne({
                where: {
                    sku_code: mergedData.sku_code,
                    deleted_at: null,
                    status: { [Op.notIn]: ['draft', 'inactive'] },
                    item_id: { [Op.ne]: itemId }
                },
                transaction
            });

            if (existingItem) {
                const error = new Error('Item with this SKU code already exists');
                error.statusCode = 409;
                throw error;
            }

            await saveRelatedWizardData(itemId, wizardData, transaction);

            const itemFields = { ...mergedData };
            delete itemFields.labor_cost;
            delete itemFields.overhead_cost;
            delete itemFields.additional_packaging_cost;
            delete itemFields.ingredients;
            delete itemFields.packaging_items;
            delete itemFields.nutritional_info;
            delete itemFields.allergens;
            delete itemFields.may_contain_allergens;
            delete itemFields.physical_properties;
            delete itemFields.shelf_life;
            delete itemFields.packaging_info;
            delete itemFields.quality_control;
            delete itemFields.regulatory_compliance;

            const updateData = {
                ...itemFields,
                status: 'active',
                wizard_metadata: null,
                updated_by: userId
            };

            await item.update(updateData, { transaction });
            await transaction.commit();

            inventoryRepositoryDependencies.syncItemEmbedding(item).catch((error) => (
                console.error(`Embedding sync failed for item ${item.item_id}:`, error.message)
            ));

            const ItemNutrition = dbStore.get('ItemNutrition');
            const ItemAllergen = dbStore.get('ItemAllergen');
            const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
            const ItemShelfLife = dbStore.get('ItemShelfLife');
            const ItemPackaging = dbStore.get('ItemPackaging');
            const ItemQualityControl = dbStore.get('ItemQualityControl');
            const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
            const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
            const FIFOBatch = dbStore.get('FIFOBatch');
            const ProductComposition = dbStore.get('ProductComposition');

            return findVisibleItemById(Item, itemId, {
                include: [
                    { model: ItemNutrition, as: 'nutrition', required: false },
                    { model: ItemAllergen, as: 'allergens', required: false },
                    { model: ItemPhysicalProperties, as: 'physicalProperties', required: false },
                    { model: ItemShelfLife, as: 'shelfLife', required: false },
                    { model: ItemPackaging, as: 'packaging', required: false },
                    { model: ItemQualityControl, as: 'qualityControl', required: false },
                    { model: ItemRegulatoryCompliance, as: 'regulatoryCompliance', required: false },
                    { model: ItemCostBreakdown, as: 'costBreakdown', required: false },
                    {
                        model: FIFOBatch,
                        as: 'fifoBatches',
                        required: false,
                        include: [{ model: Item, as: 'item', attributes: ['unit_of_measure'] }]
                    },
                    {
                        model: ProductComposition,
                        as: 'productCompositions',
                        required: false,
                        include: [{ model: Item, as: 'ingredient', required: false }]
                    }
                ]
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },
    async deleteItem(itemId, userId) {
        const Item = dbStore.get('Item');
        const ProductComposition = dbStore.get('ProductComposition');
        const POLineItem = dbStore.get('POLineItem');
        const PurchaseOrder = dbStore.get('PurchaseOrder');
        const JOIngredient = dbStore.get('JOIngredient');
        const JobOrder = dbStore.get('JobOrder');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        const errors = [];

        const productCompositions = await ProductComposition.findAll({
            where: { ingredient_id: itemId },
            include: [{
                model: Item,
                as: 'product',
                attributes: ['name', 'sku_code', 'status'],
                where: buildVisibleWhere({ status: 'active' })
            }]
        });
        if (productCompositions.length > 0) {
            const productNames = productCompositions
                .map((pc) => `${pc.product.name} (${pc.product.sku_code})`)
                .join(', ');
            errors.push(`Used as ingredient in ${productCompositions.length} active product(s): ${productNames}`);
        }

        const poLineItems = await POLineItem.findAll({
            where: { item_id: itemId },
            include: [{
                model: PurchaseOrder,
                as: 'purchaseOrder',
                attributes: ['po_number', 'status'],
                where: { archived_at: null }
            }]
        });
        if (poLineItems.length > 0) {
            const poNumbers = poLineItems
                .map((po) => `${po.purchaseOrder.po_number} (${po.purchaseOrder.status})`)
                .join(', ');
            errors.push(`Referenced in ${poLineItems.length} purchase order(s): ${poNumbers}`);
        }

        const joIngredients = await JOIngredient.findAll({
            where: { item_id: itemId },
            include: [{
                model: JobOrder,
                as: 'jobOrder',
                attributes: ['jo_number', 'status'],
                where: { archived_at: null }
            }]
        });
        if (joIngredients.length > 0) {
            const joNumbers = joIngredients
                .map((jo) => `${jo.jobOrder.jo_number} (${jo.jobOrder.status})`)
                .join(', ');
            errors.push(`Referenced in ${joIngredients.length} job order(s): ${joNumbers}`);
        }

        if (errors.length > 0) {
            const error = new Error(`Cannot delete item "${item.name}". Reasons:\n- ${errors.join('\n- ')}`);
            error.statusCode = 400;
            error.details = errors;
            throw error;
        }

        await item.update({
            status: 'inactive',
            deleted_by: userId,
            deleted_at: new Date()
        });

        return true;
    },
    async getItemStockHistory(itemId, queryParams = {}) {
        const Item = dbStore.get('Item');
        const StockMovement = dbStore.get('StockMovement');
        const User = dbStore.get('User');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        const {
            startDate,
            endDate,
            movementType,
            limit = 50
        } = queryParams;

        const where = { item_id: itemId };

        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) {
                where.timestamp[Op.gte] = new Date(startDate);
            }
            if (endDate) {
                where.timestamp[Op.lte] = new Date(endDate);
            }
        }

        if (movementType) {
            where.movement_type = movementType;
        }

        const movements = await StockMovement.findAll({
            where,
            limit: parseInt(limit, 10),
            order: [['timestamp', 'DESC']],
            include: [
                {
                    model: User,
                    as: 'userResponsible',
                    required: false,
                    attributes: ['username']
                }
            ]
        });

        return movements.map((movement) => {
            const m = movement.toJSON();
            return {
                movement_id: m.movement_id,
                item_id: m.item_id,
                movement_type: m.movement_type,
                quantity: m.quantity,
                reference_id: m.reference_id,
                reference_type: m.reference_type,
                user_responsible: m.userResponsible?.username || null,
                timestamp: m.timestamp
            };
        });
    },
    async getItemBatches(itemId) {
        const Item = dbStore.get('Item');
        const FIFOBatch = dbStore.get('FIFOBatch');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        return FIFOBatch.findAll({
            where: {
                item_id: itemId,
                [Op.and]: [
                    sequelize.where(
                        sequelize.col('quantity'),
                        Op.gt,
                        sequelize.col('quantity_consumed')
                    )
                ]
            },
            order: [['received_date', 'ASC']]
        });
    },
    async getItemMovements(itemId) {
        const Item = dbStore.get('Item');
        const StockMovement = dbStore.get('StockMovement');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        return StockMovement.findAll({
            where: { item_id: itemId },
            order: [['timestamp', 'DESC']],
            limit: 50
        });
    },
    validateComposition(productId, ingredientIds) {
        return inventoryRepositoryDependencies.validateComposition(productId, ingredientIds);
    },
    async getItemSupplierCoverage() {
        const Item = dbStore.get('Item');
        const Supplier = dbStore.get('Supplier');
        const SupplierItem = dbStore.get('SupplierItem');
        const purchasableCategories = ['raw_material', 'packaging', 'supplies'];

        const allItems = await Item.findAll({
            where: visibleItemWhere({
                status: 'active',
                category: { [Op.in]: purchasableCategories }
            }),
            attributes: ['item_id', 'name', 'sku_code', 'category', 'current_stock', 'min_threshold', 'unit_of_measure'],
            order: [['name', 'ASC']]
        });

        const supplierItems = await SupplierItem.findAll({
            include: [{
                model: Supplier,
                as: 'supplier',
                attributes: ['supplier_id', 'name', 'status'],
                where: buildVisibleWhere({ status: 'active' })
            }],
            attributes: ['item_id', 'supplier_id', 'moq', 'price_per_unit']
        });

        const itemSupplierMap = new Map();
        supplierItems.forEach((si) => {
            try {
                const supplierItemId = si.item_id;
                if (!supplierItemId) return;

                if (!itemSupplierMap.has(supplierItemId)) {
                    itemSupplierMap.set(supplierItemId, []);
                }

                const supplierName = si.supplier?.name || 'Unknown Supplier';
                itemSupplierMap.get(supplierItemId).push({
                    supplier_id: si.supplier_id,
                    supplier_name: supplierName,
                    moq: si.moq || 0,
                    price_per_unit: si.price_per_unit || 0
                });
            } catch (error) {
                console.error(`Error processing supplier item ${si.supplier_item_id || 'unknown'}:`, error.message);
            }
        });

        const itemsWithSupplier = [];
        const itemsWithoutSupplier = [];

        allItems.forEach((item) => {
            const itemData = {
                item_id: item.item_id,
                id: item.item_id,
                name: item.name,
                sku_code: item.sku_code,
                category: item.category,
                current_stock: item.current_stock,
                min_threshold: item.min_threshold,
                unit_of_measure: item.unit_of_measure
            };

            if (itemSupplierMap.has(item.item_id)) {
                itemData.suppliers = itemSupplierMap.get(item.item_id);
                itemData.supplier_count = itemData.suppliers.length;
                itemsWithSupplier.push(itemData);
                return;
            }

            itemData.suppliers = [];
            itemData.supplier_count = 0;
            itemsWithoutSupplier.push(itemData);
        });

        return {
            items_with_supplier: itemsWithSupplier,
            items_without_supplier: itemsWithoutSupplier,
            summary: {
                total_purchasable_items: allItems.length,
                items_with_supplier_count: itemsWithSupplier.length,
                items_without_supplier_count: itemsWithoutSupplier.length,
                coverage_percent: allItems.length > 0
                    ? Math.round((itemsWithSupplier.length / allItems.length) * 100)
                    : 100
            }
        };
    },
    async listFolders() {
        const ItemFolder = dbStore.get('ItemFolder');
        const Item = dbStore.get('Item');

        try {
            const folders = await ItemFolder.findAll({
                include: [
                    {
                        model: Item,
                        as: 'items',
                        attributes: ['item_id'],
                        required: false,
                        where: buildVisibleWhere(
                            {},
                            { statusField: 'status', excludeInactiveStatus: true }
                        )
                    }
                ]
            });

            return folders.map((folder) => ({
                folder_id: folder.folder_id,
                name: folder.name,
                description: folder.description,
                parent_id: folder.parent_id,
                item_count: folder.items?.length || 0
            }));
        } catch (error) {
            logger.error('Error listing inventory folders:', error);
            throw error;
        }
    },
    async createFolder(name, description = '', parent_id = null) {
        const ItemFolder = dbStore.get('ItemFolder');

        try {
            const folder = await ItemFolder.create({
                name,
                description,
                parent_id
            });

            return {
                success: true,
                folder_id: folder.folder_id,
                name: folder.name,
                message: `Inventory folder "${name}" created successfully`
            };
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                throw new Error(`Folder "${name}" already exists`, { cause: error });
            }
            logger.error('Error creating inventory folder:', error);
            throw error;
        }
    },
    async deleteFolder(folderId) {
        const ItemFolder = dbStore.get('ItemFolder');
        const Item = dbStore.get('Item');

        const folder = await ItemFolder.findByPk(folderId);
        if (!folder) {
            const error = new Error('Folder not found');
            error.statusCode = 404;
            throw error;
        }

        const [unassignedCount] = await Item.update(
            { folder_id: null, product_folder: null },
            {
                where: buildVisibleWhere(
                    { folder_id: folderId },
                    { statusField: 'status', excludeInactiveStatus: true }
                )
            }
        );

        await folder.destroy();

        return {
            success: true,
            unassigned_count: unassignedCount,
            message: `Folder "${folder.name}" deleted successfully. ${unassignedCount} item(s) unassigned.`
        };
    }
};

assertItemRepositoryContract(itemRepository);
