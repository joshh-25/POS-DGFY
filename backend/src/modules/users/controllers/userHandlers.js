import {
  getCurrentUserUseCase,
  updateProfileUseCase,
  changePasswordUseCase,
  getAllUsersUseCase,
  getRoleCatalogUseCase,
  updateUserRoleUseCase,
  updateUserStatusUseCase,
  updateUserPermissionsUseCase,
  getUserLocationGrantsUseCase,
  updateUserLocationGrantsUseCase,
  inviteUserUseCase,
  resendUserInvitationUseCase,
  createInvitationManualLinkUseCase,
  cancelUserInvitationUseCase,
  removeUserFromCompanyUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import { invalidateUserAuthCache } from '../../../middleware/auth.js';
import { requestEmailOtp, EMAIL_OTP_PURPOSES } from '../../../services/emailOtpService.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

export const getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const result = await getCurrentUserUseCase({ userId });

    if (result.success && result.data && typeof result.data.toJSON === 'function') {
      result.data = result.data.toJSON();
    }

    if (result.success && req.tenant) {
      result.data.company = {
        id: req.tenant.id,
        name: req.tenant.name,
        plan: req.tenant.plan,
        subscription_status: req.tenant.subscription_status,
        current_period_end: req.tenant.current_period_end
      };
    }

    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'user_profile_viewed',
      surface: 'users',
      action: 'view_current_user',
      result,
      successMetadataResolver: (data) => ({
        role: data?.role ?? null,
        tenant_plan: req.tenant?.plan ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User profile retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const updateData = req.validatedData;
    const result = await updateProfileUseCase({ userId, updateData });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'user_profile_updated',
      surface: 'users',
      action: 'update_profile',
      result
    });

    if (result.success) {
      invalidateUserAuthCache({
        tenantId: req.tenant?.id || null,
        companyToken: req.headers['x-company-token'] || null,
        userId
      });
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Profile updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const requestEmailChangeOtp = async (req, res, next) => {
  try {
    const { email } = req.validatedData;
    const otp = await requestEmailOtp({
      purpose: EMAIL_OTP_PURPOSES.EMAIL_CHANGE,
      email,
      tenantId: req.tenant?.id || null,
      metadata: {
        user_id: req.user?.user_id || null,
        request_id: requestId(req, res),
        ip_address: req.ip || null
      }
    });

    return res.status(202).json({
      success: true,
      data: otp,
      message: 'Email verification code sent',
      timestamp: timestamp()
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      data: null,
      message: error.message || 'Email verification failed',
      error_code: error.code || 'EMAIL_OTP_ERROR',
      timestamp: timestamp()
    });
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const { currentPassword, newPassword } = req.validatedData;

    const result = await changePasswordUseCase({ userId, currentPassword, newPassword });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'user_password_changed',
      surface: 'users',
      action: 'change_password',
      result
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: null,
        message: 'Password changed successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const includeInvitations = req.query?.include_invitations === 'true';
    const result = await getAllUsersUseCase({ includeInvitations });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Users retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getRoleCatalog = async (req, res, next) => {
  try {
    const result = await getRoleCatalogUseCase();

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Role catalog retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const result = await updateUserRoleUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id,
      roleData: req.validatedData
    });

    invalidateUserAuthCache({
      tenantId: req.tenant?.id || null,
      companyToken: req.headers['x-company-token'] || null,
      userId: Number.parseInt(req.params.user_id, 10) || null
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User role updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const { is_active: isActive } = req.validatedData;

    const result = await updateUserStatusUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id,
      isActive
    });

    invalidateUserAuthCache({
      tenantId: req.tenant?.id || null,
      companyToken: req.headers['x-company-token'] || null,
      userId: Number.parseInt(req.params.user_id, 10) || null
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserPermissions = async (req, res, next) => {
  try {
    const { permissions, is_master_admin: isMasterAdmin } = req.validatedData;

    const result = await updateUserPermissionsUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id,
      permissions,
      isMasterAdmin
    });

    invalidateUserAuthCache({
      tenantId: req.tenant?.id || null,
      companyToken: req.headers['x-company-token'] || null,
      userId: Number.parseInt(req.params.user_id, 10) || null
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User permissions updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getUserLocationGrants = async (req, res, next) => {
  try {
    const includeInactive = req.query?.include_inactive === 'true';
    const result = await getUserLocationGrantsUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id,
      includeInactive
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User location grants retrieved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserLocationGrants = async (req, res, next) => {
  try {
    const result = await updateUserLocationGrantsUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id,
      locationIds: req.validatedData.location_ids
    });

    invalidateUserAuthCache({
      tenantId: req.tenant?.id || null,
      companyToken: req.headers['x-company-token'] || null,
      userId: Number.parseInt(req.params.user_id, 10) || null
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User location grants updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (req, res, next) => {
  try {
    const {
      email,
      role,
      role_preset_key: rolePresetKey = null,
      location_ids: locationIds = [],
      delivery_mode: deliveryMode = 'email'
    } = req.validatedData;
    const result = await inviteUserUseCase({
      adminUserId: req.user.user_id,
      email,
      role,
      rolePresetKey,
      locationIds,
      deliveryMode
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'user_invitation_created',
      surface: 'users',
      action: 'invite_user',
      result,
      successMetadataResolver: (data) => ({
        invited_user_id: data?.user_id ?? null,
        role: data?.role ?? role ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User invitation created successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const resendUserInvitation = async (req, res, next) => {
  try {
    const result = await resendUserInvitationUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Invitation resent successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const createInvitationManualLink = async (req, res, next) => {
  try {
    const result = await createInvitationManualLinkUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Invitation link created successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const cancelUserInvitation = async (req, res, next) => {
  try {
    const result = await cancelUserInvitationUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Invitation cancelled successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const removeUserFromCompany = async (req, res, next) => {
  try {
    const result = await removeUserFromCompanyUseCase({
      adminUserId: req.user.user_id,
      targetUserId: req.params.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'User has been removed from the company',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCurrentUser,
  requestEmailChangeOtp,
  updateProfile,
  changePassword,
  getAllUsers,
  getRoleCatalog,
  updateUserRole,
  updateUserStatus,
  updateUserPermissions,
  getUserLocationGrants,
  updateUserLocationGrants,
  inviteUser,
  resendUserInvitation,
  createInvitationManualLink,
  cancelUserInvitation,
  removeUserFromCompany
};
