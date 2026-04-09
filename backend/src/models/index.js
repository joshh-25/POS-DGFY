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
import DispatchOrder from './DispatchOrder.js';
import DispatchOrderLine from './DispatchOrderLine.js';
import PosTransaction from './PosTransaction.js';
import PosTransactionLine from './PosTransactionLine.js';
import PosInvoiceCounter from './PosInvoiceCounter.js';
import PosZReadingSnapshot from './PosZReadingSnapshot.js';
import PosOperationReplay from './PosOperationReplay.js';
import PosCatalogOverride from './PosCatalogOverride.js';
import PosTerminalShift from './PosTerminalShift.js';
import PosCashDrawerEvent from './PosCashDrawerEvent.js';
import TenantLocation from './TenantLocation.js';
import StoreCustomer from './StoreCustomer.js';
import StoreCustomerAddress from './StoreCustomerAddress.js';
import TenantFactory from './Landlord/Tenant.js';
import UserTenantMappingFactory from './Landlord/UserTenantMapping.js';
import PaymentFactory from './Landlord/Payment.js';
import WebhookLogFactory from './Landlord/WebhookLog.js';
import EngagementEventFactory from './Landlord/EngagementEvent.js';
import StorefrontDiscoveryIndexFactory from './Landlord/StorefrontDiscoveryIndex.js';
import TenantComplianceArtifactFactory from './Landlord/TenantComplianceArtifact.js';
import TenantCompliancePeripheralFactory from './Landlord/TenantCompliancePeripheral.js';
import TenantComplianceAuditLogFactory from './Landlord/TenantComplianceAuditLog.js';
import TenantComplianceAuditFailureFactory from './Landlord/TenantComplianceAuditFailure.js';
const Tenant = TenantFactory(sequelize);
const UserTenantMapping = UserTenantMappingFactory(sequelize);
const Payment = PaymentFactory(sequelize);
const WebhookLog = WebhookLogFactory(sequelize);
const EngagementEvent = EngagementEventFactory(sequelize);
const StorefrontDiscoveryIndex = StorefrontDiscoveryIndexFactory(sequelize);
const TenantComplianceArtifact = TenantComplianceArtifactFactory(sequelize);
const TenantCompliancePeripheral = TenantCompliancePeripheralFactory(sequelize);
const TenantComplianceAuditLog = TenantComplianceAuditLogFactory(sequelize);
const TenantComplianceAuditFailure = TenantComplianceAuditFailureFactory(sequelize);

// Landlord Models
import AiUsageLogFactory from './Landlord/AiUsageLog.js';
const AiUsageLog = AiUsageLogFactory(sequelize);

// Define associations
// Tenant & Payment associations
Tenant.hasMany(Payment, { foreignKey: 'tenant_id', as: 'payments' });
Payment.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(EngagementEvent, { foreignKey: 'tenant_id', as: 'engagementEvents' });
EngagementEvent.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(StorefrontDiscoveryIndex, { foreignKey: 'tenant_id', as: 'storefrontDiscoveryIndex' });
StorefrontDiscoveryIndex.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceArtifact, { foreignKey: 'tenant_id', as: 'complianceArtifacts' });
TenantComplianceArtifact.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantCompliancePeripheral, { foreignKey: 'tenant_id', as: 'compliancePeripherals' });
TenantCompliancePeripheral.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceAuditLog, { foreignKey: 'tenant_id', as: 'complianceAuditLogs' });
TenantComplianceAuditLog.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

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

// DispatchOrder associations
DispatchOrder.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
DispatchOrder.belongsTo(User, { foreignKey: 'confirmed_by', as: 'confirmedByUser' });
DispatchOrder.belongsTo(User, { foreignKey: 'archived_by', as: 'archivedByUser' });
DispatchOrder.hasMany(DispatchOrderLine, { foreignKey: 'do_id', as: 'lines' });
DispatchOrderLine.belongsTo(DispatchOrder, { foreignKey: 'do_id', as: 'dispatchOrder' });
DispatchOrderLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
DispatchOrderLine.belongsTo(FIFOBatch, { foreignKey: 'batch_id', as: 'batch' });
Item.hasMany(DispatchOrderLine, { foreignKey: 'item_id', as: 'dispatchOrderLines' });
User.hasMany(DispatchOrder, { foreignKey: 'created_by', as: 'createdDispatchOrders' });

// POS associations
PosTransaction.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
PosTransaction.belongsTo(User, { foreignKey: 'voided_by', as: 'voidedByUser' });
PosTransaction.belongsTo(User, { foreignKey: 'accepted_by', as: 'acceptedByUser' });
PosTransaction.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosTransaction.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosTransaction.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
PosTransaction.hasMany(PosTransactionLine, { foreignKey: 'pos_transaction_id', as: 'lines' });
PosTransactionLine.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosTransactionLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
User.hasMany(PosTransaction, { foreignKey: 'cashier_id', as: 'posTransactions' });
User.hasMany(PosTransaction, { foreignKey: 'accepted_by', as: 'acceptedPosTransactions' });
Item.hasMany(PosTransactionLine, { foreignKey: 'item_id', as: 'posTransactionLines' });
Item.hasOne(PosCatalogOverride, { foreignKey: 'item_id', as: 'posCatalogOverride' });
PosCatalogOverride.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
PosTerminalShift.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
PosTerminalShift.belongsTo(User, { foreignKey: 'closed_by', as: 'closedByUser' });
PosTerminalShift.hasMany(PosCashDrawerEvent, { foreignKey: 'pos_terminal_shift_id', as: 'cashEvents' });
PosTerminalShift.hasMany(PosTransaction, { foreignKey: 'shift_id', as: 'transactions' });
PosCashDrawerEvent.belongsTo(PosTerminalShift, { foreignKey: 'pos_terminal_shift_id', as: 'shift' });
PosCashDrawerEvent.belongsTo(User, { foreignKey: 'recorded_by', as: 'recordedByUser' });
User.hasMany(PosTerminalShift, { foreignKey: 'cashier_id', as: 'posTerminalShifts' });
User.hasMany(PosCashDrawerEvent, { foreignKey: 'recorded_by', as: 'posCashDrawerEvents' });
TenantLocation.hasMany(PosTransaction, { foreignKey: 'location_id', as: 'posTransactions' });
StoreCustomer.hasMany(StoreCustomerAddress, { foreignKey: 'customer_id', as: 'addresses' });
StoreCustomerAddress.belongsTo(StoreCustomer, { foreignKey: 'customer_id', as: 'customer' });
StoreCustomer.hasMany(PosTransaction, { foreignKey: 'store_customer_id', as: 'orders' });

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
  DispatchOrder,
  DispatchOrderLine,
  PosTransaction,
  PosTransactionLine,
  PosInvoiceCounter,
  PosZReadingSnapshot,
  PosOperationReplay,
  PosCatalogOverride,
  PosTerminalShift,
  PosCashDrawerEvent,
  TenantLocation,
  StoreCustomer,
  StoreCustomerAddress,
  Tenant,
  UserTenantMapping,
  Payment,
  WebhookLog,
  EngagementEvent,
  AiUsageLog,
  StorefrontDiscoveryIndex,
  TenantComplianceArtifact,
  TenantCompliancePeripheral,
  TenantComplianceAuditLog,
  TenantComplianceAuditFailure
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
  DispatchOrder,
  DispatchOrderLine,
  PosTransaction,
  PosTransactionLine,
  PosInvoiceCounter,
  PosZReadingSnapshot,
  PosOperationReplay,
  PosCatalogOverride,
  PosTerminalShift,
  PosCashDrawerEvent,
  TenantLocation,
  StoreCustomer,
  StoreCustomerAddress,
  Tenant,
  UserTenantMapping,
  Payment,
  WebhookLog,
  EngagementEvent,
  AiUsageLog,
  StorefrontDiscoveryIndex,
  TenantComplianceArtifact,
  TenantCompliancePeripheral,
  TenantComplianceAuditLog,
  TenantComplianceAuditFailure
};
