import sequelize from '../config/database.js';
import User from './User.js';
import Item from './Item.js';
import Supplier from './Supplier.js';
import PurchaseOrder from './PurchaseOrder.js';
import JobOrder from './JobOrder.js';
import StockMovement from './StockMovement.js';
import FIFOBatch from './FIFOBatch.js';
import ItemNutrition from './ItemNutrition.js';
import ItemAllergen from './ItemAllergen.js';
import ProductComposition from './ProductComposition.js';
import SupplierItem from './SupplierItem.js';
import BulkDiscount from './BulkDiscount.js';
import ItemPhysicalProperties from './ItemPhysicalProperties.js';
import ItemShelfLife from './ItemShelfLife.js';
import ItemPackaging from './ItemPackaging.js';
import ItemQualityControl from './ItemQualityControl.js';
import ItemRegulatoryCompliance from './ItemRegulatoryCompliance.js';
import ItemCostBreakdown from './ItemCostBreakdown.js';
import POLineItem from './POLineItem.js';
import JOIngredient from './JOIngredient.js';
import BatchTransaction from './BatchTransaction.js';
import AuditLog from './AuditLog.js';
import SystemSetting from './SystemSetting.js';
import BatchLineage from './BatchLineage.js';
import ReceiveToken from './ReceiveToken.js';
import ReportSnapshot from './ReportSnapshot.js';
import PendingAIAction from './PendingAIAction.js';
import AIConversation from './AIConversation.js';
import ItemEmbedding from './ItemEmbedding.js';
import ItemFolder from './ItemFolder.js';
import TenantFactory from './Landlord/Tenant.js';
import UserTenantMappingFactory from './Landlord/UserTenantMapping.js';
const Tenant = TenantFactory(sequelize);
const UserTenantMapping = UserTenantMappingFactory(sequelize);

// Define associations
// User associations
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
User.hasMany(PurchaseOrder, { foreignKey: 'created_by', as: 'createdPurchaseOrders' });
User.hasMany(JobOrder, { foreignKey: 'responsible_user', as: 'jobOrders' });
User.hasMany(StockMovement, { foreignKey: 'user_responsible', as: 'stockMovements' });

// ItemFolder associations
ItemFolder.hasMany(Item, { foreignKey: 'folder_id', as: 'items' });
ItemFolder.hasMany(ItemFolder, { foreignKey: 'parent_id', as: 'children' });
ItemFolder.belongsTo(ItemFolder, { foreignKey: 'parent_id', as: 'parent' });
Item.belongsTo(ItemFolder, { foreignKey: 'folder_id', as: 'folder' });

// Item associations
Item.hasMany(FIFOBatch, { foreignKey: 'item_id', as: 'fifoBatches' });
Item.hasOne(ItemNutrition, { foreignKey: 'item_id', as: 'nutrition' });
Item.hasMany(ItemAllergen, { foreignKey: 'item_id', as: 'allergens' });
Item.hasOne(ItemPhysicalProperties, { foreignKey: 'item_id', as: 'physicalProperties' });
Item.hasOne(ItemShelfLife, { foreignKey: 'item_id', as: 'shelfLife' });
Item.hasOne(ItemPackaging, { foreignKey: 'item_id', as: 'packaging' });
Item.hasOne(ItemQualityControl, { foreignKey: 'item_id', as: 'qualityControl' });
Item.hasOne(ItemRegulatoryCompliance, { foreignKey: 'item_id', as: 'regulatoryCompliance' });
Item.hasOne(ItemCostBreakdown, { foreignKey: 'item_id', as: 'costBreakdown' });
Item.hasMany(ProductComposition, { foreignKey: 'product_id', as: 'productCompositions' });
Item.hasMany(ProductComposition, { foreignKey: 'ingredient_id', as: 'ingredientCompositions' });
Item.hasMany(SupplierItem, { foreignKey: 'item_id', as: 'supplierItems' });
Item.hasMany(POLineItem, { foreignKey: 'item_id', as: 'poLineItems' });
Item.hasMany(JobOrder, { foreignKey: 'product_id', as: 'jobOrders' });
Item.hasMany(JOIngredient, { foreignKey: 'item_id', as: 'joIngredients' });

Item.hasMany(StockMovement, { foreignKey: 'item_id', as: 'stockMovements' });
Item.hasOne(ItemEmbedding, { foreignKey: 'item_id', as: 'embedding' });

// Supplier associations
Supplier.hasMany(SupplierItem, { foreignKey: 'supplier_id', as: 'supplierItems' });
Supplier.hasMany(BulkDiscount, { foreignKey: 'supplier_id', as: 'bulkDiscounts' });
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplier_id', as: 'purchaseOrders' });

// PurchaseOrder associations
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
PurchaseOrder.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
PurchaseOrder.belongsTo(User, { foreignKey: 'received_by', as: 'receiver' });
PurchaseOrder.hasMany(POLineItem, { foreignKey: 'po_id', as: 'lineItems' });
PurchaseOrder.hasMany(POLineItem, { foreignKey: 'po_id', as: 'items' }); // Alias for reports

// POLineItem associations
POLineItem.belongsTo(PurchaseOrder, { foreignKey: 'po_id', as: 'purchaseOrder' });
POLineItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// JobOrder associations
JobOrder.belongsTo(Item, { foreignKey: 'product_id', as: 'product' });
JobOrder.belongsTo(User, { foreignKey: 'responsible_user', as: 'responsibleUser' });
JobOrder.belongsTo(User, { foreignKey: 'completed_by', as: 'completedByUser' });
JobOrder.hasMany(JOIngredient, { foreignKey: 'jo_id', as: 'ingredients' });

// JOIngredient associations
JOIngredient.belongsTo(JobOrder, { foreignKey: 'jo_id', as: 'jobOrder' });
JOIngredient.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
JOIngredient.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });

// StockMovement associations
StockMovement.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
StockMovement.belongsTo(User, { foreignKey: 'user_responsible', as: 'userResponsible' });
StockMovement.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });
StockMovement.hasMany(BatchTransaction, { foreignKey: 'movement_id', as: 'batchTransactions' });

// FIFOBatch associations
FIFOBatch.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
FIFOBatch.hasMany(BatchTransaction, { foreignKey: 'batch_id', as: 'batchTransactions' });

// BatchTransaction associations
BatchTransaction.belongsTo(StockMovement, { foreignKey: 'movement_id', as: 'movement' });
BatchTransaction.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });

// BatchLineage associations (for nested products)
BatchLineage.belongsTo(FIFOBatch, { foreignKey: 'parent_batch_id', as: 'parentBatch' });
BatchLineage.belongsTo(FIFOBatch, { foreignKey: 'child_batch_id', as: 'childBatch' });
FIFOBatch.hasMany(BatchLineage, { foreignKey: 'parent_batch_id', as: 'asParent' });
FIFOBatch.hasMany(BatchLineage, { foreignKey: 'child_batch_id', as: 'asChild' });

// SupplierItem associations
SupplierItem.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
SupplierItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// BulkDiscount associations
BulkDiscount.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });

// ItemNutrition associations
ItemNutrition.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemAllergen associations
ItemAllergen.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemPhysicalProperties associations
ItemPhysicalProperties.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemShelfLife associations
ItemShelfLife.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemPackaging associations
ItemPackaging.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemQualityControl associations
ItemQualityControl.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemRegulatoryCompliance associations
ItemRegulatoryCompliance.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ItemCostBreakdown associations
ItemCostBreakdown.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// ProductComposition associations
ProductComposition.belongsTo(Item, { foreignKey: 'product_id', as: 'product' });
ProductComposition.belongsTo(Item, { foreignKey: 'ingredient_id', as: 'ingredient' });

// AuditLog associations
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ReceiveToken associations
ReceiveToken.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ReceiveToken.belongsTo(User, { foreignKey: 'used_by', as: 'usedByUser' });
User.hasMany(ReceiveToken, { foreignKey: 'created_by', as: 'createdTokens' });

// AI associations
PendingAIAction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
AIConversation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(PendingAIAction, { foreignKey: 'user_id', as: 'pendingAIActions' });
User.hasMany(AIConversation, { foreignKey: 'user_id', as: 'aiConversations' });

// UserTenantMapping associations (Landlord DB)
UserTenantMapping.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(UserTenantMapping, { foreignKey: 'tenant_id', as: 'userMappings' });

const db = {
  sequelize,
  Sequelize: sequelize.Sequelize,
  User,
  Item,
  Supplier,
  PurchaseOrder,
  JobOrder,
  StockMovement,
  FIFOBatch,
  ItemNutrition,
  ItemAllergen,
  ItemPhysicalProperties,
  ItemShelfLife,
  ItemPackaging,
  ItemQualityControl,
  ItemRegulatoryCompliance,
  ItemCostBreakdown,
  ProductComposition,
  SupplierItem,
  BulkDiscount,
  POLineItem,
  JOIngredient,
  BatchTransaction,
  AuditLog,
  SystemSetting,
  BatchLineage,
  ReceiveToken,
  ReportSnapshot,
  PendingAIAction,
  AIConversation,
  ItemEmbedding,
  ItemFolder,
  Tenant,
  UserTenantMapping
};

export default db;
export {
  sequelize,
  User,
  Item,
  Supplier,
  PurchaseOrder,
  JobOrder,
  StockMovement,
  FIFOBatch,
  POLineItem,
  ItemNutrition,
  ItemAllergen,
  ProductComposition,
  SupplierItem,
  BulkDiscount,
  ItemPhysicalProperties,
  ItemShelfLife,
  ItemPackaging,
  ItemQualityControl,
  ItemRegulatoryCompliance,
  ItemCostBreakdown,
  JOIngredient,
  BatchTransaction,
  AuditLog,
  SystemSetting,
  BatchLineage,
  ReceiveToken,
  ReportSnapshot,
  PendingAIAction,
  AIConversation,
  ItemEmbedding,
  ItemFolder,
  Tenant,
  UserTenantMapping
};


