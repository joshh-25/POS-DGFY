import * as userService from '../../services/userService.js';
import {
  buildGetCurrentUserUseCase,
  buildUpdateProfileUseCase,
  buildChangePasswordUseCase,
  buildGetAllUsersUseCase,
  buildGetRoleCatalogUseCase,
  buildUpdateUserRoleUseCase,
  buildUpdateUserStatusUseCase,
  buildUpdateUserPermissionsUseCase,
  buildGetUserLocationGrantsUseCase,
  buildUpdateUserLocationGrantsUseCase,
  buildInviteUserUseCase,
  buildResendUserInvitationUseCase,
  buildCreateInvitationManualLinkUseCase,
  buildCancelUserInvitationUseCase,
  buildRemoveUserFromCompanyUseCase
} from './usecases/userUseCases.js';

export const getCurrentUserUseCase = buildGetCurrentUserUseCase({ userService });
export const updateProfileUseCase = buildUpdateProfileUseCase({ userService });
export const changePasswordUseCase = buildChangePasswordUseCase({ userService });
export const getAllUsersUseCase = buildGetAllUsersUseCase({ userService });
export const getRoleCatalogUseCase = buildGetRoleCatalogUseCase({ userService });
export const updateUserRoleUseCase = buildUpdateUserRoleUseCase({ userService });
export const updateUserStatusUseCase = buildUpdateUserStatusUseCase({ userService });
export const updateUserPermissionsUseCase = buildUpdateUserPermissionsUseCase({ userService });
export const getUserLocationGrantsUseCase = buildGetUserLocationGrantsUseCase({ userService });
export const updateUserLocationGrantsUseCase = buildUpdateUserLocationGrantsUseCase({ userService });
export const inviteUserUseCase = buildInviteUserUseCase({ userService });
export const resendUserInvitationUseCase = buildResendUserInvitationUseCase({ userService });
export const createInvitationManualLinkUseCase = buildCreateInvitationManualLinkUseCase({ userService });
export const cancelUserInvitationUseCase = buildCancelUserInvitationUseCase({ userService });
export const removeUserFromCompanyUseCase = buildRemoveUserFromCompanyUseCase({ userService });
