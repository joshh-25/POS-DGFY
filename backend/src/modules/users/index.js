import * as userService from '../../services/userService.js';
import {
  buildGetCurrentUserUseCase,
  buildUpdateProfileUseCase,
  buildChangePasswordUseCase,
  buildGetAllUsersUseCase,
  buildUpdateUserRoleUseCase,
  buildUpdateUserStatusUseCase,
  buildUpdateUserPermissionsUseCase,
  buildInviteUserUseCase,
  buildRemoveUserFromCompanyUseCase
} from './usecases/userUseCases.js';

export const getCurrentUserUseCase = buildGetCurrentUserUseCase({ userService });
export const updateProfileUseCase = buildUpdateProfileUseCase({ userService });
export const changePasswordUseCase = buildChangePasswordUseCase({ userService });
export const getAllUsersUseCase = buildGetAllUsersUseCase({ userService });
export const updateUserRoleUseCase = buildUpdateUserRoleUseCase({ userService });
export const updateUserStatusUseCase = buildUpdateUserStatusUseCase({ userService });
export const updateUserPermissionsUseCase = buildUpdateUserPermissionsUseCase({ userService });
export const inviteUserUseCase = buildInviteUserUseCase({ userService });
export const removeUserFromCompanyUseCase = buildRemoveUserFromCompanyUseCase({ userService });
