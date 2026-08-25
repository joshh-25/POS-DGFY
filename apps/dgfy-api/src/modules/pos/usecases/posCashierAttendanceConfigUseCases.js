import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError } from '../../shared/contracts/domainErrors.js';
import {
    normalizePosCashierAttendanceLocationIds,
    parsePosCashierAttendanceFeatureValue
} from '../serializers/posCashierAttendanceConfigSerializer.js';

export const POS_ATTENDANCE_CONFIG_ERROR_CODES = Object.freeze({
    INVALID_LOCATION: 'POS_ATTENDANCE_CONFIG_INVALID_LOCATION',
    ACTIVE_WORKFLOW: 'POS_ATTENDANCE_CONFIG_ACTIVE_WORKFLOW',
    STALE_REVISION: 'POS_ATTENDANCE_CONFIG_STALE_REVISION',
    INTERNAL: 'POS_ATTENDANCE_CONFIG_INTERNAL_ERROR'
});

const configError = (code, message, statusCode, details = {}, cause) => new DomainError(code, message, {
    statusCode,
    details: { reason_code: code, ...details },
    ...(cause ? { cause } : {})
});

const asRevision = (setting) => {
    if (!setting) return null;
    const updatedValue = setting.updated_at || setting.updatedAt || setting.get?.('updated_at') || '';
    const settingValue = setting.setting_value ?? setting.get?.('setting_value') ?? '';
    return crypto.createHash('sha256').update(`${String(updatedValue)}|${String(settingValue)}`).digest('hex');
};

const asConfig = (setting) => {
    const parsed = parsePosCashierAttendanceFeatureValue(setting);
    return {
        enabled: parsed?.enabled === true,
        location_ids: Array.from(new Set(normalizePosCashierAttendanceLocationIds(parsed?.location_ids))).sort((a, b) => a - b)
    };
};

const effectiveIds = (config) => config.enabled === true ? config.location_ids : [];
const affectedIds = (previous, next) => {
    const previousIds = new Set(effectiveIds(previous));
    const nextIds = new Set(effectiveIds(next));
    return Array.from(new Set([
        ...Array.from(previousIds).filter((id) => !nextIds.has(id)),
        ...Array.from(nextIds).filter((id) => !previousIds.has(id))
    ])).sort((a, b) => a - b);
};

const mapFailure = (error, message) => {
    if (error instanceof DomainError) return error;
    return configError(POS_ATTENDANCE_CONFIG_ERROR_CODES.INTERNAL, message, 500, {}, error);
};

export const createPosCashierAttendanceConfigUseCases = ({ repository } = {}) => {
    const getConfig = async () => {
        try {
            const [setting, locations] = await Promise.all([
                repository.getSetting(),
                repository.listActiveLocations()
            ]);
            return ok({
                config: asConfig(setting),
                revision: asRevision(setting),
                active_locations: locations.map((location) => ({
                    location_id: Number(location.location_id),
                    name: String(location.name || '').trim(),
                    is_active: location.is_active === true
                }))
            });
        } catch (error) {
            return fail(mapFailure(error, 'Failed to load cashier attendance configuration.'));
        }
    };

    const updateConfig = async ({ payload = {}, user = {}, request = {} } = {}) => {
        try {
            return await repository.transaction(async (transaction) => {
                const beforeInsert = await repository.getSetting({ transaction, lock: true });
                const previous = asConfig(beforeInsert);
                const previousRevision = asRevision(beforeInsert);
                const expectedRevision = payload.revision == null ? null : String(payload.revision);
                if (expectedRevision !== previousRevision) {
                    throw configError(
                        POS_ATTENDANCE_CONFIG_ERROR_CODES.STALE_REVISION,
                        'Cashier attendance configuration changed. Refresh and try again.',
                        409,
                        { expected_revision: expectedRevision, current_revision: previousRevision }
                    );
                }

                const ensured = beforeInsert ? null : await repository.ensureSetting({ transaction });
                const setting = beforeInsert || ensured?.setting || ensured;
                if (!beforeInsert && ensured?.created === false) {
                    const concurrentRevision = asRevision(setting);
                    throw configError(
                        POS_ATTENDANCE_CONFIG_ERROR_CODES.STALE_REVISION,
                        'Cashier attendance configuration changed. Refresh and try again.',
                        409,
                        { expected_revision: expectedRevision, current_revision: concurrentRevision }
                    );
                }
                const locationIds = payload.location_ids.map(Number).sort((a, b) => a - b);
                const next = { enabled: payload.enabled === true, location_ids: locationIds };
                const locations = await repository.listLocationsByIds({ locationIds, transaction });
                const activeIds = new Set(
                    locations.filter((location) => location.is_active === true).map((location) => Number(location.location_id))
                );
                const invalidLocationIds = locationIds.filter((id) => !activeIds.has(id));
                if (invalidLocationIds.length) {
                    throw configError(
                        POS_ATTENDANCE_CONFIG_ERROR_CODES.INVALID_LOCATION,
                        'One or more selected locations are invalid or inactive.',
                        422,
                        { invalid_location_ids: invalidLocationIds }
                    );
                }

                const changedLocationIds = affectedIds(previous, next);
                const blockers = await repository.findActiveWorkflowBlockers({
                    locationIds: changedLocationIds,
                    transaction
                });
                if (blockers.length) {
                    throw configError(
                        POS_ATTENDANCE_CONFIG_ERROR_CODES.ACTIVE_WORKFLOW,
                        'Finish active register, attendance, break, and operator work before changing this setting.',
                        409,
                        { affected_location_ids: changedLocationIds, blockers }
                    );
                }

                await repository.saveSetting({ setting, config: next, transaction });
                const resultingRevision = asRevision(setting);
                const actorUserId = Number.parseInt(user?.user_id, 10) || null;
                await repository.createAudit({
                    transaction,
                    payload: {
                        user_id: actorUserId,
                        entity_type: 'pos_attendance_config',
                        entity_id: setting.setting_id || setting.get?.('setting_id') || null,
                        action: beforeInsert ? 'UPDATE' : 'CREATE',
                        event_type: 'pos_cashier_attendance_config_changed',
                        actor_username: String(user?.username || user?.email || '').trim().slice(0, 120) || null,
                        request_id: String(request.requestId || '').trim().slice(0, 100) || null,
                        ip_address: request.ipAddress || null,
                        user_agent: request.userAgent || null,
                        changes: {
                            previous,
                            resulting: next,
                            affected_location_ids: changedLocationIds,
                            request_id: String(request.requestId || '').trim().slice(0, 100) || null
                        }
                    }
                });
                return ok({
                    config: next,
                    revision: resultingRevision,
                    affected_location_ids: changedLocationIds
                });
            });
        } catch (error) {
            return fail(mapFailure(error, 'Failed to update cashier attendance configuration.'));
        }
    };

    return { getConfig, updateConfig };
};

export { asConfig, affectedIds };
