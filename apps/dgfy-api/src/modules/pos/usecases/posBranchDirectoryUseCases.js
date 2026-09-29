import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    evaluatePosShiftStaleness,
    resolvePosStaleShiftHours
} from '../domain/posShiftRecoveryPolicy.js';

const BRANCH_VIEW_PERMISSION = PERMISSIONS.POS.actions.VIEW_BRANCH_POS;
const VIEW_ALL_BRANCHES_PERMISSION = PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES;

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const normalizeName = (value, fallback = '') => String(value || '').trim() || fallback;

const hasBranchViewPermission = (user) => hasEffectivePermission(user, BRANCH_VIEW_PERMISSION);

const hasTenantWideBranchAccess = (user) => {
    return user?.is_master_admin === true
        || hasEffectivePermission(user, VIEW_ALL_BRANCHES_PERMISSION);
};

const unauthorized = (message, reasonCode = 'POS_BRANCH_VIEW_NOT_AUTHORIZED') => fail(new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403, details: { reason_code: reasonCode } }
));

const resolveBranchScope = async ({ user, repository }) => {
    const userId = parsePositiveInt(user?.user_id);
    if (!userId) {
        return {
            success: false,
            result: fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view branch locations.',
                { statusCode: 401 }
            ))
        };
    }

    const allLocations = await repository.listActiveLocations();
    const tenantWide = hasTenantWideBranchAccess(user);
    if (tenantWide) {
        return {
            success: true,
            userId,
            tenantWide,
            locations: allLocations,
            locationIds: allLocations.map((location) => Number(location.location_id))
        };
    }

    const grants = await repository.listUserLocationGrants({ userId });
    const grantedIds = new Set(grants
        .map((grant) => parsePositiveInt(grant?.location_id))
        .filter(Boolean));
    const locations = allLocations.filter((location) => grantedIds.has(Number(location.location_id)));
    if (locations.length === 0) {
        return {
            success: false,
            result: unauthorized(
                'No active branch is assigned to this user.',
                'POS_BRANCH_LOCATION_GRANT_REQUIRED'
            )
        };
    }

    return {
        success: true,
        userId,
        tenantWide,
        locations,
        locationIds: locations.map((location) => Number(location.location_id))
    };
};

const safeActor = (value, fallbackId = null) => {
    const id = parsePositiveInt(value?.user_id) || fallbackId;
    if (!id) return null;
    return {
        user_id: id,
        display_name: normalizeName(value?.username, `User #${id}`)
    };
};

const safeShift = (shift, operator) => {
    if (!shift) return null;
    return {
        pos_terminal_shift_id: parsePositiveInt(shift.pos_terminal_shift_id),
        terminal_id: normalizeName(shift.terminal_id),
        status: normalizeName(shift.status, 'open'),
        opened_at: shift.opened_at || null,
        cashier: safeActor(shift.cashier, parsePositiveInt(shift.cashier_id)),
        current_operator: operator
            ? safeActor(operator.operator, parsePositiveInt(operator.user_id))
            : null
    };
};

const buildReasonCode = ({ canTransact, activeElsewhere, terminals, canOpen, isOpen = true }) => {
    if (!canTransact) return 'POS_TRANSACT_PERMISSION_REQUIRED';
    if (activeElsewhere) return 'POS_OPERATOR_ACTIVE_ELSEWHERE';
    if (!isOpen) return 'POS_LOCATION_CLOSED';
    if (terminals.length === 0) return 'POS_TERMINAL_UNAVAILABLE';
    if (!canOpen) return 'POS_TERMINAL_SHIFT_OCCUPIED';
    return null;
};

export const buildGetPosBranchDirectoryUseCase = ({
    branchDirectoryRepository,
    posRepository,
    now = () => new Date(),
    staleAfterHours = resolvePosStaleShiftHours()
}) => async ({ user } = {}) => {
    if (!hasBranchViewPermission(user)) {
        return unauthorized(
            'Branch view permission is required to inspect other POS locations.',
            'POS_BRANCH_VIEW_PERMISSION_REQUIRED'
        );
    }

    try {
        const scope = await resolveBranchScope({ user, repository: branchDirectoryRepository });
        if (!scope.success) return scope.result;

        const [shifts, operators, userShift, userOperators, terminalPolicy, operatorSessionAvailability] = await Promise.all([
            branchDirectoryRepository.listOpenTerminalShiftsForLocations({ locationIds: scope.locationIds }),
            branchDirectoryRepository.listActiveOperatorSessionsForLocations({ locationIds: scope.locationIds }),
            typeof posRepository?.findOpenTerminalShift === 'function'
                ? posRepository.findOpenTerminalShift({ cashierId: scope.userId })
                : null,
            typeof branchDirectoryRepository.listActiveOperatorSessionsForUser === 'function'
                ? branchDirectoryRepository.listActiveOperatorSessionsForUser({ userId: scope.userId })
                : [],
            typeof posRepository?.getTerminalPairingPolicySettings === 'function'
                ? posRepository.getTerminalPairingPolicySettings()
                : { active_registry: [] },
            typeof branchDirectoryRepository.getOperatorSessionAvailability === 'function'
                ? branchDirectoryRepository.getOperatorSessionAvailability()
                : { available: true, reason_code: null }
        ]);

        const activeRegistry = Array.isArray(terminalPolicy?.active_registry)
            ? terminalPolicy.active_registry
            : [];
        const shiftsByTerminal = new Map();
        shifts.forEach((shift) => {
            const terminalId = normalizeName(shift?.terminal_id).toUpperCase();
            if (terminalId && !shiftsByTerminal.has(terminalId)) shiftsByTerminal.set(terminalId, shift);
        });
        const operatorsByTerminal = new Map();
        operators.forEach((operator) => {
            const terminalId = normalizeName(operator?.terminal_id).toUpperCase();
            if (terminalId && !operatorsByTerminal.has(terminalId)) operatorsByTerminal.set(terminalId, operator);
        });

        const canTransact = hasEffectivePermission(user, PERMISSIONS.POS.actions.TRANSACT_POS);
        const activeShift = userShift ? {
            terminal_id: normalizeName(userShift.terminal_id).toUpperCase(),
            location_id: Number(userShift.location_id)
        } : null;
        const activeOperator = (Array.isArray(userOperators) ? userOperators : [])[0] || null;
        const activeElsewhereFor = (locationId, terminalId) => Boolean(
            (activeShift && (
                Number(activeShift.location_id) !== Number(locationId)
                || activeShift.terminal_id !== normalizeName(terminalId).toUpperCase()
            ))
            || (activeOperator && (
                Number(activeOperator.location_id) !== Number(locationId)
                || normalizeName(activeOperator.terminal_id).toUpperCase() !== normalizeName(terminalId).toUpperCase()
            ))
        );

        const locations = scope.locations.map((location) => {
            const locationId = Number(location.location_id);
            const isOpen = location.is_open !== false;
            const terminals = activeRegistry
                .filter((entry) => Number(entry?.location_id) === locationId)
                .map((entry) => {
                    const terminalId = normalizeName(entry?.terminal_id).toUpperCase();
                    const shift = shiftsByTerminal.get(terminalId) || null;
                    const operator = operatorsByTerminal.get(terminalId) || null;
                    const occupied = Boolean(shift);
                    const staleRecovery = shift
                        ? evaluatePosShiftStaleness({ shift, now: now(), staleAfterHours })
                        : null;
                    const stale = staleRecovery?.is_stale === true;
                    const activeElsewhere = activeElsewhereFor(locationId, terminalId);
                    const canResume = Boolean(
                        shift
                        && !activeElsewhere
                        && Number(shift.cashier_id) === scope.userId
                    );
                    const canOpen = Boolean(isOpen && !occupied && canTransact && !activeElsewhere);
                    return {
                        terminal_id: terminalId,
                        label: normalizeName(entry?.label, terminalId),
                        device_enforcement: normalizeName(entry?.device_enforcement, 'off'),
                        status: stale ? 'stale' : (occupied ? 'occupied' : 'available'),
                        can_open: canOpen,
                        can_resume: canResume,
                        reason_code: occupied
                            ? (canResume ? null : (stale ? 'POS_TERMINAL_STALE_SHIFT' : 'POS_TERMINAL_SHIFT_OCCUPIED'))
                            : buildReasonCode({ canTransact, activeElsewhere, terminals: [entry], canOpen, isOpen }),
                        shift: safeShift(shift, operator),
                        stale_recovery: staleRecovery,
                        current_operator: operator
                            ? safeActor(operator.operator, parsePositiveInt(operator.user_id))
                            : null,
                        current_operator_status: operatorSessionAvailability?.available === false
                            ? 'unavailable'
                            : (operator ? 'active' : 'none')
                    };
                });
            const canOpen = isOpen && terminals.some((terminal) => terminal.can_open);
            return {
                location_id: locationId,
                name: normalizeName(location.name, `Location #${locationId}`),
                location_name: normalizeName(location.name, `Location #${locationId}`),
                is_active: location.is_active !== false,
                is_open: isOpen,
                is_primary_storefront: location.is_primary_storefront === true,
                can_view: true,
                view_mode: 'read_only',
                access_state: 'granted',
                access_reason: null,
                can_open: canOpen,
                can_switch: hasEffectivePermission(user, PERMISSIONS.POS.actions.SWITCH_LOCATION_POS),
                reason_code: buildReasonCode({
                    canTransact,
                    activeElsewhere: Boolean(activeShift || activeOperator),
                    terminals,
                    canOpen,
                    isOpen
                }),
                open_shift_count: terminals.filter((terminal) => terminal.status === 'occupied' || terminal.status === 'stale').length,
                operator_session_status: operatorSessionAvailability?.available === false
                    ? 'unavailable'
                    : 'available',
                operator_session_reason_code: operatorSessionAvailability?.available === false
                    ? operatorSessionAvailability.reason_code
                    : null,
                terminals
            };
        });

        return ok({
            locations,
            scope: scope.tenantWide ? 'tenant' : 'granted',
            active_shift: safeShift(userShift, activeOperator),
            active_operator: activeOperator
                ? safeActor(activeOperator.operator, parsePositiveInt(activeOperator.user_id))
                : null,
            operator_session: {
                status: operatorSessionAvailability?.available === false ? 'unavailable' : 'available',
                reason_code: operatorSessionAvailability?.available === false
                    ? operatorSessionAvailability.reason_code
                    : null
            }
        });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to load POS branch directory'));
    }
};

export const buildRecordPosBranchViewEventUseCase = ({
    branchDirectoryRepository,
    posRepository
}) => async ({ payload, user, auditContext = {} } = {}) => {
    if (!hasBranchViewPermission(user)) {
        return unauthorized(
            'Branch view permission is required to record branch view activity.',
            'POS_BRANCH_VIEW_PERMISSION_REQUIRED'
        );
    }

    const locationId = parsePositiveInt(payload?.location_id);
    const event = normalizeName(payload?.event).toLowerCase();
    if (!locationId || !['enter', 'exit'].includes(event)) {
        return fail(new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'location_id and a valid branch view event are required.',
            { statusCode: 422 }
        ));
    }

    try {
        const scope = await resolveBranchScope({ user, repository: branchDirectoryRepository });
        if (!scope.success) return scope.result;
        if (!scope.locationIds.includes(locationId)) {
            return unauthorized(
                'This user is not assigned to the selected branch.',
                'POS_BRANCH_LOCATION_GRANT_REQUIRED'
            );
        }

        await posRepository.createAuditLog({
            user_id: scope.userId,
            entity_type: 'pos_branch_view',
            entity_id: locationId,
            action: 'VIEW',
            event_type: `pos_branch_view_${event}`,
            terminal_id: auditContext.terminalId || null,
            location_id: locationId,
            request_id: auditContext.requestId || null,
            changes: {
                event,
                location_id: locationId,
                operating_location_id: parsePositiveInt(payload?.operating_location_id)
                    || parsePositiveInt(auditContext.operatingLocationId),
                active_shift_id: parsePositiveInt(payload?.active_shift_id)
                    || parsePositiveInt(auditContext.activeShiftId),
                source: 'pos_shift_location_branch_directory'
            }
        });

        return ok({
            location_id: locationId,
            event,
            recorded: true
        });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to record POS branch view activity'));
    }
};

export { BRANCH_VIEW_PERMISSION };
