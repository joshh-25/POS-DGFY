import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { normalizePermissionArray } from '../../../utils/userPermissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';

// #1045: shared by posOperatorAuthorityUseCases.getCurrent and
// posCashierLifecycleUseCases.resume/others so both enforce the identical
// permission requirement and reason code, rather than forking the check (the
// exact drift that made the #1054 fix unreachable for one route but not the
// other).
export const POS_ATTENDANCE_PERMISSION_REQUIRED = 'POS_ATTENDANCE_PERMISSION_REQUIRED';

export const POS_ATTENDANCE_LIFECYCLE_PERMISSIONS = Object.freeze([
    PERMISSIONS.POS.actions.VIEW_ATTENDANCE,
    PERMISSIONS.POS.actions.OPERATE_ATTENDANCE
]);

export const hasPosAttendanceLifecyclePermission = (user) => {
    if (user?.is_master_admin === true) return true;
    const held = new Set(normalizePermissionArray(user?.permissions));
    return POS_ATTENDANCE_LIFECYCLE_PERMISSIONS.every((permission) => held.has(permission));
};

// Ordering is load-bearing (#1045): callers must resolve the attendance
// feature flag for the location BEFORE calling this, so a location with the
// lifecycle disabled answers with the feature verdict (404
// POS_ATTENDANCE_FEATURE_DISABLED) rather than this permission verdict
// (403) — the terminal only knows how to unlock on the former.
export const assertPosAttendanceLifecyclePermission = (user) => {
    if (hasPosAttendanceLifecyclePermission(user)) return;
    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'Cashier attendance permissions are missing. Sign out and sign in again after the permission update.',
        {
            statusCode: 403,
            details: {
                reason_code: POS_ATTENDANCE_PERMISSION_REQUIRED,
                required_permissions: [...POS_ATTENDANCE_LIFECYCLE_PERMISSIONS]
            }
        }
    );
};
