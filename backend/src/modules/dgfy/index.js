import bcrypt from 'bcryptjs';
import { dgfyAccountRepository } from './repositories/dgfyAccountRepository.js';
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
import { requestEmailOtp, verifyEmailOtp } from '../../services/emailOtpService.js';

export const registerDgfyAccountUseCase = buildRegisterDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    hashPassword: (password) => bcrypt.hash(password, 10)
});

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

export { dgfyAccountRepository };
