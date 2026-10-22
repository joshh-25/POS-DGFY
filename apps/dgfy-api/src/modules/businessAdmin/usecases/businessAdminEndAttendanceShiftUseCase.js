import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    buildBusinessAdminCapabilities,
    resolveBusinessAdminAccess
} from '../domain/businessAdminAccessPolicy.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const toPlain = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

export const buildBusinessAdminEndAttendanceShiftUseCase = ({
    businessAdminOverviewRepository,
    posRepository,
    closeTerminalShiftUseCase
}) => async ({ shiftId: rawShiftId, body = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            access.reason,
            403,
            { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' }
        );
    }

    const capabilities = buildBusinessAdminCapabilities(user);
    if (!capabilities.force_close_shifts) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Your account is not authorized to end another cashier\'s shift.',
            403,
            { reason_code: 'BUSINESS_ADMIN_FORCE_CLOSE_SHIFT_PERMISSION_DENIED' }
        );
    }

    const shiftId = parsePositiveInt(rawShiftId);
    if (!shiftId) {
        return fail(
            DomainErrorCode.VALIDATION_FAILED,
            'A valid open shift is required.',
            422,
            { reason_code: 'BUSINESS_ADMIN_SHIFT_ID_INVALID' }
        );
    }

    const allowedLocationIds = access.scope === 'all'
        ? null
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && allowedLocationIds.length === 0) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'No branch access is assigned to this user.',
            403,
            { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' }
        );
    }

    const shift = toPlain(await posRepository.getTerminalShiftById(shiftId));
    if (!shift) {
        return fail(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            `Open shift not found: ${shiftId}`,
            404,
            { reason_code: 'BUSINESS_ADMIN_SHIFT_NOT_FOUND' }
        );
    }

    if (String(shift.status || '').trim().toLowerCase() !== 'open') {
        return fail(
            DomainErrorCode.CONFLICT,
            'This shift is already closed.',
            409,
            { reason_code: 'BUSINESS_ADMIN_SHIFT_ALREADY_CLOSED', shift_id: shiftId }
        );
    }

    const locationId = parsePositiveInt(shift.location_id);
    if (!locationId) {
        return fail(
            DomainErrorCode.CONFLICT,
            'This shift is missing its branch location and cannot be ended from Attendance.',
            409,
            { reason_code: 'BUSINESS_ADMIN_SHIFT_LOCATION_MISSING', shift_id: shiftId }
        );
    }
    if (Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(locationId)) {
        return fail(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'This user is not assigned to the branch that owns this shift.',
            403,
            { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED', shift_id: shiftId, location_id: locationId }
        );
    }

    const reason = String(body.reason || '').trim();
    const idempotencyKey = String(body.idempotency_key || '').trim() || null;
    const result = await closeTerminalShiftUseCase({
        shiftId,
        payload: {
            idempotency_key: idempotencyKey,
            closing_cash_amount: body.closing_cash_amount,
            closing_note: reason,
            override_reason: reason
        },
        // This is an internal capability assertion created only after the
        // Business Admin permission and branch-scope checks above pass. It is
        // deliberately not a cashier PIN and is never accepted from the HTTP body.
        user: { ...user, business_admin_force_close: true },
        locationScope: { allowedLocationIds },
        recordXReading: true
    });

    return result;
};
