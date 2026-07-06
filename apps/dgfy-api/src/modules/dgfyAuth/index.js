import {
    buildPreflightDgfyAccountRegistrationUseCase,
    buildRegisterDgfyAccountUseCase,
    buildLoginDgfyAccountUseCase,
    buildGetDgfyMeUseCase,
    buildUpdateDgfyProfileUseCase,
    buildChangeDgfyPasswordUseCase,
    buildRequestDgfyEmailVerificationUseCase,
    buildVerifyDgfyEmailUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyHandoffUseCase,
    buildExchangeDgfyHandoffUseCase
} from './usecases/dgfyAuthUseCases.js';
import { buildGetDgfyLegalTermsUseCase } from './usecases/dgfyLegalUseCases.js';
import { buildDgfyAccountRepository } from './repositories/dgfyAccountRepository.js';
import bcrypt from 'bcryptjs';
import sequelize from '../../config/db.js';
import { requestEmailOtp, verifyEmailOtp } from '../../infra/emailOtp.js';

const dgfyAccountRepository = buildDgfyAccountRepository({ sequelize });

const emailOtpPurposes = {
    DGFY_ACCOUNT_VERIFICATION: 'dgfy_account_verification',
    DGFY_PASSWORD_RESET: 'dgfy_password_reset'
};

export const preflightDgfyAccountRegistrationUseCase = buildPreflightDgfyAccountRegistrationUseCase({
    repository: dgfyAccountRepository
});

export const registerDgfyAccountUseCase = buildRegisterDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    hashPassword: (password) => bcrypt.hash(password, 10),
    verifyEmailOtp,
    emailOtpPurposes
});

export const loginDgfyAccountUseCase = buildLoginDgfyAccountUseCase({
    repository: dgfyAccountRepository,
    comparePassword: bcrypt.compare
});

export const getDgfyMeUseCase = buildGetDgfyMeUseCase({ repository: dgfyAccountRepository });

export const updateDgfyProfileUseCase = buildUpdateDgfyProfileUseCase({ repository: dgfyAccountRepository });

export const changeDgfyPasswordUseCase = buildChangeDgfyPasswordUseCase({
    repository: dgfyAccountRepository,
    comparePassword: bcrypt.compare,
    hashPassword: (password) => bcrypt.hash(password, 10)
});

export const requestDgfyEmailVerificationUseCase = buildRequestDgfyEmailVerificationUseCase({
    requestEmailOtp,
    emailOtpPurposes
});

export const verifyDgfyEmailUseCase = buildVerifyDgfyEmailUseCase({
    repository: dgfyAccountRepository,
    verifyEmailOtp,
    emailOtpPurposes
});

export const requestDgfyPasswordResetUseCase = buildRequestDgfyPasswordResetUseCase({
    repository: dgfyAccountRepository,
    requestEmailOtp,
    emailOtpPurposes
});

export const completeDgfyPasswordResetUseCase = buildCompleteDgfyPasswordResetUseCase({
    repository: dgfyAccountRepository,
    verifyEmailOtp,
    hashPassword: (password) => bcrypt.hash(password, 10),
    emailOtpPurposes
});

export const createDgfyHandoffUseCase = buildCreateDgfyHandoffUseCase({ repository: dgfyAccountRepository });
export const exchangeDgfyHandoffUseCase = buildExchangeDgfyHandoffUseCase({ repository: dgfyAccountRepository });
export const getDgfyLegalTermsUseCase = buildGetDgfyLegalTermsUseCase();

export { dgfyAccountRepository };
