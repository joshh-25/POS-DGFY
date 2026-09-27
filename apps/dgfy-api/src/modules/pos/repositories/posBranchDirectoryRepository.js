import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const normalizeLocationIds = (locationIds) => Array.from(new Set(
    (Array.isArray(locationIds) ? locationIds : [])
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
));

const locationWhere = (locationIds) => {
    const normalizedIds = normalizeLocationIds(locationIds);
    return {
        is_active: true,
        ...(normalizedIds.length > 0 ? { location_id: { [Op.in]: normalizedIds } } : {})
    };
};

export const posBranchDirectoryRepository = {
    async listActiveLocations({ locationIds = [] } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        if (!TenantLocation) return [];

        const rows = await TenantLocation.findAll({
            where: locationWhere(locationIds),
            attributes: [
                'location_id',
                'name',
                'is_active',
                'is_open',
                'is_primary_storefront',
                'address_line'
            ],
            order: [['name', 'ASC'], ['location_id', 'ASC']]
        });
        return rows.map(toPlain);
    },

    async listUserLocationGrants({ userId } = {}) {
        const UserLocationGrant = dbStore.get('UserLocationGrant');
        if (!UserLocationGrant) return [];

        const rows = await UserLocationGrant.findAll({
            where: { user_id: userId },
            attributes: ['location_id'],
            order: [['location_id', 'ASC']]
        });
        return rows.map(toPlain);
    },

    async listOpenTerminalShiftsForLocations({ locationIds = [] } = {}) {
        const normalizedIds = normalizeLocationIds(locationIds);
        if (normalizedIds.length === 0) return [];

        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const User = dbStore.get('User');
        const TenantLocation = dbStore.get('TenantLocation');
        if (!PosTerminalShift) return [];

        const rows = await PosTerminalShift.findAll({
            where: {
                status: 'open',
                location_id: { [Op.in]: normalizedIds }
            },
            include: [
                ...(User ? [{
                    model: User,
                    as: 'cashier',
                    attributes: ['user_id', 'username'],
                    required: false
                }] : []),
                ...(TenantLocation ? [{
                    model: TenantLocation,
                    as: 'location',
                    attributes: ['location_id', 'name'],
                    required: false
                }] : [])
            ],
            order: [['opened_at', 'DESC'], ['pos_terminal_shift_id', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async listActiveOperatorSessionsForLocations({ locationIds = [] } = {}) {
        const normalizedIds = normalizeLocationIds(locationIds);
        if (normalizedIds.length === 0) return [];

        const PosTerminalOperatorSession = dbStore.get('PosTerminalOperatorSession');
        const User = dbStore.get('User');
        if (!PosTerminalOperatorSession) return [];

        const rows = await PosTerminalOperatorSession.findAll({
            where: {
                status: 'active',
                location_id: { [Op.in]: normalizedIds }
            },
            include: User ? [{
                model: User,
                as: 'operator',
                attributes: ['user_id', 'username'],
                required: false
            }] : [],
            order: [['started_at', 'DESC'], ['pos_terminal_operator_session_id', 'DESC']]
        });
        return rows.map(toPlain);
    },

    async listActiveOperatorSessionsForUser({ userId } = {}) {
        const PosTerminalOperatorSession = dbStore.get('PosTerminalOperatorSession');
        if (!PosTerminalOperatorSession) return [];

        const rows = await PosTerminalOperatorSession.findAll({
            where: {
                status: 'active',
                user_id: userId
            },
            order: [['started_at', 'DESC'], ['pos_terminal_operator_session_id', 'DESC']]
        });
        return rows.map(toPlain);
    },

    getOperatorSessionAvailability() {
        const PosTerminalOperatorSession = dbStore.get('PosTerminalOperatorSession');
        return PosTerminalOperatorSession
            ? { available: true, reason_code: null }
            : { available: false, reason_code: 'POS_OPERATOR_SESSION_DATA_UNAVAILABLE' };
    }
};

export default posBranchDirectoryRepository;
