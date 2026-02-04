import defaultDb from '../models/index.js';

/**
 * Dynamically re-binds models to a specific tenant's Sequelize instance.
 * This is crucial for multi-tenancy to ensure queries run against the correct database.
 * 
 * @param {Sequelize} sequelize - The tenant-specific sequelize connection
 * @returns {Object} map of ModelName -> ModelClass (bound to tenant DB)
 */
export const getTenantModels = (sequelize) => {
    const models = {};
    const defaultModels = defaultDb;

    // List of models to re-bind
    const modelNames = [
        'User', 'Item', 'Supplier', 'PurchaseOrder', 'JobOrder', 'StockMovement',
        'FIFOBatch', 'ItemNutrition', 'ItemAllergen', 'ProductComposition',
        'SupplierItem', 'BulkDiscount', 'ItemPhysicalProperties',
        'ItemShelfLife', 'ItemPackaging', 'ItemQualityControl',
        'ItemRegulatoryCompliance', 'ItemCostBreakdown', 'POLineItem',
        'JOIngredient', 'BatchTransaction', 'AuditLog', 'SystemSetting',
        'BatchLineage', 'ReceiveToken', 'ReportSnapshot', 'PendingAIAction',
        'AIConversation', 'ItemEmbedding', 'ItemFolder'
    ];

    // Re-define each model on the new connection
    modelNames.forEach(name => {
        const originalModel = defaultModels[name];
        if (originalModel) {
            // We clone the model definition
            models[name] = sequelize.define(
                originalModel.name,
                originalModel.rawAttributes,
                {
                    ...originalModel.options,
                    sequelize // Bind to new instance
                }
            );
        }
    });

    // Re-establish Associations (Mirrored from models/index.js)
    const {
        User, Item, Supplier, PurchaseOrder, JobOrder, StockMovement, FIFOBatch,
        ItemNutrition, ItemAllergen, ProductComposition, SupplierItem, BulkDiscount,
        ItemPhysicalProperties, ItemShelfLife, ItemPackaging, ItemQualityControl,
        ItemRegulatoryCompliance, ItemCostBreakdown, POLineItem, JOIngredient,
        BatchTransaction, AuditLog, SystemSetting, BatchLineage, ReceiveToken,
        ReportSnapshot, PendingAIAction, AIConversation, ItemEmbedding, ItemFolder
    } = models;

    // --- Association Logic ---

    // User
    if (User) {
        if (AuditLog) User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
        if (PurchaseOrder) User.hasMany(PurchaseOrder, { foreignKey: 'created_by', as: 'createdPurchaseOrders' });
        if (JobOrder) User.hasMany(JobOrder, { foreignKey: 'responsible_user', as: 'jobOrders' });
        if (StockMovement) User.hasMany(StockMovement, { foreignKey: 'user_responsible', as: 'stockMovements' });
        if (ReceiveToken) User.hasMany(ReceiveToken, { foreignKey: 'created_by', as: 'createdTokens' });
        if (PendingAIAction) User.hasMany(PendingAIAction, { foreignKey: 'user_id', as: 'pendingAIActions' });
        if (AIConversation) User.hasMany(AIConversation, { foreignKey: 'user_id', as: 'aiConversations' });
    }

    // Item
    if (Item) {
        if (FIFOBatch) Item.hasMany(FIFOBatch, { foreignKey: 'item_id', as: 'fifoBatches' });
        if (ItemNutrition) Item.hasOne(ItemNutrition, { foreignKey: 'item_id', as: 'nutrition' });
        if (ItemAllergen) Item.hasMany(ItemAllergen, { foreignKey: 'item_id', as: 'allergens' });
        if (ItemPhysicalProperties) Item.hasOne(ItemPhysicalProperties, { foreignKey: 'item_id', as: 'physicalProperties' });
        if (ItemShelfLife) Item.hasOne(ItemShelfLife, { foreignKey: 'item_id', as: 'shelfLife' });
        if (ItemPackaging) Item.hasOne(ItemPackaging, { foreignKey: 'item_id', as: 'packaging' });
        if (ItemQualityControl) Item.hasOne(ItemQualityControl, { foreignKey: 'item_id', as: 'qualityControl' });
        if (ItemRegulatoryCompliance) Item.hasOne(ItemRegulatoryCompliance, { foreignKey: 'item_id', as: 'regulatoryCompliance' });
        if (ItemCostBreakdown) Item.hasOne(ItemCostBreakdown, { foreignKey: 'item_id', as: 'costBreakdown' });
        if (ProductComposition) Item.hasMany(ProductComposition, { foreignKey: 'product_id', as: 'productCompositions' });
        if (ProductComposition) Item.hasMany(ProductComposition, { foreignKey: 'ingredient_id', as: 'ingredientCompositions' });
        if (SupplierItem) Item.hasMany(SupplierItem, { foreignKey: 'item_id', as: 'supplierItems' });
        if (POLineItem) Item.hasMany(POLineItem, { foreignKey: 'item_id', as: 'poLineItems' });
        if (JobOrder) Item.hasMany(JobOrder, { foreignKey: 'product_id', as: 'jobOrders' });
        if (JOIngredient) Item.hasMany(JOIngredient, { foreignKey: 'item_id', as: 'joIngredients' });
        if (StockMovement) Item.hasMany(StockMovement, { foreignKey: 'item_id', as: 'stockMovements' });
        if (ItemEmbedding) Item.hasOne(ItemEmbedding, { foreignKey: 'item_id', as: 'embedding' });
        if (ItemFolder) Item.belongsTo(ItemFolder, { foreignKey: 'folder_id', as: 'folder' });
    }

    // ItemFolder
    if (ItemFolder) {
        if (Item) ItemFolder.hasMany(Item, { foreignKey: 'folder_id', as: 'items' });
        ItemFolder.hasMany(ItemFolder, { foreignKey: 'parent_id', as: 'children' });
        ItemFolder.belongsTo(ItemFolder, { foreignKey: 'parent_id', as: 'parent' });
    }

    // Supplier
    if (Supplier) {
        if (SupplierItem) Supplier.hasMany(SupplierItem, { foreignKey: 'supplier_id', as: 'supplierItems' });
        if (BulkDiscount) Supplier.hasMany(BulkDiscount, { foreignKey: 'supplier_id', as: 'bulkDiscounts' });
        if (PurchaseOrder) Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplier_id', as: 'purchaseOrders' });
    }

    // PurchaseOrder
    if (PurchaseOrder) {
        if (Supplier) PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
        if (User) PurchaseOrder.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
        if (User) PurchaseOrder.belongsTo(User, { foreignKey: 'received_by', as: 'receiver' });
        if (POLineItem) PurchaseOrder.hasMany(POLineItem, { foreignKey: 'po_id', as: 'lineItems' });
        if (POLineItem) PurchaseOrder.hasMany(POLineItem, { foreignKey: 'po_id', as: 'items' }); // Alias
    }

    // POLineItem
    if (POLineItem) {
        if (PurchaseOrder) POLineItem.belongsTo(PurchaseOrder, { foreignKey: 'po_id', as: 'purchaseOrder' });
        if (Item) POLineItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    }

    // JobOrder
    if (JobOrder) {
        if (Item) JobOrder.belongsTo(Item, { foreignKey: 'product_id', as: 'product' });
        if (User) JobOrder.belongsTo(User, { foreignKey: 'responsible_user', as: 'responsibleUser' });
        if (User) JobOrder.belongsTo(User, { foreignKey: 'completed_by', as: 'completedByUser' });
        if (JOIngredient) JobOrder.hasMany(JOIngredient, { foreignKey: 'jo_id', as: 'ingredients' });
    }

    // JOIngredient
    if (JOIngredient) {
        if (JobOrder) JOIngredient.belongsTo(JobOrder, { foreignKey: 'jo_id', as: 'jobOrder' });
        if (Item) JOIngredient.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
        if (FIFOBatch) JOIngredient.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });
    }

    // StockMovement
    if (StockMovement) {
        if (Item) StockMovement.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
        if (User) StockMovement.belongsTo(User, { foreignKey: 'user_responsible', as: 'userResponsible' });
        if (FIFOBatch) StockMovement.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });
        if (BatchTransaction) StockMovement.hasMany(BatchTransaction, { foreignKey: 'movement_id', as: 'batchTransactions' });
    }

    // FIFOBatch
    if (FIFOBatch) {
        if (Item) FIFOBatch.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
        if (BatchTransaction) FIFOBatch.hasMany(BatchTransaction, { foreignKey: 'batch_id', as: 'batchTransactions' });
        if (BatchLineage) FIFOBatch.hasMany(BatchLineage, { foreignKey: 'parent_batch_id', as: 'asParent' });
        if (BatchLineage) FIFOBatch.hasMany(BatchLineage, { foreignKey: 'child_batch_id', as: 'asChild' });
    }

    // BatchTransaction
    if (BatchTransaction) {
        if (StockMovement) BatchTransaction.belongsTo(StockMovement, { foreignKey: 'movement_id', as: 'movement' });
        if (FIFOBatch) BatchTransaction.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });
    }

    // BatchLineage
    if (BatchLineage) {
        if (FIFOBatch) BatchLineage.belongsTo(FIFOBatch, { foreignKey: 'parent_batch_id', as: 'parentBatch' });
        if (FIFOBatch) BatchLineage.belongsTo(FIFOBatch, { foreignKey: 'child_batch_id', as: 'childBatch' });
    }

    // SupplierItem
    if (SupplierItem) {
        if (Supplier) SupplierItem.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
        if (Item) SupplierItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    }

    // BulkDiscount
    if (BulkDiscount) {
        if (Supplier) BulkDiscount.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
    }

    // Item Sub-tables
    if (ItemNutrition && Item) ItemNutrition.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemAllergen && Item) ItemAllergen.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemPhysicalProperties && Item) ItemPhysicalProperties.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemShelfLife && Item) ItemShelfLife.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemPackaging && Item) ItemPackaging.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemQualityControl && Item) ItemQualityControl.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemRegulatoryCompliance && Item) ItemRegulatoryCompliance.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
    if (ItemCostBreakdown && Item) ItemCostBreakdown.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

    // ProductComposition
    if (ProductComposition) {
        if (Item) ProductComposition.belongsTo(Item, { foreignKey: 'product_id', as: 'product' });
        if (Item) ProductComposition.belongsTo(Item, { foreignKey: 'ingredient_id', as: 'ingredient' });
    }

    // AuditLog
    if (AuditLog && User) AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

    // ReceiveToken
    if (ReceiveToken && User) {
        ReceiveToken.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
        ReceiveToken.belongsTo(User, { foreignKey: 'used_by', as: 'usedByUser' });
    }

    // AI
    if (PendingAIAction && User) PendingAIAction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
    if (AIConversation && User) AIConversation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

    return models;
};
