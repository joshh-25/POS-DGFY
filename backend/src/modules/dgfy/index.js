import bcrypt from 'bcryptjs';
import { dgfyAccountRepository } from './repositories/dgfyAccountRepository.js';
import { buildGetDgfyLegalTermsUseCase } from './usecases/dgfyLegalUseCases.js';
import {
    buildAcceptDgfyInvitationUseCase,
    buildChangeDgfyPasswordUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyHandoffUseCase,
    buildExchangeDgfyHandoffUseCase,
    buildGetDgfyMeUseCase,
    buildLoginDgfyAccountUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildRequestDgfyEmailVerificationUseCase,
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
    buildListPublicDgfyCustomerReviewsUseCase,
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

export const registerDgfyAccountUseCase = buildRegisterDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    hashPassword: (password) => bcrypt.hash(password, 10)
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
    repository: dgfyAccountRepository
});

export const getDgfyCustomerDashboardUseCase = buildGetDgfyCustomerDashboardUseCase();
export const listDgfyCustomerActivitiesUseCase = buildListDgfyCustomerActivitiesUseCase();
export const listDgfyCustomerOrdersUseCase = (args = {}) => listDgfyCustomerActivitiesUseCase({ ...args, type: 'order' });
export const listDgfyCustomerBookingsUseCase = (args = {}) => listDgfyCustomerActivitiesUseCase({ ...args, type: 'booking' });
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
