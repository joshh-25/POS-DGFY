import bcrypt from 'bcryptjs';
import { dgfyAccountRepository } from './repositories/dgfyAccountRepository.js';
import {
    buildAcceptDgfyInvitationUseCase,
    buildGetDgfyMeUseCase,
    buildLoginDgfyAccountUseCase,
    buildRegisterDgfyAccountUseCase
} from './usecases/dgfyAuthUseCases.js';

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

export const acceptDgfyInvitationUseCase = buildAcceptDgfyInvitationUseCase({
    repository: dgfyAccountRepository
});

export { dgfyAccountRepository };
