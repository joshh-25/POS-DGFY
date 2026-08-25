import dbStore from '../../../utils/dbStore.js';
import { DomainError } from '../../shared/contracts/domainErrors.js';
import {
    normalizePosCashierAttendanceLocationIds,
    parsePosCashierAttendanceFeatureValue
} from '../serializers/posCashierAttendanceConfigSerializer.js';

export {
    normalizePosCashierAttendanceLocationIds,
    parsePosCashierAttendanceFeatureValue
} from '../serializers/posCashierAttendanceConfigSerializer.js';

export const POS_CASHIER_ATTENDANCE_FEATURE_KEY = 'pos_cashier_attendance_lifecycle_v1';

const FEATURE_DISABLED_CODE = 'POS_ATTENDANCE_FEATURE_DISABLED';

export const resolvePosCashierAttendanceFeature = async ({ locationId } = {}) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    const SystemSetting = dbStore.get('SystemSetting');
    const setting = await SystemSetting.findOne({ where: { setting_key: POS_CASHIER_ATTENDANCE_FEATURE_KEY } });
    const value = parsePosCashierAttendanceFeatureValue(setting);
    const locationIds = normalizePosCashierAttendanceLocationIds(value?.location_ids);
    const enabled = value?.enabled === true
        && Number.isInteger(normalizedLocationId)
        && normalizedLocationId > 0
        && locationIds.includes(normalizedLocationId);

    return {
        key: POS_CASHIER_ATTENDANCE_FEATURE_KEY,
        enabled,
        location_id: Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 ? normalizedLocationId : null,
        configured_location_ids: locationIds
    };
};

export const requirePosCashierAttendanceFeature = async ({ locationId } = {}) => {
    const feature = await resolvePosCashierAttendanceFeature({ locationId });
    if (!feature.enabled) {
        throw new DomainError(
            FEATURE_DISABLED_CODE,
            'Cashier attendance is not enabled for this location.',
            {
                statusCode: 404,
                details: { reason_code: FEATURE_DISABLED_CODE, location_id: feature.location_id }
            }
        );
    }
    return feature;
};
