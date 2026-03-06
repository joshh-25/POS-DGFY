/**
 * Item repository contract.
 *
 * During migration, this repository is a compatibility adapter that shields
 * controllers/use-cases from legacy service wiring.
 */
export const ItemRepositoryContract = Object.freeze([
    'getItems',
    'getItemById',
    'createItem',
    'updateItem',
    'finalizeItem',
    'deleteItem',
    'getItemStockHistory',
    'getItemBatches',
    'getItemMovements',
    'validateComposition',
    'getItemSupplierCoverage',
    'listFolders',
    'createFolder',
    'deleteFolder'
]);

export const assertItemRepositoryContract = (repository) => {
    ItemRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`ItemRepository missing required method: ${method}`);
        }
    });
};
