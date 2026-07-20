import bcrypt from 'bcryptjs';
import { dgfyAccountRepository } from './repositories/dgfyAccountRepository.js';
import { buildGetDgfyLegalTermsUseCase } from './usecases/dgfyLegalUseCases.js';
import {
    buildGetAdminDgfyAccountUseCase,
    buildCreateAdminProvisionedDgfyAccountUseCase,
    buildDeleteAdminDgfyAccountUseCase,
    buildListAdminDgfyAccountsUseCase,
    buildReactivateAdminDgfyAccountUseCase,
    buildSuspendAdminDgfyAccountUseCase,
    buildUpdateAdminDgfyAccountProfileUseCase
} from './usecases/dgfyAdminAccountUseCases.js';
import {
    buildAcceptDgfyInvitationUseCase,
    buildChangeDgfyPasswordUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyHandoffUseCase,
    buildCreateDgfyInvitationUseCase,
    buildExchangeDgfyHandoffUseCase,
    buildLeaveDgfyCompanyUseCase,
    buildListDgfyAccountCompaniesUseCase,
    buildGetDgfyMeUseCase,
    buildLoginDgfyAccountUseCase,
    buildRejectDgfyInvitationUseCase,
    buildPreflightDgfyAccountRegistrationUseCase,
    buildRequestDgfyBusinessStepUpUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildRequestDgfyEmailVerificationUseCase,
    buildSearchDgfyBusinessAccountsUseCase,
    buildStartDgfyPosSessionUseCase,
    buildStartDgfyTenantSessionUseCase,
    buildSwitchDgfyCompanyUseCase,
    buildTransferDgfyCompanyOwnershipUseCase,
    buildUpdateDgfyProfileUseCase,
    buildVerifyDgfyEmailUseCase,
    buildRegisterDgfyAccountUseCase
} from './usecases/dgfyAuthUseCases.js';
import {
    buildCancelDgfyCustomerOrderUseCase,
    buildGetDgfyCustomerDashboardUseCase,
    buildGetDgfyCustomerLoyaltyUseCase,
    buildDgfyHistoricalBackfillUseCase,
    buildListDgfyCustomerReviewsForModerationUseCase,
    buildListDgfyCustomerActivitiesUseCase,
    buildListDgfyCustomerNotificationsUseCase,
    buildListPublicDgfyCustomerReviewsUseCase,
    buildMarkAllDgfyCustomerNotificationsReadUseCase,
    buildMarkDgfyCustomerNotificationReadUseCase,
    buildModerateDgfyCustomerReviewUseCase,
    buildManageDgfyCustomerAddressesUseCases,
    buildReorderDgfyCustomerOrderUseCase,
    buildRequestDgfyTrackingRecoveryUseCase,
    buildSubmitDgfyCustomerReviewUseCase,
    buildSubmitDgfyGuestReviewInviteUseCase,
    buildTrackDgfyCustomerReferenceUseCase,
    buildValidateDgfyReviewInviteUseCase,
    buildVerifyDgfyTrackingRecoveryUseCase
} from './usecases/dgfyCustomerUseCases.js';
import { requestEmailOtp, verifyEmailOtp } from '../../services/emailOtpService.js';
import { createTenantSessionForDgfyAccount } from '../../services/dgfyTenantSessionService.js';
import { validateDgfyPosTerminalPolicy } from '../../services/dgfyPosTerminalPolicyService.js';
import { sendEmail } from '../../services/emailService.js';
import { buildLegacyDgfyLinkStatus } from '../../services/dgfyLegacyAccessPolicy.js';

export const getDgfyLegacyLinkStatus = (input) => buildLegacyDgfyLinkStatus(input);

export const registerDgfyAccountUseCase = buildRegisterDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    hashPassword: (password) => bcrypt.hash(password, 10),
    verifyEmailOtp,
    emailOtpPurposes: {
        DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification'
    }
});

export const preflightDgfyAccountRegistrationUseCase = buildPreflightDgfyAccountRegistrationUseCase({
    repository: dgfyAccountRepository
});

export const getDgfyLegalTermsUseCase = buildGetDgfyLegalTermsUseCase();

export const loginDgfyAccountUseCase = buildLoginDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    comparePassword: bcrypt.compare
});

export const getDgfyMeUseCase = buildGetDgfyMeUseCase({
    repository: dgfyAccountRepository
});

export const updateDgfyProfileUseCase = buildUpdateDgfyProfileUseCase({
    repository: dgfyAccountRepository
});

export const changeDgfyPasswordUseCase = buildChangeDgfyPasswordUseCase({
    repository: dgfyAccountRepository,
    comparePassword: bcrypt.compare,
    hashPassword: (password) => bcrypt.hash(password, 10)
});

export const requestDgfyEmailVerificationUseCase = buildRequestDgfyEmailVerificationUseCase({
    requestEmailOtp,
    emailOtpPurposes: {
        DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification'
    }
});

export const verifyDgfyEmailUseCase = buildVerifyDgfyEmailUseCase({
    repository: dgfyAccountRepository,
    verifyEmailOtp,
    emailOtpPurposes: {
        DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification'
    }
});

export const requestDgfyPasswordResetUseCase = buildRequestDgfyPasswordResetUseCase({
    repository: dgfyAccountRepository,
    requestEmailOtp,
    emailOtpPurposes: {
        DGFY_PASSWORD_RESET: 'dgfy_password_reset'
    }
});

export const completeDgfyPasswordResetUseCase = buildCompleteDgfyPasswordResetUseCase({
    repository: dgfyAccountRepository,
    verifyEmailOtp,
    hashPassword: (password) => bcrypt.hash(password, 10),
    emailOtpPurposes: {
        DGFY_PASSWORD_RESET: 'dgfy_password_reset'
    }
});

export const createDgfyHandoffUseCase = buildCreateDgfyHandoffUseCase({
    repository: dgfyAccountRepository
});

export const exchangeDgfyHandoffUseCase = buildExchangeDgfyHandoffUseCase({
    repository: dgfyAccountRepository
});

export const acceptDgfyInvitationUseCase = buildAcceptDgfyInvitationUseCase({
    repository: dgfyAccountRepository,
    verifyEmailOtp,
    emailOtpPurposes: {
        DGFY_BUSINESS_STEP_UP: 'dgfy_business_step_up'
    }
});

export const rejectDgfyInvitationUseCase = buildRejectDgfyInvitationUseCase({
    repository: dgfyAccountRepository
});

export const createDgfyInvitationUseCase = buildCreateDgfyInvitationUseCase({
    repository: dgfyAccountRepository,
    sendEmail
});

export const startDgfyTenantSessionUseCase = buildStartDgfyTenantSessionUseCase({
    createTenantSessionForDgfyAccount
});

export const startDgfyPosSessionUseCase = buildStartDgfyPosSessionUseCase({
    createTenantSessionForDgfyAccount,
    repository: dgfyAccountRepository,
    validateTerminalPolicy: validateDgfyPosTerminalPolicy
});

export const listDgfyAccountCompaniesUseCase = buildListDgfyAccountCompaniesUseCase({
    repository: dgfyAccountRepository
});

export const searchDgfyBusinessAccountsUseCase = buildSearchDgfyBusinessAccountsUseCase({
    repository: dgfyAccountRepository
});

export const requestDgfyBusinessStepUpUseCase = buildRequestDgfyBusinessStepUpUseCase({
    requestEmailOtp,
    emailOtpPurposes: {
        DGFY_BUSINESS_STEP_UP: 'dgfy_business_step_up'
    }
});

export const switchDgfyCompanyUseCase = buildSwitchDgfyCompanyUseCase({
    repository: dgfyAccountRepository,
    createTenantSessionForDgfyAccount,
    verifyEmailOtp,
    emailOtpPurposes: {
        DGFY_BUSINESS_STEP_UP: 'dgfy_business_step_up'
    }
});

export const leaveDgfyCompanyUseCase = buildLeaveDgfyCompanyUseCase({
    repository: dgfyAccountRepository
});

export const transferDgfyCompanyOwnershipUseCase = buildTransferDgfyCompanyOwnershipUseCase({
    repository: dgfyAccountRepository,
    verifyEmailOtp,
    emailOtpPurposes: {
        DGFY_BUSINESS_STEP_UP: 'dgfy_business_step_up'
    }
});

export const listAdminDgfyAccountsUseCase = buildListAdminDgfyAccountsUseCase({
    repository: dgfyAccountRepository
});

export const getAdminDgfyAccountUseCase = buildGetAdminDgfyAccountUseCase({
    repository: dgfyAccountRepository
});

export const createAdminProvisionedDgfyAccountUseCase = buildCreateAdminProvisionedDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    hashPassword: (password) => bcrypt.hash(password, 10)
});

export const updateAdminDgfyAccountProfileUseCase = buildUpdateAdminDgfyAccountProfileUseCase({
    repository: dgfyAccountRepository
});

export const suspendAdminDgfyAccountUseCase = buildSuspendAdminDgfyAccountUseCase({
    repository: dgfyAccountRepository
});

export const reactivateAdminDgfyAccountUseCase = buildReactivateAdminDgfyAccountUseCase({
    repository: dgfyAccountRepository
});

export const deleteAdminDgfyAccountUseCase = buildDeleteAdminDgfyAccountUseCase({
    repository: dgfyAccountRepository
});

export const getDgfyCustomerDashboardUseCase = buildGetDgfyCustomerDashboardUseCase();
export const listDgfyCustomerActivitiesUseCase = buildListDgfyCustomerActivitiesUseCase();
export const listDgfyCustomerOrdersUseCase = (args = {}) => listDgfyCustomerActivitiesUseCase({ ...args, type: 'order' });
export const listDgfyCustomerBookingsUseCase = (args = {}) => listDgfyCustomerActivitiesUseCase({ ...args, type: 'booking' });
export const listDgfyCustomerNotificationsUseCase = buildListDgfyCustomerNotificationsUseCase();
export const markDgfyCustomerNotificationReadUseCase = buildMarkDgfyCustomerNotificationReadUseCase();
export const markAllDgfyCustomerNotificationsReadUseCase = buildMarkAllDgfyCustomerNotificationsReadUseCase();
export const trackDgfyCustomerReferenceUseCase = buildTrackDgfyCustomerReferenceUseCase();
export const cancelDgfyCustomerOrderUseCase = buildCancelDgfyCustomerOrderUseCase();
export const reorderDgfyCustomerOrderUseCase = buildReorderDgfyCustomerOrderUseCase();
const addressUseCases = buildManageDgfyCustomerAddressesUseCases();
export const listDgfyCustomerAddressesUseCase = addressUseCases.list;
export const createDgfyCustomerAddressUseCase = addressUseCases.create;
export const updateDgfyCustomerAddressUseCase = addressUseCases.update;
export const deleteDgfyCustomerAddressUseCase = addressUseCases.remove;
export const getDgfyCustomerLoyaltyUseCase = buildGetDgfyCustomerLoyaltyUseCase();
export const submitDgfyCustomerReviewUseCase = buildSubmitDgfyCustomerReviewUseCase();
export const validateDgfyReviewInviteUseCase = buildValidateDgfyReviewInviteUseCase();
export const submitDgfyGuestReviewInviteUseCase = buildSubmitDgfyGuestReviewInviteUseCase();
export const listPublicDgfyCustomerReviewsUseCase = buildListPublicDgfyCustomerReviewsUseCase();
export const listDgfyCustomerReviewsForModerationUseCase = buildListDgfyCustomerReviewsForModerationUseCase();
export const moderateDgfyCustomerReviewUseCase = buildModerateDgfyCustomerReviewUseCase();
export const dgfyHistoricalBackfillUseCase = buildDgfyHistoricalBackfillUseCase();
export const requestDgfyTrackingRecoveryUseCase = buildRequestDgfyTrackingRecoveryUseCase();
export const verifyDgfyTrackingRecoveryUseCase = buildVerifyDgfyTrackingRecoveryUseCase();

export { dgfyAccountRepository };
