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
import ItemBarcode from './ItemBarcode.js';
import DispatchOrder from './DispatchOrder.js';
import DispatchOrderLine from './DispatchOrderLine.js';
import PosTransaction from './PosTransaction.js';
import PosTransactionLine from './PosTransactionLine.js';
import PosInvoiceCounter from './PosInvoiceCounter.js';
import PosZReadingSnapshot from './PosZReadingSnapshot.js';
import PosOperationReplay from './PosOperationReplay.js';
import PosCatalogOverride from './PosCatalogOverride.js';
import StorefrontCatalogOverride from './StorefrontCatalogOverride.js';
import PosTerminalShift from './PosTerminalShift.js';
import PosCashDrawerEvent from './PosCashDrawerEvent.js';
import PosShiftLocationTransition from './PosShiftLocationTransition.js';
import PosShiftLocationBackfillAudit from './PosShiftLocationBackfillAudit.js';
import TenantLocation from './TenantLocation.js';
import ItemLocationStock from './ItemLocationStock.js';
import UserLocationGrant from './UserLocationGrant.js';
import StoreCustomer from './StoreCustomer.js';
import StoreCustomerAddress from './StoreCustomerAddress.js';
import StorefrontFollow from './StorefrontFollow.js';
import ServiceItemDetail from './ServiceItemDetail.js';
import ServiceResource from './ServiceResource.js';
import ServiceProviderAssignment from './ServiceProviderAssignment.js';
import ServiceBooking from './ServiceBooking.js';
import ServiceBookingHold from './ServiceBookingHold.js';
import ServiceWaitlistEntry from './ServiceWaitlistEntry.js';
import ServiceReminderOutbox from './ServiceReminderOutbox.js';
import FnbModifierGroup from './FnbModifierGroup.js';
import FnbModifierOption from './FnbModifierOption.js';
import FnbItemModifierGroup from './FnbItemModifierGroup.js';
import FnbDiningArea from './FnbDiningArea.js';
import FnbDiningTable from './FnbDiningTable.js';
import FnbKitchenStation from './FnbKitchenStation.js';
import FnbItemKitchenRoute from './FnbItemKitchenRoute.js';
import FnbCheck from './FnbCheck.js';
import FnbCheckLine from './FnbCheckLine.js';
import FnbKitchenTicket from './FnbKitchenTicket.js';
import FnbReservationRequest from './FnbReservationRequest.js';
import FnbReservationTable from './FnbReservationTable.js';
import FnbRestaurantServiceChargeSnapshot from './FnbRestaurantServiceChargeSnapshot.js';
import {
  HospitalityAmenity,
  HospitalityAuditEvent,
  HospitalityBookingHold,
  HospitalityFacility,
  HospitalityFacilityBooking,
  HospitalityFolio,
  HospitalityFolioLine,
  HospitalityGuestMessage,
  HospitalityGuestProfile,
  HospitalityHousekeepingTask,
  HospitalityMaintenanceRequest,
  HospitalityPackage,
  HospitalityPackageItem,
  HospitalityPropertyAmenity,
  HospitalityRateCalendar,
  HospitalityRatePlan,
  HospitalityReservation,
  HospitalityReservationRoom,
  HospitalityRoom,
  HospitalityRoomAmenity,
  HospitalityRoomType,
  HospitalityStay
} from './HospitalityModels.js';
import TenantFactory from './Landlord/Tenant.js';
import UserTenantMappingFactory from './Landlord/UserTenantMapping.js';
import UserInvitationFactory from './Landlord/UserInvitation.js';
import EmailOtpFactory from './Landlord/EmailOtp.js';
import DgfyAccountFactory from './Landlord/DgfyAccount.js';
import DgfyAccountTenantMembershipFactory from './Landlord/DgfyAccountTenantMembership.js';
import DgfyAccountHandoffFactory from './Landlord/DgfyAccountHandoff.js';
import PaymentFactory from './Landlord/Payment.js';
import WebhookLogFactory from './Landlord/WebhookLog.js';
import EngagementEventFactory from './Landlord/EngagementEvent.js';
import StorefrontDiscoveryIndexFactory from './Landlord/StorefrontDiscoveryIndex.js';
import TenantComplianceArtifactFactory from './Landlord/TenantComplianceArtifact.js';
import TenantCompliancePeripheralFactory from './Landlord/TenantCompliancePeripheral.js';
import TenantComplianceAuditLogFactory from './Landlord/TenantComplianceAuditLog.js';
import TenantComplianceAuditFailureFactory from './Landlord/TenantComplianceAuditFailure.js';
import TenantComplianceFinalReviewDocumentFactory from './Landlord/TenantComplianceFinalReviewDocument.js';
import TenantComplianceFinalReviewSignoffFactory from './Landlord/TenantComplianceFinalReviewSignoff.js';
const Tenant = TenantFactory(sequelize);
const UserTenantMapping = UserTenantMappingFactory(sequelize);
const UserInvitation = UserInvitationFactory(sequelize);
const EmailOtp = EmailOtpFactory(sequelize);
const DgfyAccount = DgfyAccountFactory(sequelize);
const DgfyAccountTenantMembership = DgfyAccountTenantMembershipFactory(sequelize);
const DgfyAccountHandoff = DgfyAccountHandoffFactory(sequelize);
const Payment = PaymentFactory(sequelize);
const WebhookLog = WebhookLogFactory(sequelize);
const EngagementEvent = EngagementEventFactory(sequelize);
const StorefrontDiscoveryIndex = StorefrontDiscoveryIndexFactory(sequelize);
const TenantComplianceArtifact = TenantComplianceArtifactFactory(sequelize);
const TenantCompliancePeripheral = TenantCompliancePeripheralFactory(sequelize);
const TenantComplianceAuditLog = TenantComplianceAuditLogFactory(sequelize);
const TenantComplianceAuditFailure = TenantComplianceAuditFailureFactory(sequelize);
const TenantComplianceFinalReviewDocument = TenantComplianceFinalReviewDocumentFactory(sequelize);
const TenantComplianceFinalReviewSignoff = TenantComplianceFinalReviewSignoffFactory(sequelize);

// Landlord Models
import AiUsageLogFactory from './Landlord/AiUsageLog.js';
const AiUsageLog = AiUsageLogFactory(sequelize);

import GeoItemFactory from './Landlord/GeoItem.js';
import GeoStoreItemFactory from './Landlord/GeoStoreItem.js';
import GeoItemAliasFactory from './Landlord/GeoItemAlias.js';
const GeoItem = GeoItemFactory(sequelize);
const GeoStoreItem = GeoStoreItemFactory(sequelize);
const GeoItemAlias = GeoItemAliasFactory(sequelize);

// Define associations
// Tenant & Payment associations
Tenant.hasMany(Payment, { foreignKey: 'tenant_id', as: 'payments' });
Payment.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(EngagementEvent, { foreignKey: 'tenant_id', as: 'engagementEvents' });
EngagementEvent.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(StorefrontDiscoveryIndex, { foreignKey: 'tenant_id', as: 'storefrontDiscoveryIndex' });
StorefrontDiscoveryIndex.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
DgfyAccount.hasMany(DgfyAccountTenantMembership, { foreignKey: 'dgfy_account_id', as: 'tenantMemberships' });
DgfyAccountTenantMembership.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
DgfyAccount.hasMany(DgfyAccountHandoff, { foreignKey: 'dgfy_account_id', as: 'handoffs' });
DgfyAccountHandoff.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
Tenant.hasMany(DgfyAccountTenantMembership, { foreignKey: 'tenant_id', as: 'dgfyAccountMemberships' });
DgfyAccountTenantMembership.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceArtifact, { foreignKey: 'tenant_id', as: 'complianceArtifacts' });
TenantComplianceArtifact.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantCompliancePeripheral, { foreignKey: 'tenant_id', as: 'compliancePeripherals' });
TenantCompliancePeripheral.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceAuditLog, { foreignKey: 'tenant_id', as: 'complianceAuditLogs' });
TenantComplianceAuditLog.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceFinalReviewDocument, { foreignKey: 'tenant_id', as: 'complianceFinalReviewDocuments' });
TenantComplianceFinalReviewDocument.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(TenantComplianceFinalReviewSignoff, { foreignKey: 'tenant_id', as: 'complianceFinalReviewSignoff' });
TenantComplianceFinalReviewSignoff.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

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
Item.hasMany(ItemBarcode, { foreignKey: 'item_id', as: 'barcodes' });
ItemBarcode.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

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
StockMovement.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
StockMovement.belongsTo(TenantLocation, { foreignKey: 'source_location_id', as: 'sourceLocation' });
StockMovement.belongsTo(TenantLocation, { foreignKey: 'destination_location_id', as: 'destinationLocation' });
StockMovement.hasMany(BatchTransaction, { foreignKey: 'movement_id', as: 'batchTransactions' });

// FIFOBatch associations
FIFOBatch.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
FIFOBatch.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
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
PosTransaction.belongsTo(User, { foreignKey: 'fnb_server_id', as: 'fnbServer' });
PosTransaction.hasMany(PosTransactionLine, { foreignKey: 'pos_transaction_id', as: 'lines' });
PosTransactionLine.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosTransactionLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
User.hasMany(PosTransaction, { foreignKey: 'cashier_id', as: 'posTransactions' });
User.hasMany(PosTransaction, { foreignKey: 'accepted_by', as: 'acceptedPosTransactions' });
Item.hasMany(PosTransactionLine, { foreignKey: 'item_id', as: 'posTransactionLines' });
Item.hasMany(ItemLocationStock, { foreignKey: 'item_id', as: 'locationStocks' });
ItemLocationStock.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasOne(PosCatalogOverride, { foreignKey: 'item_id', as: 'posCatalogOverride' });
PosCatalogOverride.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasOne(StorefrontCatalogOverride, { foreignKey: 'item_id', as: 'storefrontCatalogOverride' });
StorefrontCatalogOverride.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
PosTerminalShift.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
PosTerminalShift.belongsTo(User, { foreignKey: 'closed_by', as: 'closedByUser' });
PosTerminalShift.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosTerminalShift.hasMany(PosCashDrawerEvent, { foreignKey: 'pos_terminal_shift_id', as: 'cashEvents' });
PosTerminalShift.hasMany(PosTransaction, { foreignKey: 'shift_id', as: 'transactions' });
PosCashDrawerEvent.belongsTo(PosTerminalShift, { foreignKey: 'pos_terminal_shift_id', as: 'shift' });
PosCashDrawerEvent.belongsTo(User, { foreignKey: 'recorded_by', as: 'recordedByUser' });
PosShiftLocationTransition.belongsTo(PosTerminalShift, { foreignKey: 'from_shift_id', as: 'fromShift' });
PosShiftLocationTransition.belongsTo(PosTerminalShift, { foreignKey: 'to_shift_id', as: 'toShift' });
PosShiftLocationTransition.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actorUser' });
PosShiftLocationTransition.belongsTo(TenantLocation, { foreignKey: 'from_location_id', as: 'fromLocation' });
PosShiftLocationTransition.belongsTo(TenantLocation, { foreignKey: 'to_location_id', as: 'toLocation' });
PosTerminalShift.hasMany(PosShiftLocationTransition, { foreignKey: 'from_shift_id', as: 'locationTransitionsFrom' });
PosTerminalShift.hasMany(PosShiftLocationTransition, { foreignKey: 'to_shift_id', as: 'locationTransitionsTo' });
PosShiftLocationBackfillAudit.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosShiftLocationBackfillAudit.belongsTo(TenantLocation, { foreignKey: 'previous_location_id', as: 'previousLocation' });
PosShiftLocationBackfillAudit.belongsTo(TenantLocation, { foreignKey: 'resolved_location_id', as: 'resolvedLocation' });
PosTerminalShift.hasMany(PosShiftLocationBackfillAudit, { foreignKey: 'shift_id', as: 'locationBackfillAudits' });
User.hasMany(PosTerminalShift, { foreignKey: 'cashier_id', as: 'posTerminalShifts' });
User.hasMany(PosCashDrawerEvent, { foreignKey: 'recorded_by', as: 'posCashDrawerEvents' });
User.hasMany(PosShiftLocationTransition, { foreignKey: 'actor_user_id', as: 'posShiftLocationTransitions' });
TenantLocation.hasMany(PosTransaction, { foreignKey: 'location_id', as: 'posTransactions' });
TenantLocation.hasMany(PosTerminalShift, { foreignKey: 'location_id', as: 'posTerminalShifts' });
TenantLocation.hasMany(ItemLocationStock, { foreignKey: 'location_id', as: 'itemLocationStocks' });
TenantLocation.hasMany(FIFOBatch, { foreignKey: 'location_id', as: 'fifoBatches' });
TenantLocation.hasMany(StockMovement, { foreignKey: 'location_id', as: 'stockMovements' });
TenantLocation.hasMany(StockMovement, { foreignKey: 'source_location_id', as: 'sourceStockMovements' });
TenantLocation.hasMany(StockMovement, { foreignKey: 'destination_location_id', as: 'destinationStockMovements' });
ItemLocationStock.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
User.belongsToMany(TenantLocation, {
  through: UserLocationGrant,
  foreignKey: 'user_id',
  otherKey: 'location_id',
  as: 'locationGrants'
});
TenantLocation.belongsToMany(User, {
  through: UserLocationGrant,
  foreignKey: 'location_id',
  otherKey: 'user_id',
  as: 'grantedUsers'
});
User.hasMany(UserLocationGrant, { foreignKey: 'user_id', as: 'userLocationGrants' });
TenantLocation.hasMany(UserLocationGrant, { foreignKey: 'location_id', as: 'userLocationGrants' });
UserLocationGrant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserLocationGrant.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
StoreCustomer.hasMany(StoreCustomerAddress, { foreignKey: 'customer_id', as: 'addresses' });
StoreCustomerAddress.belongsTo(StoreCustomer, { foreignKey: 'customer_id', as: 'customer' });
StoreCustomer.hasMany(PosTransaction, { foreignKey: 'store_customer_id', as: 'orders' });

// Services associations
Item.hasOne(ServiceItemDetail, { foreignKey: 'item_id', as: 'serviceDetail' });
ServiceItemDetail.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasMany(ServiceProviderAssignment, { foreignKey: 'item_id', as: 'serviceProviderAssignments' });
ServiceProviderAssignment.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
ServiceProviderAssignment.belongsTo(User, { foreignKey: 'user_id', as: 'providerUser' });
ServiceProviderAssignment.belongsTo(ServiceResource, { foreignKey: 'resource_id', as: 'resource' });
ServiceProviderAssignment.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
ServiceResource.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
ServiceBooking.belongsTo(Item, { foreignKey: 'service_item_id', as: 'serviceItem' });
ServiceBooking.belongsTo(ServiceItemDetail, { foreignKey: 'service_detail_id', as: 'serviceDetail' });
ServiceBooking.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
ServiceBooking.belongsTo(User, { foreignKey: 'provider_user_id', as: 'providerUser' });
ServiceBooking.belongsTo(ServiceResource, { foreignKey: 'resource_id', as: 'resource' });
ServiceBooking.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
ServiceBooking.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'posTransaction' });
ServiceBooking.hasMany(ServiceReminderOutbox, { foreignKey: 'booking_id', as: 'reminders' });
ServiceReminderOutbox.belongsTo(ServiceBooking, { foreignKey: 'booking_id', as: 'booking' });
ServiceBookingHold.belongsTo(Item, { foreignKey: 'service_item_id', as: 'serviceItem' });
ServiceBookingHold.belongsTo(ServiceItemDetail, { foreignKey: 'service_detail_id', as: 'serviceDetail' });
ServiceBookingHold.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
ServiceBookingHold.belongsTo(User, { foreignKey: 'provider_user_id', as: 'providerUser' });
ServiceBookingHold.belongsTo(ServiceResource, { foreignKey: 'resource_id', as: 'resource' });
ServiceBookingHold.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
Item.hasMany(ServiceBooking, { foreignKey: 'service_item_id', as: 'serviceBookings' });
StoreCustomer.hasMany(ServiceBooking, { foreignKey: 'store_customer_id', as: 'serviceBookings' });
ServiceWaitlistEntry.belongsTo(Item, { foreignKey: 'service_item_id', as: 'serviceItem' });
ServiceWaitlistEntry.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });

// Food & Beverage associations
FnbModifierGroup.hasMany(FnbModifierOption, { foreignKey: 'modifier_group_id', as: 'options' });
FnbModifierOption.belongsTo(FnbModifierGroup, { foreignKey: 'modifier_group_id', as: 'group' });
FnbModifierOption.belongsTo(Item, { foreignKey: 'sku_item_id', as: 'skuItem' });
Item.belongsToMany(FnbModifierGroup, {
  through: FnbItemModifierGroup,
  foreignKey: 'item_id',
  otherKey: 'modifier_group_id',
  as: 'fnbModifierGroups'
});
FnbModifierGroup.belongsToMany(Item, {
  through: FnbItemModifierGroup,
  foreignKey: 'modifier_group_id',
  otherKey: 'item_id',
  as: 'menuItems'
});
FnbItemModifierGroup.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
FnbItemModifierGroup.belongsTo(FnbModifierGroup, { foreignKey: 'modifier_group_id', as: 'modifierGroup' });
FnbDiningArea.hasMany(FnbDiningTable, { foreignKey: 'dining_area_id', as: 'tables' });
FnbDiningTable.belongsTo(FnbDiningArea, { foreignKey: 'dining_area_id', as: 'area' });
FnbDiningTable.hasMany(FnbCheck, { foreignKey: 'table_id', as: 'checks' });
FnbDiningTable.hasMany(FnbReservationRequest, { foreignKey: 'table_id', as: 'reservations' });
FnbDiningTable.hasMany(FnbReservationTable, { foreignKey: 'table_id', as: 'reservationAssignments' });
FnbKitchenStation.hasMany(FnbItemKitchenRoute, { foreignKey: 'kitchen_station_id', as: 'itemRoutes' });
FnbItemKitchenRoute.belongsTo(FnbKitchenStation, { foreignKey: 'kitchen_station_id', as: 'station' });
FnbItemKitchenRoute.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasMany(FnbItemKitchenRoute, { foreignKey: 'item_id', as: 'fnbKitchenRoutes' });
FnbCheck.belongsTo(FnbDiningTable, { foreignKey: 'table_id', as: 'table' });
FnbCheck.belongsTo(FnbDiningArea, { foreignKey: 'dining_area_id', as: 'area' });
FnbCheck.belongsTo(User, { foreignKey: 'server_id', as: 'server' });
FnbCheck.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'posTransaction' });
FnbCheck.hasMany(FnbCheckLine, { foreignKey: 'check_id', as: 'lines' });
FnbCheck.hasMany(FnbKitchenTicket, { foreignKey: 'check_id', as: 'kitchenTickets' });
FnbCheckLine.belongsTo(FnbCheck, { foreignKey: 'check_id', as: 'check' });
FnbCheckLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
FnbCheckLine.belongsTo(FnbKitchenStation, { foreignKey: 'kitchen_station_id', as: 'kitchenStation' });
FnbKitchenTicket.belongsTo(FnbCheck, { foreignKey: 'check_id', as: 'check' });
FnbKitchenTicket.belongsTo(FnbKitchenStation, { foreignKey: 'kitchen_station_id', as: 'station' });
FnbReservationRequest.belongsTo(FnbDiningTable, { foreignKey: 'table_id', as: 'table' });
FnbReservationRequest.hasMany(FnbReservationTable, { foreignKey: 'reservation_request_id', as: 'reservationTables' });
FnbReservationTable.belongsTo(FnbReservationRequest, { foreignKey: 'reservation_request_id', as: 'reservation' });
FnbReservationTable.belongsTo(FnbDiningTable, { foreignKey: 'table_id', as: 'table' });
PosTransaction.belongsTo(FnbCheck, { foreignKey: 'fnb_check_id', as: 'fnbCheck' });
PosTransaction.belongsTo(FnbDiningTable, { foreignKey: 'fnb_table_id', as: 'fnbTable' });
FnbCheck.hasMany(PosTransaction, { foreignKey: 'fnb_check_id', as: 'transactions' });
FnbRestaurantServiceChargeSnapshot.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
FnbRestaurantServiceChargeSnapshot.belongsTo(FnbCheck, { foreignKey: 'check_id', as: 'check' });
PosTransaction.hasOne(FnbRestaurantServiceChargeSnapshot, { foreignKey: 'pos_transaction_id', as: 'restaurantServiceChargeSnapshot' });

// Hospitality associations
HospitalityRoomType.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
HospitalityRoomType.hasMany(HospitalityRoom, { foreignKey: 'room_type_id', as: 'rooms' });
HospitalityRoomType.hasMany(HospitalityRateCalendar, { foreignKey: 'room_type_id', as: 'rateCalendar' });
HospitalityRoomType.hasMany(HospitalityReservationRoom, { foreignKey: 'room_type_id', as: 'reservationRooms' });
HospitalityRoom.belongsTo(HospitalityRoomType, { foreignKey: 'room_type_id', as: 'roomType' });
HospitalityRoom.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
HospitalityRoom.hasMany(HospitalityHousekeepingTask, { foreignKey: 'room_id', as: 'housekeepingTasks' });
HospitalityRoom.hasMany(HospitalityMaintenanceRequest, { foreignKey: 'room_id', as: 'maintenanceRequests' });
HospitalityRatePlan.hasMany(HospitalityRateCalendar, { foreignKey: 'rate_plan_id', as: 'rateCalendar' });
HospitalityRatePlan.hasMany(HospitalityReservation, { foreignKey: 'rate_plan_id', as: 'reservations' });
HospitalityRateCalendar.belongsTo(HospitalityRoomType, { foreignKey: 'room_type_id', as: 'roomType' });
HospitalityRateCalendar.belongsTo(HospitalityRatePlan, { foreignKey: 'rate_plan_id', as: 'ratePlan' });
HospitalityGuestProfile.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
HospitalityGuestProfile.hasMany(HospitalityReservation, { foreignKey: 'guest_profile_id', as: 'reservations' });
HospitalityReservation.belongsTo(HospitalityGuestProfile, { foreignKey: 'guest_profile_id', as: 'guestProfile' });
HospitalityReservation.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
HospitalityReservation.belongsTo(HospitalityRatePlan, { foreignKey: 'rate_plan_id', as: 'ratePlan' });
HospitalityReservation.hasMany(HospitalityReservationRoom, { foreignKey: 'reservation_id', as: 'rooms' });
HospitalityReservation.hasMany(HospitalityStay, { foreignKey: 'reservation_id', as: 'stays' });
HospitalityReservation.hasMany(HospitalityFolio, { foreignKey: 'reservation_id', as: 'folios' });
HospitalityBookingHold.belongsTo(HospitalityRoomType, { foreignKey: 'room_type_id', as: 'roomType' });
HospitalityReservationRoom.belongsTo(HospitalityReservation, { foreignKey: 'reservation_id', as: 'reservation' });
HospitalityReservationRoom.belongsTo(HospitalityRoomType, { foreignKey: 'room_type_id', as: 'roomType' });
HospitalityReservationRoom.belongsTo(HospitalityRoom, { foreignKey: 'room_id', as: 'room' });
HospitalityReservationRoom.belongsTo(HospitalityRatePlan, { foreignKey: 'rate_plan_id', as: 'ratePlan' });
HospitalityStay.belongsTo(HospitalityReservation, { foreignKey: 'reservation_id', as: 'reservation' });
HospitalityStay.belongsTo(HospitalityReservationRoom, { foreignKey: 'reservation_room_id', as: 'reservationRoom' });
HospitalityStay.belongsTo(HospitalityRoom, { foreignKey: 'room_id', as: 'room' });
HospitalityStay.belongsTo(HospitalityGuestProfile, { foreignKey: 'guest_profile_id', as: 'guestProfile' });
HospitalityStay.belongsTo(User, { foreignKey: 'checked_in_by', as: 'checkedInBy' });
HospitalityStay.belongsTo(User, { foreignKey: 'checked_out_by', as: 'checkedOutBy' });
HospitalityFolio.belongsTo(HospitalityReservation, { foreignKey: 'reservation_id', as: 'reservation' });
HospitalityFolio.belongsTo(HospitalityStay, { foreignKey: 'stay_id', as: 'stay' });
HospitalityFolio.belongsTo(HospitalityGuestProfile, { foreignKey: 'guest_profile_id', as: 'guestProfile' });
HospitalityFolio.hasMany(HospitalityFolioLine, { foreignKey: 'folio_id', as: 'lines' });
HospitalityFolioLine.belongsTo(HospitalityFolio, { foreignKey: 'folio_id', as: 'folio' });
HospitalityFolioLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
HospitalityFolioLine.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'posTransaction' });
HospitalityFolioLine.belongsTo(User, { foreignKey: 'posted_by', as: 'postedBy' });
HospitalityHousekeepingTask.belongsTo(HospitalityRoom, { foreignKey: 'room_id', as: 'room' });
HospitalityHousekeepingTask.belongsTo(HospitalityReservation, { foreignKey: 'reservation_id', as: 'reservation' });
HospitalityHousekeepingTask.belongsTo(User, { foreignKey: 'assigned_user_id', as: 'assignedUser' });
HospitalityMaintenanceRequest.belongsTo(HospitalityRoom, { foreignKey: 'room_id', as: 'room' });
HospitalityMaintenanceRequest.belongsTo(HospitalityFacility, { foreignKey: 'facility_id', as: 'facility' });
HospitalityMaintenanceRequest.belongsTo(User, { foreignKey: 'reported_by', as: 'reportedBy' });
HospitalityMaintenanceRequest.belongsTo(User, { foreignKey: 'assigned_user_id', as: 'assignedUser' });
HospitalityAmenity.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
HospitalityAmenity.hasMany(HospitalityRoomAmenity, { foreignKey: 'amenity_id', as: 'roomLinks' });
HospitalityAmenity.hasMany(HospitalityPropertyAmenity, { foreignKey: 'amenity_id', as: 'propertyLinks' });
HospitalityRoomAmenity.belongsTo(HospitalityRoomType, { foreignKey: 'room_type_id', as: 'roomType' });
HospitalityRoomAmenity.belongsTo(HospitalityRoom, { foreignKey: 'room_id', as: 'room' });
HospitalityRoomAmenity.belongsTo(HospitalityAmenity, { foreignKey: 'amenity_id', as: 'amenity' });
HospitalityPropertyAmenity.belongsTo(HospitalityAmenity, { foreignKey: 'amenity_id', as: 'amenity' });
HospitalityPropertyAmenity.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
HospitalityFacility.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
HospitalityFacility.hasMany(HospitalityFacilityBooking, { foreignKey: 'facility_id', as: 'bookings' });
HospitalityFacilityBooking.belongsTo(HospitalityFacility, { foreignKey: 'facility_id', as: 'facility' });
HospitalityFacilityBooking.belongsTo(HospitalityGuestProfile, { foreignKey: 'guest_profile_id', as: 'guestProfile' });
HospitalityFacilityBooking.belongsTo(HospitalityReservation, { foreignKey: 'reservation_id', as: 'reservation' });
HospitalityPackage.hasMany(HospitalityPackageItem, { foreignKey: 'package_id', as: 'items' });
HospitalityPackageItem.belongsTo(HospitalityPackage, { foreignKey: 'package_id', as: 'package' });
HospitalityPackageItem.belongsTo(HospitalityAmenity, { foreignKey: 'amenity_id', as: 'amenity' });
HospitalityPackageItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
HospitalityPackageItem.belongsTo(HospitalityFacility, { foreignKey: 'facility_id', as: 'facility' });
HospitalityGuestMessage.belongsTo(HospitalityReservation, { foreignKey: 'reservation_id', as: 'reservation' });
HospitalityGuestMessage.belongsTo(HospitalityGuestProfile, { foreignKey: 'guest_profile_id', as: 'guestProfile' });

// AI associations
PendingAIAction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
AIConversation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(PendingAIAction, { foreignKey: 'user_id', as: 'pendingAIActions' });
User.hasMany(AIConversation, { foreignKey: 'user_id', as: 'aiConversations' });

// UserTenantMapping associations (Landlord DB)
UserTenantMapping.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(UserTenantMapping, { foreignKey: 'tenant_id', as: 'userMappings' });
UserInvitation.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(UserInvitation, { foreignKey: 'tenant_id', as: 'userInvitations' });
EmailOtp.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(EmailOtp, { foreignKey: 'tenant_id', as: 'emailOtps' });

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
  ItemBarcode,
  DispatchOrder,
  DispatchOrderLine,
  PosTransaction,
  PosTransactionLine,
  PosInvoiceCounter,
  PosZReadingSnapshot,
  PosOperationReplay,
  PosCatalogOverride,
  StorefrontCatalogOverride,
  PosTerminalShift,
  PosCashDrawerEvent,
  PosShiftLocationTransition,
  PosShiftLocationBackfillAudit,
  TenantLocation,
  ItemLocationStock,
  UserLocationGrant,
  StoreCustomer,
  StoreCustomerAddress,
  StorefrontFollow,
  ServiceItemDetail,
  ServiceResource,
  ServiceProviderAssignment,
  ServiceBooking,
  ServiceBookingHold,
  ServiceWaitlistEntry,
  ServiceReminderOutbox,
  FnbModifierGroup,
  FnbModifierOption,
  FnbItemModifierGroup,
  FnbDiningArea,
  FnbDiningTable,
  FnbKitchenStation,
  FnbItemKitchenRoute,
  FnbCheck,
  FnbCheckLine,
  FnbKitchenTicket,
  FnbReservationRequest,
  FnbReservationTable,
  FnbRestaurantServiceChargeSnapshot,
  HospitalityAmenity,
  HospitalityAuditEvent,
  HospitalityBookingHold,
  HospitalityFacility,
  HospitalityFacilityBooking,
  HospitalityFolio,
  HospitalityFolioLine,
  HospitalityGuestMessage,
  HospitalityGuestProfile,
  HospitalityHousekeepingTask,
  HospitalityMaintenanceRequest,
  HospitalityPackage,
  HospitalityPackageItem,
  HospitalityPropertyAmenity,
  HospitalityRateCalendar,
  HospitalityRatePlan,
  HospitalityReservation,
  HospitalityReservationRoom,
  HospitalityRoom,
  HospitalityRoomAmenity,
  HospitalityRoomType,
  HospitalityStay,
  Tenant,
  UserTenantMapping,
  UserInvitation,
  EmailOtp,
  DgfyAccount,
  DgfyAccountTenantMembership,
  DgfyAccountHandoff,
  Payment,
  WebhookLog,
  EngagementEvent,
  AiUsageLog,
  StorefrontDiscoveryIndex,
  TenantComplianceArtifact,
  TenantCompliancePeripheral,
  TenantComplianceAuditLog,
  TenantComplianceAuditFailure,
  TenantComplianceFinalReviewDocument,
  TenantComplianceFinalReviewSignoff
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
  ItemBarcode,
  DispatchOrder,
  DispatchOrderLine,
  PosTransaction,
  PosTransactionLine,
  PosInvoiceCounter,
  PosZReadingSnapshot,
  PosOperationReplay,
  PosCatalogOverride,
  StorefrontCatalogOverride,
  PosTerminalShift,
  PosCashDrawerEvent,
  PosShiftLocationTransition,
  PosShiftLocationBackfillAudit,
  TenantLocation,
  ItemLocationStock,
  UserLocationGrant,
  StoreCustomer,
  StoreCustomerAddress,
  StorefrontFollow,
  ServiceItemDetail,
  ServiceResource,
  ServiceProviderAssignment,
  ServiceBooking,
  ServiceBookingHold,
  ServiceWaitlistEntry,
  ServiceReminderOutbox,
  FnbModifierGroup,
  FnbModifierOption,
  FnbItemModifierGroup,
  FnbDiningArea,
  FnbDiningTable,
  FnbKitchenStation,
  FnbItemKitchenRoute,
  FnbCheck,
  FnbCheckLine,
  FnbKitchenTicket,
  FnbReservationRequest,
  FnbReservationTable,
  FnbRestaurantServiceChargeSnapshot,
  HospitalityAmenity,
  HospitalityAuditEvent,
  HospitalityBookingHold,
  HospitalityFacility,
  HospitalityFacilityBooking,
  HospitalityFolio,
  HospitalityFolioLine,
  HospitalityGuestMessage,
  HospitalityGuestProfile,
  HospitalityHousekeepingTask,
  HospitalityMaintenanceRequest,
  HospitalityPackage,
  HospitalityPackageItem,
  HospitalityPropertyAmenity,
  HospitalityRateCalendar,
  HospitalityRatePlan,
  HospitalityReservation,
  HospitalityReservationRoom,
  HospitalityRoom,
  HospitalityRoomAmenity,
  HospitalityRoomType,
  HospitalityStay,
  Tenant,
  UserTenantMapping,
  UserInvitation,
  EmailOtp,
  DgfyAccount,
  DgfyAccountTenantMembership,
  DgfyAccountHandoff,
  Payment,
  WebhookLog,
  EngagementEvent,
  AiUsageLog,
  StorefrontDiscoveryIndex,
  TenantComplianceArtifact,
  TenantCompliancePeripheral,
  TenantComplianceAuditLog,
  TenantComplianceAuditFailure,
  TenantComplianceFinalReviewDocument,
  TenantComplianceFinalReviewSignoff,
  GeoItem,
  GeoStoreItem,
  GeoItemAlias
};

// Geo search model associations (landlord DB)
GeoItem.hasMany(GeoStoreItem, { foreignKey: 'item_id', as: 'storeItems' });
GeoStoreItem.belongsTo(GeoItem, { foreignKey: 'item_id', as: 'item' });
GeoItem.hasMany(GeoItemAlias, { foreignKey: 'item_id', as: 'aliases' });
GeoItemAlias.belongsTo(GeoItem, { foreignKey: 'item_id', as: 'item' });
