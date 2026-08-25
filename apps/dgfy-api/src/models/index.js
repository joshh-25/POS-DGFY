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
import PosParkedSale from './PosParkedSale.js';
import PosPaymentSession from './PosPaymentSession.js';
import PosPaymentAllocation from './PosPaymentAllocation.js';
import PosTransactionAdjustment from './PosTransactionAdjustment.js';
import PosOrderPayment from './PosOrderPayment.js';
import PosMerchantTenderReconciliation from './PosMerchantTenderReconciliation.js';
import DeliveryJob from './DeliveryJob.js';
import DeliveryPersonnel from './DeliveryPersonnel.js';
import PosTransactionLine from './PosTransactionLine.js';
import PosDiscountRule from './PosDiscountRule.js';
import PosTransactionDiscount from './PosTransactionDiscount.js';
import PosTransactionDiscountLine from './PosTransactionDiscountLine.js';
import PosInvoiceCounter from './PosInvoiceCounter.js';
import PosZReadingSnapshot from './PosZReadingSnapshot.js';
import PosOperationReplay from './PosOperationReplay.js';
import PosCatalogOverride from './PosCatalogOverride.js';
import PosFiscalTerminalRegistration from './PosFiscalTerminalRegistration.js';
import PosFiscalEvent from './PosFiscalEvent.js';
import PosFiscalPrintEvent from './PosFiscalPrintEvent.js';
import PosESalesReport from './PosESalesReport.js';
import Employee from './Employee.js';
import EmployeeCreditAccount from './EmployeeCreditAccount.js';
import EmployeeCreditLedgerEntry from './EmployeeCreditLedgerEntry.js';
import Voucher from './Voucher.js';
import VoucherScope from './VoucherScope.js';
import VoucherRedemption from './VoucherRedemption.js';
import VoucherRedemptionLine from './VoucherRedemptionLine.js';
import Pricelist from './Pricelist.js';
import PricelistItem from './PricelistItem.js';
import StorefrontCatalogOverride from './StorefrontCatalogOverride.js';
import StorefrontLocationItemOverride from './StorefrontLocationItemOverride.js';
import PosTerminalShift from './PosTerminalShift.js';
import PosCashDrawerEvent from './PosCashDrawerEvent.js';
import EmployeeAttendanceSession from './EmployeeAttendanceSession.js';
import EmployeeBreakSegment from './EmployeeBreakSegment.js';
import PosTerminalOperatorSession from './PosTerminalOperatorSession.js';
import PosDrawerHandoffEvent from './PosDrawerHandoffEvent.js';
import PosShiftLocationTransition from './PosShiftLocationTransition.js';
import PosShiftLocationBackfillAudit from './PosShiftLocationBackfillAudit.js';
import TenantLocation from './TenantLocation.js';
import ItemLocationStock from './ItemLocationStock.js';
import InventoryReservation from './InventoryReservation.js';
import InventoryReservationLine from './InventoryReservationLine.js';
import UserLocationGrant from './UserLocationGrant.js';
import StoreCustomer from './StoreCustomer.js';
import StoreCustomerAddress from './StoreCustomerAddress.js';
import StorefrontFollow from './StorefrontFollow.js';
import ServiceItemDetail from './ServiceItemDetail.js';
import ServiceResource from './ServiceResource.js';
import ServiceProviderAssignment from './ServiceProviderAssignment.js';
import ServiceBooking from './ServiceBooking.js';
import ServiceBookingHold from './ServiceBookingHold.js';
import ServiceBookingLine from './ServiceBookingLine.js';
import ServiceBookingHandoffLeg from './ServiceBookingHandoffLeg.js';
import ServiceBookingStatusEvent from './ServiceBookingStatusEvent.js';
import ServiceWaitlistEntry from './ServiceWaitlistEntry.js';
import ServiceReminderOutbox from './ServiceReminderOutbox.js';
import WorkflowModeChangeLog from './WorkflowModeChangeLog.js';
import ServiceOptionGroup from './ServiceOptionGroup.js';
import ServiceOption from './ServiceOption.js';
import ServiceItemOptionGroup from './ServiceItemOptionGroup.js';
import ServiceBookingLineOption from './ServiceBookingLineOption.js';
import FnbModifierGroup from './FnbModifierGroup.js';
import FnbModifierOption from './FnbModifierOption.js';
import FnbItemModifierGroup from './FnbItemModifierGroup.js';
import FnbFolderModifierGroup from './FnbFolderModifierGroup.js';
import FnbModifierGroupLocationAvailability from './FnbModifierGroupLocationAvailability.js';
import FnbModifierOptionLocationAvailability from './FnbModifierOptionLocationAvailability.js';
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
import EmailDeliveryLogFactory from './Landlord/EmailDeliveryLog.js';
import DgfyAccountFactory from './Landlord/DgfyAccount.js';
import DgfyAccountTenantMembershipFactory from './Landlord/DgfyAccountTenantMembership.js';
import DgfyAccountHandoffFactory from './Landlord/DgfyAccountHandoff.js';
import DgfyAccountAdminAuditLogFactory from './Landlord/DgfyAccountAdminAuditLog.js';
import StoreConfigurationTemplateFactory from './Landlord/StoreConfigurationTemplate.js';
import StoreConfigurationTemplateModuleFactory from './Landlord/StoreConfigurationTemplateModule.js';
import StoreConfigurationTemplateAuditLogFactory from './Landlord/StoreConfigurationTemplateAuditLog.js';
import RegistrationIndustryFactory from './Landlord/RegistrationIndustry.js';
import RegistrationIndustryAuditLogFactory from './Landlord/RegistrationIndustryAuditLog.js';
import DgfyAccountBusinessAuditLogFactory from './Landlord/DgfyAccountBusinessAuditLog.js';
import DgfyLegalAcknowledgementFactory from './Landlord/DgfyLegalAcknowledgement.js';
import DgfyCustomerActivityFactory from './Landlord/DgfyCustomerActivity.js';
import DgfyCustomerNotificationFactory from './Landlord/DgfyCustomerNotification.js';
import DgfyCustomerAddressFactory from './Landlord/DgfyCustomerAddress.js';
import DgfyCustomerBackfillRunFactory from './Landlord/DgfyCustomerBackfillRun.js';
import DgfyCustomerReviewFactory from './Landlord/DgfyCustomerReview.js';
import DgfyLoyaltyTransactionFactory from './Landlord/DgfyLoyaltyTransaction.js';
import DgfyTrackingRecoveryCodeFactory from './Landlord/DgfyTrackingRecoveryCode.js';
import DgfyReviewInviteFactory from './Landlord/DgfyReviewInvite.js';
import PaymentFactory from './Landlord/Payment.js';
import WebhookLogFactory from './Landlord/WebhookLog.js';
import EngagementEventFactory from './Landlord/EngagementEvent.js';
import StorefrontDiscoveryIndexFactory from './Landlord/StorefrontDiscoveryIndex.js';
import StorefrontCustomDomainFactory from './Landlord/StorefrontCustomDomain.js';
import StorefrontCustomDomainAuditLogFactory from './Landlord/StorefrontCustomDomainAuditLog.js';
import StorefrontCustomDomainOperationFactory from './Landlord/StorefrontCustomDomainOperation.js';
import StorefrontHandleReservationFactory from './Landlord/StorefrontHandleReservation.js';
import TenantComplianceArtifactFactory from './Landlord/TenantComplianceArtifact.js';
import TenantCompliancePeripheralFactory from './Landlord/TenantCompliancePeripheral.js';
import TenantComplianceAuditLogFactory from './Landlord/TenantComplianceAuditLog.js';
import TenantComplianceAuditFailureFactory from './Landlord/TenantComplianceAuditFailure.js';
import TenantComplianceFinalReviewDocumentFactory from './Landlord/TenantComplianceFinalReviewDocument.js';
import TenantComplianceFinalReviewSignoffFactory from './Landlord/TenantComplianceFinalReviewSignoff.js';
import TenantAdminAuditLogFactory from './Landlord/TenantAdminAuditLog.js';
import TenantPaymentAccountFactory from './Landlord/TenantPaymentAccount.js';
import CommercePaymentSessionFactory from './Landlord/CommercePaymentSession.js';
import CommercePaymentRefundFactory from './Landlord/CommercePaymentRefund.js';
import TenantRevenueFeePolicyFactory from './Landlord/TenantRevenueFeePolicy.js';
import TenantRevenueTransactionFactory from './Landlord/TenantRevenueTransaction.js';
import TenantRevenueLedgerEntryFactory from './Landlord/TenantRevenueLedgerEntry.js';
import TenantSettlementBatchFactory from './Landlord/TenantSettlementBatch.js';
import TenantSettlementBatchItemFactory from './Landlord/TenantSettlementBatchItem.js';
import TenantSettlementBatchLedgerItemFactory from './Landlord/TenantSettlementBatchLedgerItem.js';
import TenantPayoutFactory from './Landlord/TenantPayout.js';
import TenantRevenueAdjustmentFactory from './Landlord/TenantRevenueAdjustment.js';
import TenantRevenueReconciliationRecordFactory from './Landlord/TenantRevenueReconciliationRecord.js';
import DgfyAffiliateEnrollmentFactory from './Landlord/DgfyAffiliateEnrollment.js';
import DgfyAffiliateAttributionFactory from './Landlord/DgfyAffiliateAttribution.js';
import DgfyAffiliateCommissionFactory from './Landlord/DgfyAffiliateCommission.js';
import DgfyAffiliatePayoutMethodFactory from './Landlord/DgfyAffiliatePayoutMethod.js';
import DgfyAffiliateCashoutFactory from './Landlord/DgfyAffiliateCashout.js';
import DgfyAffiliateInviteFactory from './Landlord/DgfyAffiliateInvite.js';
import DgfyAffiliatePriceRuleFactory from './Landlord/DgfyAffiliatePriceRule.js';
import TenantAffiliateSettingsFactory from './Landlord/TenantAffiliateSettings.js';
import TenantDownpaymentSettingsFactory from './Landlord/TenantDownpaymentSettings.js';
import PlatformAdminUserFactory from './Landlord/PlatformAdminUser.js';
import PlatformAdminPermissionFactory from './Landlord/PlatformAdminPermission.js';
import PlatformAdminSessionFactory from './Landlord/PlatformAdminSession.js';
import PlatformAdminAuditLogFactory from './Landlord/PlatformAdminAuditLog.js';
import CompanyRegistrationApplicationFactory from './Landlord/CompanyRegistrationApplication.js';
import CompanyRegistrationAttemptFactory from './Landlord/CompanyRegistrationAttempt.js';
import CompanyRegistrationEventFactory from './Landlord/CompanyRegistrationEvent.js';
import CompanyRegistrationEmailDeliveryFactory from './Landlord/CompanyRegistrationEmailDelivery.js';
import PlatformInvoiceFactory from './Landlord/PlatformInvoice.js';
import PlatformInvoicePaymentFactory from './Landlord/PlatformInvoicePayment.js';
import PlatformInvoiceSequenceFactory from './Landlord/PlatformInvoiceSequence.js';
import PlatformInvoiceArtifactFactory from './Landlord/PlatformInvoiceArtifact.js';
import PlatformInvoiceDeliveryFactory from './Landlord/PlatformInvoiceDelivery.js';
import PlatformInvoiceAdjustmentFactory from './Landlord/PlatformInvoiceAdjustment.js';
import PlatformInvoiceEventFactory from './Landlord/PlatformInvoiceEvent.js';
const Tenant = TenantFactory(sequelize);
const UserTenantMapping = UserTenantMappingFactory(sequelize);
const UserInvitation = UserInvitationFactory(sequelize);
const EmailOtp = EmailOtpFactory(sequelize);
const EmailDeliveryLog = EmailDeliveryLogFactory(sequelize);
const DgfyAccount = DgfyAccountFactory(sequelize);
const DgfyAccountTenantMembership = DgfyAccountTenantMembershipFactory(sequelize);
const DgfyAccountHandoff = DgfyAccountHandoffFactory(sequelize);
const DgfyAccountAdminAuditLog = DgfyAccountAdminAuditLogFactory(sequelize);
const StoreConfigurationTemplate = StoreConfigurationTemplateFactory(sequelize);
const StoreConfigurationTemplateModule = StoreConfigurationTemplateModuleFactory(sequelize);
const StoreConfigurationTemplateAuditLog = StoreConfigurationTemplateAuditLogFactory(sequelize);
const RegistrationIndustry = RegistrationIndustryFactory(sequelize);
const RegistrationIndustryAuditLog = RegistrationIndustryAuditLogFactory(sequelize);
const DgfyAccountBusinessAuditLog = DgfyAccountBusinessAuditLogFactory(sequelize);
const DgfyLegalAcknowledgement = DgfyLegalAcknowledgementFactory(sequelize);
const DgfyCustomerActivity = DgfyCustomerActivityFactory(sequelize);
const DgfyCustomerNotification = DgfyCustomerNotificationFactory(sequelize);
const DgfyCustomerAddress = DgfyCustomerAddressFactory(sequelize);
const DgfyCustomerBackfillRun = DgfyCustomerBackfillRunFactory(sequelize);
const DgfyCustomerReview = DgfyCustomerReviewFactory(sequelize);
const DgfyLoyaltyTransaction = DgfyLoyaltyTransactionFactory(sequelize);
const DgfyTrackingRecoveryCode = DgfyTrackingRecoveryCodeFactory(sequelize);
const DgfyReviewInvite = DgfyReviewInviteFactory(sequelize);
const Payment = PaymentFactory(sequelize);
const WebhookLog = WebhookLogFactory(sequelize);
const EngagementEvent = EngagementEventFactory(sequelize);
const StorefrontDiscoveryIndex = StorefrontDiscoveryIndexFactory(sequelize);
const StorefrontCustomDomain = StorefrontCustomDomainFactory(sequelize);
const StorefrontCustomDomainAuditLog = StorefrontCustomDomainAuditLogFactory(sequelize);
const StorefrontCustomDomainOperation = StorefrontCustomDomainOperationFactory(sequelize);
const StorefrontHandleReservation = StorefrontHandleReservationFactory(sequelize);
const TenantComplianceArtifact = TenantComplianceArtifactFactory(sequelize);
const TenantCompliancePeripheral = TenantCompliancePeripheralFactory(sequelize);
const TenantComplianceAuditLog = TenantComplianceAuditLogFactory(sequelize);
const TenantComplianceAuditFailure = TenantComplianceAuditFailureFactory(sequelize);
const TenantComplianceFinalReviewDocument = TenantComplianceFinalReviewDocumentFactory(sequelize);
const TenantComplianceFinalReviewSignoff = TenantComplianceFinalReviewSignoffFactory(sequelize);
const TenantAdminAuditLog = TenantAdminAuditLogFactory(sequelize);
const TenantPaymentAccount = TenantPaymentAccountFactory(sequelize);
const CommercePaymentSession = CommercePaymentSessionFactory(sequelize);
const CommercePaymentRefund = CommercePaymentRefundFactory(sequelize);
const TenantRevenueFeePolicy = TenantRevenueFeePolicyFactory(sequelize);
const TenantRevenueTransaction = TenantRevenueTransactionFactory(sequelize);
const TenantRevenueLedgerEntry = TenantRevenueLedgerEntryFactory(sequelize);
const TenantSettlementBatch = TenantSettlementBatchFactory(sequelize);
const TenantSettlementBatchItem = TenantSettlementBatchItemFactory(sequelize);
const TenantSettlementBatchLedgerItem = TenantSettlementBatchLedgerItemFactory(sequelize);
const TenantPayout = TenantPayoutFactory(sequelize);
const TenantRevenueAdjustment = TenantRevenueAdjustmentFactory(sequelize);
const TenantRevenueReconciliationRecord = TenantRevenueReconciliationRecordFactory(sequelize);
const DgfyAffiliateEnrollment = DgfyAffiliateEnrollmentFactory(sequelize);
const DgfyAffiliateAttribution = DgfyAffiliateAttributionFactory(sequelize);
const DgfyAffiliateCommission = DgfyAffiliateCommissionFactory(sequelize);
const DgfyAffiliatePayoutMethod = DgfyAffiliatePayoutMethodFactory(sequelize);
const DgfyAffiliateCashout = DgfyAffiliateCashoutFactory(sequelize);
const DgfyAffiliateInvite = DgfyAffiliateInviteFactory(sequelize);
const DgfyAffiliatePriceRule = DgfyAffiliatePriceRuleFactory(sequelize);
const TenantAffiliateSettings = TenantAffiliateSettingsFactory(sequelize);
const TenantDownpaymentSettings = TenantDownpaymentSettingsFactory(sequelize);
const PlatformAdminUser = PlatformAdminUserFactory(sequelize);
const PlatformAdminPermission = PlatformAdminPermissionFactory(sequelize);
const PlatformAdminSession = PlatformAdminSessionFactory(sequelize);
const PlatformAdminAuditLog = PlatformAdminAuditLogFactory(sequelize);
const CompanyRegistrationApplication = CompanyRegistrationApplicationFactory(sequelize);
const CompanyRegistrationAttempt = CompanyRegistrationAttemptFactory(sequelize);
const CompanyRegistrationEvent = CompanyRegistrationEventFactory(sequelize);
const CompanyRegistrationEmailDelivery = CompanyRegistrationEmailDeliveryFactory(sequelize);
const PlatformInvoice = PlatformInvoiceFactory(sequelize);
const PlatformInvoicePayment = PlatformInvoicePaymentFactory(sequelize);
const PlatformInvoiceSequence = PlatformInvoiceSequenceFactory(sequelize);
const PlatformInvoiceArtifact = PlatformInvoiceArtifactFactory(sequelize);
const PlatformInvoiceDelivery = PlatformInvoiceDeliveryFactory(sequelize);
const PlatformInvoiceAdjustment = PlatformInvoiceAdjustmentFactory(sequelize);
const PlatformInvoiceEvent = PlatformInvoiceEventFactory(sequelize);

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
Tenant.hasMany(StorefrontCustomDomain, { foreignKey: 'tenant_id', as: 'storefrontCustomDomains' });
StorefrontCustomDomain.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
StorefrontCustomDomain.hasMany(StorefrontCustomDomainAuditLog, { foreignKey: 'domain_id', as: 'auditLogs' });
StorefrontCustomDomainAuditLog.belongsTo(StorefrontCustomDomain, { foreignKey: 'domain_id', as: 'domain' });
StorefrontCustomDomain.belongsTo(StorefrontCustomDomain, { foreignKey: 'canonical_domain_id', as: 'canonicalDomain' });
StorefrontCustomDomain.hasMany(StorefrontCustomDomain, { foreignKey: 'canonical_domain_id', as: 'aliases' });
StorefrontCustomDomain.hasMany(StorefrontCustomDomainOperation, { foreignKey: 'domain_id', as: 'operations' });
StorefrontCustomDomainOperation.belongsTo(StorefrontCustomDomain, { foreignKey: 'domain_id', as: 'domain' });
Tenant.hasMany(StorefrontCustomDomainOperation, { foreignKey: 'tenant_id', as: 'storefrontCustomDomainOperations' });
StorefrontCustomDomainOperation.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(StorefrontHandleReservation, { foreignKey: 'tenant_id', as: 'storefrontHandleReservation' });
StorefrontHandleReservation.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
DgfyAccount.hasMany(DgfyAccountTenantMembership, { foreignKey: 'dgfy_account_id', as: 'tenantMemberships' });
DgfyAccountTenantMembership.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
DgfyAccount.hasMany(DgfyAccountHandoff, { foreignKey: 'dgfy_account_id', as: 'handoffs' });
StoreConfigurationTemplate.hasMany(StoreConfigurationTemplateModule, { foreignKey: 'template_id', as: 'modules' });
StoreConfigurationTemplateModule.belongsTo(StoreConfigurationTemplate, { foreignKey: 'template_id', as: 'template' });
StoreConfigurationTemplate.hasMany(StoreConfigurationTemplateAuditLog, { foreignKey: 'template_id', as: 'auditLogs' });
StoreConfigurationTemplateAuditLog.belongsTo(StoreConfigurationTemplate, { foreignKey: 'template_id', as: 'template' });
DgfyAccountHandoff.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
DgfyAccount.hasMany(DgfyAccountAdminAuditLog, { foreignKey: 'dgfy_account_id', as: 'adminAuditLogs' });
DgfyAccountAdminAuditLog.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
DgfyAccount.hasMany(DgfyAccountBusinessAuditLog, { foreignKey: 'dgfy_account_id', as: 'businessAuditLogs' });
DgfyAccountBusinessAuditLog.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
DgfyAccountBusinessAuditLog.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(DgfyLegalAcknowledgement, { foreignKey: 'tenant_id', as: 'legalAcknowledgements' });
DgfyLegalAcknowledgement.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
DgfyAccount.hasMany(DgfyLegalAcknowledgement, { foreignKey: 'dgfy_account_id', as: 'legalAcknowledgements' });
DgfyLegalAcknowledgement.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
Tenant.hasMany(DgfyAccountTenantMembership, { foreignKey: 'tenant_id', as: 'dgfyAccountMemberships' });
DgfyAccountTenantMembership.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
PlatformAdminUser.hasMany(PlatformAdminPermission, { foreignKey: 'admin_user_id', as: 'permissions', onDelete: 'RESTRICT' });
PlatformAdminPermission.belongsTo(PlatformAdminUser, { foreignKey: 'admin_user_id', as: 'adminUser', onDelete: 'RESTRICT' });
PlatformAdminUser.hasMany(PlatformAdminSession, { foreignKey: 'admin_user_id', as: 'sessions', onDelete: 'RESTRICT' });
PlatformAdminSession.belongsTo(PlatformAdminUser, { foreignKey: 'admin_user_id', as: 'adminUser', onDelete: 'RESTRICT' });
Tenant.hasOne(CompanyRegistrationApplication, { foreignKey: 'tenant_id', as: 'registrationApplication' });
CompanyRegistrationApplication.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
DgfyAccount.hasMany(CompanyRegistrationApplication, { foreignKey: 'dgfy_account_id', as: 'companyRegistrationApplications' });
CompanyRegistrationApplication.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
CompanyRegistrationApplication.hasMany(CompanyRegistrationAttempt, { foreignKey: 'application_id', as: 'attempts' });
CompanyRegistrationAttempt.belongsTo(CompanyRegistrationApplication, { foreignKey: 'application_id', as: 'application' });
CompanyRegistrationApplication.hasMany(CompanyRegistrationEvent, { foreignKey: 'application_id', as: 'events' });
CompanyRegistrationApplication.hasMany(CompanyRegistrationEmailDelivery, { foreignKey: 'application_id', as: 'emailDeliveries' });
CompanyRegistrationApplication.hasMany(PlatformInvoice, { foreignKey: 'registration_application_id', as: 'platformInvoices' });
PlatformInvoice.belongsTo(CompanyRegistrationApplication, { foreignKey: 'registration_application_id', as: 'registrationApplication' });
PlatformInvoice.belongsTo(PlatformInvoice, { foreignKey: 'parent_invoice_id', as: 'parentInvoice' });
PlatformInvoice.hasMany(PlatformInvoice, { foreignKey: 'parent_invoice_id', as: 'replacementInvoices' });
PlatformInvoice.hasMany(PlatformInvoicePayment, { foreignKey: 'invoice_id', as: 'payments' });
PlatformInvoicePayment.belongsTo(PlatformInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
PlatformInvoice.hasMany(PlatformInvoiceArtifact, { foreignKey: 'invoice_id', as: 'artifacts' });
PlatformInvoiceArtifact.belongsTo(PlatformInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
PlatformInvoice.hasMany(PlatformInvoiceDelivery, { foreignKey: 'invoice_id', as: 'deliveries' });
PlatformInvoiceDelivery.belongsTo(PlatformInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
PlatformInvoiceArtifact.hasMany(PlatformInvoiceDelivery, { foreignKey: 'artifact_id', as: 'deliveries' });
PlatformInvoiceDelivery.belongsTo(PlatformInvoiceArtifact, { foreignKey: 'artifact_id', as: 'artifact' });
PlatformInvoice.hasMany(PlatformInvoiceAdjustment, { foreignKey: 'invoice_id', as: 'adjustments' });
PlatformInvoiceAdjustment.belongsTo(PlatformInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
PlatformInvoice.hasMany(PlatformInvoiceEvent, { foreignKey: 'invoice_id', as: 'events' });
PlatformInvoiceEvent.belongsTo(PlatformInvoice, { foreignKey: 'invoice_id', as: 'invoice' });
Tenant.hasMany(TenantComplianceArtifact, { foreignKey: 'tenant_id', as: 'complianceArtifacts' });
TenantComplianceArtifact.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantCompliancePeripheral, { foreignKey: 'tenant_id', as: 'compliancePeripherals' });
TenantCompliancePeripheral.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceAuditLog, { foreignKey: 'tenant_id', as: 'complianceAuditLogs' });
TenantComplianceAuditLog.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantAdminAuditLog, { foreignKey: 'tenant_id', as: 'adminAuditLogs' });
TenantAdminAuditLog.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantComplianceFinalReviewDocument, { foreignKey: 'tenant_id', as: 'complianceFinalReviewDocuments' });
TenantComplianceFinalReviewDocument.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(TenantComplianceFinalReviewSignoff, { foreignKey: 'tenant_id', as: 'complianceFinalReviewSignoff' });
TenantComplianceFinalReviewSignoff.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(TenantPaymentAccount, { foreignKey: 'tenant_id', as: 'paymentAccount' });
TenantPaymentAccount.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CommercePaymentSession, { foreignKey: 'tenant_id', as: 'commercePaymentSessions' });
CommercePaymentSession.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(CommercePaymentRefund, { foreignKey: 'tenant_id', as: 'commercePaymentRefunds' });
CommercePaymentRefund.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
CommercePaymentSession.hasMany(CommercePaymentRefund, { foreignKey: 'payment_session_id', as: 'refunds' });
CommercePaymentRefund.belongsTo(CommercePaymentSession, { foreignKey: 'payment_session_id', as: 'paymentSession' });
Tenant.hasMany(TenantRevenueFeePolicy, { foreignKey: 'tenant_id', as: 'revenueFeePolicies' });
TenantRevenueFeePolicy.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(TenantRevenueTransaction, { foreignKey: 'tenant_id', as: 'revenueTransactions' });
TenantRevenueTransaction.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
TenantRevenueFeePolicy.hasMany(TenantRevenueTransaction, { foreignKey: 'policy_id', as: 'revenueTransactions' });
TenantRevenueTransaction.belongsTo(TenantRevenueFeePolicy, { foreignKey: 'policy_id', as: 'feePolicy' });
CommercePaymentSession.hasOne(TenantRevenueTransaction, { foreignKey: 'payment_session_id', as: 'revenueTransaction' });
TenantRevenueTransaction.belongsTo(CommercePaymentSession, { foreignKey: 'payment_session_id', as: 'paymentSession' });
TenantRevenueTransaction.hasMany(TenantRevenueLedgerEntry, { foreignKey: 'revenue_transaction_id', as: 'ledgerEntries' });
TenantRevenueLedgerEntry.belongsTo(TenantRevenueTransaction, { foreignKey: 'revenue_transaction_id', as: 'revenueTransaction' });
Tenant.hasMany(TenantRevenueReconciliationRecord, { foreignKey: 'tenant_id', as: 'revenueReconciliationRecords' });
TenantRevenueReconciliationRecord.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
TenantRevenueTransaction.hasMany(TenantRevenueReconciliationRecord, { foreignKey: 'revenue_transaction_id', as: 'reconciliationRecords' });
TenantRevenueReconciliationRecord.belongsTo(TenantRevenueTransaction, { foreignKey: 'revenue_transaction_id', as: 'revenueTransaction' });
Tenant.hasMany(TenantSettlementBatch, { foreignKey: 'tenant_id', as: 'settlementBatches' });
TenantSettlementBatch.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
TenantSettlementBatch.hasMany(TenantSettlementBatchItem, { foreignKey: 'settlement_batch_id', as: 'items' });
TenantSettlementBatchItem.belongsTo(TenantSettlementBatch, { foreignKey: 'settlement_batch_id', as: 'batch' });
TenantSettlementBatch.hasMany(TenantSettlementBatchLedgerItem, { foreignKey: 'settlement_batch_id', as: 'carryforwardItems' });
TenantSettlementBatchLedgerItem.belongsTo(TenantSettlementBatch, { foreignKey: 'settlement_batch_id', as: 'batch' });
TenantRevenueLedgerEntry.hasOne(TenantSettlementBatchLedgerItem, { foreignKey: 'ledger_entry_id', as: 'settlementAllocation' });
TenantSettlementBatchLedgerItem.belongsTo(TenantRevenueLedgerEntry, { foreignKey: 'ledger_entry_id', as: 'ledgerEntry' });
TenantRevenueTransaction.hasOne(TenantSettlementBatchItem, { foreignKey: 'revenue_transaction_id', as: 'settlementItem' });
TenantSettlementBatchItem.belongsTo(TenantRevenueTransaction, { foreignKey: 'revenue_transaction_id', as: 'revenueTransaction' });
TenantSettlementBatch.hasMany(TenantPayout, { foreignKey: 'settlement_batch_id', as: 'payouts' });
TenantPayout.belongsTo(TenantSettlementBatch, { foreignKey: 'settlement_batch_id', as: 'batch' });

// Affiliates Program associations (landlord DB only - order linkage to tenant-DB
// pos_transactions stays value-only via tenant_id + order_reference, no FK possible there).
DgfyAccount.hasMany(DgfyAffiliateEnrollment, { foreignKey: 'dgfy_account_id', as: 'affiliateEnrollments' });
DgfyAffiliateEnrollment.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
Tenant.hasMany(DgfyAffiliateEnrollment, { foreignKey: 'tenant_id', as: 'affiliateEnrollments' });
DgfyAffiliateEnrollment.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
DgfyAffiliateEnrollment.hasMany(DgfyAffiliateAttribution, { foreignKey: 'enrollment_id', as: 'attributions' });
DgfyAffiliateAttribution.belongsTo(DgfyAffiliateEnrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
DgfyAffiliateEnrollment.hasMany(DgfyAffiliateCommission, { foreignKey: 'enrollment_id', as: 'commissions' });
DgfyAffiliateCommission.belongsTo(DgfyAffiliateEnrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
DgfyAccount.hasMany(DgfyAffiliatePayoutMethod, { foreignKey: 'dgfy_account_id', as: 'affiliatePayoutMethods' });
DgfyAffiliatePayoutMethod.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'dgfyAccount' });
DgfyAffiliateEnrollment.hasMany(DgfyAffiliateCashout, { foreignKey: 'enrollment_id', as: 'cashouts' });
DgfyAffiliateCashout.belongsTo(DgfyAffiliateEnrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
DgfyAffiliatePayoutMethod.hasMany(DgfyAffiliateCashout, { foreignKey: 'payout_method_id', as: 'cashouts' });
DgfyAffiliateCashout.belongsTo(DgfyAffiliatePayoutMethod, { foreignKey: 'payout_method_id', as: 'payoutMethod' });
DgfyAffiliateCashout.hasMany(DgfyAffiliateCommission, { foreignKey: 'cashout_id', as: 'commissions' });
DgfyAffiliateCommission.belongsTo(DgfyAffiliateCashout, { foreignKey: 'cashout_id', as: 'cashout' });
Tenant.hasOne(TenantAffiliateSettings, { foreignKey: 'tenant_id', as: 'affiliateSettings' });
TenantAffiliateSettings.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasOne(TenantDownpaymentSettings, { foreignKey: 'tenant_id', as: 'downpaymentSettings' });
TenantDownpaymentSettings.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(DgfyAffiliateInvite, { foreignKey: 'tenant_id', as: 'affiliateInvites' });
DgfyAffiliateInvite.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
// dgfy_affiliate_price_rules only associates on tenant_id: enrollment_id and item_id use the
// sentinel-0 "applies to all" convention (see the migration), so a strict belongsTo association on
// either would misrepresent template rows as referencing a real enrollment/item that doesn't exist.
// Resolution queries (Stage D) filter directly on tenant_id/enrollment_id/item_id instead of a
// Sequelize include.
Tenant.hasMany(DgfyAffiliatePriceRule, { foreignKey: 'tenant_id', as: 'affiliatePriceRules' });
DgfyAffiliatePriceRule.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

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
PosTransaction.belongsTo(User, { foreignKey: 'payment_collected_by', as: 'paymentCollectedByUser' });
PosTransaction.belongsTo(User, { foreignKey: 'voided_by', as: 'voidedByUser' });
PosTransaction.belongsTo(User, { foreignKey: 'accepted_by', as: 'acceptedByUser' });
PosTransaction.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosTransaction.belongsTo(PosTerminalOperatorSession, { foreignKey: 'operator_session_id', as: 'operatorSession', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
PosTransaction.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosTransaction.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
PosTransaction.belongsTo(User, { foreignKey: 'fnb_server_id', as: 'fnbServer' });
PosTransaction.belongsTo(EmployeeCreditAccount, { foreignKey: 'employee_credit_account_id', as: 'employeeCreditAccount' });
PosTransaction.belongsTo(User, { foreignKey: 'employee_credit_user_id', as: 'employeeCreditEmployee' });
PosTransaction.hasMany(PosTransactionLine, { foreignKey: 'pos_transaction_id', as: 'lines' });
PosTransaction.hasMany(PosTransactionAdjustment, { foreignKey: 'pos_transaction_id', as: 'adjustments' });
PosTransactionAdjustment.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosTransactionAdjustment.belongsTo(PosPaymentAllocation, { foreignKey: 'pos_payment_allocation_id', as: 'paymentAllocation' });
PosTransactionAdjustment.belongsTo(User, { foreignKey: 'original_cashier_id', as: 'originalCashier' });
PosTransactionAdjustment.belongsTo(PosTerminalShift, { foreignKey: 'original_shift_id', as: 'originalShift' });
PosTransactionAdjustment.belongsTo(TenantLocation, { foreignKey: 'original_location_id', as: 'originalLocation' });
PosTransactionAdjustment.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actorUser' });
PosTransactionAdjustment.belongsTo(PosTerminalShift, { foreignKey: 'actor_shift_id', as: 'actorShift' });
PosTransactionAdjustment.belongsTo(TenantLocation, { foreignKey: 'actor_location_id', as: 'actorLocation' });
PosTransactionAdjustment.belongsTo(User, { foreignKey: 'approved_by', as: 'approvedByUser' });
PosTransactionAdjustment.belongsTo(PosCashDrawerEvent, { foreignKey: 'cash_drawer_event_id', as: 'cashDrawerEvent' });
User.hasMany(PosTransactionAdjustment, { foreignKey: 'original_cashier_id', as: 'originalTransactionAdjustments' });
User.hasMany(PosTransactionAdjustment, { foreignKey: 'actor_user_id', as: 'actorTransactionAdjustments' });
User.hasMany(PosTransactionAdjustment, { foreignKey: 'approved_by', as: 'approvedTransactionAdjustments' });
PosTerminalShift.hasMany(PosTransactionAdjustment, { foreignKey: 'original_shift_id', as: 'originalTransactionAdjustments' });
PosTerminalShift.hasMany(PosTransactionAdjustment, { foreignKey: 'actor_shift_id', as: 'actorTransactionAdjustments' });
TenantLocation.hasMany(PosTransactionAdjustment, { foreignKey: 'original_location_id', as: 'originalTransactionAdjustments' });
TenantLocation.hasMany(PosTransactionAdjustment, { foreignKey: 'actor_location_id', as: 'actorTransactionAdjustments' });
PosCashDrawerEvent.hasOne(PosTransactionAdjustment, { foreignKey: 'cash_drawer_event_id', as: 'transactionAdjustment' });
PosPaymentAllocation.hasMany(PosTransactionAdjustment, { foreignKey: 'pos_payment_allocation_id', as: 'transactionAdjustments' });
// Phase 137 (#819) -- ADR 0069 clause 4 downpayment/balance/refund/forfeiture ledger.
PosTransaction.hasMany(PosOrderPayment, { foreignKey: 'pos_transaction_id', as: 'orderPayments' });
PosOrderPayment.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosOrderPayment.belongsTo(PosOrderPayment, { foreignKey: 'related_pos_order_payment_id', as: 'relatedPayment' });
PosOrderPayment.belongsTo(User, { foreignKey: 'recorded_by', as: 'recordedByUser' });
User.hasMany(PosOrderPayment, { foreignKey: 'recorded_by', as: 'recordedOrderPayments' });
PosParkedSale.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
PosParkedSale.belongsTo(User, { foreignKey: 'claimed_by', as: 'claimedByUser' });
PosParkedSale.belongsTo(User, { foreignKey: 'cancelled_by', as: 'cancelledByUser' });
PosParkedSale.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosParkedSale.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosParkedSale.belongsTo(PosTransaction, { foreignKey: 'completed_transaction_id', as: 'completedTransaction' });
PosPaymentSession.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
PosPaymentSession.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosPaymentSession.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosPaymentSession.belongsTo(PosParkedSale, { foreignKey: 'parked_sale_id', as: 'parkedSale' });
PosPaymentSession.belongsTo(PosTransaction, { foreignKey: 'completed_transaction_id', as: 'completedTransaction' });
PosPaymentSession.hasMany(PosPaymentAllocation, { foreignKey: 'session_id', as: 'allocations' });
PosPaymentAllocation.belongsTo(PosPaymentSession, { foreignKey: 'session_id', as: 'session' });
PosPaymentAllocation.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });
PosPaymentAllocation.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosPaymentAllocation.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosPaymentAllocation.belongsTo(User, { foreignKey: 'cancelled_by', as: 'cancelledByUser' });
PosPaymentAllocation.belongsTo(User, { foreignKey: 'reversed_by', as: 'reversedByUser' });
PosMerchantTenderReconciliation.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
PosMerchantTenderReconciliation.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosMerchantTenderReconciliation.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewedByUser' });
PosMerchantTenderReconciliation.belongsTo(PosMerchantTenderReconciliation, { foreignKey: 'supersedes_reconciliation_id', as: 'supersededReconciliation' });
PosTerminalShift.hasMany(PosParkedSale, { foreignKey: 'shift_id', as: 'parkedSales' });
TenantLocation.hasMany(PosParkedSale, { foreignKey: 'location_id', as: 'posParkedSales' });
User.hasMany(PosParkedSale, { foreignKey: 'cashier_id', as: 'posParkedSales' });
User.hasMany(PosParkedSale, { foreignKey: 'claimed_by', as: 'claimedPosParkedSales' });
User.hasMany(PosParkedSale, { foreignKey: 'cancelled_by', as: 'cancelledPosParkedSales' });
PosTransaction.hasMany(PosParkedSale, { foreignKey: 'completed_transaction_id', as: 'parkedSaleCompletions' });
PosParkedSale.hasMany(PosPaymentSession, { foreignKey: 'parked_sale_id', as: 'paymentSessions' });
PosTransaction.hasMany(PosPaymentSession, { foreignKey: 'completed_transaction_id', as: 'paymentSessions' });
PosTerminalShift.hasMany(PosPaymentSession, { foreignKey: 'shift_id', as: 'paymentSessions' });
TenantLocation.hasMany(PosPaymentSession, { foreignKey: 'location_id', as: 'posPaymentSessions' });
User.hasMany(PosPaymentSession, { foreignKey: 'cashier_id', as: 'posPaymentSessions' });
PosTerminalShift.hasMany(PosPaymentAllocation, { foreignKey: 'shift_id', as: 'paymentAllocations' });
TenantLocation.hasMany(PosPaymentAllocation, { foreignKey: 'location_id', as: 'posPaymentAllocations' });
User.hasMany(PosPaymentAllocation, { foreignKey: 'cashier_id', as: 'posPaymentAllocations' });
User.hasMany(PosPaymentAllocation, { foreignKey: 'cancelled_by', as: 'cancelledPaymentAllocations' });
User.hasMany(PosPaymentAllocation, { foreignKey: 'reversed_by', as: 'reversedPaymentAllocations' });
PosTerminalShift.hasMany(PosMerchantTenderReconciliation, { foreignKey: 'shift_id', as: 'merchantTenderReconciliations' });
TenantLocation.hasMany(PosMerchantTenderReconciliation, { foreignKey: 'location_id', as: 'merchantTenderReconciliations' });
User.hasMany(PosMerchantTenderReconciliation, { foreignKey: 'reviewed_by', as: 'reviewedMerchantTenderReconciliations' });
PosTransaction.hasOne(DeliveryJob, { foreignKey: 'pos_transaction_id', as: 'deliveryJob' });
DeliveryJob.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
DeliveryJob.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
DeliveryJob.belongsTo(DeliveryPersonnel, { foreignKey: 'delivery_personnel_id', as: 'deliveryPersonnel' });
DeliveryJob.belongsTo(User, { foreignKey: 'assigned_by', as: 'assignedByUser' });
DeliveryJob.belongsTo(PosTerminalShift, { foreignKey: 'assigned_shift_id', as: 'assignedShift' });
DeliveryPersonnel.hasMany(DeliveryJob, { foreignKey: 'delivery_personnel_id', as: 'deliveryJobs' });
DeliveryPersonnel.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
DeliveryPersonnel.belongsTo(User, { foreignKey: 'created_by', as: 'createdByUser' });
DeliveryPersonnel.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedByUser' });
PosTransaction.hasMany(PosFiscalEvent, { foreignKey: 'pos_transaction_id', as: 'fiscalEvents' });
PosTransaction.hasMany(PosFiscalPrintEvent, { foreignKey: 'pos_transaction_id', as: 'fiscalPrintEvents' });
PosTransactionLine.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosTransactionLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
PosTransaction.hasOne(PosTransactionDiscount, { foreignKey: 'transaction_id', as: 'discount' });
PosTransactionDiscount.belongsTo(PosTransaction, { foreignKey: 'transaction_id', as: 'transaction' });
PosDiscountRule.hasMany(PosTransactionDiscount, { foreignKey: 'discount_rule_id', as: 'transactionDiscounts' });
PosTransactionDiscount.belongsTo(PosDiscountRule, { foreignKey: 'discount_rule_id', as: 'rule' });
PosTransactionDiscount.hasMany(PosTransactionDiscountLine, { foreignKey: 'transaction_discount_id', as: 'lines' });
PosTransactionDiscountLine.belongsTo(PosTransactionDiscount, { foreignKey: 'transaction_discount_id', as: 'discount' });
PosTransactionLine.hasOne(PosTransactionDiscountLine, { foreignKey: 'transaction_line_id', as: 'discountAllocation' });
PosTransactionDiscountLine.belongsTo(PosTransactionLine, { foreignKey: 'transaction_line_id', as: 'transactionLine' });
User.hasMany(PosTransactionDiscount, { foreignKey: 'manager_approval_id', as: 'approvedPosDiscounts' });
PosTransactionDiscount.belongsTo(User, { foreignKey: 'manager_approval_id', as: 'approvedBy' });
PosFiscalEvent.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosFiscalPrintEvent.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'transaction' });
PosFiscalTerminalRegistration.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
User.hasMany(PosTransaction, { foreignKey: 'cashier_id', as: 'posTransactions' });
User.hasMany(PosTransaction, { foreignKey: 'accepted_by', as: 'acceptedPosTransactions' });
Item.hasMany(PosTransactionLine, { foreignKey: 'item_id', as: 'posTransactionLines' });
Item.hasMany(ItemLocationStock, { foreignKey: 'item_id', as: 'locationStocks' });
Item.hasMany(InventoryReservationLine, { foreignKey: 'item_id', as: 'inventoryReservationLines' });
ItemLocationStock.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasOne(PosCatalogOverride, { foreignKey: 'item_id', as: 'posCatalogOverride' });
PosCatalogOverride.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasOne(StorefrontCatalogOverride, { foreignKey: 'item_id', as: 'storefrontCatalogOverride' });
StorefrontCatalogOverride.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Item.hasMany(StorefrontLocationItemOverride, { foreignKey: 'item_id', as: 'storefrontLocationItemOverrides' });
StorefrontLocationItemOverride.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
// onUpdate/onDelete pinned to RESTRICT: cashier_id is the base column of the STORED generated
// column active_operator_user_id, and MySQL forbids ON UPDATE CASCADE/SET NULL/SET DEFAULT on
// a generated column's base column (see 20260724000001-enforce-one-open-shift-per-operator.cjs).
// Sequelize's default onUpdate is CASCADE, which would recreate the broken FK on any tenant
// provisioned via sequelize.sync() unless pinned here.
PosTerminalShift.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosTerminalShift.belongsTo(User, { foreignKey: 'closed_by', as: 'closedByUser' });
PosTerminalShift.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosTerminalShift.hasMany(PosCashDrawerEvent, { foreignKey: 'pos_terminal_shift_id', as: 'cashEvents' });
PosTerminalShift.hasMany(PosTransaction, { foreignKey: 'shift_id', as: 'transactions' });
PosTerminalShift.hasMany(PosTerminalOperatorSession, { foreignKey: 'pos_terminal_shift_id', as: 'operatorSessions' });
PosTerminalOperatorSession.belongsTo(PosTerminalShift, { foreignKey: 'pos_terminal_shift_id', as: 'shift', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosTerminalOperatorSession.belongsTo(User, { foreignKey: 'user_id', as: 'operator', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosTerminalOperatorSession.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosTerminalOperatorSession.belongsTo(EmployeeAttendanceSession, { foreignKey: 'employee_attendance_session_id', as: 'attendanceSession', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
PosTerminalOperatorSession.hasMany(PosTransaction, { foreignKey: 'operator_session_id', as: 'transactions' });
User.hasMany(PosTerminalOperatorSession, { foreignKey: 'user_id', as: 'posTerminalOperatorSessions' });
TenantLocation.hasMany(PosTerminalOperatorSession, { foreignKey: 'location_id', as: 'posTerminalOperatorSessions' });
EmployeeAttendanceSession.hasMany(PosTerminalOperatorSession, { foreignKey: 'employee_attendance_session_id', as: 'operatorSessions' });
PosTerminalShift.hasMany(DeliveryJob, { foreignKey: 'assigned_shift_id', as: 'assignedDeliveryJobs' });
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
EmployeeAttendanceSession.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
EmployeeAttendanceSession.belongsTo(User, { foreignKey: 'user_id', as: 'user', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
EmployeeAttendanceSession.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
EmployeeAttendanceSession.belongsTo(User, { foreignKey: 'closed_by', as: 'closedByUser', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
EmployeeAttendanceSession.hasMany(EmployeeBreakSegment, { foreignKey: 'employee_attendance_session_id', as: 'breakSegments' });
EmployeeBreakSegment.belongsTo(EmployeeAttendanceSession, { foreignKey: 'employee_attendance_session_id', as: 'attendanceSession', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
EmployeeBreakSegment.belongsTo(User, { foreignKey: 'ended_by', as: 'endedByUser', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
Employee.hasMany(EmployeeAttendanceSession, { foreignKey: 'employee_id', as: 'attendanceSessions' });
User.hasMany(EmployeeAttendanceSession, { foreignKey: 'user_id', as: 'attendanceSessions' });
User.hasMany(EmployeeAttendanceSession, { foreignKey: 'closed_by', as: 'closedAttendanceSessions' });
TenantLocation.hasMany(EmployeeAttendanceSession, { foreignKey: 'location_id', as: 'attendanceSessions' });
User.hasMany(EmployeeBreakSegment, { foreignKey: 'ended_by', as: 'endedBreakSegments' });
PosDrawerHandoffEvent.belongsTo(PosTerminalShift, { foreignKey: 'pos_terminal_shift_id', as: 'shift', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosDrawerHandoffEvent.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosDrawerHandoffEvent.belongsTo(User, { foreignKey: 'outgoing_operator_user_id', as: 'outgoingOperator', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
PosDrawerHandoffEvent.belongsTo(User, { foreignKey: 'incoming_operator_user_id', as: 'incomingOperator', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
PosDrawerHandoffEvent.belongsTo(User, { foreignKey: 'outgoing_acknowledged_by', as: 'outgoingAcknowledgedBy', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
PosDrawerHandoffEvent.belongsTo(User, { foreignKey: 'incoming_acknowledged_by', as: 'incomingAcknowledgedBy', onUpdate: 'RESTRICT', onDelete: 'SET NULL' });
PosDrawerHandoffEvent.belongsTo(User, { foreignKey: 'recorded_by', as: 'recordedByUser', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' });
PosTerminalShift.hasMany(PosDrawerHandoffEvent, { foreignKey: 'pos_terminal_shift_id', as: 'drawerHandoffEvents' });
TenantLocation.hasMany(PosDrawerHandoffEvent, { foreignKey: 'location_id', as: 'drawerHandoffEvents' });
User.hasMany(PosDrawerHandoffEvent, { foreignKey: 'outgoing_operator_user_id', as: 'outgoingDrawerHandoffs' });
User.hasMany(PosDrawerHandoffEvent, { foreignKey: 'incoming_operator_user_id', as: 'incomingDrawerHandoffs' });
User.hasMany(PosDrawerHandoffEvent, { foreignKey: 'outgoing_acknowledged_by', as: 'outgoingAcknowledgedDrawerHandoffs' });
User.hasMany(PosDrawerHandoffEvent, { foreignKey: 'incoming_acknowledged_by', as: 'incomingAcknowledgedDrawerHandoffs' });
User.hasMany(PosDrawerHandoffEvent, { foreignKey: 'recorded_by', as: 'recordedDrawerHandoffs' });
User.hasOne(EmployeeCreditAccount, { foreignKey: 'user_id', as: 'employeeCreditAccount' });
EmployeeCreditAccount.belongsTo(User, { foreignKey: 'user_id', as: 'employee' });
Employee.hasOne(EmployeeCreditAccount, { foreignKey: 'employee_id', as: 'employeeCreditAccount' });
EmployeeCreditAccount.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employeeProfile' });
Employee.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
TenantLocation.hasMany(Employee, { foreignKey: 'location_id', as: 'employees' });
Employee.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });
Employee.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });
EmployeeCreditAccount.hasMany(EmployeeCreditLedgerEntry, { foreignKey: 'account_id', as: 'ledgerEntries' });
EmployeeCreditLedgerEntry.belongsTo(EmployeeCreditAccount, { foreignKey: 'account_id', as: 'account' });
EmployeeCreditLedgerEntry.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'posTransaction' });
EmployeeCreditLedgerEntry.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor' });
EmployeeCreditLedgerEntry.belongsTo(PosTerminalShift, { foreignKey: 'shift_id', as: 'shift' });
EmployeeCreditLedgerEntry.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
PosTransaction.hasMany(EmployeeCreditLedgerEntry, { foreignKey: 'pos_transaction_id', as: 'employeeCreditLedgerEntries' });

// Vouchers (#455, ADR 0066). Campaign -> scopes, campaign -> redemption ledger -> per-item lines.
// `scope_ref_id` is polymorphic across items/item_folders, so it gets no association here.
Voucher.hasMany(VoucherScope, { foreignKey: 'voucher_id', as: 'scopes' });
VoucherScope.belongsTo(Voucher, { foreignKey: 'voucher_id', as: 'voucher' });
Voucher.hasMany(VoucherRedemption, { foreignKey: 'voucher_id', as: 'redemptions' });
VoucherRedemption.belongsTo(Voucher, { foreignKey: 'voucher_id', as: 'voucher' });
VoucherRedemption.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id', as: 'posTransaction' });
VoucherRedemption.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
VoucherRedemption.belongsTo(User, { foreignKey: 'cashier_user_id', as: 'cashier' });
VoucherRedemption.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
VoucherRedemption.belongsTo(VoucherRedemption, { foreignKey: 'reversal_of_redemption_id', as: 'reversalOf' });
VoucherRedemption.hasMany(VoucherRedemptionLine, { foreignKey: 'voucher_redemption_id', as: 'lines' });
VoucherRedemptionLine.belongsTo(VoucherRedemption, { foreignKey: 'voucher_redemption_id', as: 'redemption' });
VoucherRedemptionLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
PosTransaction.hasMany(VoucherRedemption, { foreignKey: 'pos_transaction_id', as: 'voucherRedemptions' });

// Pricelists (#696, extends #584/ADR 0066). Pricelist -> per-item price rows; a fixed_price voucher
// may attach one instead of a single fixed_unit_price_centavos. draft_of_pricelist_id is a
// self-reference (a draft revision points at the published row it will replace on publish).
Pricelist.hasMany(PricelistItem, { foreignKey: 'pricelist_id', as: 'items' });
PricelistItem.belongsTo(Pricelist, { foreignKey: 'pricelist_id', as: 'pricelist' });
PricelistItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Pricelist.belongsTo(Pricelist, { foreignKey: 'draft_of_pricelist_id', as: 'publishedPricelist' });
Pricelist.hasOne(Pricelist, { foreignKey: 'draft_of_pricelist_id', as: 'draftRevision' });
Voucher.belongsTo(Pricelist, { foreignKey: 'pricelist_id', as: 'pricelist' });
Pricelist.hasMany(Voucher, { foreignKey: 'pricelist_id', as: 'vouchers' });
PosTransaction.belongsTo(Employee, { foreignKey: 'employee_credit_employee_id', as: 'employeeCreditEmployeeProfile' });
User.hasMany(PosShiftLocationTransition, { foreignKey: 'actor_user_id', as: 'posShiftLocationTransitions' });
TenantLocation.hasMany(PosTransaction, { foreignKey: 'location_id', as: 'posTransactions' });
TenantLocation.hasMany(PosTerminalShift, { foreignKey: 'location_id', as: 'posTerminalShifts' });
TenantLocation.hasMany(ItemLocationStock, { foreignKey: 'location_id', as: 'itemLocationStocks' });
TenantLocation.hasMany(InventoryReservation, { foreignKey: 'location_id', as: 'inventoryReservations' });
TenantLocation.hasMany(StorefrontLocationItemOverride, { foreignKey: 'location_id', as: 'storefrontItemOverrides' });
TenantLocation.hasMany(FIFOBatch, { foreignKey: 'location_id', as: 'fifoBatches' });
TenantLocation.hasMany(StockMovement, { foreignKey: 'location_id', as: 'stockMovements' });
TenantLocation.hasMany(StockMovement, { foreignKey: 'source_location_id', as: 'sourceStockMovements' });
TenantLocation.hasMany(StockMovement, { foreignKey: 'destination_location_id', as: 'destinationStockMovements' });
ItemLocationStock.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
InventoryReservation.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
InventoryReservation.belongsTo(PosTransaction, { foreignKey: 'source_id', as: 'sourceOrder', constraints: false });
InventoryReservation.hasMany(InventoryReservationLine, {
  foreignKey: 'inventory_reservation_id',
  as: 'lines',
  onDelete: 'CASCADE'
});
InventoryReservationLine.belongsTo(InventoryReservation, {
  foreignKey: 'inventory_reservation_id',
  as: 'reservation'
});
InventoryReservationLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
StorefrontLocationItemOverride.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
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
ServiceBooking.hasMany(ServiceBookingLine, { foreignKey: 'booking_id', as: 'lines' });
ServiceBookingLine.belongsTo(ServiceBooking, { foreignKey: 'booking_id', as: 'booking' });
ServiceBookingLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
ServiceBookingLine.belongsTo(PosTransactionLine, { foreignKey: 'pos_transaction_line_id', as: 'posTransactionLine' });
// Phase 88 of #482 (ADR 0064 decision 2) - the handoff-leg entity keyed to the booking.
ServiceBooking.hasMany(ServiceBookingHandoffLeg, { foreignKey: 'booking_id', as: 'handoffLegs' });
ServiceBookingHandoffLeg.belongsTo(ServiceBooking, { foreignKey: 'booking_id', as: 'booking' });
ServiceBookingHandoffLeg.belongsTo(StoreCustomerAddress, { foreignKey: 'customer_address_id', as: 'customerAddress' });
ServiceBookingHandoffLeg.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
ServiceBookingHandoffLeg.hasMany(ServiceBookingStatusEvent, { foreignKey: 'handoff_leg_id', as: 'statusEvents' });
// Phase 88 of #482 (ADR 0064 decision 4) - the transition-event table.
ServiceBooking.hasMany(ServiceBookingStatusEvent, { foreignKey: 'booking_id', as: 'statusEvents' });
ServiceBookingStatusEvent.belongsTo(ServiceBooking, { foreignKey: 'booking_id', as: 'booking' });
ServiceBookingStatusEvent.belongsTo(ServiceBookingHandoffLeg, { foreignKey: 'handoff_leg_id', as: 'handoffLeg' });
ServiceBookingStatusEvent.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actorUser' });
ServiceWaitlistEntry.belongsTo(Item, { foreignKey: 'service_item_id', as: 'serviceItem' });
ServiceWaitlistEntry.belongsTo(StoreCustomer, { foreignKey: 'store_customer_id', as: 'storeCustomer' });
ServiceOptionGroup.hasMany(ServiceOption, { foreignKey: 'group_id', as: 'options' });
ServiceOption.belongsTo(ServiceOptionGroup, { foreignKey: 'group_id', as: 'group' });
ServiceOption.belongsTo(Item, { foreignKey: 'linked_physical_item_id', as: 'linkedPhysicalItem' });
ServiceItemOptionGroup.belongsTo(Item, { foreignKey: 'service_item_id', as: 'serviceItem' });
ServiceItemOptionGroup.belongsTo(ServiceOptionGroup, { foreignKey: 'option_group_id', as: 'group' });
Item.belongsToMany(ServiceOptionGroup, { through: ServiceItemOptionGroup, foreignKey: 'service_item_id', otherKey: 'option_group_id', as: 'serviceOptionGroups', uniqueKey: 'unique_svc_item_opt_grp' });
ServiceOptionGroup.belongsToMany(Item, { through: ServiceItemOptionGroup, foreignKey: 'option_group_id', otherKey: 'service_item_id', as: 'serviceItems', uniqueKey: 'unique_svc_item_opt_grp' });
ServiceBookingLine.hasMany(ServiceBookingLineOption, { foreignKey: 'booking_line_id', as: 'options' });
ServiceBookingLineOption.belongsTo(ServiceBookingLine, { foreignKey: 'booking_line_id', as: 'line' });

// Food & Beverage associations
FnbModifierGroup.hasMany(FnbModifierOption, { foreignKey: 'modifier_group_id', as: 'options' });
FnbModifierOption.belongsTo(FnbModifierGroup, { foreignKey: 'modifier_group_id', as: 'group' });
FnbModifierOption.belongsTo(Item, { foreignKey: 'sku_item_id', as: 'skuItem' });
FnbModifierGroup.hasMany(FnbModifierGroupLocationAvailability, { foreignKey: 'modifier_group_id', as: 'locationAvailability' });
FnbModifierGroupLocationAvailability.belongsTo(FnbModifierGroup, { foreignKey: 'modifier_group_id', as: 'modifierGroup' });
FnbModifierGroupLocationAvailability.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
FnbModifierOption.hasMany(FnbModifierOptionLocationAvailability, { foreignKey: 'modifier_option_id', as: 'locationAvailability' });
FnbModifierOptionLocationAvailability.belongsTo(FnbModifierOption, { foreignKey: 'modifier_option_id', as: 'modifierOption' });
FnbModifierOptionLocationAvailability.belongsTo(TenantLocation, { foreignKey: 'location_id', as: 'location' });
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
ItemFolder.belongsToMany(FnbModifierGroup, {
  through: FnbFolderModifierGroup,
  foreignKey: 'folder_id',
  otherKey: 'modifier_group_id',
  as: 'fnbModifierGroups'
});
FnbModifierGroup.belongsToMany(ItemFolder, {
  through: FnbFolderModifierGroup,
  foreignKey: 'modifier_group_id',
  otherKey: 'folder_id',
  as: 'menuFolders'
});
FnbFolderModifierGroup.belongsTo(ItemFolder, { foreignKey: 'folder_id', as: 'folder' });
FnbFolderModifierGroup.belongsTo(FnbModifierGroup, { foreignKey: 'modifier_group_id', as: 'modifierGroup' });
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
  PosParkedSale,
  PosPaymentSession,
  PosPaymentAllocation,
  PosTransactionAdjustment,
  PosOrderPayment,
  PosMerchantTenderReconciliation,
  DeliveryJob,
  DeliveryPersonnel,
  PosTransactionLine,
  PosDiscountRule,
  PosTransactionDiscount,
  PosTransactionDiscountLine,
  PosInvoiceCounter,
  PosZReadingSnapshot,
  PosOperationReplay,
  PosCatalogOverride,
  PosFiscalTerminalRegistration,
  PosFiscalEvent,
  PosFiscalPrintEvent,
  PosESalesReport,
  Employee,
  EmployeeCreditAccount,
  EmployeeCreditLedgerEntry,
  Voucher,
  VoucherScope,
  VoucherRedemption,
  VoucherRedemptionLine,
  Pricelist,
  PricelistItem,
  StorefrontCatalogOverride,
  StorefrontLocationItemOverride,
  StorefrontHandleReservation,
  PosTerminalShift,
  PosCashDrawerEvent,
  EmployeeAttendanceSession,
  EmployeeBreakSegment,
  PosTerminalOperatorSession,
  PosDrawerHandoffEvent,
  PosShiftLocationTransition,
  PosShiftLocationBackfillAudit,
  TenantLocation,
  ItemLocationStock,
  InventoryReservation,
  InventoryReservationLine,
  UserLocationGrant,
  StoreCustomer,
  StoreCustomerAddress,
  StorefrontFollow,
  ServiceItemDetail,
  ServiceResource,
  ServiceProviderAssignment,
  ServiceBooking,
  ServiceBookingHold,
  ServiceBookingLine,
  ServiceBookingHandoffLeg,
  ServiceBookingStatusEvent,
  ServiceWaitlistEntry,
  ServiceReminderOutbox,
  WorkflowModeChangeLog,
  StoreConfigurationTemplate,
  StoreConfigurationTemplateModule,
  StoreConfigurationTemplateAuditLog,
  RegistrationIndustry,
  RegistrationIndustryAuditLog,
  ServiceOptionGroup,
  ServiceOption,
  ServiceItemOptionGroup,
  ServiceBookingLineOption,
  FnbModifierGroup,
  FnbModifierOption,
  FnbItemModifierGroup,
  FnbFolderModifierGroup,
  FnbModifierGroupLocationAvailability,
  FnbModifierOptionLocationAvailability,
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
  EmailDeliveryLog,
  DgfyAccount,
  DgfyAccountTenantMembership,
  DgfyAccountHandoff,
  DgfyAccountAdminAuditLog,
  DgfyAccountBusinessAuditLog,
  DgfyLegalAcknowledgement,
  DgfyCustomerActivity,
  DgfyCustomerNotification,
  DgfyCustomerAddress,
  DgfyCustomerBackfillRun,
  DgfyCustomerReview,
  DgfyLoyaltyTransaction,
  DgfyTrackingRecoveryCode,
  DgfyReviewInvite,
  Payment,
  WebhookLog,
  EngagementEvent,
  AiUsageLog,
  StorefrontDiscoveryIndex,
  StorefrontCustomDomain,
  StorefrontCustomDomainAuditLog,
  StorefrontCustomDomainOperation,
  TenantComplianceArtifact,
  TenantCompliancePeripheral,
  TenantComplianceAuditLog,
  TenantComplianceAuditFailure,
  TenantComplianceFinalReviewDocument,
  TenantComplianceFinalReviewSignoff,
  TenantAdminAuditLog,
  TenantPaymentAccount,
  CommercePaymentSession,
  CommercePaymentRefund,
  TenantRevenueFeePolicy,
  TenantRevenueTransaction,
  TenantRevenueLedgerEntry,
  TenantSettlementBatch,
  TenantSettlementBatchItem,
  TenantSettlementBatchLedgerItem,
  TenantPayout,
  TenantRevenueAdjustment,
  TenantRevenueReconciliationRecord,
  DgfyAffiliateEnrollment,
  DgfyAffiliateAttribution,
  DgfyAffiliateCommission,
  DgfyAffiliatePayoutMethod,
  DgfyAffiliateCashout,
  DgfyAffiliateInvite,
  DgfyAffiliatePriceRule,
  TenantAffiliateSettings
  ,TenantDownpaymentSettings
  ,PlatformAdminUser
  ,PlatformAdminPermission
  ,PlatformAdminSession
  ,PlatformAdminAuditLog
  ,CompanyRegistrationApplication
  ,CompanyRegistrationAttempt
  ,CompanyRegistrationEvent
  ,CompanyRegistrationEmailDelivery
  ,PlatformInvoice
  ,PlatformInvoicePayment
  ,PlatformInvoiceSequence
  ,PlatformInvoiceArtifact
  ,PlatformInvoiceDelivery
  ,PlatformInvoiceAdjustment
  ,PlatformInvoiceEvent
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
  PosParkedSale,
  PosPaymentSession,
  PosPaymentAllocation,
  PosTransactionAdjustment,
  PosOrderPayment,
  PosMerchantTenderReconciliation,
  PosTransactionLine,
  PosDiscountRule,
  PosTransactionDiscount,
  PosTransactionDiscountLine,
  PosInvoiceCounter,
  PosZReadingSnapshot,
  PosOperationReplay,
  PosCatalogOverride,
  PosFiscalTerminalRegistration,
  PosFiscalEvent,
  PosFiscalPrintEvent,
  PosESalesReport,
  Employee,
  EmployeeCreditAccount,
  EmployeeCreditLedgerEntry,
  Voucher,
  VoucherScope,
  VoucherRedemption,
  VoucherRedemptionLine,
  Pricelist,
  PricelistItem,
  StorefrontCatalogOverride,
  StorefrontLocationItemOverride,
  StorefrontHandleReservation,
  PosTerminalShift,
  PosCashDrawerEvent,
  EmployeeAttendanceSession,
  EmployeeBreakSegment,
  PosTerminalOperatorSession,
  PosDrawerHandoffEvent,
  PosShiftLocationTransition,
  PosShiftLocationBackfillAudit,
  TenantLocation,
  ItemLocationStock,
  InventoryReservation,
  InventoryReservationLine,
  UserLocationGrant,
  StoreCustomer,
  StoreCustomerAddress,
  StorefrontFollow,
  ServiceItemDetail,
  ServiceResource,
  ServiceProviderAssignment,
  ServiceBooking,
  ServiceBookingHold,
  ServiceBookingLine,
  ServiceBookingHandoffLeg,
  ServiceBookingStatusEvent,
  ServiceWaitlistEntry,
  ServiceReminderOutbox,
  WorkflowModeChangeLog,
  StoreConfigurationTemplate,
  StoreConfigurationTemplateModule,
  StoreConfigurationTemplateAuditLog,
  RegistrationIndustry,
  RegistrationIndustryAuditLog,
  ServiceOptionGroup,
  ServiceOption,
  ServiceItemOptionGroup,
  ServiceBookingLineOption,
  FnbModifierGroup,
  FnbModifierOption,
  FnbItemModifierGroup,
  FnbFolderModifierGroup,
  FnbModifierGroupLocationAvailability,
  FnbModifierOptionLocationAvailability,
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
  EmailDeliveryLog,
  DgfyAccount,
  DgfyAccountTenantMembership,
  DgfyAccountHandoff,
  DgfyAccountAdminAuditLog,
  DgfyAccountBusinessAuditLog,
  DgfyLegalAcknowledgement,
  DgfyCustomerActivity,
  DgfyCustomerNotification,
  DgfyCustomerAddress,
  DgfyCustomerBackfillRun,
  DgfyCustomerReview,
  DgfyLoyaltyTransaction,
  DgfyTrackingRecoveryCode,
  DgfyReviewInvite,
  Payment,
  WebhookLog,
  EngagementEvent,
  AiUsageLog,
  StorefrontDiscoveryIndex,
  StorefrontCustomDomain,
  StorefrontCustomDomainAuditLog,
  StorefrontCustomDomainOperation,
  TenantComplianceArtifact,
  TenantCompliancePeripheral,
  TenantComplianceAuditLog,
  TenantComplianceAuditFailure,
  TenantComplianceFinalReviewDocument,
  TenantComplianceFinalReviewSignoff,
  TenantAdminAuditLog,
  TenantPaymentAccount,
  CommercePaymentSession,
  CommercePaymentRefund,
  TenantRevenueFeePolicy,
  TenantRevenueTransaction,
  TenantRevenueLedgerEntry,
  TenantSettlementBatch,
  TenantSettlementBatchItem,
  TenantSettlementBatchLedgerItem,
  TenantPayout,
  TenantRevenueAdjustment,
  TenantRevenueReconciliationRecord,
  DgfyAffiliateEnrollment,
  DgfyAffiliateAttribution,
  DgfyAffiliateCommission,
  DgfyAffiliatePayoutMethod,
  DgfyAffiliateCashout,
  DgfyAffiliateInvite,
  DgfyAffiliatePriceRule,
  TenantAffiliateSettings,
  TenantDownpaymentSettings,
  PlatformAdminUser,
  PlatformAdminPermission,
  PlatformAdminSession,
  PlatformAdminAuditLog,
  CompanyRegistrationApplication,
  CompanyRegistrationAttempt,
  CompanyRegistrationEvent,
  CompanyRegistrationEmailDelivery,
  PlatformInvoice,
  PlatformInvoicePayment,
  PlatformInvoiceSequence,
  PlatformInvoiceArtifact,
  PlatformInvoiceDelivery,
  PlatformInvoiceAdjustment,
  PlatformInvoiceEvent,
  GeoItem,
  GeoStoreItem,
  GeoItemAlias
};

// Geo search model associations (landlord DB)
GeoItem.hasMany(GeoStoreItem, { foreignKey: 'item_id', as: 'storeItems' });
GeoStoreItem.belongsTo(GeoItem, { foreignKey: 'item_id', as: 'item' });
GeoItem.hasMany(GeoItemAlias, { foreignKey: 'item_id', as: 'aliases' });
GeoItemAlias.belongsTo(GeoItem, { foreignKey: 'item_id', as: 'item' });
