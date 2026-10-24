import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import logger from '../../config/logger.js';
import * as emailService from '../../services/emailService.js';
import { paypalService } from '../../services/paypalService.js';
import { provisionTenant, deleteTenantDatabase } from '../../services/tenantProvisioningService.js';
import {
    removeStorefrontDiscoveryIndexForTenant,
    syncStorefrontDiscoveryIndexForTenant
} from '../../services/storefrontDiscoveryIndexService.js';
import { syncStorefrontDiscoveryWithReliability } from '../../services/storefrontDiscoverySyncReliabilityService.js';
import * as landlordService from '../../services/landlordService.js';
import { trackEngagementEvent } from '../../services/engagementService.js';
import { getTenantRegistrationApprovalMode, TENANT_REGISTRATION_APPROVAL_MODES } from '../../config/tenantRegistrationApproval.js';
import { tenantAdminRepository } from './repositories/tenantAdminRepository.js';
import { companyRegistrationRepository } from './repositories/companyRegistrationRepository.js';
import { dgfyAccountRepository, dgfyAffiliateRepository } from '../dgfy/index.js';
import { dispatchDgfyCompanyRegistrationRejectionNotification } from '../dgfy/services/dgfyCustomerNotifications.js';
import { registrationIndustryRepository } from '../registration/index.js';
import { createTenantPayMongoChildAccountUseCase } from '../commercePayments/index.js';
import { buildRegisterCompanyRequestUseCase } from './usecases/registerCompanyRequestUseCase.js';
import { buildListTenantsUseCase } from './usecases/listTenantsUseCase.js';
import { buildApproveTenantUseCase } from './usecases/approveTenantUseCase.js';
import { buildRejectTenantUseCase } from './usecases/rejectTenantUseCase.js';
import { buildProvisionNewTenantUseCase } from './usecases/provisionNewTenantUseCase.js';
import {
    buildAssignTenantOwnerByAdminUseCase,
    buildCreateAdminProvisionedAccountAndTenantUseCase,
    buildCreateAdminProvisionedTenantUseCase
} from './usecases/adminAssistedProvisioningUseCase.js';
import { buildGetPricingSettingsUseCase } from './usecases/getPricingSettingsUseCase.js';
import { buildUpdatePricingSettingsUseCase } from './usecases/updatePricingSettingsUseCase.js';
import { buildUpdateTenantUseCase } from './usecases/updateTenantUseCase.js';
import { buildDeleteTenantUseCase } from './usecases/deleteTenantUseCase.js';
import { buildGetCompanyRegistrationStatusUseCase, buildResubmitCompanyRegistrationUseCase } from './usecases/companyRegistrationStatusUseCase.js';
import {
    buildUploadCompanyRegistrationFileUseCase as buildUploadCompanyRegistrationApplicationFileUseCase,
    buildListAdminCompanyRegistrationUseCase,
    buildDownloadAdminCompanyRegistrationUploadUseCase,
    buildRevokeAdminCompanyRegistrationUploadUseCase
} from './usecases/companyRegistrationUploadUseCases.js';
import { materializeApprovedCompanyRegistration } from './usecases/materializeApprovedCompanyRegistration.js';
import {
    buildCreateCompanyRegistrationDraftUseCase,
    buildGetCompanyRegistrationDraftUseCase,
    buildRemoveCompanyRegistrationFileUseCase,
    buildSubmitCompanyRegistrationDraftUseCase,
    buildUpdateCompanyRegistrationDraftUseCase,
    buildUploadCompanyRegistrationFileUseCase
} from './usecases/companyRegistrationDraftUseCases.js';
import { companyRegistrationDraftRepository } from './repositories/companyRegistrationDraftRepository.js';
import { companyRegistrationDownloadAuditRepository } from './repositories/companyRegistrationDownloadAuditRepository.js';
import * as companyRegistrationStorage from '../../services/companyRegistrationStorage.js';
import { buildUpdateTenantCapabilitiesUseCase } from './usecases/updateTenantCapabilitiesUseCase.js';
import { buildApplyTemplateToTenantUseCase } from './usecases/applyTemplateToTenantUseCase.js';
import {
    buildListTenantCapabilityAuditLogsUseCase,
    buildListTenantPosMetadataAuditLogsUseCase,
    buildListTenantAffiliateSlotsAuditLogsUseCase
} from './usecases/listTenantCapabilityAuditLogsUseCase.js';
import { buildGetTenantPosMetadataUseCase } from './usecases/getTenantPosMetadataUseCase.js';
import { buildUpdateTenantPosMetadataUseCase } from './usecases/updateTenantPosMetadataUseCase.js';
import {
    buildGetTenantAffiliateSlotsUseCase,
    buildUpdateTenantAffiliateSlotsUseCase
} from './usecases/updateTenantAffiliateSlotsUseCase.js';
import { updateSettingsUseCase } from '../settings/index.js';
import { downpaymentSettingsRepository } from '../downpayment/repositories/downpaymentSettingsRepository.js';
import { readTenantCapabilities } from './usecases/tenantCapabilitySettings.js';
import tenantConnector from '../../utils/TenantConnector.js';
import { getTenantModels } from '../../utils/tenantModelFactory.js';
import dbStore from '../../utils/dbStore.js';
import { storefrontAssetStorage } from '../settings/repositories/storefrontAssetStorage.js';
import {
  buildApproveCompanyRegistrationDraftUseCase,
  buildMaterializeCompanyRegistrationDraftUseCase
} from './usecases/companyRegistrationDraftMaterializationUseCase.js';
import { buildCompanyRegistrationUploadReviewUseCases } from './usecases/companyRegistrationUploadReviewUseCases.js';

const shouldAutoCreatePayMongoChildAccounts = () => (
    String(process.env.PAYMONGO_AUTO_CREATE_CHILD_ACCOUNTS || '').toLowerCase() === 'true'
);

export const registerCompanyRequestUseCase = buildRegisterCompanyRequestUseCase({
    tenantAdminRepository,
    companyRegistrationRepository,
    paypalService,
    trackEngagementEvent,
    addEmailTenantMapping: landlordService.addEmailTenantMapping,
    dgfyAccountRepository,
    registrationIndustryRepository,
    emailService,
    idGenerator: uuidv4,
    getTenantRegistrationApprovalMode: () => getTenantRegistrationApprovalMode(process.env, logger),
    provisionTenant,
    materializeApprovedCompanyRegistration,
    createPayMongoChildAccountForTenant: createTenantPayMongoChildAccountUseCase,
    shouldAutoCreatePayMongoChildAccounts,
    logger
});

export const listTenantsUseCase = buildListTenantsUseCase({
    tenantAdminRepository,
    tenantConnector,
    readTenantCapabilities,
    logger
});

export const approveTenantUseCase = buildApproveTenantUseCase({
    tenantAdminRepository,
    companyRegistrationRepository,
    dgfyAccountRepository,
    provisionTenant,
    createPayMongoChildAccountForTenant: createTenantPayMongoChildAccountUseCase,
    shouldAutoCreatePayMongoChildAccounts,
    materializeApprovedCompanyRegistration,
    emailService,
    logger
});

export const rejectTenantUseCase = buildRejectTenantUseCase({
    tenantAdminRepository,
    companyRegistrationRepository,
    emailService,
    notifyCompanyRegistrationRejected: dispatchDgfyCompanyRegistrationRejectionNotification,
    logger
});

export const provisionNewTenantUseCase = buildProvisionNewTenantUseCase({
    provisionTenant,
    logger
});

export const createAdminProvisionedTenantUseCase = buildCreateAdminProvisionedTenantUseCase({
    tenantAdminRepository,
    provisionTenant,
    hashPassword: (password) => bcrypt.hash(password, 10),
    idGenerator: uuidv4,
    logger
});

export const createAdminProvisionedAccountAndTenantUseCase = buildCreateAdminProvisionedAccountAndTenantUseCase({
    tenantAdminRepository,
    dgfyAccountRepository,
    provisionTenant,
    tenantConnector,
    hashPassword: (password) => bcrypt.hash(password, 10),
    idGenerator: uuidv4,
    logger
});

export const assignTenantOwnerByAdminUseCase = buildAssignTenantOwnerByAdminUseCase({
    tenantAdminRepository,
    dgfyAccountRepository,
    tenantConnector,
    logger
});

export const getPricingSettingsUseCase = buildGetPricingSettingsUseCase({
    tenantAdminRepository,
    logger
});

export const updatePricingSettingsUseCase = buildUpdatePricingSettingsUseCase({
    tenantAdminRepository,
    logger
});

export const updateTenantUseCase = buildUpdateTenantUseCase({
    tenantAdminRepository,
    logger
});

export const updateTenantCapabilitiesUseCase = buildUpdateTenantCapabilitiesUseCase({
    downpaymentSettingsRepository,
    tenantAdminRepository,
    tenantConnector,
    syncStorefrontDiscoveryIndexForTenant,
    logger
});

export const applyTemplateToTenantUseCase = buildApplyTemplateToTenantUseCase({
    tenantAdminRepository,
    tenantConnector,
    logger
});

export const listTenantCapabilityAuditLogsUseCase = buildListTenantCapabilityAuditLogsUseCase({
    tenantAdminRepository,
    logger
});

export const listTenantPosMetadataAuditLogsUseCase = buildListTenantPosMetadataAuditLogsUseCase({
    tenantAdminRepository,
    logger
});

export const getTenantPosMetadataUseCase = buildGetTenantPosMetadataUseCase({
    tenantAdminRepository,
    tenantConnector,
    logger
});

export const updateTenantPosMetadataUseCase = buildUpdateTenantPosMetadataUseCase({
    tenantAdminRepository,
    tenantConnector,
    updateSettingsUseCase,
    logger
});

export const getTenantAffiliateSlotsUseCase = buildGetTenantAffiliateSlotsUseCase({
    tenantAdminRepository,
    dgfyAffiliateRepository,
    logger
});

export const updateTenantAffiliateSlotsUseCase = buildUpdateTenantAffiliateSlotsUseCase({
    tenantAdminRepository,
    dgfyAffiliateRepository,
    logger
});

export const listTenantAffiliateSlotsAuditLogsUseCase = buildListTenantAffiliateSlotsAuditLogsUseCase({
    tenantAdminRepository,
    logger
});

export const deleteTenantUseCase = buildDeleteTenantUseCase({
    tenantAdminRepository,
    deleteTenantDatabase,
    removeStorefrontDiscoveryIndexForTenant,
    syncStorefrontDiscoveryIndexForTenant,
    logger
});

export const getCompanyRegistrationStatusUseCase = buildGetCompanyRegistrationStatusUseCase({ repository: companyRegistrationRepository });
export const resubmitCompanyRegistrationUseCase = buildResubmitCompanyRegistrationUseCase({
    repository: companyRegistrationRepository,
    transaction: tenantAdminRepository.transaction,
    emailService,
    logger
});
export const uploadCompanyRegistrationApplicationFileUseCase = buildUploadCompanyRegistrationApplicationFileUseCase({
    repository: companyRegistrationRepository,
    transaction: tenantAdminRepository.transaction
});
export const listAdminCompanyRegistrationUseCase = buildListAdminCompanyRegistrationUseCase({ repository: companyRegistrationRepository });
export const downloadAdminCompanyRegistrationUploadUseCase = buildDownloadAdminCompanyRegistrationUploadUseCase({ repository: companyRegistrationRepository });
export const revokeAdminCompanyRegistrationUploadUseCase = buildRevokeAdminCompanyRegistrationUploadUseCase({ repository: companyRegistrationRepository, transaction: tenantAdminRepository.transaction });

export const createCompanyRegistrationDraftUseCase = buildCreateCompanyRegistrationDraftUseCase({
    repository: companyRegistrationDraftRepository,
    logger
});
export const getCompanyRegistrationDraftUseCase = buildGetCompanyRegistrationDraftUseCase({
    repository: companyRegistrationDraftRepository,
    logger
});
export const updateCompanyRegistrationDraftUseCase = buildUpdateCompanyRegistrationDraftUseCase({
    repository: companyRegistrationDraftRepository,
    logger
});
export const uploadCompanyRegistrationFileUseCase = buildUploadCompanyRegistrationFileUseCase({
    repository: companyRegistrationDraftRepository,
    storage: {
        persist: companyRegistrationStorage.persistCompanyRegistrationFile,
        remove: companyRegistrationStorage.removeCompanyRegistrationFile
    },
    logger
});
export const removeCompanyRegistrationFileUseCase = buildRemoveCompanyRegistrationFileUseCase({
    repository: companyRegistrationDraftRepository,
    logger
});
export const materializeCompanyRegistrationDraftUseCase = buildMaterializeCompanyRegistrationDraftUseCase({
    repository: companyRegistrationDraftRepository,
    tenantConnector,
    getTenantModels,
    dbStore,
    companyRegistrationStorage,
    storefrontAssetStorage,
    syncStorefrontDiscoveryWithReliability,
    logger
});

const companyRegistrationDraftApprovalDependencies = {
    repository: companyRegistrationDraftRepository,
    tenantAdminRepository,
    companyRegistrationRepository,
    dgfyAccountRepository,
    registrationIndustryRepository,
    provisionTenant,
    materializeCompanyRegistrationDraft: materializeCompanyRegistrationDraftUseCase,
    emailService,
    logger
};

export const approveCompanyRegistrationDraftUseCase = buildApproveCompanyRegistrationDraftUseCase(
    companyRegistrationDraftApprovalDependencies
);

export const autoApproveCompanyRegistrationDraftUseCase = buildApproveCompanyRegistrationDraftUseCase({
    ...companyRegistrationDraftApprovalDependencies,
    allowSystemActor: true
});

export const submitCompanyRegistrationDraftUseCase = buildSubmitCompanyRegistrationDraftUseCase({
    repository: companyRegistrationDraftRepository,
    logger,
    autoApproveCompanyRegistrationDraft: autoApproveCompanyRegistrationDraftUseCase,
    shouldAutoApprove: () => getTenantRegistrationApprovalMode(process.env, logger) === TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD
});

const companyRegistrationUploadReviewUseCases = buildCompanyRegistrationUploadReviewUseCases({
    repository: companyRegistrationDraftRepository,
    tenantAdminRepository,
    companyRegistrationRepository,
    companyRegistrationDownloadAuditRepository,
    storage: {
        pathForKey: companyRegistrationStorage.companyRegistrationStoragePathForKey
    },
    logger
});

export const listAdminCompanyRegistrationDraftsUseCase = companyRegistrationUploadReviewUseCases.listDrafts;
export const listCompanyRegistrationUploadsUseCase = companyRegistrationUploadReviewUseCases.listUploads;
export const downloadCompanyRegistrationUploadUseCase = companyRegistrationUploadReviewUseCases.downloadUpload;
export const downloadCompanyRegistrationMenuArchiveUseCase = companyRegistrationUploadReviewUseCases.downloadMenuArchive;

export * from './contracts/tenantRepository.contract.js';
export * from './contracts/tenantAdminRepository.contract.js';
export * from './repositories/tenantRepository.js';
export * from './repositories/tenantAdminRepository.js';
export * from './repositories/companyRegistrationRepository.js';
