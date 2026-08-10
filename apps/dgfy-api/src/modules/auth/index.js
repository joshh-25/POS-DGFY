import * as authService from '../../services/authService.js';
import * as landlordService from '../../services/landlordService.js';
import * as userService from '../../services/userService.js';
import {
  buildRegisterUseCase,
  buildLoginUseCase,
  buildRefreshTokenUseCase,
  buildBlacklistTokenUseCase,
  buildLookupEmailUseCase,
  buildValidateCompanyTokenUseCase,
  buildValidateInviteTokenUseCase,
  buildAcceptInvitationUseCase
} from './usecases/authUseCases.js';

export * from './contracts/userRepository.contract.js';

export const registerUseCase = buildRegisterUseCase({ authService });
export const loginUseCase = buildLoginUseCase({ authService });
export const refreshTokenUseCase = buildRefreshTokenUseCase({ authService });
export const blacklistTokenUseCase = buildBlacklistTokenUseCase({ authService });
export const lookupEmailUseCase = buildLookupEmailUseCase({ landlordService });
export const validateCompanyTokenUseCase = buildValidateCompanyTokenUseCase({ landlordService });
export const validateInviteTokenUseCase = buildValidateInviteTokenUseCase({ userService });
export const acceptInvitationUseCase = buildAcceptInvitationUseCase({ userService });
