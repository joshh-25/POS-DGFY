import { itemQueryUseCases } from '../modules/inventory/usecases/itemQueryUseCases.js';
import { itemCommandUseCases } from '../modules/inventory/usecases/itemCommandUseCases.js';
import { itemPolicyValidation } from '../modules/inventory/usecases/itemPolicyValidation.js';

/**
 * Compatibility facade for inventory item operations.
 *
 * During migration to module use-cases, legacy consumers continue importing
 * this service while execution delegates to inventory module boundaries.
 */
export const getItems = async (queryParams = {}) => itemQueryUseCases.getItems(queryParams);

export const getItemById = async (itemId) => itemQueryUseCases.getItemById(itemId);

export const createItem = async (itemData, userId = null) => itemCommandUseCases.createItem(itemData, userId);

export const updateItem = async (itemId, itemData, userId = null) => itemCommandUseCases.updateItem(itemId, itemData, userId);

export const replaceItemSuppliers = async (itemId, suppliers = []) => itemCommandUseCases.replaceItemSuppliers(itemId, suppliers);

export const deleteItem = async (itemId, userId) => itemCommandUseCases.deleteItem(itemId, userId);

export const finalizeItem = async (itemId, itemData = {}, userId = null) => itemCommandUseCases.finalizeItem(itemId, itemData, userId);

export const getItemStockHistory = async (itemId, queryParams = {}) => itemQueryUseCases.getItemStockHistory(itemId, queryParams);

export const getItemBatches = async (itemId, queryParams = {}) => itemQueryUseCases.getItemBatches(itemId, queryParams);

export const getItemMovements = async (itemId) => itemQueryUseCases.getItemMovements(itemId);

export const getItemSupplierCoverage = async () => itemQueryUseCases.getItemSupplierCoverage();

export const validateComposition = async (productId, ingredientIds) => itemPolicyValidation.validateComposition(productId, ingredientIds);
