import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { fail } from '../../shared/contracts/applicationResult.js';

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const normalizeTerminal = (value) => String(value || '').trim().toUpperCase();

const scopeMismatch = (message, details = {}) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403, details: { reason_code: 'POS_OPERATOR_SCOPE_MISMATCH', ...details } }
);

// Native batches have no server-issued operator cookie. Never manufacture one
// from a queued user/session id. Reject individual entries when live operator
// authority is required; the sync adapter retains its normal per-entry outcome.
export const createMobilePosOperatingScopeWrapper = ({ repository, authorizeMutation }) => (command, requiredPermissions = [], requiredPermissionAlternatives = []) => async (input) => {
    try {
        const payload = input.payload || {};
        const userId = input.user?.user_id;
        const inputShiftId = parsePositiveInt(input.shiftId);
        const payloadShiftId = parsePositiveInt(payload.shift_id);
        const targetShiftId = inputShiftId || payloadShiftId;
        const record = inputShiftId
            ? await repository.getTerminalShiftById(inputShiftId)
            : input.posTransactionId
                ? await repository.getTransactionById(input.posTransactionId, {
                    attributes: ['pos_transaction_id', 'terminal_id', 'location_id', 'shift_id'],
                    include: false
                })
                : null;

        const shift = targetShiftId && !inputShiftId && typeof repository.getTerminalShiftById === 'function'
            ? await repository.getTerminalShiftById(targetShiftId)
            : record;
        const explicitLocationId = parsePositiveInt(payload.location_id)
            || parsePositiveInt(payload.terminal_location_id);
        const recordLocationId = parsePositiveInt(record?.location_id);
        const shiftLocationId = parsePositiveInt(shift?.location_id);
        if (recordLocationId && explicitLocationId && recordLocationId !== explicitLocationId) {
            throw scopeMismatch('The mobile POS target is outside the requested location.', {
                target_location_id: recordLocationId,
                requested_location_id: explicitLocationId
            });
        }
        if (recordLocationId && shiftLocationId && recordLocationId !== shiftLocationId) {
            throw scopeMismatch('The mobile POS shift does not match the target location.', {
                target_location_id: recordLocationId,
                shift_location_id: shiftLocationId
            });
        }

        let currentShift = null;
        const knownTerminalId = normalizeTerminal(payload.terminal_id)
            || normalizeTerminal(shift?.terminal_id)
            || normalizeTerminal(record?.terminal_id);
        const knownLocationId = explicitLocationId || shiftLocationId || recordLocationId;
        if ((!knownTerminalId || !knownLocationId) && typeof repository.findOpenTerminalShift === 'function') {
            currentShift = await repository.findOpenTerminalShift({ cashierId: userId });
        }
        const scope = {
            // For a replayed transaction, prefer the persisted target location
            // so a caller's current branch cannot authorize another branch.
            terminalId: knownTerminalId || normalizeTerminal(currentShift?.terminal_id),
            locationId: knownLocationId || parsePositiveInt(currentShift?.location_id),
            shiftId: targetShiftId || currentShift?.pos_terminal_shift_id
        };
        const authorized = await authorizeMutation({
            userId, scope, requiredPermissions, requiredPermissionAlternatives,
            operationKey: payload.idempotency_key || 'mobile-sync', operationType: 'mobile_sync'
        });
        if (!authorized.success) return authorized;
        return await command(input);
    } catch (error) {
        return fail(error instanceof DomainError ? error : new DomainError(
            DomainErrorCode.INTERNAL_ERROR, 'Unable to verify mobile POS operating scope.', { statusCode: 500 }
        ));
    }
};
